// AI Provider IPC Handlers - Handle all AI provider and model related IPC communication

import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { AIProviderService } from '../../backend/services'
import { createLogger } from '../../backend/utils/logger'
import { ICreateAIProviderData, IUpdateAIProviderData } from '../../backend/models'

const logger = createLogger('AIProviderHandler')

export class AIProviderHandler {
  private aiProviderService: AIProviderService

  constructor(aiProviderService: AIProviderService) {
    this.aiProviderService = aiProviderService
    this.registerHandlers()
    logger.info('AI Provider IPC handlers registered')
  }

  private registerHandlers(): void {
    // Get all AI providers
    ipcMain.handle('db-get-ai-providers', async (event: IpcMainInvokeEvent) => {
      try {
        logger.debug('IPC: Getting AI providers')
        const result = await this.aiProviderService.getAllProviders()
        
        if (result.success) {
          logger.success(`IPC: Retrieved ${result.data?.length || 0} AI providers`)
          return result.data
        } else {
          logger.error('IPC: Failed to get AI providers', new Error(result.error))
          return []
        }
      } catch (error) {
        logger.error('IPC: Error in get-ai-providers handler', error as Error)
        return []
      }
    })

    // Get AI provider by ID
    ipcMain.handle('db-get-ai-provider', async (event: IpcMainInvokeEvent, id: string) => {
      try {
        logger.debug('IPC: Getting AI provider by ID', { id })
        const result = await this.aiProviderService.getProviderById(id)
        
        if (result.success) {
          logger.success('IPC: Retrieved AI provider', { id, name: result.data?.name })
          return result.data
        } else {
          logger.error('IPC: Failed to get AI provider', new Error(result.error), { id })
          return null
        }
      } catch (error) {
        logger.error('IPC: Error in get-ai-provider handler', error as Error, { id })
        return null
      }
    })

    // Create new AI provider
    ipcMain.handle('db-save-ai-provider', async (event: IpcMainInvokeEvent, data: ICreateAIProviderData) => {
      try {
        logger.debug('IPC: Creating AI provider', { name: data.name, type: data.type })
        const result = await this.aiProviderService.createProvider(data)
        
        if (result.success) {
          logger.success('IPC: Created AI provider', { 
            id: result.data?.id, 
            name: result.data?.name 
          })
          return result.data
        } else {
          logger.error('IPC: Failed to create AI provider', new Error(result.error), data)
          return null
        }
      } catch (error) {
        logger.error('IPC: Error in save-ai-provider handler', error as Error, data)
        return null
      }
    })

    // Update existing AI provider
    ipcMain.handle('db-update-ai-provider', async (event: IpcMainInvokeEvent, id: string, updates: IUpdateAIProviderData) => {
      try {
        logger.debug('IPC: Updating AI provider', { id, updates })
        const result = await this.aiProviderService.updateProvider(id, updates)
        
        if (result.success) {
          logger.success('IPC: Updated AI provider', { 
            id: result.data?.id, 
            name: result.data?.name 
          })
          return result.data
        } else {
          logger.error('IPC: Failed to update AI provider', new Error(result.error), { id, updates })
          return null
        }
      } catch (error) {
        logger.error('IPC: Error in update-ai-provider handler', error as Error, { id, updates })
        return null
      }
    })

    // Test AI provider connection
    ipcMain.handle('db-test-ai-provider', async (event: IpcMainInvokeEvent, id: string) => {
      try {
        logger.debug('IPC: Testing AI provider connection', { id })
        const result = await this.aiProviderService.testProviderConnection(id)
        
        if (result.success) {
          logger.success('IPC: AI provider connection test completed', { 
            id, 
            connected: result.data 
          })
          return {
            success: result.data,
            message: result.message
          }
        } else {
          logger.error('IPC: AI provider connection test failed', new Error(result.error), { id })
          return {
            success: false,
            message: result.error
          }
        }
      } catch (error) {
        logger.error('IPC: Error in test-ai-provider handler', error as Error, { id })
        return {
          success: false,
          message: 'Connection test failed'
        }
      }
    })

    // Get all AI models
    ipcMain.handle('db-get-ai-models', async (event: IpcMainInvokeEvent, providerId?: string) => {
      try {
        logger.debug('IPC: Getting AI models', { providerId })
        
        const result = providerId 
          ? await this.aiProviderService.getModelsForProvider(providerId)
          : await this.aiProviderService.getAllModels()
        
        if (result.success) {
          logger.success(`IPC: Retrieved ${result.data?.length || 0} AI models`, { providerId })
          return result.data
        } else {
          logger.error('IPC: Failed to get AI models', new Error(result.error), { providerId })
          return []
        }
      } catch (error) {
        logger.error('IPC: Error in get-ai-models handler', error as Error, { providerId })
        return []
      }
    })

    // Save/update AI model
    ipcMain.handle('db-save-ai-model', async (event: IpcMainInvokeEvent, data: any) => {
      try {
        logger.debug('IPC: Saving AI model', { 
          providerId: data.providerId, 
          modelId: data.modelId 
        })
        const result = await this.aiProviderService.saveModel(data)
        
        if (result.success) {
          logger.success('IPC: Saved AI model', { 
            id: result.data?.id, 
            modelName: result.data?.modelName 
          })
          return result.data
        } else {
          logger.error('IPC: Failed to save AI model', new Error(result.error), data)
          return null
        }
      } catch (error) {
        logger.error('IPC: Error in save-ai-model handler', error as Error, data)
        return null
      }
    })

    // Delete AI models for provider
    ipcMain.handle('db-delete-ai-models', async (event: IpcMainInvokeEvent, providerId: string) => {
      try {
        logger.debug('IPC: Deleting AI models for provider', { providerId })
        const result = await this.aiProviderService.deleteModelsForProvider(providerId)
        
        if (result.success) {
          logger.success('IPC: Deleted AI models for provider', { providerId })
          return true
        } else {
          logger.error('IPC: Failed to delete AI models', new Error(result.error), { providerId })
          return false
        }
      } catch (error) {
        logger.error('IPC: Error in delete-ai-models handler', error as Error, { providerId })
        return false
      }
    })

    // Refresh models for provider
    ipcMain.handle('db-refresh-ai-models', async (event: IpcMainInvokeEvent, providerId: string) => {
      try {
        logger.debug('IPC: Refreshing AI models for provider', { providerId })
        const result = await this.aiProviderService.refreshProviderModels(providerId)
        
        if (result.success) {
          logger.success('IPC: Refreshed AI models for provider', { 
            providerId, 
            modelCount: result.data?.length || 0 
          })
          return {
            success: true,
            data: result.data || []
          }
        } else {
          logger.error('IPC: Failed to refresh AI models', new Error(result.error), { providerId })
          return {
            success: false,
            error: result.error,
            data: []
          }
        }
      } catch (error) {
        logger.error('IPC: Error in refresh-ai-models handler', error as Error, { providerId })
        return {
          success: false,
          error: 'Failed to refresh models',
          data: []
        }
      }
    })
  }

  // Method to unregister handlers (useful for cleanup)
  unregisterHandlers(): void {
    const handlers = [
      'db-get-ai-providers',
      'db-get-ai-provider',
      'db-save-ai-provider',
      'db-update-ai-provider',
      'db-test-ai-provider',
      'db-get-ai-models',
      'db-save-ai-model',
      'db-delete-ai-models',
      'db-refresh-ai-models'
    ]

    handlers.forEach(handler => {
      ipcMain.removeAllListeners(handler)
    })

    logger.info('AI Provider IPC handlers unregistered')
  }
}