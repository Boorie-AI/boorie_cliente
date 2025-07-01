"use strict";
// Conversation Service - Business logic for conversation management
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConversationService = void 0;
const models_1 = require("../models");
const logger_1 = require("../utils/logger");
const validation_1 = require("../utils/validation");
class ConversationService {
    constructor(databaseService) {
        this.logger = logger_1.conversationLogger;
        this.databaseService = databaseService;
        this.logger.info('Conversation service initialized');
    }
    async getAllConversations() {
        try {
            this.logger.debug('Getting all conversations');
            const result = await this.databaseService.getConversations();
            if (!result.success) {
                throw new models_1.ServiceError(result.error || 'Failed to get conversations', 'DATABASE_ERROR');
            }
            this.logger.success(`Retrieved ${result.data?.length || 0} conversations`);
            return result;
        }
        catch (error) {
            this.logger.error('Failed to get all conversations', error);
            return {
                success: false,
                error: error instanceof models_1.ServiceError ? error.message : 'Failed to retrieve conversations'
            };
        }
    }
    async getConversationById(id) {
        try {
            (0, validation_1.validateString)(id, 'Conversation ID');
            this.logger.debug('Getting conversation by ID', { id });
            const result = await this.databaseService.getConversationById(id);
            if (!result.success) {
                throw new models_1.ServiceError(result.error || 'Failed to get conversation', 'DATABASE_ERROR');
            }
            this.logger.success('Retrieved conversation', { id, title: result.data?.title });
            return result;
        }
        catch (error) {
            this.logger.error('Failed to get conversation by ID', error, { id });
            return {
                success: false,
                error: error instanceof models_1.ServiceError ? error.message : 'Failed to retrieve conversation'
            };
        }
    }
    async createConversation(data) {
        try {
            this.logger.debug('Creating new conversation', { id: data.id, title: data.title });
            // Validate input data
            this.validateConversationData(data);
            // Ensure conversation doesn't already exist
            const existingResult = await this.databaseService.getConversationById(data.id);
            if (existingResult.success) {
                throw new models_1.ServiceError('Conversation with this ID already exists', 'DUPLICATE_ERROR', 409);
            }
            // Create the conversation
            const result = await this.databaseService.createConversation(data);
            if (!result.success) {
                throw new models_1.ServiceError(result.error || 'Failed to create conversation', 'DATABASE_ERROR');
            }
            this.logger.success('Created conversation', {
                id: result.data?.id,
                title: result.data?.title
            });
            return result;
        }
        catch (error) {
            this.logger.error('Failed to create conversation', error, data);
            return {
                success: false,
                error: error instanceof models_1.ServiceError ? error.message : 'Failed to create conversation'
            };
        }
    }
    async updateConversation(id, updates) {
        try {
            (0, validation_1.validateString)(id, 'Conversation ID');
            this.logger.debug('Updating conversation', { id, updates });
            // Validate updates
            if (updates.title !== undefined) {
                (0, validation_1.validateString)(updates.title, 'Title', 1, 200);
            }
            if (updates.messages !== undefined) {
                (0, validation_1.validateArray)(updates.messages, 'Messages');
                this.validateMessages(updates.messages);
            }
            if (updates.model !== undefined) {
                (0, validation_1.validateString)(updates.model, 'Model');
            }
            if (updates.provider !== undefined) {
                (0, validation_1.validateString)(updates.provider, 'Provider');
            }
            // Check if conversation exists
            const existingResult = await this.databaseService.getConversationById(id);
            if (!existingResult.success) {
                throw new models_1.ServiceError('Conversation not found', 'NOT_FOUND', 404);
            }
            // Update the conversation
            const result = await this.databaseService.updateConversation(id, updates);
            if (!result.success) {
                throw new models_1.ServiceError(result.error || 'Failed to update conversation', 'DATABASE_ERROR');
            }
            this.logger.success('Updated conversation', {
                id: result.data?.id,
                title: result.data?.title
            });
            return result;
        }
        catch (error) {
            this.logger.error('Failed to update conversation', error, { id, updates });
            return {
                success: false,
                error: error instanceof models_1.ServiceError ? error.message : 'Failed to update conversation'
            };
        }
    }
    async deleteConversation(id) {
        try {
            (0, validation_1.validateString)(id, 'Conversation ID');
            this.logger.debug('Deleting conversation', { id });
            // Check if conversation exists
            const existingResult = await this.databaseService.getConversationById(id);
            if (!existingResult.success) {
                throw new models_1.ServiceError('Conversation not found', 'NOT_FOUND', 404);
            }
            // Delete the conversation
            const result = await this.databaseService.deleteConversation(id);
            if (!result.success) {
                throw new models_1.ServiceError(result.error || 'Failed to delete conversation', 'DATABASE_ERROR');
            }
            this.logger.success('Deleted conversation', { id });
            return result;
        }
        catch (error) {
            this.logger.error('Failed to delete conversation', error, { id });
            return {
                success: false,
                error: error instanceof models_1.ServiceError ? error.message : 'Failed to delete conversation'
            };
        }
    }
    async addMessageToConversation(conversationId, message) {
        try {
            (0, validation_1.validateString)(conversationId, 'Conversation ID');
            this.logger.debug('Adding message to conversation', {
                conversationId,
                role: message.role
            });
            // Validate message
            this.validateMessage(message);
            // Get existing conversation
            const conversationResult = await this.databaseService.getConversationById(conversationId);
            if (!conversationResult.success || !conversationResult.data) {
                throw new models_1.ServiceError('Conversation not found', 'NOT_FOUND', 404);
            }
            const conversation = conversationResult.data;
            // Create message in database
            const messageResult = await this.databaseService.createMessage({
                conversationId,
                role: message.role,
                content: message.content,
                metadata: message.metadata
            });
            if (!messageResult.success) {
                throw new models_1.ServiceError(messageResult.error || 'Failed to create message', 'DATABASE_ERROR');
            }
            // Update conversation title if it's the first user message
            let newTitle = conversation.title;
            if (conversation.messages.length === 0 && message.role === 'user') {
                newTitle = this.generateTitleFromMessage(message.content);
                const titleUpdateResult = await this.databaseService.updateConversation(conversationId, {
                    title: newTitle
                });
                if (!titleUpdateResult.success) {
                    this.logger.warn('Failed to update conversation title', new Error(titleUpdateResult.error));
                }
            }
            // Get updated conversation with messages
            const updatedConversationResult = await this.databaseService.getConversationById(conversationId);
            if (!updatedConversationResult.success) {
                throw new models_1.ServiceError('Failed to retrieve updated conversation', 'DATABASE_ERROR');
            }
            this.logger.success('Added message to conversation', {
                conversationId,
                messageId: messageResult.data?.id,
                role: message.role
            });
            return updatedConversationResult;
        }
        catch (error) {
            this.logger.error('Failed to add message to conversation', error, {
                conversationId,
                message
            });
            return {
                success: false,
                error: error instanceof models_1.ServiceError ? error.message : 'Failed to add message'
            };
        }
    }
    async updateConversationTitle(id, title) {
        try {
            (0, validation_1.validateString)(id, 'Conversation ID');
            (0, validation_1.validateString)(title, 'Title', 1, 200);
            this.logger.debug('Updating conversation title', { id, title });
            const result = await this.updateConversation(id, { title });
            this.logger.success('Updated conversation title', { id, title });
            return result;
        }
        catch (error) {
            this.logger.error('Failed to update conversation title', error, { id, title });
            return {
                success: false,
                error: error instanceof models_1.ServiceError ? error.message : 'Failed to update title'
            };
        }
    }
    async updateConversationModel(id, model, provider) {
        try {
            (0, validation_1.validateString)(id, 'Conversation ID');
            (0, validation_1.validateString)(model, 'Model');
            (0, validation_1.validateString)(provider, 'Provider');
            this.logger.debug('Updating conversation model', { id, model, provider });
            const result = await this.updateConversation(id, { model, provider });
            this.logger.success('Updated conversation model', { id, model, provider });
            return result;
        }
        catch (error) {
            this.logger.error('Failed to update conversation model', error, {
                id,
                model,
                provider
            });
            return {
                success: false,
                error: error instanceof models_1.ServiceError ? error.message : 'Failed to update model'
            };
        }
    }
    // Private helper methods
    validateConversationData(data) {
        (0, validation_1.validateString)(data.id, 'ID');
        (0, validation_1.validateString)(data.title, 'Title', 1, 200);
        (0, validation_1.validateArray)(data.messages, 'Messages');
        (0, validation_1.validateString)(data.model, 'Model');
        (0, validation_1.validateString)(data.provider, 'Provider');
        this.validateMessages(data.messages);
    }
    validateMessages(messages) {
        messages.forEach((message, index) => {
            try {
                this.validateMessage(message);
            }
            catch (error) {
                throw new models_1.ServiceError(`Message at index ${index}: ${error.message}`, 'VALIDATION_ERROR');
            }
        });
    }
    validateMessage(message) {
        if ('role' in message) {
            const validRoles = ['user', 'assistant', 'system'];
            if (!validRoles.includes(message.role)) {
                throw new models_1.ServiceError('Invalid message role', 'VALIDATION_ERROR');
            }
        }
        if ('content' in message) {
            (0, validation_1.validateString)(message.content, 'Message content', 1);
        }
        if ('timestamp' in message && message.timestamp) {
            if (!(message.timestamp instanceof Date) && isNaN(new Date(message.timestamp).getTime())) {
                throw new models_1.ServiceError('Invalid message timestamp', 'VALIDATION_ERROR');
            }
        }
    }
    generateMessageId() {
        return crypto.randomUUID();
    }
    generateTitleFromMessage(content) {
        // Generate a title from the first user message
        const maxLength = 50;
        const title = content.length > maxLength
            ? content.slice(0, maxLength) + '...'
            : content;
        return title.trim();
    }
}
exports.ConversationService = ConversationService;
