/* eslint-disable no-console */
// Centralized logging utility for backend services.
// debug/info are gated to development; warn/error/success always emit.

const isDev = process.env.NODE_ENV !== 'production'

export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug',
}

export interface ILogEntry {
  timestamp: string
  level: LogLevel
  service: string
  message: string
  data?: unknown
  error?: Error
}

class Logger {
  private serviceName: string

  constructor(serviceName: string) {
    this.serviceName = serviceName
  }

  private format(level: LogLevel, message: string): string {
    return `[${new Date().toISOString()}] [${level.toUpperCase()}] [${this.serviceName}] ${message}`
  }

  error(message: string, errorOrData?: unknown, ...rest: unknown[]): void {
    const formatted = this.format(LogLevel.ERROR, message)
    if (errorOrData instanceof Error) {
      console.error('❌', formatted, errorOrData, ...rest)
    } else if (errorOrData !== undefined) {
      console.error('❌', formatted, errorOrData, ...rest)
    } else {
      console.error('❌', formatted)
    }
  }

  warn(message: string, ...rest: unknown[]): void {
    console.warn('⚠️', this.format(LogLevel.WARN, message), ...rest)
  }

  info(message: string, ...rest: unknown[]): void {
    if (!isDev) return
    console.log('ℹ️', this.format(LogLevel.INFO, message), ...rest)
  }

  debug(message: string, ...rest: unknown[]): void {
    if (!isDev) return
    console.debug('🐛', this.format(LogLevel.DEBUG, message), ...rest)
  }

  success(message: string, ...rest: unknown[]): void {
    console.log('✅', this.format(LogLevel.INFO, message).replace('[INFO]', '[SUCCESS]'), ...rest)
  }
}

export function createLogger(serviceName: string): Logger {
  return new Logger(serviceName)
}

export const conversationLogger = createLogger('ConversationService')
export const aiProviderLogger = createLogger('AIProviderService')
export const databaseLogger = createLogger('DatabaseService')
export const authLogger = createLogger('AuthService')
export const appLogger = createLogger('Application')
