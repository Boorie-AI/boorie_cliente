import { 
  TodoProvider, 
  UnifiedTask, 
  UnifiedTaskList, 
  TodoCache, 
  TodoMetrics 
} from './todo.types';

export class TodoCacheService {
  private cache: TodoCache;
  private cacheTimeout: number = 5 * 60 * 1000; // 5 minutes
  private lastFullSync: number = 0;

  constructor() {
    this.cache = {
      providers: new Map(),
      lists: new Map(),
      tasks: new Map(),
      lastSync: new Map(),
      etags: new Map()
    };
  }

  // Provider cache management
  setProviders(providers: TodoProvider[]): void {
    this.cache.providers.clear();
    providers.forEach(provider => {
      this.cache.providers.set(provider.id, provider);
    });
    this.cache.lastSync.set('providers', Date.now());
  }

  getProviders(): TodoProvider[] {
    return Array.from(this.cache.providers.values());
  }

  getProvider(providerId: string): TodoProvider | undefined {
    return this.cache.providers.get(providerId);
  }

  // Task list cache management
  setLists(lists: UnifiedTaskList[]): void {
    this.cache.lists.clear();
    lists.forEach(list => {
      this.cache.lists.set(list.id, list);
    });
    this.cache.lastSync.set('lists', Date.now());
  }

  getLists(): UnifiedTaskList[] {
    return Array.from(this.cache.lists.values());
  }

  getList(listId: string): UnifiedTaskList | undefined {
    return this.cache.lists.get(listId);
  }

  getListsByProvider(provider: 'google' | 'microsoft'): UnifiedTaskList[] {
    return Array.from(this.cache.lists.values()).filter(
      list => list.provider === provider
    );
  }

  addList(list: UnifiedTaskList): void {
    this.cache.lists.set(list.id, list);
    this.updateListCount(list.id);
  }

  updateList(listId: string, updates: Partial<UnifiedTaskList>): void {
    const existingList = this.cache.lists.get(listId);
    if (existingList) {
      this.cache.lists.set(listId, { ...existingList, ...updates });
    }
  }

  removeList(listId: string): void {
    this.cache.lists.delete(listId);
    // Remove all tasks from this list
    const tasksToRemove = Array.from(this.cache.tasks.values())
      .filter(task => task.listId === listId);
    tasksToRemove.forEach(task => {
      this.cache.tasks.delete(task.id);
    });
  }

  // Task cache management
  setTasks(tasks: UnifiedTask[]): void {
    this.cache.tasks.clear();
    tasks.forEach(task => {
      this.cache.tasks.set(task.id, task);
    });
    this.cache.lastSync.set('tasks', Date.now());
    this.updateAllListCounts();
  }

  getTasks(): UnifiedTask[] {
    return Array.from(this.cache.tasks.values());
  }

  getTask(taskId: string): UnifiedTask | undefined {
    return this.cache.tasks.get(taskId);
  }

  getTasksByList(listId: string): UnifiedTask[] {
    return Array.from(this.cache.tasks.values()).filter(
      task => task.listId === listId
    );
  }

  getTasksByProvider(provider: 'google' | 'microsoft'): UnifiedTask[] {
    return Array.from(this.cache.tasks.values()).filter(
      task => task.provider === provider
    );
  }

  addTask(task: UnifiedTask): void {
    this.cache.tasks.set(task.id, task);
    this.updateListCount(task.listId);
  }

  updateTask(taskId: string, updates: Partial<UnifiedTask>): void {
    const existingTask = this.cache.tasks.get(taskId);
    if (existingTask) {
      const oldListId = existingTask.listId;
      const updatedTask = { ...existingTask, ...updates };
      this.cache.tasks.set(taskId, updatedTask);
      
      // Update list counts if task moved to different list
      if (updates.listId && updates.listId !== oldListId) {
        this.updateListCount(oldListId);
        this.updateListCount(updates.listId);
      } else {
        this.updateListCount(oldListId);
      }
    }
  }

  removeTask(taskId: string): void {
    const task = this.cache.tasks.get(taskId);
    if (task) {
      this.cache.tasks.delete(taskId);
      this.updateListCount(task.listId);
    }
  }

  // Filtered task retrieval
  getCompletedTasks(): UnifiedTask[] {
    return Array.from(this.cache.tasks.values()).filter(
      task => task.status === 'completed'
    );
  }

  getPendingTasks(): UnifiedTask[] {
    return Array.from(this.cache.tasks.values()).filter(
      task => task.status === 'pending'
    );
  }

  getStarredTasks(): UnifiedTask[] {
    return Array.from(this.cache.tasks.values()).filter(
      task => task.isStarred
    );
  }

  getOverdueTasks(): UnifiedTask[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return Array.from(this.cache.tasks.values()).filter(task => {
      if (!task.dueDate || task.status === 'completed') return false;
      const dueDate = new Date(task.dueDate);
      return dueDate < today;
    });
  }

  getTodayTasks(): UnifiedTask[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    return Array.from(this.cache.tasks.values()).filter(task => {
      if (!task.dueDate || task.status === 'completed') return false;
      const dueDate = new Date(task.dueDate);
      return dueDate >= today && dueDate < tomorrow;
    });
  }

