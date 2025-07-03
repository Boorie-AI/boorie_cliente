import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTodoStore } from '../../stores/todoStore';

const TodoSidebar: React.FC = () => {
  const { t } = useTranslation();
  const [showCreateListModal, setShowCreateListModal] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [newListProvider, setNewListProvider] = useState<'google' | 'microsoft'>('google');
  
  const {
    authenticatedAccounts,
    lists,
    selectedList,
    sidebarCollapsed,
    loading,
    getListsByProvider,
    getTaskCounts,
    selectList,
    toggleSidebar,
    createList
  } = useTodoStore();

  // Debug logging
  console.log('TodoSidebar render:', {
    authenticatedAccounts: authenticatedAccounts.length,
    hasGoogle: authenticatedAccounts.some(acc => acc.type === 'google'),
    hasMicrosoft: authenticatedAccounts.some(acc => acc.type === 'microsoft'),
    googleLists: getListsByProvider('google').length,
    microsoftLists: getListsByProvider('microsoft').length,
    sidebarCollapsed
  });

  const taskCounts = getTaskCounts();
  const googleLists = getListsByProvider('google');
  const microsoftLists = getListsByProvider('microsoft');
  const microsoftSystemLists = microsoftLists.filter(list => list.isSystem);
  const microsoftCustomLists = microsoftLists.filter(list => !list.isSystem);

  const handleCreateList = async () => {
    if (!newListName.trim()) return;
    
    const success = await createList({
      name: newListName,
      provider: newListProvider
    });
    
    if (success) {
      setNewListName('');
      setShowCreateListModal(false);
    }
  };

  const getListIcon = (list: any) => {
    if (list.provider === 'google') {
      if (list.isDefault) return '📋';
      if (list.isStarred) return '⭐';
      return '📝';
    } else {
      if (list.isSystem) {
        // Microsoft system lists
        if (list.originalList?.wellknownListName === 'defaultList') return '📋';
        if (list.name.toLowerCase().includes('assigned')) return '👥';
        return '🏢';
      }
      return '📝';
    }
  };

  if (sidebarCollapsed) {
    return (
      <div className="h-full bg-white dark:bg-gray-800 p-2">
        <button
          onClick={toggleSidebar}
          className="w-full p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          title={t('todo.sidebar.expand', 'Expand Sidebar')}
        >
          <svg className="w-5 h-5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="h-full bg-white dark:bg-gray-800 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-gray-800 dark:text-gray-200">
            {t('todo.title', 'Todo')}
          </h1>
          <button
            onClick={toggleSidebar}
            className="p-1 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
            title={t('todo.sidebar.collapse', 'Collapse Sidebar')}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="bg-blue-50 dark:bg-blue-900/20 p-2 rounded-lg">
            <div className="text-blue-600 dark:text-blue-400 font-medium">{taskCounts.total}</div>
            <div className="text-blue-500 dark:text-blue-300 text-xs">{t('todo.total', 'Total')}</div>
          </div>
          <div className="bg-green-50 dark:bg-green-900/20 p-2 rounded-lg">
            <div className="text-green-600 dark:text-green-400 font-medium">{taskCounts.completed}</div>
            <div className="text-green-500 dark:text-green-300 text-xs">{t('todo.completed', 'Done')}</div>
          </div>
          <div className="bg-yellow-50 dark:bg-yellow-900/20 p-2 rounded-lg">
            <div className="text-yellow-600 dark:text-yellow-400 font-medium">{taskCounts.pending}</div>
            <div className="text-yellow-500 dark:text-yellow-300 text-xs">{t('todo.pending', 'Pending')}</div>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 p-2 rounded-lg">
            <div className="text-red-600 dark:text-red-400 font-medium">{taskCounts.overdue}</div>
            <div className="text-red-500 dark:text-red-300 text-xs">{t('todo.overdue', 'Overdue')}</div>
          </div>
        </div>
      </div>

      {/* Lists */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Google Tasks */}
        {authenticatedAccounts.some(acc => acc.type === 'google') && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                {t('todo.sidebar.googleTasks', 'Google Tasks')}
              </h2>
              <button
                onClick={() => {
                  setNewListProvider('google');
                  setShowCreateListModal(true);
                }}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                title={t('todo.list.create', 'Create List')}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
            <div className="space-y-1">
              {googleLists.map((list) => (
                <button
                  key={list.id}
                  onClick={() => selectList(list.id)}
                  className={`
                    w-full flex items-center justify-between p-2 rounded-lg transition-colors text-left
                    ${selectedList === list.id
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }
                  `}
                >
                  <div className="flex items-center space-x-2 min-w-0">
                    <span className="text-sm">{getListIcon(list)}</span>
                    <span className="text-sm font-medium truncate">{list.name}</span>
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                    {list.taskCount || 0}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Microsoft To Do */}
        {authenticatedAccounts.some(acc => acc.type === 'microsoft') && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                {t('todo.sidebar.microsoftTodo', 'Microsoft To Do')}
              </h2>
              <button
                onClick={() => {
                  setNewListProvider('microsoft');
                  setShowCreateListModal(true);
                }}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                title={t('todo.list.create', 'Create List')}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
            
            {/* System Lists */}
            {microsoftSystemLists.length > 0 && (
              <div className="mb-4">
                <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 px-2">
                  {t('todo.sidebar.systemLists', 'System Lists')}
                </h3>
                <div className="space-y-1">
                  {microsoftSystemLists.map((list) => (
                    <button
                      key={list.id}
                      onClick={() => selectList(list.id)}
                      className={`
                        w-full flex items-center justify-between p-2 rounded-lg transition-colors text-left
                        ${selectedList === list.id
                          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                        }
                      `}
                    >
                      <div className="flex items-center space-x-2 min-w-0">
                        <span className="text-sm">{getListIcon(list)}</span>
                        <span className="text-sm font-medium truncate">{list.name}</span>
                      </div>
                      <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                        {list.taskCount || 0}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            {/* Custom Lists */}
            {microsoftCustomLists.length > 0 && (
              <div>
                <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 px-2">
                  {t('todo.sidebar.customLists', 'Custom Lists')}
                </h3>
                <div className="space-y-1">
                  {microsoftCustomLists.map((list) => (
                    <button
                      key={list.id}
                      onClick={() => selectList(list.id)}
                      className={`
                        w-full flex items-center justify-between p-2 rounded-lg transition-colors text-left
                        ${selectedList === list.id
                          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                        }
                      `}
                    >
                      <div className="flex items-center space-x-2 min-w-0">
                        <span className="text-sm">{getListIcon(list)}</span>
                        <span className="text-sm font-medium truncate">{list.name}</span>
                      </div>
                      <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                        {list.taskCount || 0}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* No accounts message */}
        {authenticatedAccounts.length === 0 && (
          <div className="text-center py-8">
            <div className="text-4xl mb-4">📝</div>
            <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200 mb-2">
              {t('todo.noAccounts.title', 'No Accounts Connected')}
            </h3>
            <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
              {t('todo.noAccounts.description', 'Connect your Google or Microsoft account to get started')}
            </p>
            <button className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm">
              {t('todo.noAccounts.connect', 'Connect Account')}
            </button>
          </div>
        )}
      </div>

      {/* Create List Modal */}
      {showCreateListModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-96 max-w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">
              {t('todo.list.create', 'Create New List')}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('todo.list.name', 'List Name')}
                </label>
                <input
                  type="text"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  placeholder={t('todo.list.namePlaceholder', 'Enter list name...')}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('todo.provider', 'Provider')}
                </label>
                <select
                  value={newListProvider}
                  onChange={(e) => setNewListProvider(e.target.value as 'google' | 'microsoft')}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  <option value="google">{t('todo.provider.google', 'Google Tasks')}</option>
                  <option value="microsoft">{t('todo.provider.microsoft', 'Microsoft To Do')}</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => {
                  setShowCreateListModal(false);
                  setNewListName('');
                }}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                onClick={handleCreateList}
                disabled={!newListName.trim() || loading.creating}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading.creating ? t('common.creating', 'Creating...') : t('common.create', 'Create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TodoSidebar;