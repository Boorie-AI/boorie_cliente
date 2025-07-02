// Error Handling Service - Comprehensive error management for calendar operations

export enum ErrorType {
  // Network errors
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  OFFLINE_ERROR = 'OFFLINE_ERROR',
  
  // Authentication errors
  AUTH_EXPIRED = 'AUTH_EXPIRED',
  AUTH_INVALID = 'AUTH_INVALID',
  AUTH_MISSING = 'AUTH_MISSING',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  
  // API errors
  RATE_LIMITED = 'RATE_LIMITED',
  SERVER_ERROR = 'SERVER_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  
  // Calendar specific errors
  CALENDAR_NOT_FOUND = 'CALENDAR_NOT_FOUND',
  EVENT_NOT_FOUND = 'EVENT_NOT_FOUND',
  ACCOUNT_DISCONNECTED = 'ACCOUNT_DISCONNECTED',
  SYNC_FAILED = 'SYNC_FAILED',
  PROVIDER_ERROR = 'PROVIDER_ERROR',
  
  // Application errors
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  CLIENT_ERROR = 'CLIENT_ERROR'
}

export enum ErrorSeverity {
  LOW = 'LOW',           // Minor issues, app continues to work
  MEDIUM = 'MEDIUM',     // Some features may be affected
  HIGH = 'HIGH',         // Major functionality broken
  CRITICAL = 'CRITICAL'  // App may be unusable
}

export interface CalendarError {
  type: ErrorType
  severity: ErrorSeverity
  message: string
  details?: any
  timestamp: Date
  context?: {
    operation?: string
    accountId?: string
    eventId?: string
    provider?: 'microsoft' | 'google'
    component?: string
    userId?: string
  }
  retryable: boolean
  retryAfter?: number // seconds
  actionable: boolean
  userMessage: string
  technicalMessage: string
  correlationId: string
  stack?: string
}

export interface ErrorRecoveryAction {
  label: string
  action: () => Promise<void> | void
  primary?: boolean
}

export interface ErrorHandlingConfig {
  enableRetry: boolean
  maxRetryAttempts: number
  retryDelay: number
  enableReporting: boolean
  enableUserNotifications: boolean
  logLevel: 'error' | 'warn' | 'info' | 'debug'
}

export class CalendarErrorHandler {
  private static instance: CalendarErrorHandler
  private config: ErrorHandlingConfig
  private errorHistory: CalendarError[] = []
  private listeners: Array<(error: CalendarError) => void> = []

  private constructor(config?: Partial<ErrorHandlingConfig>) {
    this.config = {
      enableRetry: true,
      maxRetryAttempts: 3,
      retryDelay: 1000,
      enableReporting: true,
      enableUserNotifications: true,
      logLevel: 'error',
      ...config
    }
  }

  static getInstance(config?: Partial<ErrorHandlingConfig>): CalendarErrorHandler {
    if (!CalendarErrorHandler.instance) {
      CalendarErrorHandler.instance = new CalendarErrorHandler(config)
    }
    return CalendarErrorHandler.instance
  }

  /**
   * Handle and process calendar errors
   */
  async handleError(
    error: Error | any,
    context?: CalendarError['context']
  ): Promise<CalendarError> {
    const calendarError = this.createCalendarError(error, context)
    
    // Store error in history
    this.errorHistory.push(calendarError)
    this.cleanupErrorHistory()

    // Log error
    this.logError(calendarError)

    // Report error if enabled
    if (this.config.enableReporting) {
      await this.reportError(calendarError)
    }

    // Notify listeners
    this.notifyListeners(calendarError)

    return calendarError
  }

  /**
   * Create standardized CalendarError from various error types
   */
  private createCalendarError(
    error: Error | any,
    context?: CalendarError['context']
  ): CalendarError {
    const correlationId = this.generateCorrelationId()
    const timestamp = new Date()

    // Determine error type and details
    const { type, severity, retryable, retryAfter } = this.categorizeError(error)

    // Generate user-friendly message
    const userMessage = this.generateUserMessage(type, error)
    const technicalMessage = this.generateTechnicalMessage(error)

    return {
      type,
      severity,
      message: error.message || 'An unknown error occurred',
      details: this.extractErrorDetails(error),
      timestamp,
      context,
      retryable,
      retryAfter,
      actionable: this.isActionable(type),
      userMessage,
      technicalMessage,
      correlationId,
      stack: error.stack
    }
  }

