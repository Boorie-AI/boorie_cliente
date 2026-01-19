// Conversation Service - Business logic for conversation management

import {
  IServiceResponse,
  IConversation,
  IMessage,
  ICreateConversationData,
  IUpdateConversationData,
  ServiceError
} from '../models'
import { DatabaseService } from './database.service'
import { conversationLogger } from '../utils/logger'
import { validateString, validateArray, validateRequired } from '../utils/validation'
import { EmbeddingService } from './embedding.service'
import { MilvusService } from './milvus.service'

export class ConversationService {
  private databaseService: DatabaseService
  private logger = conversationLogger

  private embeddingService: EmbeddingService
  private milvusService: MilvusService

  constructor(databaseService: DatabaseService) {
    this.databaseService = databaseService
    this.logger.info('Conversation service initialized')
    this.embeddingService = new EmbeddingService()
    this.milvusService = MilvusService.getInstance()
  }

  async getAllConversations(): Promise<IServiceResponse<IConversation[]>> {
    try {
      this.logger.debug('Getting all conversations')

      const result = await this.databaseService.getConversations()

      if (!result.success) {
        throw new ServiceError(result.error || 'Failed to get conversations', 'DATABASE_ERROR')
      }

      this.logger.success(`Retrieved ${result.data?.length || 0} conversations`)
      return result
    } catch (error) {
      this.logger.error('Failed to get all conversations', error as Error)
      return {
        success: false,
        error: error instanceof ServiceError ? error.message : 'Failed to retrieve conversations'
      }
    }
  }

  async getConversationById(id: string): Promise<IServiceResponse<IConversation>> {
    try {
      validateString(id, 'Conversation ID')
      this.logger.debug('Getting conversation by ID', { id })

      const result = await this.databaseService.getConversationById(id)

      if (!result.success) {
        throw new ServiceError(result.error || 'Failed to get conversation', 'DATABASE_ERROR')
      }

      this.logger.success('Retrieved conversation', { id, title: result.data?.title })
      return result
    } catch (error) {
      this.logger.error('Failed to get conversation by ID', error as Error, { id })
      return {
        success: false,
        error: error instanceof ServiceError ? error.message : 'Failed to retrieve conversation'
      }
    }
  }

  async createConversation(data: ICreateConversationData): Promise<IServiceResponse<IConversation>> {
    try {
      this.logger.debug('Creating new conversation', { id: data.id, title: data.title })

      // Validate input data
      this.validateConversationData(data)

      // Ensure conversation doesn't already exist
      const existingResult = await this.databaseService.getConversationById(data.id)
      if (existingResult.success) {
        throw new ServiceError('Conversation with this ID already exists', 'DUPLICATE_ERROR', 409)
      }

      // Create the conversation
      const result = await this.databaseService.createConversation(data)

      if (!result.success) {
        throw new ServiceError(result.error || 'Failed to create conversation', 'DATABASE_ERROR')
      }

      this.logger.success('Created conversation', {
        id: result.data?.id,
        title: result.data?.title
      })
      return result
    } catch (error) {
      this.logger.error('Failed to create conversation', error as Error, data)
      return {
        success: false,
        error: error instanceof ServiceError ? error.message : 'Failed to create conversation'
      }
    }
  }

  async updateConversation(id: string, updates: IUpdateConversationData): Promise<IServiceResponse<IConversation>> {
    try {
      validateString(id, 'Conversation ID')
      this.logger.debug('Updating conversation', { id, updates })

      // Validate updates
      if (updates.title !== undefined) {
        validateString(updates.title, 'Title', 1, 200)
      }
      if (updates.messages !== undefined) {
        validateArray(updates.messages, 'Messages')
        this.validateMessages(updates.messages)
      }
      if (updates.model !== undefined) {
        validateString(updates.model, 'Model')
      }
      if (updates.provider !== undefined) {
        validateString(updates.provider, 'Provider')
      }

      // Check if conversation exists
      const existingResult = await this.databaseService.getConversationById(id)
      if (!existingResult.success) {
        throw new ServiceError('Conversation not found', 'NOT_FOUND', 404)
      }

      // Update the conversation
      const result = await this.databaseService.updateConversation(id, updates)

      if (!result.success) {
        throw new ServiceError(result.error || 'Failed to update conversation', 'DATABASE_ERROR')
      }

      this.logger.success('Updated conversation', {
        id: result.data?.id,
        title: result.data?.title
      })
      return result
    } catch (error) {
      this.logger.error('Failed to update conversation', error as Error, { id, updates })
      return {
        success: false,
        error: error instanceof ServiceError ? error.message : 'Failed to update conversation'
      }
    }
  }

