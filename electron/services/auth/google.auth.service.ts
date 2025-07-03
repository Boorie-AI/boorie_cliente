// Google Auth Service - Handles Google OAuth 2.0 authentication flow

import { randomBytes } from 'crypto'
import { oauthWindowManager } from './oauth.window.manager'
import { TokenData, tokenSecurityService } from '../security/token.security.service'
import { DatabaseService } from '../../../backend/services/database.service'
import { databaseLogger } from '../../../backend/utils/logger'

export interface GoogleConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}

export interface GoogleTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
  scope: string
  id_token?: string
}

export interface GoogleUserProfile {
  id: string
  email: string
  verified_email: boolean
  name: string
  given_name?: string
  family_name?: string
  picture?: string
  locale?: string
}

export class GoogleAuthService {
  private logger = databaseLogger
  private databaseService: DatabaseService
  private config: GoogleConfig

  constructor(databaseService: DatabaseService) {
    this.databaseService = databaseService
    this.logger.info('Google Auth Service initialized')
    
    // Configuration using existing environment variables
    this.config = {
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:8020/auth/google/callback',
      scopes: [
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/tasks'
      ]
    }

    if (!this.config.clientId || !this.config.clientSecret) {
      this.logger.warn('Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.')
    }
  }

  /**
   * Initiates Google OAuth authentication flow
   */
  async authenticate(): Promise<{ success: boolean; error?: string; data?: any }> {
    try {
      this.logger.info('Starting Google OAuth authentication')

      if (!this.config.clientId || !this.config.clientSecret) {
        return {
          success: false,
          error: 'Google OAuth not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.'
        }
      }

      // Generate state parameter for CSRF protection
      const state = this.generateState()
      
      // Build OAuth URL
      const authUrl = this.buildAuthUrl(state)
      
      this.logger.debug('Opening Google OAuth window', { authUrl })

      // Open OAuth window and wait for callback
      const result = await oauthWindowManager.createGoogleWindow(authUrl)

      if (!result.success) {
        return {
          success: false,
          error: result.error
        }
      }

      // Verify state parameter
      if (result.state !== state) {
        this.logger.error('State parameter mismatch in Google OAuth callback')
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
        'google',
        tokenData
      )

      // Store user profile
      await this.databaseService.storeUserProfile({
        provider: 'google',
        providerId: profileResponse.data!.id,
        email: profileResponse.data!.email,
        name: profileResponse.data!.name,
        pictureUrl: profileResponse.data!.picture,
        metadata: {
          verifiedEmail: profileResponse.data!.verified_email,
          givenName: profileResponse.data!.given_name,
          familyName: profileResponse.data!.family_name,
          locale: profileResponse.data!.locale
        }
      })

      this.logger.success('Google authentication completed successfully')

      return {
        success: true,
        data: {
          profile: profileResponse.data,
          expiresAt: tokenData.expiresAt
        }
      }

    } catch (error) {
      this.logger.error('Google authentication failed', error as Error)
      return {
        success: false,
        error: `Authentication failed: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  /**
   * Refreshes Google access token using refresh token
   */
  async refreshToken(): Promise<{ success: boolean; error?: string; data?: any }> {
    try {
      this.logger.info('Refreshing Google access token')

      // Get current tokens
      const currentTokens = await tokenSecurityService.retrieveTokenSecurely(
        this.databaseService,
        'google',
        'access'
      )

      if (!currentTokens || !currentTokens.refreshToken) {
        return {
          success: false,
          error: 'No refresh token available'
        }
      }

      // Request new tokens
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          grant_type: 'refresh_token',
          refresh_token: currentTokens.refreshToken
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        this.logger.error('Google token refresh failed', { 
          status: response.status, 
          errorData 
        } as any)
        
        return {
          success: false,
          error: (errorData as any)?.error_description || 'Token refresh failed'
        }
      }

      const tokenData = await response.json() as GoogleTokenResponse

      // Store new tokens (Google may not return a new refresh token)
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
        'google',
        newTokenData
      )

      this.logger.success('Google access token refreshed successfully')

      return {
        success: true,
        data: {
          expiresAt: newTokenData.expiresAt
        }
      }

    } catch (error) {
      this.logger.error('Google token refresh failed', error as Error)
      return {
        success: false,
        error: `Token refresh failed: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  /**
   * Tests Google API connection
   */
  async testConnection(): Promise<{ success: boolean; error?: string; data?: any }> {
    try {
      this.logger.info('Testing Google API connection')

      const tokens = await tokenSecurityService.retrieveTokenSecurely(
        this.databaseService,
        'google',
        'access'
      )

      if (!tokens) {
        return {
          success: false,
          error: 'No authentication tokens found'
        }
      }

      // Test API call to get user profile
      const response = await fetch('https://www.googleapis.com/oauth2/v1/userinfo', {
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

      this.logger.success('Google API connection test successful')

      return {
        success: true,
        data: {
          user: userData.name || userData.email,
          apiVersion: 'v1',
          timestamp: new Date().toISOString()
        }
      }

    } catch (error) {
      this.logger.error('Google connection test failed', error as Error)
      return {
        success: false,
        error: `Connection test failed: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  /**
   * Revokes Google authentication and cleans up tokens
   */
  async logout(): Promise<{ success: boolean; error?: string }> {
    try {
      this.logger.info('Logging out from Google')

      // Get current tokens for revocation
      const tokens = await tokenSecurityService.retrieveTokenSecurely(
        this.databaseService,
        'google',
        'access'
      )

      // Revoke tokens on Google's end
      if (tokens && tokens.accessToken) {
        try {
          await fetch(`https://oauth2.googleapis.com/revoke?token=${tokens.accessToken}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            }
          })
        } catch (error) {
          // Don't fail logout if revocation fails
          this.logger.warn('Failed to revoke tokens on Google servers', error as Error)
        }
      }

      // Clean up stored tokens and profile
      await tokenSecurityService.deleteTokensSecurely(this.databaseService, 'google')

      // Deactivate user profiles
      const profiles = await this.databaseService.getActiveUserProfiles()
      if (profiles.success && profiles.data) {
        const googleProfiles = profiles.data.filter(p => p.provider === 'google')
        for (const profile of googleProfiles) {
          await this.databaseService.deactivateUserProfile('google', profile.providerId)
        }
      }

      this.logger.success('Google logout completed')

      return { success: true }

    } catch (error) {
      this.logger.error('Google logout failed', error as Error)
      return {
        success: false,
        error: `Logout failed: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  /**
   * Builds the Google OAuth authorization URL
   */
  private buildAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: 'code',
      redirect_uri: this.config.redirectUri,
      scope: this.config.scopes.join(' '),
      state: state,
      access_type: 'offline', // Required for refresh tokens
      prompt: 'consent' // Force consent to get refresh token
    })

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  }

  /**
   * Exchanges authorization code for access and refresh tokens
   */
  private async exchangeCodeForTokens(code: string): Promise<{ success: boolean; error?: string; data?: GoogleTokenResponse }> {
    try {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: this.config.redirectUri
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        this.logger.error('Google token exchange failed', { 
          status: response.status, 
          errorData 
        } as any)
        
        return {
          success: false,
          error: (errorData as any)?.error_description || 'Token exchange failed'
        }
      }

      const tokenData = await response.json() as GoogleTokenResponse

      return {
        success: true,
        data: tokenData
      }

    } catch (error) {
      this.logger.error('Google token exchange error', error as Error)
      return {
        success: false,
        error: `Token exchange failed: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  /**
   * Gets Google user profile using access token
   */
  private async getUserProfile(accessToken: string): Promise<{ success: boolean; error?: string; data?: GoogleUserProfile }> {
    try {
      const response = await fetch('https://www.googleapis.com/oauth2/v1/userinfo', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        this.logger.error('Google profile fetch failed', { 
          status: response.status, 
          errorData 
        } as any)
        
        return {
          success: false,
          error: 'Failed to fetch user profile'
        }
      }

      const profileData = await response.json() as GoogleUserProfile

      return {
        success: true,
        data: profileData
      }

    } catch (error) {
      this.logger.error('Google profile fetch error', error as Error)
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
  updateConfig(config: Partial<GoogleConfig>): void {
    this.config = { ...this.config, ...config }
    this.logger.info('Google Auth Service configuration updated')
  }

  /**
   * Gets current configuration (without sensitive data)
   */
  getConfig(): Omit<GoogleConfig, 'clientId' | 'clientSecret'> {
    return {
      redirectUri: this.config.redirectUri,
      scopes: this.config.scopes
    }
  }
}