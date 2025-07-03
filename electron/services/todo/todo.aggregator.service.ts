import { GoogleTasksService } from './google.tasks.service';
import { MicrosoftTodoService } from './microsoft.todo.service';
import { 
  TodoProvider, 
  UnifiedTask, 
  UnifiedTaskList, 
  GoogleTask, 
  MicrosoftTask, 
  GoogleTaskList, 
  MicrosoftTaskList,
  SyncProgress,
  TodoMetrics,
  TodoCache
} from './todo.types';

export class TodoAggregatorService {
  private googleTasksService: GoogleTasksService;
  private microsoftTodoService: MicrosoftTodoService;
  private cache: TodoCache;

  constructor(
    googleTasksService: GoogleTasksService,
    microsoftTodoService: MicrosoftTodoService
  ) {
    this.googleTasksService = googleTasksService;
    this.microsoftTodoService = microsoftTodoService;
    this.cache = {
      providers: new Map(),
      lists: new Map(),
      tasks: new Map(),
      lastSync: new Map(),
      etags: new Map()
    };
  }

  async getAllLists(providers: TodoProvider[]): Promise<UnifiedTaskList[]> {
    const allLists: UnifiedTaskList[] = [];
    
    for (const provider of providers) {
      try {
        if (provider.type === 'google' && provider.hasValidToken) {
          const googleLists = await this.googleTasksService.getTaskLists();
          const unifiedLists = this.convertGoogleListsToUnified(googleLists);
          allLists.push(...unifiedLists);
        } else if (provider.type === 'microsoft' && provider.hasValidToken) {
          const microsoftLists = await this.microsoftTodoService.getTaskLists();
          const unifiedLists = this.convertMicrosoftListsToUnified(microsoftLists);
          allLists.push(...unifiedLists);
        }
      } catch (error) {
        console.error(`Error fetching lists for ${provider.type} provider:`, error);
      }
    }
    
    return allLists;
  }

  async getAllTasks(lists: UnifiedTaskList[]): Promise<UnifiedTask[]> {
    const allTasks: UnifiedTask[] = [];
    
    for (const list of lists) {
      try {
        if (list.provider === 'google') {
          const googleTasks = await this.googleTasksService.getTasksWithMetadata(list.providerId, {
            includeCompleted: true
          });
          const unifiedTasks = this.convertGoogleTasksToUnified(googleTasks, list);
          allTasks.push(...unifiedTasks);
        } else if (list.provider === 'microsoft') {
          const microsoftTasks = await this.microsoftTodoService.getTasksWithMetadata(list.providerId, {
            includeCompleted: true
          });
          const unifiedTasks = this.convertMicrosoftTasksToUnified(microsoftTasks, list);
          allTasks.push(...unifiedTasks);
        }
      } catch (error) {
        console.error(`Error fetching tasks for ${list.provider} list ${list.name}:`, error);
      }
    }
    
    return allTasks;
  }

  async syncAllTasks(onProgress?: (progress: SyncProgress) => void): Promise<{
    lists: UnifiedTaskList[];
    tasks: UnifiedTask[];
    metrics: TodoMetrics;
  }> {
    const startTime = Date.now();
    
    try {
      onProgress?.({
        phase: 'accounts',
        progress: 5,
        message: 'Validating accounts...'
      });

      // This would typically get providers from the auth system
      const providers: TodoProvider[] = []; // Will be populated by the handler
      
      onProgress?.({
        phase: 'lists',
        progress: 25,
        message: 'Syncing task lists...'
      });
      
      const lists = await this.getAllLists(providers);
      
      onProgress?.({
        phase: 'tasks',
        progress: 75,
        message: 'Syncing tasks...'
      });
      
      const tasks = await this.getAllTasks(lists);
      
      onProgress?.({
        phase: 'complete',
        progress: 100,
        message: 'Sync complete!'
      });
      
      const metrics = this.calculateMetrics(tasks);
      metrics.syncDuration = Date.now() - startTime;
      metrics.lastSyncTime = Date.now();
      
      return { lists, tasks, metrics };
    } catch (error) {
      console.error('Error during sync:', error);
      throw error;
    }
  }

  async getUnifiedTaskData(): Promise<{
    lists: UnifiedTaskList[];
    tasks: UnifiedTask[];
    metrics: TodoMetrics;
  }> {
    const lists = Array.from(this.cache.lists.values());
    const tasks = Array.from(this.cache.tasks.values());
    const metrics = this.calculateMetrics(tasks);
    
    return { lists, tasks, metrics };
  }

  async toggleTaskStar(provider: 'google' | 'microsoft', listId: string, taskId: string, starred: boolean): Promise<UnifiedTask> {
    if (provider === 'google') {
      const newStarred = await this.googleTasksService.toggleTaskStar(listId, taskId);
      const task = this.cache.tasks.get(`google-${taskId}`);
      if (task) {
        const updatedTask = { ...task, isStarred: newStarred };
        this.cache.tasks.set(`google-${taskId}`, updatedTask);
        return updatedTask;
      }
    } else if (provider === 'microsoft') {
      const newStarred = await this.microsoftTodoService.toggleTaskStar(listId, taskId);
      const task = this.cache.tasks.get(`microsoft-${taskId}`);
      if (task) {
        const updatedTask = { ...task, isStarred: newStarred };
        this.cache.tasks.set(`microsoft-${taskId}`, updatedTask);
        return updatedTask;
      }
    }
    
    // Fallback if task not found in cache
    const task = this.cache.tasks.get(taskId);
    if (!task) {
      throw new Error('Task not found');
    }
    
    const updatedTask = { ...task, isStarred: starred };
    this.cache.tasks.set(taskId, updatedTask);
    
    return updatedTask;
  }

