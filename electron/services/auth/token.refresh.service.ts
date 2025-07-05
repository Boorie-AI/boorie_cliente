// Token Refresh Service - Handles automatic token refresh for all OAuth providers

import { tokenSecurityService } from '../security/token.security.service'
import { DatabaseService } from '../../../backend/services/database.service'
import { MicrosoftAuthService } from './microsoft.auth.service'
import { GoogleAuthService } from './google.auth.service'
import { databaseLogger } from '../../../backend/utils/logger'

export interface RefreshSchedule {
  provider: string
  expiresAt: Date
  refreshAt: Date
  timerId: NodeJS.Timeout
}

export class TokenRefreshService {
  private logger = databaseLogger
  private databaseService: DatabaseService
  private microsoftAuthService: MicrosoftAuthService
  private googleAuthService: GoogleAuthService
  private refreshSchedules: Map<string, RefreshSchedule> = new Map()
  private isRunning: boolean = false

  constructor(databaseService: DatabaseService) {
    this.databaseService = databaseService
    this.microsoftAuthService = new MicrosoftAuthService(databaseService)
    this.googleAuthService = new GoogleAuthService(databaseService)
    this.logger.info('Token Refresh Service initialized')
  }

  /**
   * Starts the token refresh service and schedules existing tokens
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Token refresh service already running')
      return
    }

    this.logger.info('Starting token refresh service')
    this.isRunning = true

    try {
      // Schedule refresh for all existing tokens
      await this.scheduleExistingTokens()
      
      this.logger.success('Token refresh service started successfully')
    } catch (error) {
      this.logger.error('Failed to start token refresh service', error as Error)
      this.isRunning = false
      throw error
    }
  }

  /**
   * Stops the token refresh service and clears all schedules
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      this.logger.warn('Token refresh service not running')
      return
    }

    this.logger.info('Stopping token refresh service')

    // Clear all scheduled timers
    this.clearAllSchedules()
    this.isRunning = false

    this.logger.success('Token refresh service stopped')
  }

  /**
   * Schedules token refresh for a specific provider
   */
  async scheduleTokenRefresh(provider: string): Promise<boolean> {
    try {
      this.logger.debug(`Scheduling token refresh for ${provider}`)

      // Get current token data
      const tokenData = await tokenSecurityService.retrieveTokenSecurely(
        this.databaseService,
        provider,
        'access'
      )

      if (!tokenData || !tokenData.expiresAt) {
        this.logger.warn(`No valid tokens found for ${provider}`)
        return false
      }

      // Clear existing schedule for this provider
      this.clearSchedule(provider)

      // Calculate refresh time (5 minutes before expiration)
      const refreshAt = tokenSecurityService.getRefreshScheduleTime(tokenData)
      
      if (!refreshAt) {
        this.logger.warn(`Cannot schedule refresh for ${provider} - no expiration time`)
        return false
      }

      const now = new Date()
      const timeUntilRefresh = refreshAt.getTime() - now.getTime()

      if (timeUntilRefresh <= 0) {
        // Token expires soon or already expired, refresh immediately
        this.logger.info(`Token for ${provider} expires soon, refreshing immediately`)
        await this.refreshProviderToken(provider)
        return true
      }

      // Schedule the refresh
      const timerId = setTimeout(async () => {
        await this.refreshProviderToken(provider)
      }, timeUntilRefresh)

      // Store the schedule
      const schedule: RefreshSchedule = {
        provider,
        expiresAt: tokenData.expiresAt,
        refreshAt,
        timerId
      }

      this.refreshSchedules.set(provider, schedule)

      this.logger.success(`Token refresh scheduled for ${provider}`, {
        expiresAt: tokenData.expiresAt.toISOString(),
        refreshAt: refreshAt.toISOString(),
        timeUntilRefresh: Math.round(timeUntilRefresh / 1000 / 60) + ' minutes'
      })

      return true

    } catch (error) {
      this.logger.error(`Failed to schedule token refresh for ${provider}`, error as Error)
      return false
    }
  }

