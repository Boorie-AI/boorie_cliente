import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import { databaseService } from '@/services/database'
import { useChatStore } from './chatStore'

export interface AppState {
  isInitialized: boolean
  currentView: 'chat' | 'settings' | 'rag' | 'projects' | 'calculator' | 'wntr'
  theme: 'dark' | 'light'
  sidebarCollapsed: boolean

  // AI Configuration
  activeAIProvider: 'ollama' | 'openai' | 'anthropic' | 'google'
  activeModel: string

  // Authentication
  isAuthenticated: {
    microsoft: boolean
    google: boolean
  }

  // Actions
  initializeApp: () => Promise<void>
  setCurrentView: (view: AppState['currentView']) => void
  toggleSidebar: () => void
  setTheme: (theme: AppState['theme']) => void
  setActiveAIProvider: (provider: AppState['activeAIProvider']) => void
  setActiveModel: (model: string) => void
  setAuthenticationStatus: (provider: 'microsoft' | 'google', status: boolean) => void
  loadSettingsFromDatabase: () => Promise<void>
}

export const useAppStore = create<AppState>()(
  devtools(
    persist(
      (set, get) => ({
        isInitialized: false,
        currentView: 'chat',
        theme: 'dark',
        sidebarCollapsed: false,
        activeAIProvider: 'ollama',
        activeModel: 'llama2',
        isAuthenticated: {
          microsoft: false,
          google: false,
        },

        initializeApp: async () => {
          try {
            // Initialize database
            const dbInitialized = await databaseService.initialize()
            if (!dbInitialized) {
              console.warn('Database initialization failed, using fallback storage')
            }

            // Load saved settings from database
            await get().loadSettingsFromDatabase()

            // Apply theme immediately
            const currentTheme = get().theme
            const root = document.documentElement
            if (currentTheme === 'dark') {
              root.classList.add('dark')
            } else {
              root.classList.remove('dark')
            }

            // Load conversations
            await useChatStore.getState().loadConversations()

            set({ isInitialized: true })
          } catch (error) {
            console.error('Failed to initialize app:', error)
            set({ isInitialized: true }) // Still mark as initialized to prevent infinite loading
          }
        },

        loadSettingsFromDatabase: async () => {
          try {
            const settings = await databaseService.getSettings('general')

            settings.forEach(setting => {
              switch (setting.key) {
                case 'theme':
                  if (setting.value === 'light' || setting.value === 'dark') {
                    set({ theme: setting.value })
                  }
                  break
                case 'currentView':
                  if (['chat', 'settings', 'rag', 'projects', 'calculator', 'wntr'].includes(setting.value)) {
                    set({ currentView: setting.value as any })
                  }
                  break
                case 'sidebarCollapsed':
                  set({ sidebarCollapsed: setting.value === 'true' })
                  break
                case 'activeAIProvider':
                  if (['ollama', 'openai', 'anthropic', 'google'].includes(setting.value)) {
                    set({ activeAIProvider: setting.value as any })
                  }
                  break
                case 'activeModel':
                  set({ activeModel: setting.value })
                  break
              }
            })
          } catch (error) {
            console.error('Failed to load settings from database:', error)
          }
        },

        setCurrentView: async (view) => {
          set({ currentView: view })
          await databaseService.setSetting('currentView', view, 'general')
        },

        toggleSidebar: async () => {
          const newState = !get().sidebarCollapsed
          set({ sidebarCollapsed: newState })
          await databaseService.setSetting('sidebarCollapsed', newState.toString(), 'general')
        },

        setTheme: async (theme) => {
          set({ theme })
          await databaseService.setSetting('theme', theme, 'general')

          // Apply theme to document immediately
          const root = document.documentElement
          if (theme === 'dark') {
            root.classList.add('dark')
          } else {
            root.classList.remove('dark')
          }
        },

        setActiveAIProvider: async (provider) => {
          set({ activeAIProvider: provider })
          await databaseService.setSetting('activeAIProvider', provider, 'ai')
        },

        setActiveModel: async (model) => {
          set({ activeModel: model })
          await databaseService.setSetting('activeModel', model, 'ai')
        },

        setAuthenticationStatus: async (provider, status) => {
          set((state) => ({
            isAuthenticated: {
              ...state.isAuthenticated,
              [provider]: status
            }
          }))
          await databaseService.setSetting(
            `auth_${provider}`,
            status.toString(),
            'authentication'
          )
        },
      }),
      {
        name: 'app-store',
        partialize: (state) => ({
          // Only persist critical state that needs to be available immediately
          theme: state.theme,
          sidebarCollapsed: state.sidebarCollapsed,
        }),
      }
    ),
    { name: 'app-store' }
  )
)