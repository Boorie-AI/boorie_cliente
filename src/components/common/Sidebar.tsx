// Sidebar Component - Generic sidebar for account selection

import React from 'react'
import AccountCard from './AccountCard'
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
    <div className={`sidebar ${className}`}>
      {/* Header */}
      <div className="sidebar-header">
        <h3>Calendar Accounts</h3>
        {isLoading && (
          <div className="loading-indicator">
            <div className="loading-spinner small"></div>
          </div>
        )}
      </div>
      
      {/* Content */}
      <div className="sidebar-content">
        {accounts.length === 0 ? (
          <EmptyAccountsState />
        ) : (
          <>
            {/* Connected Accounts */}
            {connectedAccounts.length > 0 && (
              <div className="account-section">
                <div className="section-header">
                  <h4>Connected ({connectedAccounts.length})</h4>
                </div>
                <div className="account-list">
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
              <div className="account-section">
                <div className="section-header">
                  <h4>Needs Attention ({disconnectedAccounts.length})</h4>
                </div>
                <div className="account-list">
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
  <div className="empty-accounts-state">
    <div className="empty-icon">
      <CalendarIcon className="w-12 h-12 text-gray-300" />
    </div>
    <div className="empty-content">
      <h4>No Calendar Accounts</h4>
      <p>Connect your Microsoft or Google account to get started with calendar management.</p>
      <button 
        className="btn btn-primary btn-sm"
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