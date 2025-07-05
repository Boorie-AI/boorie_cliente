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