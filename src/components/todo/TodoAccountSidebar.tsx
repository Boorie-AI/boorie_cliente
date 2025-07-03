// TodoAccountSidebar Component - Sidebar for Todo account selection using the same UI as calendar

import React from 'react'
import { useTranslation } from 'react-i18next'
import { useTodoStore } from '../../stores/todoStore'
import '../../styles/components.css'

// Todo account interface
interface TodoAccount {
  id: string
  provider: 'microsoft' | 'google'
  email: string
  name: string
  pictureUrl?: string
  isConnected: boolean
  listCount?: number
  taskCount?: number
  lastSync?: Date
}

interface TodoAccountSidebarProps {
  className?: string
}

const TodoAccountSidebar: React.FC<TodoAccountSidebarProps> = ({ className = '' }) => {
  const { t } = useTranslation()
  const {
    authenticatedAccounts,
    lists,
    tasks,
    loading,
    syncInProgress,
    syncAllTasks,
    filters,
    setFilters,
    getTaskCounts
  } = useTodoStore()

  // Convert todo providers to account format
  const accounts: TodoAccount[] = authenticatedAccounts.map(provider => ({
    id: provider.id,
    provider: provider.type,
    email: provider.email,
    name: provider.name,
    pictureUrl: undefined, // Could be added if available
    isConnected: provider.isConnected,
    listCount: lists.filter(l => l.provider === provider.type).length,
    taskCount: tasks.filter(t => t.provider === provider.type).length,
    lastSync: undefined // Could track this separately
  }))

  const selectedAccount = filters.provider !== 'all' ? filters.provider : null
  const taskCounts = getTaskCounts()

  const handleAccountSelect = (accountId: string) => {
    const account = accounts.find(a => a.id === accountId)
    if (account) {
      setFilters({ provider: account.provider })
    }
  }

  const handleRefresh = () => {
    syncAllTasks()
  }

  const handleSelectAll = () => {
    setFilters({ provider: 'all' })
  }

  return (
    <div className={`w-72 min-w-72 bg-background border-r border-border/50 overflow-y-auto ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border/50">
        <h3 className="text-lg font-semibold text-foreground">{t('todo.sidebar.todoAccounts', 'Todo Accounts')}</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={syncInProgress}
            className="p-1.5 rounded-md hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={t('todo.sidebar.syncTasks', 'Sync Tasks')}
          >
            <RefreshIcon className={`w-4 h-4 text-muted-foreground hover:text-foreground transition-colors ${syncInProgress ? 'animate-spin' : ''}`} />
          </button>
          {syncInProgress && (
            <div className="flex items-center">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
          )}
        </div>
      </div>
      
      {/* Summary Stats */}
      <div className="p-4 border-b border-border/50">
        <div 
          className={`p-3 rounded-lg cursor-pointer transition-colors ${
            filters.provider === 'all' 
              ? 'bg-primary/10 border border-primary/20' 
              : 'hover:bg-accent'
          }`}
          onClick={handleSelectAll}
        >
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-foreground">{t('todo.sidebar.allAccounts', 'All Accounts')}</h4>
            <span className="text-xs text-muted-foreground">{accounts.length}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-blue-500"></div>
              <span className="text-muted-foreground">{taskCounts.total} {t('todo.tasks', 'tasks')}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-green-500"></div>
              <span className="text-muted-foreground">{taskCounts.completed} {t('todo.done', 'done')}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
              <span className="text-muted-foreground">{taskCounts.pending} {t('todo.pending', 'pending')}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-red-500"></div>
              <span className="text-muted-foreground">{taskCounts.overdue} {t('todo.overdue', 'overdue')}</span>
            </div>
          </div>
        </div>
      </div>
      
      {/* Content */}
      <div className="p-4 space-y-4">
        {accounts.length === 0 ? (
          <EmptyAccountsState />
        ) : (
          <div className="space-y-3">
            <div className="flex items-center">
              <h4 className="text-sm font-medium text-foreground/80">{t('todo.sidebar.connectedAccounts', 'Connected Accounts')} ({accounts.length})</h4>
            </div>
            <div className="space-y-2">
              {accounts.map(account => (
                <TodoAccountCard
                  key={account.id}
                  account={account}
                  isSelected={selectedAccount === account.provider}
                  onSelect={() => handleAccountSelect(account.id)}
                  isLoading={loading.tasks}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Todo Account Card Component
interface TodoAccountCardProps {
  account: TodoAccount
  isSelected: boolean
  onSelect: () => void
  isLoading: boolean
}

const TodoAccountCard: React.FC<TodoAccountCardProps> = ({
  account,
  isSelected,
  onSelect,
  isLoading
}) => {
  const { t } = useTranslation()
  
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

  return (
    <div
      className={`account-card ${isSelected ? 'selected' : ''} ${isLoading ? 'loading' : ''}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          onSelect()
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
        {/* Account Stats */}
        <div className="account-stats">
          <div className="stat">
            <ListIcon className="w-3 h-3" />
            <span>{account.listCount || 0} {t('todo.lists', 'lists')}</span>
          </div>
          <div className="stat">
            <TaskIcon className="w-3 h-3" />
            <span>{account.taskCount || 0} {t('todo.tasks', 'tasks')}</span>
          </div>
        </div>

        {/* Loading indicator for selected account */}
        {isSelected && isLoading && (
          <div className="loading-indicator">
            <div className="loading-spinner xs"></div>
            <span>{t('todo.loadingTasks', 'Loading tasks...')}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// Empty state component
const EmptyAccountsState: React.FC = () => {
  const { t } = useTranslation()
  
  return (
    <div className="flex flex-col items-center justify-center h-64 text-center">
      <div className="mb-4">
        <TaskIcon className="w-16 h-16 text-muted-foreground/50" />
      </div>
      <div className="space-y-2">
        <h4 className="text-lg font-medium text-foreground">{t('todo.noAccounts.title', 'No Todo Accounts')}</h4>
        <p className="text-sm text-muted-foreground max-w-xs">
          {t('todo.noAccounts.description', 'Connect your Google or Microsoft account to sync your tasks.')}
        </p>
        <button 
          className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium text-sm"
          onClick={() => window.location.href = '/settings?tab=accounts'}
        >
          {t('todo.noAccounts.connect', 'Connect Account')}
        </button>
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

const RefreshIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
)

const ListIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
  </svg>
)

const TaskIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
  </svg>
)

export default TodoAccountSidebar