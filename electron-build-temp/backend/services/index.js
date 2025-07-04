"use strict";
// Services Index - Export all backend services
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServiceContainer = exports.EmbeddingService = exports.DocumentParserService = exports.RAGService = exports.AIProviderService = exports.ConversationService = exports.DatabaseService = void 0;
var database_service_1 = require("./database.service");
Object.defineProperty(exports, "DatabaseService", { enumerable: true, get: function () { return database_service_1.DatabaseService; } });
var conversation_service_1 = require("./conversation.service");
Object.defineProperty(exports, "ConversationService", { enumerable: true, get: function () { return conversation_service_1.ConversationService; } });
var aiProvider_service_1 = require("./aiProvider.service");
Object.defineProperty(exports, "AIProviderService", { enumerable: true, get: function () { return aiProvider_service_1.AIProviderService; } });
var rag_service_1 = require("./rag.service");
Object.defineProperty(exports, "RAGService", { enumerable: true, get: function () { return rag_service_1.RAGService; } });
var document_parser_service_1 = require("./document-parser.service");
Object.defineProperty(exports, "DocumentParserService", { enumerable: true, get: function () { return document_parser_service_1.DocumentParserService; } });
var embedding_service_1 = require("./embedding.service");
Object.defineProperty(exports, "EmbeddingService", { enumerable: true, get: function () { return embedding_service_1.EmbeddingService; } });
const database_service_2 = require("./database.service");
const conversation_service_2 = require("./conversation.service");
const aiProvider_service_2 = require("./aiProvider.service");
const rag_service_2 = require("./rag.service");
const document_parser_service_2 = require("./document-parser.service");
const embedding_service_2 = require("./embedding.service");
const logger_1 = require("../utils/logger");
class ServiceContainer {
    constructor(prismaClient) {
        this.logger = logger_1.appLogger;
        this.logger.info('Initializing service container');
        // Initialize services with dependency injection
        this.databaseService = new database_service_2.DatabaseService(prismaClient);
        this.conversationService = new conversation_service_2.ConversationService(this.databaseService);
        this.aiProviderService = new aiProvider_service_2.AIProviderService(this.databaseService);
        // Initialize RAG services
        this.documentParserService = new document_parser_service_2.DocumentParserService();
        this.embeddingService = new embedding_service_2.EmbeddingService(this.databaseService);
        this.ragService = new rag_service_2.RAGService(prismaClient, this.documentParserService, this.embeddingService);
        this.logger.success('Service container initialized successfully');
    }
    // Getters for services
    get database() {
        return this.databaseService;
    }
    get conversation() {
        return this.conversationService;
    }
    get aiProvider() {
        return this.aiProviderService;
    }
    get rag() {
        return this.ragService;
    }
    get documentParser() {
        return this.documentParserService;
    }
    get embedding() {
        return this.embeddingService;
    }
    // Health check for all services
    async healthCheck() {
        const results = {};
        try {
            const dbHealth = await this.databaseService.healthCheck();
            results.database = dbHealth.success;
        }
        catch (error) {
            this.logger.error('Database health check failed', error);
            results.database = false;
        }
        // Add other service health checks as needed
        results.conversation = true; // No external dependencies
        results.aiProvider = true; // No external dependencies
        results.rag = true; // No external dependencies
        results.documentParser = true; // No external dependencies
        results.embedding = true; // No external dependencies
        this.logger.info('Health check completed', results);
        return results;
    }
    // Cleanup method
    async cleanup() {
        this.logger.info('Cleaning up services');
        try {
            await this.databaseService.disconnect();
            this.logger.success('Services cleaned up successfully');
        }
        catch (error) {
            this.logger.error('Error during service cleanup', error);
        }
    }
}
exports.ServiceContainer = ServiceContainer;
