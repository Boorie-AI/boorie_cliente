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

  todo: {
    // Initialization
    initializeData: () => Promise<TodoOperationResult<TodoInitializationData>>
    getAuthenticatedAccounts: () => Promise<TodoOperationResult<TodoProvider[]>>
    validateAccountTokens: () => Promise<TodoOperationResult<Record<string, boolean>>>
    
    // Google Tasks
    google: {
      getLists: () => Promise<TodoOperationResult<any[]>>
      createList: (request: ListCreateRequest) => Promise<TodoOperationResult<any>>
      updateList: (request: ListUpdateRequest) => Promise<TodoOperationResult<any>>
      deleteList: (listId: string) => Promise<TodoOperationResult<void>>
      getTasks: (listId: string) => Promise<TodoOperationResult<any[]>>
      createTask: (request: TaskCreateRequest) => Promise<TodoOperationResult<any>>
      updateTask: (request: TaskUpdateRequest) => Promise<TodoOperationResult<any>>
      deleteTask: (listId: string, taskId: string) => Promise<TodoOperationResult<void>>
      toggleStar: (listId: string, taskId: string, starred: boolean) => Promise<TodoOperationResult<any>>
    }
    
    // Microsoft To Do
    microsoft: {
      getLists: () => Promise<TodoOperationResult<any[]>>
      createList: (request: ListCreateRequest) => Promise<TodoOperationResult<any>>
      updateList: (request: ListUpdateRequest) => Promise<TodoOperationResult<any>>
      deleteList: (listId: string) => Promise<TodoOperationResult<void>>
      getTasks: (listId: string) => Promise<TodoOperationResult<any[]>>
      createTask: (request: TaskCreateRequest) => Promise<TodoOperationResult<any>>
      updateTask: (request: TaskUpdateRequest) => Promise<TodoOperationResult<any>>
      deleteTask: (listId: string, taskId: string) => Promise<TodoOperationResult<void>>
      toggleStar: (listId: string, taskId: string, starred: boolean) => Promise<TodoOperationResult<any>>
    }
    
    // Utility operations
    syncAll: () => Promise<TodoOperationResult<any>>
    getUnifiedData: () => Promise<TodoOperationResult<any>>
  }

  rag: {
    // Collection management
    createCollection: (params: CreateCollectionParams) => Promise<IpcResult<RAGCollection>>
    getCollections: () => Promise<IpcResult<RAGCollection[]>>
    getCollection: (id: string) => Promise<IpcResult<RAGCollection>>
    updateCollection: (id: string, params: UpdateCollectionParams) => Promise<IpcResult<RAGCollection>>
    deleteCollection: (id: string) => Promise<IpcResult<void>>
    
    // Document management
    selectDocuments: () => Promise<IpcResult<string[]>>
    uploadDocument: (collectionId: string, filePath: string) => Promise<IpcResult<RAGDocument>>
    getDocuments: (collectionId: string) => Promise<IpcResult<RAGDocument[]>>
    deleteDocument: (documentId: string) => Promise<IpcResult<void>>
    
    // Search and retrieval
    searchDocuments: (query: string, collectionIds: string[], limit?: number) => Promise<IpcResult<RAGDocumentChunk[]>>
    
    // Embedding models
    getEmbeddingModels: () => Promise<IpcResult<{ local: EmbeddingModel[]; api: EmbeddingModel[] }>>
    testEmbedding: (text: string, model: string, provider: string) => Promise<IpcResult<{ dimensions: number; sample: number[] }>>
  }

  // Event listeners for real-time updates
  onDocumentProgress?: (callback: (progress: DocumentProgress) => void) => () => void

  // Event listeners
  on: (channel: string, listener: (...args: any[]) => void) => void
  removeListener: (channel: string, listener: (...args: any[]) => void) => void
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

// Todo Type Definitions for Frontend
interface TodoOperationResult<T = any> {
  success: boolean
  data?: T
  error?: string
  provider?: 'google' | 'microsoft'
}

interface TodoProvider {
  id: string
  name: string
  type: 'google' | 'microsoft'
  email: string
  isConnected: boolean
  hasValidToken: boolean
}

interface TodoInitializationData {
  providers: TodoProvider[]
  lists: UnifiedTaskList[]
  tasks: UnifiedTask[]
  errors: ErrorState
}

interface UnifiedTaskList {
  id: string
  name: string
  provider: 'google' | 'microsoft'
  providerId: string
  isDefault?: boolean
  isSystem?: boolean
  isStarred?: boolean
  canEdit: boolean
  canDelete: boolean
  taskCount?: number
  originalList: any
}

interface UnifiedTask {
  id: string
  title: string
  description?: string
  status: 'pending' | 'completed'
  dueDate?: string
  completedDate?: string
  createdDate: string
  updatedDate: string
  provider: 'google' | 'microsoft'
  providerId: string
  listId: string
  listName: string
  isStarred?: boolean
  priority?: 'low' | 'normal' | 'high'
  hasAttachments?: boolean
  originalTask: any
}

interface TaskCreateRequest {
  title: string
  description?: string
  dueDate?: string
  priority?: 'low' | 'normal' | 'high'
  listId: string
  provider: 'google' | 'microsoft'
}

interface TaskUpdateRequest {
  id: string
  title?: string
  description?: string
  dueDate?: string
  priority?: 'low' | 'normal' | 'high'
  status?: 'pending' | 'completed'
  listId?: string
  provider: 'google' | 'microsoft'
  isStarred?: boolean
}

interface ListCreateRequest {
  name: string
  provider: 'google' | 'microsoft'
}

interface ListUpdateRequest {
  id: string
  name: string
  provider: 'google' | 'microsoft'
}

interface ErrorState {
  accounts?: string
  lists?: string
  tasks?: string
  operation?: string
  general?: string
}

// RAG Type Definitions for Frontend
interface RAGCollection {
  id: string
  name: string
  description?: string
  chunkSize: number
  overlap: number
  embeddingModel: string
  modelProvider: string
  createdAt: Date
  updatedAt: Date
  documents?: RAGDocument[]
}

interface RAGDocument {
  id: string
  filename: string
  filepath?: string
  fileType: 'pdf' | 'docx' | 'pptx' | 'xlsx'
  fileSize: number
  content: string
  metadata?: any
  collectionId: string
  createdAt: Date
  updatedAt: Date
  chunks?: RAGDocumentChunk[]
}

interface RAGDocumentChunk {
  id: string
  content: string
  embedding?: number[]
  metadata?: any
  startPos?: number
  endPos?: number
  documentId: string
  createdAt: Date
  similarity?: number
}

interface EmbeddingModel {
  id: string
  name: string
  provider: string
  type: 'embedding' | 'chat'
  isAvailable: boolean
}

interface CreateCollectionParams {
  name: string
  description?: string
  chunkSize?: number
  overlap?: number
  embeddingModel: string
  modelProvider: string
}

interface UpdateCollectionParams {
  name?: string
  description?: string
  chunkSize?: number
  overlap?: number
  embeddingModel?: string
  modelProvider?: string
}

interface DocumentProgress {
  documentId: string
  phase: 'chunking' | 'embedding' | 'completed'
  current: number
  total: number
  message?: string
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
    electron: boolean
  }
}