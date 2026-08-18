import { logger } from '@/utils/logger'
import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'

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
  /**
   * Proyecto activo global. Es lo único que se persiste, y es la fuente de
   * verdad de "en qué proyecto está el usuario" para toda la aplicación: el
   * objeto `currentProject` se rehidrata desde la base de datos a partir de
   * este id, para no arrastrar una copia obsoleta entre sesiones.
   */
  currentProjectId: string | null
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
  /**
   * Vuelve a cargar el proyecto activo persistido. La llama la raíz de la
   * aplicación al arrancar, y no `onRehydrateStorage`, porque necesita
   * `window.electronAPI` disponible.
   */
  restoreActiveProject: () => Promise<boolean>

  // Cross-section synchronization
  syncAllSections: (projectId: string) => Promise<void>

  // Project content management
  saveNetworkToCurrentProject: (name: string, description?: string) => Promise<boolean>
  loadNetworkFromCurrentProject: () => Promise<boolean>
}

const initialState = {
  currentProject: null,
  currentProjectId: null,
  projects: [],
  isLoading: false,
  isLoadingProjects: false,
  error: null,
}

export const useProjectStore = create<ProjectState>()(
  devtools(
    persist(
      (set, get) => ({
        ...initialState,

      loadProjects: async () => {
        set({ isLoadingProjects: true, error: null })

        try {
          const result = await window.electronAPI.hydraulic.listProjects()

          if (result.success && result.data) {
            set({ projects: result.data })
          } else {
            set({ error: result.error || 'Failed to load projects' })
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          set({ error: errorMessage })
          logger.error('Error loading projects:', error)
        } finally {
          set({ isLoadingProjects: false })
        }
      },

      selectProject: async (projectId: string) => {
        set({ isLoading: true, error: null })

        try {
          const result = await window.electronAPI.hydraulic.getProject(projectId)

          if (result.success && result.data) {
            set({ currentProject: result.data, currentProjectId: projectId })

            // Trigger cross-section synchronization
            await get().syncAllSections(projectId)

            return true
          } else {
            set({ error: result.error || 'Failed to load project' })
            return false
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          set({ error: errorMessage })
          logger.error('Error selecting project:', error)
          return false
        } finally {
          set({ isLoading: false })
        }
      },

      createProject: async (projectData: Partial<ProjectData>) => {
        set({ isLoading: true, error: null })

        try {
          const result = await window.electronAPI.hydraulic.createProject(projectData)

          if (result.success && result.data) {
            // Reload projects to include the new one
            await get().loadProjects()

            return result.data.id
          } else {
            set({ error: result.error || 'Failed to create project' })
            return null
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          set({ error: errorMessage })
          logger.error('Error creating project:', error)
          return null
        } finally {
          set({ isLoading: false })
        }
      },

      updateProject: async (projectId: string, updates: Partial<ProjectData>) => {
        set({ isLoading: true, error: null })

        try {
          const result = await window.electronAPI.hydraulic.updateProject(projectId, updates)

          if (result.success) {
            // Update current project if it's the one being updated
            const { currentProject } = get()
            if (currentProject && currentProject.id === projectId) {
              set({ currentProject: { ...currentProject, ...updates } })
            }

            // Reload projects to get updated data
            await get().loadProjects()

            return true
          } else {
            set({ error: result.error || 'Failed to update project' })
            return false
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          set({ error: errorMessage })
          logger.error('Error updating project:', error)
          return false
        } finally {
          set({ isLoading: false })
        }
      },

      deleteProject: async (projectId: string) => {
        set({ isLoading: true, error: null })

        try {
          const result = await window.electronAPI.hydraulic.deleteProject(projectId)

          if (result.success) {
            // Clear current project if it's the one being deleted. También el id
            // persistido: si no, al reabrir la aplicación intentaría restaurar un
            // proyecto borrado.
            if (get().currentProjectId === projectId) {
              set({ currentProject: null, currentProjectId: null })
            }

            // Remove from projects list
            set(state => ({
              projects: state.projects.filter(p => p.id !== projectId)
            }))

            return true
          } else {
            set({ error: result.error || 'Failed to delete project' })
            return false
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          set({ error: errorMessage })
          logger.error('Error deleting project:', error)
          return false
        } finally {
          set({ isLoading: false })
        }
      },

      clearProject: () => {
        set({ currentProject: null, currentProjectId: null, error: null })
      },

      restoreActiveProject: async () => {
        const { currentProjectId, currentProject } = get()
        if (!currentProjectId || currentProject?.id === currentProjectId) return false

        const ok = await get().selectProject(currentProjectId)
        if (!ok) {
          // El proyecto pudo borrarse entre sesiones: se olvida en lugar de
          // dejar la aplicación apuntando a un id que ya no existe.
          logger.warn('El proyecto activo persistido ya no existe, se descarta:', currentProjectId)
          set({ currentProjectId: null, error: null })
        }
        return ok
      },

      syncAllSections: async (projectId: string) => {
        try {
          // Import stores dynamically to avoid circular dependencies
          const { useWNTRStore } = await import('./wntrStore')
          // const { useChatStore } = await import('./chatStore')

          // Sync WNTR networks
          useWNTRStore.getState().syncWithProject(projectId)

          // Aquí se cargaba la red del proyecto en el backend de WNTR. Se ha
          // quitado a propósito: la vista que muestra una red gestiona su propia
          // carga, y cargar otra por detrás deja el backend simulando una red
          // distinta de la que el usuario ve. Seleccionar proyecto fija contexto;
          // cargar una red es una acción explícita.

          // Sync chat conversations (filter by project if needed)
          // This could be enhanced to load project-specific conversations
        } catch (error) {
          logger.error('Error syncing sections:', error)
        }
      },

      saveNetworkToCurrentProject: async (name: string, description?: string) => {
        const { currentProject } = get()

        if (!currentProject) {
          return false
        }

        try {
          const { useWNTRStore } = await import('./wntrStore')
          const success = await useWNTRStore.getState().saveCurrentNetworkToProject(
            currentProject.id,
            name,
            description
          )

          return success
        } catch (error) {
          logger.error('Error saving network to project:', error)
          return false
        }
      },

      loadNetworkFromCurrentProject: async () => {
        const { currentProject } = get()

        if (!currentProject) {
          return false
        }

        try {
          const { useWNTRStore } = await import('./wntrStore')
          const success = await useWNTRStore.getState().loadNetworkFromProject(currentProject.id)

          return success
        } catch (error) {
          logger.error('Error loading network from project:', error)
          return false
        }
      }
      }),
      {
        name: 'project-store',
        // Sólo el id: el objeto del proyecto se rehidrata desde la base de
        // datos con restoreActiveProject(), para no servir datos obsoletos si
        // el proyecto cambió entre sesiones.
        partialize: (state: ProjectState) => ({ currentProjectId: state.currentProjectId }) as Partial<ProjectState>
      }
    ),
    { name: 'project-store' }
  )
)