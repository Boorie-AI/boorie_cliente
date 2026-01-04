// Token Security Service - Handles encryption/decryption of authentication tokens

import { safeStorage } from 'electron'
import { databaseLogger } from '../../../backend/utils/logger'

export interface TokenData {
  accessToken: string
  refreshToken?: string
  expiresAt?: Date
  metadata?: any
}

export interface EncryptedTokenData {
  encryptedAccessToken: string
  encryptedRefreshToken?: string
  expiresAt?: Date
  metadata?: any
}

export class TokenSecurityService {
  private logger = databaseLogger
  private isEncryptionAvailable: boolean

  constructor() {
    // Check if safeStorage is available (requires user to be logged into OS)
    this.isEncryptionAvailable = safeStorage.isEncryptionAvailable()

    if (!this.isEncryptionAvailable) {
      this.logger.warn('OS-level encryption not available, tokens will be stored with basic encoding')
    } else {
      this.logger.info('OS-level encryption available for secure token storage')
    }
  }

  /**
   * Encrypts a token string using OS-level encryption when available
   */
  async encryptToken(token: string): Promise<string> {
    try {
      if (!token) {
        throw new Error('Token cannot be empty')
      }

      if (this.isEncryptionAvailable) {
        // Use Electron's safeStorage for OS-level encryption
        const encrypted = safeStorage.encryptString(token)
        return encrypted.toString('base64')
      } else {
        // Fallback to base64 encoding (not secure, but prevents plain text storage)
        this.logger.warn('Using base64 encoding as fallback for token encryption')
        return Buffer.from(token).toString('base64')
      }
    } catch (error) {
      this.logger.error('Failed to encrypt token', error as Error)
      throw new Error('Token encryption failed')
    }
  }

  /**
   * Decrypts a token string using OS-level decryption when available
   */
  async decryptToken(encryptedToken: string): Promise<string> {
    try {
      if (!encryptedToken) {
        throw new Error('Encrypted token cannot be empty')
      }

      if (this.isEncryptionAvailable) {
        // Use Electron's safeStorage for OS-level decryption
        const buffer = Buffer.from(encryptedToken, 'base64')
        return safeStorage.decryptString(buffer)
      } else {
        // Fallback to base64 decoding
        return Buffer.from(encryptedToken, 'base64').toString('utf8')
      }
    } catch (error) {
      this.logger.error('Failed to decrypt token', error as Error)
      throw new Error('Token decryption failed')
    }
  }

  /**
   * Encrypts all tokens in a TokenData object
   */
  async encryptTokenData(tokenData: TokenData): Promise<EncryptedTokenData> {
    try {
      this.logger.debug('Encrypting token data')

      const encrypted: EncryptedTokenData = {
        encryptedAccessToken: await this.encryptToken(tokenData.accessToken),
        expiresAt: tokenData.expiresAt,
        metadata: tokenData.metadata
      }

      if (tokenData.refreshToken) {
        encrypted.encryptedRefreshToken = await this.encryptToken(tokenData.refreshToken)
      }

      this.logger.success('Token data encrypted successfully')
      return encrypted
    } catch (error) {
      this.logger.error('Failed to encrypt token data', error as Error)
      throw new Error('Token data encryption failed')
    }
  }

  /**
   * Decrypts all tokens in an EncryptedTokenData object
   */
  async decryptTokenData(encryptedTokenData: EncryptedTokenData): Promise<TokenData> {
    try {
      this.logger.debug('Decrypting token data')

      const decrypted: TokenData = {
        accessToken: await this.decryptToken(encryptedTokenData.encryptedAccessToken),
        expiresAt: encryptedTokenData.expiresAt,
        metadata: encryptedTokenData.metadata
      }

      if (encryptedTokenData.encryptedRefreshToken) {
        decrypted.refreshToken = await this.decryptToken(encryptedTokenData.encryptedRefreshToken)
      }

      this.logger.success('Token data decrypted successfully')
      return decrypted
    } catch (error) {
      this.logger.error('Failed to decrypt token data', error as Error)
      throw new Error('Token data decryption failed')
    }
  }

