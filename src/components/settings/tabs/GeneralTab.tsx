import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/stores/appStore'
import { usePreferencesStore } from '@/stores/preferencesStore'
import { databaseService } from '@/services/database'
import { Moon, Sun, RotateCcw, Languages, Eye, EyeOff, Map, Check, Terminal } from 'lucide-react'
import { cn } from '@/utils/cn'
import * as Switch from '@radix-ui/react-switch'
import * as Select from '@radix-ui/react-select'

const MAPBOX_TOKEN_SETTING_KEY = 'mapbox_access_token'

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

  const [mapboxToken, setMapboxToken] = useState('')
  const [showMapboxToken, setShowMapboxToken] = useState(false)
  const [mapboxSaved, setMapboxSaved] = useState(false)

  const [pythonPath, setPythonPath] = useState('')
  const [pythonDetected, setPythonDetected] = useState('')
  const [pythonMessage, setPythonMessage] = useState('')
  const [pythonOk, setPythonOk] = useState(false)
  const [pythonChecking, setPythonChecking] = useState(false)
  const isWindows = navigator.userAgent.includes('Windows')
  const setupApi = (window as any).electronAPI?.setup

  const refreshPythonStatus = async () => {
    if (!setupApi?.getPython) return
    const info = await setupApi.getPython()
    if (!info?.success) return
    setPythonDetected(info.effective?.pythonPath ?? '')
    setPythonPath(info.configured ?? '')
    if (info.effective && !info.effective.wntrReady) {
      setPythonOk(false)
      setPythonMessage(
        info.effective.usable
          ? `El intérprete en uso no tiene: ${info.effective.missingModules.join(', ')}.`
          : 'No hay un intérprete de Python utilizable.'
      )
    } else {
      setPythonOk(true)
      setPythonMessage('')
    }
  }

  useEffect(() => {
    loadPreferences()
    databaseService.getSetting(MAPBOX_TOKEN_SETTING_KEY).then((value) => {
      if (value) setMapboxToken(value)
    })
    refreshPythonStatus()
  }, [loadPreferences])

  const handleBrowsePython = async () => {
    const result = await setupApi?.browsePython()
    if (result?.success && result.path) setPythonPath(result.path)
  }

  const handleSavePythonPath = async () => {
    if (!setupApi?.setPython) return
    setPythonChecking(true)
    try {
      const result = await setupApi.setPython(pythonPath)
      await refreshPythonStatus()
      // Después del refresco, para que el mensaje de confirmación no se pise
      setPythonOk(Boolean(result?.success && result?.wntrReady))
      setPythonMessage(result?.message ?? result?.error ?? '')
    } finally {
      setPythonChecking(false)
    }
  }

  const handleClearPythonPath = async () => {
    if (!setupApi?.clearPython) return
    setPythonChecking(true)
    try {
      await setupApi.clearPython()
      setPythonPath('')
      await refreshPythonStatus()
    } finally {
      setPythonChecking(false)
    }
  }

  const handleSaveMapboxToken = async () => {
    const ok = await databaseService.setSetting(MAPBOX_TOKEN_SETTING_KEY, mapboxToken.trim(), 'map')
    if (ok) {
      setMapboxSaved(true)
      setTimeout(() => setMapboxSaved(false), 2000)
    }
  }

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

        {/* Mapbox Configuration */}
        <div className="bg-card rounded-xl border border-border p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Map size={20} className="text-muted-foreground" />
            <h2 className="text-xl font-semibold text-card-foreground">Mapbox</h2>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-card-foreground">Mapbox Access Token</label>
              <p className="text-sm text-muted-foreground">
                Necesario para visualizar redes hidráulicas sobre el mapa (WNTR Network Visualization).
                Consigue un token gratuito en{' '}
                <a
                  href="https://account.mapbox.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-foreground"
                >
                  account.mapbox.com
                </a>.
              </p>
            </div>
            <div className="flex space-x-2">
              <div className="relative flex-1 min-w-0">
                <input
                  type={showMapboxToken ? 'text' : 'password'}
                  value={mapboxToken}
                  onChange={(e) => setMapboxToken(e.target.value)}
                  placeholder="pk.eyJ1Ijoi..."
                  className="w-full px-3 py-2 pr-10 bg-input border border-border rounded-lg text-foreground placeholder-muted-foreground focus:border-ring focus:outline-none text-sm font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowMapboxToken(!showMapboxToken)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showMapboxToken ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <button
                type="button"
                onClick={handleSaveMapboxToken}
                className={cn(
                  'px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5',
                  mapboxSaved
                    ? 'bg-green-600/10 text-green-600'
                    : 'bg-primary text-primary-foreground hover:bg-primary/90'
                )}
              >
                {mapboxSaved ? <Check size={16} /> : null}
                {mapboxSaved ? 'Guardado' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>

        {/* Python / WNTR interpreter */}
        <div className="bg-card rounded-xl border border-border p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Terminal size={20} className="text-muted-foreground" />
            <h2 className="text-xl font-semibold text-card-foreground">Python (WNTR)</h2>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-card-foreground">Ruta del intérprete</label>
              <p className="text-sm text-muted-foreground">
                Boorie detecta Python automáticamente y prioriza el de tu sistema. Indica aquí la ruta
                sólo si tienes WNTR en un entorno que no encuentra (conda, un venv propio o una
                instalación fuera de las rutas habituales).
              </p>
            </div>
            <div className="flex space-x-2">
              <input
                type="text"
                value={pythonPath}
                onChange={(e) => setPythonPath(e.target.value)}
                placeholder={pythonDetected || (isWindows ? 'C:\\Python312\\python.exe' : '/usr/bin/python3')}
                className="flex-1 min-w-0 px-3 py-2 bg-input border border-border rounded-lg text-foreground placeholder-muted-foreground focus:border-ring focus:outline-none text-sm font-mono"
              />
              <button
                type="button"
                onClick={handleBrowsePython}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-accent text-accent-foreground hover:bg-accent/80 transition-colors"
              >
                Examinar…
              </button>
              <button
                type="button"
                onClick={handleSavePythonPath}
                disabled={pythonChecking}
                className={cn(
                  'px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5',
                  'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50'
                )}
              >
                {pythonChecking ? 'Comprobando…' : 'Guardar'}
              </button>
            </div>
            {pythonMessage && (
              <div
                className={cn(
                  'rounded-lg border p-3 text-sm flex gap-2 items-start',
                  pythonOk
                    ? 'border-green-600/30 bg-green-600/5 text-green-700 dark:text-green-400'
                    : 'border-yellow-500/30 bg-yellow-500/5 text-yellow-700 dark:text-yellow-400'
                )}
              >
                {pythonOk ? <Check size={16} className="mt-0.5 flex-shrink-0" /> : null}
                <span className="whitespace-pre-wrap">{pythonMessage}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                En uso ahora:{' '}
                <span className="font-mono">{pythonDetected || 'detectando…'}</span>
              </span>
              <button
                type="button"
                onClick={handleClearPythonPath}
                className="underline hover:text-foreground"
              >
                Volver a la detección automática
              </button>
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