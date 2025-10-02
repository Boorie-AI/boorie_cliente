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

  hydraulic: {
    // Context processing
    classifyQuery: (query: string, context?: any) => Promise<{ success: boolean; data?: any; error?: string }>
    extractParameters: (query: string) => Promise<{ success: boolean; data?: any; error?: string }>
    identifyRegulations: (context: any) => Promise<{ success: boolean; data?: string[]; error?: string }>
    
    // Calculations
    calculate: (formulaId: string, inputs: any) => Promise<{ success: boolean; data?: any; error?: string }>
    getFormulas: () => Promise<{ success: boolean; data?: any[]; error?: string }>
    getFormulasByCategory: (category: string) => Promise<{ success: boolean; data?: any[]; error?: string }>
    
    // Knowledge search
    searchKnowledge: (query: string, options?: any) => Promise<{ success: boolean; data?: any[]; error?: string }>
    getRegulations: (region: string) => Promise<{ success: boolean; data?: any[]; error?: string }>
    
    // Project management
    createProject: (projectData: any) => Promise<{ success: boolean; data?: any; error?: string }>
    getProject: (projectId: string) => Promise<{ success: boolean; data?: any; error?: string }>
    listProjects: () => Promise<{ success: boolean; data?: any[]; error?: string }>
    updateProject: (projectId: string, updates: any) => Promise<{ success: boolean; data?: any; error?: string }>
    saveCalculation: (projectId: string, calculation: any) => Promise<{ success: boolean; data?: any; error?: string }>
    
    // Enhanced chat
    enhancedChat: (message: string, context: any) => Promise<{ success: boolean; data?: any; error?: string }>
  }
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
    electron: boolean
  }
}