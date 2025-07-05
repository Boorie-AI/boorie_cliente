// Services Index - Export all backend services

export { DatabaseService } from './database.service'
export { ConversationService } from './conversation.service'
export { AIProviderService } from './aiProvider.service'
export { RAGService } from './rag.service'
export { DocumentParserService } from './document-parser.service'
export { EmbeddingService } from './embedding.service'

// Service factory for dependency injection
import { PrismaClient } from '@prisma/client'
import { BrowserWindow } from 'electron'
import { DatabaseService } from './database.service'
import { ConversationService } from './conversation.service'
import { AIProviderService } from './aiProvider.service'
import { RAGService } from './rag.service'
import { DocumentParserService } from './document-parser.service'
import { EmbeddingService } from './embedding.service'
import { appLogger } from '../utils/logger'

export class ServiceContainer {
  private databaseService: DatabaseService
  private conversationService: ConversationService
  private aiProviderService: AIProviderService
  private ragService: RAGService
  private documentParserService: DocumentParserService
  private embeddingService: EmbeddingService
  private logger = appLogger

  constructor(prismaClient: PrismaClient) {
    this.logger.info('Initializing service container')
    
    // Initialize services with dependency injection
    this.databaseService = new DatabaseService(prismaClient)
    this.conversationService = new ConversationService(this.databaseService)
    this.aiProviderService = new AIProviderService(this.databaseService)
    
    // Initialize RAG services
    this.documentParserService = new DocumentParserService()
    this.embeddingService = new EmbeddingService(this.databaseService)
    this.ragService = new RAGService(prismaClient, this.documentParserService, this.embeddingService)
    
    this.logger.success('Service container initialized successfully')
  }

  // Method to set main window for services that need it
  setMainWindow(mainWindow: BrowserWindow) {
    this.ragService.setMainWindow(mainWindow)
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

  get rag(): RAGService {
    return this.ragService
  }

  get documentParser(): DocumentParserService {
    return this.documentParserService
  }

  get embedding(): EmbeddingService {
    return this.embeddingService
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
    results.rag = true // No external dependencies
    results.documentParser = true // No external dependencies
    results.embedding = true // No external dependencies
    
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