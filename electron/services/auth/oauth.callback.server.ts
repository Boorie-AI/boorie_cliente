// OAuth Callback Server - Simple HTTP server to handle OAuth redirects
import { createServer, Server, IncomingMessage, ServerResponse } from 'http'
import { URL } from 'url'
import { databaseLogger } from '../../../backend/utils/logger'

export interface CallbackServerOptions {
  port?: number
  host?: string
  timeout?: number
}

export interface CallbackResult {
  success: boolean
  authorizationCode?: string
  state?: string
  error?: string
  errorDescription?: string
}

export class OAuthCallbackServer {
  private server: Server | null = null
  private logger = databaseLogger
  private pendingCallbacks: Map<string, (result: CallbackResult) => void> = new Map()

  constructor(private options: CallbackServerOptions = {}) {
    this.options = {
      port: 8020,
      host: 'localhost',
      timeout: 300000, // 5 minutes
      ...options
    }
  }

  /**
   * Starts the callback server
   */
  async start(): Promise<void> {
    if (this.server) {
      return // Already running
    }

    return new Promise((resolve, reject) => {
      this.server = createServer(this.handleRequest.bind(this))

      this.server.on('error', (error) => {
        this.logger.error('OAuth callback server error', error)
        reject(error)
      })

      this.server.listen(this.options.port, this.options.host, () => {
        this.logger.success(`OAuth callback server started on ${this.options.host}:${this.options.port}`)
        resolve()
      })
    })
  }

  /**
   * Stops the callback server
   */
  async stop(): Promise<void> {
    if (!this.server) {
      return
    }

    return new Promise((resolve) => {
      this.server!.close(() => {
        this.logger.info('OAuth callback server stopped')
        this.server = null
        resolve()
      })
    })
  }

  /**
   * Waits for an OAuth callback with the given state
   */
  async waitForCallback(state: string): Promise<CallbackResult> {
    return new Promise((resolve) => {
      // Set up timeout
      const timeout = setTimeout(() => {
        this.pendingCallbacks.delete(state)
        resolve({
          success: false,
          error: 'timeout',
          errorDescription: 'OAuth callback timed out'
        })
      }, this.options.timeout)

      // Store the callback resolver
      this.pendingCallbacks.set(state, (result) => {
        clearTimeout(timeout)
        resolve(result)
      })
    })
  }

  /**
   * Handles incoming HTTP requests
   */
  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    try {
      if (!req.url) {
        this.sendResponse(res, 400, 'Bad Request')
        return
      }

      const url = new URL(req.url, `http://${this.options.host}:${this.options.port}`)
      
      // Only handle auth callback paths
      if (!url.pathname.startsWith('/auth/callback') && !url.pathname.startsWith('/auth/google/callback')) {
        this.sendResponse(res, 404, 'Not Found')
        return
      }

      this.logger.debug('OAuth callback received', { url: req.url })

      // Parse query parameters
      const params = url.searchParams
      const state = params.get('state')
      const code = params.get('code')
      const error = params.get('error')
      const errorDescription = params.get('error_description')

      // Find pending callback for this state
      const callback = state ? this.pendingCallbacks.get(state) : null

      if (!callback || !state) {
        this.logger.warn('No pending callback found for state', { state })
        this.sendResponse(res, 200, 'No pending authentication request found')
        return
      }

      // Remove from pending callbacks
      this.pendingCallbacks.delete(state)

      // Prepare result
      const result: CallbackResult = {
        success: !error && !!code,
        authorizationCode: code || undefined,
        state: state || undefined,
        error: error || undefined,
        errorDescription: errorDescription || undefined
      }

      // Call the callback
      callback(result)

      // Send response to browser
      if (result.success) {
        this.sendSuccessPage(res)
      } else {
        this.sendErrorPage(res, result.error, result.errorDescription)
      }

    } catch (error) {
      this.logger.error('Error handling OAuth callback', error as Error)
      this.sendResponse(res, 500, 'Internal Server Error')
    }
  }

  /**
   * Sends a simple HTTP response
   */
  private sendResponse(res: ServerResponse, statusCode: number, message: string): void {
    res.writeHead(statusCode, {
      'Content-Type': 'text/plain',
      'Access-Control-Allow-Origin': '*'
    })
    res.end(message)
  }

  /**
   * Sends a success page
   */
  private sendSuccessPage(res: ServerResponse): void {
    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Authentication Successful</title>
    <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
        .success { color: #28a745; }
        .container { max-width: 400px; margin: 0 auto; }
    </style>
</head>
<body>
    <div class="container">
        <h1 class="success">✓ Authentication Successful</h1>
        <p>You have successfully authenticated. You can close this window.</p>
        <script>
            setTimeout(() => {
                window.close();
            }, 2000);
        </script>
    </div>
</body>
</html>`

    res.writeHead(200, {
      'Content-Type': 'text/html',
      'Access-Control-Allow-Origin': '*'
    })
    res.end(html)
  }

  /**
   * Sends an error page
   */
  private sendErrorPage(res: ServerResponse, error?: string, errorDescription?: string): void {
    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Authentication Error</title>
    <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
        .error { color: #dc3545; }
        .container { max-width: 400px; margin: 0 auto; }
    </style>
</head>
<body>
    <div class="container">
        <h1 class="error">✗ Authentication Error</h1>
        <p><strong>Error:</strong> ${error || 'Unknown error'}</p>
        ${errorDescription ? `<p><strong>Description:</strong> ${errorDescription}</p>` : ''}
        <p>Please close this window and try again.</p>
        <script>
            setTimeout(() => {
                window.close();
            }, 5000);
        </script>
    </div>
</body>
</html>`

    res.writeHead(200, {
      'Content-Type': 'text/html',
      'Access-Control-Allow-Origin': '*'
    })
    res.end(html)
  }

  /**
   * Gets server status
   */
  isRunning(): boolean {
    return this.server !== null
  }

  /**
   * Gets the callback URL
   */
  getCallbackUrl(path = '/auth/callback'): string {
    return `http://${this.options.host}:${this.options.port}${path}`
  }

  /**
   * Cleanup method
   */
  async cleanup(): Promise<void> {
    // Reject all pending callbacks
    for (const [state, callback] of this.pendingCallbacks) {
      callback({
        success: false,
        error: 'server_shutdown',
        errorDescription: 'OAuth server is shutting down'
      })
    }
    this.pendingCallbacks.clear()

    // Stop the server
    await this.stop()
  }
}

// Export singleton instance
export const oauthCallbackServer = new OAuthCallbackServer()