// Microsoft Graph API Client - Frontend client for Microsoft Graph API calls

export interface GraphUser {
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

export interface GraphEmail {
  id: string
  subject: string
  bodyPreview: string
  from: {
    emailAddress: {
      name: string
      address: string
    }
  }
  toRecipients: Array<{
    emailAddress: {
      name: string
      address: string
    }
  }>
  receivedDateTime: string
  isRead: boolean
  importance: string
  hasAttachments: boolean
}

export interface GraphCalendarEvent {
  id: string
  subject: string
  body: {
    contentType: string
    content: string
  }
  start: {
    dateTime: string
    timeZone: string
  }
  end: {
    dateTime: string
    timeZone: string
  }
  location?: {
    displayName: string
  }
  attendees: Array<{
    emailAddress: {
      name: string
      address: string
    }
    status: {
      response: string
      time: string
    }
  }>
  organizer: {
    emailAddress: {
      name: string
      address: string
    }
  }
  isAllDay: boolean
  importance: string
}

export class MicrosoftGraphClient {
  private baseUrl = 'https://graph.microsoft.com/v1.0'

  constructor() {
    console.log('Microsoft Graph Client initialized')
  }

  /**
   * Gets a valid access token from the backend
   */
  private async getAccessToken(): Promise<string> {
    if (!window.electronAPI?.auth) {
      throw new Error('Auth API not available')
    }

    const result = await window.electronAPI.auth.getTokens('microsoft')
    
    if (!result.success || !result.data?.hasAccessToken) {
      throw new Error('No valid Microsoft access token available')
    }

    // The backend only returns metadata for security, we need to make
    // authenticated requests through the backend or get the actual token
    // For now, we'll make requests through a backend proxy
    throw new Error('Direct token access not implemented - use backend proxy')
  }

  /**
   * Makes an authenticated request to Microsoft Graph API
   * Note: In production, this should go through the backend for security
   */
  private async makeAuthenticatedRequest(
    endpoint: string, 
    options: RequestInit = {}
  ): Promise<any> {
    // For security, we should make API calls through the backend
    // This is a placeholder implementation
    throw new Error('Direct Graph API calls not implemented - should use backend proxy')
  }

  /**
   * Gets the current user's profile
   */
  async getCurrentUser(): Promise<GraphUser> {
    try {
      const response = await this.makeAuthenticatedRequest('/me')
      return response
    } catch (error) {
      console.error('Failed to get current user:', error)
      throw new Error(`Failed to get user profile: ${error.message}`)
    }
  }

  /**
   * Gets user's emails with pagination
   */
  async getEmails(top: number = 10, skip: number = 0): Promise<{
    emails: GraphEmail[]
    hasMore: boolean
    nextSkip: number
  }> {
    try {
      const response = await this.makeAuthenticatedRequest(
        `/me/messages?$top=${top}&$skip=${skip}&$orderby=receivedDateTime desc&$select=id,subject,bodyPreview,from,toRecipients,receivedDateTime,isRead,importance,hasAttachments`
      )
      
      return {
        emails: response.value || [],
        hasMore: response['@odata.nextLink'] ? true : false,
        nextSkip: skip + top
      }
    } catch (error) {
      console.error('Failed to get emails:', error)
      throw new Error(`Failed to get emails: ${error.message}`)
    }
  }

  /**
   * Gets user's calendar events
   */
  async getCalendarEvents(
    startDate?: Date, 
    endDate?: Date, 
    top: number = 10
  ): Promise<GraphCalendarEvent[]> {
    try {
      let endpoint = `/me/events?$top=${top}&$orderby=start/dateTime`
      
      if (startDate && endDate) {
        const startISO = startDate.toISOString()
        const endISO = endDate.toISOString()
        endpoint += `&$filter=start/dateTime ge '${startISO}' and end/dateTime le '${endISO}'`
      }
      
      const response = await this.makeAuthenticatedRequest(endpoint)
      return response.value || []
    } catch (error) {
      console.error('Failed to get calendar events:', error)
      throw new Error(`Failed to get calendar events: ${error.message}`)
    }
  }

  /**
   * Sends an email
   */
  async sendEmail(
    to: string[],
    subject: string,
    body: string,
    cc?: string[],
    bcc?: string[]
  ): Promise<void> {
    try {
      const message = {
        message: {
          subject,
          body: {
            contentType: 'Text',
            content: body
          },
          toRecipients: to.map(email => ({
            emailAddress: {
              address: email
            }
          })),
          ...(cc && cc.length > 0 && {
            ccRecipients: cc.map(email => ({
              emailAddress: {
                address: email
              }
            }))
          }),
          ...(bcc && bcc.length > 0 && {
            bccRecipients: bcc.map(email => ({
              emailAddress: {
                address: email
              }
            }))
          })
        }
      }

      await this.makeAuthenticatedRequest('/me/sendMail', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(message)
      })
    } catch (error) {
      console.error('Failed to send email:', error)
      throw new Error(`Failed to send email: ${error.message}`)
    }
  }

  /**
   * Creates a calendar event
   */
  async createCalendarEvent(event: {
    subject: string
    body?: string
    start: Date
    end: Date
    location?: string
    attendees?: string[]
    isAllDay?: boolean
  }): Promise<GraphCalendarEvent> {
    try {
      const graphEvent = {
        subject: event.subject,
        body: {
          contentType: 'Text',
          content: event.body || ''
        },
        start: {
          dateTime: event.start.toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        },
        end: {
          dateTime: event.end.toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        },
        isAllDay: event.isAllDay || false,
        ...(event.location && {
          location: {
            displayName: event.location
          }
        }),
        ...(event.attendees && event.attendees.length > 0 && {
          attendees: event.attendees.map(email => ({
            emailAddress: {
              address: email
            }
          }))
        })
      }

      const response = await this.makeAuthenticatedRequest('/me/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(graphEvent)
      })

      return response
    } catch (error) {
      console.error('Failed to create calendar event:', error)
      throw new Error(`Failed to create calendar event: ${error.message}`)
    }
  }

  /**
   * Gets user's OneDrive files
   */
  async getOneDriveFiles(top: number = 10): Promise<any[]> {
    try {
      const response = await this.makeAuthenticatedRequest(
        `/me/drive/root/children?$top=${top}&$select=id,name,size,createdDateTime,lastModifiedDateTime,folder,file`
      )
      
      return response.value || []
    } catch (error) {
      console.error('Failed to get OneDrive files:', error)
      throw new Error(`Failed to get OneDrive files: ${error.message}`)
    }
  }

  /**
   * Checks if Microsoft Graph API is available and user is authenticated
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

      const tokenResult = await window.electronAPI.auth.getTokens('microsoft')
      
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
   * Test the Microsoft Graph connection
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
      const result = await window.electronAPI.auth.testConnection('microsoft')
      
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
export const microsoftGraphClient = new MicrosoftGraphClient()