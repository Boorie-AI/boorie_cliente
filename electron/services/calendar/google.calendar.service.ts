// Google Calendar Service - Handles Google Calendar API integration

import { DatabaseService } from '../../../backend/services/database.service'
import { tokenSecurityService } from '../security/token.security.service'
import { databaseLogger } from '../../../backend/utils/logger'
import {
  GoogleCalendarEvent,
  CalendarServiceResponse,
  CreateEventData,
  UpdateEventData
} from './calendar.types'

export class GoogleCalendarService {
  private logger = databaseLogger
  private databaseService: DatabaseService
  private baseUrl = 'https://www.googleapis.com/calendar/v3'

  constructor(databaseService: DatabaseService) {
    this.databaseService = databaseService
    this.logger.info('Google Calendar Service initialized')
  }

  /**
   * Get calendar events for a date range
   */
  async getEvents(startDate: Date, endDate: Date): Promise<GoogleCalendarEvent[]> {
    try {
      this.logger.info('Fetching Google calendar events', { 
        startDate: startDate.toISOString(), 
        endDate: endDate.toISOString() 
      })

      const token = await this.getValidToken()
      if (!token) {
        throw new Error('No valid Google token available')
      }

      const timeMin = startDate.toISOString()
      const timeMax = endDate.toISOString()

      const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
      
      const params = new URLSearchParams({
        timeMin,
        timeMax,
        timeZone: userTimeZone,
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '1000'
      })

      const response = await fetch(
        `${this.baseUrl}/calendars/primary/events?${params.toString()}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      )

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        this.logger.error('Google calendar events fetch failed', { 
          status: response.status, 
          errorData 
        } as any)
        
        if (response.status === 401) {
          throw new Error('Google authentication expired')
        }
        
        throw new Error(`Failed to fetch events: HTTP ${response.status}`)
      }

      const data = await response.json() as any
      const events = data.items || []

      this.logger.success('Google calendar events fetched successfully', { count: events.length })
      return events

    } catch (error) {
      this.logger.error('Failed to get Google calendar events', error as Error)
      throw error
    }
  }

  /**
   * Get a specific calendar event
   */
  async getEvent(eventId: string): Promise<GoogleCalendarEvent> {
    try {
      this.logger.info('Fetching Google calendar event', { eventId })

      const token = await this.getValidToken()
      if (!token) {
        throw new Error('No valid Google token available')
      }

      const response = await fetch(`${this.baseUrl}/calendars/primary/events/${eventId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Event not found')
        }
        if (response.status === 401) {
          throw new Error('Google authentication expired')
        }
        throw new Error(`Failed to fetch event: HTTP ${response.status}`)
      }

      const event = await response.json() as GoogleCalendarEvent
      this.logger.success('Google calendar event fetched successfully', { eventId })
      return event

    } catch (error) {
      this.logger.error('Failed to get Google calendar event', error as Error, { eventId })
      throw error
    }
  }

  /**
   * Create a new calendar event
   */
  async createEvent(eventData: Partial<GoogleCalendarEvent>): Promise<GoogleCalendarEvent> {
    try {
      this.logger.info('Creating Google calendar event', { summary: eventData.summary })

      const token = await this.getValidToken()
      if (!token) {
        throw new Error('No valid Google token available')
      }

      const response = await fetch(`${this.baseUrl}/calendars/primary/events`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(eventData)
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        this.logger.error('Google calendar event creation failed', { 
          status: response.status, 
          errorData 
        } as any)
        
        if (response.status === 401) {
          throw new Error('Google authentication expired')
        }
        
        throw new Error(`Failed to create event: ${(errorData as any)?.error?.message || 'Unknown error'}`)
      }

      const createdEvent = await response.json() as GoogleCalendarEvent
      this.logger.success('Google calendar event created successfully', { eventId: createdEvent.id })
      return createdEvent

    } catch (error) {
      this.logger.error('Failed to create Google calendar event', error as Error)
      throw error
    }
  }

