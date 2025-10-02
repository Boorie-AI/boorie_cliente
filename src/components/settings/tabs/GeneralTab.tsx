import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/stores/appStore'
import { usePreferencesStore } from '@/stores/preferencesStore'
import { Moon, Sun, RotateCcw, Languages } from 'lucide-react'
import { cn } from '@/utils/cn'
import * as Switch from '@radix-ui/react-switch'
import * as Select from '@radix-ui/react-select'

export function GeneralTab() {
  const { t } = useTranslation()
  const { theme, setTheme } = useAppStore()
  const {
    autoSaveConversations,
    showTypingIndicators,
    language,
    loadPreferences,
    updatePreference,
    resetPreferences
  } = usePreferencesStore()

  useEffect(() => {
    loadPreferences()
  }, [loadPreferences])

  const languageOptions = [
    { value: 'es', label: 'Castellano' },
    { value: 'ca', label: 'Català' },
    { value: 'en', label: 'English' }
  ]

  return (
    <div 
      style={{ 
        height: '100%', 
        overflowY: 'auto', 
        overflowX: 'hidden',
        position: 'relative'
      }}
    >
      <div>
        {/* Theme Settings */}
        <div className="bg-card rounded-xl border border-border p-6 mb-6">
          <h2 className="text-xl font-semibold text-card-foreground mb-4">{t('settings.appearance')}</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-card-foreground">
                  {t('settings.theme')}
                </label>
                <p className="text-sm text-muted-foreground">
                  {t('settings.chooseTheme')}
                </p>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => setTheme('light')}
                  className={cn(
                    "p-3 rounded-lg border transition-all",
                    theme === 'light'
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-primary/50 text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Sun size={18} />
                </button>
                <button
                  onClick={() => setTheme('dark')}
                  className={cn(
                    "p-3 rounded-lg border transition-all",
                    theme === 'dark'
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-primary/50 text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Moon size={18} />
                </button>
              </div>
            </div>

            {/* Language Settings */}
            <div className="flex items-center justify-between pt-4 border-t border-border">
              <div>
                <label className="text-sm font-medium text-card-foreground">
                  {t('settings.language')}
                </label>
                <p className="text-sm text-muted-foreground">
                  {t('settings.languageDesc')}
                </p>
              </div>
              <Select.Root value={language} onValueChange={(value) => updatePreference('language', value as 'es' | 'ca' | 'en')}>
                <Select.Trigger className={cn(
                  "flex items-center space-x-2 px-3 py-2 bg-input border border-border rounded-lg",
                  "hover:bg-accent transition-colors min-w-[140px]",
                  "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                )}>
                  <Languages size={16} className="text-muted-foreground" />
                  <Select.Value />
                  <Select.Icon>
                    <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </Select.Icon>
                </Select.Trigger>
                <Select.Portal>
                  <Select.Content className="bg-popover border border-border rounded-lg shadow-lg z-50 min-w-[140px]">
                    <Select.Viewport className="p-1">
                      {languageOptions.map((option) => (
                        <Select.Item
                          key={option.value}
                          value={option.value}
                          className={cn(
                            "flex items-center px-3 py-2 rounded-md cursor-pointer",
                            "hover:bg-accent hover:text-accent-foreground",
                            "focus:bg-accent focus:text-accent-foreground focus:outline-none"
                          )}
                        >
                          <Select.ItemText>{option.label}</Select.ItemText>
                        </Select.Item>
                      ))}
                    </Select.Viewport>
                  </Select.Content>
                </Select.Portal>
              </Select.Root>
            </div>
          </div>
        </div>

        {/* User Preferences */}
        <div className="bg-card rounded-xl border border-border p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-card-foreground">{t('settings.preferences')}</h2>
            <button
              onClick={resetPreferences}
              className={cn(
                "flex items-center space-x-2 px-3 py-2 text-sm",
                "text-muted-foreground hover:text-foreground",
                "hover:bg-accent rounded-lg transition-colors"
              )}
            >
              <RotateCcw size={16} />
              <span>{t('settings.resetDefaults')}</span>
            </button>
          </div>

          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-card-foreground">
                  {t('settings.autoSave')}
                </label>
                <p className="text-sm text-muted-foreground">
                  {t('settings.autoSaveDesc')}
                </p>
              </div>
              <Switch.Root
                className="w-11 h-6 bg-muted rounded-full relative data-[state=checked]:bg-primary outline-none cursor-pointer transition-colors"
                checked={autoSaveConversations}
                onCheckedChange={(checked) => updatePreference('autoSaveConversations', checked)}
              >
                <Switch.Thumb className="block w-5 h-5 bg-background rounded-full transition-transform duration-200 translate-x-0.5 will-change-transform data-[state=checked]:translate-x-[22px] shadow-sm" />
              </Switch.Root>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-card-foreground">
                  {t('settings.typingIndicators')}
                </label>
                <p className="text-sm text-muted-foreground">
                  {t('settings.typingIndicatorsDesc')}
                </p>
              </div>
              <Switch.Root
                className="w-11 h-6 bg-muted rounded-full relative data-[state=checked]:bg-primary outline-none cursor-pointer transition-colors"
                checked={showTypingIndicators}
                onCheckedChange={(checked) => updatePreference('showTypingIndicators', checked)}
              >
                <Switch.Thumb className="block w-5 h-5 bg-background rounded-full transition-transform duration-200 translate-x-0.5 will-change-transform data-[state=checked]:translate-x-[22px] shadow-sm" />
              </Switch.Root>
            </div>

            {/* Visual feedback for current settings */}
            <div className="p-4 bg-accent/30 rounded-lg border border-border/50">
              <h3 className="text-sm font-medium text-card-foreground mb-2">{t('status.currentSettings')}</h3>
              <div className="space-y-1 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>{t('settings.autoSave')}:</span>
                  <span className={autoSaveConversations ? 'text-green-600' : 'text-red-600'}>
                    {autoSaveConversations ? t('status.enabled') : t('status.disabled')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>{t('settings.typingIndicators')}:</span>
                  <span className={showTypingIndicators ? 'text-green-600' : 'text-red-600'}>
                    {showTypingIndicators ? t('status.enabled') : t('status.disabled')}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Storage Information */}
        <div className="bg-card rounded-xl border border-border p-6 mb-6">
          <h2 className="text-xl font-semibold text-card-foreground mb-4">{t('settings.storage')}</h2>
          <div className="space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">{t('settings.databaseLocation')}</span>
              <span className="font-mono text-xs bg-accent px-2 py-1 rounded">./prisma/boorie.db</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">{t('settings.settingsStorage')}</span>
              <span className="text-green-600">SQLite Database</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">{t('settings.backupFrequency')}</span>
              <span className="text-muted-foreground">Manual (Export conversations)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}