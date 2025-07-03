// Microsoft Auth Service - Handles Microsoft OAuth 2.0 authentication flow

import { randomBytes } from 'crypto'
import { oauthWindowManager } from './oauth.window.manager'
import { TokenData, tokenSecurityService } from '../security/token.security.service'
import { DatabaseService } from '../../../backend/services/database.service'
import { databaseLogger } from '../../../backend/utils/logger'

export interface MicrosoftConfig {
  clientId: string
  authority: string
  redirectUri: string
  scopes: string[]
}

export interface MicrosoftTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
  scope: string
  id_token?: string
}

export interface MicrosoftUserProfile {
  id: string
  displayName: string
  mail: string
  userPrincipalName: string
  givenName?: string
  surname?: string
  jobTitle?: string
  mobilePhone?: string
  officeLocation?: string
}

export class MicrosoftAuthService {
  private logger = databaseLogger
  private databaseService: DatabaseService
  private config: MicrosoftConfig

  constructor(databaseService: DatabaseService) {
    this.databaseService = databaseService
    this.logger.info('Microsoft Auth Service initialized')
    
    // Configuration using existing environment variables
    this.config = {
      clientId: process.env.MS_CLIENT_ID || '',
      authority: process.env.MS_AUTHORITY || 'https://login.microsoftonline.com/common',
      redirectUri: process.env.MS_REDIRECT_URI || 'http://localhost:8020/auth/callback',
      scopes: [
        'https://graph.microsoft.com/User.Read',
        'https://graph.microsoft.com/Mail.Read',
        'https://graph.microsoft.com/Mail.Send',
        'https://graph.microsoft.com/Calendars.ReadWrite',
        'https://graph.microsoft.com/Files.ReadWrite.All',
        'https://graph.microsoft.com/Tasks.ReadWrite',
        'offline_access' // Required for refresh tokens
      ]
    }

    if (!this.config.clientId) {
      this.logger.warn('Microsoft Client ID not configured. Set MS_CLIENT_ID environment variable.')
    }
  }

