import { TodoAggregatorService } from './todo.aggregator.service';
import { TodoCacheService } from './todo.cache.service';
import { SyncProgress, TodoSyncOptions } from './todo.types';

export class BackgroundSyncService {
  private todoAggregatorService: TodoAggregatorService;
  private todoCacheService: TodoCacheService;
  private syncInterval: number = 15 * 60 * 1000; // 15 minutes
  private syncTimer: NodeJS.Timeout | null = null;
  private isSyncing: boolean = false;
  private lastSyncTime: number = 0;
  private syncErrorCount: number = 0;
  private maxRetries: number = 3;
  private retryDelayBase: number = 2000; // 2 seconds
  
  private eventCallbacks: {
    onSyncStart?: () => void;
    onSyncProgress?: (progress: SyncProgress) => void;
    onSyncComplete?: (success: boolean, error?: string) => void;
    onSyncError?: (error: string) => void;
  } = {};

  constructor(
    todoAggregatorService: TodoAggregatorService,
    todoCacheService: TodoCacheService
  ) {
    this.todoAggregatorService = todoAggregatorService;
    this.todoCacheService = todoCacheService;
  }

  // Event subscription
  on(event: 'syncStart', callback: () => void): void;
  on(event: 'syncProgress', callback: (progress: SyncProgress) => void): void;
  on(event: 'syncComplete', callback: (success: boolean, error?: string) => void): void;
  on(event: 'syncError', callback: (error: string) => void): void;
  on(event: string, callback: any): void {
    switch (event) {
      case 'syncStart':
        this.eventCallbacks.onSyncStart = callback;
        break;
      case 'syncProgress':
        this.eventCallbacks.onSyncProgress = callback;
        break;
      case 'syncComplete':
        this.eventCallbacks.onSyncComplete = callback;
        break;
      case 'syncError':
        this.eventCallbacks.onSyncError = callback;
        break;
    }
  }

  // Start background sync
  start(): void {
    if (this.syncTimer) {
      this.stop();
    }

    console.log('Starting background sync service...');
    
    // Perform initial sync
    this.performSync();
    
    // Schedule periodic syncs
    this.syncTimer = setInterval(() => {
      this.performSync();
    }, this.syncInterval);
  }

