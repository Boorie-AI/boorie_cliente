// Calendar Aggregator Service - Unified operations across multiple providers

import { DatabaseService } from '../../../backend/services/database.service'
import { MicrosoftCalendarService } from './microsoft.calendar.service'
import { GoogleCalendarService } from './google.calendar.service'
import { CalendarCacheService } from './calendar.cache.service'
import { databaseLogger } from '../../../backend/utils/logger'
import {
  CalendarAccount,
  UnifiedCalendarEvent,
  CreateEventData,
  UpdateEventData,
  CalendarServiceResponse,
  MicrosoftCalendarEvent,
  GoogleCalendarEvent
} from './calendar.types'

export class CalendarAggregatorService {
  private microsoftService: MicrosoftCalendarService
  private googleService: GoogleCalendarService
  private databaseService: DatabaseService
  private cacheService: CalendarCacheService
  private logger = databaseLogger

  constructor(
    microsoftService: MicrosoftCalendarService,
    googleService: GoogleCalendarService,
    databaseService: DatabaseService
  ) {
    this.microsoftService = microsoftService
    this.googleService = googleService
    this.databaseService = databaseService
    this.cacheService = new CalendarCacheService()
    this.logger.info('Calendar Aggregator Service initialized')
  }

  /**
   * Get all connected accounts with calendar access
   */
  async getConnectedAccounts(): Promise<CalendarAccount[]> {
    try {
      this.logger.info('Getting connected accounts for calendar')
      const accounts: CalendarAccount[] = []
      
      // Get Microsoft accounts
      const microsoftAccounts = await this.getMicrosoftAccounts()
      accounts.push(...microsoftAccounts)
      
      // Get Google accounts
      const googleAccounts = await this.getGoogleAccounts()
      accounts.push(...googleAccounts)
      
      // Sort by provider and connection status
      const sortedAccounts = accounts.sort((a, b) => {
        if (a.isConnected !== b.isConnected) {
          return a.isConnected ? -1 : 1
        }
        return a.provider.localeCompare(b.provider)
      })

      this.logger.success('Connected accounts retrieved', { count: sortedAccounts.length })
      return sortedAccounts
      
    } catch (error) {
      this.logger.error('Failed to get connected accounts', error as Error)
      throw error
    }
  }

  /**
   * Get detailed information for a specific account
   */
  async getAccountInfo(accountId: string): Promise<CalendarAccount> {
    try {
      this.logger.info('Getting account info', { accountId })

      // Try cache first
      const cacheKey = CalendarCacheService.createAccountKey(accountId)
      const cached = this.cacheService.get<CalendarAccount>(cacheKey)
      if (cached) {
        return cached
      }

      // Get all accounts and find the specific one
      const accounts = await this.getConnectedAccounts()
      const account = accounts.find(acc => acc.id === accountId)
      
      if (!account) {
        throw new Error(`Account not found: ${accountId}`)
      }

      // Cache the account info
      this.cacheService.set(cacheKey, account, 300000) // 5 minutes

      this.logger.success('Account info retrieved', { accountId })
      return account
      
    } catch (error) {
      this.logger.error('Failed to get account info', error as Error, { accountId })
      throw error
    }
  }

  /**
   * Get calendar events for a specific account and date range
   */
  async getEvents(
    accountId: string, 
    startDate: Date, 
    endDate: Date
  ): Promise<UnifiedCalendarEvent[]> {
    try {
      this.logger.info('Getting calendar events', { accountId, startDate, endDate })

      // Check cache first
      const cacheKey = CalendarCacheService.createEventsKey(accountId, startDate, endDate)
      const cachedEvents = this.cacheService.get<UnifiedCalendarEvent[]>(cacheKey)
      
      if (cachedEvents) {
        this.logger.debug('Returning cached events', { accountId, count: cachedEvents.length })
        return cachedEvents
      }

      // Get account info to determine provider
      const account = await this.getAccountInfo(accountId)
      let events: UnifiedCalendarEvent[]

      if (account.provider === 'microsoft') {
        const rawEvents = await this.microsoftService.getEvents(startDate, endDate)
        events = rawEvents.map(event => this.normalizeMicrosoftEvent(event, accountId))
      } else if (account.provider === 'google') {
        const rawEvents = await this.googleService.getEvents(startDate, endDate)
        events = rawEvents.map(event => this.normalizeGoogleEvent(event, accountId))
      } else {
        throw new Error(`Unsupported provider: ${account.provider}`)
      }

      // Cache the results
      this.cacheService.set(cacheKey, events, 300000) // 5 minutes cache
      
      this.logger.success('Calendar events retrieved', { accountId, count: events.length })
      return events
      
    } catch (error) {
      this.logger.error('Failed to get events', error as Error, { accountId })
      throw error
    }
  }