  /**
   * Manually triggers token refresh for a provider
   */
  async refreshProviderToken(provider: string): Promise<{ success: boolean; error?: string }> {
    try {
      this.logger.info(`Manually refreshing token for ${provider}`)

      let result: { success: boolean; error?: string; data?: any }

      // Call the appropriate auth service
      switch (provider) {
        case 'microsoft':
          result = await this.microsoftAuthService.refreshToken()
          break
        case 'google':
          result = await this.googleAuthService.refreshToken()
          break
        default:
          return {
            success: false,
            error: `Unsupported provider: ${provider}`
          }
      }

      if (result.success) {
        this.logger.success(`Token refreshed successfully for ${provider}`)
        
        // Schedule the next refresh
        await this.scheduleTokenRefresh(provider)
        
        return { success: true }
      } else {
        this.logger.error(`Token refresh failed for ${provider}`, { error: result.error } as any)
        
        // Clear the schedule since refresh failed
        this.clearSchedule(provider)
        
        return {
          success: false,
          error: result.error
        }
      }

    } catch (error) {
      this.logger.error(`Token refresh error for ${provider}`, error as Error)
      this.clearSchedule(provider)
      
      return {
        success: false,
        error: `Token refresh failed: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  /**
   * Checks and refreshes all expired or soon-to-expire tokens
   */
  async refreshAllTokens(): Promise<{ [provider: string]: { success: boolean; error?: string } }> {
    this.logger.info('Refreshing all tokens')

    const providers = ['microsoft', 'google']
    const results: { [provider: string]: { success: boolean; error?: string } } = {}

    for (const provider of providers) {
      try {
        // Check if token exists and needs refresh
        const tokenData = await tokenSecurityService.retrieveTokenSecurely(
          this.databaseService,
          provider,
          'access'
        )

        if (!tokenData) {
          results[provider] = {
            success: false,
            error: 'No tokens found'
          }
          continue
        }

        // Check if token needs refresh (within 10 minutes of expiration)
        const needsRefresh = tokenSecurityService.isTokenExpired(tokenData, 10)

        if (needsRefresh) {
          results[provider] = await this.refreshProviderToken(provider)
        } else {
          results[provider] = {
            success: true,
            error: 'Token still valid, no refresh needed'
          }
        }

      } catch (error) {
        results[provider] = {
          success: false,
          error: `Error checking token: ${error instanceof Error ? error.message : String(error)}`
        }
      }
    }

    this.logger.info('Token refresh check completed', results)
    return results
  }

  /**
   * Gets the refresh schedule for a provider
   */
  getSchedule(provider: string): RefreshSchedule | null {
    return this.refreshSchedules.get(provider) || null
  }

  /**
   * Gets all current refresh schedules
   */
  getAllSchedules(): { [provider: string]: Omit<RefreshSchedule, 'timerId'> } {
    const schedules: { [provider: string]: Omit<RefreshSchedule, 'timerId'> } = {}

    this.refreshSchedules.forEach((schedule, provider) => {
      schedules[provider] = {
        provider: schedule.provider,
        expiresAt: schedule.expiresAt,
        refreshAt: schedule.refreshAt
      }
    })

    return schedules
  }

  /**
   * Clears refresh schedule for a specific provider
   */
  clearSchedule(provider: string): void {
    const schedule = this.refreshSchedules.get(provider)
    if (schedule) {
      clearTimeout(schedule.timerId)
      this.refreshSchedules.delete(provider)
      this.logger.debug(`Cleared refresh schedule for ${provider}`)
    }
  }

  /**
   * Clears all refresh schedules
   */
  clearAllSchedules(): void {
    this.logger.debug('Clearing all refresh schedules')
    
    this.refreshSchedules.forEach((schedule) => {
      clearTimeout(schedule.timerId)
    })
    
    this.refreshSchedules.clear()
  }

  /**
   * Schedules refresh for all existing tokens in the database
   */
  private async scheduleExistingTokens(): Promise<void> {
    this.logger.debug('Scheduling refresh for existing tokens')

    const providers = ['microsoft', 'google']

    for (const provider of providers) {
      try {
        const hasScheduled = await this.scheduleTokenRefresh(provider)
        if (!hasScheduled) {
          this.logger.debug(`No tokens to schedule for ${provider}`)
        }
      } catch (error) {
        this.logger.error(`Failed to schedule existing tokens for ${provider}`, error as Error)
      }
    }
  }

  /**
   * Health check for the refresh service
   */
  getHealthStatus(): {
    isRunning: boolean
    scheduledProviders: string[]
    nextRefresh?: { provider: string; refreshAt: Date }
  } {
    const scheduledProviders = Array.from(this.refreshSchedules.keys())
    
    // Find the next scheduled refresh
    let nextRefresh: { provider: string; refreshAt: Date } | undefined
    let earliestRefresh = new Date('2099-12-31')

    this.refreshSchedules.forEach((schedule, provider) => {
      if (schedule.refreshAt < earliestRefresh) {
        earliestRefresh = schedule.refreshAt
        nextRefresh = {
          provider,
          refreshAt: schedule.refreshAt
        }
      }
    })

    return {
      isRunning: this.isRunning,
      scheduledProviders,
      nextRefresh
    }
  }

  /**
   * Cleanup method
   */
  async cleanup(): Promise<void> {
    this.logger.info('Cleaning up Token Refresh Service')
    await this.stop()
  }
}

// Export singleton instance
export const tokenRefreshService = new TokenRefreshService(null as any) // Will be initialized with proper database service