  /**
   * Securely stores encrypted token data in database
   */
  async storeTokenSecurely(
    databaseService: any,
    provider: string,
    tokenData: TokenData
  ): Promise<any> {
    try {
      this.logger.debug('Storing tokens securely', { provider })

      // Encrypt tokens before storage
      const encrypted = await this.encryptTokenData(tokenData)

      // Store encrypted tokens in database
      const result = await databaseService.storeAuthToken({
        provider,
        tokenType: 'access',
        accessToken: encrypted.encryptedAccessToken,
        refreshToken: encrypted.encryptedRefreshToken,
        expiresAt: encrypted.expiresAt
      })

      if (!result.success) {
        throw new Error(result.error)
      }

      this.logger.success('Tokens stored securely', { provider, tokenId: result.data.id })
      return result
    } catch (error) {
      this.logger.error('Failed to store tokens securely', error as Error, { provider })
      throw new Error(`Secure token storage failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Retrieves and decrypts token data from database
   */
  async retrieveTokenSecurely(
    databaseService: any,
    provider: string,
    tokenType: string = 'access'
  ): Promise<TokenData | null> {
    try {
      this.logger.debug('Retrieving tokens securely', { provider, tokenType })

      // Get encrypted tokens from database
      const result = await databaseService.getAuthToken(provider, tokenType)

      if (!result.success || !result.data) {
        this.logger.info('No tokens found for provider', { provider, tokenType })
        return null
      }

      const encryptedData = result.data

      // Decrypt tokens
      const decrypted = await this.decryptTokenData({
        encryptedAccessToken: encryptedData.accessToken,
        encryptedRefreshToken: encryptedData.refreshToken,
        expiresAt: encryptedData.expiresAt
      })

      this.logger.success('Tokens retrieved and decrypted', { provider, tokenType })
      return decrypted
    } catch (error) {
      this.logger.error('Failed to retrieve tokens securely', error as Error, { provider, tokenType })
      throw new Error(`Secure token retrieval failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Checks if stored tokens are expired
   */
  isTokenExpired(tokenData: TokenData, bufferMinutes: number = 5): boolean {
    if (!tokenData.expiresAt) {
      // If no expiration date, assume token doesn't expire
      return false
    }

    const now = new Date()
    const expirationWithBuffer = new Date(tokenData.expiresAt.getTime() - (bufferMinutes * 60 * 1000))

    return now >= expirationWithBuffer
  }

  /**
   * Calculates when to schedule token refresh (5 minutes before expiration)
   */
  getRefreshScheduleTime(tokenData: TokenData): Date | null {
    if (!tokenData.expiresAt) {
      return null
    }

    // Schedule refresh 5 minutes before expiration
    return new Date(tokenData.expiresAt.getTime() - (5 * 60 * 1000))
  }

  /**
   * Securely deletes all tokens for a provider
   */
  async deleteTokensSecurely(
    databaseService: any,
    provider: string
  ): Promise<boolean> {
    try {
      this.logger.debug('Deleting tokens securely', { provider })

      const result = await databaseService.deleteAuthTokens(provider)

      if (!result.success) {
        throw new Error(result.error)
      }

      this.logger.success('Tokens deleted securely', { provider })
      return true
    } catch (error) {
      this.logger.error('Failed to delete tokens securely', error as Error, { provider })
      throw new Error(`Secure token deletion failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Validates token data structure
   */
  validateTokenData(tokenData: any): tokenData is TokenData {
    if (!tokenData || typeof tokenData !== 'object') {
      return false
    }

    if (!tokenData.accessToken || typeof tokenData.accessToken !== 'string') {
      return false
    }

    if (tokenData.refreshToken && typeof tokenData.refreshToken !== 'string') {
      return false
    }

    if (tokenData.expiresAt && !(tokenData.expiresAt instanceof Date)) {
      return false
    }

    return true
  }

  /**
   * Gets encryption status information
   */
  getEncryptionInfo(): {
    isAvailable: boolean
    method: string
    status: string
  } {
    return {
      isAvailable: this.isEncryptionAvailable,
      method: this.isEncryptionAvailable ? 'OS-level encryption' : 'Base64 encoding',
      status: this.isEncryptionAvailable ? 'Secure' : 'Fallback'
    }
  }
}

// Export singleton instance
export const tokenSecurityService = new TokenSecurityService()