  /**
   * Get events from all connected accounts for a date range
   */
  async getAllEvents(startDate: Date, endDate: Date): Promise<UnifiedCalendarEvent[]> {
    try {
      this.logger.info('Getting events from all connected accounts')

      const accounts = await this.getConnectedAccounts()
      const connectedAccounts = accounts.filter(acc => acc.isConnected && acc.hasCalendarAccess)

      if (connectedAccounts.length === 0) {
        this.logger.warn('No connected accounts with calendar access')
        return []
      }

      // Fetch events from all accounts in parallel
      const eventPromises = connectedAccounts.map(account => 
        this.getEvents(account.id, startDate, endDate)
          .catch(error => {
            this.logger.error('Failed to get events for account', error as Error, { accountId: account.id })
            return [] // Return empty array for failed accounts
          })
      )

      const allEventsArrays = await Promise.all(eventPromises)
      const allEvents = allEventsArrays.flat()

      // Sort by start time
      allEvents.sort((a, b) => a.startTime.getTime() - b.startTime.getTime())

      this.logger.success('All events retrieved', { totalEvents: allEvents.length })
      return allEvents

    } catch (error) {
      this.logger.error('Failed to get all events', error as Error)
      throw error
    }
  }

  /**
   * Create a new event for a specific account
   */
  async createEvent(accountId: string, eventData: CreateEventData): Promise<UnifiedCalendarEvent> {
    try {
      this.logger.info('Creating calendar event', { accountId, title: eventData.title })

      const account = await this.getAccountInfo(accountId)
      let createdEvent: UnifiedCalendarEvent

      if (account.provider === 'microsoft') {
        const microsoftEventData = this.microsoftService.convertFromUnifiedEvent(eventData)
        
        if (eventData.isTeamsMeeting) {
          const rawEvent = await this.microsoftService.createTeamsMeeting(microsoftEventData)
          createdEvent = this.normalizeMicrosoftEvent(rawEvent, accountId)
        } else {
          const rawEvent = await this.microsoftService.createEvent(microsoftEventData)
          createdEvent = this.normalizeMicrosoftEvent(rawEvent, accountId)
        }
      } else if (account.provider === 'google') {
        const googleEventData = this.googleService.convertFromUnifiedEvent(eventData)
        
        if (eventData.isGoogleMeet) {
          const rawEvent = await this.googleService.createMeetEvent(googleEventData)
          createdEvent = this.normalizeGoogleEvent(rawEvent, accountId)
        } else {
          const rawEvent = await this.googleService.createEvent(googleEventData)
          createdEvent = this.normalizeGoogleEvent(rawEvent, accountId)
        }
      } else {
        throw new Error(`Unsupported provider: ${account.provider}`)
      }

      // Invalidate cache for this account
      this.cacheService.invalidateAccountEvents(accountId)
      
      this.logger.success('Calendar event created', { accountId, eventId: createdEvent.id })
      return createdEvent
      
    } catch (error) {
      this.logger.error('Failed to create event', error as Error, { accountId })
      throw error
    }
  }

  /**
   * Update an existing event
   */
  async updateEvent(
    accountId: string, 
    eventId: string, 
    eventData: UpdateEventData
  ): Promise<UnifiedCalendarEvent> {
    try {
      this.logger.info('Updating calendar event', { accountId, eventId })

      const account = await this.getAccountInfo(accountId)
      let updatedEvent: UnifiedCalendarEvent

      if (account.provider === 'microsoft') {
        // Convert update data to Microsoft format
        const microsoftEventData = this.microsoftService.convertFromUnifiedEvent(eventData as CreateEventData)
        const rawEvent = await this.microsoftService.updateEvent(eventId, microsoftEventData)
        updatedEvent = this.normalizeMicrosoftEvent(rawEvent, accountId)
      } else if (account.provider === 'google') {
        // Convert update data to Google format
        const googleEventData = this.googleService.convertFromUnifiedEvent(eventData as CreateEventData)
        const rawEvent = await this.googleService.updateEvent(eventId, googleEventData)
        updatedEvent = this.normalizeGoogleEvent(rawEvent, accountId)
      } else {
        throw new Error(`Unsupported provider: ${account.provider}`)
      }

      // Invalidate cache
      this.cacheService.invalidateAccountEvents(accountId)
      this.cacheService.delete(CalendarCacheService.createEventKey(accountId, eventId))
      
      this.logger.success('Calendar event updated', { accountId, eventId })
      return updatedEvent
      
    } catch (error) {
      this.logger.error('Failed to update event', error as Error, { accountId, eventId })
      throw error
    }
  }

