// Calendar Handler - IPC handlers for calendar operations

import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { DatabaseService } from '../../backend/services/database.service'
import { CalendarAggregatorService } from '../services/calendar/calendar.aggregator.service'
import { MicrosoftCalendarService } from '../services/calendar/microsoft.calendar.service'
import { GoogleCalendarService } from '../services/calendar/google.calendar.service'
import { databaseLogger } from '../../backend/utils/logger'

export class CalendarHandler {
  private calendarAggregator: CalendarAggregatorService
  private microsoftCalendar: MicrosoftCalendarService
  private googleCalendar: GoogleCalendarService
  private logger = databaseLogger

  constructor(databaseService: DatabaseService) {
    this.microsoftCalendar = new MicrosoftCalendarService(databaseService)
    this.googleCalendar = new GoogleCalendarService(databaseService)
    this.calendarAggregator = new CalendarAggregatorService(
      this.microsoftCalendar,
      this.googleCalendar,
      databaseService
    )
    
    this.logger.info('Calendar handler initialized')
    this.registerHandlers()
  }

  private registerHandlers(): void {
    this.logger.debug('Registering calendar IPC handlers')

    // Account management
    ipcMain.handle('calendar-get-connected-accounts', this.handleGetConnectedAccounts.bind(this))
    ipcMain.handle('calendar-get-account-info', this.handleGetAccountInfo.bind(this))
    
    // Event operations
    ipcMain.handle('calendar-get-events', this.handleGetEvents.bind(this))
    ipcMain.handle('calendar-get-all-events', this.handleGetAllEvents.bind(this))
    ipcMain.handle('calendar-get-event', this.handleGetEvent.bind(this))
    ipcMain.handle('calendar-create-event', this.handleCreateEvent.bind(this))
    ipcMain.handle('calendar-update-event', this.handleUpdateEvent.bind(this))
    ipcMain.handle('calendar-delete-event', this.handleDeleteEvent.bind(this))
    
    // Teams meeting specific
    ipcMain.handle('calendar-create-teams-meeting', this.handleCreateTeamsMeeting.bind(this))
    ipcMain.handle('calendar-add-teams-to-event', this.handleAddTeamsToEvent.bind(this))
    
    // Google Meet specific
    ipcMain.handle('calendar-add-meet-to-event', this.handleAddMeetToEvent.bind(this))
    
    // Calendar management
    ipcMain.handle('calendar-get-calendars', this.handleGetCalendars.bind(this))
    ipcMain.handle('calendar-test-connection', this.handleTestConnection.bind(this))
    ipcMain.handle('calendar-test-all-connections', this.handleTestAllConnections.bind(this))
    
    // Cache management
    ipcMain.handle('calendar-clear-cache', this.handleClearCache.bind(this))
    ipcMain.handle('calendar-get-cache-stats', this.handleGetCacheStats.bind(this))

    this.logger.success('Calendar IPC handlers registered')
  }