  /**
   * Categorize error based on type and properties
   */
  private categorizeError(error: any): {
    type: ErrorType
    severity: ErrorSeverity
    retryable: boolean
    retryAfter?: number
  } {
    // Network errors
    if (error.code === 'NETWORK_ERROR' || error.name === 'NetworkError') {
      return {
        type: ErrorType.NETWORK_ERROR,
        severity: ErrorSeverity.MEDIUM,
        retryable: true
      }
    }

    if (error.code === 'TIMEOUT' || error.name === 'TimeoutError') {
      return {
        type: ErrorType.TIMEOUT_ERROR,
        severity: ErrorSeverity.MEDIUM,
        retryable: true
      }
    }

    // HTTP status code based categorization
    if (error.status || error.statusCode) {
      const status = error.status || error.statusCode

      switch (status) {
        case 401:
          return {
            type: ErrorType.AUTH_EXPIRED,
            severity: ErrorSeverity.HIGH,
            retryable: false
          }
        case 403:
          return {
            type: ErrorType.PERMISSION_DENIED,
            severity: ErrorSeverity.HIGH,
            retryable: false
          }
        case 404:
          return {
            type: ErrorType.NOT_FOUND,
            severity: ErrorSeverity.MEDIUM,
            retryable: false
          }
        case 409:
          return {
            type: ErrorType.CONFLICT,
            severity: ErrorSeverity.MEDIUM,
            retryable: true
          }
        case 429:
          return {
            type: ErrorType.RATE_LIMITED,
            severity: ErrorSeverity.MEDIUM,
            retryable: true,
            retryAfter: error.retryAfter || 60
          }
        case 500:
        case 502:
        case 503:
        case 504:
          return {
            type: ErrorType.SERVER_ERROR,
            severity: ErrorSeverity.HIGH,
            retryable: true
          }
        default:
          if (status >= 400 && status < 500) {
            return {
              type: ErrorType.CLIENT_ERROR,
              severity: ErrorSeverity.MEDIUM,
              retryable: false
            }
          }
      }
    }

    // Calendar specific errors
    if (error.message?.includes('calendar') && error.message?.includes('not found')) {
      return {
        type: ErrorType.CALENDAR_NOT_FOUND,
        severity: ErrorSeverity.MEDIUM,
        retryable: false
      }
    }

    if (error.message?.includes('event') && error.message?.includes('not found')) {
      return {
        type: ErrorType.EVENT_NOT_FOUND,
        severity: ErrorSeverity.LOW,
        retryable: false
      }
    }

    if (error.message?.includes('account') && error.message?.includes('disconnect')) {
      return {
        type: ErrorType.ACCOUNT_DISCONNECTED,
        severity: ErrorSeverity.HIGH,
        retryable: false
      }
    }

    // Default case
    return {
      type: ErrorType.UNKNOWN_ERROR,
      severity: ErrorSeverity.MEDIUM,
      retryable: true
    }
  }