  async deleteConversation(id: string): Promise<IServiceResponse<boolean>> {
    try {
      validateString(id, 'Conversation ID')
      this.logger.debug('Deleting conversation', { id })

      // Check if conversation exists
      const existingResult = await this.databaseService.getConversationById(id)
      if (!existingResult.success) {
        throw new ServiceError('Conversation not found', 'NOT_FOUND', 404)
      }

      // Delete the conversation
      const result = await this.databaseService.deleteConversation(id)

      if (!result.success) {
        throw new ServiceError(result.error || 'Failed to delete conversation', 'DATABASE_ERROR')
      }

      this.logger.success('Deleted conversation', { id })
      return result
    } catch (error) {
      this.logger.error('Failed to delete conversation', error as Error, { id })
      return {
        success: false,
        error: error instanceof ServiceError ? error.message : 'Failed to delete conversation'
      }
    }
  }

  async addMessageToConversation(
    conversationId: string,
    message: Omit<IMessage, 'id' | 'timestamp'>
  ): Promise<IServiceResponse<IConversation>> {
    try {
      validateString(conversationId, 'Conversation ID')
      this.logger.debug('Adding message to conversation', {
        conversationId,
        role: message.role
      })

      // Validate message
      this.validateMessage(message)

      // Get existing conversation
      const conversationResult = await this.databaseService.getConversationById(conversationId)
      if (!conversationResult.success || !conversationResult.data) {
        throw new ServiceError('Conversation not found', 'NOT_FOUND', 404)
      }

      const conversation = conversationResult.data

      // Create message in database
      const messageResult = await this.databaseService.createMessage({
        conversationId,
        role: message.role,
        content: message.content,
        metadata: message.metadata
      })

      if (!messageResult.success) {
        throw new ServiceError(messageResult.error || 'Failed to create message', 'DATABASE_ERROR')
      }

      // Sync to Milvus (Fire and Forget)
      if (messageResult.data) {
        this.syncMessageToMilvus(conversationId, messageResult.data).catch(err => {
          this.logger.error('Failed to sync message to Milvus', err);
        });
      }

      // Update conversation title if it's the first user message
      let newTitle = conversation.title
      if (conversation.messages.length === 0 && message.role === 'user') {
        newTitle = this.generateTitleFromMessage(message.content)

        const titleUpdateResult = await this.databaseService.updateConversation(conversationId, {
          title: newTitle
        })

        if (!titleUpdateResult.success) {
          this.logger.warn('Failed to update conversation title', new Error(titleUpdateResult.error))
        }
      }

      // Get updated conversation with messages
      const updatedConversationResult = await this.databaseService.getConversationById(conversationId)

      if (!updatedConversationResult.success) {
        throw new ServiceError('Failed to retrieve updated conversation', 'DATABASE_ERROR')
      }

      this.logger.success('Added message to conversation', {
        conversationId,
        messageId: messageResult.data?.id,
        role: message.role
      })
      return updatedConversationResult
    } catch (error) {
      this.logger.error('Failed to add message to conversation', error as Error, {
        conversationId,
        message
      })
      return {
        success: false,
        error: error instanceof ServiceError ? error.message : 'Failed to add message'
      }
    }
  }

  // ... (existing update methods)

