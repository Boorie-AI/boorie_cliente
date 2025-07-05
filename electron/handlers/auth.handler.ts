// Auth Handler - IPC handlers for authentication operations

import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { DatabaseService } from '../../backend/services/database.service'
import { tokenSecurityService } from '../services/security/token.security.service'
import { MicrosoftAuthService } from '../services/auth/microsoft.auth.service'
import { GoogleAuthService } from '../services/auth/google.auth.service'
import { TokenRefreshService } from '../services/auth/token.refresh.service'
import { databaseLogger } from '../../backend/utils/logger'

export class AuthHandler {
  private databaseService: DatabaseService
  private microsoftAuthService: MicrosoftAuthService
  private googleAuthService: GoogleAuthService
  private tokenRefreshService: TokenRefreshService
  private logger = databaseLogger

  constructor(databaseService: DatabaseService) {
    this.databaseService = databaseService
    this.microsoftAuthService = new MicrosoftAuthService(databaseService)
    this.googleAuthService = new GoogleAuthService(databaseService)
    this.tokenRefreshService = new TokenRefreshService(databaseService)
    
    this.logger.info('Auth handler initialized')
    this.registerHandlers()
    this.initializeRefreshService()
  }

  /**
   * Initialize the token refresh service
   */
  private async initializeRefreshService(): Promise<void> {
    try {
      await this.tokenRefreshService.start()
    } catch (error) {
      this.logger.error('Failed to start token refresh service', error as Error)
    }
  }

  private registerHandlers(): void {
    this.logger.debug('Registering auth IPC handlers')

    // Authentication flow handlers
    ipcMain.handle('auth-microsoft-login', this.handleMicrosoftLogin.bind(this))
    ipcMain.handle('auth-google-login', this.handleGoogleLogin.bind(this))
    ipcMain.handle('auth-logout', this.handleLogout.bind(this))

    // Token management handlers
    ipcMain.handle('auth-get-tokens', this.handleGetTokens.bind(this))
    ipcMain.handle('auth-refresh-token', this.handleRefreshToken.bind(this))
    ipcMain.handle('auth-validate-token', this.handleValidateToken.bind(this))

    // User profile handlers
    ipcMain.handle('auth-get-user-profile', this.handleGetUserProfile.bind(this))
    ipcMain.handle('auth-get-active-profiles', this.handleGetActiveProfiles.bind(this))

    // Connection status handlers
    ipcMain.handle('auth-get-connection-status', this.handleGetConnectionStatus.bind(this))
    ipcMain.handle('auth-test-connection', this.handleTestConnection.bind(this))

    this.logger.success('Auth IPC handlers registered')
  }

  /**
   * Handle Microsoft OAuth login initiation
   */
  private async handleMicrosoftLogin(event: IpcMainInvokeEvent): Promise<any> {
    try {
      this.logger.info('Starting Microsoft OAuth login')

      const result = await this.microsoftAuthService.authenticate()
      
      if (result.success) {
        // Schedule token refresh
        await this.tokenRefreshService.scheduleTokenRefresh('microsoft')
      }
      
      return result
    } catch (error) {
      this.logger.error('Microsoft login failed', error as Error)
      return {
        success: false,
        error: 'Microsoft login failed'
      }
    }
  }

  /**
   * Handle Google OAuth login initiation
   */
  private async handleGoogleLogin(event: IpcMainInvokeEvent): Promise<any> {
    try {
      this.logger.info('Starting Google OAuth login')

      const result = await this.googleAuthService.authenticate()
      
      if (result.success) {
        // Schedule token refresh
        await this.tokenRefreshService.scheduleTokenRefresh('google')
      }
      
      return result
    } catch (error) {
      this.logger.error('Google login failed', error as Error)
      return {
        success: false,
        error: 'Google login failed'
      }
    }
  }

