// Google APIs Client - Frontend client for Google APIs calls

export interface GoogleUser {
  id: string
  email: string
  verified_email: boolean
  name: string
  given_name?: string
  family_name?: string
  picture?: string
  locale?: string
}

export interface GmailMessage {
  id: string
  threadId: string
  snippet: string
  payload: {
    headers: Array<{
      name: string
      value: string
    }>
    body: {
      data?: string
    }
  }
  internalDate: string
  labelIds: string[]
}

export interface GoogleCalendarEvent {
  id: string
  summary: string
  description?: string
  location?: string
  start: {
    dateTime?: string
    date?: string
    timeZone?: string
  }
  end: {
    dateTime?: string
    date?: string
    timeZone?: string
  }
  attendees?: Array<{
    email: string
    displayName?: string
    responseStatus: string
  }>
  organizer: {
    email: string
    displayName?: string
  }
  status: string
  htmlLink: string
  created: string
  updated: string
}

export interface GoogleDriveFile {
  id: string
  name: string
  mimeType: string
  size?: string
  createdTime: string
  modifiedTime: string
  webViewLink: string
  webContentLink?: string
  parents?: string[]
  thumbnailLink?: string
}

export class GoogleApisClient {
  private baseUrl = 'https://www.googleapis.com'

  constructor() {
    console.log('Google APIs Client initialized')
  }

  /**
   * Gets a valid access token from the backend
   */
  private async getAccessToken(): Promise<string> {
    if (!window.electronAPI?.auth) {
      throw new Error('Auth API not available')
    }

    const result = await window.electronAPI.auth.getTokens('google')
    
    if (!result.success || !result.data?.hasAccessToken) {
      throw new Error('No valid Google access token available')
    }

    // The backend only returns metadata for security, we need to make
    // authenticated requests through the backend or get the actual token
    // For now, we'll make requests through a backend proxy
    throw new Error('Direct token access not implemented - use backend proxy')
  }

  /**
   * Makes an authenticated request to Google APIs
   * Note: In production, this should go through the backend for security
   */
  private async makeAuthenticatedRequest(
    endpoint: string, 
    options: RequestInit = {}
  ): Promise<any> {
    // For security, we should make API calls through the backend
    // This is a placeholder implementation
    throw new Error('Direct Google API calls not implemented - should use backend proxy')
  }

  /**
   * Gets the current user's profile
   */
  async getCurrentUser(): Promise<GoogleUser> {
    try {
      const response = await this.makeAuthenticatedRequest('/oauth2/v1/userinfo')
      return response
    } catch (error) {
      console.error('Failed to get current user:', error)
      throw new Error(`Failed to get user profile: ${error.message}`)
    }
  }

  /**
   * Gets Gmail messages
   */
  async getGmailMessages(
    maxResults: number = 10,
    pageToken?: string,
    query?: string
  ): Promise<{
    messages: GmailMessage[]
    nextPageToken?: string
    resultSizeEstimate: number
  }> {
    try {
      let endpoint = `/gmail/v1/users/me/messages?maxResults=${maxResults}`
      
      if (pageToken) {
        endpoint += `&pageToken=${pageToken}`
      }
      
      if (query) {
        endpoint += `&q=${encodeURIComponent(query)}`
      }

      const response = await this.makeAuthenticatedRequest(endpoint)
      
      // Get full message details for each message
      const messagePromises = (response.messages || []).map(async (msg: any) => {
        return this.makeAuthenticatedRequest(`/gmail/v1/users/me/messages/${msg.id}`)
      })
      
      const messages = await Promise.all(messagePromises)
      
      return {
        messages,
        nextPageToken: response.nextPageToken,
        resultSizeEstimate: response.resultSizeEstimate
      }
    } catch (error) {
      console.error('Failed to get Gmail messages:', error)
      throw new Error(`Failed to get Gmail messages: ${error.message}`)
    }
  }

