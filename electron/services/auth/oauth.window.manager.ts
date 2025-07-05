// OAuth Window Manager - Manages OAuth authentication windows for different providers

import { BrowserWindow, session } from 'electron'
import { databaseLogger } from '../../../backend/utils/logger'
import { oauthCallbackServer } from './oauth.callback.server'

export interface OAuthWindowOptions {
  width?: number
  height?: number
  title?: string
  provider: string
  authUrl: string
  callbackUrlPattern: string
}

export interface OAuthResult {
  success: boolean
  authorizationCode?: string
  error?: string
  state?: string
}

export class OAuthWindowManager {
  private logger = databaseLogger
  private activeWindows: Map<string, BrowserWindow> = new Map()

  constructor() {
    this.logger.info('OAuth Window Manager initialized')
    this.initializeCallbackServer()
  }

  /**
   * Initialize the OAuth callback server
   */
  private async initializeCallbackServer(): Promise<void> {
    try {
      if (!oauthCallbackServer.isRunning()) {
        await oauthCallbackServer.start()
      }
    } catch (error) {
      this.logger.error('Failed to start OAuth callback server', error as Error)
    }
  }

  /**
   * Creates and manages an OAuth authentication window
   */
  async createOAuthWindow(options: OAuthWindowOptions): Promise<OAuthResult> {
    const { provider, authUrl, callbackUrlPattern } = options
    
    try {
      this.logger.info(`Creating OAuth window for ${provider}`)

      // Close any existing window for this provider
      await this.closeWindow(provider)

      // Create new OAuth window
      const oauthWindow = new BrowserWindow({
        width: options.width || 500,
        height: options.height || 700,
        title: options.title || `Sign in to ${provider}`,
        show: true,
        modal: true,
        resizable: false,
        minimizable: false,
        maximizable: false,
        autoHideMenuBar: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          webSecurity: true
        }
      })

      // Store the window
      this.activeWindows.set(provider, oauthWindow)

      // Set up session for this window (isolated from main app)
      const oauthSession = session.fromPartition(`oauth-${provider}`, { cache: false })
      
      // Clear any existing session data
      await oauthSession.clearStorageData()

      this.logger.debug(`Loading OAuth URL for ${provider}`, { url: authUrl })

      // Load the OAuth URL
      await oauthWindow.loadURL(authUrl)

      // Return a promise that resolves when OAuth completes
      return new Promise((resolve) => {
        let resolved = false

        // Handle successful callback
        const handleNavigation = (event: Electron.Event, navigationUrl: string) => {
          this.logger.debug(`Navigation detected for ${provider}`, { url: navigationUrl })

          if (navigationUrl.includes(callbackUrlPattern)) {
            if (!resolved) {
              resolved = true
              const result = this.parseCallbackUrl(navigationUrl, provider)
              this.logger.success(`OAuth callback received for ${provider}`, { success: result.success })
              this.closeWindow(provider)
              resolve(result)
            }
          }
        }

        // Handle window events
        oauthWindow.webContents.on('will-navigate', handleNavigation)
        oauthWindow.webContents.on('did-navigate', handleNavigation)
        oauthWindow.webContents.on('did-navigate-in-page', handleNavigation)

        // Handle window closed by user
        oauthWindow.on('closed', () => {
          if (!resolved) {
            resolved = true
            this.logger.warn(`OAuth window closed by user for ${provider}`)
            this.activeWindows.delete(provider)
            resolve({
              success: false,
              error: 'Authentication was cancelled by user'
            })
          }
        })

        // Handle load errors
        oauthWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
          if (!resolved) {
            resolved = true
            this.logger.error(`OAuth window failed to load for ${provider}`, { errorCode, errorDescription } as any)
            this.closeWindow(provider)
            resolve({
              success: false,
              error: `Failed to load authentication page: ${errorDescription}`
            })
          }
        })

        // Set timeout for OAuth process
        setTimeout(() => {
          if (!resolved) {
            resolved = true
            this.logger.warn(`OAuth timeout for ${provider}`)
            this.closeWindow(provider)
            resolve({
              success: false,
              error: 'Authentication timed out'
            })
          }
        }, 300000) // 5 minutes timeout
      })

    } catch (error) {
      this.logger.error(`Failed to create OAuth window for ${provider}`, error as Error)
      return {
        success: false,
        error: `Failed to create authentication window: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  /**
   * Creates OAuth window specifically for Microsoft
   */
  async createMicrosoftWindow(authUrl: string): Promise<OAuthResult> {
    try {
      // Ensure callback server is running
      if (!oauthCallbackServer.isRunning()) {
        await this.initializeCallbackServer()
      }

      // Extract state parameter from auth URL for callback tracking
      const urlObj = new URL(authUrl)
      const state = urlObj.searchParams.get('state')

      if (!state) {
        return {
          success: false,
          error: 'No state parameter found in auth URL'
        }
      }

      // Create the OAuth window
      const oauthWindow = new BrowserWindow({
        width: 520,
        height: 750,
        title: 'Sign in to Microsoft',
        show: true,
        modal: true,
        resizable: false,
        minimizable: false,
        maximizable: false,
        autoHideMenuBar: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          webSecurity: true
        }
      })

      // Store the window
      this.activeWindows.set('microsoft', oauthWindow)

      // Set up session for this window (isolated from main app)
      const oauthSession = session.fromPartition('oauth-microsoft', { cache: false })
      await oauthSession.clearStorageData()

      this.logger.debug('Loading Microsoft OAuth URL', { url: authUrl })

      // Load the OAuth URL
      await oauthWindow.loadURL(authUrl)

      // Wait for callback from server and window events in parallel
      const result = await Promise.race([
        // Wait for callback server to receive the redirect
        oauthCallbackServer.waitForCallback(state),
        
        // Wait for window to be closed by user
        new Promise<OAuthResult>((resolve) => {
          oauthWindow.on('closed', () => {
            this.logger.warn('Microsoft OAuth window closed by user')
            this.activeWindows.delete('microsoft')
            resolve({
              success: false,
              error: 'Authentication was cancelled by user'
            })
          })
        })
      ])

      // Clean up window
      if (!oauthWindow.isDestroyed()) {
        oauthWindow.close()
      }
      this.activeWindows.delete('microsoft')

      return result

    } catch (error) {
      this.logger.error('Failed to create Microsoft OAuth window', error as Error)
      return {
        success: false,
        error: `Failed to create authentication window: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  /**
   * Creates OAuth window specifically for Google
   */
  async createGoogleWindow(authUrl: string): Promise<OAuthResult> {
    try {
      // Ensure callback server is running
      if (!oauthCallbackServer.isRunning()) {
        await this.initializeCallbackServer()
      }

      // Extract state parameter from auth URL for callback tracking
      const urlObj = new URL(authUrl)
      const state = urlObj.searchParams.get('state')

      if (!state) {
        return {
          success: false,
          error: 'No state parameter found in auth URL'
        }
      }

      // Create the OAuth window
      const oauthWindow = new BrowserWindow({
        width: 500,
        height: 700,
        title: 'Sign in to Google',
        show: true,
        modal: true,
        resizable: false,
        minimizable: false,
        maximizable: false,
        autoHideMenuBar: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          webSecurity: true
        }
      })

      // Store the window
      this.activeWindows.set('google', oauthWindow)

      // Set up session for this window (isolated from main app)
      const oauthSession = session.fromPartition('oauth-google', { cache: false })
      await oauthSession.clearStorageData()

      this.logger.debug('Loading Google OAuth URL', { url: authUrl })

      // Load the OAuth URL
      await oauthWindow.loadURL(authUrl)

      // Wait for callback from server and window events in parallel
      const result = await Promise.race([
        // Wait for callback server to receive the redirect
        oauthCallbackServer.waitForCallback(state),
        
        // Wait for window to be closed by user
        new Promise<OAuthResult>((resolve) => {
          oauthWindow.on('closed', () => {
            this.logger.warn('Google OAuth window closed by user')
            this.activeWindows.delete('google')
            resolve({
              success: false,
              error: 'Authentication was cancelled by user'
            })
          })
        })
      ])

      // Clean up window
      if (!oauthWindow.isDestroyed()) {
        oauthWindow.close()
      }
      this.activeWindows.delete('google')

      return result

    } catch (error) {
      this.logger.error('Failed to create Google OAuth window', error as Error)
      return {
        success: false,
        error: `Failed to create authentication window: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  /**
   * Closes OAuth window for a specific provider
   */
  async closeWindow(provider: string): Promise<void> {
    try {
      const window = this.activeWindows.get(provider)
      if (window && !window.isDestroyed()) {
        this.logger.debug(`Closing OAuth window for ${provider}`)
        window.close()
      }
      this.activeWindows.delete(provider)
    } catch (error) {
      this.logger.error(`Error closing OAuth window for ${provider}`, error as Error)
    }
  }

  /**
   * Closes all active OAuth windows
   */
  async closeAllWindows(): Promise<void> {
    this.logger.info('Closing all OAuth windows')
    
    const providers = Array.from(this.activeWindows.keys())
    await Promise.all(providers.map(provider => this.closeWindow(provider)))
  }

  /**
   * Parses the callback URL to extract authorization code and state
   */
  private parseCallbackUrl(url: string, provider: string): OAuthResult {
    try {
      const urlObj = new URL(url)
      const params = urlObj.searchParams

      // Check for error parameters first
      const error = params.get('error')
      const errorDescription = params.get('error_description')

      if (error) {
        this.logger.warn(`OAuth error for ${provider}`, { error, errorDescription })
        return {
          success: false,
          error: errorDescription || error
        }
      }

      // Extract authorization code
      const authorizationCode = params.get('code')
      const state = params.get('state')

      if (!authorizationCode) {
        this.logger.error(`No authorization code found in callback for ${provider}`)
        return {
          success: false,
          error: 'No authorization code received'
        }
      }

      this.logger.success(`Authorization code extracted for ${provider}`)
      return {
        success: true,
        authorizationCode,
        state: state || undefined
      }

    } catch (error) {
      this.logger.error(`Failed to parse callback URL for ${provider}`, error as Error)
      return {
        success: false,
        error: 'Failed to parse authentication response'
      }
    }
  }

  /**
   * Checks if a window is active for a provider
   */
  isWindowActive(provider: string): boolean {
    const window = this.activeWindows.get(provider)
    return !!(window && !window.isDestroyed())
  }

  /**
   * Gets the count of active OAuth windows
   */
  getActiveWindowCount(): number {
    return this.activeWindows.size
  }

  /**
   * Gets a list of providers with active windows
   */
  getActiveProviders(): string[] {
    return Array.from(this.activeWindows.keys())
  }

  /**
   * Focus an existing OAuth window for a provider
   */
  focusWindow(provider: string): boolean {
    try {
      const window = this.activeWindows.get(provider)
      if (window && !window.isDestroyed()) {
        window.focus()
        window.show()
        return true
      }
      return false
    } catch (error) {
      this.logger.error(`Error focusing OAuth window for ${provider}`, error as Error)
      return false
    }
  }

  /**
   * Cleanup method to close all windows
   */
  async cleanup(): Promise<void> {
    this.logger.info('Cleaning up OAuth Window Manager')
    await this.closeAllWindows()
    
    // Clean up callback server
    try {
      await oauthCallbackServer.cleanup()
    } catch (error) {
      this.logger.error('Error cleaning up OAuth callback server', error as Error)
    }
  }
}

// Export singleton instance
export const oauthWindowManager = new OAuthWindowManager()