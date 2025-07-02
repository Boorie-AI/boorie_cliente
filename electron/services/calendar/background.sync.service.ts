// Background Sync Service - Intelligent background synchronization

import { CalendarAggregatorService } from './calendar.aggregator.service'
import { CalendarCacheService } from './calendar.cache.service'
import { databaseLogger } from '../../../backend/utils/logger'

export interface SyncJob {
  id: string
  type: 'events' | 'accounts' | 'calendars'
  accountId?: string
  priority: 'high' | 'medium' | 'low'
  scheduledTime: Date
  lastRun?: Date
  nextRun?: Date
  interval?: number // milliseconds
  retryCount: number
  maxRetries: number
  isRecurring: boolean
  data?: any
}

export interface SyncConfig {
  enabledWhenIdle: boolean
  enabledWhenActive: boolean
  idleThreshold: number // milliseconds of inactivity
  maxConcurrentJobs: number
  defaultInterval: number // milliseconds
  retryPolicy: {
    maxRetries: number
    backoffMultiplier: number
    initialDelay: number
  }
  syncIntervals: {
    events: number
    accounts: number
    calendars: number
  }
}

export interface SyncStats {
  totalJobs: number
  completedJobs: number
  failedJobs: number
  activeJobs: number
  lastSyncTime?: Date
  nextScheduledSync?: Date
  syncSuccess: boolean
  errorCount: number
}

export class BackgroundSyncService {
  private aggregatorService: CalendarAggregatorService
  private cacheService: CalendarCacheService
  private logger = databaseLogger
  
  private jobs: Map<string, SyncJob> = new Map()
  private activeJobs: Set<string> = new Set()
  private syncTimer: NodeJS.Timeout | null = null
  private isUserActive: boolean = true
  private lastActivity: Date = new Date()
  private stats: SyncStats = {
    totalJobs: 0,
    completedJobs: 0,
    failedJobs: 0,
    activeJobs: 0,
    syncSuccess: true,
    errorCount: 0
  }

  private config: SyncConfig = {
    enabledWhenIdle: true,
    enabledWhenActive: false,
    idleThreshold: 300000, // 5 minutes
    maxConcurrentJobs: 2,
    defaultInterval: 900000, // 15 minutes
    retryPolicy: {
      maxRetries: 3,
      backoffMultiplier: 2,
      initialDelay: 5000
    },
    syncIntervals: {
      events: 600000,    // 10 minutes
      accounts: 1800000, // 30 minutes
      calendars: 3600000 // 60 minutes
    }
  }

  constructor(
    aggregatorService: CalendarAggregatorService,
    cacheService: CalendarCacheService,
    config?: Partial<SyncConfig>
  ) {
    this.aggregatorService = aggregatorService
    this.cacheService = cacheService
    
    if (config) {
      this.config = { ...this.config, ...config }
    }

    this.logger.info('Background Sync Service initialized', this.config)
    this.startSyncScheduler()
    this.setupActivityDetection()
  }

  /**
   * Schedule a sync job
   */
  scheduleJob(job: Omit<SyncJob, 'id' | 'retryCount'>): string {
    const jobId = this.generateJobId()
    const fullJob: SyncJob = {
      ...job,
      id: jobId,
      retryCount: 0,
      nextRun: job.scheduledTime
    }

    this.jobs.set(jobId, fullJob)
    this.stats.totalJobs++

    this.logger.debug('Sync job scheduled', {
      jobId,
      type: job.type,
      accountId: job.accountId,
      scheduledTime: job.scheduledTime,
      isRecurring: job.isRecurring
    })

    return jobId
  }

  /**
   * Schedule recurring sync jobs for all accounts
   */
  async scheduleAccountSyncs(): Promise<void> {
    try {
      const accounts = await this.aggregatorService.getConnectedAccounts()
      const connectedAccounts = accounts.filter(acc => acc.isConnected && acc.hasCalendarAccess)

      for (const account of connectedAccounts) {
        // Schedule events sync
        this.scheduleJob({
          type: 'events',
          accountId: account.id,
          priority: 'medium',
          scheduledTime: new Date(Date.now() + Math.random() * 60000), // Stagger initial syncs
          interval: this.config.syncIntervals.events,
          maxRetries: this.config.retryPolicy.maxRetries,
          isRecurring: true
        })

        // Schedule account info sync
        this.scheduleJob({
          type: 'accounts',
          accountId: account.id,
          priority: 'low',
          scheduledTime: new Date(Date.now() + 120000), // 2 minutes delay
          interval: this.config.syncIntervals.accounts,
          maxRetries: this.config.retryPolicy.maxRetries,
          isRecurring: true
        })
      }

      this.logger.success('Account sync jobs scheduled', { accountCount: connectedAccounts.length })

    } catch (error) {
      this.logger.error('Failed to schedule account syncs', error as Error)
    }
  }