  /**
   * Initiates Microsoft OAuth authentication flow
   */
  async authenticate(): Promise<{ success: boolean; error?: string; data?: any }> {
    try {
      this.logger.info('Starting Microsoft OAuth authentication')

      if (!this.config.clientId) {
        return {
          success: false,
          error: 'Microsoft OAuth not configured. Please set MS_CLIENT_ID environment variable.'
        }
      }

      // Generate state parameter for CSRF protection
      const state = this.generateState()
      
      // Build OAuth URL
      const authUrl = this.buildAuthUrl(state)
      
      this.logger.debug('Opening Microsoft OAuth window', { authUrl })

      // Open OAuth window and wait for callback
      const result = await oauthWindowManager.createMicrosoftWindow(authUrl)

      if (!result.success) {
        return {
          success: false,
          error: result.error
        }
      }

      // Verify state parameter
      if (result.state !== state) {
        this.logger.error('State parameter mismatch in Microsoft OAuth callback')
        return {
          success: false,
          error: 'Authentication state verification failed'
        }
      }

      // Exchange authorization code for tokens
      const tokenResponse = await this.exchangeCodeForTokens(result.authorizationCode!)

      if (!tokenResponse.success) {
        return tokenResponse
      }

      // Get user profile
      const profileResponse = await this.getUserProfile(tokenResponse.data!.access_token)

      if (!profileResponse.success) {
        return profileResponse
      }

      // Store tokens securely
      const tokenData: TokenData = {
        accessToken: tokenResponse.data!.access_token,
        refreshToken: tokenResponse.data!.refresh_token,
        expiresAt: new Date(Date.now() + (tokenResponse.data!.expires_in * 1000)),
        metadata: {
          scope: tokenResponse.data!.scope,
          tokenType: tokenResponse.data!.token_type
        }
      }

      await tokenSecurityService.storeTokenSecurely(
        this.databaseService,
        'microsoft',
        tokenData
      )

      // Store user profile
      await this.databaseService.storeUserProfile({
        provider: 'microsoft',
        providerId: profileResponse.data!.id,
        email: profileResponse.data!.mail || profileResponse.data!.userPrincipalName,
        name: profileResponse.data!.displayName,
        pictureUrl: undefined, // Microsoft Graph doesn't return photo URL in basic profile
        metadata: {
          userPrincipalName: profileResponse.data!.userPrincipalName,
          givenName: profileResponse.data!.givenName,
          surname: profileResponse.data!.surname,
          jobTitle: profileResponse.data!.jobTitle
        }
      })

      this.logger.success('Microsoft authentication completed successfully')

      return {
        success: true,
        data: {
          profile: profileResponse.data,
          expiresAt: tokenData.expiresAt
        }
      }

    } catch (error) {
      this.logger.error('Microsoft authentication failed', error as Error)
      return {
        success: false,
        error: `Authentication failed: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  /**
   * Refreshes Microsoft access token using refresh token
   */
  async refreshToken(): Promise<{ success: boolean; error?: string; data?: any }> {
    try {
      this.logger.info('Refreshing Microsoft access token')

      // Get current tokens
      const currentTokens = await tokenSecurityService.retrieveTokenSecurely(
        this.databaseService,
        'microsoft',
        'access'
      )

      if (!currentTokens || !currentTokens.refreshToken) {
        return {
          success: false,
          error: 'No refresh token available'
        }
      }

      // Request new tokens
      const response = await fetch(`${this.config.authority}/oauth2/v2.0/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          client_id: this.config.clientId,
          grant_type: 'refresh_token',
          refresh_token: currentTokens.refreshToken,
          scope: this.config.scopes.join(' ')
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        this.logger.error('Microsoft token refresh failed', { 
          status: response.status, 
          errorData 
        } as any)
        
        return {
          success: false,
          error: (errorData as any)?.error_description || 'Token refresh failed'
        }
      }

      const tokenData = await response.json() as MicrosoftTokenResponse

      // Store new tokens
      const newTokenData: TokenData = {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || currentTokens.refreshToken,
        expiresAt: new Date(Date.now() + (tokenData.expires_in * 1000)),
        metadata: {
          scope: tokenData.scope,
          tokenType: tokenData.token_type
        }
      }

      await tokenSecurityService.storeTokenSecurely(
        this.databaseService,
        'microsoft',
        newTokenData
      )

      this.logger.success('Microsoft access token refreshed successfully')

      return {
        success: true,
        data: {
          expiresAt: newTokenData.expiresAt
        }
      }

    } catch (error) {
      this.logger.error('Microsoft token refresh failed', error as Error)
      return {
        success: false,
        error: `Token refresh failed: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  /**
   * Tests Microsoft API connection
   */
  async testConnection(): Promise<{ success: boolean; error?: string; data?: any }> {
    try {
      this.logger.info('Testing Microsoft API connection')

      const tokens = await tokenSecurityService.retrieveTokenSecurely(
        this.databaseService,
        'microsoft',
        'access'
      )

      if (!tokens) {
        return {
          success: false,
          error: 'No authentication tokens found'
        }
      }

      // Test API call to get user profile
      const response = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: {
          'Authorization': `Bearer ${tokens.accessToken}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        if (response.status === 401) {
          // Token expired, try to refresh
          const refreshResult = await this.refreshToken()
          if (refreshResult.success) {
            // Retry the test with new token
            return this.testConnection()
          } else {
            return {
              success: false,
              error: 'Authentication expired and refresh failed'
            }
          }
        }

        return {
          success: false,
          error: `API test failed: HTTP ${response.status}`
        }
      }

      const userData = await response.json() as any

      this.logger.success('Microsoft API connection test successful')

      return {
        success: true,
        data: {
          user: userData.displayName || userData.userPrincipalName,
          apiVersion: 'v1.0',
          timestamp: new Date().toISOString()
        }
      }

    } catch (error) {
      this.logger.error('Microsoft connection test failed', error as Error)
      return {
        success: false,
        error: `Connection test failed: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  /**
   * Revokes Microsoft authentication and cleans up tokens
   */
  async logout(): Promise<{ success: boolean; error?: string }> {
    try {
      this.logger.info('Logging out from Microsoft')

      // Get current tokens for revocation
      const tokens = await tokenSecurityService.retrieveTokenSecurely(
        this.databaseService,
        'microsoft',
        'access'
      )

      // Clean up stored tokens and profile
      await tokenSecurityService.deleteTokensSecurely(this.databaseService, 'microsoft')

      // Deactivate user profiles
      const profiles = await this.databaseService.getActiveUserProfiles()
      if (profiles.success && profiles.data) {
        const microsoftProfiles = profiles.data.filter(p => p.provider === 'microsoft')
        for (const profile of microsoftProfiles) {
          await this.databaseService.deactivateUserProfile('microsoft', profile.providerId)
        }
      }

      // Optional: Revoke tokens on Microsoft's end
      if (tokens && tokens.accessToken) {
        try {
          await fetch(`${this.config.authority}/oauth2/v2.0/logout`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${tokens.accessToken}`
            }
          })
        } catch (error) {
          // Don't fail logout if revocation fails
          this.logger.warn('Failed to revoke tokens on Microsoft servers', error as Error)
        }
      }

      this.logger.success('Microsoft logout completed')

      return { success: true }

    } catch (error) {
      this.logger.error('Microsoft logout failed', error as Error)
      return {
        success: false,
        error: `Logout failed: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  /**
   * Builds the Microsoft OAuth authorization URL
   */
  private buildAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: 'code',
      redirect_uri: this.config.redirectUri,
      scope: this.config.scopes.join(' '),
      state: state,
      response_mode: 'query',
      prompt: 'select_account'
    })

    return `${this.config.authority}/oauth2/v2.0/authorize?${params.toString()}`
  }

  /**
   * Exchanges authorization code for access and refresh tokens
   */
  private async exchangeCodeForTokens(code: string): Promise<{ success: boolean; error?: string; data?: MicrosoftTokenResponse }> {
    try {
      const response = await fetch(`${this.config.authority}/oauth2/v2.0/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          client_id: this.config.clientId,
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: this.config.redirectUri,
          scope: this.config.scopes.join(' ')
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        this.logger.error('Microsoft token exchange failed', { 
          status: response.status, 
          errorData 
        } as any)
        
        return {
          success: false,
          error: (errorData as any)?.error_description || 'Token exchange failed'
        }
      }

      const tokenData = await response.json() as MicrosoftTokenResponse

      return {
        success: true,
        data: tokenData
      }

    } catch (error) {
      this.logger.error('Microsoft token exchange error', error as Error)
      return {
        success: false,
        error: `Token exchange failed: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  /**
   * Gets Microsoft user profile using access token
   */
  private async getUserProfile(accessToken: string): Promise<{ success: boolean; error?: string; data?: MicrosoftUserProfile }> {
    try {
      const response = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        this.logger.error('Microsoft profile fetch failed', { 
          status: response.status, 
          errorData 
        } as any)
        
        return {
          success: false,
          error: 'Failed to fetch user profile'
        }
      }

      const profileData = await response.json() as MicrosoftUserProfile

      return {
        success: true,
        data: profileData
      }

    } catch (error) {
      this.logger.error('Microsoft profile fetch error', error as Error)
      return {
        success: false,
        error: `Profile fetch failed: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  /**
   * Generates a random state parameter for CSRF protection
   */
  private generateState(): string {
    return randomBytes(32).toString('hex')
  }

  /**
   * Updates configuration
   */
  updateConfig(config: Partial<MicrosoftConfig>): void {
    this.config = { ...this.config, ...config }
    this.logger.info('Microsoft Auth Service configuration updated')
  }

  /**
   * Gets current configuration (without sensitive data)
   */
  getConfig(): Omit<MicrosoftConfig, 'clientId'> {
    return {
      authority: this.config.authority,
      redirectUri: this.config.redirectUri,
      scopes: this.config.scopes
    }
  }
}