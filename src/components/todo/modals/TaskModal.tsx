// TaskModal Component - Create/Edit Task Dialog

import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useTodoStore } from '../../../stores/todoStore'

interface TaskModalProps {
  isOpen: boolean
  onClose: () => void
  mode: 'create' | 'edit'
  task?: any // Existing task for edit mode
  initialListId?: string // For create mode
  initialProvider?: 'google' | 'microsoft' // For create mode
}

const TaskModal: React.FC<TaskModalProps> = ({
  isOpen,
  onClose,
  mode,
  task,
  initialListId,
  initialProvider
}) => {
  const { t } = useTranslation()
  const {
    lists,
    createTask,
    updateTask,
    loading
  } = useTodoStore()

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    dueDate: '',
    listId: '',
    provider: 'google' as 'google' | 'microsoft',
    isStarred: false, // For Google
    isImportant: false // For Microsoft
  })

  // Initialize form data
  useEffect(() => {
    if (mode === 'edit' && task) {
      setFormData({
        title: task.title || '',
        description: task.description || '',
        dueDate: task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : '',
        listId: task.listId || '',
        provider: task.provider || 'google',
        isStarred: task.isStarred || false,
        isImportant: task.isImportant || false
      })
    } else if (mode === 'create') {
      setFormData({
        title: '',
        description: '',
        dueDate: '',
        listId: initialListId || '',
        provider: initialProvider || 'google',
        isStarred: false,
        isImportant: false
      })
    }
  }, [mode, task, initialListId, initialProvider, isOpen])

  // Get available lists for the selected provider
  const availableLists = lists.filter(list => list.provider === formData.provider)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.title.trim() || !formData.listId) {
      return
    }

    const taskData = {
      title: formData.title.trim(),
      description: formData.description.trim(),
      dueDate: formData.dueDate || undefined,
      listId: formData.listId,
      provider: formData.provider,
      ...(formData.provider === 'google' ? { isStarred: formData.isStarred } : { isImportant: formData.isImportant })
    }

    try {
      if (mode === 'create') {
        await createTask(taskData)
      } else if (mode === 'edit' && task) {
        await updateTask(task.id, taskData)
      }
      onClose()
    } catch (error) {
      console.error('Error saving task:', error)
    }
  }

  const handleClose = () => {
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-background rounded-lg p-6 w-full max-w-md mx-4 shadow-xl border border-border">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-foreground">
            {mode === 'create' ? t('todo.task.create', 'Create Task') : t('todo.task.edit', 'Edit Task')}
          </h2>
          <button
            onClick={handleClose}
            className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              {t('todo.task.title', 'Title')} *
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder={t('todo.task.titlePlaceholder', 'Enter task title...')}
              required
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              {t('todo.task.description', 'Description')}
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              placeholder={t('todo.task.descriptionPlaceholder', 'Enter task description...')}
              rows={3}
            />
          </div>

          {/* Due Date */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              {t('todo.task.dueDate', 'Due Date')}
            </label>
            <input
              type="date"
              value={formData.dueDate}
              onChange={(e) => setFormData(prev => ({ ...prev, dueDate: e.target.value }))}
              className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* List Selection */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              {t('todo.task.list', 'List')} *
            </label>
            <select
              value={formData.listId}
              onChange={(e) => setFormData(prev => ({ ...prev, listId: e.target.value }))}
              className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              required
            >
              <option value="">{t('todo.task.selectList', 'Select a list...')}</option>
              {availableLists.map(list => (
                <option key={list.id} value={list.id}>
                  {list.name}
                </option>
              ))}
            </select>
          </div>

          {/* Provider Selection (only for create mode) */}
          {mode === 'create' && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                {t('todo.task.provider', 'Provider')}
              </label>
              <select
                value={formData.provider}
                onChange={(e) => {
                  const provider = e.target.value as 'google' | 'microsoft'
                  setFormData(prev => ({ 
                    ...prev, 
                    provider,
                    listId: '', // Reset list selection when provider changes
                    isStarred: false,
                    isImportant: false
                  }))
                }}
                className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="google">Google Tasks</option>
                <option value="microsoft">Microsoft To Do</option>
              </select>
            </div>
          )}

          {/* Starred/Important Toggle */}
          <div className="flex items-center gap-3">
            {formData.provider === 'google' ? (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isStarred}
                  onChange={(e) => setFormData(prev => ({ ...prev, isStarred: e.target.checked }))}
                  className="w-4 h-4 text-primary bg-background border-border rounded focus:ring-primary"
                />
                <span className="text-sm text-foreground flex items-center gap-1">
                  <StarIcon className="w-4 h-4 text-yellow-500" filled={formData.isStarred} />
                  {t('todo.task.starred', 'Starred')}
                </span>
              </label>
            ) : (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isImportant}
                  onChange={(e) => setFormData(prev => ({ ...prev, isImportant: e.target.checked }))}
                  className="w-4 h-4 text-primary bg-background border-border rounded focus:ring-primary"
                />
                <span className="text-sm text-foreground flex items-center gap-1">
                  <ImportantIcon className="w-4 h-4 text-red-500" filled={formData.isImportant} />
                  {t('todo.task.important', 'Important')}
                </span>
              </label>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-foreground hover:bg-accent rounded-lg transition-colors"
              disabled={loading.creating || loading.updating}
            >
              {t('common.cancel', 'Cancel')}
            </button>
            <button
              type="submit"
              disabled={!formData.title.trim() || !formData.listId || loading.creating || loading.updating}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {(loading.creating || loading.updating) && (
                <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin"></div>
              )}
              {mode === 'create' 
                ? (loading.creating ? t('common.creating', 'Creating...') : t('common.create', 'Create'))
                : (loading.updating ? t('common.updating', 'Updating...') : t('common.update', 'Update'))
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Icon Components
const XIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
)

const StarIcon: React.FC<{ className?: string, filled?: boolean }> = ({ className, filled }) => (
  <svg className={className} fill={filled ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
  </svg>
)

const ImportantIcon: React.FC<{ className?: string, filled?: boolean }> = ({ className, filled }) => (
  <svg className={className} fill={filled ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
)

export default TaskModal