  private async syncMessageToMilvus(conversationId: string, message: IMessage) {
    try {
      if (!message.content || !message.content.trim()) return;

      const vector = await this.embeddingService.generateEmbedding(message.content);

      await this.milvusService.insert(MilvusService.COLLECTIONS.CONVERSATIONS, [{
        id: message.id,
        vector: vector,
        content: message.content,
        metadata: {
          conversationId: conversationId,
          role: message.role,
          ...message.metadata
        },
        timestamp: new Date(message.timestamp).getTime()
      }]);

      this.logger.debug(`Synced message ${message.id} to Milvus`);
    } catch (error) {
      console.error("Error syncing message to Milvus:", error);
      // Don't throw, just log
    }
  }

  // ... (rest of file)

  async getAllConversations(): Promise<IServiceResponse<IConversation[]>> {
    try {
      this.logger.debug('Getting all conversations')

      const result = await this.databaseService.getConversations()

      if (!result.success) {
        throw new ServiceError(result.error || 'Failed to get conversations', 'DATABASE_ERROR')
      }

      this.logger.success(`Retrieved ${result.data?.length || 0} conversations`)
      return result
    } catch (error) {
      this.logger.error('Failed to get all conversations', error as Error)
      return {
        success: false,
        error: error instanceof ServiceError ? error.message : 'Failed to retrieve conversations'
      }
    }
  }

  async getConversationById(id: string): Promise<IServiceResponse<IConversation>> {
    try {
      validateString(id, 'Conversation ID')
      this.logger.debug('Getting conversation by ID', { id })

      const result = await this.databaseService.getConversationById(id)

      if (!result.success) {
        throw new ServiceError(result.error || 'Failed to get conversation', 'DATABASE_ERROR')
      }

      this.logger.success('Retrieved conversation', { id, title: result.data?.title })
      return result
    } catch (error) {
      this.logger.error('Failed to get conversation by ID', error as Error, { id })
      return {
        success: false,
        error: error instanceof ServiceError ? error.message : 'Failed to retrieve conversation'
      }
    }
  }

  async createConversation(data: ICreateConversationData): Promise<IServiceResponse<IConversation>> {
    try {
      this.logger.debug('Creating new conversation', { id: data.id, title: data.title })

      // Validate input data
      this.validateConversationData(data)

      // Ensure conversation doesn't already exist
      const existingResult = await this.databaseService.getConversationById(data.id)
      if (existingResult.success) {
        throw new ServiceError('Conversation with this ID already exists', 'DUPLICATE_ERROR', 409)
      }

      // Create the conversation
      const result = await this.databaseService.createConversation(data)

      if (!result.success) {
        throw new ServiceError(result.error || 'Failed to create conversation', 'DATABASE_ERROR')
      }

      this.logger.success('Created conversation', {
        id: result.data?.id,
        title: result.data?.title
      })
      return result
    } catch (error) {
      this.logger.error('Failed to create conversation', error as Error, data)
      return {
        success: false,
        error: error instanceof ServiceError ? error.message : 'Failed to create conversation'
      }
    }
  }

  async updateConversation(id: string, updates: IUpdateConversationData): Promise<IServiceResponse<IConversation>> {
    try {
      validateString(id, 'Conversation ID')
      this.logger.debug('Updating conversation', { id, updates })

      // Validate updates
      if (updates.title !== undefined) {
        validateString(updates.title, 'Title', 1, 200)
      }
      if (updates.messages !== undefined) {
        validateArray(updates.messages, 'Messages')
        this.validateMessages(updates.messages)
      }
      if (updates.model !== undefined) {
        validateString(updates.model, 'Model')
      }
      if (updates.provider !== undefined) {
        validateString(updates.provider, 'Provider')
      }

      // Check if conversation exists
      const existingResult = await this.databaseService.getConversationById(id)
      if (!existingResult.success) {
        throw new ServiceError('Conversation not found', 'NOT_FOUND', 404)
      }

      // Update the conversation
      const result = await this.databaseService.updateConversation(id, updates)

      if (!result.success) {
        throw new ServiceError(result.error || 'Failed to update conversation', 'DATABASE_ERROR')
      }

      this.logger.success('Updated conversation', {
        id: result.data?.id,
        title: result.data?.title
      })
      return result
    } catch (error) {
      this.logger.error('Failed to update conversation', error as Error, { id, updates })
      return {
        success: false,
        error: error instanceof ServiceError ? error.message : 'Failed to update conversation'
      }
    }
  }

