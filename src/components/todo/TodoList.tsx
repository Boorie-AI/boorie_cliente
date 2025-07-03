import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTodoStore } from '../../stores/todoStore';
import { format, isToday, isTomorrow, isPast } from 'date-fns';

const TodoList: React.FC = () => {
  const { t } = useTranslation();
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<'low' | 'normal' | 'high'>('normal');
  
  const {
    lists,
    tasks: allTasks,
    selectedList,
    filters,
    loading,
    showCompleted,
    selectTask,
    createTask,
    toggleTaskCompletion,
    toggleTaskStar,
    toggleShowCompleted,
    setFilters
  } = useTodoStore();

  const selectedListObj = lists.find(l => l.id === selectedList);
  
  // Fix: Use direct filtering instead of non-reactive computed methods
  const getFilteredTasks = () => {
    return allTasks.filter(task => {
      // Status filter
      if (filters.status === 'pending' && task.status !== 'pending') return false;
      if (filters.status === 'completed' && task.status !== 'completed') return false;
      
      // Provider filter
      if (filters.provider !== 'all' && task.provider !== filters.provider) return false;
      
      // Star filter
      if (filters.isStarred !== undefined && task.isStarred !== filters.isStarred) return false;
      
      // Search filter
      if (filters.searchQuery) {
        const query = filters.searchQuery.toLowerCase();
        const titleMatch = task.title.toLowerCase().includes(query);
        const descriptionMatch = task.description?.toLowerCase().includes(query);
        if (!titleMatch && !descriptionMatch) return false;
      }
      
      return true;
    });
  };
  
  const tasks = selectedList ? allTasks.filter(task => task.listId === selectedList) : getFilteredTasks();
  const displayTasks = showCompleted ? tasks : tasks.filter(t => t.status !== 'completed');

  const handleCreateTask = async () => {
    if (!newTaskTitle.trim() || !selectedListObj) return;
    
    const success = await createTask({
      title: newTaskTitle,
      description: newTaskDescription || undefined,
      dueDate: newTaskDueDate || undefined,
      priority: newTaskPriority,
      listId: selectedListObj.id,
      provider: selectedListObj.provider
    });
    
    if (success) {
      setNewTaskTitle('');
      setNewTaskDescription('');
      setNewTaskDueDate('');
      setNewTaskPriority('normal');
      setShowCreateTaskModal(false);
    }
  };

  const formatDueDate = (dueDate: string) => {
    try {
      const date = new Date(dueDate);
      if (isToday(date)) return t('todo.dates.today', 'Today');
      if (isTomorrow(date)) return t('todo.dates.tomorrow', 'Tomorrow');
      return format(date, 'MMM d');
    } catch {
      return dueDate;
    }
  };

  const getDueDateColor = (dueDate: string, isCompleted: boolean) => {
    if (isCompleted) return 'text-gray-400';
    try {
      const date = new Date(dueDate);
      if (isPast(date) && !isToday(date)) return 'text-red-500';
      if (isToday(date)) return 'text-orange-500';
      if (isTomorrow(date)) return 'text-yellow-500';
      return 'text-gray-500';
    } catch {
      return 'text-gray-500';
    }
  };

  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case 'high': return 'text-red-500';
      case 'low': return 'text-gray-400';
      default: return 'text-gray-500';
    }
  };

  const getPriorityIcon = (priority?: string) => {
    switch (priority) {
      case 'high': return '🔴';
      case 'low': return '🔵';
      default: return '🟡';
    }
  };

  return (
    <div className="h-full bg-white dark:bg-gray-800 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">
              {selectedListObj?.name || t('todo.allTasks', 'All Tasks')}
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {displayTasks.length} {t('todo.tasks', 'tasks')}
              {selectedListObj && (
                <span className="ml-2 text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                  {selectedListObj.provider === 'google' ? 'Google' : 'Microsoft'}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={toggleShowCompleted}
              className={`
                px-3 py-1.5 text-sm rounded-lg transition-colors
                ${showCompleted 
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' 
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }
              `}
            >
              {showCompleted ? t('todo.hideCompleted', 'Hide Done') : t('todo.showCompleted', 'Show Done')}
            </button>
            {selectedListObj && (
              <button
                onClick={() => setShowCreateTaskModal(true)}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span>{t('todo.task.create', 'Add Task')}</span>
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center space-x-4">
          <input
            type="text"
            placeholder={t('todo.search', 'Search tasks...')}
            value={filters.searchQuery || ''}
            onChange={(e) => setFilters({ searchQuery: e.target.value })}
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
          />
          <select
            value={filters.status || 'all'}
            onChange={(e) => setFilters({ status: e.target.value as any })}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
          >
            <option value="all">{t('todo.filters.all', 'All')}</option>
            <option value="pending">{t('todo.filters.pending', 'Pending')}</option>
            <option value="completed">{t('todo.filters.completed', 'Completed')}</option>
          </select>
          <button
            onClick={() => setFilters({ isStarred: filters.isStarred ? undefined : true })}
            className={`
              p-2 rounded-lg transition-colors
              ${filters.isStarred 
                ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400' 
                : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
              }
            `}
            title={t('todo.filters.starred', 'Starred only')}
          >
            <svg className="w-4 h-4" fill={filters.isStarred ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Task List */}
      <div className="flex-1 overflow-y-auto">
        {displayTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <div className="text-4xl mb-4">
              {selectedListObj ? '📝' : '🔍'}
            </div>
            <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200 mb-2">
              {filters.searchQuery 
                ? t('todo.noSearchResults', 'No tasks found')
                : selectedListObj 
                  ? t('todo.noTasks', 'No tasks yet')
                  : t('todo.selectList', 'Select a list to view tasks')
              }
            </h3>
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              {filters.searchQuery 
                ? t('todo.noSearchResultsDesc', 'Try adjusting your search or filters')
                : selectedListObj 
                  ? t('todo.noTasksDesc', 'Create your first task to get started')
                  : t('todo.selectListDesc', 'Choose a list from the sidebar')
              }
            </p>
          </div>
        ) : (
          <div className="p-4 space-y-2">
            {displayTasks.map((task) => (
              <div
                key={task.id}
                onClick={() => selectTask(task.id)}
                className="group bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-4 hover:shadow-md transition-all cursor-pointer"
              >
                <div className="flex items-start space-x-3">
                  {/* Completion Checkbox */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleTaskCompletion(task.id);
                    }}
                    className={`
                      mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors
                      ${task.status === 'completed' 
                        ? 'bg-green-500 border-green-500 text-white' 
                        : 'border-gray-300 dark:border-gray-500 hover:border-green-400'
                      }
                    `}
                  >
                    {task.status === 'completed' && (
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>

                  {/* Task Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className={`
                        font-medium text-gray-900 dark:text-gray-100 truncate
                        ${task.status === 'completed' ? 'line-through text-gray-500' : ''}
                      `}>
                        {task.title}
                      </h3>
                      <div className="flex items-center space-x-2 ml-2">
                        {/* Priority Indicator */}
                        {task.priority && task.priority !== 'normal' && (
                          <span className="text-xs" title={`Priority: ${task.priority}`}>
                            {getPriorityIcon(task.priority)}
                          </span>
                        )}
                        
                        {/* Star Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleTaskStar(task.id);
                          }}
                          className={`
                            p-1 rounded transition-colors
                            ${task.isStarred 
                              ? 'text-yellow-500 hover:text-yellow-600' 
                              : 'text-gray-300 hover:text-yellow-400'
                            }
                          `}
                        >
                          <svg className="w-4 h-4" fill={task.isStarred ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Description */}
                    {task.description && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
                        {task.description}
                      </p>
                    )}

                    {/* Metadata */}
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center space-x-4 text-xs">
                        {/* Due Date */}
                        {task.dueDate && (
                          <span className={getDueDateColor(task.dueDate, task.status === 'completed')}>
                            {formatDueDate(task.dueDate)}
                          </span>
                        )}
                        
                        {/* List Name */}
                        <span className="text-gray-500 dark:text-gray-400">
                          {task.listName}
                        </span>
                        
                        {/* Provider */}
                        <span className="text-gray-400 dark:text-gray-500">
                          {task.provider === 'google' ? 'Google' : 'Microsoft'}
                        </span>
                      </div>
                      
                      {/* Attachments indicator */}
                      {task.hasAttachments && (
                        <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                        </svg>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Task Modal */}
      {showCreateTaskModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-[500px] max-w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">
              {t('todo.task.create', 'Create New Task')}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('todo.task.title', 'Title')} *
                </label>
                <input
                  type="text"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  placeholder={t('todo.task.titlePlaceholder', 'Enter task title...')}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('todo.task.description', 'Description')}
                </label>
                <textarea
                  value={newTaskDescription}
                  onChange={(e) => setNewTaskDescription(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  placeholder={t('todo.task.descriptionPlaceholder', 'Enter task description...')}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('todo.task.dueDate', 'Due Date')}
                  </label>
                  <input
                    type="date"
                    value={newTaskDueDate}
                    onChange={(e) => setNewTaskDueDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('todo.task.priority', 'Priority')}
                  </label>
                  <select
                    value={newTaskPriority}
                    onChange={(e) => setNewTaskPriority(e.target.value as any)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  >
                    <option value="low">{t('todo.priority.low', 'Low')}</option>
                    <option value="normal">{t('todo.priority.normal', 'Normal')}</option>
                    <option value="high">{t('todo.priority.high', 'High')}</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => {
                  setShowCreateTaskModal(false);
                  setNewTaskTitle('');
                  setNewTaskDescription('');
                  setNewTaskDueDate('');
                  setNewTaskPriority('normal');
                }}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                onClick={handleCreateTask}
                disabled={!newTaskTitle.trim() || loading.creating}
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

export default TodoList;