  /**
   * Delete an event
   */
  async deleteEvent(accountId: string, eventId: string): Promise<void> {
    try {
      this.logger.info('Deleting calendar event', { accountId, eventId })

      const account = await this.getAccountInfo(accountId)

      if (account.provider === 'microsoft') {
        await this.microsoftService.deleteEvent(eventId)
      } else if (account.provider === 'google') {
        await this.googleService.deleteEvent(eventId)
      } else {
        throw new Error(`Unsupported provider: ${account.provider}`)
      }

      // Invalidate cache
      this.cacheService.invalidateAccountEvents(accountId)
      this.cacheService.delete(CalendarCacheService.createEventKey(accountId, eventId))
      
      this.logger.success('Calendar event deleted', { accountId, eventId })
      
    } catch (error) {
      this.logger.error('Failed to delete event', error as Error, { accountId, eventId })
      throw error
    }
  }

  /**
   * Create a Teams meeting (Microsoft only)
   */
  async createTeamsMeeting(accountId: string, eventData: CreateEventData): Promise<UnifiedCalendarEvent> {
    try {
      this.logger.info('Creating Teams meeting', { accountId, title: eventData.title })

      const account = await this.getAccountInfo(accountId)
      
      if (account.provider !== 'microsoft') {
        throw new Error('Teams meetings are only supported for Microsoft accounts')
      }

      const microsoftEventData = this.microsoftService.convertFromUnifiedEvent(eventData)
      const teamsEvent = await this.microsoftService.createTeamsMeeting(microsoftEventData)
      const normalizedEvent = this.normalizeMicrosoftEvent(teamsEvent, accountId)

      // Invalidate cache
      this.cacheService.invalidateAccountEvents(accountId)
      
      this.logger.success('Teams meeting created', { accountId, eventId: normalizedEvent.id })
      return normalizedEvent
      
    } catch (error) {
      this.logger.error('Failed to create Teams meeting', error as Error, { accountId })
      throw error
    }
  }

  /**
   * Test connection for all providers
   */
  async testAllConnections(): Promise<{ microsoft: boolean; google: boolean }> {
    try {
      this.logger.info('Testing all calendar connections')

      const [microsoftResult, googleResult] = await Promise.all([
        this.microsoftService.testConnection(),
        this.googleService.testConnection()
      ])

      const results = {
        microsoft: microsoftResult.success,
        google: googleResult.success
      }

      this.logger.success('Connection tests completed', results)
      return results

    } catch (error) {
      this.logger.error('Failed to test connections', error as Error)
      throw error
    }
  }

  /**
   * Get Microsoft accounts with calendar access
   */
  private async getMicrosoftAccounts(): Promise<CalendarAccount[]> {
    try {
      const profiles = await this.databaseService.getActiveUserProfiles()
      if (!profiles.success || !profiles.data) {
        return []
      }

      const microsoftProfiles = profiles.data.filter(p => p.provider === 'microsoft' && p.isActive)
      const accounts: CalendarAccount[] = []

      for (const profile of microsoftProfiles) {
        const connectionTest = await this.microsoftService.testConnection()
        
        const account: CalendarAccount = {
          id: `microsoft_${profile.providerId}`,
          provider: 'microsoft',
          email: profile.email,
          name: profile.name || profile.email,
          pictureUrl: profile.pictureUrl,
          isConnected: connectionTest.success,
          hasCalendarAccess: connectionTest.success,
          lastSync: new Date() // Would be updated based on last API call
        }

        // Get calendar count if connected
        if (connectionTest.success) {
          try {
            const calendars = await this.microsoftService.getCalendars()
            account.calendarCount = calendars.length
            account.defaultCalendarId = 'primary' // Microsoft uses 'calendar' for primary
          } catch (error) {
            this.logger.warn('Failed to get Microsoft calendar count', error as Error)
          }
        }

        accounts.push(account)
      }

      return accounts

    } catch (error) {
      this.logger.error('Failed to get Microsoft accounts', error as Error)
      return []
    }
  }

