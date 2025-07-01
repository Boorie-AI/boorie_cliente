import { useTranslation } from 'react-i18next'

export function AccountsTab() {
  const { t } = useTranslation()

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
                <div className="flex items-center space-x-4">
                  <div className="relative">
                    <div className="relative">
                      <img src="src/assets/microsoft.png" width={'50px'} alt="" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-card-foreground text-lg mb-1">{t('accounts.microsoft365')}</h3>
                    <p className="text-sm text-muted-foreground mb-2">{t('accounts.microsoft365Desc')}</p>
                    <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                      <span className="flex items-center space-x-1">
                        <div className="w-1.5 h-1.5 bg-gray-400 rounded-full"></div>
                        <span>{t('accounts.notConnected')}</span>
                      </span>
                      <span>{t('accounts.outlook')} • {t('accounts.calendar')} • {t('accounts.onedrive')}</span>
                    </div>
                  </div>
                </div>
                <button className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors shadow-sm">
                  {t('accounts.connect')}
                </button>
              </div>
            </div>

            {/* Google Workspace */}
            <div className="group relative overflow-hidden rounded-xl border border-border bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-950/30 dark:to-orange-950/30 hover:shadow-md transition-all duration-200">
              <div className="flex items-center justify-between p-6">
                <div className="flex items-center space-x-4">
                  <div className="relative">
                    <img src="src/assets/google.png" width={'50px'} alt="" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-card-foreground text-lg mb-1">{t('accounts.googleWorkspace')}</h3>
                    <p className="text-sm text-muted-foreground mb-2">{t('accounts.googleWorkspaceDesc')}</p>
                    <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                      <span className="flex items-center space-x-1">
                        <div className="w-1.5 h-1.5 bg-gray-400 rounded-full"></div>
                        <span>{t('accounts.notConnected')}</span>
                      </span>
                      <span>{t('accounts.gmail')} • {t('accounts.calendar')} • {t('accounts.drive')}</span>
                    </div>
                  </div>
                </div>
                <button className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors shadow-sm">
                  {t('accounts.connect')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}