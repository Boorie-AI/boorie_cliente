// Retry Mechanism Service - Intelligent retry strategies for failed API calls

export interface RetryConfig {
  maxAttempts: number
  baseDelay: number
  maxDelay: number
  backoffMultiplier: number
  jitterEnabled: boolean
  retryableErrors: string[]
  retryableStatuses: number[]
  timeout: number
}

export interface RetryAttempt {
  attempt: number
  delay: number
  error: any
  timestamp: Date
}

export interface RetryResult<T> {
  success: boolean
  data?: T
  error?: any
  attempts: RetryAttempt[]
  totalTime: number
  finalAttempt: number
}

export enum RetryStrategy {
  EXPONENTIAL = 'EXPONENTIAL',
  LINEAR = 'LINEAR',
  FIXED = 'FIXED',
  FIBONACCI = 'FIBONACCI'
}

export class RetryMechanism {
  protected config: RetryConfig
  private strategy: RetryStrategy

  constructor(config?: Partial<RetryConfig>, strategy: RetryStrategy = RetryStrategy.EXPONENTIAL) {
    this.strategy = strategy
    this.config = {
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      backoffMultiplier: 2,
      jitterEnabled: true,
      retryableErrors: [
        'NETWORK_ERROR',
        'TIMEOUT_ERROR',
        'ECONNRESET',
        'ENOTFOUND',
        'ETIMEDOUT',
        'ECONNREFUSED'
      ],
      retryableStatuses: [429, 500, 502, 503, 504],
      timeout: 30000,
      ...config
    }
  }

  /**
   * Execute a function with retry mechanism
   */
  async execute<T>(
    operation: () => Promise<T>,
    context?: string
  ): Promise<RetryResult<T>> {
    const startTime = Date.now()
    const attempts: RetryAttempt[] = []
    let lastError: any

    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      try {
        const result = await this.executeWithTimeout(operation, this.config.timeout)
        
        return {
          success: true,
          data: result,
          attempts,
          totalTime: Date.now() - startTime,
          finalAttempt: attempt
        }
      } catch (error) {
        lastError = error
        const attemptInfo: RetryAttempt = {
          attempt,
          delay: 0,
          error: this.sanitizeError(error),
          timestamp: new Date()
        }
        
        attempts.push(attemptInfo)

        // Check if error is retryable
        if (!this.isRetryableError(error) || attempt >= this.config.maxAttempts) {
          break
        }

        // Calculate delay for next attempt
        const delay = this.calculateDelay(attempt)
        attemptInfo.delay = delay

        console.warn(`Retry attempt ${attempt}/${this.config.maxAttempts} failed for ${context || 'operation'}:`, {
          error: error instanceof Error ? error.message : String(error),
          nextRetryIn: delay,
          strategy: this.strategy
        })

        // Wait before next attempt
        await this.sleep(delay)
      }
    }

