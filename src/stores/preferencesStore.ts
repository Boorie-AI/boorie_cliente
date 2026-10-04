import { logger } from '@/utils/logger'
import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import { databaseService } from '@/services/database'
import i18n from '@/i18n'
import { esIdioma, idiomaDelSistema, idiomasDelNavegador, type Idioma } from '@/utils/idioma'

export interface UserPreferences {
  autoSaveConversations: boolean
  showTypingIndicators: boolean
  defaultModelType: 'local' | 'api'
  defaultModelId: string
  theme: 'light' | 'dark'
  language: Idioma
}

interface PreferencesState extends UserPreferences {
  // Actions
  loadPreferences: () => Promise<void>
  updatePreference: <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => Promise<void>
  resetPreferences: () => Promise<void>
}

const defaultPreferences: UserPreferences = {
  autoSaveConversations: true,
  showTypingIndicators: true,
  defaultModelType: 'local',
  defaultModelId: '',
  theme: 'light',
  language: 'es'
}

/** La interfaz sigue a la preferencia guardada, nunca al revés (#265). */
function aplicarIdioma(idioma: Idioma) {
  if (i18n.language !== idioma) i18n.changeLanguage(idioma)
}

export const usePreferencesStore = create<PreferencesState>()(
  devtools(
    persist(
      (set, get) => ({
        ...defaultPreferences,
        // Sólo cuenta en una instalación nueva: si hay algo guardado, la
        // rehidratación lo pisa.
        language: idiomaDelSistema(idiomasDelNavegador()),

        loadPreferences: async () => {
          try {
            const preferences = await databaseService.getSettings('preferences')

            const updatedPrefs = { ...defaultPreferences }
            const guardado = preferences.find(setting => setting.key === 'language')?.value
            const idiomaEnLaBase = esIdioma(guardado) ? guardado : null

            preferences.forEach(setting => {
              const key = setting.key as keyof UserPreferences
              if (key !== 'language' && key in updatedPrefs) {
                if (typeof updatedPrefs[key] === 'boolean') {
                  (updatedPrefs[key] as boolean) = setting.value === 'true'
                } else {
                  (updatedPrefs[key] as string) = setting.value
                }
              }
            })

            // Sin idioma en la base se queda el que ya se ve, y se guarda para
            // que la próxima vez lo haya.
            updatedPrefs.language = idiomaEnLaBase ?? get().language
            set(updatedPrefs)
            aplicarIdioma(updatedPrefs.language)
            if (!idiomaEnLaBase) {
              await databaseService.setSetting('language', updatedPrefs.language, 'preferences')
            }
          } catch (error) {
            logger.error('Failed to load preferences:', error)
          }
        },

        updatePreference: async (key, value) => {
          try {
            // Update local state
            set({ [key]: value })

            if (key === 'language') aplicarIdioma(value as Idioma)

            // Persist to database
            await databaseService.setSetting(key, value.toString(), 'preferences')
          } catch (error) {
            logger.error('Failed to update preference:', error)
          }
        },

        resetPreferences: async () => {
          try {
            set(defaultPreferences)
            aplicarIdioma(defaultPreferences.language)

            // Save all default preferences to database
            for (const [key, value] of Object.entries(defaultPreferences)) {
              await databaseService.setSetting(key, value.toString(), 'preferences')
            }
          } catch (error) {
            logger.error('Failed to reset preferences:', error)
          }
        },
      }),
      {
        name: 'preferences-store',
        partialize: (state) => ({
          // Only persist critical preferences locally for immediate access
          theme: state.theme,
          autoSaveConversations: state.autoSaveConversations,
          showTypingIndicators: state.showTypingIndicators,
          language: state.language,
        }),
      }
    ),
    { name: 'preferences-store' }
  )
)

/**
 * Tras rehidratar desde `localStorage` (lo que ocurre al crear el store), la
 * interfaz se pone en el idioma guardado. En una instalación nueva no hay nada
 * guardado y queda el del sistema; se escribe ya, para que el siguiente
 * arranque no lo vuelva a decidir.
 */
function sincronizarIdiomaTrasRehidratar() {
  const { language } = usePreferencesStore.getState()
  const idioma = esIdioma(language) ? language : idiomaDelSistema(idiomasDelNavegador())
  usePreferencesStore.setState({ language: idioma })
  aplicarIdioma(idioma)
}

sincronizarIdiomaTrasRehidratar()
usePreferencesStore.persist.onFinishHydration(sincronizarIdiomaTrasRehidratar)
