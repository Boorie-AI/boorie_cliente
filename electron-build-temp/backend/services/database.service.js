"use strict";
// Database Service - Centralized database operations using Prisma
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseService = void 0;
const logger_1 = require("../utils/logger");
const validation_1 = require("../utils/validation");
class DatabaseService {
    constructor(prismaClient) {
        this.logger = logger_1.databaseLogger;
        this.prismaClient = prismaClient;
        this.logger.info('Database service initialized');
    }
    // Expose prisma client for raw queries (legacy support)
    get prisma() {
        return this.prismaClient;
    }
    // Conversation Operations
    async getConversations() {
        try {
            this.logger.debug('Fetching all conversations');
            const conversations = await this.prismaClient.conversation.findMany({
                include: {
                    messages: {
                        orderBy: {
                            timestamp: 'asc'
                        }
                    }
                },
                orderBy: {
                    updatedAt: 'desc'
                }
            });
            const result = conversations.map(conv => ({
                ...conv,
                messages: conv.messages.map(msg => ({
                    id: msg.id,
                    role: msg.role,
                    content: msg.content,
                    timestamp: msg.timestamp,
                    metadata: msg.metadata ? JSON.parse(msg.metadata) : undefined
                }))
            }));
            this.logger.success(`Retrieved ${result.length} conversations`);
            return {
                success: true,
                data: result
            };
        }
        catch (error) {
            this.logger.error('Failed to get conversations', error);
            return {
                success: false,
                error: 'Failed to retrieve conversations'
            };
        }
    }
    async getConversationById(id) {
        try {
            this.logger.debug('Fetching conversation by ID', { id });
            const conversation = await this.prismaClient.conversation.findUnique({
                where: { id },
                include: {
                    messages: {
                        orderBy: {
                            timestamp: 'asc'
                        }
                    }
                }
            });
            if (!conversation) {
                this.logger.warn('Conversation not found', { id });
                return {
                    success: false,
                    error: 'Conversation not found'
                };
            }
            const result = {
                ...conversation,
                messages: conversation.messages.map(msg => ({
                    id: msg.id,
                    role: msg.role,
                    content: msg.content,
                    timestamp: msg.timestamp,
                    metadata: msg.metadata ? JSON.parse(msg.metadata) : undefined
                }))
            };
            this.logger.success('Retrieved conversation', { id, title: result.title });
            return {
                success: true,
                data: result
            };
        }
        catch (error) {
            this.logger.error('Failed to get conversation by ID', error, { id });
            return {
                success: false,
                error: 'Failed to retrieve conversation'
            };
        }
    }
    async createConversation(data) {
        try {
            (0, validation_1.validateConversationData)(data);
            this.logger.debug('Creating new conversation', { id: data.id, title: data.title });
            const conversation = await this.prismaClient.conversation.create({
                data: {
                    id: data.id,
                    title: data.title,
                    model: data.model,
                    provider: data.provider
                },
                include: {
                    messages: true
                }
            });
            const result = {
                ...conversation,
                messages: conversation.messages.map(msg => ({
                    id: msg.id,
                    role: msg.role,
                    content: msg.content,
                    timestamp: msg.timestamp,
                    metadata: msg.metadata ? JSON.parse(msg.metadata) : undefined
                }))
            };
            this.logger.success('Created conversation', { id: result.id, title: result.title });
            return {
                success: true,
                data: result
            };
        }
        catch (error) {
            this.logger.error('Failed to create conversation', error, data);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to create conversation'
            };
        }
    }
    async updateConversation(id, updates) {
        try {
            this.logger.debug('Updating conversation', { id, updates });
            const updateData = { ...updates };
            // Remove messages from update data as they are now in separate table
            delete updateData.messages;
            const conversation = await this.prismaClient.conversation.update({
                where: { id },
                data: updateData,
                include: {
                    messages: {
                        orderBy: {
                            timestamp: 'asc'
                        }
                    }
                }
            });
            const result = {
                ...conversation,
                messages: conversation.messages.map(msg => ({
                    id: msg.id,
                    role: msg.role,
                    content: msg.content,
                    timestamp: msg.timestamp,
                    metadata: msg.metadata ? JSON.parse(msg.metadata) : undefined
                }))
            };
            this.logger.success('Updated conversation', { id, title: result.title });
            return {
                success: true,
                data: result
            };
        }
        catch (error) {
            this.logger.error('Failed to update conversation', error, { id, updates });
            return {
                success: false,
                error: 'Failed to update conversation'
            };
        }
    }
    async deleteConversation(id) {
        try {
            this.logger.debug('Deleting conversation', { id });
            await this.prismaClient.conversation.delete({
                where: { id }
            });
            this.logger.success('Deleted conversation', { id });
            return {
                success: true,
                data: true
            };
        }
        catch (error) {
            this.logger.error('Failed to delete conversation', error, { id });
            return {
                success: false,
                error: 'Failed to delete conversation'
            };
        }
    }
    // Message Operations
    async createMessage(data) {
        try {
            this.logger.debug('Creating message', { conversationId: data.conversationId, role: data.role });
            const message = await this.prismaClient.message.create({
                data: {
                    conversationId: data.conversationId,
                    role: data.role,
                    content: data.content,
                    metadata: data.metadata ? JSON.stringify(data.metadata) : null
                }
            });
            const result = {
                ...message,
                metadata: message.metadata ? JSON.parse(message.metadata) : undefined
            };
            this.logger.success('Created message', { id: result.id, conversationId: data.conversationId });
            return {
                success: true,
                data: result
            };
        }
        catch (error) {
            this.logger.error('Failed to create message', error, data);
            return {
                success: false,
                error: 'Failed to create message'
            };
        }
    }
    // AI Provider Operations
    async getAIProviders() {
        try {
            this.logger.debug('Fetching all AI providers');
            const providers = await this.prismaClient.aIProvider.findMany({
                include: {
                    models: true
                },
                orderBy: {
                    name: 'asc'
                }
            });
            const result = providers.map(provider => ({
                ...provider,
                type: provider.type,
                lastTestResult: provider.lastTestResult,
                config: provider.config ? JSON.parse(provider.config) : null
            }));
            this.logger.success(`Retrieved ${result.length} AI providers`);
            return {
                success: true,
                data: result
            };
        }
        catch (error) {
            this.logger.error('Failed to get AI providers', error);
            return {
                success: false,
                error: 'Failed to retrieve AI providers'
            };
        }
    }
    async createAIProvider(data) {
        try {
            (0, validation_1.validateAIProviderData)(data);
            this.logger.debug('Creating new AI provider', { name: data.name, type: data.type });
            const provider = await this.prismaClient.aIProvider.create({
                data: {
                    name: data.name,
                    type: data.type,
                    apiKey: data.apiKey,
                    isActive: data.isActive,
                    isConnected: data.isConnected,
                    config: data.config ? JSON.stringify(data.config) : null
                }
            });
            const result = {
                ...provider,
                type: provider.type,
                lastTestResult: provider.lastTestResult,
                config: provider.config ? JSON.parse(provider.config) : null
            };
            this.logger.success('Created AI provider', { id: result.id, name: result.name });
            return {
                success: true,
                data: result
            };
        }
        catch (error) {
            this.logger.error('Failed to create AI provider', error, data);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to create AI provider'
            };
        }
    }
    async updateAIProvider(id, updates) {
        try {
            this.logger.debug('Updating AI provider', { id, updates });
            const updateData = { ...updates };
            if (updateData.config) {
                updateData.config = JSON.stringify(updateData.config);
            }
            const provider = await this.prismaClient.aIProvider.update({
                where: { id },
                data: updateData
            });
            const result = {
                ...provider,
                type: provider.type,
                lastTestResult: provider.lastTestResult,
                config: provider.config ? JSON.parse(provider.config) : null
            };
            this.logger.success('Updated AI provider', { id, name: result.name });
            return {
                success: true,
                data: result
            };
        }
        catch (error) {
            this.logger.error('Failed to update AI provider', error, { id, updates });
            return {
                success: false,
                error: 'Failed to update AI provider'
            };
        }
    }
    // AI Model Operations
    async getAIModels(providerId) {
        try {
            this.logger.debug('Fetching AI models', { providerId });
            const where = providerId ? { providerId } : {};
            const models = await this.prismaClient.aIModel.findMany({
                where,
                orderBy: {
                    modelName: 'asc'
                }
            });
            const result = models.map(model => ({
                ...model,
                metadata: model.metadata ? JSON.parse(model.metadata) : null
            }));
            this.logger.success(`Retrieved ${result.length} AI models`);
            return {
                success: true,
                data: result
            };
        }
        catch (error) {
            this.logger.error('Failed to get AI models', error, { providerId });
            return {
                success: false,
                error: 'Failed to retrieve AI models'
            };
        }
    }
    async createOrUpdateAIModel(data) {
        try {
            (0, validation_1.validateAIModelData)(data);
            this.logger.debug('Creating or updating AI model', {
                providerId: data.providerId,
                modelId: data.modelId
            });
            const model = await this.prismaClient.aIModel.upsert({
                where: {
                    providerId_modelId: {
                        providerId: data.providerId,
                        modelId: data.modelId
                    }
                },
                update: {
                    modelName: data.modelName,
                    isSelected: data.isSelected,
                    isAvailable: data.isAvailable,
                    description: data.description,
                    metadata: data.metadata ? JSON.stringify(data.metadata) : null
                },
                create: {
                    providerId: data.providerId,
                    modelId: data.modelId,
                    modelName: data.modelName,
                    isDefault: data.isDefault || false,
                    isSelected: data.isSelected,
                    isAvailable: data.isAvailable,
                    description: data.description,
                    metadata: data.metadata ? JSON.stringify(data.metadata) : null
                }
            });
            const result = {
                ...model,
                metadata: model.metadata ? JSON.parse(model.metadata) : null
            };
            this.logger.success('Created/updated AI model', {
                id: result.id,
                modelName: result.modelName
            });
            return {
                success: true,
                data: result
            };
        }
        catch (error) {
            this.logger.error('Failed to create/update AI model', error, data);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to create/update AI model'
            };
        }
    }
    async deleteAIModels(providerId) {
        try {
            this.logger.debug('Deleting AI models for provider', { providerId });
            await this.prismaClient.aIModel.deleteMany({
                where: { providerId }
            });
            this.logger.success('Deleted AI models for provider', { providerId });
            return {
                success: true,
                data: true
            };
        }
        catch (error) {
            this.logger.error('Failed to delete AI models', error, { providerId });
            return {
                success: false,
                error: 'Failed to delete AI models'
            };
        }
    }
    // App Settings Operations
    async getSetting(key) {
        try {
            this.logger.debug('Getting setting', { key });
            const setting = await this.prismaClient.appSetting.findUnique({
                where: { key }
            });
            const result = setting ? setting.value : null;
            this.logger.success('Retrieved setting', { key, hasValue: !!result });
            return {
                success: true,
                data: result
            };
        }
        catch (error) {
            this.logger.error('Failed to get setting', error, { key });
            return {
                success: false,
                error: 'Failed to retrieve setting'
            };
        }
    }
    async setSetting(key, value, category) {
        try {
            const data = { key, value, category };
            (0, validation_1.validateSettingData)(data);
            this.logger.debug('Setting value', { key, category });
            const setting = await this.prismaClient.appSetting.upsert({
                where: { key },
                update: { value, category },
                create: { key, value, category }
            });
            this.logger.success('Set setting', { key, category });
            return {
                success: true,
                data: setting
            };
        }
        catch (error) {
            this.logger.error('Failed to set setting', error, { key, category });
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to set setting'
            };
        }
    }
    async getSettings(category) {
        try {
            this.logger.debug('Getting settings', { category });
            const where = category ? { category } : {};
            const settings = await this.prismaClient.appSetting.findMany({
                where,
                orderBy: { key: 'asc' }
            });
            this.logger.success(`Retrieved ${settings.length} settings`);
            return {
                success: true,
                data: settings
            };
        }
        catch (error) {
            this.logger.error('Failed to get settings', error, { category });
            return {
                success: false,
                error: 'Failed to retrieve settings'
            };
        }
    }
    // Health Check
    async healthCheck() {
        try {
            await this.prismaClient.$queryRaw `SELECT 1`;
            this.logger.success('Database health check passed');
            return {
                success: true,
                data: true
            };
        }
        catch (error) {
            this.logger.error('Database health check failed', error);
            return {
                success: false,
                error: 'Database connection failed'
            };
        }
    }
    // Cleanup
    async disconnect() {
        try {
            await this.prismaClient.$disconnect();
            this.logger.info('Database connection closed');
        }
        catch (error) {
            this.logger.error('Failed to close database connection', error);
        }
    }
}
exports.DatabaseService = DatabaseService;