  getTomorrowTasks(): UnifiedTask[] {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const dayAfter = new Date(tomorrow);
    dayAfter.setDate(dayAfter.getDate() + 1);
    
    return Array.from(this.cache.tasks.values()).filter(task => {
      if (!task.dueDate || task.status === 'completed') return false;
      const dueDate = new Date(task.dueDate);
      return dueDate >= tomorrow && dueDate < dayAfter;
    });
  }

  // Search functionality
  searchTasks(query: string): UnifiedTask[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.cache.tasks.values()).filter(task => 
      task.title.toLowerCase().includes(lowerQuery) ||
      (task.description && task.description.toLowerCase().includes(lowerQuery))
    );
  }

  // Cache validation and management
  isStale(key: string): boolean {
    const lastSync = this.cache.lastSync.get(key);
    if (!lastSync) return true;
    return Date.now() - lastSync > this.cacheTimeout;
  }

  isCacheValid(): boolean {
    return !this.isStale('providers') && !this.isStale('lists') && !this.isStale('tasks');
  }

  clearCache(): void {
    this.cache.providers.clear();
    this.cache.lists.clear();
    this.cache.tasks.clear();
    this.cache.lastSync.clear();
    this.cache.etags.clear();
  }

  // ETag management for efficient syncing
  setETag(key: string, etag: string): void {
    this.cache.etags.set(key, etag);
  }

  getETag(key: string): string | undefined {
    return this.cache.etags.get(key);
  }

  hasETagChanged(key: string, newETag: string): boolean {
    const oldETag = this.cache.etags.get(key);
    return oldETag !== newETag;
  }

  // Metrics calculation
  getMetrics(): TodoMetrics {
    const tasks = this.getTasks();
    const totalTasks = tasks.length;
    const completedTasks = this.getCompletedTasks().length;
    const pendingTasks = this.getPendingTasks().length;
    const overdueTasks = this.getOverdueTasks().length;
    
    const tasksByProvider = tasks.reduce((acc, task) => {
      acc[task.provider] = (acc[task.provider] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const tasksByList = tasks.reduce((acc, task) => {
      acc[task.listName] = (acc[task.listName] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return {
      totalTasks,
      completedTasks,
      pendingTasks,
      overdueTasks,
      tasksByProvider,
      tasksByList,
      lastSyncTime: this.lastFullSync,
      syncDuration: 0
    };
  }

  // Private helper methods
  private updateListCount(listId: string): void {
    const list = this.cache.lists.get(listId);
    if (list) {
      const taskCount = this.getTasksByList(listId).length;
      this.cache.lists.set(listId, { ...list, taskCount });
    }
  }

  private updateAllListCounts(): void {
    this.cache.lists.forEach((list, listId) => {
      const taskCount = this.getTasksByList(listId).length;
      this.cache.lists.set(listId, { ...list, taskCount });
    });
  }

  // Bulk operations
  bulkUpdateTasks(updates: Array<{ id: string; updates: Partial<UnifiedTask> }>): void {
    const affectedLists = new Set<string>();
    
    updates.forEach(({ id, updates: taskUpdates }) => {
      const existingTask = this.cache.tasks.get(id);
      if (existingTask) {
        affectedLists.add(existingTask.listId);
        if (taskUpdates.listId && taskUpdates.listId !== existingTask.listId) {
          affectedLists.add(taskUpdates.listId);
        }
        this.cache.tasks.set(id, { ...existingTask, ...taskUpdates });
      }
    });
    
    // Update counts for all affected lists
    affectedLists.forEach(listId => {
      this.updateListCount(listId);
    });
  }

  // Export/Import for persistence
  exportCache(): any {
    return {
      providers: Array.from(this.cache.providers.entries()),
      lists: Array.from(this.cache.lists.entries()),
      tasks: Array.from(this.cache.tasks.entries()),
      lastSync: Array.from(this.cache.lastSync.entries()),
      etags: Array.from(this.cache.etags.entries()),
      lastFullSync: this.lastFullSync
    };
  }

  importCache(data: any): void {
    this.cache.providers = new Map(data.providers || []);
    this.cache.lists = new Map(data.lists || []);
    this.cache.tasks = new Map(data.tasks || []);
    this.cache.lastSync = new Map(data.lastSync || []);
    this.cache.etags = new Map(data.etags || []);
    this.lastFullSync = data.lastFullSync || 0;
  }

  // Cache statistics
  getCacheStats(): {
    providerCount: number;
    listCount: number;
    taskCount: number;
    lastSyncTime: number;
    cacheSize: number;
  } {
    return {
      providerCount: this.cache.providers.size,
      listCount: this.cache.lists.size,
      taskCount: this.cache.tasks.size,
      lastSyncTime: this.lastFullSync,
      cacheSize: this.estimateCacheSize()
    };
  }

  private estimateCacheSize(): number {
    // Rough estimate of cache size in bytes
    const providersSize = this.cache.providers.size * 200; // rough estimate
    const listsSize = this.cache.lists.size * 300;
    const tasksSize = this.cache.tasks.size * 500;
    return providersSize + listsSize + tasksSize;
  }
}