// API Batch Service - Optimize API calls through intelligent batching

import { createLogger } from '../../../backend/utils/logger'

export interface BatchRequest {
  id: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  url: string
  headers?: Record<string, string>
  body?: any
  priority: 'high' | 'medium' | 'low'
  timeout?: number
  retry?: {
    attempts: number
    backoff: number
  }
}

export interface BatchResponse {
  id: string
  success: boolean
  data?: any
  error?: string
  status?: number
  duration: number
}

export interface BatchConfig {
  maxBatchSize: number
  batchTimeout: number
  maxConcurrentBatches: number
  retryPolicy: {
    maxAttempts: number
    backoffMultiplier: number
    initialDelay: number
  }
  priorityWeights: {
    high: number
    medium: number
    low: number
  }
}

export class APIBatchService {
  private pendingRequests: Map<string, BatchRequest> = new Map()
  private batchQueue: BatchRequest[][] = []
  private activeBatches: Set<string> = new Set()
  private logger = createLogger('APIBatchService')
  private batchTimer: NodeJS.Timeout | null = null

  private config: BatchConfig = {
    maxBatchSize: 10,
    batchTimeout: 100, // ms
    maxConcurrentBatches: 3,
    retryPolicy: {
      maxAttempts: 3,
      backoffMultiplier: 2,
      initialDelay: 1000
    },
    priorityWeights: {
      high: 1,
      medium: 2,
      low: 3
    }
  }

  constructor(config?: Partial<BatchConfig>) {
    if (config) {
      this.config = { ...this.config, ...config }
    }
    this.logger.info('API Batch Service initialized', this.config)
  }

  /**
   * Add a request to the batch queue
   */
  async addRequest(request: BatchRequest): Promise<BatchResponse> {
    return new Promise((resolve, reject) => {
      const requestWithCallback = {
        ...request,
        resolve,
        reject,
        timestamp: Date.now()
      }

      this.pendingRequests.set(request.id, requestWithCallback as any)
      this.scheduleProcessing()

      // Set individual timeout
      const timeout = request.timeout || 30000
      setTimeout(() => {
        if (this.pendingRequests.has(request.id)) {
          this.pendingRequests.delete(request.id)
          reject(new Error('Request timeout'))
        }
      }, timeout)
    })
  }

  /**
   * Add multiple requests as a batch
   */
  async addBatch(requests: BatchRequest[]): Promise<BatchResponse[]> {
    const promises = requests.map(request => this.addRequest(request))
    return Promise.allSettled(promises).then(results =>
      results.map((result, index) => {
        if (result.status === 'fulfilled') {
          return result.value
        } else {
          return {
            id: requests[index].id,
            success: false,
            error: result.reason.message,
            duration: 0
          }
        }
      })
    )
  }

  /**
   * Schedule batch processing
   */
  private scheduleProcessing(): void {
    if (this.batchTimer) {
      return
    }

    this.batchTimer = setTimeout(() => {
      this.processPendingRequests()
      this.batchTimer = null
    }, this.config.batchTimeout)
  }

  /**
   * Process pending requests into batches
   */
  private async processPendingRequests(): Promise<void> {
    if (this.pendingRequests.size === 0) {
      return
    }

    // Convert to array and sort by priority
    const requests = Array.from(this.pendingRequests.values()).sort((a, b) => {
      const priorityDiff = this.config.priorityWeights[a.priority] - this.config.priorityWeights[b.priority]
      if (priorityDiff !== 0) return priorityDiff

      // Secondary sort by timestamp (FIFO for same priority)
      return (a as any).timestamp - (b as any).timestamp
    })

    // Group requests by provider and method for optimal batching
    const batches = this.createOptimalBatches(requests)

    // Process batches concurrently up to the limit
    const processingPromises: Promise<void>[] = []

    for (const batch of batches) {
      if (this.activeBatches.size >= this.config.maxConcurrentBatches) {
        // Wait for a slot to become available
        await Promise.race(Array.from(this.activeBatches).map(id =>
          this.waitForBatchCompletion(id)
        ))
      }

      const batchId = this.generateBatchId()
      this.activeBatches.add(batchId)

      const promise = this.executeBatch(batchId, batch)
        .finally(() => {
          this.activeBatches.delete(batchId)
        })

      processingPromises.push(promise)
    }

    // Wait for all batches to complete
    await Promise.all(processingPromises)
  }

