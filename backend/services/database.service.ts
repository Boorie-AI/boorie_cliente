// Database Service - Centralized database operations using Prisma

import { PrismaClient } from '@prisma/client'
import { 
  IServiceResponse, 
  IConversation, 
  IAIProvider, 
  IAIModel, 
  IAppSetting,
  ICreateConversationData,
  IUpdateConversationData,
  ICreateAIProviderData,
  IUpdateAIProviderData,
  DatabaseError
} from '../models'
import { databaseLogger } from '../utils/logger'
import { 
  validateConversationData, 
  validateAIProviderData, 
  validateAIModelData, 
  validateSettingData 
} from '../utils/validation'

export class DatabaseService {
  private prismaClient: PrismaClient
  private logger = databaseLogger

  constructor(prismaClient: PrismaClient) {
    this.prismaClient = prismaClient
    this.logger.info('Database service initialized')
  }

  // Expose prisma client for raw queries (legacy support)
  get prisma(): PrismaClient {
    return this.prismaClient
  }

  // Conversation Operations
  async getConversations(): Promise<IServiceResponse<IConversation[]>> {
    try {
      this.logger.debug('Fetching all conversations')
      
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
      })
      
      const result = conversations.map(conv => ({
        ...conv,
        projectId: conv.projectId || undefined,
        messages: conv.messages.map(msg => ({
          id: msg.id,
          role: msg.role as 'user' | 'assistant' | 'system',
          content: msg.content,
          timestamp: msg.timestamp,
          metadata: msg.metadata ? JSON.parse(msg.metadata) : undefined
        }))
      }))
      
