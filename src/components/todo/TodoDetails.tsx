import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useTodoStore } from '../../stores/todoStore';
import { format, isToday, isTomorrow, isPast } from 'date-fns';

const TodoDetails: React.FC = () => {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editPriority, setEditPriority] = useState<'low' | 'normal' | 'high'>('normal');
  const [editListId, setEditListId] = useState('');

  const {
    lists,
    tasks,
    selectedTaskId,
    loading,
    selectTask,
    updateTask,
    deleteTask,
    toggleTaskCompletion,
    toggleTaskStar
  } = useTodoStore();

  // Fix: Access task directly from store instead of using non-reactive getSelectedTask
  const task = selectedTaskId ? tasks.find(task => task.id === selectedTaskId) : null;

  useEffect(() => {
    if (task) {
      setEditTitle(task.title);
      setEditDescription(task.description || '');
      setEditDueDate(task.dueDate?.split('T')[0] || '');
      setEditPriority(task.priority || 'normal');
      setEditListId(task.listId);
    }
  }, [task]);

  if (!task) {
    return (
      <div className="h-full bg-white dark:bg-gray-800 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">📝</div>
          <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200 mb-2">
            {t('todo.details.noSelection', 'No Task Selected')}
          </h3>
          <p className="text-gray-600 dark:text-gray-400">
            {t('todo.details.noSelectionDesc', 'Select a task from the list to view details')}
          </p>
        </div>
      </div>
    );
  }

  const handleSave = async () => {
    const success = await updateTask({
      id: task.providerId,
      title: editTitle,
      description: editDescription || undefined,
      dueDate: editDueDate || undefined,
      priority: editPriority,
      provider: task.provider,
      listId: editListId !== task.listId ? editListId : undefined
    });

    if (success) {
      setIsEditing(false);
    }
  };

  const handleDelete = async () => {
    if (window.confirm(t('todo.details.deleteConfirm', 'Are you sure you want to delete this task?'))) {
      const success = await deleteTask(task.id, task.listId, task.provider);
      if (success) {
        selectTask(null);
      }
    }
  };

  const formatDueDate = (dueDate: string) => {
    try {
      const date = new Date(dueDate);
      if (isToday(date)) return t('todo.dates.today', 'Today');
      if (isTomorrow(date)) return t('todo.dates.tomorrow', 'Tomorrow');
      return format(date, 'EEEE, MMMM d, yyyy');
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
      return 'text-gray-600';
    } catch {
      return 'text-gray-600';
    }
  };

  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case 'high': return 'text-red-500 bg-red-50 dark:bg-red-900/20';
      case 'low': return 'text-blue-500 bg-blue-50 dark:bg-blue-900/20';
      default: return 'text-yellow-500 bg-yellow-50 dark:bg-yellow-900/20';
    }
  };

  const getPriorityIcon = (priority?: string) => {
    switch (priority) {
      case 'high': return '🔴';
      case 'low': return '🔵';
      default: return '🟡';
    }
  };

  const availableLists = lists.filter(l => l.provider === task.provider);

  return (
    <div className="h-full bg-white dark:bg-gray-800 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
            {t('todo.details.title', 'Task Details')}
          </h2>
          <div className="flex items-center space-x-2">
            {!isEditing && (
              <>
                <button
                  onClick={() => setIsEditing(true)}
                  className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  title={t('todo.details.edit', 'Edit Task')}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  onClick={handleDelete}
                  className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  title={t('todo.details.delete', 'Delete Task')}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </>
            )}
            <button
              onClick={() => selectTask(null)}
              className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title={t('common.close', 'Close')}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {isEditing ? (
          /* Edit Mode */
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('todo.task.title', 'Title')} *
              </label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('todo.task.description', 'Description')}
              </label>
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('todo.task.dueDate', 'Due Date')}
                </label>
                <input
                  type="date"
                  value={editDueDate}
                  onChange={(e) => setEditDueDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('todo.task.priority', 'Priority')}
                </label>
                <select
                  value={editPriority}
                  onChange={(e) => setEditPriority(e.target.value as any)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  <option value="low">{t('todo.priority.low', 'Low')}</option>
                  <option value="normal">{t('todo.priority.normal', 'Normal')}</option>
                  <option value="high">{t('todo.priority.high', 'High')}</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('todo.task.list', 'List')}
              </label>
              <select
                value={editListId}
                onChange={(e) => setEditListId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                {availableLists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => {
                  setIsEditing(false);
                  // Reset to original values
                  setEditTitle(task.title);
                  setEditDescription(task.description || '');
                  setEditDueDate(task.dueDate?.split('T')[0] || '');
                  setEditPriority(task.priority || 'normal');
                  setEditListId(task.listId);
                }}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                onClick={handleSave}
                disabled={!editTitle.trim() || loading.updating}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading.updating ? t('common.saving', 'Saving...') : t('common.save', 'Save')}
              </button>
            </div>
          </div>
        ) : (
          /* View Mode */
          <div className="space-y-6">
            {/* Task Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-3 flex-1">
                <button
                  onClick={() => toggleTaskCompletion(task.id)}
                  className={`
                    mt-1 w-6 h-6 rounded border-2 flex items-center justify-center transition-colors
                    ${task.status === 'completed' 
                      ? 'bg-green-500 border-green-500 text-white' 
                      : 'border-gray-300 dark:border-gray-500 hover:border-green-400'
                    }
                  `}
                >
                  {task.status === 'completed' && (
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
                <div className="flex-1">
                  <h1 className={`
                    text-xl font-semibold text-gray-900 dark:text-gray-100
                    ${task.status === 'completed' ? 'line-through text-gray-500' : ''}
                  `}>
                    {task.title}
                  </h1>
                </div>
              </div>
              
              <button
                onClick={() => toggleTaskStar(task.id)}
                className={`
                  p-2 rounded-lg transition-colors
                  ${task.isStarred 
                    ? 'text-yellow-500 hover:text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20' 
                    : 'text-gray-300 hover:text-yellow-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }
                `}
              >
                <svg className="w-5 h-5" fill={task.isStarred ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
              </button>
            </div>

            {/* Description */}
            {task.description && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('todo.task.description', 'Description')}
                </h3>
                <p className="text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                  {task.description}
                </p>
              </div>
            )}

            {/* Metadata */}
            <div className="space-y-4">
              {/* Due Date */}
              {task.dueDate && (
                <div className="flex items-center space-x-3">
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <div>
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {t('todo.task.dueDate', 'Due Date')}:
                    </span>
                    <span className={`ml-2 font-medium ${getDueDateColor(task.dueDate, task.status === 'completed')}`}>
                      {formatDueDate(task.dueDate)}
                    </span>
                  </div>
                </div>
              )}

              {/* Priority */}
              {task.priority && task.priority !== 'normal' && (
                <div className="flex items-center space-x-3">
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                  <div>
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {t('todo.task.priority', 'Priority')}:
                    </span>
                    <span className={`ml-2 px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(task.priority)}`}>
                      {getPriorityIcon(task.priority)} {t(`todo.priority.${task.priority}`, task.priority)}
                    </span>
                  </div>
                </div>
              )}

              {/* List */}
              <div className="flex items-center space-x-3">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <div>
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {t('todo.task.list', 'List')}:
                  </span>
                  <span className="ml-2 font-medium text-gray-800 dark:text-gray-200">
                    {task.listName}
                  </span>
                  <span className="ml-2 text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                    {task.provider === 'google' ? 'Google' : 'Microsoft'}
                  </span>
                </div>
              </div>

              {/* Completion Date */}
              {task.completedDate && (
                <div className="flex items-center space-x-3">
                  <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {t('todo.task.completedDate', 'Completed')}:
                    </span>
                    <span className="ml-2 font-medium text-green-600 dark:text-green-400">
                      {formatDueDate(task.completedDate)}
                    </span>
                  </div>
                </div>
              )}

              {/* Timestamps */}
              <div className="pt-4 border-t border-gray-200 dark:border-gray-700 space-y-2 text-xs text-gray-500 dark:text-gray-400">
                <div>
                  {t('todo.task.created', 'Created')}: {format(new Date(task.createdDate), 'MMM d, yyyy h:mm a')}
                </div>
                <div>
                  {t('todo.task.updated', 'Updated')}: {format(new Date(task.updatedDate), 'MMM d, yyyy h:mm a')}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TodoDetails;