  /**
   * Create optimal batches from requests
   */
  private createOptimalBatches(requests: BatchRequest[]): BatchRequest[][] {
    const batches: BatchRequest[][] = []
    const providerGroups = new Map<string, BatchRequest[]>()

    // Group by provider and method
    for (const request of requests) {
      const provider = this.extractProvider(request.url)
      const key = `${provider}-${request.method}`

      if (!providerGroups.has(key)) {
        providerGroups.set(key, [])
      }
      providerGroups.get(key)!.push(request)
    }

    // Create batches within each group
    providerGroups.forEach((groupRequests, key) => {
      const groupBatches = this.splitIntoBatches(groupRequests, this.config.maxBatchSize)
      batches.push(...groupBatches)
    })

    return batches
  }

  /**
   * Split requests into batches of maximum size
   */
  private splitIntoBatches(requests: BatchRequest[], maxSize: number): BatchRequest[][] {
    const batches: BatchRequest[][] = []

    for (let i = 0; i < requests.length; i += maxSize) {
      batches.push(requests.slice(i, i + maxSize))
    }

    return batches
  }

  /**
   * Execute a batch of requests
   */
  private async executeBatch(batchId: string, batch: BatchRequest[]): Promise<void> {
    const startTime = Date.now()
    this.logger.debug('Executing batch', { batchId, requestCount: batch.length })

    try {
      // Execute requests in parallel within the batch
      const requestPromises = batch.map(request => this.executeRequest(request))
      const results = await Promise.allSettled(requestPromises)

      // Process results and resolve/reject individual promises
      results.forEach((result, index) => {
        const request = batch[index] as any
        const duration = Date.now() - startTime

        if (result.status === 'fulfilled') {
          const response: BatchResponse = {
            id: request.id,
            success: true,
            data: result.value,
            duration
          }
          request.resolve(response)
        } else {
          const response: BatchResponse = {
            id: request.id,
            success: false,
            error: result.reason.message,
            duration
          }

          // Check if we should retry
          if (this.shouldRetry(request, result.reason)) {
            this.scheduleRetry(request)
          } else {
            request.reject(new Error(result.reason.message))
          }
        }

        // Remove from pending requests
        this.pendingRequests.delete(request.id)
      })

      this.logger.success('Batch executed successfully', {
        batchId,
        requestCount: batch.length,
        duration: Date.now() - startTime
      })

    } catch (error) {
      this.logger.error('Batch execution failed', error as Error, { batchId })

      // Reject all requests in the batch
      batch.forEach(request => {
        const requestWithCallback = request as any
        requestWithCallback.reject(error)
        this.pendingRequests.delete(request.id)
      })
    }
  }

  /**
   * Execute a single request
   */
  private async executeRequest(request: BatchRequest): Promise<any> {
    const startTime = Date.now()

    try {
      // This would be implemented with your specific HTTP client
      // For now, we'll simulate the request
      const response = await this.makeHttpRequest(request)

      this.logger.debug('Request executed', {
        id: request.id,
        method: request.method,
        url: request.url,
        duration: Date.now() - startTime,
        status: response.status
      })

      return response.data

    } catch (error) {
      this.logger.error('Request failed', error as Error, {
        id: request.id,
        method: request.method,
        url: request.url,
        duration: Date.now() - startTime
      })
      throw error
    }
  }

