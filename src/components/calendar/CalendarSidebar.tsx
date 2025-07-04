// CalendarSidebar Component - Modern sidebar based on Todo design
// Simplified for calendar with account items only (no dropdowns)

import React, { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useCalendarStore } from '../../stores/calendarStore'
import '../../styles/components.css'

// Calendar account interface (matching the store type)
interface CalendarAccount {
  id: string
  provider: 'microsoft' | 'google'
  email: string
  name: string
  pictureUrl?: string
  isConnected: boolean
  hasCalendarAccess: boolean
  lastSync?: Date
  calendarCount?: number
  defaultCalendarId?: string
}

interface CalendarSidebarProps {
  className?: string
}

const CalendarSidebar: React.FC<CalendarSidebarProps> = ({ className = '' }) => {
  const { t } = useTranslation()
  
  const {
    connectedAccounts,
    selectedAccount,
    isLoading,
    errors,
    loadConnectedAccounts,
    selectAccount,
    refreshConnectedAccounts,
    clearErrors
  } = useCalendarStore()

  // Load accounts on mount
  useEffect(() => {
    loadConnectedAccounts()
  }, [loadConnectedAccounts])

  // Clear errors after a delay
  useEffect(() => {
    if (errors.accounts || errors.events) {
      const timer = setTimeout(() => {
        clearErrors()
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [errors, clearErrors])

  const handleRefresh = async () => {
    await refreshConnectedAccounts()
  }

  const handleAccountSelect = async (accountId: string) => {
    if (accountId !== selectedAccount && !isLoading.accountSelection) {
      await selectAccount(accountId)
    }
  }

  // Separate connected and disconnected accounts
  const activeAccounts = connectedAccounts.filter(acc => acc.isConnected && acc.hasCalendarAccess)
  const disconnectedAccounts = connectedAccounts.filter(acc => !acc.isConnected || !acc.hasCalendarAccess)

  return (
    <div className={`w-72 min-w-72 bg-background border-r border-border/50 overflow-y-auto ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border/50">
        <h3 className="text-lg font-semibold text-foreground">{t('calendar.title', 'Calendar')}</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={isLoading.accounts}
            className="p-1.5 rounded-md hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={t('calendar.common.refreshAccounts', 'Refresh Accounts')}
          >
            <RefreshIcon className={`w-4 h-4 text-muted-foreground hover:text-foreground transition-colors ${isLoading.accounts ? 'animate-spin' : ''}`} />
          </button>
          {isLoading.accounts && (
            <div className="flex items-center">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
          )}
        </div>
      </div>
      
      {/* Error Messages */}
      {(errors.accounts || errors.events) && (
        <div className="p-4 border-b border-border/50">
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
            <p className="text-sm text-destructive">
              {errors.accounts || errors.events}
            </p>
          </div>
        </div>
      )}
      
      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {connectedAccounts.length === 0 && !isLoading.accounts ? (
          <EmptyAccountsState />
        ) : (
          <div className="p-4 space-y-4">
            {/* Active Accounts */}
            {activeAccounts.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  {t('calendar.common.connectedSection', 'Connected')} ({activeAccounts.length})
                </h4>
                {activeAccounts.map(account => (
                  <CalendarAccountCard
                    key={account.id}
                    account={account}
                    isSelected={selectedAccount === account.id}
                    onSelect={() => handleAccountSelect(account.id)}
                    isLoading={isLoading.accountSelection}
                  />
                ))}
              </div>
            )}

            {/* Disconnected Accounts */}
            {disconnectedAccounts.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-destructive/80 uppercase tracking-wider">
                  {t('calendar.common.needsAttention', 'Needs Attention')} ({disconnectedAccounts.length})
                </h4>
                {disconnectedAccounts.map(account => (
                  <CalendarAccountCard
                    key={account.id}
                    account={account}
                    isSelected={false}
                    onSelect={() => {}}
                    isLoading={false}
                    disabled={true}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// Account Card Component
interface CalendarAccountCardProps {
  account: CalendarAccount
  isSelected: boolean
  onSelect: () => void
  isLoading: boolean
  disabled?: boolean
}

const CalendarAccountCard: React.FC<CalendarAccountCardProps> = ({
  account,
  isSelected,
  onSelect,
  isLoading,
  disabled = false
}) => {
  const { t } = useTranslation()
  
  const getProviderIcon = (provider: string) => {
    switch (provider) {
      case 'microsoft':
        return <MicrosoftIcon className="w-4 h-4" />
      case 'google':
        return <GoogleIcon className="w-4 h-4" />
      default:
        return <CalendarIcon className="w-4 h-4" />
    }
  }

  const getStatusIcon = () => {
    if (!account.isConnected || !account.hasCalendarAccess) {
      return <AlertIcon className="w-3 h-3 text-destructive" />
    }
    return <CheckIcon className="w-3 h-3 text-green-500" />
  }

  const getStatusText = () => {
    if (!account.isConnected) {
      return t('calendar.common.disconnected', 'Disconnected')
    }
    if (!account.hasCalendarAccess) {
      return t('calendar.common.noCalendarAccess', 'No Calendar Access')
    }
    return t('calendar.common.connected', 'Connected')
  }

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-lg transition-all duration-200 group ${
        disabled 
          ? 'opacity-50 cursor-not-allowed' 
          : 'cursor-pointer'
      } ${
        isSelected 
          ? 'bg-primary/10 border border-primary/20 shadow-sm' 
          : 'hover:bg-accent border border-transparent'
      }`}
      onClick={disabled ? undefined : onSelect}
      role="button"
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => {
        if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
          onSelect()
        }
      }}
    >
      {/* Avatar */}
      <div className="relative">
        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center overflow-hidden">
          {account.pictureUrl ? (
            <img 
              src={account.pictureUrl} 
              alt={account.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-sm font-medium">
              {account.name.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        {/* Provider badge */}
        <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-background rounded-full flex items-center justify-center border-2 border-border shadow-sm">
          {getProviderIcon(account.provider)}
        </div>
      </div>

      {/* Account Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-medium text-foreground truncate">
            {account.name}
          </h4>
          {isLoading && isSelected && (
            <div className="w-3 h-3 border border-primary border-t-transparent rounded-full animate-spin"></div>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">
          {account.email}
        </p>
        <div className="flex items-center gap-2 mt-1">
          {getStatusIcon()}
          <span className="text-xs text-muted-foreground">
            {getStatusText()}
          </span>
          {account.calendarCount !== undefined && account.isConnected && (
            <>
              <span className="text-xs text-muted-foreground">•</span>
              <span className="text-xs text-muted-foreground">
                {account.calendarCount} {t('calendar.common.calendarPlural', 'calendars')}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// Empty state component
const EmptyAccountsState: React.FC = () => {
  const { t } = useTranslation()
  
  return (
    <div className="flex flex-col items-center justify-center h-64 text-center p-4">
      <div className="mb-4">
        <CalendarIcon className="w-16 h-16 text-muted-foreground/50" />
      </div>
      <div className="space-y-2">
        <h4 className="text-lg font-medium text-foreground">
          {t('calendar.common.noCalendarAccountsTitle', 'No Calendar Accounts')}
        </h4>
        <p className="text-sm text-muted-foreground max-w-xs">
          {t('calendar.common.noCalendarAccountsDesc', 'Connect your Microsoft or Google account to start managing your calendar.')}
        </p>
        <button 
          className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium text-sm"
          onClick={() => window.location.href = '/settings?tab=accounts'}
        >
          {t('calendar.common.connectAccount', 'Connect Account')}
        </button>
      </div>
    </div>
  )
}

// Icon components
const RefreshIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
)

const CalendarIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
)

const MicrosoftIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M11.4 24H0V12.6h11.4V24zM24 24H12.6V12.6H24V24zM11.4 11.4H0V0h11.4v11.4zm12.6 0H12.6V0H24v11.4z"/>
  </svg>
)

const GoogleIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
  </svg>
)

const CheckIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
)

const AlertIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
)

export default CalendarSidebar