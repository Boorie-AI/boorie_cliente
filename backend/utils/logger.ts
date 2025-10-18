// Centralized logging utility for backend services

export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug'
}

export interface ILogEntry {
  timestamp: string
  level: LogLevel
  service: string
  message: string
  data?: any
  error?: Error
}

class Logger {
  private serviceName: string

  constructor(serviceName: string) {
    this.serviceName = serviceName
  }

  private log(level: LogLevel, message: string, data?: any, error?: Error): void {
    const entry: ILogEntry = {
      timestamp: new Date().toISOString(),
      level,
      service: this.serviceName,
      message,
      data,
      error
    }

    // Format the log message
    const formattedMessage = `[${entry.timestamp}] [${level.toUpperCase()}] [${this.serviceName}] ${message}`
    
    // Log to console with appropriate level
    switch (level) {
      case LogLevel.ERROR:
        console.error('❌', formattedMessage, error || data || '')
        break
      case LogLevel.WARN:
        console.warn('⚠️', formattedMessage, data || '')
        break
      case LogLevel.INFO:
        console.log('ℹ️', formattedMessage, data || '')
        break
      case LogLevel.DEBUG:
        console.debug('🐛', formattedMessage, data || '')
        break
    }
  }

  error(message: string, errorOrData?: Error | string | any, data?: any): void {
    if (errorOrData instanceof Error) {
      this.log(LogLevel.ERROR, message, data, errorOrData)
    } else {
      this.log(LogLevel.ERROR, message, errorOrData)
    }
  }

  warn(message: string, data?: any): void {
    this.log(LogLevel.WARN, message, data)
  }

  info(message: string, data?: any): void {
    this.log(LogLevel.INFO, message, data)
  }

  debug(message: string, data?: any): void {
    this.log(LogLevel.DEBUG, message, data)
  }

  success(message: string, data?: any): void {
    const formattedMessage = `[${new Date().toISOString()}] [SUCCESS] [${this.serviceName}] ${message}`
    console.log('✅', formattedMessage, data || '')
  }
}

// Factory function to create loggers for different services
export function createLogger(serviceName: string): Logger {
  return new Logger(serviceName)
}

// Pre-configured loggers for common services
export const conversationLogger = createLogger('ConversationService')
export const aiProviderLogger = createLogger('AIProviderService')
export const databaseLogger = createLogger('DatabaseService')
export const authLogger = createLogger('AuthService')
export const appLogger = createLogger('Application')