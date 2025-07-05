// Calendar Type Definitions - Types for calendar functionality

declare global {
  interface CalendarAccount {
    id: string
    provider: 'microsoft' | 'google'
    name: string
    email: string
    pictureUrl?: string
    isConnected: boolean
    hasCalendarAccess: boolean
    lastSync?: Date
    settings?: {
      defaultCalendarId?: string
      timeZone?: string
      defaultReminders?: number[]
    }
  }

  interface UnifiedCalendarEvent {
    id: string
    provider: 'microsoft' | 'google'
    accountId: string
    title: string
    description?: string
    startTime: Date
    endTime: Date
    isAllDay: boolean
    location?: string
    hasOnlineMeeting: boolean
    meetingUrl?: string
    meetingProvider?: 'teams' | 'meet' | 'other'
    attendees?: EventAttendee[]
    reminders?: EventReminder[]
    recurrence?: EventRecurrence
    status?: 'confirmed' | 'tentative' | 'cancelled'
    visibility?: 'public' | 'private' | 'confidential'
    originalEvent: any
    lastModified?: Date
    created?: Date
  }

  interface EventAttendee {
    email: string
    name?: string
    status?: 'accepted' | 'declined' | 'tentative' | 'needsAction' | 'none'
    isOptional?: boolean
    isOrganizer?: boolean
  }

  interface EventReminder {
    method: 'email' | 'popup' | 'sms'
    minutesBefore: number
  }

  interface EventRecurrence {
    type: 'daily' | 'weekly' | 'monthly' | 'yearly'
    interval: number
    endDate?: Date
    count?: number
    daysOfWeek?: number[]
    dayOfMonth?: number
    monthOfYear?: number
  }

  interface CreateEventData {
    accountId: string
    title: string
    description?: string
    location?: string
    startTime: Date
    endTime: Date
    isAllDay: boolean
    attendees?: string[]
    reminderMinutes?: number
    isTeamsMeeting?: boolean
    isGoogleMeet?: boolean
  }

  interface UpdateEventData extends Partial<CreateEventData> {}

  interface CalendarEventFilter {
    accountIds?: string[]
    providers?: ('microsoft' | 'google')[]
    startDate?: Date
    endDate?: Date
    searchQuery?: string
    hasOnlineMeeting?: boolean
    status?: ('confirmed' | 'tentative' | 'cancelled')[]
  }

  interface CalendarViewState {
    currentView: 'month' | 'week' | 'day'
    currentDate: Date
    selectedEvent?: UnifiedCalendarEvent
    filters?: CalendarEventFilter
  }
}

export {}