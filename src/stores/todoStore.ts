import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { 
  TodoProvider, 
  UnifiedTask, 
  UnifiedTaskList, 
  TaskFilters, 
  LoadingState, 
  ErrorState, 
  TodoInitializationData,
  TaskCreateRequest,
  TaskUpdateRequest,
  ListCreateRequest,
  ListUpdateRequest,
  TodoOperationResult,
  SyncProgress,
  TodoMetrics
} from '../../electron/services/todo/todo.types';

interface TodoStore {
  // Authentication state
  authenticatedAccounts: TodoProvider[];
  accountsLoading: boolean;
  
  // Data state
  lists: UnifiedTaskList[];
  tasks: UnifiedTask[];
  selectedList: string | null;
  filters: TaskFilters;
  metrics: TodoMetrics | null;
  
  // Loading states
  initialLoading: boolean;
  loadingProgress: number; // 0-100 for progress bar
  loading: LoadingState;
  error: ErrorState;
  
  // Sync state
  lastSyncTime: number;
  syncInProgress: boolean;
  syncProgress: SyncProgress | null;
  
  // UI state
  sidebarCollapsed: boolean;
  selectedTaskId: string | null;
  showCompleted: boolean;
  
  // Actions
  initializeTodoData: () => Promise<void>;
  setLoadingProgress: (progress: number) => void;
  
  // Account actions
  refreshAccounts: () => Promise<void>;
  
  // List actions
  createList: (request: ListCreateRequest) => Promise<boolean>;
  updateList: (request: ListUpdateRequest) => Promise<boolean>;
  deleteList: (listId: string, provider: 'google' | 'microsoft') => Promise<boolean>;
  selectList: (listId: string | null) => void;
  
  // Task actions
  createTask: (request: TaskCreateRequest) => Promise<boolean>;
  updateTask: (request: TaskUpdateRequest) => Promise<boolean>;
  deleteTask: (taskId: string, listId: string, provider: 'google' | 'microsoft') => Promise<boolean>;
  toggleTaskCompletion: (taskId: string) => Promise<boolean>;
  toggleTaskStar: (taskId: string) => Promise<boolean>;
  
  // Filter actions
  setFilters: (filters: Partial<TaskFilters>) => void;
  clearFilters: () => void;
  
  // Sync actions
  syncAllTasks: () => Promise<boolean>;
  
  // UI actions
  toggleSidebar: () => void;
  selectTask: (taskId: string | null) => void;
  toggleShowCompleted: () => void;
  
  // Computed getters
  getFilteredTasks: () => UnifiedTask[];
  getListsByProvider: (provider: 'google' | 'microsoft') => UnifiedTaskList[];
  getTasksByList: (listId: string) => UnifiedTask[];
  getSelectedTask: () => UnifiedTask | null;
  getTaskCounts: () => {
    total: number;
    completed: number;
    pending: number;
    overdue: number;
  };
}

