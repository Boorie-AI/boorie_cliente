// Sidebar Component - Generic sidebar for account selection

import React from 'react'
import AccountCard from './AccountCard'

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

interface SidebarProps {
  accounts: CalendarAccount[]
  selectedAccount: string | null
  onAccountSelect: (accountId: string) => void
  isLoading: boolean
  className?: string
}

const Sidebar: React.FC<SidebarProps> = ({
  accounts,
  selectedAccount,
  onAccountSelect,
  isLoading,
  className = ''
}) => {
  const connectedAccounts = accounts.filter(account => 
    account.isConnected && account.hasCalendarAccess
  )
  
  const disconnectedAccounts = accounts.filter(account => 
    !account.isConnected || !account.hasCalendarAccess
  )

  return (
    <div className={`w-72 min-w-72 bg-muted/50 border-r border-border/50 overflow-y-auto ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border/50">
        <h3 className="text-lg font-semibold text-foreground">Calendar Accounts</h3>
        {isLoading && (
          <div className="flex items-center">
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}
      </div>
      
      {/* Content */}
      <div className="p-4 space-y-4">
        {accounts.length === 0 ? (
          <EmptyAccountsState />
        ) : (
          <>
            {/* Connected Accounts */}
            {connectedAccounts.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center">
                  <h4 className="text-sm font-medium text-foreground/80">Connected ({connectedAccounts.length})</h4>
                </div>
                <div className="space-y-2">
                  {connectedAccounts.map(account => (
                    <AccountCard
                      key={account.id}
                      account={account}
                      isSelected={selectedAccount === account.id}
                      onSelect={() => onAccountSelect(account.id)}
                      isLoading={isLoading}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Disconnected Accounts */}
            {disconnectedAccounts.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center">
                  <h4 className="text-sm font-medium text-destructive/80">Needs Attention ({disconnectedAccounts.length})</h4>
                </div>
                <div className="space-y-2">
                  {disconnectedAccounts.map(account => (
                    <AccountCard
                      key={account.id}
                      account={account}
                      isSelected={false}
                      onSelect={() => {}} // Disabled for disconnected accounts
                      isLoading={false}
                      disabled={true}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// Empty state component
const EmptyAccountsState: React.FC = () => (
  <div className="flex flex-col items-center justify-center h-64 text-center">
    <div className="mb-4">
      <CalendarIcon className="w-16 h-16 text-muted-foreground/50" />
    </div>
    <div className="space-y-2">
      <h4 className="text-lg font-medium text-foreground">No Calendar Accounts</h4>
      <p className="text-sm text-muted-foreground max-w-xs">
        Connect your Microsoft or Google account to get started with calendar management.
      </p>
      <button 
        className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium text-sm"
        onClick={() => window.location.href = '/settings?tab=accounts'}
      >
        Connect Account
      </button>
    </div>
  </div>
)

// Icon components (these would typically come from an icon library)
const PlusIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
  </svg>
)

const CalendarIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
)

export default Sidebar