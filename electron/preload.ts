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

  onDisableSatelliteMode: (callback: (data: { reason: string, message: string }) => void) => {
    const wrappedCallback = (_event: any, data: { reason: string, message: string }) => callback(data)
    ipcRenderer.on('disable-satellite-mode', wrappedCallback)
    return () => ipcRenderer.removeListener('disable-satellite-mode', wrappedCallback)
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

  // Dialog operations
  dialog: {
    showOpenDialog: (options?: Electron.OpenDialogOptions) => ipcRenderer.invoke('show-open-dialog', options),
    showSaveDialog: (options?: Electron.SaveDialogOptions) => ipcRenderer.invoke('show-save-dialog', options),
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

  // Hydraulic engineering features
  hydraulic: {
    // Context processing
    classifyQuery: (query: string, context?: any) => ipcRenderer.invoke('hydraulic:classify-query', query, context),
    extractParameters: (query: string) => ipcRenderer.invoke('hydraulic:extract-parameters', query),
    identifyRegulations: (context: any) => ipcRenderer.invoke('hydraulic:identify-regulations', context),

    // Calculations
    calculate: (formulaId: string, inputs: any) => ipcRenderer.invoke('hydraulic:calculate', formulaId, inputs),
    getFormulas: () => ipcRenderer.invoke('hydraulic:get-formulas'),
    getFormulasByCategory: (category: string) => ipcRenderer.invoke('hydraulic:get-formulas-by-category', category),

    // Knowledge search
    searchKnowledge: (query: string, options?: any) => ipcRenderer.invoke('hydraulic:search-knowledge', query, options),
    getRegulations: (region: string) => ipcRenderer.invoke('hydraulic:get-regulations', region),

    // Project management
    createProject: (projectData: any) => ipcRenderer.invoke('hydraulic:create-project', projectData),
    getProject: (projectId: string) => ipcRenderer.invoke('hydraulic:get-project', projectId),
    listProjects: () => ipcRenderer.invoke('hydraulic:list-projects'),
    updateProject: (projectId: string, updates: any) => ipcRenderer.invoke('hydraulic:update-project', projectId, updates),
    deleteProject: (projectId: string) => ipcRenderer.invoke('hydraulic:delete-project', projectId),
    saveCalculation: (projectId: string, calculation: any) => ipcRenderer.invoke('hydraulic:save-calculation', projectId, calculation),

    // Enhanced chat
    enhancedChat: (message: string, context: any) => ipcRenderer.invoke('hydraulic:enhanced-chat', message, context),
  },

  // Network Repository operations
  networkRepository: {
    // Save and update networks
    save: (data: {
      projectId: string
      networkData: any
      fileContent: string
      filename: string
      description?: string
    }) => ipcRenderer.invoke('network-repo:save', data),

    update: (data: {
      networkId: string
      networkData: any
      fileContent: string
      filename: string
      description?: string
    }) => ipcRenderer.invoke('network-repo:update', data),

    // Load and get networks
    load: (networkId: string) => ipcRenderer.invoke('network-repo:load', networkId),
    get: (networkId: string) => ipcRenderer.invoke('network-repo:get', networkId),
    getProjectNetworks: (projectId: string) => ipcRenderer.invoke('network-repo:get-project-networks', projectId),

    // Delete and search
    delete: (networkId: string) => ipcRenderer.invoke('network-repo:delete', networkId),
    search: (data: { query: string; projectId?: string }) => ipcRenderer.invoke('network-repo:search', data),

    // Simulation results
    saveSimulation: (data: { networkId: string; results: any }) => ipcRenderer.invoke('network-repo:save-simulation', data),

    // Statistics
    getStats: (projectId: string) => ipcRenderer.invoke('network-repo:stats', projectId),
  },

  // WNTR operations
  wntr: {
    // File operations
    loadINPFile: () => ipcRenderer.invoke('wntr:load-inp-file'),
    loadINPFromPath: (filePath: string) => ipcRenderer.invoke('wntr:load-inp-from-path', filePath),
    saveINPFile: (content: string, fileName?: string) => ipcRenderer.invoke('wntr:save-inp-file', content, fileName),

    // Simulation
    runSimulation: (options?: { simulationType?: 'single' | 'extended' }) =>
      ipcRenderer.invoke('wntr:run-simulation', options),
    runHydraulicSimulation: (config: any) => ipcRenderer.invoke('wntr:run-hydraulic-simulation', config),
    runWaterQualitySimulation: (config: any) => ipcRenderer.invoke('wntr:run-water-quality-simulation', config),
    runScenarioSimulation: (config: any) => ipcRenderer.invoke('wntr:run-scenario-simulation', config),

    // Analysis
    analyzeNetwork: () => ipcRenderer.invoke('wntr:analyze-network'),
    analyzeNetworkTopology: (config: any) => ipcRenderer.invoke('wntr:analyze-network-topology', config),
    analyzeComponentCriticality: (config: any) => ipcRenderer.invoke('wntr:analyze-component-criticality', config),
    calculateResilienceMetrics: (config: any) => ipcRenderer.invoke('wntr:calculate-resilience-metrics', config),

    // Report generation
    generateSimulationReport: (config: any) => ipcRenderer.invoke('wntr:generate-simulation-report', config),
    generateAnalysisReport: (config: any) => ipcRenderer.invoke('wntr:generate-analysis-report', config),
    generateComprehensiveReport: (config: any) => ipcRenderer.invoke('wntr:generate-comprehensive-report', config),

    // Export
    exportJSON: () => ipcRenderer.invoke('wntr:export-json'),
  },

  // Document management for RAG
  documents: {
    // Document operations
    upload: (options: {
      category: 'hydraulics' | 'regulations' | 'best-practices'
      subcategory?: string
      region?: string[]
      language?: string
    }) => ipcRenderer.invoke('document:upload', options),

    search: (query: string, options?: any) => ipcRenderer.invoke('document:search', query, options),

    list: (filters?: {
      category?: string
      region?: string
      language?: string
    }) => ipcRenderer.invoke('document:list', filters),

    delete: (documentId: string) => ipcRenderer.invoke('document:delete', documentId),

    update: (documentId: string, updates: any) => ipcRenderer.invoke('document:update', documentId, updates),

    getEmbeddingProviders: () => ipcRenderer.invoke('document:get-embedding-providers'),

    setEmbeddingProvider: (providerId: string) => ipcRenderer.invoke('document:set-embedding-provider', providerId),
  },

  // Unified Wisdom Center (alias for documents for UI consistency)
  wisdom: {
    // Document operations
    upload: (options: {
      category: 'hydraulics' | 'regulations' | 'best-practices'
      subcategory?: string
      region?: string[]
      language?: string
    }) => ipcRenderer.invoke('wisdom:upload', options),

    search: (query: string, options?: any) => ipcRenderer.invoke('wisdom:search', query, options),

    list: (filters?: {
      category?: string
      region?: string
      language?: string
    }) => ipcRenderer.invoke('wisdom:list', filters),

    delete: (documentId: string) => ipcRenderer.invoke('wisdom:delete', documentId),

    update: (documentId: string, updates: any) => ipcRenderer.invoke('wisdom:update', documentId, updates),

    reindex: (documentId: string) => ipcRenderer.invoke('wisdom:reindex', documentId),

    getEmbeddingProviders: () => ipcRenderer.invoke('wisdom:getEmbeddingProviders'),

    setEmbeddingProvider: (providerId: string) => ipcRenderer.invoke('wisdom:setEmbeddingProvider', providerId),

    // Validation and reindexing functions
    validateIndexing: () => ipcRenderer.invoke('wisdom:validateIndexing'),
    massiveReindex: (options?: {
      clearAllEmbeddings?: boolean
      reindexAll?: boolean
      onlyCorrupted?: boolean
      onlyPartial?: boolean
      embeddingModel?: string
      categories?: string[]
    }) => ipcRenderer.invoke('wisdom:massiveReindex', options),
    cleanDatabase: () => ipcRenderer.invoke('wisdom:cleanDatabase'),

    // Additional wisdom-specific methods
    selectFolder: () => ipcRenderer.invoke('wisdom:selectFolder'),
    getFolderStructure: (folderPath: string) => ipcRenderer.invoke('wisdom:getFolderStructure', folderPath),
    bulkUploadDocuments: (options: any) => ipcRenderer.invoke('wisdom:bulkUploadDocuments', options),
    getCatalog: () => ipcRenderer.invoke('wisdom:get-catalog'),
    indexFromCatalog: (entryId: string) => ipcRenderer.invoke('wisdom:index-from-catalog', entryId),
    getVectorGraph: (options?: any) => ipcRenderer.invoke('wisdom:getVectorGraph', options),
    getRAGHealth: () => ipcRenderer.invoke('wisdom:getRAGHealth'),
    getVectorClusters: (options?: any) => ipcRenderer.invoke('wisdom:getVectorClusters', options),

    // Ollama connection check via main process (bypasses CORS)
    checkOllamaConnection: () => ipcRenderer.invoke('wisdom:checkOllamaConnection'),

    // Progress listener
    onUploadProgress: (callback: (data: { current: number; total: number; message: string; filename: string }) => void) => {
      const wrappedCallback = (_event: any, data: any) => callback(data)
      ipcRenderer.on('wisdom:upload-progress', wrappedCallback)
      return () => ipcRenderer.removeListener('wisdom:upload-progress', wrappedCallback)
    },
  },

  // Agentic RAG operations for enhanced chat
  agenticRAG: {
    query: (question: string, options?: {
      categories?: string[]
      regions?: string[]
      searchTopK?: number
      useWebSearch?: boolean
      forceWebSearch?: boolean
      technicalLevel?: 'basic' | 'intermediate' | 'advanced'
    }) => ipcRenderer.invoke('agentic-rag-query', { question, options }),

    testConfig: () => ipcRenderer.invoke('agentic-rag-test-config'),

    getMetrics: () => ipcRenderer.invoke('agentic-rag-metrics'),

    resetMetrics: () => ipcRenderer.invoke('agentic-rag-reset-metrics'),

    getIndexingStatus: () => ipcRenderer.invoke('agentic-rag-indexing-status'),

    validateQuery: (query: string) => ipcRenderer.invoke('agentic-rag-validate-query', query),
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
contextBridge.exposeInMainWorld('electron', true)

export type ElectronAPI = typeof electronAPI