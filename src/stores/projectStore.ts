import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

interface ProjectData {
  id: string
  name: string
  description?: string
  type: string
  status: string
  location: any
  regulations: any[]
  network?: any
  calculations: any[]
  documents: any[]
  team: any[]
  timeline: any
  createdAt: Date
  updatedAt: Date
}

interface ProjectState {
  // Current project
  currentProject: ProjectData | null
  projects: ProjectData[]

  // Loading states
  isLoading: boolean
  isLoadingProjects: boolean
  error: string | null

  // Project operations
  loadProjects: () => Promise<void>
  selectProject: (projectId: string) => Promise<boolean>
  createProject: (projectData: Partial<ProjectData>) => Promise<string | null>
  updateProject: (projectId: string, updates: Partial<ProjectData>) => Promise<boolean>
  deleteProject: (projectId: string) => Promise<boolean>
  clearProject: () => void

  // Cross-section synchronization
  syncAllSections: (projectId: string) => Promise<void>

  // Project content management
  saveNetworkToCurrentProject: (name: string, description?: string) => Promise<boolean>
  loadNetworkFromCurrentProject: () => Promise<boolean>
}

const initialState = {
  currentProject: null,
  projects: [],
  isLoading: false,
  isLoadingProjects: false,
  error: null,
}

export const useProjectStore = create<ProjectState>()(
  devtools(
    (set, get) => ({
      ...initialState,

      loadProjects: async () => {
        set({ isLoadingProjects: true, error: null })

        try {
          console.log('📂 [Project Store] Loading projects...')

          const result = await window.electronAPI.hydraulic.listProjects()

          if (result.success && result.data) {
            set({ projects: result.data })
            console.log('✅ [Project Store] Projects loaded:', result.data.length)
          } else {
            set({ error: result.error || 'Failed to load projects' })
            console.error('❌ [Project Store] Failed to load projects:', result.error)
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          set({ error: errorMessage })
          console.error('❌ [Project Store] Error loading projects:', error)
        } finally {
          set({ isLoadingProjects: false })
        }
      },

      selectProject: async (projectId: string) => {
        set({ isLoading: true, error: null })

        try {
          console.log('🎯 [Project Store] Selecting project:', projectId)

          const result = await window.electronAPI.hydraulic.getProject(projectId)

          if (result.success && result.data) {
            set({ currentProject: result.data })

            // Trigger cross-section synchronization
            await get().syncAllSections(projectId)

            console.log('✅ [Project Store] Project selected:', result.data.name)
            return true
          } else {
            set({ error: result.error || 'Failed to load project' })
            console.error('❌ [Project Store] Failed to select project:', result.error)
            return false
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          set({ error: errorMessage })
          console.error('❌ [Project Store] Error selecting project:', error)
          return false
        } finally {
          set({ isLoading: false })
        }
      },

      createProject: async (projectData: Partial<ProjectData>) => {
        set({ isLoading: true, error: null })

        try {
          console.log('🆕 [Project Store] Creating project:', projectData.name)

          const result = await window.electronAPI.hydraulic.createProject(projectData)

          if (result.success && result.data) {
            // Reload projects to include the new one
            await get().loadProjects()

            console.log('✅ [Project Store] Project created:', result.data.id)
            return result.data.id
          } else {
            set({ error: result.error || 'Failed to create project' })
            console.error('❌ [Project Store] Failed to create project:', result.error)
            return null
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          set({ error: errorMessage })
          console.error('❌ [Project Store] Error creating project:', error)
          return null
        } finally {
          set({ isLoading: false })
        }
      },

      updateProject: async (projectId: string, updates: Partial<ProjectData>) => {
        set({ isLoading: true, error: null })

        try {
          console.log('✏️ [Project Store] Updating project:', projectId)

          const result = await window.electronAPI.hydraulic.updateProject(projectId, updates)

          if (result.success) {
            // Update current project if it's the one being updated
            const { currentProject } = get()
            if (currentProject && currentProject.id === projectId) {
              set({ currentProject: { ...currentProject, ...updates } })
            }

            // Reload projects to get updated data
            await get().loadProjects()

            console.log('✅ [Project Store] Project updated')
            return true
          } else {
            set({ error: result.error || 'Failed to update project' })
            console.error('❌ [Project Store] Failed to update project:', result.error)
            return false
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          set({ error: errorMessage })
          console.error('❌ [Project Store] Error updating project:', error)
          return false
        } finally {
          set({ isLoading: false })
        }
      },

      deleteProject: async (projectId: string) => {
        set({ isLoading: true, error: null })

        try {
          console.log('🗑️ [Project Store] Deleting project:', projectId)

          const result = await window.electronAPI.hydraulic.deleteProject(projectId)

          if (result.success) {
            // Clear current project if it's the one being deleted
            const { currentProject } = get()
            if (currentProject && currentProject.id === projectId) {
              set({ currentProject: null })
            }

            // Remove from projects list
            set(state => ({
              projects: state.projects.filter(p => p.id !== projectId)
            }))

            console.log('✅ [Project Store] Project deleted')
            return true
          } else {
            set({ error: result.error || 'Failed to delete project' })
            console.error('❌ [Project Store] Failed to delete project:', result.error)
            return false
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          set({ error: errorMessage })
          console.error('❌ [Project Store] Error deleting project:', error)
          return false
        } finally {
          set({ isLoading: false })
        }
      },

      clearProject: () => {
        set({ currentProject: null, error: null })
        console.log('🧹 [Project Store] Project cleared')
      },

      syncAllSections: async (projectId: string) => {
        try {
          console.log('🔄 [Project Store] Syncing all sections for project:', projectId)

          // Import stores dynamically to avoid circular dependencies
          const { useWNTRStore } = await import('./wntrStore')
          // const { useChatStore } = await import('./chatStore')

          // Sync WNTR networks
          useWNTRStore.getState().syncWithProject(projectId)

          // Try to load WNTR network from project
          const wntrStore = useWNTRStore.getState()
          await wntrStore.loadNetworkFromProject(projectId)

          // Sync chat conversations (filter by project if needed)
          // This could be enhanced to load project-specific conversations

          console.log('✅ [Project Store] All sections synced')
        } catch (error) {
          console.error('❌ [Project Store] Error syncing sections:', error)
        }
      },

      saveNetworkToCurrentProject: async (name: string, description?: string) => {
        const { currentProject } = get()

        if (!currentProject) {
          console.error('❌ [Project Store] No current project to save network to')
          return false
        }

        try {
          const { useWNTRStore } = await import('./wntrStore')
          const success = await useWNTRStore.getState().saveCurrentNetworkToProject(
            currentProject.id,
            name,
            description
          )

          if (success) {
            console.log('💾 [Project Store] Network saved to current project')
          }

          return success
        } catch (error) {
          console.error('❌ [Project Store] Error saving network to project:', error)
          return false
        }
      },

      loadNetworkFromCurrentProject: async () => {
        const { currentProject } = get()

        if (!currentProject) {
          console.error('❌ [Project Store] No current project to load network from')
          return false
        }

        try {
          const { useWNTRStore } = await import('./wntrStore')
          const success = await useWNTRStore.getState().loadNetworkFromProject(currentProject.id)

          if (success) {
            console.log('📂 [Project Store] Network loaded from current project')
          }

          return success
        } catch (error) {
          console.error('❌ [Project Store] Error loading network from project:', error)
          return false
        }
      }
    }),
    {
      name: 'project-store',
      partialize: (state: ProjectState) => ({
        // Only persist current project ID for restoration
        currentProjectId: state.currentProject?.id || null
      })
    }
  )
)