export const useTodoStore = create<TodoStore>()(
  devtools(
    (set, get) => ({
      // Initial state
      authenticatedAccounts: [],
      accountsLoading: false,
      lists: [],
      tasks: [],
      selectedList: null,
      filters: {
        status: 'all',
        provider: 'all',
        isStarred: undefined,
        searchQuery: ''
      },
      metrics: null,
      initialLoading: false,
      loadingProgress: 0,
      loading: {
        accounts: false,
        lists: false,
        tasks: false,
        creating: false,
        updating: false,
        deleting: false
      },
      error: {},
      lastSyncTime: 0,
      syncInProgress: false,
      syncProgress: null,
      sidebarCollapsed: false,
      selectedTaskId: null,
      showCompleted: true,

      // Actions
      initializeTodoData: async () => {
        console.log('TodoStore: Starting initialization...');
        set({ initialLoading: true, loadingProgress: 0, error: {} });
        
        try {
          // Listen for progress updates
          const handleProgress = (progress: SyncProgress) => {
            set({ 
              loadingProgress: progress.progress,
              syncProgress: progress 
            });
          };
          
          // Subscribe to progress events
          window.electronAPI.on('todo:sync-progress', handleProgress);
          
          const result: TodoOperationResult<TodoInitializationData> = 
            await window.electronAPI.todo.initializeData();
          
          console.log('TodoStore: Initialization result:', result);
          
          if (result.success && result.data) {
            console.log('TodoStore: Setting data - accounts:', result.data.providers.length);
            set({
              authenticatedAccounts: result.data.providers,
              lists: result.data.lists,
              tasks: result.data.tasks,
              error: result.data.errors,
              lastSyncTime: Date.now(),
              initialLoading: false,
              loadingProgress: 100
            });
          } else {
            set({
              error: { general: result.error || 'Failed to initialize todo data' },
              initialLoading: false,
              loadingProgress: 0
            });
          }
          
          // Cleanup progress listener
          window.electronAPI.removeListener('todo:sync-progress', handleProgress);
          
        } catch (error) {
          console.error('Error initializing todo data:', error);
          set({
            error: { general: 'Failed to initialize todo data' },
            initialLoading: false,
            loadingProgress: 0
          });
        }
      },

      setLoadingProgress: (progress: number) => {
        set({ loadingProgress: progress });
      },

      // Account actions
      refreshAccounts: async () => {
        set({ accountsLoading: true });
        try {
          const result = await window.electronAPI.todo.getAuthenticatedAccounts();
          if (result.success && result.data) {
            set({ authenticatedAccounts: result.data });
          }
        } catch (error) {
          console.error('Error refreshing accounts:', error);
        } finally {
          set({ accountsLoading: false });
        }
      },

      // List actions
      createList: async (request: ListCreateRequest) => {
        set({ loading: { ...get().loading, creating: true } });
        try {
          const result = request.provider === 'google' 
            ? await window.electronAPI.todo.google.createList(request)
            : await window.electronAPI.todo.microsoft.createList(request);
          
          if (result.success && result.data) {
            // Add to local state
            const newList: UnifiedTaskList = {
              id: `${request.provider}-${result.data.id}`,
              name: request.name,
              provider: request.provider,
              providerId: result.data.id,
              canEdit: true,
              canDelete: true,
              taskCount: 0,
              originalList: result.data
            };
            
            set({ lists: [...get().lists, newList] });
            return true;
          } else {
            set({ error: { ...get().error, operation: result.error } });
            return false;
          }
        } catch (error) {
          console.error('Error creating list:', error);
          set({ error: { ...get().error, operation: 'Failed to create list' } });
          return false;
        } finally {
          set({ loading: { ...get().loading, creating: false } });
        }
      },

      updateList: async (request: ListUpdateRequest) => {
        set({ loading: { ...get().loading, updating: true } });
        try {
          const result = request.provider === 'google' 
            ? await window.electronAPI.todo.google.updateList(request)
            : await window.electronAPI.todo.microsoft.updateList(request);
          
          if (result.success) {
            // Update local state
            const lists = get().lists.map(list => 
              list.id === `${request.provider}-${request.id}` 
                ? { ...list, name: request.name }
                : list
            );
            set({ lists });
            return true;
          } else {
            set({ error: { ...get().error, operation: result.error } });
            return false;
          }
        } catch (error) {
          console.error('Error updating list:', error);
          set({ error: { ...get().error, operation: 'Failed to update list' } });
          return false;
        } finally {
          set({ loading: { ...get().loading, updating: false } });
        }
      },

      deleteList: async (listId: string, provider: 'google' | 'microsoft') => {
        set({ loading: { ...get().loading, deleting: true } });
        try {
          const list = get().lists.find(l => l.id === listId);
          if (!list) return false;
          
          const result = provider === 'google' 
            ? await window.electronAPI.todo.google.deleteList(list.providerId)
            : await window.electronAPI.todo.microsoft.deleteList(list.providerId);
          
          if (result.success) {
            // Remove from local state
            const lists = get().lists.filter(l => l.id !== listId);
            const tasks = get().tasks.filter(t => t.listId !== listId);
            set({ lists, tasks });
            
            // Clear selection if deleted list was selected
            if (get().selectedList === listId) {
              set({ selectedList: null });
            }
            
            return true;
          } else {
            set({ error: { ...get().error, operation: result.error } });
            return false;
          }
        } catch (error) {
          console.error('Error deleting list:', error);
          set({ error: { ...get().error, operation: 'Failed to delete list' } });
          return false;
        } finally {
          set({ loading: { ...get().loading, deleting: false } });
        }
      },

      selectList: (listId: string | null) => {
        set({ selectedList: listId });
      },

      // Task actions
      createTask: async (request: TaskCreateRequest) => {
        set({ loading: { ...get().loading, creating: true } });
        try {
          const result = request.provider === 'google' 
            ? await window.electronAPI.todo.google.createTask(request)
            : await window.electronAPI.todo.microsoft.createTask(request);
          
          if (result.success && result.data) {
            // Add to local state
            const list = get().lists.find(l => l.id === request.listId);
            if (list) {
              const newTask: UnifiedTask = {
                id: `${request.provider}-${result.data.id}`,
                title: request.title,
                description: request.description,
                status: 'pending',
                dueDate: request.dueDate,
                createdDate: new Date().toISOString(),
                updatedDate: new Date().toISOString(),
                provider: request.provider,
                providerId: result.data.id,
                listId: request.listId,
                listName: list.name,
                priority: request.priority,
                originalTask: result.data
              };
              
              set({ tasks: [...get().tasks, newTask] });
            }
            return true;
          } else {
            set({ error: { ...get().error, operation: result.error } });
            return false;
          }
        } catch (error) {
          console.error('Error creating task:', error);
          set({ error: { ...get().error, operation: 'Failed to create task' } });
          return false;
        } finally {
          set({ loading: { ...get().loading, creating: false } });
        }
      },

      updateTask: async (request: TaskUpdateRequest) => {
        set({ loading: { ...get().loading, updating: true } });
        try {
          const result = request.provider === 'google' 
            ? await window.electronAPI.todo.google.updateTask(request)
            : await window.electronAPI.todo.microsoft.updateTask(request);
          
          if (result.success) {
            // Update local state
            const tasks = get().tasks.map(task => 
              task.id === `${request.provider}-${request.id}` 
                ? { 
                    ...task, 
                    ...request,
                    updatedDate: new Date().toISOString()
                  }
                : task
            );
            set({ tasks });
            return true;
          } else {
            set({ error: { ...get().error, operation: result.error } });
            return false;
          }
        } catch (error) {
          console.error('Error updating task:', error);
          set({ error: { ...get().error, operation: 'Failed to update task' } });
          return false;
        } finally {
          set({ loading: { ...get().loading, updating: false } });
        }
      },

      deleteTask: async (taskId: string, listId: string, provider: 'google' | 'microsoft') => {
        set({ loading: { ...get().loading, deleting: true } });
        try {
          const task = get().tasks.find(t => t.id === taskId);
          if (!task) return false;
          
          const list = get().lists.find(l => l.id === listId);
          if (!list) return false;
          
          const result = provider === 'google' 
            ? await window.electronAPI.todo.google.deleteTask(list.providerId, task.providerId)
            : await window.electronAPI.todo.microsoft.deleteTask(list.providerId, task.providerId);
          
          if (result.success) {
            // Remove from local state
            const tasks = get().tasks.filter(t => t.id !== taskId);
            set({ tasks });
            
            // Clear selection if deleted task was selected
            if (get().selectedTaskId === taskId) {
              set({ selectedTaskId: null });
            }
            
            return true;
          } else {
            set({ error: { ...get().error, operation: result.error } });
            return false;
          }
        } catch (error) {
          console.error('Error deleting task:', error);
          set({ error: { ...get().error, operation: 'Failed to delete task' } });
          return false;
        } finally {
          set({ loading: { ...get().loading, deleting: false } });
        }
      },

      toggleTaskCompletion: async (taskId: string) => {
        const task = get().tasks.find(t => t.id === taskId);
        if (!task) return false;
        
        const newStatus = task.status === 'completed' ? 'pending' : 'completed';
        
        return await get().updateTask({
          id: task.providerId,
          provider: task.provider,
          status: newStatus,
          listId: task.listId
        });
      },

      toggleTaskStar: async (taskId: string) => {
        const task = get().tasks.find(t => t.id === taskId);
        if (!task) return false;
        
        const newStarred = !task.isStarred;
        
        try {
          let result;
          if (task.provider === 'google') {
            result = await window.electronAPI.todo.google.toggleStar(
              task.listId, 
              task.providerId, 
              newStarred
            );
          } else if (task.provider === 'microsoft') {
            result = await window.electronAPI.todo.microsoft.toggleStar(
              task.listId, 
              task.providerId, 
              newStarred
            );
          }
          
          if (result?.success) {
            const tasks = get().tasks.map(t => 
              t.id === taskId ? { ...t, isStarred: newStarred } : t
            );
            set({ tasks });
            return true;
          }
        } catch (error) {
          console.error('Error toggling task star:', error);
        }
        
        return false;
      },

      // Filter actions
      setFilters: (filters: Partial<TaskFilters>) => {
        set({ filters: { ...get().filters, ...filters } });
      },

      clearFilters: () => {
        set({ 
          filters: {
            status: 'all',
            provider: 'all',
            isStarred: undefined,
            searchQuery: ''
          }
        });
      },

      // Sync actions
      syncAllTasks: async () => {
        set({ syncInProgress: true });
        try {
          const result = await window.electronAPI.todo.syncAll();
          if (result.success) {
            set({ lastSyncTime: Date.now() });
            // Reinitialize data after sync
            await get().initializeTodoData();
            return true;
          }
        } catch (error) {
          console.error('Error syncing tasks:', error);
        } finally {
          set({ syncInProgress: false });
        }
        return false;
      },

      // UI actions
      toggleSidebar: () => {
        set({ sidebarCollapsed: !get().sidebarCollapsed });
      },

      selectTask: (taskId: string | null) => {
        set({ selectedTaskId: taskId });
      },

      toggleShowCompleted: () => {
        set({ showCompleted: !get().showCompleted });
      },

      // Computed getters
      getFilteredTasks: () => {
        const { tasks, filters, showCompleted } = get();
        
        return tasks.filter(task => {
          // Status filter
          if (filters.status === 'pending' && task.status !== 'pending') return false;
          if (filters.status === 'completed' && task.status !== 'completed') return false;
          if (!showCompleted && task.status === 'completed') return false;
          
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
      },

      getListsByProvider: (provider: 'google' | 'microsoft') => {
        return get().lists.filter(list => list.provider === provider);
      },

      getTasksByList: (listId: string) => {
        return get().tasks.filter(task => task.listId === listId);
      },

      getSelectedTask: () => {
        const { selectedTaskId, tasks } = get();
        if (!selectedTaskId) return null;
        return tasks.find(task => task.id === selectedTaskId) || null;
      },

      getTaskCounts: () => {
        const tasks = get().getFilteredTasks();
        const total = tasks.length;
        const completed = tasks.filter(t => t.status === 'completed').length;
        const pending = total - completed;
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const overdue = tasks.filter(t => {
          if (!t.dueDate || t.status === 'completed') return false;
          const dueDate = new Date(t.dueDate);
          return dueDate < today;
        }).length;
        
        return { total, completed, pending, overdue };
      }
    }),
    {
      name: 'todo-store',
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        showCompleted: state.showCompleted,
        filters: state.filters
      })
    }
  )
);