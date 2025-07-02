export interface ElectronAPI {
  getAppVersion: () => Promise<string>
  getPlatform: () => Promise<string>
  
  onNewChat: (callback: () => void) => () => void
  onOpenSettings: (callback: () => void) => () => void

  // Window controls
  minimizeWindow: () => Promise<void>
  maximizeWindow: () => Promise<void>
  closeWindow: () => Promise<void>
  isMaximized: () => Promise<boolean>

  database: {
    // Settings
    getSetting: (key: string) => Promise<string | null>
    setSetting: (key: string, value: string, category?: string) => Promise<any>
    getSettings: (category?: string) => Promise<any[]>
    
    // Conversations
    getConversations: () => Promise<any[]>
    getConversation: (id: string) => Promise<any>
    saveConversation: (data: any) => Promise<any>
    updateConversation: (id: string, updates: any) => Promise<any>
    deleteConversation: (id: string) => Promise<boolean>
    addMessageToConversation: (conversationId: string, message: any) => Promise<any>
    updateConversationTitle: (id: string, title: string) => Promise<any>
    updateConversationModel: (id: string, model: string, provider: string) => Promise<any>
    
    // Messages
    createMessage: (data: { conversationId: string, role: string, content: string, metadata?: any }) => Promise<any>
    
    // AI Providers
    getAIProviders: () => Promise<any[]>
    saveAIProvider: (data: any) => Promise<any>
    updateAIProvider: (id: string, updates: any) => Promise<any>
    
    // AI Models
    getAIModels: (providerId?: string) => Promise<any[]>
    saveAIModel: (data: any) => Promise<any>
    deleteAIModels: (providerId: string) => Promise<boolean>
    testAIProvider?: (id: string) => Promise<{ success: boolean; message: string }>
    refreshAIModels?: (providerId: string) => Promise<any[]>
    
    // Generic database operations
    query: (sql: string, params?: any[]) => Promise<any[]>
    execute: (sql: string, params?: any[]) => Promise<number>
  }

  files: {
    selectFile: (options?: Electron.OpenDialogOptions) => Promise<string[] | undefined>
    readFile: (filePath: string) => Promise<string>
    writeFile: (filePath: string, data: string) => Promise<void>
  }

  ai: {
    ollamaQuery: (model: string, prompt: string, options?: any) => Promise<any>
    openaiQuery: (messages: any[], options?: any) => Promise<any>
  }

  auth: {
    // OAuth login flows
    microsoftLogin: () => Promise<any>
    googleLogin: () => Promise<any>
    logout: (provider: string) => Promise<any>
    
    // Token management
    getTokens: (provider: string) => Promise<any>
    refreshToken: (provider: string) => Promise<any>
    validateToken: (provider: string) => Promise<any>
    
    // User profiles
    getUserProfile: (provider: string) => Promise<any>
    getActiveProfiles: () => Promise<any>
    
    // Connection status
    getConnectionStatus: () => Promise<any>
    testConnection: (provider: string) => Promise<any>
  }

  notifications: {
    show: (title: string, body: string, options?: any) => Promise<void>
  }

  security: {
    encryptData: (data: string) => Promise<string>
    decryptData: (encryptedData: string) => Promise<string>
    storeSecurely: (key: string, value: string) => Promise<void>
    retrieveSecurely: (key: string) => Promise<string | null>
  }

  calendar: {
    // Account management
    getConnectedAccounts: () => Promise<IpcResult<CalendarAccount[]>>
    getAccountInfo: (accountId: string) => Promise<IpcResult<CalendarAccount>>
    
    // Event operations
    getEvents: (accountId: string, startDate: string, endDate: string) => Promise<IpcResult<UnifiedCalendarEvent[]>>
    getAllEvents: (startDate: string, endDate: string) => Promise<IpcResult<UnifiedCalendarEvent[]>>
    getEvent: (accountId: string, eventId: string) => Promise<IpcResult<UnifiedCalendarEvent>>
    createEvent: (accountId: string, eventData: CreateEventData) => Promise<IpcResult<UnifiedCalendarEvent>>
    updateEvent: (accountId: string, eventId: string, eventData: UpdateEventData) => Promise<IpcResult<UnifiedCalendarEvent>>
    deleteEvent: (accountId: string, eventId: string) => Promise<IpcResult<void>>
    
    // Teams meeting specific
    createTeamsMeeting: (accountId: string, eventData: CreateEventData) => Promise<IpcResult<UnifiedCalendarEvent>>
    addTeamsToEvent: (accountId: string, eventId: string) => Promise<IpcResult<UnifiedCalendarEvent>>
    
    // Google Meet specific  
    addMeetToEvent: (accountId: string, eventId: string) => Promise<IpcResult<UnifiedCalendarEvent>>
    
    // Calendar management
    getCalendars: (accountId: string) => Promise<IpcResult<any[]>>
    testConnection: (accountId: string) => Promise<IpcResult<boolean>>
    testAllConnections: () => Promise<IpcResult<{ microsoft: boolean; google: boolean }>>
    
    // Cache management
    clearCache: () => Promise<IpcResult<void>>
    getCacheStats: () => Promise<IpcResult<any>>
  }
}

// Calendar Type Definitions for Frontend
interface IpcResult<T = any> {
  success: boolean
  data?: T
  error?: string
}

interface CalendarAccount {
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
  attendees?: EventAttendee[]
  reminderMinutes?: number
  recurrence?: RecurrencePattern
  
  // Meeting integration
  hasOnlineMeeting: boolean
  meetingUrl?: string
  meetingProvider?: 'teams' | 'meet' | 'other'
  
  // Provider-specific data
  originalEvent: any
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

interface EventAttendee {
  email: string
  name?: string
  status: 'needsAction' | 'declined' | 'tentative' | 'accepted' | 'none'
}

interface RecurrencePattern {
  type: 'daily' | 'weekly' | 'monthly' | 'yearly'
  interval: number
  endDate?: Date
  count?: number
  daysOfWeek?: number[]
}

interface CreateEventData {
  title: string
  description?: string
  startTime: Date
  endTime: Date
  isAllDay: boolean
  location?: string
  attendees?: string[]
  reminderMinutes?: number
  isTeamsMeeting?: boolean
  isGoogleMeet?: boolean
}

interface UpdateEventData extends Partial<CreateEventData> {}

declare global {
  interface Window {
    electronAPI: ElectronAPI
    electron: boolean
  }
}