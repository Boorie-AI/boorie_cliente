"use strict";
// Conversation IPC Handlers - Handle all conversation-related IPC communication
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConversationHandler = void 0;
const electron_1 = require("electron");
const logger_1 = require("../backend/utils/logger");
const logger = (0, logger_1.createLogger)('ConversationHandler');
class ConversationHandler {
    constructor(conversationService) {
        this.conversationService = conversationService;
        this.registerHandlers();
        logger.info('Conversation IPC handlers registered');
    }
    registerHandlers() {
        // Get all conversations
        electron_1.ipcMain.handle('db-get-conversations', async (event) => {
            try {
                logger.debug('IPC: Getting conversations');
                const result = await this.conversationService.getAllConversations();
                if (result.success) {
                    logger.success(`IPC: Retrieved ${result.data?.length || 0} conversations`);
                    return result.data;
                }
                else {
                    logger.error('IPC: Failed to get conversations', new Error(result.error));
                    return [];
                }
            }
            catch (error) {
                logger.error('IPC: Error in get-conversations handler', error);
                return [];
            }
        });
        // Get conversation by ID
        electron_1.ipcMain.handle('db-get-conversation', async (event, id) => {
            try {
                logger.debug('IPC: Getting conversation by ID', { id });
                const result = await this.conversationService.getConversationById(id);
                if (result.success) {
                    logger.success('IPC: Retrieved conversation', { id, title: result.data?.title });
                    return result.data;
                }
                else {
                    logger.error('IPC: Failed to get conversation', new Error(result.error), { id });
                    return null;
                }
            }
            catch (error) {
                logger.error('IPC: Error in get-conversation handler', error, { id });
                return null;
            }
        });
        // Create new conversation
        electron_1.ipcMain.handle('db-save-conversation', async (event, data) => {
            try {
                logger.debug('IPC: Creating conversation', { id: data.id, title: data.title });
                const result = await this.conversationService.createConversation(data);
                if (result.success) {
                    logger.success('IPC: Created conversation', {
                        id: result.data?.id,
                        title: result.data?.title
                    });
                    return result.data;
                }
                else {
                    logger.error('IPC: Failed to create conversation', new Error(result.error), data);
                    return null;
                }
            }
            catch (error) {
                logger.error('IPC: Error in save-conversation handler', error, data);
                return null;
            }
        });
        // Update existing conversation
        electron_1.ipcMain.handle('db-update-conversation', async (event, id, updates) => {
            try {
                logger.debug('IPC: Updating conversation', { id, updates });
                const result = await this.conversationService.updateConversation(id, updates);
                if (result.success) {
                    logger.success('IPC: Updated conversation', {
                        id: result.data?.id,
                        title: result.data?.title
                    });
                    return result.data;
                }
                else {
                    logger.error('IPC: Failed to update conversation', new Error(result.error), { id, updates });
                    return null;
                }
            }
            catch (error) {
                logger.error('IPC: Error in update-conversation handler', error, { id, updates });
                return null;
            }
        });
        // Delete conversation
        electron_1.ipcMain.handle('db-delete-conversation', async (event, id) => {
            try {
                logger.debug('IPC: Deleting conversation', { id });
                const result = await this.conversationService.deleteConversation(id);
                if (result.success) {
                    logger.success('IPC: Deleted conversation', { id });
                    return true;
                }
                else {
                    logger.error('IPC: Failed to delete conversation', new Error(result.error), { id });
                    return false;
                }
            }
            catch (error) {
                logger.error('IPC: Error in delete-conversation handler', error, { id });
                return false;
            }
        });
        // Add message to conversation
        electron_1.ipcMain.handle('db-add-message-to-conversation', async (event, conversationId, message) => {
            try {
                logger.debug('IPC: Adding message to conversation', {
                    conversationId,
                    role: message.role
                });
                const result = await this.conversationService.addMessageToConversation(conversationId, message);
                if (result.success) {
                    logger.success('IPC: Added message to conversation', {
                        conversationId,
                        messageCount: result.data?.messages.length
                    });
                    return result.data;
                }
                else {
                    logger.error('IPC: Failed to add message', new Error(result.error), {
                        conversationId,
                        message
                    });
                    return null;
                }
            }
            catch (error) {
                logger.error('IPC: Error in add-message-to-conversation handler', error, {
                    conversationId,
                    message
                });
                return null;
            }
        });
        // Update conversation title
        electron_1.ipcMain.handle('db-update-conversation-title', async (event, id, title) => {
            try {
                logger.debug('IPC: Updating conversation title', { id, title });
                const result = await this.conversationService.updateConversationTitle(id, title);
                if (result.success) {
                    logger.success('IPC: Updated conversation title', { id, title });
                    return result.data;
                }
                else {
                    logger.error('IPC: Failed to update title', new Error(result.error), { id, title });
                    return null;
                }
            }
            catch (error) {
                logger.error('IPC: Error in update-conversation-title handler', error, {
                    id,
                    title
                });
                return null;
            }
        });
        // Update conversation model
        electron_1.ipcMain.handle('db-update-conversation-model', async (event, id, model, provider) => {
            try {
                logger.debug('IPC: Updating conversation model', { id, model, provider });
                const result = await this.conversationService.updateConversationModel(id, model, provider);
                if (result.success) {
                    logger.success('IPC: Updated conversation model', { id, model, provider });
                    return result.data;
                }
                else {
                    logger.error('IPC: Failed to update model', new Error(result.error), {
                        id,
                        model,
                        provider
                    });
                    return null;
                }
            }
            catch (error) {
                logger.error('IPC: Error in update-conversation-model handler', error, {
                    id,
                    model,
                    provider
                });
                return null;
            }
        });
    }
    // Method to unregister handlers (useful for cleanup)
    unregisterHandlers() {
        const handlers = [
            'db-get-conversations',
            'db-get-conversation',
            'db-save-conversation',
            'db-update-conversation',
            'db-delete-conversation',
            'db-add-message-to-conversation',
            'db-update-conversation-title',
            'db-update-conversation-model'
        ];
        handlers.forEach(handler => {
            electron_1.ipcMain.removeAllListeners(handler);
        });
        logger.info('Conversation IPC handlers unregistered');
    }
}
exports.ConversationHandler = ConversationHandler;
