// Handlers Index - Export all IPC handlers and provide a unified setup

export { ConversationHandler } from './conversation.handler'
export { AIProviderHandler } from './aiProvider.handler'
export { DatabaseHandler } from './database.handler'
export { ChatHandler } from './chat.handler'
export { AuthHandler } from './auth.handler'
export { HydraulicHandler } from './hydraulic.handler'
export { setupWNTRHandlers } from './wntr.handler'
export { registerWisdomHandlers, registerVectorGraphHandlers } from './document.handler'
export { NetworkRepositoryHandler } from './networkRepository.handler'
export { registerAgenticRAGHandlers } from './agenticRAG.handler'

import { ServiceContainer } from '../../backend/services'
import { ConversationHandler } from './conversation.handler'
import { AIProviderHandler } from './aiProvider.handler'
import { DatabaseHandler } from './database.handler'
import { ChatHandler } from './chat.handler'
import { AuthHandler } from './auth.handler'
import { HydraulicHandler } from './hydraulic.handler'
import { setupWNTRHandlers } from './wntr.handler'
import { registerWisdomHandlers, registerVectorGraphHandlers } from './document.handler'
import { NetworkRepositoryHandler } from './networkRepository.handler'
import { registerAgenticRAGHandlers } from './agenticRAG.handler'
import { registerMilvusHandlers } from './milvus.handler'
import { createLogger } from '../../backend/utils/logger'

const logger = createLogger('HandlersManager')

export class HandlersManager {
  private conversationHandler: ConversationHandler
  private aiProviderHandler: AIProviderHandler
  private databaseHandler: DatabaseHandler
  private chatHandler: ChatHandler
  private authHandler: AuthHandler
  private hydraulicHandler: HydraulicHandler
  private networkRepositoryHandler: NetworkRepositoryHandler
  private isInitialized = false

  constructor(services: ServiceContainer) {
    logger.info('Initializing IPC handlers manager')

    this.conversationHandler = new ConversationHandler(services.conversation)
    this.aiProviderHandler = new AIProviderHandler(services.aiProvider)
    this.databaseHandler = new DatabaseHandler(services.database)
    this.chatHandler = new ChatHandler(services.database)
    this.authHandler = new AuthHandler(services.database)
    this.hydraulicHandler = new HydraulicHandler(services)
    this.networkRepositoryHandler = new NetworkRepositoryHandler(services.database.prisma)

    // Setup WNTR handlers
    setupWNTRHandlers()

    // Setup wisdom handlers
    try {
      registerWisdomHandlers(services.database.prisma)
      registerVectorGraphHandlers(services.database.prisma)
    } catch (error) {
      logger.warn('Wisdom handlers registration failed, continuing without RAG support', error as Error)
    }

    // Setup agentic RAG handlers
    try {
      logger.info('Attempting to register agentic RAG handlers...')
      registerAgenticRAGHandlers(services.database.prisma)
      logger.success('Agentic RAG handlers registered successfully')
    } catch (error) {
      logger.error('Agentic RAG handlers registration failed', error as Error)
      logger.warn('Continuing without agentic RAG support')
    }

    // Setup Milvus handlers
    try {
      registerMilvusHandlers()
      logger.info('Milvus handlers registered')
    } catch (error) {
      logger.warn('Milvus handlers registration failed', error as Error)
    }

    this.isInitialized = true
    logger.success('IPC handlers manager initialized successfully')
  }

  // Get individual handlers (if needed for specific operations)
  get conversation(): ConversationHandler {
    return this.conversationHandler
  }

  get aiProvider(): AIProviderHandler {
    return this.aiProviderHandler
  }

  get database(): DatabaseHandler {
    return this.databaseHandler
  }

  get chat(): ChatHandler {
    return this.chatHandler
  }

  get auth(): AuthHandler {
    return this.authHandler
  }

  get hydraulic(): HydraulicHandler {
    return this.hydraulicHandler
  }

  get networkRepository(): NetworkRepositoryHandler {
    return this.networkRepositoryHandler
  }

  // Check if handlers are initialized
  get initialized(): boolean {
    return this.isInitialized
  }

  // Cleanup method to unregister all handlers
  cleanup(): void {
    if (!this.isInitialized) {
      logger.warn('Handlers manager not initialized, skipping cleanup')
      return
    }

    logger.info('Cleaning up IPC handlers')

    try {
      this.conversationHandler.unregisterHandlers()
      this.aiProviderHandler.unregisterHandlers()
      this.databaseHandler.unregisterHandlers()
      this.chatHandler.unregisterHandlers()
      this.hydraulicHandler.cleanup()
      this.networkRepositoryHandler.cleanup()
      // Note: AuthHandler doesn't have unregisterHandlers method yet

      this.isInitialized = false
      logger.success('IPC handlers cleaned up successfully')
    } catch (error) {
      logger.error('Error during handlers cleanup', error as Error)
    }
  }

  // Health check for all handlers
  async healthCheck(): Promise<{ [key: string]: boolean }> {
    const results: { [key: string]: boolean } = {}

    try {
      results.conversationHandler = this.conversationHandler ? true : false
      results.aiProviderHandler = this.aiProviderHandler ? true : false
      results.databaseHandler = this.databaseHandler ? true : false
      results.chatHandler = this.chatHandler ? true : false
      results.authHandler = this.authHandler ? true : false
      results.hydraulicHandler = this.hydraulicHandler ? true : false
      results.networkRepositoryHandler = this.networkRepositoryHandler ? true : false
      results.initialized = this.isInitialized

      logger.info('Handlers health check completed', results)
      return results
    } catch (error) {
      logger.error('Error during handlers health check', error as Error)
      return {
        conversationHandler: false,
        aiProviderHandler: false,
        databaseHandler: false,
        chatHandler: false,
        authHandler: false,
        hydraulicHandler: false,
        networkRepositoryHandler: false,
        initialized: false,
        error: true
      }
    }
  }
}