  async deleteConversation(id: string): Promise<IServiceResponse<boolean>> {
    try {
      validateString(id, 'Conversation ID')
      this.logger.debug('Deleting conversation', { id })

      // Check if conversation exists
      const existingResult = await this.databaseService.getConversationById(id)
      if (!existingResult.success) {
        throw new ServiceError('Conversation not found', 'NOT_FOUND', 404)
      }

      // Delete the conversation
      const result = await this.databaseService.deleteConversation(id)

      if (!result.success) {
        throw new ServiceError(result.error || 'Failed to delete conversation', 'DATABASE_ERROR')
      }

      this.logger.success('Deleted conversation', { id })
      return result
    } catch (error) {
      this.logger.error('Failed to delete conversation', error as Error, { id })
      return {
        success: false,
        error: error instanceof ServiceError ? error.message : 'Failed to delete conversation'
      }
    }
  }



  async updateConversationTitle(id: string, title: string): Promise<IServiceResponse<IConversation>> {
    try {
      validateString(id, 'Conversation ID')
      validateString(title, 'Title', 1, 200)
      this.logger.debug('Updating conversation title', { id, title })

      const result = await this.updateConversation(id, { title })

      this.logger.success('Updated conversation title', { id, title })
      return result
    } catch (error) {
      this.logger.error('Failed to update conversation title', error as Error, { id, title })
      return {
        success: false,
        error: error instanceof ServiceError ? error.message : 'Failed to update title'
      }
    }
  }

  async updateConversationModel(
    id: string,
    model: string,
    provider: string
  ): Promise<IServiceResponse<IConversation>> {
    try {
      validateString(id, 'Conversation ID')
      validateString(model, 'Model')
      validateString(provider, 'Provider')
      this.logger.debug('Updating conversation model', { id, model, provider })

      const result = await this.updateConversation(id, { model, provider })

      this.logger.success('Updated conversation model', { id, model, provider })
      return result
    } catch (error) {
      this.logger.error('Failed to update conversation model', error as Error, {
        id,
        model,
        provider
      })
      return {
        success: false,
        error: error instanceof ServiceError ? error.message : 'Failed to update model'
      }
    }
  }

  // Private helper methods
  private validateConversationData(data: ICreateConversationData): void {
    validateString(data.id, 'ID')
    validateString(data.title, 'Title', 1, 200)
    validateArray(data.messages, 'Messages')
    validateString(data.model, 'Model')
    validateString(data.provider, 'Provider')

    this.validateMessages(data.messages)
  }

  private validateMessages(messages: IMessage[]): void {
    messages.forEach((message, index) => {
      try {
        this.validateMessage(message)
      } catch (error) {
        throw new ServiceError(
          `Message at index ${index}: ${(error as Error).message}`,
          'VALIDATION_ERROR'
        )
      }
    })
  }

  private validateMessage(message: Partial<IMessage>): void {
    if ('role' in message) {
      const validRoles = ['user', 'assistant', 'system']
      if (!validRoles.includes(message.role!)) {
        throw new ServiceError('Invalid message role', 'VALIDATION_ERROR')
      }
    }

    if ('content' in message) {
      validateString(message.content!, 'Message content', 1)
    }

    if ('timestamp' in message && message.timestamp) {
      if (!(message.timestamp instanceof Date) && isNaN(new Date(message.timestamp).getTime())) {
        throw new ServiceError('Invalid message timestamp', 'VALIDATION_ERROR')
      }
    }
  }

  private generateMessageId(): string {
    return crypto.randomUUID()
  }

  private generateTitleFromMessage(content: string): string {
    // Generate a title from the first user message
    const maxLength = 50
    const title = content.length > maxLength
      ? content.slice(0, maxLength) + '...'
      : content

    return title.trim()
  }
}