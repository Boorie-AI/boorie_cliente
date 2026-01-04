// Services Index - Export all backend services

export { DatabaseService } from './database.service'
export { ConversationService } from './conversation.service'
export { AIProviderService } from './aiProvider.service'

// Service factory for dependency injection
import { PrismaClient } from '@prisma/client'
import { DatabaseService } from './database.service'
import { ConversationService } from './conversation.service'
import { AIProviderService } from './aiProvider.service'
import { appLogger } from '../utils/logger'

export class ServiceContainer {
  private databaseService: DatabaseService
  private conversationService: ConversationService
  private aiProviderService: AIProviderService
  private logger = appLogger

  constructor(prismaClient: PrismaClient) {
    this.logger.info('Initializing service container')

    // Initialize services with dependency injection
    this.databaseService = new DatabaseService(prismaClient)
    this.conversationService = new ConversationService(this.databaseService)
    this.aiProviderService = new AIProviderService(this.databaseService)

    this.logger.success('Service container initialized successfully')
  }

  async initialize(): Promise<void> {
    this.logger.info('Initializing services async')

    // Initialize default providers (OpenAI, Anthropic, Nvidia, Ollama)
    await this.aiProviderService.initializeDefaultProviders()

    // Ensure default model exists
    const defaultModel = process.env.OLLAMA_MODEL || 'nemotron-3-nano'
    this.logger.info(`Ensuring default model ${defaultModel} exists...`)

    // Don't await this to avoid blocking app startup if model download takes time
    // But do log it clearly
    this.aiProviderService.ensureOllamaModel(defaultModel)
      .then(success => {
        if (success) {
          this.logger.success(`Default model ${defaultModel} is ready`)
        } else {
          this.logger.warn(`Default model ${defaultModel} is NOT available`)
        }
      })
      .catch(err => {
        this.logger.error(`Error checking default model ${defaultModel}`, err as Error)
      })
  }

  // Getters for services
  get database(): DatabaseService {
    return this.databaseService
  }

  get conversation(): ConversationService {
    return this.conversationService
  }

  get aiProvider(): AIProviderService {
    return this.aiProviderService
  }

  // Health check for all services
  async healthCheck(): Promise<{ [key: string]: boolean }> {
    const results: { [key: string]: boolean } = {}

    try {
      const dbHealth = await this.databaseService.healthCheck()
      results.database = dbHealth.success
    } catch (error) {
      this.logger.error('Database health check failed', error as Error)
      results.database = false
    }

    // Add other service health checks as needed
    results.conversation = true // No external dependencies
    results.aiProvider = true // No external dependencies

    this.logger.info('Health check completed', results)
    return results
  }

  // Cleanup method
  async cleanup(): Promise<void> {
    this.logger.info('Cleaning up services')

    try {
      await this.databaseService.disconnect()
      this.logger.success('Services cleaned up successfully')
    } catch (error) {
      this.logger.error('Error during service cleanup', error as Error)
    }
  }
}

// Legacy support function for embedding service
let sharedServiceContainer: ServiceContainer | null = null

export function getDatabaseService() {
  if (!sharedServiceContainer) {
    // Create a basic database service for legacy support
    const { PrismaClient } = require('@prisma/client')
    const prisma = new PrismaClient()
    sharedServiceContainer = new ServiceContainer(prisma)
  }

  return sharedServiceContainer.database
}