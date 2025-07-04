// TodoListPanel Component - Shows lists and tasks for selected provider

import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTodoStore } from '../../stores/todoStore'
import { UnifiedTaskList } from '../../../electron/services/todo/todo.types'

const TodoListPanel: React.FC = () => {
  const { t } = useTranslation()
  const [showCreateListModal, setShowCreateListModal] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [expandedLists, setExpandedLists] = useState<Set<string>>(new Set())
  
  const {
    lists,
    tasks,
    filters,
    selectedList,
    loading,
    selectList,
    createList,
    deleteList,
    createTask,
    updateTask,
    deleteTask,
    toggleTaskCompletion,
    toggleTaskStar
  } = useTodoStore()

  // Filter lists based on selected provider
  const filteredLists = filters.provider === 'all' 
    ? lists 
    : lists.filter(list => list.provider === filters.provider)

  // Group lists by provider
  const googleLists = filteredLists.filter(list => list.provider === 'google')
  const microsoftLists = filteredLists.filter(list => list.provider === 'microsoft')
  const microsoftSystemLists = microsoftLists.filter(list => list.isSystem)
  const microsoftCustomLists = microsoftLists.filter(list => !list.isSystem)

  const toggleListExpanded = (listId: string) => {
    const newExpanded = new Set(expandedLists)
    if (newExpanded.has(listId)) {
      newExpanded.delete(listId)
    } else {
      newExpanded.add(listId)
    }
    setExpandedLists(newExpanded)
  }

  const handleCreateList = async () => {
    if (!newListName.trim() || filters.provider === 'all') return
    
    const success = await createList({
      name: newListName,
      provider: filters.provider as 'google' | 'microsoft'
    })
    
    if (success) {
      setNewListName('')
      setShowCreateListModal(false)
    }
  }

  const getListIcon = (list: UnifiedTaskList) => {
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
    <div className="flex-1 bg-background overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border/50">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-foreground">
              {filters.provider === 'all' 
                ? t('todo.allTasks', 'All Tasks')
                : filters.provider === 'google' 
                  ? t('todo.googleTasks', 'Google Tasks')
                  : t('todo.microsoftTodo', 'Microsoft To Do')
              }
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {filteredLists.length} {t('todo.lists', 'lists')}, {tasks.length} {t('todo.tasksLabel', 'tasks')}
            </p>
          </div>
          
          {filters.provider !== 'all' && (
            <button
              onClick={() => setShowCreateListModal(true)}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium flex items-center gap-2"
            >
              <PlusIcon className="w-4 h-4" />
              {t('todo.list.create', 'New List')}
            </button>
          )}
        </div>
      </div>

      {/* Lists */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-6">
          {/* Google Tasks Section */}
          {googleLists.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                <GoogleIcon className="w-4 h-4" />
                {t('todo.googleTasks', 'Google Tasks')}
              </h3>
              <div className="space-y-2">
                {googleLists.map(list => (
                  <ListCard
                    key={list.id}
                    list={list}
                    tasks={tasks.filter(task => task.listId === list.id)}
                    isExpanded={expandedLists.has(list.id)}
                    isSelected={selectedList === list.id}
                    onToggleExpanded={() => toggleListExpanded(list.id)}
                    onSelect={() => selectList(list.id)}
                    onDelete={list.canDelete ? () => deleteList(list.id, list.provider) : undefined}
                    onCreateTask={(title: string) => createTask({
                      title,
                      listId: list.id,
                      provider: list.provider
                    })}
                    onUpdateTask={updateTask}
                    onDeleteTask={(taskId: string) => deleteTask(taskId, list.id, list.provider)}
                    onToggleTaskCompletion={toggleTaskCompletion}
                    onToggleTaskStar={toggleTaskStar}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Microsoft To Do Section */}
          {microsoftLists.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                <MicrosoftIcon className="w-4 h-4" />
                {t('todo.microsoftTodo', 'Microsoft To Do')}
              </h3>
              
              {/* System Lists */}
              {microsoftSystemLists.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-xs font-medium text-muted-foreground mb-2 ml-2">
                    {t('todo.systemLists', 'System Lists')}
                  </h4>
                  <div className="space-y-2">
                    {microsoftSystemLists.map(list => (
                      <ListCard
                        key={list.id}
                        list={list}
                        tasks={tasks.filter(task => task.listId === list.id)}
                        isExpanded={expandedLists.has(list.id)}
                        isSelected={selectedList === list.id}
                        onToggleExpanded={() => toggleListExpanded(list.id)}
                        onSelect={() => selectList(list.id)}
                        onCreateTask={(title: string) => createTask({
                          title,
                          listId: list.id,
                          provider: list.provider
                        })}
                        onUpdateTask={updateTask}
                        onDeleteTask={(taskId: string) => deleteTask(taskId, list.id, list.provider)}
                        onToggleTaskCompletion={toggleTaskCompletion}
                        onToggleTaskStar={toggleTaskStar}
                      />
                    ))}
                  </div>
                </div>
              )}
              
              {/* Custom Lists */}
              {microsoftCustomLists.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground mb-2 ml-2">
                    {t('todo.customLists', 'Custom Lists')}
                  </h4>
                  <div className="space-y-2">
                    {microsoftCustomLists.map(list => (
                      <ListCard
                        key={list.id}
                        list={list}
                        tasks={tasks.filter(task => task.listId === list.id)}
                        isExpanded={expandedLists.has(list.id)}
                        isSelected={selectedList === list.id}
                        onToggleExpanded={() => toggleListExpanded(list.id)}
                        onSelect={() => selectList(list.id)}
                        onDelete={list.canDelete ? () => deleteList(list.id, list.provider) : undefined}
                        onCreateTask={(title: string) => createTask({
                          title,
                          listId: list.id,
                          provider: list.provider
                        })}
                        onUpdateTask={updateTask}
                        onDeleteTask={(taskId: string) => deleteTask(taskId, list.id, list.provider)}
                        onToggleTaskCompletion={toggleTaskCompletion}
                        onToggleTaskStar={toggleTaskStar}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Empty State */}
          {filteredLists.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="mb-4">
                <TaskIcon className="w-16 h-16 text-muted-foreground/30" />
              </div>
              <h3 className="text-lg font-medium text-foreground mb-2">
                {t('todo.noLists.title', 'No Lists Found')}
              </h3>
              <p className="text-sm text-muted-foreground text-center max-w-sm">
                {filters.provider === 'all' 
                  ? t('todo.noLists.allProviders', 'No task lists found across your connected accounts.')
                  : t('todo.noLists.singleProvider', 'No task lists found for this account. Create one to get started.')
                }
              </p>
              {filters.provider !== 'all' && (
                <button
                  onClick={() => setShowCreateListModal(true)}
                  className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium"
                >
                  {t('todo.list.createFirst', 'Create Your First List')}
                </button>
              )}
            </div>
          )}
        </div>
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

// List Card Component
interface ListCardProps {
  list: UnifiedTaskList
  tasks: any[]
  isExpanded: boolean
  isSelected: boolean
  onToggleExpanded: () => void
  onSelect: () => void
  onDelete?: () => void
  onCreateTask: (title: string) => void
  onUpdateTask: (task: any) => void
  onDeleteTask: (taskId: string) => void
  onToggleTaskCompletion: (taskId: string) => void
  onToggleTaskStar: (taskId: string) => void
}

const ListCard: React.FC<ListCardProps> = ({
  list,
  tasks,
  isExpanded,
  isSelected,
  onToggleExpanded,
  onSelect,
  onDelete,
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
  onToggleTaskCompletion,
  onToggleTaskStar
}) => {
  const { t } = useTranslation()
  const [isCreatingTask, setIsCreatingTask] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')

  const handleCreateTask = () => {
    if (newTaskTitle.trim()) {
      onCreateTask(newTaskTitle)
      setNewTaskTitle('')
      setIsCreatingTask(false)
    }
  }

  const getListIcon = () => {
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

  const pendingTasks = tasks.filter(t => t.status !== 'completed')
  const completedTasks = tasks.filter(t => t.status === 'completed')

  return (
    <div className={`rounded-lg border transition-colors ${
      isSelected ? 'border-primary bg-primary/5' : 'border-border hover:border-border/80'
    }`}>
      <div
        className="px-4 py-3 flex items-center justify-between cursor-pointer"
        onClick={onToggleExpanded}
      >
        <div className="flex items-center gap-3 flex-1">
          <span className="text-lg">{getListIcon()}</span>
          <div className="flex-1">
            <h4 className="font-medium text-foreground">{list.name}</h4>
            <p className="text-xs text-muted-foreground">
              {pendingTasks.length} {t('todo.active', 'active')}, {completedTasks.length} {t('todo.completed', 'completed')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {list.canDelete && onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDelete()
              }}
              className="p-1 text-muted-foreground hover:text-destructive transition-colors"
              title={t('todo.list.delete', 'Delete List')}
            >
              <TrashIcon className="w-4 h-4" />
            </button>
          )}
          <ChevronIcon className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-border/50">
          {/* Task Input */}
          <div className="p-3 border-b border-border/50">
            {isCreatingTask ? (
              <div className="flex items-center gap-2">
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
                  className="flex-1 px-3 py-1.5 text-sm border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder={t('todo.task.titlePlaceholder', 'Task title...')}
                  autoFocus
                />
                <button
                  onClick={handleCreateTask}
                  className="p-1.5 text-primary hover:bg-primary/10 rounded transition-colors"
                >
                  <CheckIcon className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    setNewTaskTitle('')
                    setIsCreatingTask(false)
                  }}
                  className="p-1.5 text-muted-foreground hover:bg-accent rounded transition-colors"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsCreatingTask(true)}
                className="w-full px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground border border-dashed border-border hover:border-primary/50 rounded transition-colors text-left"
              >
                + {t('todo.task.add', 'Add task')}
              </button>
            )}
          </div>

          {/* Tasks */}
          <div className="max-h-96 overflow-y-auto">
            {pendingTasks.length === 0 && completedTasks.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                {t('todo.noTasks', 'No tasks yet')}
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {/* Pending Tasks */}
                {pendingTasks.map(task => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    onToggleCompletion={() => onToggleTaskCompletion(task.id)}
                    onToggleStar={() => onToggleTaskStar(task.id)}
                    onDelete={() => onDeleteTask(task.id)}
                  />
                ))}
                
                {/* Completed Tasks */}
                {completedTasks.length > 0 && (
                  <>
                    <div className="px-4 py-2 bg-muted/30">
                      <span className="text-xs font-medium text-muted-foreground">
                        {t('todo.completedTasks', 'Completed')} ({completedTasks.length})
                      </span>
                    </div>
                    {completedTasks.map(task => (
                      <TaskItem
                        key={task.id}
                        task={task}
                        onToggleCompletion={() => onToggleTaskCompletion(task.id)}
                        onToggleStar={() => onToggleTaskStar(task.id)}
                        onDelete={() => onDeleteTask(task.id)}
                      />
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
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
  const isCompleted = task.status === 'completed'

  return (
    <div className={`px-4 py-2 flex items-center gap-3 group hover:bg-accent/50 transition-colors ${
      isCompleted ? 'opacity-60' : ''
    }`}>
      <button
        onClick={onToggleCompletion}
        className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
          isCompleted 
            ? 'bg-primary border-primary' 
            : 'border-border hover:border-primary'
        }`}
      >
        {isCompleted && <CheckIcon className="w-3 h-3 text-primary-foreground" />}
      </button>
      
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${isCompleted ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
          {task.title}
        </p>
        {task.dueDate && (
          <p className="text-xs text-muted-foreground">
            {new Date(task.dueDate).toLocaleDateString()}
          </p>
        )}
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onToggleStar}
          className={`p-1 rounded transition-colors ${
            task.isStarred 
              ? 'text-yellow-500 hover:text-yellow-600' 
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <StarIcon className="w-4 h-4" filled={task.isStarred} />
        </button>
        <button
          onClick={onDelete}
          className="p-1 text-muted-foreground hover:text-destructive rounded transition-colors"
        >
          <TrashIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// Icon Components
const PlusIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
)

const ChevronIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
)

const TrashIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
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

const TaskIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
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

const MicrosoftIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M11.4 24H0V12.6h11.4V24zM24 24H12.6V12.6H24V24zM11.4 11.4H0V0h11.4v11.4zM24 11.4H12.6V0H24v11.4z" fill="#00BCF2" />
  </svg>
)

export default TodoListPanel