"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const electronAPI = {
    getAppVersion: () => electron_1.ipcRenderer.invoke('get-app-version'),
    getPlatform: () => electron_1.ipcRenderer.invoke('get-platform'),
    // Menu events
    onNewChat: (callback) => {
        electron_1.ipcRenderer.on('new-chat', callback);
        return () => electron_1.ipcRenderer.removeListener('new-chat', callback);
    },
    onOpenSettings: (callback) => {
        electron_1.ipcRenderer.on('open-settings', callback);
        return () => electron_1.ipcRenderer.removeListener('open-settings', callback);
    },
    // Window controls
    minimizeWindow: () => electron_1.ipcRenderer.invoke('minimize-window'),
    maximizeWindow: () => electron_1.ipcRenderer.invoke('maximize-window'),
    closeWindow: () => electron_1.ipcRenderer.invoke('close-window'),
    isMaximized: () => electron_1.ipcRenderer.invoke('is-maximized'),
    // Database operations
    database: {
        // AI Providers
        getAIProviders: () => electron_1.ipcRenderer.invoke('db-get-ai-providers'),
        saveAIProvider: (data) => electron_1.ipcRenderer.invoke('db-save-ai-provider', data),
        updateAIProvider: (id, updates) => electron_1.ipcRenderer.invoke('db-update-ai-provider', id, updates),
        // AI Models
        getAIModels: (providerId) => electron_1.ipcRenderer.invoke('db-get-ai-models', providerId),
        saveAIModel: (data) => electron_1.ipcRenderer.invoke('db-save-ai-model', data),
        deleteAIModels: (providerId) => electron_1.ipcRenderer.invoke('db-delete-ai-models', providerId),
        testAIProvider: (id) => electron_1.ipcRenderer.invoke('db-test-ai-provider', id),
        refreshAIModels: (providerId) => electron_1.ipcRenderer.invoke('db-refresh-ai-models', providerId),
        // Conversations
        getConversations: () => electron_1.ipcRenderer.invoke('db-get-conversations'),
        getConversation: (id) => electron_1.ipcRenderer.invoke('db-get-conversation', id),
        saveConversation: (data) => electron_1.ipcRenderer.invoke('db-save-conversation', data),
        updateConversation: (id, updates) => electron_1.ipcRenderer.invoke('db-update-conversation', id, updates),
        deleteConversation: (id) => electron_1.ipcRenderer.invoke('db-delete-conversation', id),
        addMessageToConversation: (conversationId, message) => electron_1.ipcRenderer.invoke('db-add-message-to-conversation', conversationId, message),
        updateConversationTitle: (id, title) => electron_1.ipcRenderer.invoke('db-update-conversation-title', id, title),
        updateConversationModel: (id, model, provider) => electron_1.ipcRenderer.invoke('db-update-conversation-model', id, model, provider),
        // Settings
        getSetting: (key) => electron_1.ipcRenderer.invoke('db-get-setting', key),
        setSetting: (key, value, category) => electron_1.ipcRenderer.invoke('db-set-setting', key, value, category),
        getSettings: (category) => electron_1.ipcRenderer.invoke('db-get-settings', category),
        // Generic database operations
        query: (sql, params) => electron_1.ipcRenderer.invoke('db-query', sql, params),
        execute: (sql, params) => electron_1.ipcRenderer.invoke('db-execute', sql, params),
    },
    // File operations
    files: {
        selectFile: (options) => electron_1.ipcRenderer.invoke('select-file', options),
        readFile: (filePath) => electron_1.ipcRenderer.invoke('read-file', filePath),
        writeFile: (filePath, data) => electron_1.ipcRenderer.invoke('write-file', filePath, data),
    },
    // AI services
    ai: {
        ollamaQuery: (model, prompt, options) => electron_1.ipcRenderer.invoke('ollama-query', model, prompt, options),
        openaiQuery: (messages, options) => electron_1.ipcRenderer.invoke('openai-query', messages, options),
    },
    // Chat services
    chat: {
        sendMessage: (params) => electron_1.ipcRenderer.invoke('chat:send-message', params),
    },
    // Authentication
    auth: {
        // OAuth login flows
        microsoftLogin: () => electron_1.ipcRenderer.invoke('auth-microsoft-login'),
        googleLogin: () => electron_1.ipcRenderer.invoke('auth-google-login'),
        logout: (provider) => electron_1.ipcRenderer.invoke('auth-logout', provider),
        // Token management
        getTokens: (provider) => electron_1.ipcRenderer.invoke('auth-get-tokens', provider),
        refreshToken: (provider) => electron_1.ipcRenderer.invoke('auth-refresh-token', provider),
        validateToken: (provider) => electron_1.ipcRenderer.invoke('auth-validate-token', provider),
        // User profiles
        getUserProfile: (provider) => electron_1.ipcRenderer.invoke('auth-get-user-profile', provider),
        getActiveProfiles: () => electron_1.ipcRenderer.invoke('auth-get-active-profiles'),
        // Connection status
        getConnectionStatus: () => electron_1.ipcRenderer.invoke('auth-get-connection-status'),
        testConnection: (provider) => electron_1.ipcRenderer.invoke('auth-test-connection', provider),
    },
    // Notifications
    notifications: {
        show: (title, body, options) => electron_1.ipcRenderer.invoke('show-notification', title, body, options),
    },
    // Security
    security: {
        encryptData: (data) => electron_1.ipcRenderer.invoke('encrypt-data', data),
        decryptData: (encryptedData) => electron_1.ipcRenderer.invoke('decrypt-data', encryptedData),
        storeSecurely: (key, value) => electron_1.ipcRenderer.invoke('store-securely', key, value),
        retrieveSecurely: (key) => electron_1.ipcRenderer.invoke('retrieve-securely', key),
    },
    // Calendar
    calendar: {
        // Account management
        getConnectedAccounts: () => electron_1.ipcRenderer.invoke('calendar-get-connected-accounts'),
        getAccountInfo: (accountId) => electron_1.ipcRenderer.invoke('calendar-get-account-info', accountId),
        // Event operations
        getEvents: (accountId, startDate, endDate) => electron_1.ipcRenderer.invoke('calendar-get-events', accountId, startDate, endDate),
        getAllEvents: (startDate, endDate) => electron_1.ipcRenderer.invoke('calendar-get-all-events', startDate, endDate),
        getEvent: (accountId, eventId) => electron_1.ipcRenderer.invoke('calendar-get-event', accountId, eventId),
        createEvent: (accountId, eventData) => electron_1.ipcRenderer.invoke('calendar-create-event', accountId, eventData),
        updateEvent: (accountId, eventId, eventData) => electron_1.ipcRenderer.invoke('calendar-update-event', accountId, eventId, eventData),
        deleteEvent: (accountId, eventId) => electron_1.ipcRenderer.invoke('calendar-delete-event', accountId, eventId),
        // Teams meeting specific
        createTeamsMeeting: (accountId, eventData) => electron_1.ipcRenderer.invoke('calendar-create-teams-meeting', accountId, eventData),
        addTeamsToEvent: (accountId, eventId) => electron_1.ipcRenderer.invoke('calendar-add-teams-to-event', accountId, eventId),
        // Google Meet specific
        addMeetToEvent: (accountId, eventId) => electron_1.ipcRenderer.invoke('calendar-add-meet-to-event', accountId, eventId),
        // Calendar management
        getCalendars: (accountId) => electron_1.ipcRenderer.invoke('calendar-get-calendars', accountId),
        testConnection: (accountId) => electron_1.ipcRenderer.invoke('calendar-test-connection', accountId),
        testAllConnections: () => electron_1.ipcRenderer.invoke('calendar-test-all-connections'),
        // Cache management
        clearCache: () => electron_1.ipcRenderer.invoke('calendar-clear-cache'),
        getCacheStats: () => electron_1.ipcRenderer.invoke('calendar-get-cache-stats'),
    },
    // Todo
    todo: {
        // Initialization
        initializeData: () => electron_1.ipcRenderer.invoke('todo:initialize-data'),
        getAuthenticatedAccounts: () => electron_1.ipcRenderer.invoke('todo:get-authenticated-accounts'),
        validateAccountTokens: () => electron_1.ipcRenderer.invoke('todo:validate-account-tokens'),
        // Google Tasks
        google: {
            getLists: () => electron_1.ipcRenderer.invoke('todo:google:get-lists'),
            createList: (request) => electron_1.ipcRenderer.invoke('todo:google:create-list', request),
            updateList: (request) => electron_1.ipcRenderer.invoke('todo:google:update-list', request),
            deleteList: (listId) => electron_1.ipcRenderer.invoke('todo:google:delete-list', listId),
            getTasks: (listId) => electron_1.ipcRenderer.invoke('todo:google:get-tasks', listId),
            createTask: (request) => electron_1.ipcRenderer.invoke('todo:google:create-task', request),
            updateTask: (request) => electron_1.ipcRenderer.invoke('todo:google:update-task', request),
            deleteTask: (listId, taskId) => electron_1.ipcRenderer.invoke('todo:google:delete-task', listId, taskId),
            toggleStar: (listId, taskId, starred) => electron_1.ipcRenderer.invoke('todo:google:toggle-star', listId, taskId, starred),
        },
        // Microsoft To Do
        microsoft: {
            getLists: () => electron_1.ipcRenderer.invoke('todo:microsoft:get-lists'),
            createList: (request) => electron_1.ipcRenderer.invoke('todo:microsoft:create-list', request),
            updateList: (request) => electron_1.ipcRenderer.invoke('todo:microsoft:update-list', request),
            deleteList: (listId) => electron_1.ipcRenderer.invoke('todo:microsoft:delete-list', listId),
            getTasks: (listId) => electron_1.ipcRenderer.invoke('todo:microsoft:get-tasks', listId),
            createTask: (request) => electron_1.ipcRenderer.invoke('todo:microsoft:create-task', request),
            updateTask: (request) => electron_1.ipcRenderer.invoke('todo:microsoft:update-task', request),
            deleteTask: (listId, taskId) => electron_1.ipcRenderer.invoke('todo:microsoft:delete-task', listId, taskId),
            toggleStar: (listId, taskId, starred) => electron_1.ipcRenderer.invoke('todo:microsoft:toggle-star', listId, taskId, starred),
        },
        // Utility operations
        syncAll: () => electron_1.ipcRenderer.invoke('todo:sync-all'),
        getUnifiedData: () => electron_1.ipcRenderer.invoke('todo:get-unified-data'),
    },
    // RAG (Retrieval-Augmented Generation)
    rag: {
        // Collection management
        createCollection: (params) => electron_1.ipcRenderer.invoke('rag:create-collection', params),
        getCollections: () => electron_1.ipcRenderer.invoke('rag:get-collections'),
        getCollection: (id) => electron_1.ipcRenderer.invoke('rag:get-collection', id),
        updateCollection: (id, params) => electron_1.ipcRenderer.invoke('rag:update-collection', id, params),
        deleteCollection: (id) => electron_1.ipcRenderer.invoke('rag:delete-collection', id),
        // Document management
        selectDocuments: () => electron_1.ipcRenderer.invoke('rag:select-documents'),
        uploadDocument: (collectionId, filePath) => electron_1.ipcRenderer.invoke('rag:upload-document', collectionId, filePath),
        getDocuments: (collectionId) => electron_1.ipcRenderer.invoke('rag:get-documents', collectionId),
        deleteDocument: (documentId) => electron_1.ipcRenderer.invoke('rag:delete-document', documentId),
        // Search and retrieval
        searchDocuments: (query, collectionIds, limit) => electron_1.ipcRenderer.invoke('rag:search-documents', query, collectionIds, limit),
        // Embedding models
        getEmbeddingModels: () => electron_1.ipcRenderer.invoke('rag:get-embedding-models'),
        testEmbedding: (text, model, provider) => electron_1.ipcRenderer.invoke('rag:test-embedding', text, model, provider),
    },
    // Event listeners
    on: (channel, listener) => {
        electron_1.ipcRenderer.on(channel, listener);
    },
    removeListener: (channel, listener) => {
        electron_1.ipcRenderer.removeListener(channel, listener);
    }
};
electron_1.contextBridge.exposeInMainWorld('electronAPI', electronAPI);
electron_1.contextBridge.exposeInMainWorld('electron', true);