  /**
   * Start the sync scheduler
   */
  private startSyncScheduler(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer)
    }

    this.syncTimer = setInterval(() => {
      this.processPendingJobs()
    }, 30000) // Check every 30 seconds

    this.logger.info('Sync scheduler started')
  }

  /**
   * Process pending sync jobs
   */
  private async processPendingJobs(): Promise<void> {
    const now = new Date()
    
    // Check if sync should run based on user activity
    if (!this.shouldRunSync()) {
      return
    }

    // Get jobs that are ready to run
    const readyJobs = Array.from(this.jobs.values())
      .filter(job => 
        job.nextRun && 
        job.nextRun <= now && 
        !this.activeJobs.has(job.id) &&
        job.retryCount < job.maxRetries
      )
      .sort((a, b) => {
        // Sort by priority, then by scheduled time
        const priorityOrder = { high: 1, medium: 2, low: 3 }
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority]
        if (priorityDiff !== 0) return priorityDiff
        
        return (a.nextRun?.getTime() || 0) - (b.nextRun?.getTime() || 0)
      })

    // Limit concurrent jobs
    const availableSlots = this.config.maxConcurrentJobs - this.activeJobs.size
    const jobsToRun = readyJobs.slice(0, availableSlots)

    for (const job of jobsToRun) {
      this.executeJob(job)
    }
  }

  /**
   * Execute a sync job
   */
  private async executeJob(job: SyncJob): Promise<void> {
    this.activeJobs.add(job.id)
    this.stats.activeJobs = this.activeJobs.size
    
    const startTime = Date.now()
    
    this.logger.debug('Executing sync job', {
      jobId: job.id,
      type: job.type,
      accountId: job.accountId,
      retryCount: job.retryCount
    })

    try {
      switch (job.type) {
        case 'events':
          await this.syncEvents(job)
          break
        case 'accounts':
          await this.syncAccount(job)
          break
        case 'calendars':
          await this.syncCalendars(job)
          break
        default:
          throw new Error(`Unknown job type: ${job.type}`)
      }

      // Job completed successfully
      job.lastRun = new Date()
      job.retryCount = 0
      this.stats.completedJobs++
      this.stats.lastSyncTime = new Date()
      this.stats.syncSuccess = true

      // Schedule next run if recurring
      if (job.isRecurring && job.interval) {
        job.nextRun = new Date(Date.now() + job.interval)
      } else {
        // Remove non-recurring completed jobs
        this.jobs.delete(job.id)
      }

      this.logger.success('Sync job completed', {
        jobId: job.id,
        type: job.type,
        duration: Date.now() - startTime
      })

    } catch (error) {
      this.logger.error('Sync job failed', error as Error, {
        jobId: job.id,
        type: job.type,
        retryCount: job.retryCount
      })

      job.retryCount++
      this.stats.failedJobs++
      this.stats.errorCount++
      this.stats.syncSuccess = false

      if (job.retryCount < job.maxRetries) {
        // Schedule retry with exponential backoff
        const delay = this.calculateRetryDelay(job.retryCount)
        job.nextRun = new Date(Date.now() + delay)
        
        this.logger.info('Scheduling job retry', {
          jobId: job.id,
          retryCount: job.retryCount,
          delay
        })
      } else {
        // Max retries reached, remove job
        this.jobs.delete(job.id)
        this.logger.warn('Job failed permanently', {
          jobId: job.id,
          maxRetries: job.maxRetries
        })
      }
    } finally {
      this.activeJobs.delete(job.id)
      this.stats.activeJobs = this.activeJobs.size
    }
  }

  /**
   * Sync events for an account
   */
  private async syncEvents(job: SyncJob): Promise<void> {
    if (!job.accountId) {
      throw new Error('Account ID required for events sync')
    }

    const now = new Date()
    const startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) // 1 week ago
    const endDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) // 30 days ahead

    // Fetch events from provider
    const events = await this.aggregatorService.getEvents(job.accountId, startDate, endDate)
    
    // Update cache with fresh data
    const cacheKey = CalendarCacheService.createEventsKey(job.accountId, startDate, endDate)
    this.cacheService.set(cacheKey, events, 1800000) // Cache for 30 minutes

    this.logger.debug('Events synced', {
      accountId: job.accountId,
      eventCount: events.length,
      dateRange: { start: startDate, end: endDate }
    })
  }

  /**
   * Sync account information
   */
  private async syncAccount(job: SyncJob): Promise<void> {
    if (!job.accountId) {
      throw new Error('Account ID required for account sync')
    }

    // Refresh account info
    const accountInfo = await this.aggregatorService.getAccountInfo(job.accountId)
    
    // Update cache
    const cacheKey = CalendarCacheService.createAccountKey(job.accountId)
    this.cacheService.set(cacheKey, accountInfo, 900000) // Cache for 15 minutes

    this.logger.debug('Account info synced', {
      accountId: job.accountId,
      isConnected: accountInfo.isConnected
    })
  }

  /**
   * Sync calendars for an account
   */
  private async syncCalendars(job: SyncJob): Promise<void> {
    if (!job.accountId) {
      throw new Error('Account ID required for calendars sync')
    }

    // This would fetch calendar list from the provider
    // Implementation depends on the specific calendar service
    
    this.logger.debug('Calendars synced', {
      accountId: job.accountId
    })
  }

  /**
   * Setup activity detection
   */
  private setupActivityDetection(): void {
    // Listen for user activity events (mouse, keyboard, etc.)
    // This would be implemented based on your app's activity detection
    
    // Simulate activity detection
    setInterval(() => {
      this.updateActivity()
    }, 60000) // Check every minute
  }

  /**
   * Update user activity status
   */
  private updateActivity(): void {
    const now = new Date()
    const timeSinceLastActivity = now.getTime() - this.lastActivity.getTime()
    
    this.isUserActive = timeSinceLastActivity < this.config.idleThreshold
    
    if (!this.isUserActive) {
      this.logger.debug('User is idle, enabling background sync')
    }
  }

  /**
   * Check if sync should run based on configuration and user activity
   */
  private shouldRunSync(): boolean {
    if (this.isUserActive) {
      return this.config.enabledWhenActive
    } else {
      return this.config.enabledWhenIdle
    }
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(retryCount: number): number {
    const baseDelay = this.config.retryPolicy.initialDelay
    const multiplier = this.config.retryPolicy.backoffMultiplier
    
    const delay = baseDelay * Math.pow(multiplier, retryCount - 1)
    
    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 0.1 * delay
    
    return delay + jitter
  }

  /**
   * Generate unique job ID
   */
  private generateJobId(): string {
    return `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Get sync statistics
   */
  getStats(): SyncStats {
    const nextJobs = Array.from(this.jobs.values())
      .filter(job => job.nextRun)
      .sort((a, b) => (a.nextRun?.getTime() || 0) - (b.nextRun?.getTime() || 0))

    return {
      ...this.stats,
      nextScheduledSync: nextJobs[0]?.nextRun
    }
  }

  /**
   * Pause background sync
   */
  pause(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer)
      this.syncTimer = null
    }
    this.logger.info('Background sync paused')
  }

  /**
   * Resume background sync
   */
  resume(): void {
    this.startSyncScheduler()
    this.logger.info('Background sync resumed')
  }

  /**
   * Force immediate sync for an account
   */
  async forceSyncAccount(accountId: string): Promise<void> {
    const forceJob: SyncJob = {
      id: this.generateJobId(),
      type: 'events',
      accountId,
      priority: 'high',
      scheduledTime: new Date(),
      retryCount: 0,
      maxRetries: 1,
      isRecurring: false
    }

    await this.executeJob(forceJob)
  }

  /**
   * Clear all pending jobs
   */
  clearJobs(): void {
    this.jobs.clear()
    this.activeJobs.clear()
    this.stats = {
      totalJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
      activeJobs: 0,
      syncSuccess: true,
      errorCount: 0
    }
    this.logger.info('All sync jobs cleared')
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<SyncConfig>): void {
    this.config = { ...this.config, ...newConfig }
    this.logger.info('Background sync configuration updated', this.config)
  }

  /**
   * Destroy the service
   */
  destroy(): void {
    this.pause()
    this.clearJobs()
    this.logger.info('Background Sync Service destroyed')
  }
}

export default BackgroundSyncService