  /**
   * Get Google accounts with calendar access
   */
  private async getGoogleAccounts(): Promise<CalendarAccount[]> {
    try {
      const profiles = await this.databaseService.getActiveUserProfiles()
      if (!profiles.success || !profiles.data) {
        return []
      }

      const googleProfiles = profiles.data.filter(p => p.provider === 'google' && p.isActive)
      const accounts: CalendarAccount[] = []

      for (const profile of googleProfiles) {
        const connectionTest = await this.googleService.testConnection()
        
        const account: CalendarAccount = {
          id: `google_${profile.providerId}`,
          provider: 'google',
          email: profile.email,
          name: profile.name || profile.email,
          pictureUrl: profile.pictureUrl,
          isConnected: connectionTest.success,
          hasCalendarAccess: connectionTest.success,
          lastSync: new Date()
        }

        // Get calendar count if connected
        if (connectionTest.success) {
          try {
            const calendars = await this.googleService.getCalendars()
            account.calendarCount = calendars.length
            account.defaultCalendarId = 'primary'
          } catch (error) {
            this.logger.warn('Failed to get Google calendar count', error as Error)
          }
        }

        accounts.push(account)
      }

      return accounts

    } catch (error) {
      this.logger.error('Failed to get Google accounts', error as Error)
      return []
    }
  }

  /**
   * Normalize Microsoft event to unified format
   */
  private normalizeMicrosoftEvent(event: MicrosoftCalendarEvent, accountId: string): UnifiedCalendarEvent {
    const isAllDay = !event.start.dateTime.includes('T')
    
    // Debug logging for timezone investigation
    console.log('=== MICROSOFT EVENT NORMALIZATION DEBUG ===')
    console.log('Event title:', event.subject)
    console.log('Raw start:', event.start)
    console.log('Raw end:', event.end)
    console.log('Is all day:', isAllDay)
    
    // Microsoft Graph API specific timezone handling
    const startTime = this.parseMicrosoftEventDate(event.start, isAllDay)
    const endTime = this.parseMicrosoftEventDate(event.end, isAllDay)
    
    console.log('Parsed start time:', startTime.toISOString(), '(local:', startTime.toString(), ')')
    console.log('Parsed end time:', endTime.toISOString(), '(local:', endTime.toString(), ')')
    console.log('============================================')

    return {
      id: event.id,
      provider: 'microsoft',
      accountId,
      title: event.subject || 'Untitled Event',
      description: event.body?.content,
      startTime,
      endTime,
      isAllDay: !event.start.dateTime.includes('T'),
      location: event.location?.displayName,
      attendees: event.attendees?.map(att => ({
        email: att.emailAddress.address,
        name: att.emailAddress.name,
        status: att.status.response as any
      })),
      reminderMinutes: event.reminderMinutesBeforeStart,
      hasOnlineMeeting: !!event.isOnlineMeeting,
      meetingUrl: event.onlineMeeting?.joinUrl,
      meetingProvider: event.isOnlineMeeting ? 'teams' : undefined,
      originalEvent: event,
      providerSpecific: {
        microsoft: {
          showAs: event.showAs,
          sensitivity: event.sensitivity,
          isTeamsMeeting: !!event.isOnlineMeeting
        }
      }
    }
  }

  /**
   * Convert timezone-aware date string to local Date object (for Google Calendar)
   */
  private parseEventDate(dateTimeString: string, isAllDay: boolean = false): Date {
    console.log('  parseEventDate input:', dateTimeString, 'isAllDay:', isAllDay)
    
    if (isAllDay) {
      // For all-day events, create date at start of day in local timezone
      const result = new Date(dateTimeString + 'T00:00:00')
      console.log('  parseEventDate all-day result:', result.toString())
      return result
    }
    
    // For timed events, since we're now requesting events in the user's timezone,
    // the JavaScript Date constructor should handle the conversion correctly
    const result = new Date(dateTimeString)
    console.log('  parseEventDate timed result:', result.toString(), 'UTC:', result.toISOString())
    return result
  }

