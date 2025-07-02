// Account Card Component - Display individual account information

import React from 'react'
import '../../styles/components.css';
import '../../styles/modals.css';
import '../../styles/recurrence.css';

// Import types from the electron calendar types
declare global {
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
}

interface AccountCardProps {
  account: CalendarAccount
  isSelected: boolean
  onSelect: () => void
  isLoading: boolean
  disabled?: boolean
}

const AccountCard: React.FC<AccountCardProps> = ({
  account,
  isSelected,
  onSelect,
  isLoading,
  disabled = false
}) => {
  const getProviderIcon = (provider: string) => {
    switch (provider) {
      case 'microsoft':
        return <MicrosoftIcon className="w-4 h-4" />
      case 'google':
        return <GoogleIcon className="w-4 h-4" />
      default:
        return <AccountIcon className="w-4 h-4" />
    }
  }

  const getStatusColor = (account: CalendarAccount) => {
    if (!account.isConnected) return 'text-red-500'
    if (!account.hasCalendarAccess) return 'text-yellow-500'
    return 'text-green-500'
  }

  const getStatusIcon = (account: CalendarAccount) => {
    if (!account.isConnected) {
      return <DisconnectedIcon className="w-4 h-4 text-red-500" />
    }
    if (!account.hasCalendarAccess) {
      return <WarningIcon className="w-4 h-4 text-yellow-500" />
    }
    return <ConnectedIcon className="w-4 h-4 text-green-500" />
  }

  const formatLastSync = (lastSync: Date | undefined) => {
    if (!lastSync) return 'Never'

    const now = new Date()
    const diffMs = now.getTime() - lastSync.getTime()
    const diffMins = Math.floor(diffMs / 60000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`

    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`

    const diffDays = Math.floor(diffHours / 24)
    return `${diffDays}d ago`
  }

  const handleClick = () => {
    if (!disabled && account.isConnected && account.hasCalendarAccess) {
      onSelect()
    }
  }

  return (
    <div
      className={`account-card ${isSelected ? 'selected' : ''} ${disabled ? 'disabled' : ''} ${isLoading ? 'loading' : ''}`}
      onClick={handleClick}
      role={disabled ? undefined : "button"}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
          handleClick()
        }
      }}
    >
      {/* Header */}
      <div className="account-card-header">
        <div className="account-avatar">
          {account.pictureUrl ? (
            <img
              src={account.pictureUrl}
              alt={account.name}
              className="avatar-image"
              onError={(e) => {
                // Fallback to initials if image fails to load
                const target = e.target as HTMLImageElement
                target.style.display = 'none'
                target.nextElementSibling?.classList.remove('hidden')
              }}
            />
          ) : null}
          <div className={`avatar-placeholder ${account.pictureUrl ? 'hidden' : ''}`}>
            {account.name.charAt(0).toUpperCase()}
          </div>

          {/* Provider badge */}
          <div className="provider-badge">
            {getProviderIcon(account.provider)}
          </div>
        </div>

        <div className="account-info">
          <h4 className="account-name" title={account.name}>
            {account.name}
          </h4>
          <p className="account-email" title={account.email}>
            {account.email}
          </p>
        </div>
      </div>

      {/* Body - Account Details */}
      <div className="account-card-body">
        {/* Connection Status */}
        <div className="status-info">
          <span className={`status-text ${getStatusColor(account)}`}>
            {!account.isConnected
              ? 'Disconnected'
              : !account.hasCalendarAccess
                ? 'No Calendar Access'
                : 'Connected'
            }
          </span>
        </div>

        {/* Account Stats */}
        {account.isConnected && account.hasCalendarAccess && (
          <div className="account-stats">
            {account.calendarCount !== undefined && (
              <div className="stat">
                <CalendarIcon className="w-3 h-3" />
                <span>{account.calendarCount} calendar{account.calendarCount !== 1 ? 's' : ''}</span>
              </div>
            )}
          </div>
        )}

        {/* Loading indicator for selected account */}
        {isSelected && isLoading && (
          <div className="loading-indicator">
            <div className="loading-spinner xs"></div>
            <span>Loading events...</span>
          </div>
        )}

        {/* Action hint for disconnected accounts */}
        {(!account.isConnected || !account.hasCalendarAccess) && (
          <div className="action-hint">
            <button
              className="btn btn-xs btn-outline"
              onClick={(e) => {
                e.stopPropagation()
                window.location.href = '/settings?tab=accounts'
              }}
            >
              Fix Connection
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// Icon components
const MicrosoftIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M11.4 24H0V12.6h11.4V24zM24 24H12.6V12.6H24V24zM11.4 11.4H0V0h11.4v11.4zM24 11.4H12.6V0H24v11.4z" fill="#00BCF2" />
  </svg>
)

const GoogleIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
)

const AccountIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
)

const ConnectedIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)

const DisconnectedIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)

const WarningIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
  </svg>
)

const CalendarIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
)

const ClockIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)

export default AccountCard