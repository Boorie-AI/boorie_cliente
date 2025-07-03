// Microsoft Calendar Service - Handles Microsoft Graph Calendar API integration

import { DatabaseService } from '../../../backend/services/database.service'
import { tokenSecurityService } from '../security/token.security.service'
import { databaseLogger } from '../../../backend/utils/logger'
import {
  MicrosoftCalendarEvent,
  CalendarServiceResponse,
  CreateEventData,
  UpdateEventData,
  TeamsMeetingInfo
} from './calendar.types'

export class MicrosoftCalendarService {
  private logger = databaseLogger
  private databaseService: DatabaseService
  private baseUrl = 'https://graph.microsoft.com/v1.0'

  constructor(databaseService: DatabaseService) {
    this.databaseService = databaseService
    this.logger.info('Microsoft Calendar Service initialized')
  }

  /**
   * Get calendar events for a date range
   */
  async getEvents(startDate: Date, endDate: Date): Promise<MicrosoftCalendarEvent[]> {
    try {
      this.logger.info('Fetching Microsoft calendar events', { 
        startDate: startDate.toISOString(), 
        endDate: endDate.toISOString() 
      })

      const token = await this.getValidToken()
      if (!token) {
        throw new Error('No valid Microsoft token available')
      }

      const startDateTime = startDate.toISOString()
      const endDateTime = endDate.toISOString()
      const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone

      // Try different approaches for timezone handling
      const queryParams = new URLSearchParams({
        '$filter': `start/dateTime ge '${startDateTime}' and end/dateTime le '${endDateTime}'`,
        '$orderby': 'start/dateTime',
        '$top': '1000'
      })

      const response = await fetch(
        `${this.baseUrl}/me/calendar/events?${queryParams.toString()}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Prefer': `outlook.timezone="${userTimeZone}"`,
            // Alternative header approach
            'Outlook.timezone': userTimeZone
          }
        }
      )

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        this.logger.error('Microsoft calendar events fetch failed', { 
          status: response.status, 
          errorData 
        } as any)
        
        if (response.status === 401) {
          throw new Error('Microsoft authentication expired')
        }
        
        throw new Error(`Failed to fetch events: HTTP ${response.status}`)
      }

      const data = await response.json() as any
      const events = data.value || []

      // Debug logging for timezone investigation
      if (events.length > 0) {
        const sampleEvent = events[0]
        const debugInfo = {
          userTimeZone,
          sampleEventTitle: sampleEvent.subject,
          sampleEventStart: sampleEvent.start,
          sampleEventEnd: sampleEvent.end,
          rawEventData: JSON.stringify(sampleEvent, null, 2)
        }
        
        console.log('=== MICROSOFT CALENDAR DEBUG ===')
        console.log('User timezone:', userTimeZone)
        console.log('Sample event raw data:', JSON.stringify(sampleEvent, null, 2))
        console.log('Sample event start:', sampleEvent.start)
        console.log('Sample event end:', sampleEvent.end)
        console.log('================================')
        
        // Also log to backend logger so it appears in your logs
        this.logger.info('Microsoft Calendar Timezone Debug', debugInfo)
      }

      this.logger.success('Microsoft calendar events fetched successfully', { count: events.length })
      return events

    } catch (error) {
      this.logger.error('Failed to get Microsoft calendar events', error as Error)
      throw error
    }
  }

  /**
   * Get a specific calendar event
   */
  async getEvent(eventId: string): Promise<MicrosoftCalendarEvent> {
    try {
      this.logger.info('Fetching Microsoft calendar event', { eventId })

      const token = await this.getValidToken()
      if (!token) {
        throw new Error('No valid Microsoft token available')
      }

      const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
      
      const response = await fetch(`${this.baseUrl}/me/calendar/events/${eventId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Prefer': `outlook.timezone="${userTimeZone}"`
        }
      })

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Event not found')
        }
        if (response.status === 401) {
          throw new Error('Microsoft authentication expired')
        }
        throw new Error(`Failed to fetch event: HTTP ${response.status}`)
      }

      const event = await response.json() as MicrosoftCalendarEvent
      this.logger.success('Microsoft calendar event fetched successfully', { eventId })
      return event

    } catch (error) {
      this.logger.error('Failed to get Microsoft calendar event', error as Error, { eventId })
      throw error
    }
  }

  /**
   * Create a new calendar event
   */
  async createEvent(eventData: Partial<MicrosoftCalendarEvent>): Promise<MicrosoftCalendarEvent> {
    try {
      this.logger.info('Creating Microsoft calendar event', { subject: eventData.subject })

      const token = await this.getValidToken()
      if (!token) {
        throw new Error('No valid Microsoft token available')
      }

      const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
      
      const response = await fetch(`${this.baseUrl}/me/calendar/events`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Prefer': `outlook.timezone="${userTimeZone}"`
        },
        body: JSON.stringify(eventData)
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        this.logger.error('Microsoft calendar event creation failed', { 
          status: response.status, 
          errorData 
        } as any)
        
        if (response.status === 401) {
          throw new Error('Microsoft authentication expired')
        }
        
        throw new Error(`Failed to create event: ${(errorData as any)?.error?.message || 'Unknown error'}`)
      }

      const createdEvent = await response.json() as MicrosoftCalendarEvent
      this.logger.success('Microsoft calendar event created successfully', { eventId: createdEvent.id })
      return createdEvent

    } catch (error) {
      this.logger.error('Failed to create Microsoft calendar event', error as Error)
      throw error
    }
  }

  /**
   * Update an existing calendar event
   */
  async updateEvent(eventId: string, eventData: Partial<MicrosoftCalendarEvent>): Promise<MicrosoftCalendarEvent> {
    try {
      this.logger.info('Updating Microsoft calendar event', { eventId })

      const token = await this.getValidToken()
      if (!token) {
        throw new Error('No valid Microsoft token available')
      }

      const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
      
      const response = await fetch(`${this.baseUrl}/me/calendar/events/${eventId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Prefer': `outlook.timezone="${userTimeZone}"`
        },
        body: JSON.stringify(eventData)
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        this.logger.error('Microsoft calendar event update failed', { 
          status: response.status, 
          errorData 
        } as any)
        
        if (response.status === 404) {
          throw new Error('Event not found')
        }
        if (response.status === 401) {
          throw new Error('Microsoft authentication expired')
        }
        
        throw new Error(`Failed to update event: ${(errorData as any)?.error?.message || 'Unknown error'}`)
      }

      const updatedEvent = await response.json() as MicrosoftCalendarEvent
      this.logger.success('Microsoft calendar event updated successfully', { eventId })
      return updatedEvent

    } catch (error) {
      this.logger.error('Failed to update Microsoft calendar event', error as Error, { eventId })
      throw error
    }
  }

  /**
   * Delete a calendar event
   */
  async deleteEvent(eventId: string): Promise<void> {
    try {
      this.logger.info('Deleting Microsoft calendar event', { eventId })

      const token = await this.getValidToken()
      if (!token) {
        throw new Error('No valid Microsoft token available')
      }

      const response = await fetch(`${this.baseUrl}/me/calendar/events/${eventId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        if (response.status === 404) {
          this.logger.warn('Microsoft calendar event not found for deletion', { eventId })
          return // Event already deleted
        }
        if (response.status === 401) {
          throw new Error('Microsoft authentication expired')
        }
        throw new Error(`Failed to delete event: HTTP ${response.status}`)
      }

      this.logger.success('Microsoft calendar event deleted successfully', { eventId })

    } catch (error) {
      this.logger.error('Failed to delete Microsoft calendar event', error as Error, { eventId })
      throw error
    }
  }

  /**
   * Create a Teams meeting event
   */
  async createTeamsMeeting(eventData: Partial<MicrosoftCalendarEvent>): Promise<MicrosoftCalendarEvent> {
    try {
      this.logger.info('Creating Microsoft Teams meeting', { subject: eventData.subject })

      const teamsEventData: Partial<MicrosoftCalendarEvent> = {
        ...eventData,
        isOnlineMeeting: true,
        onlineMeetingProvider: 'teamsForBusiness'
      }

      return await this.createEvent(teamsEventData)

    } catch (error) {
      this.logger.error('Failed to create Microsoft Teams meeting', error as Error)
      throw error
    }
  }

  /**
   * Add Teams meeting to existing event
   */
  async addTeamsMeetingToEvent(eventId: string): Promise<MicrosoftCalendarEvent> {
    try {
      this.logger.info('Adding Teams meeting to existing event', { eventId })

      const updateData: Partial<MicrosoftCalendarEvent> = {
        isOnlineMeeting: true,
        onlineMeetingProvider: 'teamsForBusiness'
      }

      return await this.updateEvent(eventId, updateData)

    } catch (error) {
      this.logger.error('Failed to add Teams meeting to event', error as Error, { eventId })
      throw error
    }
  }

  /**
   * Get user's calendars
   */
  async getCalendars(): Promise<any[]> {
    try {
      this.logger.info('Fetching Microsoft calendars')

      const token = await this.getValidToken()
      if (!token) {
        throw new Error('No valid Microsoft token available')
      }

      const response = await fetch(`${this.baseUrl}/me/calendars`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Microsoft authentication expired')
        }
        throw new Error(`Failed to fetch calendars: HTTP ${response.status}`)
      }

      const data = await response.json() as any
      const calendars = data.value || []

      this.logger.success('Microsoft calendars fetched successfully', { count: calendars.length })
      return calendars

    } catch (error) {
      this.logger.error('Failed to get Microsoft calendars', error as Error)
      throw error
    }
  }

  /**
   * Test connection to Microsoft Graph
   */
  async testConnection(): Promise<CalendarServiceResponse<boolean>> {
    try {
      this.logger.info('Testing Microsoft calendar connection')

      const token = await this.getValidToken()
      if (!token) {
        return {
          success: false,
          error: 'No valid Microsoft token available'
        }
      }

      // Test with a simple profile request
      const response = await fetch(`${this.baseUrl}/me`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        if (response.status === 401) {
          return {
            success: false,
            error: 'Microsoft authentication expired'
          }
        }
        return {
          success: false,
          error: `Connection test failed: HTTP ${response.status}`
        }
      }

      this.logger.success('Microsoft calendar connection test successful')
      return {
        success: true,
        data: true
      }

    } catch (error) {
      this.logger.error('Microsoft calendar connection test failed', error as Error)
      return {
        success: false,
        error: `Connection test failed: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  /**
   * Convert unified event data to Microsoft format
   */
  convertFromUnifiedEvent(eventData: CreateEventData): Partial<MicrosoftCalendarEvent> {
    const microsoftEvent: Partial<MicrosoftCalendarEvent> = {
      subject: eventData.title,
      body: {
        contentType: 'text',
        content: eventData.description || ''
      },
      start: {
        dateTime: eventData.startTime.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      },
      end: {
        dateTime: eventData.endTime.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      },
      location: eventData.location ? {
        displayName: eventData.location
      } : undefined,
      reminderMinutesBeforeStart: eventData.reminderMinutes || 15,
      showAs: 'busy',
      sensitivity: 'normal'
    }

    // Add attendees if provided
    if (eventData.attendees && eventData.attendees.length > 0) {
      microsoftEvent.attendees = eventData.attendees.map(email => ({
        emailAddress: {
          address: email,
          name: email
        },
        status: {
          response: 'none',
          time: new Date().toISOString()
        }
      }))
    }

    // Add Teams meeting if requested
    if (eventData.isTeamsMeeting) {
      microsoftEvent.isOnlineMeeting = true
      microsoftEvent.onlineMeetingProvider = 'teamsForBusiness'
    }

    // Handle all-day events
    if (eventData.isAllDay) {
      const startDate = new Date(eventData.startTime)
      const endDate = new Date(eventData.endTime)
      
      microsoftEvent.start = {
        dateTime: startDate.toISOString().split('T')[0],
        timeZone: 'UTC'
      }
      microsoftEvent.end = {
        dateTime: endDate.toISOString().split('T')[0],
        timeZone: 'UTC'
      }
    }

    return microsoftEvent
  }

  /**
   * Extract Teams meeting information from event
   */
  extractTeamsMeetingInfo(event: MicrosoftCalendarEvent): TeamsMeetingInfo | null {
    if (!event.isOnlineMeeting || event.onlineMeetingProvider !== 'teamsForBusiness') {
      return null
    }

    return {
      joinUrl: event.onlineMeeting?.joinUrl,
      conferenceId: event.onlineMeeting?.conferenceId
    }
  }

  /**
   * Get valid access token for Microsoft Graph
   */
  private async getValidToken(): Promise<string | null> {
    try {
      const tokenData = await tokenSecurityService.retrieveTokenSecurely(
        this.databaseService,
        'microsoft',
        'access'
      )

      if (!tokenData || !tokenData.accessToken) {
        return null
      }

      // Check if token is expired
      if (tokenSecurityService.isTokenExpired(tokenData)) {
        this.logger.debug('Microsoft token expired, attempting refresh')
        // Token refresh would be handled by the auth system
        return null
      }

      return tokenData.accessToken

    } catch (error) {
      this.logger.error('Failed to get valid Microsoft token', error as Error)
      return null
    }
  }
}