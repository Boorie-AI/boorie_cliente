"use strict";
// Handlers Index - Export all IPC handlers and provide a unified setup
Object.defineProperty(exports, "__esModule", { value: true });
exports.HandlersManager = exports.RAGHandler = exports.ChatHandler = exports.DatabaseHandler = exports.AIProviderHandler = exports.ConversationHandler = void 0;
var conversation_handler_1 = require("./conversation.handler");
Object.defineProperty(exports, "ConversationHandler", { enumerable: true, get: function () { return conversation_handler_1.ConversationHandler; } });
var aiProvider_handler_1 = require("./aiProvider.handler");
Object.defineProperty(exports, "AIProviderHandler", { enumerable: true, get: function () { return aiProvider_handler_1.AIProviderHandler; } });
var database_handler_1 = require("./database.handler");
Object.defineProperty(exports, "DatabaseHandler", { enumerable: true, get: function () { return database_handler_1.DatabaseHandler; } });
var chat_handler_1 = require("./chat.handler");
Object.defineProperty(exports, "ChatHandler", { enumerable: true, get: function () { return chat_handler_1.ChatHandler; } });
var rag_handler_1 = require("./rag.handler");
Object.defineProperty(exports, "RAGHandler", { enumerable: true, get: function () { return rag_handler_1.RAGHandler; } });
const conversation_handler_2 = require("./conversation.handler");
const aiProvider_handler_2 = require("./aiProvider.handler");
const database_handler_2 = require("./database.handler");
const chat_handler_2 = require("./chat.handler");
const rag_handler_2 = require("./rag.handler");
const logger_1 = require("../backend/utils/logger");
const logger = (0, logger_1.createLogger)('HandlersManager');
class HandlersManager {
    constructor(services) {
        this.isInitialized = false;
        logger.info('Initializing IPC handlers manager');
        this.conversationHandler = new conversation_handler_2.ConversationHandler(services.conversation);
        this.aiProviderHandler = new aiProvider_handler_2.AIProviderHandler(services.aiProvider);
        this.databaseHandler = new database_handler_2.DatabaseHandler(services.database);
        this.chatHandler = new chat_handler_2.ChatHandler();
        this.ragHandler = new rag_handler_2.RAGHandler(services.rag, services.documentParser, services.embedding);
        this.isInitialized = true;
        logger.success('IPC handlers manager initialized successfully');
    }
    // Get individual handlers (if needed for specific operations)
    get conversation() {
        return this.conversationHandler;
    }
    get aiProvider() {
        return this.aiProviderHandler;
    }
    get database() {
        return this.databaseHandler;
    }
    get chat() {
        return this.chatHandler;
    }
    get rag() {
        return this.ragHandler;
    }
    // Check if handlers are initialized
    get initialized() {
        return this.isInitialized;
    }
    // Cleanup method to unregister all handlers
    async cleanup() {
        if (!this.isInitialized) {
            logger.warn('Handlers manager not initialized, skipping cleanup');
            return;
        }
        logger.info('Cleaning up IPC handlers');
        try {
            this.conversationHandler.unregisterHandlers();
            this.aiProviderHandler.unregisterHandlers();
            this.databaseHandler.unregisterHandlers();
            this.chatHandler.unregisterHandlers();
            this.ragHandler.unregisterHandlers();
            this.isInitialized = false;
            logger.success('IPC handlers cleaned up successfully');
        }
        catch (error) {
            logger.error('Error during handlers cleanup', error);
        }
    }
    // Health check for all handlers
    async healthCheck() {
        const results = {};
        try {
            results.conversationHandler = this.conversationHandler ? true : false;
            results.aiProviderHandler = this.aiProviderHandler ? true : false;
            results.databaseHandler = this.databaseHandler ? true : false;
            results.chatHandler = this.chatHandler ? true : false;
            results.ragHandler = this.ragHandler ? true : false;
            results.initialized = this.isInitialized;
            logger.info('Handlers health check completed', results);
            return results;
        }
        catch (error) {
            logger.error('Error during handlers health check', error);
            return {
                conversationHandler: false,
                aiProviderHandler: false,
                databaseHandler: false,
                chatHandler: false,
                ragHandler: false,
                initialized: false,
                error: true
            };
        }
    }
}
exports.HandlersManager = HandlersManager;
