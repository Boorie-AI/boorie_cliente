// TodoSidebar Component - Sidebar with accounts and their lists

import React, { useState, useEffect, useRef } from 'react'
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

interface TodoSidebarProps {
  className?: string
}

const TodoSidebar: React.FC<TodoSidebarProps> = ({ className = '' }) => {
  const { t } = useTranslation()
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [showCreateListModal, setShowCreateListModal] = useState(false)
  const [newListName, setNewListName] = useState('')
  const hasInitializedRef = useRef(false)
  
  const {
    authenticatedAccounts,
    lists,
    tasks,
    loading,
    syncInProgress,
    selectedList,
    syncAllTasks,
    selectList,
    createList,
    deleteList,
    getTaskCounts
  } = useTodoStore()

  // Convert todo providers to account format
  const accounts: TodoAccount[] = authenticatedAccounts.map(provider => ({
    id: provider.id,
    provider: provider.type,
    email: provider.email,
    name: provider.name,
    pictureUrl: undefined,
    isConnected: provider.isConnected,
    listCount: lists.filter(l => l.provider === provider.type).length,
    taskCount: tasks.filter(t => t.provider === provider.type).length,
    lastSync: undefined
  }))

  const taskCounts = getTaskCounts()

  // Auto-initialize with first account if none selected
  useEffect(() => {
    if (!hasInitializedRef.current && accounts.length > 0 && lists.length > 0 && !selectedAccountId) {
      const firstAccount = accounts[0]
      setSelectedAccountId(firstAccount.id)
      hasInitializedRef.current = true
      
      // Auto-select default list for first account
      setTimeout(() => {
        const accountLists = lists.filter(list => list.provider === firstAccount.provider)
        let defaultList = null
        
        if (firstAccount.provider === 'google') {
          defaultList = accountLists.find(list => 
            list.name === 'My Tasks' || 
            list.isDefault || 
            list.name.toLowerCase().includes('tasks')
          ) || accountLists[0]
        } else if (firstAccount.provider === 'microsoft') {
          defaultList = accountLists.find(list => 
            list.name === 'Tasks' || 
            list.wellknownListName === 'defaultList' ||
            list.name.toLowerCase().includes('tasks')
          ) || accountLists[0]
        }
        
        if (defaultList) {
          selectList(defaultList.id)
        }
      }, 0)
    }
  }, [accounts.length, lists.length])

  // Get lists for selected account
  const getListsForAccount = (accountId: string) => {
    const account = accounts.find(a => a.id === accountId)
    if (!account) return []
    return lists.filter(list => list.provider === account.provider)
  }

  const selectedAccount = selectedAccountId ? accounts.find(a => a.id === selectedAccountId) : null
  const visibleLists = selectedAccountId ? getListsForAccount(selectedAccountId) : []

  const handleAccountSelect = (accountId: string) => {
    if (selectedAccountId === accountId) {
      setSelectedAccountId(null) // Collapse if same account clicked
      selectList('') // Clear selected list
    } else {
      setSelectedAccountId(accountId)
      
      // Auto-select default list for the account
      const account = accounts.find(a => a.id === accountId)
      if (account) {
        const accountLists = lists.filter(list => list.provider === account.provider)
        let defaultList = null
        
        if (account.provider === 'google') {
          // For Google, find "My Tasks" or any default list
          defaultList = accountLists.find(list => 
            list.name === 'My Tasks' || 
            list.isDefault || 
            list.name.toLowerCase().includes('tasks')
          ) || accountLists[0]
        } else if (account.provider === 'microsoft') {
          // For Microsoft, find "Tasks" list or default list
          defaultList = accountLists.find(list => 
            list.name === 'Tasks' || 
            list.wellknownListName === 'defaultList' ||
            list.name.toLowerCase().includes('tasks')
          ) || accountLists[0]
        }
        
        if (defaultList) {
          selectList(defaultList.id)
        }
      }
    }
  }

  const handleListSelect = (listId: string) => {
    selectList(listId)
  }

  const handleCreateList = async () => {
    if (!newListName.trim() || !selectedAccount) return
    
    const success = await createList({
      name: newListName,
      provider: selectedAccount.provider
    })
    
    if (success) {
      setNewListName('')
      setShowCreateListModal(false)
    }
  }

  const handleRefresh = () => {
    syncAllTasks()
  }

  const getListIcon = (list: any) => {
    if (list.provider === 'google') {
      if (list.isDefault) return '📋'
      return '📝'
    } else {
      if (list.isSystem) {
        if (list.name.toLowerCase().includes('my tasks')) return '📋'
        if (list.name.toLowerCase().includes('assigned')) return '👥'
        if (list.name.toLowerCase().includes('flagged')) return '🚩'
        return '🏢'
      }
      return '📝'
    }
  }

  return (
    <div className={`w-72 min-w-72 bg-background border-r border-border/50 overflow-y-auto ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border/50">
        <h3 className="text-lg font-semibold text-foreground">{t('todo.title', 'Todo')}</h3>
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
        <div className="p-3 rounded-lg bg-muted/30">
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
      <div className="flex-1 overflow-y-auto">
        {accounts.length === 0 ? (
          <EmptyAccountsState />
        ) : (
          <div className="p-4 space-y-4">
            {/* Accounts */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                {t('todo.accounts', 'Accounts')}
              </h4>
              {accounts.map(account => (
                <div key={account.id}>
                  <TodoAccountCard
                    account={account}
                    isSelected={selectedAccountId === account.id}
                    isExpanded={selectedAccountId === account.id}
                    onSelect={() => handleAccountSelect(account.id)}
                    isLoading={loading.tasks}
                  />
                  
                  {/* Lists for selected account */}
                  {selectedAccountId === account.id && visibleLists.length > 0 && (
                    <div className="ml-4 mt-2 space-y-1">
                      {visibleLists.map(list => (
                        <div
                          key={list.id}
                          className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${
                            selectedList === list.id 
                              ? 'bg-primary/10 text-primary border border-primary/20' 
                              : 'hover:bg-accent text-foreground'
                          }`}
                          onClick={() => handleListSelect(list.id)}
                        >
                          <span className="text-sm">{getListIcon(list)}</span>
                          <span className="text-sm font-medium flex-1 truncate">{list.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {tasks.filter(t => t.listId === list.id).length}
                          </span>
                          {list.canDelete && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                deleteList(list.id, list.provider)
                              }}
                              className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <TrashIcon className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      ))}
                      
                      {/* Add List Button */}
                      <button
                        onClick={() => setShowCreateListModal(true)}
                        className="w-full flex items-center gap-2 p-2 text-xs text-muted-foreground hover:text-foreground border border-dashed border-border hover:border-primary/50 rounded transition-colors"
                      >
                        <PlusIcon className="w-3 h-3" />
                        {t('todo.list.add', 'Add list')}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Create List Modal */}
      {showCreateListModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-background rounded-lg p-6 w-96 max-w-full mx-4 shadow-xl border border-border">
            <h3 className="text-lg font-semibold text-foreground mb-4">
              {t('todo.list.create', 'Create New List')}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  {t('todo.list.name', 'List Name')}
                </label>
                <input
                  type="text"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder={t('todo.list.namePlaceholder', 'Enter list name...')}
                  autoFocus
                />
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => {
                  setShowCreateListModal(false)
                  setNewListName('')
                }}
                className="px-4 py-2 text-foreground hover:bg-accent rounded-lg transition-colors"
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                onClick={handleCreateList}
                disabled={!newListName.trim() || loading.creating}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading.creating ? t('common.creating', 'Creating...') : t('common.create', 'Create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Todo Account Card Component
interface TodoAccountCardProps {
  account: TodoAccount
  isSelected: boolean
  isExpanded: boolean
  onSelect: () => void
  isLoading: boolean
}

const TodoAccountCard: React.FC<TodoAccountCardProps> = ({
  account,
  isSelected,
  isExpanded,
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
      className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors group ${
        isSelected 
          ? 'bg-primary/10 border border-primary/20' 
          : 'hover:bg-accent border border-transparent'
      }`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          onSelect()
        }
      }}
    >
      {/* Avatar */}
      <div className="relative">
        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
          <span className="text-sm font-medium">
            {account.name.charAt(0).toUpperCase()}
          </span>
        </div>
        {/* Provider badge */}
        <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-background rounded-full flex items-center justify-center border border-border">
          {getProviderIcon(account.provider)}
        </div>
      </div>

      {/* Account Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-medium text-foreground truncate">
            {account.name}
          </h4>
          <ChevronIcon className={`w-3 h-3 text-muted-foreground transition-transform ${
            isExpanded ? 'rotate-180' : ''
          }`} />
        </div>
        <p className="text-xs text-muted-foreground truncate">
          {account.listCount || 0} lists, {account.taskCount || 0} tasks
        </p>
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

const ChevronIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
)

const PlusIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
)

const TrashIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
)

export default TodoSidebar