  /**
   * Sends a Gmail message
   */
  async sendGmailMessage(
    to: string[],
    subject: string,
    body: string,
    cc?: string[],
    bcc?: string[]
  ): Promise<void> {
    try {
      // Construct email message in RFC 2822 format
      let emailContent = ''
      emailContent += `To: ${to.join(', ')}\r\n`
      if (cc && cc.length > 0) {
        emailContent += `Cc: ${cc.join(', ')}\r\n`
      }
      if (bcc && bcc.length > 0) {
        emailContent += `Bcc: ${bcc.join(', ')}\r\n`
      }
      emailContent += `Subject: ${subject}\r\n`
      emailContent += `\r\n${body}`

      // Base64 encode the message
      const encodedMessage = btoa(emailContent).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

      await this.makeAuthenticatedRequest('/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          raw: encodedMessage
        })
      })
    } catch (error) {
      console.error('Failed to send Gmail message:', error)
      throw new Error(`Failed to send Gmail message: ${error.message}`)
    }
  }

  /**
   * Gets Google Calendar events
   */
  async getCalendarEvents(
    calendarId: string = 'primary',
    timeMin?: Date,
    timeMax?: Date,
    maxResults: number = 10
  ): Promise<{
    events: GoogleCalendarEvent[]
    nextPageToken?: string
  }> {
    try {
      let endpoint = `/calendar/v3/calendars/${calendarId}/events?maxResults=${maxResults}&singleEvents=true&orderBy=startTime`
      
      if (timeMin) {
        endpoint += `&timeMin=${timeMin.toISOString()}`
      }
      
      if (timeMax) {
        endpoint += `&timeMax=${timeMax.toISOString()}`
      }

      const response = await this.makeAuthenticatedRequest(endpoint)
      
      return {
        events: response.items || [],
        nextPageToken: response.nextPageToken
      }
    } catch (error) {
      console.error('Failed to get calendar events:', error)
      throw new Error(`Failed to get calendar events: ${error.message}`)
    }
  }

  /**
   * Creates a Google Calendar event
   */
  async createCalendarEvent(
    event: {
      summary: string
      description?: string
      location?: string
      start: Date
      end: Date
      attendees?: string[]
      isAllDay?: boolean
    },
    calendarId: string = 'primary'
  ): Promise<GoogleCalendarEvent> {
    try {
      const calendarEvent: any = {
        summary: event.summary,
        description: event.description,
        location: event.location,
        start: event.isAllDay 
          ? { date: event.start.toISOString().split('T')[0] }
          : { 
              dateTime: event.start.toISOString(),
              timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
            },
        end: event.isAllDay
          ? { date: event.end.toISOString().split('T')[0] }
          : { 
              dateTime: event.end.toISOString(),
              timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
            }
      }

      if (event.attendees && event.attendees.length > 0) {
        calendarEvent.attendees = event.attendees.map(email => ({ email }))
      }

      const response = await this.makeAuthenticatedRequest(
        `/calendar/v3/calendars/${calendarId}/events`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(calendarEvent)
        }
      )

      return response
    } catch (error) {
      console.error('Failed to create calendar event:', error)
      throw new Error(`Failed to create calendar event: ${error.message}`)
    }
  }

  /**
   * Gets Google Drive files
   */
  async getDriveFiles(
    pageSize: number = 10,
    pageToken?: string,
    query?: string
  ): Promise<{
    files: GoogleDriveFile[]
    nextPageToken?: string
  }> {
    try {
      let endpoint = `/drive/v3/files?pageSize=${pageSize}&fields=nextPageToken,files(id,name,mimeType,size,createdTime,modifiedTime,webViewLink,webContentLink,parents,thumbnailLink)`
      
      if (pageToken) {
        endpoint += `&pageToken=${pageToken}`
      }
      
      if (query) {
        endpoint += `&q=${encodeURIComponent(query)}`
      }

      const response = await this.makeAuthenticatedRequest(endpoint)
      
      return {
        files: response.files || [],
        nextPageToken: response.nextPageToken
      }
    } catch (error) {
      console.error('Failed to get Drive files:', error)
      throw new Error(`Failed to get Drive files: ${error.message}`)
    }
  }

  /**
   * Uploads a file to Google Drive
   */
  async uploadDriveFile(
    file: File,
    name?: string,
    parentFolderId?: string
  ): Promise<GoogleDriveFile> {
    try {
      const metadata = {
        name: name || file.name,
        ...(parentFolderId && { parents: [parentFolderId] })
      }

      // Create a multipart form data request
      const boundary = '-------314159265358979323846'
      const delimiter = `\r\n--${boundary}\r\n`
      const close_delim = `\r\n--${boundary}--`

      const reader = new FileReader()
      const fileData = await new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string)
        reader.readAsArrayBuffer(file)
      })

      const multipartRequestBody = 
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        `Content-Type: ${file.type}\r\n\r\n` +
        fileData +
        close_delim

      const response = await this.makeAuthenticatedRequest(
        '/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,createdTime,modifiedTime,webViewLink',
        {
          method: 'POST',
          headers: {
            'Content-Type': `multipart/related; boundary="${boundary}"`
          },
          body: multipartRequestBody
        }
      )

      return response
    } catch (error) {
      console.error('Failed to upload Drive file:', error)
      throw new Error(`Failed to upload Drive file: ${error.message}`)
    }
  }

  /**
   * Checks if Google APIs are available and user is authenticated
   */
  async checkAvailability(): Promise<{
    isAvailable: boolean
    hasToken: boolean
    canMakeRequests: boolean
    error?: string
  }> {
    try {
      if (!window.electronAPI?.auth) {
        return {
          isAvailable: false,
          hasToken: false,
          canMakeRequests: false,
          error: 'Auth API not available'
        }
      }

      const tokenResult = await window.electronAPI.auth.getTokens('google')
      
      if (!tokenResult.success || !tokenResult.data?.hasAccessToken) {
        return {
          isAvailable: true,
          hasToken: false,
          canMakeRequests: false,
          error: 'No valid access token'
        }
      }

      return {
        isAvailable: true,
        hasToken: true,
        canMakeRequests: false, // Set to false until backend proxy is implemented
        error: 'Backend proxy not implemented'
      }
    } catch (error) {
      return {
        isAvailable: false,
        hasToken: false,
        canMakeRequests: false,
        error: error.message
      }
    }
  }

  /**
   * Test the Google APIs connection
   */
  async testConnection(): Promise<{
    success: boolean
    message: string
    data?: any
  }> {
    try {
      if (!window.electronAPI?.auth) {
        return {
          success: false,
          message: 'Auth API not available'
        }
      }

      // Use the backend test connection instead of direct API calls
      const result = await window.electronAPI.auth.testConnection('google')
      
      return {
        success: result.success,
        message: result.success 
          ? `Connection successful: ${result.data?.user || 'Connected'}` 
          : result.error || 'Connection test failed',
        data: result.data
      }
    } catch (error) {
      return {
        success: false,
        message: `Connection test failed: ${error.message}`
      }
    }
  }
}

// Export singleton instance
export const googleApisClient = new GoogleApisClient()