    return {
      success: false,
      error: lastError,
      attempts,
      totalTime: Date.now() - startTime,
      finalAttempt: attempts.length
    }
  }

  /**
   * Check if an error is retryable
   */
  private isRetryableError(error: any): boolean {
    // Check error codes
    if (error.code && this.config.retryableErrors.includes(error.code)) {
      return true
    }

    // Check HTTP status codes
    if (error.status && this.config.retryableStatuses.includes(error.status)) {
      return true
    }

    if (error.response?.status && this.config.retryableStatuses.includes(error.response.status)) {
      return true
    }

    // Check error messages
    const errorMessage = error.message?.toLowerCase() || ''
    const retryableMessages = [
      'network error',
      'timeout',
      'connection',
      'socket',
      'econnreset',
      'enotfound',
      'etimedout'
    ]

    return retryableMessages.some(msg => errorMessage.includes(msg))
  }

  /**
   * Calculate delay based on retry strategy
   */
  protected calculateDelay(attempt: number): number {
    let delay: number

    switch (this.strategy) {
      case RetryStrategy.EXPONENTIAL:
        delay = this.config.baseDelay * Math.pow(this.config.backoffMultiplier, attempt - 1)
        break
      
      case RetryStrategy.LINEAR:
        delay = this.config.baseDelay * attempt
        break
      
      case RetryStrategy.FIXED:
        delay = this.config.baseDelay
        break
      
      case RetryStrategy.FIBONACCI:
        delay = this.config.baseDelay * this.fibonacci(attempt)
        break
      
      default:
        delay = this.config.baseDelay * Math.pow(this.config.backoffMultiplier, attempt - 1)
    }

    // Apply max delay cap
    delay = Math.min(delay, this.config.maxDelay)

    // Add jitter if enabled
    if (this.config.jitterEnabled) {
      const jitter = delay * 0.1 * Math.random()
      delay += jitter
    }

    return Math.floor(delay)
  }

  /**
   * Execute operation with timeout
   */
  private async executeWithTimeout<T>(
    operation: () => Promise<T>,
    timeout: number
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeout}ms`))
      }, timeout)

      operation()
        .then(result => {
          clearTimeout(timer)
          resolve(result)
        })
        .catch(error => {
          clearTimeout(timer)
          reject(error)
        })
    })
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Calculate Fibonacci number
   */
  private fibonacci(n: number): number {
    if (n <= 1) return 1
    if (n === 2) return 1
    
    let a = 1, b = 1
    for (let i = 3; i <= n; i++) {
      [a, b] = [b, a + b]
    }
    return b
  }

  /**
   * Sanitize error for logging
   */
  private sanitizeError(error: any): any {
    return {
      message: error.message,
      code: error.code,
      status: error.status || error.response?.status,
      name: error.name,
      stack: error.stack?.split('\n').slice(0, 3).join('\n') // Limit stack trace
    }
  }
}

// Calendar-specific retry service
export class CalendarRetryService {
  private retryMechanism: RetryMechanism
  private circuitBreaker: CircuitBreaker

  constructor() {
    this.retryMechanism = new RetryMechanism({
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2,
      jitterEnabled: true,
      retryableStatuses: [429, 500, 502, 503, 504, 408],
      timeout: 15000
    })

    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      resetTimeout: 60000,
      monitoringPeriod: 30000
    })
  }

  /**
   * Retry calendar event operations
   */
  async retryEventOperation<T>(
    operation: () => Promise<T>,
    operationType: string,
    context?: { accountId?: string; eventId?: string }
  ): Promise<T> {
    const operationKey = `${operationType}_${context?.accountId || 'unknown'}`
    
    // Check circuit breaker
    if (this.circuitBreaker.isOpen(operationKey)) {
      throw new Error(`Circuit breaker is open for ${operationType}. Service temporarily unavailable.`)
    }

    try {
      const result = await this.retryMechanism.execute(operation, operationType)
      
      if (result.success) {
        this.circuitBreaker.recordSuccess(operationKey)
        return result.data!
      } else {
        this.circuitBreaker.recordFailure(operationKey)
        throw result.error
      }
    } catch (error) {
      this.circuitBreaker.recordFailure(operationKey)
      throw error
    }
  }

  /**
   * Retry with rate limit handling
   */
  async retryWithRateLimit<T>(
    operation: () => Promise<T>,
    operationType: string,
    maxRetryAfter: number = 300 // 5 minutes
  ): Promise<T> {
    const retryConfig: Partial<RetryConfig> = {
      maxAttempts: 5,
      baseDelay: 1000,
      maxDelay: maxRetryAfter * 1000,
      backoffMultiplier: 1.5
    }

    const retryMechanism = new RetryMechanism(retryConfig)
    
    const result = await retryMechanism.execute(async () => {
      try {
        return await operation()
      } catch (error: unknown) {
        // Handle rate limiting specifically
        if (error && typeof error === 'object' && 'status' in error && error.status === 429) {
          const errorObj = error as any
          const retryAfter = errorObj.headers?.['retry-after'] || errorObj.retryAfter
          if (retryAfter && parseInt(retryAfter) <= maxRetryAfter) {
            // Throw with specific retry delay
            const retryError = new Error('Rate limited')
            ;(retryError as any).retryAfter = parseInt(retryAfter) * 1000
            throw retryError
          }
        }
        throw error
      }
    }, operationType)

    if (result.success) {
      return result.data!
    } else {
      throw result.error
    }
  }

  /**
   * Get retry statistics
   */
  getRetryStats(): any {
    return this.circuitBreaker.getStats()
  }
}

// Circuit Breaker implementation
interface CircuitBreakerConfig {
  failureThreshold: number
  resetTimeout: number
  monitoringPeriod: number
}

enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

interface CircuitStats {
  failures: number
  successes: number
  lastFailure?: Date
  lastSuccess?: Date
  state: CircuitState
}

class CircuitBreaker {
  private config: CircuitBreakerConfig
  private circuits: Map<string, CircuitStats> = new Map()

  constructor(config: CircuitBreakerConfig) {
    this.config = config
  }

  isOpen(key: string): boolean {
    const circuit = this.getCircuit(key)
    
    if (circuit.state === CircuitState.OPEN) {
      // Check if we should try half-open
      const timeSinceLastFailure = Date.now() - (circuit.lastFailure?.getTime() || 0)
      if (timeSinceLastFailure >= this.config.resetTimeout) {
        circuit.state = CircuitState.HALF_OPEN
        return false
      }
      return true
    }
    
    return false
  }

  recordSuccess(key: string): void {
    const circuit = this.getCircuit(key)
    circuit.successes++
    circuit.lastSuccess = new Date()
    
    // Reset circuit if it was half-open
    if (circuit.state === CircuitState.HALF_OPEN) {
      circuit.state = CircuitState.CLOSED
      circuit.failures = 0
    }
  }

  recordFailure(key: string): void {
    const circuit = this.getCircuit(key)
    circuit.failures++
    circuit.lastFailure = new Date()
    
    // Open circuit if threshold exceeded
    if (circuit.failures >= this.config.failureThreshold) {
      circuit.state = CircuitState.OPEN
    }
  }

  private getCircuit(key: string): CircuitStats {
    if (!this.circuits.has(key)) {
      this.circuits.set(key, {
        failures: 0,
        successes: 0,
        state: CircuitState.CLOSED
      })
    }
    return this.circuits.get(key)!
  }

  getStats(): Record<string, CircuitStats> {
    const stats: Record<string, CircuitStats> = {}
    for (const [key, circuit] of this.circuits) {
      stats[key] = { ...circuit }
    }
    return stats
  }
}

// Exponential backoff with decorrelated jitter
export class DecorrelatedJitterRetry extends RetryMechanism {
  constructor(config?: Partial<RetryConfig>) {
    super(config, RetryStrategy.EXPONENTIAL)
  }

  protected calculateDelay(attempt: number, lastDelay: number = 0): number {
    const baseDelay = this.config.baseDelay
    const maxDelay = this.config.maxDelay
    
    // Decorrelated jitter formula
    const delay = Math.min(
      maxDelay,
      Math.random() * Math.min(maxDelay, baseDelay * Math.pow(3, attempt))
    )
    
    return Math.floor(delay)
  }
}

// Queue-based retry for batch operations
export class QueuedRetryService {
  private queue: Array<{
    operation: () => Promise<any>
    resolve: (value: any) => void
    reject: (error: any) => void
    attempts: number
    maxAttempts: number
    delay: number
  }> = []
  
  private processing = false
  private retryMechanism = new RetryMechanism()

  async addToQueue<T>(
    operation: () => Promise<T>,
    maxAttempts: number = 3
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        operation,
        resolve,
        reject,
        attempts: 0,
        maxAttempts,
        delay: 1000
      })
      
      this.processQueue()
    })
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) return
    
    this.processing = true
    
    while (this.queue.length > 0) {
      const item = this.queue.shift()!
      
      try {
        const result = await item.operation()
        item.resolve(result)
      } catch (error) {
        item.attempts++
        
        if (item.attempts < item.maxAttempts && this.retryMechanism['isRetryableError'](error)) {
          // Re-queue for retry
          item.delay *= 2 // Exponential backoff
          setTimeout(() => {
            this.queue.unshift(item)
            this.processQueue()
          }, item.delay)
        } else {
          item.reject(error)
        }
      }
    }
    
    this.processing = false
  }
}

export default RetryMechanism