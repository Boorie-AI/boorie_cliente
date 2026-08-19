import { logger } from '@/utils/logger'
import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import { databaseService } from '@/services/database'
import { useChatStore } from './chatStore'
import type { AmbitoChat, SeccionRed } from '@/config/navegacion'
import { requisitosPendientes } from '@/config/precondiciones'

export const VISTAS = ['chat', 'settings', 'wisdom', 'projects', 'calculator', 'wntr'] as const

/**
 * La vista del Wisdom Center se llamaba 'rag' en el enrutado mientras la
 * etiqueta visible decía «Wisdom Center» (issue #35). El valor viejo sigue
 * guardado en la base de datos de quien ya usaba la aplicacion.
 */
const VISTAS_RENOMBRADAS: Record<string, AppState['currentView']> = { rag: 'wisdom' }

export function migrarVista(valor: string): AppState['currentView'] | null {
  const renombrada = VISTAS_RENOMBRADAS[valor]
  if (renombrada) return renombrada
  return (VISTAS as readonly string[]).includes(valor) ? (valor as AppState['currentView']) : null
}

export interface AppState {
  isInitialized: boolean
  currentView: typeof VISTAS[number]
  /** Con qué conversaciones trabaja el chat: las del proyecto activo o las generales. */
  ambitoChat: AmbitoChat
  /** Pestaña de la vista de red a la que se ha entrado desde el menú, si se pidió una. */
  seccionRed: SeccionRed | null
  theme: 'dark' | 'light'
  sidebarCollapsed: boolean
  showOnboarding: boolean
  onboardingStep: number
  settingsTab: string

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
  setCurrentView: (
    view: AppState['currentView'],
    opciones?: { ambitoChat?: AmbitoChat; seccionRed?: SeccionRed | null }
  ) => void
  /**
   * Corrige la vista restaurada cuando su precondición no se cumple al
   * arrancar. La llama la raíz de la aplicación cuando ya sabe si hay proyecto.
   */
  ajustarVistaInicial: (estado: { hayProyecto: boolean; hayRed: boolean }) => void
  toggleSidebar: () => void
  setTheme: (theme: AppState['theme']) => void
  setActiveAIProvider: (provider: AppState['activeAIProvider']) => void
  setActiveModel: (model: string) => void
  setAuthenticationStatus: (provider: 'microsoft' | 'google', status: boolean) => void
  loadSettingsFromDatabase: () => Promise<void>
  setShowOnboarding: (show: boolean) => void
  setOnboardingStep: (step: number) => void
  completeOnboarding: () => Promise<void>
  setSettingsTab: (tab: string) => void
}

export const useAppStore = create<AppState>()(
  devtools(
    persist(
      (set, get) => ({
        isInitialized: false,
        // La navegación empieza por Proyectos: todo lo demás cuelga de saber en
        // qué proyecto estás (issue #35).
        currentView: 'projects',
        ambitoChat: 'general',
        seccionRed: null,
        theme: 'light',
        sidebarCollapsed: false,
        showOnboarding: false,
        onboardingStep: 0,
        settingsTab: 'general',
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
              logger.warn('Database initialization failed, using fallback storage')
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

            // Check if this is the first launch
            const onboarded = await databaseService.getSetting('onboarding_completed')
            if (onboarded !== 'true') {
              set({
                showOnboarding: true,
                currentView: 'settings'
              })
            }

            set({ isInitialized: true })
          } catch (error) {
            logger.error('Failed to initialize app:', error)
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
                case 'currentView': {
                  const vista = migrarVista(setting.value)
                  if (vista) set({ currentView: vista })
                  break
                }
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
            logger.error('Failed to load settings from database:', error)
          }
        },

        setCurrentView: async (view, opciones) => {
          set({
            currentView: view,
            ...(opciones?.ambitoChat !== undefined ? { ambitoChat: opciones.ambitoChat } : {}),
            // La sección se limpia siempre que no se pida una: si no, entrar en
            // la red desde el menú te dejaría en la pestaña del último enlace.
            seccionRed: opciones?.seccionRed ?? null,
          })
          await databaseService.setSetting('currentView', view, 'general')
        },

        // No se persiste: es una corrección de arranque, no una elección del
        // usuario. Si mañana abre con proyecto, recupera la vista que dejó.
        ajustarVistaInicial: (estado) => {
          const vista = get().currentView
          if (requisitosPendientes(vista, estado).length > 0) {
            set({ currentView: 'projects' })
          }
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

        setShowOnboarding: (show) => {
          set({ showOnboarding: show })
        },

        setOnboardingStep: (step) => {
          set({ onboardingStep: step })
        },

        completeOnboarding: async () => {
          set({ showOnboarding: false })
          await databaseService.setSetting('onboarding_completed', 'true', 'general')
        },

        setSettingsTab: (tab) => {
          set({ settingsTab: tab })
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