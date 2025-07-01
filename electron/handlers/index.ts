// Handlers Index - Export all IPC handlers and provide a unified setup

export { ConversationHandler } from './conversation.handler'
export { AIProviderHandler } from './aiProvider.handler'
export { DatabaseHandler } from './database.handler'

import { ServiceContainer } from '../../backend/services'
import { ConversationHandler } from './conversation.handler'
import { AIProviderHandler } from './aiProvider.handler'
import { DatabaseHandler } from './database.handler'
import { createLogger } from '../../backend/utils/logger'

const logger = createLogger('HandlersManager')

export class HandlersManager {
  private conversationHandler: ConversationHandler
  private aiProviderHandler: AIProviderHandler
  private databaseHandler: DatabaseHandler
  private isInitialized = false

  constructor(services: ServiceContainer) {
    logger.info('Initializing IPC handlers manager')
    
    this.conversationHandler = new ConversationHandler(services.conversation)
    this.aiProviderHandler = new AIProviderHandler(services.aiProvider)
    this.databaseHandler = new DatabaseHandler(services.database)
    
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
      results.initialized = this.isInitialized
      
      logger.info('Handlers health check completed', results)
      return results
    } catch (error) {
      logger.error('Error during handlers health check', error as Error)
      return {
        conversationHandler: false,
        aiProviderHandler: false,
        databaseHandler: false,
        initialized: false,
        error: true
      }
    }
  }
}