  private convertGoogleListsToUnified(googleLists: GoogleTaskList[]): UnifiedTaskList[] {
    return googleLists.map(list => ({
      id: `google-${list.id}`,
      name: list.title,
      provider: 'google',
      providerId: list.id,
      isDefault: list.title === 'My Tasks',
      isSystem: false,
      canEdit: true,
      canDelete: list.title !== 'My Tasks',
      originalList: list
    }));
  }

  private convertMicrosoftListsToUnified(microsoftLists: MicrosoftTaskList[]): UnifiedTaskList[] {
    return microsoftLists.map(list => {
      // Determine list name based on system list type
      let displayName = list.displayName;
      if (list.wellknownListName === 'defaultList') {
        displayName = 'My Tasks';
      } else if (list.wellknownListName === 'flaggedEmails') {
        displayName = 'Flagged Emails';
      }
      
      return {
        id: `microsoft-${list.id}`,
        name: displayName,
        provider: 'microsoft',
        providerId: list.id,
        isDefault: list.wellknownListName === 'defaultList',
        isSystem: list.wellknownListName !== 'none',
        canEdit: list.isOwner && list.wellknownListName === 'none', // Only custom lists can be edited
        canDelete: list.isOwner && list.wellknownListName === 'none', // Only custom lists can be deleted
        originalList: list
      };
    });
  }

  private convertGoogleTasksToUnified(googleTasks: GoogleTask[], list: UnifiedTaskList): UnifiedTask[] {
    return googleTasks.map(task => ({
      id: `google-${task.id}`,
      title: task.title,
      description: task.notes,
      status: task.status === 'completed' ? 'completed' : 'pending',
      dueDate: task.due,
      completedDate: task.completed,
      createdDate: task.updated, // Google Tasks doesn't have separate created date
      updatedDate: task.updated,
      provider: 'google',
      providerId: task.id,
      listId: list.id,
      listName: list.name,
      isStarred: task.isStarred || false,
      originalTask: task
    }));
  }

  private convertMicrosoftTasksToUnified(microsoftTasks: MicrosoftTask[], list: UnifiedTaskList): UnifiedTask[] {
    return microsoftTasks.map(task => ({
      id: `microsoft-${task.id}`,
      title: task.title,
      description: task.body?.content,
      status: task.status === 'completed' ? 'completed' : 'pending',
      dueDate: task.dueDateTime?.dateTime,
      completedDate: task.completedDateTime?.dateTime,
      createdDate: task.createdDateTime,
      updatedDate: task.lastModifiedDateTime,
      provider: 'microsoft',
      providerId: task.id,
      listId: list.id,
      listName: list.name,
      priority: task.importance as 'low' | 'normal' | 'high' || 'normal',
      hasAttachments: task.hasAttachments,
      isStarred: task.isStarred || false,
      isImportant: task.importance === 'high', // Map importance to isImportant
      originalTask: task
    }));
  }

  private calculateMetrics(tasks: UnifiedTask[]): TodoMetrics {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.status === 'completed').length;
    const pendingTasks = totalTasks - completedTasks;
    
    const overdueTasks = tasks.filter(t => {
      if (!t.dueDate || t.status === 'completed') return false;
      const dueDate = new Date(t.dueDate);
      return dueDate < today;
    }).length;
    
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
      lastSyncTime: Date.now(),
      syncDuration: 0
    };
  }

  async refreshCache(): Promise<void> {
    // Clear current cache
    this.cache.providers.clear();
    this.cache.lists.clear();
    this.cache.tasks.clear();
    this.cache.lastSync.clear();
    this.cache.etags.clear();
  }

  async getTasksByList(listId: string): Promise<UnifiedTask[]> {
    const tasks = Array.from(this.cache.tasks.values());
    return tasks.filter(task => task.listId === listId);
  }

  async getTasksByProvider(provider: 'google' | 'microsoft'): Promise<UnifiedTask[]> {
    const tasks = Array.from(this.cache.tasks.values());
    return tasks.filter(task => task.provider === provider);
  }

  async getCompletedTasks(): Promise<UnifiedTask[]> {
    const tasks = Array.from(this.cache.tasks.values());
    return tasks.filter(task => task.status === 'completed');
  }

  async getPendingTasks(): Promise<UnifiedTask[]> {
    const tasks = Array.from(this.cache.tasks.values());
    return tasks.filter(task => task.status === 'pending');
  }

  async getOverdueTasks(): Promise<UnifiedTask[]> {
    const tasks = Array.from(this.cache.tasks.values());
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return tasks.filter(task => {
      if (!task.dueDate || task.status === 'completed') return false;
      const dueDate = new Date(task.dueDate);
      return dueDate < today;
    });
  }

  async getStarredTasks(): Promise<UnifiedTask[]> {
    const tasks = Array.from(this.cache.tasks.values());
    return tasks.filter(task => task.isStarred);
  }

  async searchTasks(query: string): Promise<UnifiedTask[]> {
    const tasks = Array.from(this.cache.tasks.values());
    const lowerQuery = query.toLowerCase();
    
    return tasks.filter(task => 
      task.title.toLowerCase().includes(lowerQuery) ||
      (task.description && task.description.toLowerCase().includes(lowerQuery))
    );
  }
}