  /**
   * Generate user-friendly error message
   */
  private generateUserMessage(type: ErrorType, error: any): string {
    const messages: Record<ErrorType, string> = {
      [ErrorType.NETWORK_ERROR]: 'Unable to connect to the server. Please check your internet connection.',
      [ErrorType.TIMEOUT_ERROR]: 'The request timed out. Please try again.',
      [ErrorType.OFFLINE_ERROR]: 'You appear to be offline. Please check your internet connection.',
      [ErrorType.AUTH_EXPIRED]: 'Your session has expired. Please sign in again.',
      [ErrorType.AUTH_INVALID]: 'Authentication failed. Please sign in again.',
      [ErrorType.AUTH_MISSING]: 'You need to sign in to access this feature.',
      [ErrorType.PERMISSION_DENIED]: 'You don\'t have permission to perform this action.',
      [ErrorType.RATE_LIMITED]: 'Too many requests. Please wait a moment and try again.',
      [ErrorType.SERVER_ERROR]: 'Server error occurred. Please try again later.',
      [ErrorType.NOT_FOUND]: 'The requested item could not be found.',
      [ErrorType.CONFLICT]: 'There was a conflict with your request. Please refresh and try again.',
      [ErrorType.VALIDATION_ERROR]: 'Please check your input and try again.',
      [ErrorType.CALENDAR_NOT_FOUND]: 'Calendar not found. It may have been deleted or moved.',
      [ErrorType.EVENT_NOT_FOUND]: 'Event not found. It may have been deleted or moved.',
      [ErrorType.ACCOUNT_DISCONNECTED]: 'Your account has been disconnected. Please reconnect to continue.',
      [ErrorType.SYNC_FAILED]: 'Failed to sync calendar data. Please try again.',
      [ErrorType.PROVIDER_ERROR]: 'Calendar provider error. Please try again later.',
      [ErrorType.UNKNOWN_ERROR]: 'An unexpected error occurred. Please try again.',
      [ErrorType.CONFIGURATION_ERROR]: 'Configuration error. Please contact support.',
      [ErrorType.CLIENT_ERROR]: 'Something went wrong. Please try again.'
    }

    return messages[type] || 'An error occurred. Please try again.'
  }

  /**
   * Generate technical error message for debugging
   */
  private generateTechnicalMessage(error: any): string {
    const parts = []
    
    if (error.name) parts.push(`${error.name}`)
    if (error.message) parts.push(`${error.message}`)
    if (error.status || error.statusCode) parts.push(`Status: ${error.status || error.statusCode}`)
    if (error.code) parts.push(`Code: ${error.code}`)
    
    return parts.join(' | ') || 'Unknown error'
  }

  /**
   * Extract relevant error details
   */
  private extractErrorDetails(error: any): any {
    const details: any = {}
    
    if (error.response) {
      details.response = {
        status: error.response.status,
        statusText: error.response.statusText,
        headers: error.response.headers,
        data: error.response.data
      }
    }
    
    if (error.request) {
      details.request = {
        method: error.request.method,
        url: error.request.url,
        headers: error.request.headers
      }
    }
    
    if (error.config) {
      details.config = {
        method: error.config.method,
        url: error.config.url,
        timeout: error.config.timeout
      }
    }

    // Additional properties
    const additionalProps = ['code', 'errno', 'syscall', 'address', 'port']
    additionalProps.forEach(prop => {
      if (error[prop] !== undefined) {
        details[prop] = error[prop]
      }
    })
    
    return details
  }

  /**
   * Check if error type is actionable by user
   */
  private isActionable(type: ErrorType): boolean {
    const actionableTypes = [
      ErrorType.AUTH_EXPIRED,
      ErrorType.AUTH_INVALID,
      ErrorType.AUTH_MISSING,
      ErrorType.ACCOUNT_DISCONNECTED,
      ErrorType.NETWORK_ERROR,
      ErrorType.OFFLINE_ERROR
    ]
    
    return actionableTypes.includes(type)
  }

  /**
   * Get recovery actions for an error
   */
  getRecoveryActions(error: CalendarError): ErrorRecoveryAction[] {
    const actions: ErrorRecoveryAction[] = []

    switch (error.type) {
      case ErrorType.AUTH_EXPIRED:
      case ErrorType.AUTH_INVALID:
        actions.push({
          label: 'Sign In Again',
          action: () => this.triggerReauth(),
          primary: true
        })
        break

      case ErrorType.ACCOUNT_DISCONNECTED:
        actions.push({
          label: 'Reconnect Account',
          action: () => this.triggerAccountReconnect(error.context?.accountId),
          primary: true
        })
        break

      case ErrorType.NETWORK_ERROR:
      case ErrorType.TIMEOUT_ERROR:
        actions.push({
          label: 'Retry',
          action: () => this.triggerRetry(error),
          primary: true
        })
        actions.push({
          label: 'Check Connection',
          action: () => this.checkNetworkConnection()
        })
        break

      case ErrorType.RATE_LIMITED:
        actions.push({
          label: `Retry in ${error.retryAfter || 60}s`,
          action: () => this.scheduleRetry(error),
          primary: true
        })
        break

      case ErrorType.SYNC_FAILED:
        actions.push({
          label: 'Retry Sync',
          action: () => this.triggerSync(error.context?.accountId),
          primary: true
        })
        break
    }

    // Always provide a refresh option
    if (error.retryable) {
      actions.push({
        label: 'Refresh',
        action: () => window.location.reload()
      })
    }

    return actions
  }

