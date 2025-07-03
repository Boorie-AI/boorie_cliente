import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useTodoStore } from '../stores/todoStore';
import InitialLoadingScreen from '../components/todo/InitialLoadingScreen';
import TodoSidebar from '../components/todo/TodoAccountSidebar';
import TodoTaskList from '../components/todo/TodoTaskList';
import ErrorBoundary from '../components/todo/ErrorBoundary';

export function TodoPanel() {
  const { t } = useTranslation();
  const {
    initialLoading,
    loadingProgress,
    syncProgress,
    error,
    authenticatedAccounts,
    lists,
    tasks,
    initializeTodoData
  } = useTodoStore();

  useEffect(() => {
    // Initialize todo data when component mounts
    console.log('TodoPanel: Initializing todo data...');
    initializeTodoData();
  }, [initializeTodoData]);

  // Debug logging
  console.log('TodoPanel render:', {
    initialLoading,
    loadingProgress,
    error,
    authenticatedAccounts: authenticatedAccounts.length,
    lists: lists.length,
    tasks: tasks.length
  });

  // Show loading screen during initial data load
  if (initialLoading) {
    return (
      <InitialLoadingScreen 
        progress={loadingProgress} 
        syncProgress={syncProgress} 
      />
    );
  }

  // Show error if initialization failed
  if (error.general) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="text-center max-w-md p-6">
          <div className="w-16 h-16 mx-auto mb-4 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-2">
            {t('todo.error.title', 'Failed to Load Todo')}
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            {error.general}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            {t('todo.error.retry', 'Retry')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="flex h-screen bg-background">
        {/* Sidebar */}
        <TodoSidebar className="flex-shrink-0" />

        {/* Main Content - Task List */}
        <TodoTaskList />
      </div>
    </ErrorBoundary>
  );
}