  /**
   * Parse Microsoft Graph API date with timezone information
   */
  private parseMicrosoftEventDate(dateTimeObj: { dateTime: string, timeZone: string }, isAllDay: boolean = false): Date {
    console.log('  parseMicrosoftEventDate input:', dateTimeObj, 'isAllDay:', isAllDay)
    
    if (isAllDay) {
      // For all-day events, create date at start of day in local timezone
      const result = new Date(dateTimeObj.dateTime + 'T00:00:00')
      console.log('  parseMicrosoftEventDate all-day result:', result.toString())
      return result
    }
    
    const { dateTime, timeZone } = dateTimeObj
    
    // Clean up Microsoft's millisecond format (.0000000) to standard format
    const cleanDateTime = dateTime.replace(/\.0+/, '')
    
    // Microsoft Graph API timezone handling strategy:
    // Despite setting Prefer header, Microsoft often returns UTC times without proper timezone markers
    
    // Case 1: DateTime has explicit timezone info (Z, +, -)
    if (cleanDateTime.endsWith('Z') || cleanDateTime.includes('+') || cleanDateTime.includes('-')) {
      const result = new Date(cleanDateTime)
      console.log('  parseMicrosoftEventDate with explicit timezone:', result.toString())
      return result
    }
    
    // Case 2: Microsoft custom timezone or UTC
    if (timeZone.includes('tzone://Microsoft/Custom') || timeZone === 'UTC') {
      // Microsoft is returning UTC time but not marking it properly
      const result = new Date(cleanDateTime + 'Z')
      console.log('  parseMicrosoftEventDate Microsoft/Custom or UTC:', result.toString())
      return result
    }
    
    // Case 3: Standard timezone names
    // Microsoft Graph API is supposed to convert to our preferred timezone, but often doesn't
    // We need to check if the time seems to be in the wrong timezone
    
    const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    const userOffsetMinutes = new Date().getTimezoneOffset()
    
    // Try parsing as local time first
    let result = new Date(cleanDateTime)
    
    // Heuristic: If the event was created recently and the times seem off by exact hour offsets,
    // it's likely Microsoft returned UTC despite our preference
    const now = new Date()
    const timeDiffHours = Math.abs(result.getTime() - now.getTime()) / (1000 * 60 * 60)
    
    // If the time difference suggests UTC offset issue (within reasonable event time range)
    if (timeDiffHours < 24 * 7) { // Within a week
      // Check if adjusting for UTC makes more sense
      const utcResult = new Date(cleanDateTime + 'Z')
      const utcLocalDiff = Math.abs(utcResult.getTime() - result.getTime()) / (1000 * 60 * 60)
      
      // If there's exactly a timezone offset difference, use UTC interpretation
      if (utcLocalDiff === Math.abs(userOffsetMinutes / 60)) {
        result = utcResult
        console.log('  parseMicrosoftEventDate TIMEZONE CORRECTION - treating as UTC:', result.toString())
      }
    }
    
    console.log('  parseMicrosoftEventDate final result:', result.toString())
    console.log('  User timezone:', userTimeZone, 'offset minutes:', userOffsetMinutes)
    
    return result
  }

  /**
   * Normalize Google event to unified format
   */
  private normalizeGoogleEvent(event: GoogleCalendarEvent, accountId: string): UnifiedCalendarEvent {
    const isAllDay = !!event.start.date
    const startTime = this.parseEventDate(event.start.dateTime || event.start.date!, isAllDay)
    const endTime = this.parseEventDate(event.end.dateTime || event.end.date!, isAllDay)
    const hasConference = !!event.conferenceData?.entryPoints?.length

    return {
      id: event.id,
      provider: 'google',
      accountId,
      title: event.summary || 'Untitled Event',
      description: event.description,
      startTime,
      endTime,
      isAllDay: !!event.start.date,
      location: event.location,
      attendees: event.attendees?.map(att => ({
        email: att.email,
        name: att.displayName,
        status: att.responseStatus as any
      })),
      reminderMinutes: event.reminders?.overrides?.[0]?.minutes,
      hasOnlineMeeting: hasConference,
      meetingUrl: event.conferenceData?.entryPoints?.find(ep => ep.entryPointType === 'video')?.uri,
      meetingProvider: hasConference ? 'meet' : undefined,
      originalEvent: event,
      providerSpecific: {
        google: {
          visibility: event.visibility,
          status: event.status,
          conferenceData: event.conferenceData
        }
      }
    }
  }

  /**
   * Clear all cache
   */
  clearCache(): void {
    this.cacheService.clear()
  }

  /**
   * Clear Microsoft calendar cache specifically (for timezone debugging)
   */
  clearMicrosoftCache(): void {
    // Force clearing cache for Microsoft calendar events
    const cacheStats = this.cacheService.getStats()
    this.logger.info('Clearing Microsoft calendar cache for timezone debugging', cacheStats)
    this.cacheService.clear()
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.cacheService.getStats()
  }
}