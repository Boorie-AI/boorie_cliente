import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import { useAuthStore } from '../../../stores/authStore'

export function AccountsTab() {
  const { t } = useTranslation()
  const {
    connectionStatus,
    userProfiles,
    isLoading,
    errors,
    initializeAuth,
    connectMicrosoft,
    connectGoogle,
    disconnect,
    refreshProviderStatus,
    testConnection,
    clearErrors
  } = useAuthStore()

  const [showTestResults, setShowTestResults] = useState<{ [key: string]: any }>({})

  // Initialize auth state on component mount
  useEffect(() => {
    initializeAuth()
  }, [initializeAuth])

  // Helper function to get connection status indicator
  const getStatusIndicator = (provider: 'microsoft' | 'google') => {
    const status = connectionStatus[provider]
    if (isLoading[provider]) {
      return <div className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-pulse"></div>
    }
    if (status.isConnected) {
      return <div className="w-1.5 h-1.5 bg-green-400 rounded-full"></div>
    }
    return <div className="w-1.5 h-1.5 bg-gray-400 rounded-full"></div>
  }

  // Helper function to get status text
  const getStatusText = (provider: 'microsoft' | 'google') => {
    const status = connectionStatus[provider]
    if (isLoading[provider]) {
      return t('accounts.connecting')
    }
    if (status.isConnected) {
      return t('accounts.connected')
    }
    return t('accounts.notConnected')
  }

  // Helper function to get user info
  const getUserInfo = (provider: 'microsoft' | 'google') => {
    const status = connectionStatus[provider]
    const profile = userProfiles.find(p => p.provider === provider && p.isActive)
    
    if (status.isConnected && (profile || status.userEmail)) {
      return (
        <div className="text-xs text-muted-foreground mt-1">
          <div>{profile?.name || status.userName || 'User'}</div>
          <div className="opacity-75">{profile?.email || status.userEmail}</div>
        </div>
      )
    }
    return null
  }

  // Handle connect button click
  const handleConnect = async (provider: 'microsoft' | 'google') => {
    clearErrors()
    const success = provider === 'microsoft' ? await connectMicrosoft() : await connectGoogle()
    if (success) {
      setShowTestResults({ ...showTestResults, [provider]: undefined })
    }
  }

  // Handle disconnect button click
  const handleDisconnect = async (provider: 'microsoft' | 'google') => {
    if (window.confirm(t('accounts.confirmDisconnect', { provider: provider === 'microsoft' ? 'Microsoft' : 'Google' }))) {
      clearErrors()
      await disconnect(provider)
      setShowTestResults({ ...showTestResults, [provider]: undefined })
    }
  }

  // Handle test connection
  const handleTestConnection = async (provider: 'microsoft' | 'google') => {
    const success = await testConnection(provider)
    setShowTestResults({
      ...showTestResults,
      [provider]: {
        success,
        timestamp: new Date().toLocaleTimeString(),
        message: success ? t('accounts.testSuccess') : errors[provider] || t('accounts.testFailed')
      }
    })
  }

  // Handle refresh status
  const handleRefreshStatus = async (provider: 'microsoft' | 'google') => {
    await refreshProviderStatus(provider)
  }

  return (
    <div
      style={{
        height: '100%',
        overflowY: 'auto',
        overflowX: 'hidden',
        position: 'relative'
      }}
    >
      <div className="space-y-6 h-full overflow-y-auto pr-2 pb-4">
        {/* Connected Accounts */}
        <div className="bg-card rounded-xl border border-border p-6">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-card-foreground mb-2">{t('accounts.connectedAccounts')}</h2>
            <p className="text-muted-foreground">{t('accounts.connectedAccountsDesc')}</p>
          </div>

          <div className="grid gap-4">
            {/* Microsoft 365 */}
            <div className="group relative overflow-hidden rounded-xl border border-border bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 hover:shadow-md transition-all duration-200">
              <div className="flex items-center justify-between p-6">
                <div className="flex items-center space-x-4 flex-1">
                  <div className="relative">
                    <img src="src/assets/microsoft.png" width={'50px'} alt="Microsoft" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-card-foreground text-lg mb-1">{t('accounts.microsoft365')}</h3>
                    <p className="text-sm text-muted-foreground mb-2">{t('accounts.microsoft365Desc')}</p>
                    <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                      <span className="flex items-center space-x-1">
                        {getStatusIndicator('microsoft')}
                        <span>{getStatusText('microsoft')}</span>
                      </span>
                      <span>{t('accounts.outlook')} • {t('accounts.calendar')} • {t('accounts.onedrive')}</span>
                    </div>
                    {getUserInfo('microsoft')}
                    {connectionStatus.microsoft.isExpired && connectionStatus.microsoft.hasTokens && (
                      <div className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                        {t('accounts.tokenExpired')}
                      </div>
                    )}
                    {errors.microsoft && (
                      <div className="text-xs text-red-600 dark:text-red-400 mt-1">
                        {errors.microsoft}
                      </div>
                    )}
                    {showTestResults.microsoft && (
                      <div className={`text-xs mt-1 ${showTestResults.microsoft.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {showTestResults.microsoft.message} ({showTestResults.microsoft.timestamp})
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {connectionStatus.microsoft.isConnected && (
                    <>
                      <button
                        onClick={() => handleTestConnection('microsoft')}
                        disabled={isLoading.microsoft}
                        className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium transition-colors disabled:opacity-50"
                      >
                        {t('accounts.test')}
                      </button>
                      <button
                        onClick={() => handleRefreshStatus('microsoft')}
                        disabled={isLoading.microsoft}
                        className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium transition-colors disabled:opacity-50"
                      >
                        {t('accounts.refresh')}
                      </button>
                      <button
                        onClick={() => handleDisconnect('microsoft')}
                        disabled={isLoading.microsoft}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                      >
                        {t('accounts.disconnect')}
                      </button>
                    </>
                  )}
                  {!connectionStatus.microsoft.isConnected && (
                    <button
                      onClick={() => handleConnect('microsoft')}
                      disabled={isLoading.microsoft}
                      className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors shadow-sm disabled:opacity-50"
                    >
                      {isLoading.microsoft ? t('accounts.connecting') : t('accounts.connect')}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Google Workspace */}
            <div className="group relative overflow-hidden rounded-xl border border-border bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-950/30 dark:to-orange-950/30 hover:shadow-md transition-all duration-200">
              <div className="flex items-center justify-between p-6">
                <div className="flex items-center space-x-4 flex-1">
                  <div className="relative">
                    <img src="src/assets/google.png" width={'50px'} alt="Google" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-card-foreground text-lg mb-1">{t('accounts.googleWorkspace')}</h3>
                    <p className="text-sm text-muted-foreground mb-2">{t('accounts.googleWorkspaceDesc')}</p>
                    <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                      <span className="flex items-center space-x-1">
                        {getStatusIndicator('google')}
                        <span>{getStatusText('google')}</span>
                      </span>
                      <span>{t('accounts.gmail')} • {t('accounts.calendar')} • {t('accounts.drive')}</span>
                    </div>
                    {getUserInfo('google')}
                    {connectionStatus.google.isExpired && connectionStatus.google.hasTokens && (
                      <div className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                        {t('accounts.tokenExpired')}
                      </div>
                    )}
                    {errors.google && (
                      <div className="text-xs text-red-600 dark:text-red-400 mt-1">
                        {errors.google}
                      </div>
                    )}
                    {showTestResults.google && (
                      <div className={`text-xs mt-1 ${showTestResults.google.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {showTestResults.google.message} ({showTestResults.google.timestamp})
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {connectionStatus.google.isConnected && (
                    <>
                      <button
                        onClick={() => handleTestConnection('google')}
                        disabled={isLoading.google}
                        className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium transition-colors disabled:opacity-50"
                      >
                        {t('accounts.test')}
                      </button>
                      <button
                        onClick={() => handleRefreshStatus('google')}
                        disabled={isLoading.google}
                        className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium transition-colors disabled:opacity-50"
                      >
                        {t('accounts.refresh')}
                      </button>
                      <button
                        onClick={() => handleDisconnect('google')}
                        disabled={isLoading.google}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                      >
                        {t('accounts.disconnect')}
                      </button>
                    </>
                  )}
                  {!connectionStatus.google.isConnected && (
                    <button
                      onClick={() => handleConnect('google')}
                      disabled={isLoading.google}
                      className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors shadow-sm disabled:opacity-50"
                    >
                      {isLoading.google ? t('accounts.connecting') : t('accounts.connect')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}