  // Stop background sync
  stop(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
      console.log('Background sync service stopped');
    }
  }

  // Manual sync trigger
  async triggerSync(options: TodoSyncOptions = {}): Promise<boolean> {
    if (this.isSyncing) {
      console.log('Sync already in progress, skipping...');
      return false;
    }

    return await this.performSync(options);
  }

  // Check if sync is currently running
  isSyncInProgress(): boolean {
    return this.isSyncing;
  }

  // Get last sync time
  getLastSyncTime(): number {
    return this.lastSyncTime;
  }

  // Get sync interval
  getSyncInterval(): number {
    return this.syncInterval;
  }

  // Set sync interval
  setSyncInterval(intervalMs: number): void {
    this.syncInterval = intervalMs;
    
    // Restart with new interval if currently running
    if (this.syncTimer) {
      this.stop();
      this.start();
    }
  }

  // Get sync error count
  getSyncErrorCount(): number {
    return this.syncErrorCount;
  }

  // Reset sync error count
  resetSyncErrorCount(): void {
    this.syncErrorCount = 0;
  }

  // Private sync implementation
  private async performSync(options: TodoSyncOptions = {}): Promise<boolean> {
    if (this.isSyncing) {
      return false;
    }

    this.isSyncing = true;
    this.eventCallbacks.onSyncStart?.();

    try {
      const startTime = Date.now();
      
      // Check if force refresh is needed or cache is stale
      const shouldForceRefresh = options.forceRefresh || !this.todoCacheService.isCacheValid();
      
      if (shouldForceRefresh) {
        await this.todoCacheService.clearCache();
      }

      // Perform sync with progress tracking
      const result = await this.todoAggregatorService.syncAllTasks((progress) => {
        this.eventCallbacks.onSyncProgress?.(progress);
      });

      // Update cache
      this.todoCacheService.setProviders([]); // Will be set by aggregator
      this.todoCacheService.setLists(result.lists);
      this.todoCacheService.setTasks(result.tasks);

      // Update sync status
      this.lastSyncTime = Date.now();
      this.syncErrorCount = 0;
      
      const syncDuration = Date.now() - startTime;
      console.log(`Sync completed successfully in ${syncDuration}ms`);
      
      this.eventCallbacks.onSyncComplete?.(true);
      return true;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown sync error';
      console.error('Sync failed:', errorMessage);
      
      this.syncErrorCount++;
      this.eventCallbacks.onSyncError?.(errorMessage);
      this.eventCallbacks.onSyncComplete?.(false, errorMessage);
      
      // Implement exponential backoff for retries
      if (this.syncErrorCount < this.maxRetries) {
        const retryDelay = this.retryDelayBase * Math.pow(2, this.syncErrorCount - 1);
        console.log(`Scheduling retry ${this.syncErrorCount} in ${retryDelay}ms`);
        
        setTimeout(() => {
          this.performSync(options);
        }, retryDelay);
      } else {
        console.error('Max sync retries reached, stopping automatic sync');
        this.stop();
      }
      
      return false;
      
    } finally {
      this.isSyncing = false;
    }
  }

  // Sync specific provider
  async syncProvider(provider: 'google' | 'microsoft', options: TodoSyncOptions = {}): Promise<boolean> {
    if (this.isSyncing) {
      return false;
    }

    this.isSyncing = true;
    this.eventCallbacks.onSyncStart?.();

    try {
      const startTime = Date.now();
      
      // Get current providers and filter for the specific one
      const allProviders = this.todoCacheService.getProviders();
      const targetProvider = allProviders.find(p => p.type === provider);
      
      if (!targetProvider) {
        throw new Error(`Provider ${provider} not found or not authenticated`);
      }

      this.eventCallbacks.onSyncProgress?.({
        phase: 'lists',
        progress: 25,
        message: `Syncing ${provider} lists...`
      });

      // Get lists for the specific provider
      const lists = await this.todoAggregatorService.getAllLists([targetProvider]);
      
      this.eventCallbacks.onSyncProgress?.({
        phase: 'tasks',
        progress: 75,
        message: `Syncing ${provider} tasks...`
      });

      // Get tasks for the provider's lists
      const providerLists = lists.filter(l => l.provider === provider);
      const tasks = await this.todoAggregatorService.getAllTasks(providerLists);

      // Update cache for this provider
      const existingLists = this.todoCacheService.getLists();
      const existingTasks = this.todoCacheService.getTasks();
      
      // Remove old data for this provider
      const updatedLists = existingLists.filter(l => l.provider !== provider).concat(lists);
      const updatedTasks = existingTasks.filter(t => t.provider !== provider).concat(tasks);
      
      this.todoCacheService.setLists(updatedLists);
      this.todoCacheService.setTasks(updatedTasks);

      this.eventCallbacks.onSyncProgress?.({
        phase: 'complete',
        progress: 100,
        message: `${provider} sync complete!`
      });

      const syncDuration = Date.now() - startTime;
      console.log(`${provider} sync completed successfully in ${syncDuration}ms`);
      
      this.eventCallbacks.onSyncComplete?.(true);
      return true;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : `Unknown ${provider} sync error`;
      console.error(`${provider} sync failed:`, errorMessage);
      
      this.eventCallbacks.onSyncError?.(errorMessage);
      this.eventCallbacks.onSyncComplete?.(false, errorMessage);
      
      return false;
      
    } finally {
      this.isSyncing = false;
    }
  }

  // Sync specific list
  async syncList(listId: string, options: TodoSyncOptions = {}): Promise<boolean> {
    if (this.isSyncing) {
      return false;
    }

    const list = this.todoCacheService.getList(listId);
    if (!list) {
      console.error(`List ${listId} not found`);
      return false;
    }

    this.isSyncing = true;
    this.eventCallbacks.onSyncStart?.();

    try {
      const startTime = Date.now();
      
      this.eventCallbacks.onSyncProgress?.({
        phase: 'tasks',
        progress: 50,
        message: `Syncing ${list.name} tasks...`
      });

      // Get tasks for the specific list
      const tasks = await this.todoAggregatorService.getAllTasks([list]);
      
      // Update cache for this list
      const existingTasks = this.todoCacheService.getTasks();
      const updatedTasks = existingTasks.filter(t => t.listId !== listId).concat(tasks);
      
      this.todoCacheService.setTasks(updatedTasks);

      this.eventCallbacks.onSyncProgress?.({
        phase: 'complete',
        progress: 100,
        message: `${list.name} sync complete!`
      });

      const syncDuration = Date.now() - startTime;
      console.log(`List ${list.name} sync completed successfully in ${syncDuration}ms`);
      
      this.eventCallbacks.onSyncComplete?.(true);
      return true;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : `Unknown list sync error`;
      console.error(`List ${list.name} sync failed:`, errorMessage);
      
      this.eventCallbacks.onSyncError?.(errorMessage);
      this.eventCallbacks.onSyncComplete?.(false, errorMessage);
      
      return false;
      
    } finally {
      this.isSyncing = false;
    }
  }

  // Health check
  async healthCheck(): Promise<{
    isHealthy: boolean;
    lastSync: number;
    errorCount: number;
    cacheStats: any;
  }> {
    const cacheStats = this.todoCacheService.getCacheStats();
    const timeSinceLastSync = Date.now() - this.lastSyncTime;
    const isHealthy = this.syncErrorCount < this.maxRetries && timeSinceLastSync < (this.syncInterval * 2);
    
    return {
      isHealthy,
      lastSync: this.lastSyncTime,
      errorCount: this.syncErrorCount,
      cacheStats
    };
  }

  // Configuration
  configure(config: {
    syncInterval?: number;
    maxRetries?: number;
    retryDelayBase?: number;
  }): void {
    if (config.syncInterval) {
      this.setSyncInterval(config.syncInterval);
    }
    
    if (config.maxRetries) {
      this.maxRetries = config.maxRetries;
    }
    
    if (config.retryDelayBase) {
      this.retryDelayBase = config.retryDelayBase;
    }
  }
}