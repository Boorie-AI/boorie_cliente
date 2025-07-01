import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import { databaseService } from '@/services/database'
import i18n from '@/i18n'

export interface UserPreferences {
  autoSaveConversations: boolean
  showTypingIndicators: boolean
  defaultModelType: 'local' | 'api'
  defaultModelId: string
  theme: 'light' | 'dark'
  language: 'es' | 'ca' | 'en'
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
  theme: 'dark',
  language: 'es'
}

export const usePreferencesStore = create<PreferencesState>()(
  devtools(
    persist(
      (set, get) => ({
        ...defaultPreferences,

        loadPreferences: async () => {
          try {
            const preferences = await databaseService.getSettings('preferences')
            
            const updatedPrefs = { ...defaultPreferences }
            
            preferences.forEach(setting => {
              const key = setting.key as keyof UserPreferences
              if (key in updatedPrefs) {
                if (typeof updatedPrefs[key] === 'boolean') {
                  updatedPrefs[key] = setting.value === 'true' as any
                } else {
                  updatedPrefs[key] = setting.value as any
                }
              }
            })
            
            set(updatedPrefs)
          } catch (error) {
            console.error('Failed to load preferences:', error)
          }
        },

        updatePreference: async (key, value) => {
          try {
            // Update local state
            set({ [key]: value })
            
            // If language is being changed, update i18n
            if (key === 'language') {
              i18n.changeLanguage(value as string)
            }
            
            // Persist to database
            await databaseService.setSetting(key, value.toString(), 'preferences')
          } catch (error) {
            console.error('Failed to update preference:', error)
          }
        },

        resetPreferences: async () => {
          try {
            set(defaultPreferences)
            
            // Save all default preferences to database
            for (const [key, value] of Object.entries(defaultPreferences)) {
              await databaseService.setSetting(key, value.toString(), 'preferences')
            }
          } catch (error) {
            console.error('Failed to reset preferences:', error)
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