  /**
   * Log error based on configuration
   */
  private logError(error: CalendarError): void {
    const logData = {
      correlationId: error.correlationId,
      type: error.type,
      severity: error.severity,
      message: error.technicalMessage,
      context: error.context,
      timestamp: error.timestamp,
      stack: error.stack
    }

    switch (error.severity) {
      case ErrorSeverity.CRITICAL:
      case ErrorSeverity.HIGH:
        console.error('Calendar Error:', logData)
        break
      case ErrorSeverity.MEDIUM:
        console.warn('Calendar Warning:', logData)
        break
      case ErrorSeverity.LOW:
        console.info('Calendar Info:', logData)
        break
    }
  }

  /**
   * Report error to monitoring service
   */
  private async reportError(error: CalendarError): Promise<void> {
    try {
      // This would integrate with your error reporting service
      // (Sentry, LogRocket, etc.)
      
      // Example implementation:
      // await errorReportingService.captureException({
      //   message: error.technicalMessage,
      //   level: error.severity.toLowerCase(),
      //   extra: {
      //     correlationId: error.correlationId,
      //     context: error.context,
      //     details: error.details
      //   },
      //   tags: {
      //     errorType: error.type,
      //     component: 'calendar'
      //   }
      // })

      console.debug('Error reported:', error.correlationId)
    } catch (reportingError) {
      console.error('Failed to report error:', reportingError)
    }
  }

  /**
   * Add error listener
   */
  addErrorListener(listener: (error: CalendarError) => void): void {
    this.listeners.push(listener)
  }

  /**
   * Remove error listener
   */
  removeErrorListener(listener: (error: CalendarError) => void): void {
    const index = this.listeners.indexOf(listener)
    if (index > -1) {
      this.listeners.splice(index, 1)
    }
  }

  /**
   * Notify all error listeners
   */
  private notifyListeners(error: CalendarError): void {
    this.listeners.forEach(listener => {
      try {
        listener(error)
      } catch (err) {
        console.error('Error in error listener:', err)
      }
    })
  }

  /**
   * Get error history
   */
  getErrorHistory(): CalendarError[] {
    return [...this.errorHistory]
  }

  /**
   * Clean up old errors from history
   */
  private cleanupErrorHistory(): void {
    const maxHistorySize = 100
    const maxAge = 24 * 60 * 60 * 1000 // 24 hours

    const now = Date.now()
    this.errorHistory = this.errorHistory
      .filter(error => now - error.timestamp.getTime() < maxAge)
      .slice(-maxHistorySize)
  }

  /**
   * Generate unique correlation ID
   */
  private generateCorrelationId(): string {
    return `cal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  // Recovery action implementations
  private async triggerReauth(): Promise<void> {
    // Trigger reauthentication flow
    console.log('Triggering reauthentication...')
  }

  private async triggerAccountReconnect(accountId?: string): Promise<void> {
    // Trigger account reconnection
    console.log('Triggering account reconnection for:', accountId)
  }

  private async triggerRetry(error: CalendarError): Promise<void> {
    // Trigger retry of the original operation
    console.log('Retrying operation for error:', error.correlationId)
  }

  private async checkNetworkConnection(): Promise<void> {
    // Check and display network connection status
    console.log('Checking network connection...')
  }

  private async scheduleRetry(error: CalendarError): Promise<void> {
    // Schedule retry after the specified delay
    const delay = (error.retryAfter || 60) * 1000
    setTimeout(() => this.triggerRetry(error), delay)
  }

  private async triggerSync(accountId?: string): Promise<void> {
    // Trigger calendar sync
    console.log('Triggering sync for account:', accountId)
  }
}

export default CalendarErrorHandler