  /**
   * Update an existing calendar event
   */
  async updateEvent(eventId: string, eventData: Partial<GoogleCalendarEvent>): Promise<GoogleCalendarEvent> {
    try {
      this.logger.info('Updating Google calendar event', { eventId })

      const token = await this.getValidToken()
      if (!token) {
        throw new Error('No valid Google token available')
      }

      const response = await fetch(`${this.baseUrl}/calendars/primary/events/${eventId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(eventData)
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        this.logger.error('Google calendar event update failed', { 
          status: response.status, 
          errorData 
        } as any)
        
        if (response.status === 404) {
          throw new Error('Event not found')
        }
        if (response.status === 401) {
          throw new Error('Google authentication expired')
        }
        
        throw new Error(`Failed to update event: ${(errorData as any)?.error?.message || 'Unknown error'}`)
      }

      const updatedEvent = await response.json() as GoogleCalendarEvent
      this.logger.success('Google calendar event updated successfully', { eventId })
      return updatedEvent

    } catch (error) {
      this.logger.error('Failed to update Google calendar event', error as Error, { eventId })
      throw error
    }
  }

  /**
   * Delete a calendar event
   */
  async deleteEvent(eventId: string): Promise<void> {
    try {
      this.logger.info('Deleting Google calendar event', { eventId })

      const token = await this.getValidToken()
      if (!token) {
        throw new Error('No valid Google token available')
      }

      const response = await fetch(`${this.baseUrl}/calendars/primary/events/${eventId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        if (response.status === 404) {
          this.logger.warn('Google calendar event not found for deletion', { eventId })
          return // Event already deleted
        }
        if (response.status === 401) {
          throw new Error('Google authentication expired')
        }
        throw new Error(`Failed to delete event: HTTP ${response.status}`)
      }

      this.logger.success('Google calendar event deleted successfully', { eventId })

    } catch (error) {
      this.logger.error('Failed to delete Google calendar event', error as Error, { eventId })
      throw error
    }
  }

  /**
   * Create a Google Meet event
   */
  async createMeetEvent(eventData: Partial<GoogleCalendarEvent>): Promise<GoogleCalendarEvent> {
    try {
      this.logger.info('Creating Google Meet event', { summary: eventData.summary })

      const meetEventData = {
        ...eventData,
        conferenceData: {
          createRequest: {
            requestId: `meet-${Date.now()}`,
            conferenceSolutionKey: {
              type: 'hangoutsMeet'
            }
          }
        }
      }

      // Need to add conferenceDataVersion parameter for Google Meet
      const token = await this.getValidToken()
      if (!token) {
        throw new Error('No valid Google token available')
      }

      const response = await fetch(`${this.baseUrl}/calendars/primary/events?conferenceDataVersion=1`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(meetEventData)
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        this.logger.error('Google Meet event creation failed', { 
          status: response.status, 
          errorData 
        } as any)
        
        if (response.status === 401) {
          throw new Error('Google authentication expired')
        }
        
        throw new Error(`Failed to create Meet event: ${(errorData as any)?.error?.message || 'Unknown error'}`)
      }

      const createdEvent = await response.json() as GoogleCalendarEvent
      this.logger.success('Google Meet event created successfully', { eventId: createdEvent.id })
      return createdEvent

    } catch (error) {
      this.logger.error('Failed to create Google Meet event', error as Error)
      throw error
    }
  }

  /**
   * Add Google Meet to existing event
   */
  async addMeetToEvent(eventId: string): Promise<GoogleCalendarEvent> {
    try {
      this.logger.info('Adding Google Meet to existing event', { eventId })

      // First get the existing event
      const existingEvent = await this.getEvent(eventId)

      const updateData = {
        ...existingEvent,
        conferenceData: {
          createRequest: {
            requestId: `meet-${Date.now()}`,
            conferenceSolutionKey: {
              type: 'hangoutsMeet'
            }
          }
        }
      }

      const token = await this.getValidToken()
      if (!token) {
        throw new Error('No valid Google token available')
      }

      const response = await fetch(`${this.baseUrl}/calendars/primary/events/${eventId}?conferenceDataVersion=1`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        this.logger.error('Adding Google Meet to event failed', { 
          status: response.status, 
          errorData 
        } as any)
        
        throw new Error(`Failed to add Meet to event: ${(errorData as any)?.error?.message || 'Unknown error'}`)
      }

      const updatedEvent = await response.json() as GoogleCalendarEvent
      this.logger.success('Google Meet added to event successfully', { eventId })
      return updatedEvent

    } catch (error) {
      this.logger.error('Failed to add Google Meet to event', error as Error, { eventId })
      throw error
    }
  }

  /**
   * Get user's calendars
   */
  async getCalendars(): Promise<any[]> {
    try {
      this.logger.info('Fetching Google calendars')

      const token = await this.getValidToken()
      if (!token) {
        throw new Error('No valid Google token available')
      }

      const response = await fetch(`${this.baseUrl}/users/me/calendarList`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Google authentication expired')
        }
        throw new Error(`Failed to fetch calendars: HTTP ${response.status}`)
      }

      const data = await response.json() as any
      const calendars = data.items || []

      this.logger.success('Google calendars fetched successfully', { count: calendars.length })
      return calendars

    } catch (error) {
      this.logger.error('Failed to get Google calendars', error as Error)
      throw error
    }
  }

