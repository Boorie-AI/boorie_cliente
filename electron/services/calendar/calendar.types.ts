// Calendar Type Definitions - Shared types for calendar services

export interface CalendarAccount {
  id: string
  provider: 'microsoft' | 'google'
  email: string
  name: string
  pictureUrl?: string
  isConnected: boolean
  hasCalendarAccess: boolean
  lastSync?: Date
  calendarCount?: number
  defaultCalendarId?: string
}

export interface UnifiedCalendarEvent {
  id: string
  provider: 'microsoft' | 'google'
  accountId: string
  title: string
  description?: string
  startTime: Date
  endTime: Date
  isAllDay: boolean
  location?: string
  attendees?: EventAttendee[]
  reminderMinutes?: number
  recurrence?: RecurrencePattern
  
  // Meeting integration
  hasOnlineMeeting: boolean
  meetingUrl?: string
  meetingProvider?: 'teams' | 'meet' | 'other'
  
  // Provider-specific data
  originalEvent: any // Raw event from provider
  providerSpecific?: {
    microsoft?: {
      showAs: string
      sensitivity: string
      isTeamsMeeting: boolean
    }
    google?: {
      visibility: string
      status: string
      conferenceData?: any
    }
  }
}

export interface EventAttendee {
  email: string
  name?: string
  status: 'needsAction' | 'declined' | 'tentative' | 'accepted' | 'none'
}

export interface RecurrencePattern {
  type: 'daily' | 'weekly' | 'monthly' | 'yearly'
  interval: number
  endDate?: Date
  count?: number
  daysOfWeek?: number[]
}

export interface CreateEventData {
  title: string
  description?: string
  startTime: Date
  endTime: Date
  isAllDay: boolean
  location?: string
  attendees?: string[]
  reminderMinutes?: number
  isTeamsMeeting?: boolean // For Microsoft events
  isGoogleMeet?: boolean // For Google events
}

export interface UpdateEventData extends Partial<CreateEventData> {
  // All fields optional for updates
}

// Microsoft Graph Calendar Types
export interface MicrosoftCalendarEvent {
  id: string
  subject: string
  body: {
    contentType: 'html' | 'text'
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
    address?: any
  }
  attendees?: Array<{
    emailAddress: {
      address: string
      name: string
    }
    status: {
      response: 'none' | 'accepted' | 'declined' | 'tentative'
      time: string
    }
  }>
  isOnlineMeeting?: boolean
  onlineMeetingProvider?: 'teamsForBusiness'
  onlineMeeting?: {
    joinUrl: string
    conferenceId: string
  }
  recurrence?: any
  reminderMinutesBeforeStart?: number
  showAs: 'free' | 'tentative' | 'busy' | 'oof' | 'workingElsewhere' | 'unknown'
  sensitivity: 'normal' | 'personal' | 'private' | 'confidential'
}

// Google Calendar Types
export interface GoogleCalendarEvent {
  id: string
  summary: string
  description?: string
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
  location?: string
  attendees?: Array<{
    email: string
    displayName?: string
    responseStatus: 'needsAction' | 'declined' | 'tentative' | 'accepted'
  }>
  conferenceData?: {
    createRequest?: {
      requestId: string
      conferenceSolutionKey: {
        type: 'hangoutsMeet'
      }
    }
    entryPoints?: Array<{
      entryPointType: 'video' | 'phone'
      uri: string
      label?: string
    }>
  }
  recurrence?: string[]
  reminders?: {
    useDefault: boolean
    overrides?: Array<{
      method: 'email' | 'popup'
      minutes: number
    }>
  }
  visibility: 'default' | 'public' | 'private' | 'confidential'
  status: 'confirmed' | 'tentative' | 'cancelled'
}

// Service Response Types
export interface CalendarServiceResponse<T = any> {
  success: boolean
  data?: T
  error?: string
}

// Cache Types
export interface CacheItem<T> {
  data: T
  timestamp: number
  expiresAt: number
}

export interface CacheOptions {
  ttl: number // Time to live in milliseconds
}

// Teams Meeting Types
export interface TeamsMeetingInfo {
  joinUrl?: string
  conferenceId?: string
  tollNumber?: string
  tollFreeNumber?: string
  dialinUrl?: string
  quickDial?: string
}

// Error Types
export interface CalendarError extends Error {
  type: 'AUTH_EXPIRED' | 'RATE_LIMITED' | 'NETWORK_ERROR' | 'PERMISSION_DENIED' | 'INVALID_EVENT_DATA' | 'UNKNOWN'
  provider?: 'microsoft' | 'google'
  retryAfter?: number
  details?: any
}

export interface ErrorContext {
  provider: 'microsoft' | 'google'
  operation: string
  accountId?: string
  eventId?: string
}