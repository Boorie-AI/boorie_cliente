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

  // Authentication
  auth: {
    microsoftLogin: () => ipcRenderer.invoke('microsoft-login'),
    googleLogin: () => ipcRenderer.invoke('google-login'),
    logout: (provider: string) => ipcRenderer.invoke('logout', provider),
    getTokens: (provider: string) => ipcRenderer.invoke('get-tokens', provider),
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
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
contextBridge.exposeInMainWorld('electron', true)

export type ElectronAPI = typeof electronAPI