  /**
   * Test connection to Google Calendar API
   */
  async testConnection(): Promise<CalendarServiceResponse<boolean>> {
    try {
      this.logger.info('Testing Google calendar connection')

      const token = await this.getValidToken()
      if (!token) {
        return {
          success: false,
          error: 'No valid Google token available'
        }
      }

      // Test with a simple calendar list request
      const response = await fetch(`${this.baseUrl}/users/me/calendarList?maxResults=1`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        if (response.status === 401) {
          return {
            success: false,
            error: 'Google authentication expired'
          }
        }
        return {
          success: false,
          error: `Connection test failed: HTTP ${response.status}`
        }
      }

      this.logger.success('Google calendar connection test successful')
      return {
        success: true,
        data: true
      }

    } catch (error) {
      this.logger.error('Google calendar connection test failed', error as Error)
      return {
        success: false,
        error: `Connection test failed: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  /**
   * Convert unified event data to Google format
   */
  convertFromUnifiedEvent(eventData: CreateEventData): Partial<GoogleCalendarEvent> {
    const googleEvent: Partial<GoogleCalendarEvent> = {
      summary: eventData.title,
      description: eventData.description || '',
      location: eventData.location,
      visibility: 'default',
      status: 'confirmed'
    }

    // Handle all-day vs timed events
    if (eventData.isAllDay) {
      const startDate = new Date(eventData.startTime)
      const endDate = new Date(eventData.endTime)
      
      googleEvent.start = {
        date: startDate.toISOString().split('T')[0]
      }
      googleEvent.end = {
        date: endDate.toISOString().split('T')[0]
      }
    } else {
      // Get the user's timezone
      const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
      
      googleEvent.start = {
        dateTime: eventData.startTime.toISOString(),
        timeZone: userTimeZone
      }
      googleEvent.end = {
        dateTime: eventData.endTime.toISOString(),
        timeZone: userTimeZone
      }
    }

    // Add attendees if provided
    if (eventData.attendees && eventData.attendees.length > 0) {
      googleEvent.attendees = eventData.attendees.map(email => ({
        email: email,
        responseStatus: 'needsAction'
      }))
    }

    // Add reminders
    if (eventData.reminderMinutes !== undefined) {
      googleEvent.reminders = {
        useDefault: false,
        overrides: [{
          method: 'popup',
          minutes: eventData.reminderMinutes
        }]
      }
    } else {
      googleEvent.reminders = {
        useDefault: true
      }
    }

    // Add Google Meet if requested
    if (eventData.isGoogleMeet) {
      googleEvent.conferenceData = {
        createRequest: {
          requestId: `meet-${Date.now()}`,
          conferenceSolutionKey: {
            type: 'hangoutsMeet'
          }
        }
      }
    }

    return googleEvent
  }

  /**
   * Extract Google Meet information from event
   */
  extractGoogleMeetInfo(event: GoogleCalendarEvent): { joinUrl?: string; meetingId?: string } | null {
    if (!event.conferenceData?.entryPoints?.length) {
      return null
    }

    const videoEntry = event.conferenceData.entryPoints.find(ep => ep.entryPointType === 'video')
    
    return {
      joinUrl: videoEntry?.uri,
      meetingId: (event.conferenceData as any).conferenceId
    }
  }

  /**
   * Get valid access token for Google Calendar
   */
  private async getValidToken(): Promise<string | null> {
    try {
      const tokenData = await tokenSecurityService.retrieveTokenSecurely(
        this.databaseService,
        'google',
        'access'
      )

      if (!tokenData || !tokenData.accessToken) {
        return null
      }

      // Check if token is expired
      if (tokenSecurityService.isTokenExpired(tokenData)) {
        this.logger.debug('Google token expired, attempting refresh')
        // Token refresh would be handled by the auth system
        return null
      }

      return tokenData.accessToken

    } catch (error) {
      this.logger.error('Failed to get valid Google token', error as Error)
      return null
    }
  }
}