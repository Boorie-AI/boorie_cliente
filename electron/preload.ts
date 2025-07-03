import { contextBridge, ipcRenderer } from 'electron'

const electronAPI = {
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  
  // Menu events
  onNewChat: (callback: () => void) => {
    ipcRenderer.on('new-chat', callback)
    return () => ipcRenderer.removeListener('new-chat', callback)
  },
  
  onOpenSettings: (callback: () => void) => {
    ipcRenderer.on('open-settings', callback)
    return () => ipcRenderer.removeListener('open-settings', callback)
  },

  // Window controls
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  isMaximized: () => ipcRenderer.invoke('is-maximized'),

  // Database operations
  database: {
    // AI Providers
    getAIProviders: () => ipcRenderer.invoke('db-get-ai-providers'),
    saveAIProvider: (data: any) => ipcRenderer.invoke('db-save-ai-provider', data),
    updateAIProvider: (id: string, updates: any) => ipcRenderer.invoke('db-update-ai-provider', id, updates),
    
    // AI Models
    getAIModels: (providerId?: string) => ipcRenderer.invoke('db-get-ai-models', providerId),
    saveAIModel: (data: any) => ipcRenderer.invoke('db-save-ai-model', data),
    deleteAIModels: (providerId: string) => ipcRenderer.invoke('db-delete-ai-models', providerId),
    testAIProvider: (id: string) => ipcRenderer.invoke('db-test-ai-provider', id),
    refreshAIModels: (providerId: string) => ipcRenderer.invoke('db-refresh-ai-models', providerId),
    
    // Conversations
    getConversations: () => ipcRenderer.invoke('db-get-conversations'),
    getConversation: (id: string) => ipcRenderer.invoke('db-get-conversation', id),
    saveConversation: (data: any) => ipcRenderer.invoke('db-save-conversation', data),
    updateConversation: (id: string, updates: any) => ipcRenderer.invoke('db-update-conversation', id, updates),
    deleteConversation: (id: string) => ipcRenderer.invoke('db-delete-conversation', id),
    addMessageToConversation: (conversationId: string, message: any) => ipcRenderer.invoke('db-add-message-to-conversation', conversationId, message),
    updateConversationTitle: (id: string, title: string) => ipcRenderer.invoke('db-update-conversation-title', id, title),
    updateConversationModel: (id: string, model: string, provider: string) => ipcRenderer.invoke('db-update-conversation-model', id, model, provider),
    
    // Settings
    getSetting: (key: string) => ipcRenderer.invoke('db-get-setting', key),
    setSetting: (key: string, value: string, category?: string) => ipcRenderer.invoke('db-set-setting', key, value, category),
    getSettings: (category?: string) => ipcRenderer.invoke('db-get-settings', category),
    
    // Generic database operations
    query: (sql: string, params?: any[]) => ipcRenderer.invoke('db-query', sql, params),
    execute: (sql: string, params?: any[]) => ipcRenderer.invoke('db-execute', sql, params),
  },

  // File operations
  files: {
    selectFile: (options?: Electron.OpenDialogOptions) => ipcRenderer.invoke('select-file', options),
    readFile: (filePath: string) => ipcRenderer.invoke('read-file', filePath),
    writeFile: (filePath: string, data: string) => ipcRenderer.invoke('write-file', filePath, data),
  },

  // AI services
  ai: {
    ollamaQuery: (model: string, prompt: string, options?: any) => 
      ipcRenderer.invoke('ollama-query', model, prompt, options),
    openaiQuery: (messages: any[], options?: any) => 
      ipcRenderer.invoke('openai-query', messages, options),
  },

  // Chat services
  chat: {
    sendMessage: (params: any) => ipcRenderer.invoke('chat:send-message', params),
  },

  // Authentication
  auth: {
    // OAuth login flows
    microsoftLogin: () => ipcRenderer.invoke('auth-microsoft-login'),
    googleLogin: () => ipcRenderer.invoke('auth-google-login'),
    logout: (provider: string) => ipcRenderer.invoke('auth-logout', provider),
    
    // Token management
    getTokens: (provider: string) => ipcRenderer.invoke('auth-get-tokens', provider),
    refreshToken: (provider: string) => ipcRenderer.invoke('auth-refresh-token', provider),
    validateToken: (provider: string) => ipcRenderer.invoke('auth-validate-token', provider),
    
    // User profiles
    getUserProfile: (provider: string) => ipcRenderer.invoke('auth-get-user-profile', provider),
    getActiveProfiles: () => ipcRenderer.invoke('auth-get-active-profiles'),
    
    // Connection status
    getConnectionStatus: () => ipcRenderer.invoke('auth-get-connection-status'),
    testConnection: (provider: string) => ipcRenderer.invoke('auth-test-connection', provider),
  },

  // Notifications
  notifications: {
    show: (title: string, body: string, options?: any) => 
      ipcRenderer.invoke('show-notification', title, body, options),
  },

  // Security
  security: {
    encryptData: (data: string) => ipcRenderer.invoke('encrypt-data', data),
    decryptData: (encryptedData: string) => ipcRenderer.invoke('decrypt-data', encryptedData),
    storeSecurely: (key: string, value: string) => ipcRenderer.invoke('store-securely', key, value),
    retrieveSecurely: (key: string) => ipcRenderer.invoke('retrieve-securely', key),
  },

  // Calendar
  calendar: {
    // Account management
    getConnectedAccounts: () => ipcRenderer.invoke('calendar-get-connected-accounts'),
    getAccountInfo: (accountId: string) => ipcRenderer.invoke('calendar-get-account-info', accountId),
    
    // Event operations
    getEvents: (accountId: string, startDate: string, endDate: string) => 
      ipcRenderer.invoke('calendar-get-events', accountId, startDate, endDate),
    getAllEvents: (startDate: string, endDate: string) => 
      ipcRenderer.invoke('calendar-get-all-events', startDate, endDate),
    getEvent: (accountId: string, eventId: string) => 
      ipcRenderer.invoke('calendar-get-event', accountId, eventId),
    createEvent: (accountId: string, eventData: any) => 
      ipcRenderer.invoke('calendar-create-event', accountId, eventData),
    updateEvent: (accountId: string, eventId: string, eventData: any) => 
      ipcRenderer.invoke('calendar-update-event', accountId, eventId, eventData),
    deleteEvent: (accountId: string, eventId: string) => 
      ipcRenderer.invoke('calendar-delete-event', accountId, eventId),
    
    // Teams meeting specific
    createTeamsMeeting: (accountId: string, eventData: any) => 
      ipcRenderer.invoke('calendar-create-teams-meeting', accountId, eventData),
    addTeamsToEvent: (accountId: string, eventId: string) => 
      ipcRenderer.invoke('calendar-add-teams-to-event', accountId, eventId),
    
    // Google Meet specific
    addMeetToEvent: (accountId: string, eventId: string) => 
      ipcRenderer.invoke('calendar-add-meet-to-event', accountId, eventId),
    
    // Calendar management
    getCalendars: (accountId: string) => ipcRenderer.invoke('calendar-get-calendars', accountId),
    testConnection: (accountId: string) => ipcRenderer.invoke('calendar-test-connection', accountId),
    testAllConnections: () => ipcRenderer.invoke('calendar-test-all-connections'),
    
    // Cache management
    clearCache: () => ipcRenderer.invoke('calendar-clear-cache'),
    getCacheStats: () => ipcRenderer.invoke('calendar-get-cache-stats'),
  },

  // Todo
  todo: {
    // Initialization
    initializeData: () => ipcRenderer.invoke('todo:initialize-data'),
    getAuthenticatedAccounts: () => ipcRenderer.invoke('todo:get-authenticated-accounts'),
    validateAccountTokens: () => ipcRenderer.invoke('todo:validate-account-tokens'),
    
    // Google Tasks
    google: {
      getLists: () => ipcRenderer.invoke('todo:google:get-lists'),
      createList: (request: any) => ipcRenderer.invoke('todo:google:create-list', request),
      updateList: (request: any) => ipcRenderer.invoke('todo:google:update-list', request),
      deleteList: (listId: string) => ipcRenderer.invoke('todo:google:delete-list', listId),
      getTasks: (listId: string) => ipcRenderer.invoke('todo:google:get-tasks', listId),
      createTask: (request: any) => ipcRenderer.invoke('todo:google:create-task', request),
      updateTask: (request: any) => ipcRenderer.invoke('todo:google:update-task', request),
      deleteTask: (listId: string, taskId: string) => ipcRenderer.invoke('todo:google:delete-task', listId, taskId),
      toggleStar: (listId: string, taskId: string, starred: boolean) => ipcRenderer.invoke('todo:google:toggle-star', listId, taskId, starred),
    },
    
    // Microsoft To Do
    microsoft: {
      getLists: () => ipcRenderer.invoke('todo:microsoft:get-lists'),
      createList: (request: any) => ipcRenderer.invoke('todo:microsoft:create-list', request),
      updateList: (request: any) => ipcRenderer.invoke('todo:microsoft:update-list', request),
      deleteList: (listId: string) => ipcRenderer.invoke('todo:microsoft:delete-list', listId),
      getTasks: (listId: string) => ipcRenderer.invoke('todo:microsoft:get-tasks', listId),
      createTask: (request: any) => ipcRenderer.invoke('todo:microsoft:create-task', request),
      updateTask: (request: any) => ipcRenderer.invoke('todo:microsoft:update-task', request),
      deleteTask: (listId: string, taskId: string) => ipcRenderer.invoke('todo:microsoft:delete-task', listId, taskId),
      toggleStar: (listId: string, taskId: string, starred: boolean) => ipcRenderer.invoke('todo:microsoft:toggle-star', listId, taskId, starred),
    },
    
    // Utility operations
    syncAll: () => ipcRenderer.invoke('todo:sync-all'),
    getUnifiedData: () => ipcRenderer.invoke('todo:get-unified-data'),
  },

  // Event listeners
  on: (channel: string, listener: (...args: any[]) => void) => {
    ipcRenderer.on(channel, listener);
  },
  
  removeListener: (channel: string, listener: (...args: any[]) => void) => {
    ipcRenderer.removeListener(channel, listener);
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
contextBridge.exposeInMainWorld('electron', true)

export type ElectronAPI = typeof electronAPI