      this.logger.success(`Retrieved ${result.length} conversations`)
      return {
        success: true,
        data: result
      }
    } catch (error) {
      this.logger.error('Failed to get conversations', error as Error)
      return {
        success: false,
        error: 'Failed to retrieve conversations'
      }
    }
  }

  async getConversationById(id: string): Promise<IServiceResponse<IConversation>> {
    try {
      this.logger.debug('Fetching conversation by ID', { id })
      
      const conversation = await this.prismaClient.conversation.findUnique({
        where: { id },
        include: {
          messages: {
            orderBy: {
              timestamp: 'asc'
            }
          }
        }
      })
      
      if (!conversation) {
        this.logger.warn('Conversation not found', { id })
        return {
          success: false,
          error: 'Conversation not found'
        }
      }
      
      const result = {
        ...conversation,
        projectId: conversation.projectId || undefined,
        messages: conversation.messages.map(msg => ({
          id: msg.id,
          role: msg.role as 'user' | 'assistant' | 'system',
          content: msg.content,
          timestamp: msg.timestamp,
          metadata: msg.metadata ? JSON.parse(msg.metadata) : undefined
        }))
      }
      
      this.logger.success('Retrieved conversation', { id, title: result.title })
      return {
        success: true,
        data: result
      }
    } catch (error) {
      this.logger.error('Failed to get conversation by ID', error as Error, { id })
      return {
        success: false,
        error: 'Failed to retrieve conversation'
      }
    }
  }

  async createConversation(data: ICreateConversationData): Promise<IServiceResponse<IConversation>> {
    try {
      validateConversationData(data)
      this.logger.debug('Creating new conversation', { id: data.id, title: data.title })
      
      const conversation = await this.prismaClient.conversation.create({
        data: {
          id: data.id,
          title: data.title,
          model: data.model,
          provider: data.provider,
          projectId: data.projectId
        },
        include: {
          messages: true
        }
      })
      
      const result = {
        ...conversation,
        projectId: conversation.projectId || undefined,
        messages: conversation.messages.map(msg => ({
          id: msg.id,
          role: msg.role as 'user' | 'assistant' | 'system',
          content: msg.content,
          timestamp: msg.timestamp,
          metadata: msg.metadata ? JSON.parse(msg.metadata) : undefined
        }))
      }
      
      this.logger.success('Created conversation', { id: result.id, title: result.title })
      return {
        success: true,
        data: result
      }
    } catch (error) {
      this.logger.error('Failed to create conversation', error as Error, data)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create conversation'
      }
    }
  }

  async updateConversation(id: string, updates: IUpdateConversationData): Promise<IServiceResponse<IConversation>> {
    try {
      this.logger.debug('Updating conversation', { id, updates })
      
      const updateData: any = { ...updates }
      // Remove messages from update data as they are now in separate table
      delete updateData.messages
      
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
      })
      
      const result = {
        ...conversation,
        projectId: conversation.projectId || undefined,
        messages: conversation.messages.map(msg => ({
          id: msg.id,
          role: msg.role as 'user' | 'assistant' | 'system',
          content: msg.content,
          timestamp: msg.timestamp,
          metadata: msg.metadata ? JSON.parse(msg.metadata) : undefined
        }))
      }
      
      this.logger.success('Updated conversation', { id, title: result.title })
      return {
        success: true,
        data: result
      }
    } catch (error) {
      this.logger.error('Failed to update conversation', error as Error, { id, updates })
      return {
        success: false,
        error: 'Failed to update conversation'
      }
    }
  }

  async deleteConversation(id: string): Promise<IServiceResponse<boolean>> {
    try {
      this.logger.debug('Deleting conversation', { id })
      
      await this.prismaClient.conversation.delete({
        where: { id }
      })
      
      this.logger.success('Deleted conversation', { id })
      return {
        success: true,
        data: true
      }
    } catch (error) {
      this.logger.error('Failed to delete conversation', error as Error, { id })
      return {
        success: false,
        error: 'Failed to delete conversation'
      }
    }
  }

  // Message Operations
  async createMessage(data: {
    conversationId: string
    role: string
    content: string
    metadata?: any
  }): Promise<IServiceResponse<any>> {
    try {
      this.logger.debug('Creating message', { conversationId: data.conversationId, role: data.role })
      
      const message = await this.prismaClient.message.create({
        data: {
          conversationId: data.conversationId,
          role: data.role,
          content: data.content,
          metadata: data.metadata ? JSON.stringify(data.metadata) : null
        }
      })
      
      const result = {
        ...message,
        metadata: message.metadata ? JSON.parse(message.metadata) : undefined
      }
      
      this.logger.success('Created message', { id: result.id, conversationId: data.conversationId })
      return {
        success: true,
        data: result
      }
    } catch (error) {
      this.logger.error('Failed to create message', error as Error, data)
      return {
        success: false,
        error: 'Failed to create message'
      }
    }
  }

  // AI Provider Operations
  async getAIProviders(): Promise<IServiceResponse<IAIProvider[]>> {
    try {
      this.logger.debug('Fetching all AI providers')
      
      const providers = await this.prismaClient.aIProvider.findMany({
        include: {
          models: true
        },
        orderBy: {
          name: 'asc'
        }
      })
      
      const result = providers.map(provider => ({
        ...provider,
        type: provider.type as 'local' | 'api',
        lastTestResult: provider.lastTestResult as 'success' | 'error' | null,
        config: provider.config ? JSON.parse(provider.config) : null
      }))
      
      this.logger.success(`Retrieved ${result.length} AI providers`)
      return {
        success: true,
        data: result
      }
    } catch (error) {
      this.logger.error('Failed to get AI providers', error as Error)
      return {
        success: false,
        error: 'Failed to retrieve AI providers'
      }
    }
  }

  async createAIProvider(data: ICreateAIProviderData): Promise<IServiceResponse<IAIProvider>> {
    try {
      validateAIProviderData(data)
      this.logger.debug('Creating new AI provider', { name: data.name, type: data.type })
      
      const provider = await this.prismaClient.aIProvider.create({
        data: {
          name: data.name,
          type: data.type,
          apiKey: data.apiKey,
          isActive: data.isActive,
          isConnected: data.isConnected,
          config: data.config ? JSON.stringify(data.config) : null
        }
      })
      
      const result = {
        ...provider,
        type: provider.type as 'local' | 'api',
        lastTestResult: provider.lastTestResult as 'success' | 'error' | null,
        config: provider.config ? JSON.parse(provider.config) : null
      }
      
      this.logger.success('Created AI provider', { id: result.id, name: result.name })
      return {
        success: true,
        data: result
      }
    } catch (error) {
      this.logger.error('Failed to create AI provider', error as Error, data)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create AI provider'
      }
    }
  }

  async updateAIProvider(id: string, updates: IUpdateAIProviderData): Promise<IServiceResponse<IAIProvider>> {
    try {
      this.logger.debug('Updating AI provider', { id, updates })
      
      const updateData: any = { ...updates }
      if (updateData.config) {
        updateData.config = JSON.stringify(updateData.config)
      }
      
      const provider = await this.prismaClient.aIProvider.update({
        where: { id },
        data: updateData
      })
      
      const result = {
        ...provider,
        type: provider.type as 'local' | 'api',
        lastTestResult: provider.lastTestResult as 'success' | 'error' | null,
        config: provider.config ? JSON.parse(provider.config) : null
      }
      
      this.logger.success('Updated AI provider', { id, name: result.name })
      return {
        success: true,
        data: result
      }
    } catch (error) {
      this.logger.error('Failed to update AI provider', error as Error, { id, updates })
      return {
        success: false,
        error: 'Failed to update AI provider'
      }
    }
  }

  // AI Model Operations
  async getAIModels(providerId?: string): Promise<IServiceResponse<IAIModel[]>> {
    try {
      this.logger.debug('Fetching AI models', { providerId })
      
      const where = providerId ? { providerId } : {}
      const models = await this.prismaClient.aIModel.findMany({
        where,
        orderBy: {
          modelName: 'asc'
        }
      })
      
      const result = models.map(model => ({
        ...model,
        metadata: model.metadata ? JSON.parse(model.metadata) : null
      }))
      
      this.logger.success(`Retrieved ${result.length} AI models`)
      return {
        success: true,
        data: result
      }
    } catch (error) {
      this.logger.error('Failed to get AI models', error as Error, { providerId })
      return {
        success: false,
        error: 'Failed to retrieve AI models'
      }
    }
  }

  async createOrUpdateAIModel(data: any): Promise<IServiceResponse<IAIModel>> {
    try {
      validateAIModelData(data)
      this.logger.debug('Creating or updating AI model', { 
        providerId: data.providerId, 
        modelId: data.modelId 
      })
      
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
      })
      
      const result = {
        ...model,
        metadata: model.metadata ? JSON.parse(model.metadata) : null
      }
      
      this.logger.success('Created/updated AI model', { 
        id: result.id, 
        modelName: result.modelName 
      })
      return {
        success: true,
        data: result
      }
    } catch (error) {
      this.logger.error('Failed to create/update AI model', error as Error, data)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create/update AI model'
      }
    }
  }

  async deleteAIModels(providerId: string): Promise<IServiceResponse<boolean>> {
    try {
      this.logger.debug('Deleting AI models for provider', { providerId })
      
      await this.prismaClient.aIModel.deleteMany({
        where: { providerId }
      })
      
      this.logger.success('Deleted AI models for provider', { providerId })
      return {
        success: true,
        data: true
      }
    } catch (error) {
      this.logger.error('Failed to delete AI models', error as Error, { providerId })
      return {
        success: false,
        error: 'Failed to delete AI models'
      }
    }
  }

  // App Settings Operations
  async getSetting(key: string): Promise<IServiceResponse<string | null>> {
    try {
      this.logger.debug('Getting setting', { key })
      
      const setting = await this.prismaClient.appSetting.findUnique({
        where: { key }
      })
      
      const result = setting ? setting.value : null
      this.logger.success('Retrieved setting', { key, hasValue: !!result })
      return {
        success: true,
        data: result
      }
    } catch (error) {
      this.logger.error('Failed to get setting', error as Error, { key })
      return {
        success: false,
        error: 'Failed to retrieve setting'
      }
    }
  }

  async setSetting(key: string, value: string, category?: string): Promise<IServiceResponse<IAppSetting>> {
    try {
      const data = { key, value, category }
      validateSettingData(data)
      this.logger.debug('Setting value', { key, category })
      
      const setting = await this.prismaClient.appSetting.upsert({
        where: { key },
        update: { value, category },
        create: { key, value, category }
      })
      
      this.logger.success('Set setting', { key, category })
      return {
        success: true,
        data: setting
      }
    } catch (error) {
      this.logger.error('Failed to set setting', error as Error, { key, category })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to set setting'
      }
    }
  }

  async getSettings(category?: string): Promise<IServiceResponse<IAppSetting[]>> {
    try {
      this.logger.debug('Getting settings', { category })
      
      const where = category ? { category } : {}
      const settings = await this.prismaClient.appSetting.findMany({
        where,
        orderBy: { key: 'asc' }
      })
      
      this.logger.success(`Retrieved ${settings.length} settings`)
      return {
        success: true,
        data: settings
      }
    } catch (error) {
      this.logger.error('Failed to get settings', error as Error, { category })
      return {
        success: false,
        error: 'Failed to retrieve settings'
      }
    }
  }

  // Health Check
  async healthCheck(): Promise<IServiceResponse<boolean>> {
    try {
      await this.prismaClient.$queryRaw`SELECT 1`
      this.logger.success('Database health check passed')
      return {
        success: true,
        data: true
      }
    } catch (error) {
      this.logger.error('Database health check failed', error as Error)
      return {
        success: false,
        error: 'Database connection failed'
      }
    }
  }

  // Auth Token Operations
  async getAuthTokens(provider: string): Promise<IServiceResponse<any[]>> {
    try {
      this.logger.debug('Fetching auth tokens', { provider })
      
      const tokens = await this.prismaClient.authToken.findMany({
        where: { provider },
        orderBy: { createdAt: 'desc' }
      })
      
      this.logger.success(`Retrieved ${tokens.length} auth tokens for provider`, { provider })
      return {
        success: true,
        data: tokens
      }
    } catch (error) {
      this.logger.error('Failed to get auth tokens', error as Error, { provider })
      return {
        success: false,
        error: 'Failed to retrieve auth tokens'
      }
    }
  }

  async getAuthToken(provider: string, tokenType: string): Promise<IServiceResponse<any | null>> {
    try {
      this.logger.debug('Fetching auth token', { provider, tokenType })
      
      const token = await this.prismaClient.authToken.findUnique({
        where: {
          provider_tokenType: {
            provider,
            tokenType
          }
        }
      })
      
      this.logger.success('Retrieved auth token', { provider, tokenType, found: !!token })
      return {
        success: true,
        data: token
      }
    } catch (error) {
      this.logger.error('Failed to get auth token', error as Error, { provider, tokenType })
      return {
        success: false,
        error: 'Failed to retrieve auth token'
      }
    }
  }

  async storeAuthToken(data: {
    provider: string
    tokenType: string
    accessToken: string
    refreshToken?: string
    expiresAt?: Date
  }): Promise<IServiceResponse<any>> {
    try {
      this.logger.debug('Storing auth token', { provider: data.provider, tokenType: data.tokenType })
      
      const token = await this.prismaClient.authToken.upsert({
        where: {
          provider_tokenType: {
            provider: data.provider,
            tokenType: data.tokenType
          }
        },
        update: {
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          expiresAt: data.expiresAt
        },
        create: {
          provider: data.provider,
          tokenType: data.tokenType,
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          expiresAt: data.expiresAt
        }
      })
      
      this.logger.success('Stored auth token', { id: token.id, provider: data.provider, tokenType: data.tokenType })
      return {
        success: true,
        data: token
      }
    } catch (error) {
      this.logger.error('Failed to store auth token', error as Error, data)
      return {
        success: false,
        error: 'Failed to store auth token'
      }
    }
  }

  async deleteAuthTokens(provider: string): Promise<IServiceResponse<boolean>> {
    try {
      this.logger.debug('Deleting auth tokens', { provider })
      
      await this.prismaClient.authToken.deleteMany({
        where: { provider }
      })
      
      this.logger.success('Deleted auth tokens', { provider })
      return {
        success: true,
        data: true
      }
    } catch (error) {
      this.logger.error('Failed to delete auth tokens', error as Error, { provider })
      return {
        success: false,
        error: 'Failed to delete auth tokens'
      }
    }
  }

  // User Profile Operations
  async getUserProfile(provider: string, providerId: string): Promise<IServiceResponse<any | null>> {
    try {
      this.logger.debug('Fetching user profile', { provider, providerId })
      
      const profile = await this.prismaClient.userProfile.findUnique({
        where: {
          provider_providerId: {
            provider,
            providerId
          }
        }
      })
      
      this.logger.success('Retrieved user profile', { provider, providerId, found: !!profile })
      return {
        success: true,
        data: profile
      }
    } catch (error) {
      this.logger.error('Failed to get user profile', error as Error, { provider, providerId })
      return {
        success: false,
        error: 'Failed to retrieve user profile'
      }
    }
  }

  async storeUserProfile(data: {
    provider: string
    providerId: string
    email: string
    name?: string
    pictureUrl?: string
    metadata?: any
  }): Promise<IServiceResponse<any>> {
    try {
      this.logger.debug('Storing user profile', { provider: data.provider, email: data.email })
      
      const profile = await this.prismaClient.userProfile.upsert({
        where: {
          provider_providerId: {
            provider: data.provider,
            providerId: data.providerId
          }
        },
        update: {
          email: data.email,
          name: data.name,
          pictureUrl: data.pictureUrl,
          metadata: data.metadata ? JSON.stringify(data.metadata) : null,
          isActive: true
        },
        create: {
          provider: data.provider,
          providerId: data.providerId,
          email: data.email,
          name: data.name,
          pictureUrl: data.pictureUrl,
          metadata: data.metadata ? JSON.stringify(data.metadata) : null,
          isActive: true
        }
      })
      
      this.logger.success('Stored user profile', { id: profile.id, provider: data.provider, email: data.email })
      return {
        success: true,
        data: {
          ...profile,
          metadata: profile.metadata ? JSON.parse(profile.metadata) : null
        }
      }
    } catch (error) {
      this.logger.error('Failed to store user profile', error as Error, data)
      return {
        success: false,
        error: 'Failed to store user profile'
      }
    }
  }

  async getActiveUserProfiles(): Promise<IServiceResponse<any[]>> {
    try {
      this.logger.debug('Fetching active user profiles')
      
      const profiles = await this.prismaClient.userProfile.findMany({
        where: { isActive: true },
        orderBy: { createdAt: 'asc' }
      })
      
      const result = profiles.map(profile => ({
        ...profile,
        metadata: profile.metadata ? JSON.parse(profile.metadata) : null
      }))
      
      this.logger.success(`Retrieved ${result.length} active user profiles`)
      return {
        success: true,
        data: result
      }
    } catch (error) {
      this.logger.error('Failed to get active user profiles', error as Error)
      return {
        success: false,
        error: 'Failed to retrieve user profiles'
      }
    }
  }

  async deactivateUserProfile(provider: string, providerId: string): Promise<IServiceResponse<boolean>> {
    try {
      this.logger.debug('Deactivating user profile', { provider, providerId })
      
      await this.prismaClient.userProfile.update({
        where: {
          provider_providerId: {
            provider,
            providerId
          }
        },
        data: { isActive: false }
      })
      
      this.logger.success('Deactivated user profile', { provider, providerId })
      return {
        success: true,
        data: true
      }
    } catch (error) {
      this.logger.error('Failed to deactivate user profile', error as Error, { provider, providerId })
      return {
        success: false,
        error: 'Failed to deactivate user profile'
      }
    }
  }

  // Cleanup
  async disconnect(): Promise<void> {
    try {
      await this.prismaClient.$disconnect()
      this.logger.info('Database connection closed')
    } catch (error) {
      this.logger.error('Failed to close database connection', error as Error)
    }
  }
}