  /**
   * Get all connected accounts with calendar access
   */
  private async handleGetConnectedAccounts(event: IpcMainInvokeEvent): Promise<any> {
    try {
      this.logger.info('Getting connected accounts for calendar')
      
      const accounts = await this.calendarAggregator.getConnectedAccounts()
      
      return {
        success: true,
        data: accounts
      }
    } catch (error) {
      this.logger.error('Failed to get connected accounts', error as Error)
      return {
        success: false,
        error: `Failed to get accounts: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  /**
   * Get detailed information for a specific account
   */
  private async handleGetAccountInfo(event: IpcMainInvokeEvent, accountId: string): Promise<any> {
    try {
      this.logger.info('Getting account info', { accountId })
      
      if (!accountId) {
        return {
          success: false,
          error: 'Account ID is required'
        }
      }
      
      const accountInfo = await this.calendarAggregator.getAccountInfo(accountId)
      
      return {
        success: true,
        data: accountInfo
      }
    } catch (error) {
      this.logger.error('Failed to get account info', error as Error, { accountId })
      return {
        success: false,
        error: `Failed to get account info: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  /**
   * Get calendar events for a specific account and date range
   */
  private async handleGetEvents(
    event: IpcMainInvokeEvent, 
    accountId: string, 
    startDate: string, 
    endDate: string
  ): Promise<any> {
    try {
      this.logger.info('Getting calendar events', { accountId, startDate, endDate })
      
      if (!accountId || !startDate || !endDate) {
        return {
          success: false,
          error: 'Account ID, start date, and end date are required'
        }
      }
      
      const events = await this.calendarAggregator.getEvents(
        accountId,
        new Date(startDate),
        new Date(endDate)
      )
      
      return {
        success: true,
        data: events
      }
    } catch (error) {
      this.logger.error('Failed to get calendar events', error as Error, { accountId })
      return {
        success: false,
        error: `Failed to get events: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  /**
   * Get events from all connected accounts for a date range
   */
  private async handleGetAllEvents(
    event: IpcMainInvokeEvent, 
    startDate: string, 
    endDate: string
  ): Promise<any> {
    try {
      this.logger.info('Getting all calendar events', { startDate, endDate })
      
      if (!startDate || !endDate) {
        return {
          success: false,
          error: 'Start date and end date are required'
        }
      }
      
      const events = await this.calendarAggregator.getAllEvents(
        new Date(startDate),
        new Date(endDate)
      )
      
      return {
        success: true,
        data: events
      }
    } catch (error) {
      this.logger.error('Failed to get all calendar events', error as Error)
      return {
        success: false,
        error: `Failed to get all events: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  /**
   * Get a specific calendar event
   */
  private async handleGetEvent(
    event: IpcMainInvokeEvent,
    accountId: string,
    eventId: string
  ): Promise<any> {
    try {
      this.logger.info('Getting calendar event', { accountId, eventId })
      
      if (!accountId || !eventId) {
        return {
          success: false,
          error: 'Account ID and event ID are required'
        }
      }

      const account = await this.calendarAggregator.getAccountInfo(accountId)
      let rawEvent: any

      if (account.provider === 'microsoft') {
        rawEvent = await this.microsoftCalendar.getEvent(eventId)
      } else if (account.provider === 'google') {
        rawEvent = await this.googleCalendar.getEvent(eventId)
      } else {
        throw new Error(`Unsupported provider: ${account.provider}`)
      }

      // Normalize the event
      const normalizedEvent = account.provider === 'microsoft' 
        ? this.normalizeEvent(rawEvent, accountId, 'microsoft')
        : this.normalizeEvent(rawEvent, accountId, 'google')
      
      return {
        success: true,
        data: normalizedEvent
      }
    } catch (error) {
      this.logger.error('Failed to get calendar event', error as Error, { accountId, eventId })
      return {
        success: false,
        error: `Failed to get event: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  /**
   * Create a new calendar event
   */
  private async handleCreateEvent(
    event: IpcMainInvokeEvent,
    accountId: string,
    eventData: any
  ): Promise<any> {
    try {
      this.logger.info('Creating calendar event', { accountId, title: eventData.title })
      
      if (!accountId || !eventData) {
        return {
          success: false,
          error: 'Account ID and event data are required'
        }
      }

      // Validate required fields
      if (!eventData.title || !eventData.startTime || !eventData.endTime) {
        return {
          success: false,
          error: 'Title, start time, and end time are required'
        }
      }

      const createdEvent = await this.calendarAggregator.createEvent(accountId, eventData)
      
      return {
        success: true,
        data: createdEvent
      }
    } catch (error) {
      this.logger.error('Failed to create calendar event', error as Error, { accountId })
      return {
        success: false,
        error: `Failed to create event: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  /**
   * Update an existing calendar event
   */
  private async handleUpdateEvent(
    event: IpcMainInvokeEvent,
    accountId: string,
    eventId: string,
    eventData: any
  ): Promise<any> {
    try {
      this.logger.info('Updating calendar event', { accountId, eventId })
      
      if (!accountId || !eventId || !eventData) {
        return {
          success: false,
          error: 'Account ID, event ID, and event data are required'
        }
      }

      const updatedEvent = await this.calendarAggregator.updateEvent(accountId, eventId, eventData)
      
      return {
        success: true,
        data: updatedEvent
      }
    } catch (error) {
      this.logger.error('Failed to update calendar event', error as Error, { accountId, eventId })
      return {
        success: false,
        error: `Failed to update event: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  /**
   * Delete a calendar event
   */
  private async handleDeleteEvent(
    event: IpcMainInvokeEvent,
    accountId: string,
    eventId: string
  ): Promise<any> {
    try {
      this.logger.info('Deleting calendar event', { accountId, eventId })
      
      if (!accountId || !eventId) {
        return {
          success: false,
          error: 'Account ID and event ID are required'
        }
      }

      await this.calendarAggregator.deleteEvent(accountId, eventId)
      
      return {
        success: true
      }
    } catch (error) {
      this.logger.error('Failed to delete calendar event', error as Error, { accountId, eventId })
      return {
        success: false,
        error: `Failed to delete event: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  /**
   * Create a Teams meeting event (Microsoft only)
   */
  private async handleCreateTeamsMeeting(
    event: IpcMainInvokeEvent,
    accountId: string,
    eventData: any
  ): Promise<any> {
    try {
      this.logger.info('Creating Teams meeting', { accountId, title: eventData.title })
      
      if (!accountId || !eventData) {
        return {
          success: false,
          error: 'Account ID and event data are required'
        }
      }

      const meeting = await this.calendarAggregator.createTeamsMeeting(accountId, eventData)
      
      return {
        success: true,
        data: meeting
      }
    } catch (error) {
      this.logger.error('Failed to create Teams meeting', error as Error, { accountId })
      return {
        success: false,
        error: `Failed to create Teams meeting: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  /**
   * Add Teams meeting to existing event (Microsoft only)
   */
  private async handleAddTeamsToEvent(
    event: IpcMainInvokeEvent,
    accountId: string,
    eventId: string
  ): Promise<any> {
    try {
      this.logger.info('Adding Teams meeting to event', { accountId, eventId })
      
      if (!accountId || !eventId) {
        return {
          success: false,
          error: 'Account ID and event ID are required'
        }
      }

      const account = await this.calendarAggregator.getAccountInfo(accountId)
      
      if (account.provider !== 'microsoft') {
        return {
          success: false,
          error: 'Teams meetings are only supported for Microsoft accounts'
        }
      }

      const updatedEvent = await this.microsoftCalendar.addTeamsMeetingToEvent(eventId)
      const normalizedEvent = this.normalizeEvent(updatedEvent, accountId, 'microsoft')
      
      return {
        success: true,
        data: normalizedEvent
      }
    } catch (error) {
      this.logger.error('Failed to add Teams meeting to event', error as Error, { accountId, eventId })
      return {
        success: false,
        error: `Failed to add Teams meeting: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  /**
   * Add Google Meet to existing event (Google only)
   */
  private async handleAddMeetToEvent(
    event: IpcMainInvokeEvent,
    accountId: string,
    eventId: string
  ): Promise<any> {
    try {
      this.logger.info('Adding Google Meet to event', { accountId, eventId })
      
      if (!accountId || !eventId) {
        return {
          success: false,
          error: 'Account ID and event ID are required'
        }
      }

      const account = await this.calendarAggregator.getAccountInfo(accountId)
      
      if (account.provider !== 'google') {
        return {
          success: false,
          error: 'Google Meet is only supported for Google accounts'
        }
      }

      const updatedEvent = await this.googleCalendar.addMeetToEvent(eventId)
      const normalizedEvent = this.normalizeEvent(updatedEvent, accountId, 'google')
      
      return {
        success: true,
        data: normalizedEvent
      }
    } catch (error) {
      this.logger.error('Failed to add Google Meet to event', error as Error, { accountId, eventId })
      return {
        success: false,
        error: `Failed to add Google Meet: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  /**
   * Get calendars for a specific account
   */
  private async handleGetCalendars(
    event: IpcMainInvokeEvent,
    accountId: string
  ): Promise<any> {
    try {
      this.logger.info('Getting calendars', { accountId })
      
      if (!accountId) {
        return {
          success: false,
          error: 'Account ID is required'
        }
      }

      const account = await this.calendarAggregator.getAccountInfo(accountId)
      let calendars: any[]

      if (account.provider === 'microsoft') {
        calendars = await this.microsoftCalendar.getCalendars()
      } else if (account.provider === 'google') {
        calendars = await this.googleCalendar.getCalendars()
      } else {
        throw new Error(`Unsupported provider: ${account.provider}`)
      }
      
      return {
        success: true,
        data: calendars
      }
    } catch (error) {
      this.logger.error('Failed to get calendars', error as Error, { accountId })
      return {
        success: false,
        error: `Failed to get calendars: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  /**
   * Test connection for a specific account
   */
  private async handleTestConnection(
    event: IpcMainInvokeEvent,
    accountId: string
  ): Promise<any> {
    try {
      this.logger.info('Testing connection', { accountId })
      
      if (!accountId) {
        return {
          success: false,
          error: 'Account ID is required'
        }
      }

      const account = await this.calendarAggregator.getAccountInfo(accountId)
      let result: any

      if (account.provider === 'microsoft') {
        result = await this.microsoftCalendar.testConnection()
      } else if (account.provider === 'google') {
        result = await this.googleCalendar.testConnection()
      } else {
        throw new Error(`Unsupported provider: ${account.provider}`)
      }

      return result
    } catch (error) {
      this.logger.error('Connection test failed', error as Error, { accountId })
      return {
        success: false,
        error: `Connection test failed: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  /**
   * Test connections for all providers
   */
  private async handleTestAllConnections(event: IpcMainInvokeEvent): Promise<any> {
    try {
      this.logger.info('Testing all connections')
      
      const results = await this.calendarAggregator.testAllConnections()
      
      return {
        success: true,
        data: results
      }
    } catch (error) {
      this.logger.error('Failed to test all connections', error as Error)
      return {
        success: false,
        error: `Failed to test connections: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  /**
   * Clear calendar cache
   */
  private async handleClearCache(event: IpcMainInvokeEvent): Promise<any> {
    try {
      this.logger.info('Clearing calendar cache')
      
      this.calendarAggregator.clearCache()
      
      return {
        success: true
      }
    } catch (error) {
      this.logger.error('Failed to clear cache', error as Error)
      return {
        success: false,
        error: `Failed to clear cache: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  /**
   * Get cache statistics
   */
  private async handleGetCacheStats(event: IpcMainInvokeEvent): Promise<any> {
    try {
      this.logger.debug('Getting cache statistics')
      
      const stats = this.calendarAggregator.getCacheStats()
      
      return {
        success: true,
        data: stats
      }
    } catch (error) {
      this.logger.error('Failed to get cache stats', error as Error)
      return {
        success: false,
        error: `Failed to get cache stats: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  /**
   * Helper method to normalize events from different providers
   */
  private normalizeEvent(rawEvent: any, accountId: string, provider: 'microsoft' | 'google'): any {
    if (provider === 'microsoft') {
      return {
        id: rawEvent.id,
        provider: 'microsoft',
        accountId,
        title: rawEvent.subject || 'Untitled Event',
        description: rawEvent.body?.content,
        startTime: new Date(rawEvent.start.dateTime),
        endTime: new Date(rawEvent.end.dateTime),
        isAllDay: !rawEvent.start.dateTime.includes('T'),
        location: rawEvent.location?.displayName,
        attendees: rawEvent.attendees?.map((att: any) => ({
          email: att.emailAddress.address,
          name: att.emailAddress.name,
          status: att.status.response
        })),
        reminderMinutes: rawEvent.reminderMinutesBeforeStart,
        hasOnlineMeeting: !!rawEvent.isOnlineMeeting,
        meetingUrl: rawEvent.onlineMeeting?.joinUrl,
        meetingProvider: rawEvent.isOnlineMeeting ? 'teams' : undefined,
        originalEvent: rawEvent,
        providerSpecific: {
          microsoft: {
            showAs: rawEvent.showAs,
            sensitivity: rawEvent.sensitivity,
            isTeamsMeeting: !!rawEvent.isOnlineMeeting
          }
        }
      }
    } else {
      const hasConference = !!rawEvent.conferenceData?.entryPoints?.length
      
      return {
        id: rawEvent.id,
        provider: 'google',
        accountId,
        title: rawEvent.summary || 'Untitled Event',
        description: rawEvent.description,
        startTime: new Date(rawEvent.start.dateTime || rawEvent.start.date),
        endTime: new Date(rawEvent.end.dateTime || rawEvent.end.date),
        isAllDay: !!rawEvent.start.date,
        location: rawEvent.location,
        attendees: rawEvent.attendees?.map((att: any) => ({
          email: att.email,
          name: att.displayName,
          status: att.responseStatus
        })),
        reminderMinutes: rawEvent.reminders?.overrides?.[0]?.minutes,
        hasOnlineMeeting: hasConference,
        meetingUrl: rawEvent.conferenceData?.entryPoints?.find((ep: any) => ep.entryPointType === 'video')?.uri,
        meetingProvider: hasConference ? 'meet' : undefined,
        originalEvent: rawEvent,
        providerSpecific: {
          google: {
            visibility: rawEvent.visibility,
            status: rawEvent.status,
            conferenceData: rawEvent.conferenceData
          }
        }
      }
    }
  }

  /**
   * Cleanup method
   */
  async cleanup(): Promise<void> {
    this.logger.info('Cleaning up Calendar Handler')
    
    try {
      this.calendarAggregator.clearCache()
    } catch (error) {
      this.logger.error('Error during calendar handler cleanup', error as Error)
    }
  }
}