  /**
   * Handle logout for a specific provider
   */
  private async handleLogout(event: IpcMainInvokeEvent, provider: string): Promise<any> {
    try {
      this.logger.info('Starting logout process', { provider })

      if (!provider) {
        return {
          success: false,
          error: 'Provider is required for logout'
        }
      }

      let result: { success: boolean; error?: string }

      // Use the appropriate auth service for logout
      switch (provider) {
        case 'microsoft':
          result = await this.microsoftAuthService.logout()
          break
        case 'google':
          result = await this.googleAuthService.logout()
          break
        default:
          result = {
            success: false,
            error: `Unsupported provider: ${provider}`
          }
      }

      if (result.success) {
        // Clear token refresh schedule
        this.tokenRefreshService.clearSchedule(provider)
      }

      this.logger.success('Logout completed', { provider, success: result.success })
      return result
    } catch (error) {
      this.logger.error('Logout failed', error as Error, { provider })
      return {
        success: false,
        error: `Logout failed: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  /**
   * Handle token retrieval for a provider
   */
  private async handleGetTokens(event: IpcMainInvokeEvent, provider: string): Promise<any> {
    try {
      this.logger.debug('Retrieving tokens', { provider })

      if (!provider) {
        return {
          success: false,
          error: 'Provider is required'
        }
      }

      const tokenData = await tokenSecurityService.retrieveTokenSecurely(
        this.databaseService,
        provider,
        'access'
      )

      if (!tokenData) {
        return {
          success: false,
          error: 'No tokens found for provider'
        }
      }

      // Don't return actual tokens for security, just metadata
      return {
        success: true,
        data: {
          hasAccessToken: !!tokenData.accessToken,
          hasRefreshToken: !!tokenData.refreshToken,
          expiresAt: tokenData.expiresAt,
          isExpired: tokenSecurityService.isTokenExpired(tokenData),
          metadata: tokenData.metadata
        }
      }
    } catch (error) {
      this.logger.error('Failed to get tokens', error as Error, { provider })
      return {
        success: false,
        error: `Failed to retrieve tokens: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  /**
   * Handle token refresh for a provider
   */
  private async handleRefreshToken(event: IpcMainInvokeEvent, provider: string): Promise<any> {
    try {
      this.logger.info('Refreshing token', { provider })

      if (!provider) {
        return {
          success: false,
          error: 'Provider is required'
        }
      }

      const result = await this.tokenRefreshService.refreshProviderToken(provider)
      return result
    } catch (error) {
      this.logger.error('Token refresh failed', error as Error, { provider })
      return {
        success: false,
        error: `Token refresh failed: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  /**
   * Handle token validation for a provider
   */
  private async handleValidateToken(event: IpcMainInvokeEvent, provider: string): Promise<any> {
    try {
      this.logger.debug('Validating token', { provider })

      if (!provider) {
        return {
          success: false,
          error: 'Provider is required'
        }
      }

      const tokenData = await tokenSecurityService.retrieveTokenSecurely(
        this.databaseService,
        provider,
        'access'
      )

      if (!tokenData) {
        return {
          success: true,
          data: {
            isValid: false,
            reason: 'No tokens found'
          }
        }
      }

      const isExpired = tokenSecurityService.isTokenExpired(tokenData)
      
      return {
        success: true,
        data: {
          isValid: !isExpired,
          reason: isExpired ? 'Token expired' : 'Token valid',
          expiresAt: tokenData.expiresAt
        }
      }
    } catch (error) {
      this.logger.error('Token validation failed', error as Error, { provider })
      return {
        success: false,
        error: `Token validation failed: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  /**
   * Handle user profile retrieval for a provider
   */
  private async handleGetUserProfile(event: IpcMainInvokeEvent, provider: string): Promise<any> {
    try {
      this.logger.debug('Getting user profile', { provider })

      if (!provider) {
        return {
          success: false,
          error: 'Provider is required'
        }
      }

      const profiles = await this.databaseService.getActiveUserProfiles()
      if (!profiles.success) {
        return profiles
      }

      const userProfile = profiles.data?.find(p => p.provider === provider && p.isActive)
      
      return {
        success: true,
        data: userProfile || null
      }
    } catch (error) {
      this.logger.error('Failed to get user profile', error as Error, { provider })
      return {
        success: false,
        error: `Failed to get user profile: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  /**
   * Handle retrieval of all active user profiles
   */
  private async handleGetActiveProfiles(event: IpcMainInvokeEvent): Promise<any> {
    try {
      this.logger.debug('Getting all active user profiles')

      const result = await this.databaseService.getActiveUserProfiles()
      
      return result
    } catch (error) {
      this.logger.error('Failed to get active profiles', error as Error)
      return {
        success: false,
        error: `Failed to get active profiles: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  /**
   * Handle connection status check for providers
   */
  private async handleGetConnectionStatus(event: IpcMainInvokeEvent): Promise<any> {
    try {
      this.logger.debug('Getting connection status for all providers')

      const providers = ['microsoft', 'google']
      const status: Record<string, any> = {}

      for (const provider of providers) {
        try {
          // Check if we have tokens
          const tokenData = await tokenSecurityService.retrieveTokenSecurely(
            this.databaseService,
            provider,
            'access'
          )

          // Check if we have user profile
          const profiles = await this.databaseService.getActiveUserProfiles()
          const userProfile = profiles.data?.find(p => p.provider === provider && p.isActive)

          const isExpired = tokenData ? tokenSecurityService.isTokenExpired(tokenData) : true

          status[provider] = {
            isConnected: !!tokenData && !!userProfile && !isExpired,
            hasTokens: !!tokenData,
            hasProfile: !!userProfile,
            isExpired: isExpired,
            expiresAt: tokenData?.expiresAt,
            userEmail: userProfile?.email,
            userName: userProfile?.name
          }
        } catch (error) {
          status[provider] = {
            isConnected: false,
            hasTokens: false,
            hasProfile: false,
            isExpired: true,
            error: error instanceof Error ? error.message : String(error)
          }
        }
      }

      this.logger.success('Retrieved connection status for all providers')
      return {
        success: true,
        data: status
      }
    } catch (error) {
      this.logger.error('Failed to get connection status', error as Error)
      return {
        success: false,
        error: `Failed to get connection status: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  /**
   * Handle connection test for a specific provider
   */
  private async handleTestConnection(event: IpcMainInvokeEvent, provider: string): Promise<any> {
    try {
      this.logger.info('Testing connection', { provider })

      if (!provider) {
        return {
          success: false,
          error: 'Provider is required'
        }
      }

      let result: { success: boolean; error?: string; data?: any }

      // Use the appropriate auth service for testing
      switch (provider) {
        case 'microsoft':
          result = await this.microsoftAuthService.testConnection()
          break
        case 'google':
          result = await this.googleAuthService.testConnection()
          break
        default:
          result = {
            success: false,
            error: `Unsupported provider: ${provider}`
          }
      }

      return result
    } catch (error) {
      this.logger.error('Connection test failed', error as Error, { provider })
      return {
        success: false,
        error: `Connection test failed: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  /**
   * Get encryption information
   */
  public getEncryptionInfo(): any {
    return tokenSecurityService.getEncryptionInfo()
  }

  /**
   * Get token refresh service health status
   */
  public getRefreshServiceStatus(): any {
    return this.tokenRefreshService.getHealthStatus()
  }

  /**
   * Cleanup method
   */
  async cleanup(): Promise<void> {
    this.logger.info('Cleaning up Auth Handler')
    
    try {
      await this.tokenRefreshService.cleanup()
    } catch (error) {
      this.logger.error('Error during auth handler cleanup', error as Error)
    }
  }
}