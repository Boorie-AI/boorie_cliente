"use strict";
// Services Index - Export all backend services
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServiceContainer = exports.AIProviderService = exports.ConversationService = exports.DatabaseService = void 0;
var database_service_1 = require("./database.service");
Object.defineProperty(exports, "DatabaseService", { enumerable: true, get: function () { return database_service_1.DatabaseService; } });
var conversation_service_1 = require("./conversation.service");
Object.defineProperty(exports, "ConversationService", { enumerable: true, get: function () { return conversation_service_1.ConversationService; } });
var aiProvider_service_1 = require("./aiProvider.service");
Object.defineProperty(exports, "AIProviderService", { enumerable: true, get: function () { return aiProvider_service_1.AIProviderService; } });
const database_service_2 = require("./database.service");
const conversation_service_2 = require("./conversation.service");
const aiProvider_service_2 = require("./aiProvider.service");
const logger_1 = require("../utils/logger");
class ServiceContainer {
    constructor(prismaClient) {
        this.logger = logger_1.appLogger;
        this.logger.info('Initializing service container');
        // Initialize services with dependency injection
        this.databaseService = new database_service_2.DatabaseService(prismaClient);
        this.conversationService = new conversation_service_2.ConversationService(this.databaseService);
        this.aiProviderService = new aiProvider_service_2.AIProviderService(this.databaseService);
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