  /**
   * Make HTTP request (to be implemented with your HTTP client)
   */
  private async makeHttpRequest(request: BatchRequest): Promise<{ status: number; data: any }> {
    // This is a placeholder - implement with your actual HTTP client
    // (axios, fetch, etc.)

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, Math.random() * 100))

    // Simulate occasional failures for testing retry logic
    if (Math.random() < 0.1) {
      throw new Error('Simulated network error')
    }

    return {
      status: 200,
      data: { success: true, id: request.id }
    }
  }

  /**
   * Check if a request should be retried
   */
  private shouldRetry(request: BatchRequest, error: any): boolean {
    if (!request.retry) {
      return false
    }

    const attempt = (request as any).attempt || 0
    return attempt < request.retry.attempts
  }

  /**
   * Schedule a request for retry
   */
  private scheduleRetry(request: BatchRequest): void {
    const attempt = ((request as any).attempt || 0) + 1
    const delay = this.calculateRetryDelay(attempt, request.retry?.backoff || this.config.retryPolicy.initialDelay)

    setTimeout(() => {
      const retryRequest = {
        ...request,
        attempt
      } as any

      this.pendingRequests.set(request.id, retryRequest)
      this.scheduleProcessing()
    }, delay)
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(attempt: number, baseDelay: number): number {
    const delay = baseDelay * Math.pow(this.config.retryPolicy.backoffMultiplier, attempt - 1)
    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 0.1 * delay
    return delay + jitter
  }

  /**
   * Extract provider from URL
   */
  private extractProvider(url: string): string {
    if (url.includes('graph.microsoft')) return 'microsoft'
    if (url.includes('googleapis.com')) return 'google'
    return 'unknown'
  }

  /**
   * Generate unique batch ID
   */
  private generateBatchId(): string {
    return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Wait for batch completion
   */
  private async waitForBatchCompletion(batchId: string): Promise<void> {
    return new Promise(resolve => {
      const checkCompletion = () => {
        if (!this.activeBatches.has(batchId)) {
          resolve()
        } else {
          setTimeout(checkCompletion, 10)
        }
      }
      checkCompletion()
    })
  }

  /**
   * Get current statistics
   */
  getStatistics(): {
    pendingRequests: number
    activeBatches: number
    queuedBatches: number
  } {
    return {
      pendingRequests: this.pendingRequests.size,
      activeBatches: this.activeBatches.size,
      queuedBatches: this.batchQueue.length
    }
  }

  /**
   * Clear all pending requests
   */
  clearPending(): void {
    this.pendingRequests.forEach((request) => {
      (request as any).reject(new Error('Service shutdown'))
    })
    this.pendingRequests.clear()

    if (this.batchTimer) {
      clearTimeout(this.batchTimer)
      this.batchTimer = null
    }
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<BatchConfig>): void {
    this.config = { ...this.config, ...newConfig }
    this.logger.info('Batch service configuration updated', this.config)
  }
}

// Specialized batching for calendar operations
export class CalendarBatchService extends APIBatchService {
  constructor() {
    super({
      maxBatchSize: 15, // Larger batches for calendar data
      batchTimeout: 50, // Faster batching for calendar
      maxConcurrentBatches: 5,
      priorityWeights: {
        high: 1,   // Current view events
        medium: 2, // Adjacent periods
        low: 3     // Background preloading
      }
    })
  }

  /**
   * Batch calendar events requests
   */
  async batchEventsRequests(
    requests: Array<{
      accountId: string
      startDate: Date
      endDate: Date
      priority?: 'high' | 'medium' | 'low'
    }>
  ): Promise<BatchResponse[]> {
    const batchRequests: BatchRequest[] = requests.map((req, index) => ({
      id: `events_${req.accountId}_${index}_${Date.now()}`,
      method: 'GET',
      url: `/calendar/events?account=${req.accountId}&start=${req.startDate.toISOString()}&end=${req.endDate.toISOString()}`,
      priority: req.priority || 'medium',
      timeout: 15000
    }))

    return this.addBatch(batchRequests)
  }

  /**
   * Batch calendar creation requests
   */
  async batchCreateRequests(
    requests: Array<{
      accountId: string
      eventData: any
      priority?: 'high' | 'medium' | 'low'
    }>
  ): Promise<BatchResponse[]> {
    const batchRequests: BatchRequest[] = requests.map((req, index) => ({
      id: `create_${req.accountId}_${index}_${Date.now()}`,
      method: 'POST',
      url: `/calendar/events`,
      body: { accountId: req.accountId, ...req.eventData },
      priority: req.priority || 'high',
      timeout: 20000
    }))

    return this.addBatch(batchRequests)
  }
}

export default APIBatchService