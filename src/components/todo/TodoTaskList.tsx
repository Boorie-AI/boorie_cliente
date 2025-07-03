// TodoTaskList Component - Shows tasks for the selected list

import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTodoStore } from '../../stores/todoStore'

const TodoTaskList: React.FC = () => {
  const { t } = useTranslation()
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [isCreatingTask, setIsCreatingTask] = useState(false)
  
  const {
    lists,
    tasks,
    selectedList,
    loading,
    createTask,
    updateTask,
    deleteTask,
    toggleTaskCompletion,
    toggleTaskStar,
    getTasksByList
  } = useTodoStore()

  const currentList = lists.find(list => list.id === selectedList)
  const listTasks = selectedList ? getTasksByList(selectedList) : []
  const pendingTasks = listTasks.filter(task => task.status !== 'completed')
  const completedTasks = listTasks.filter(task => task.status === 'completed')

  const handleCreateTask = async () => {
    if (!newTaskTitle.trim() || !currentList) return
    
    const success = await createTask({
      title: newTaskTitle,
      listId: currentList.id,
      provider: currentList.provider
    })
    
    if (success) {
      setNewTaskTitle('')
      setIsCreatingTask(false)
    }
  }

  if (!selectedList || !currentList) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-center">
          <TaskIcon className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">
            {t('todo.selectList', 'Select a list')}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t('todo.selectListDescription', 'Choose a list from the sidebar to view and manage your tasks')}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 bg-background flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{getListIcon(currentList)}</span>
            <div>
              <h1 className="text-xl font-semibold text-foreground">{currentList.name}</h1>
              <p className="text-sm text-muted-foreground">
                {pendingTasks.length} {t('todo.pending', 'pending')}, {completedTasks.length} {t('todo.completed', 'completed')}
              </p>
            </div>
          </div>
          
          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsCreatingTask(true)}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium flex items-center gap-2"
            >
              <PlusIcon className="w-4 h-4" />
              {t('todo.task.add', 'Add Task')}
            </button>
          </div>
        </div>
      </div>

      {/* Task Input */}
      {isCreatingTask && (
        <div className="px-6 py-4 border-b border-border/50 bg-muted/20">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 rounded border-2 border-border"></div>
            <input
              type="text"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateTask()
                if (e.key === 'Escape') {
                  setNewTaskTitle('')
                  setIsCreatingTask(false)
                }
              }}
              className="flex-1 px-3 py-2 text-sm border border-border rounded bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder={t('todo.task.titlePlaceholder', 'What needs to be done?')}
              autoFocus
            />
            <button
              onClick={handleCreateTask}
              disabled={!newTaskTitle.trim() || loading.creating}
              className="p-2 text-primary hover:bg-primary/10 rounded transition-colors disabled:opacity-50"
            >
              <CheckIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                setNewTaskTitle('')
                setIsCreatingTask(false)
              }}
              className="p-2 text-muted-foreground hover:bg-accent rounded transition-colors"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Task List */}
      <div className="flex-1 overflow-y-auto">
        {listTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <TaskIcon className="w-16 h-16 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">
              {t('todo.noTasks', 'No tasks yet')}
            </h3>
            <p className="text-sm text-muted-foreground text-center mb-4">
              {t('todo.noTasksDescription', 'Add your first task to get started')}
            </p>
            <button
              onClick={() => setIsCreatingTask(true)}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium"
            >
              {t('todo.task.addFirst', 'Add your first task')}
            </button>
          </div>
        ) : (
          <div className="space-y-1">
            {/* Pending Tasks */}
            {pendingTasks.map(task => (
              <TaskItem
                key={task.id}
                task={task}
                onToggleCompletion={() => toggleTaskCompletion(task.id)}
                onToggleStar={() => toggleTaskStar(task.id)}
                onDelete={() => deleteTask(task.id, currentList.id, currentList.provider)}
              />
            ))}
            
            {/* Completed Tasks */}
            {completedTasks.length > 0 && (
              <>
                <div className="px-6 py-3 bg-muted/30 mt-4">
                  <span className="text-sm font-medium text-muted-foreground">
                    {t('todo.completed', 'Completed')} ({completedTasks.length})
                  </span>
                </div>
                <div className="space-y-1">
                  {completedTasks.map(task => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      onToggleCompletion={() => toggleTaskCompletion(task.id)}
                      onToggleStar={() => toggleTaskStar(task.id)}
                      onDelete={() => deleteTask(task.id, currentList.id, currentList.provider)}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// Task Item Component
interface TaskItemProps {
  task: any
  onToggleCompletion: () => void
  onToggleStar: () => void
  onDelete: () => void
}

const TaskItem: React.FC<TaskItemProps> = ({
  task,
  onToggleCompletion,
  onToggleStar,
  onDelete
}) => {
  const { t } = useTranslation()
  const isCompleted = task.status === 'completed'
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && !isCompleted

  return (
    <div className={`px-6 py-4 flex items-center gap-4 group hover:bg-accent/50 transition-all duration-200 shadow-sm hover:shadow-md rounded-lg mx-2 my-1 bg-background hover:bg-accent/30 border border-border/30 ${
      isCompleted ? 'opacity-60' : ''
    }`}>
      {/* Checkbox */}
      <button
        onClick={onToggleCompletion}
        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-200 shadow-sm flex-shrink-0 ${
          isCompleted 
            ? 'bg-primary border-primary shadow-md' 
            : 'border-muted-foreground/60 hover:border-primary bg-background hover:shadow-md'
        }`}
      >
        {isCompleted && <CheckIcon className="w-3.5 h-3.5 text-primary-foreground" />}
      </button>
      
      {/* Task Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={`text-sm ${isCompleted ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
            {task.title}
          </p>
          {task.isStarred && (
            <StarIcon className="w-4 h-4 text-yellow-500" filled />
          )}
        </div>
        
        {task.description && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {task.description}
          </p>
        )}
        
        {task.dueDate && (
          <div className="flex items-center gap-1 mt-2">
            <CalendarIcon className="w-3 h-3 text-muted-foreground" />
            <span className={`text-xs ${
              isOverdue ? 'text-destructive' : 'text-muted-foreground'
            }`}>
              {formatDate(task.dueDate)}
            </span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onToggleStar}
          className={`p-2 rounded-full transition-all duration-200 ${
            task.isStarred 
              ? 'text-yellow-500 hover:text-yellow-600 bg-yellow-50 hover:bg-yellow-100' 
              : 'text-muted-foreground hover:text-foreground hover:bg-accent'
          }`}
          title={task.isStarred ? t('todo.task.unstar', 'Remove star') : t('todo.task.star', 'Add star')}
        >
          <StarIcon className="w-4 h-4" filled={task.isStarred} />
        </button>
        <button
          onClick={onDelete}
          className="p-2 text-muted-foreground hover:text-destructive rounded-full transition-all duration-200 hover:bg-destructive/10"
          title={t('todo.task.delete', 'Delete task')}
        >
          <TrashIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// Helper functions
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

const formatDate = (dateString: string) => {
  const date = new Date(dateString)
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  
  const isToday = date.toDateString() === today.toDateString()
  const isTomorrow = date.toDateString() === tomorrow.toDateString()
  
  if (isToday) return 'Today'
  if (isTomorrow) return 'Tomorrow'
  
  return date.toLocaleDateString()
}

// Icon Components
const PlusIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
)

const CheckIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
)

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

const TrashIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
)

const TaskIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
  </svg>
)

const CalendarIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
)

export default TodoTaskList