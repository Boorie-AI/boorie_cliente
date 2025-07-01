// Conversation IPC Handlers - Handle all conversation-related IPC communication

import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { ConversationService } from '../../backend/services'
import { createLogger } from '../../backend/utils/logger'
import { ICreateConversationData, IUpdateConversationData, IMessage } from '../../backend/models'

const logger = createLogger('ConversationHandler')

export class ConversationHandler {
  private conversationService: ConversationService

  constructor(conversationService: ConversationService) {
    this.conversationService = conversationService
    this.registerHandlers()
    logger.info('Conversation IPC handlers registered')
  }

  private registerHandlers(): void {
    // Get all conversations
    ipcMain.handle('db-get-conversations', async (event: IpcMainInvokeEvent) => {
      try {
        logger.debug('IPC: Getting conversations')
        const result = await this.conversationService.getAllConversations()
        
        if (result.success) {
          logger.success(`IPC: Retrieved ${result.data?.length || 0} conversations`)
          return result.data
        } else {
          logger.error('IPC: Failed to get conversations', new Error(result.error))
          return []
        }
      } catch (error) {
        logger.error('IPC: Error in get-conversations handler', error as Error)
        return []
      }
    })

    // Get conversation by ID
    ipcMain.handle('db-get-conversation', async (event: IpcMainInvokeEvent, id: string) => {
      try {
        logger.debug('IPC: Getting conversation by ID', { id })
        const result = await this.conversationService.getConversationById(id)
        
        if (result.success) {
          logger.success('IPC: Retrieved conversation', { id, title: result.data?.title })
          return result.data
        } else {
          logger.error('IPC: Failed to get conversation', new Error(result.error), { id })
          return null
        }
      } catch (error) {
        logger.error('IPC: Error in get-conversation handler', error as Error, { id })
        return null
      }
    })

    // Create new conversation
    ipcMain.handle('db-save-conversation', async (event: IpcMainInvokeEvent, data: ICreateConversationData) => {
      try {
        logger.debug('IPC: Creating conversation', { id: data.id, title: data.title })
        const result = await this.conversationService.createConversation(data)
        
        if (result.success) {
          logger.success('IPC: Created conversation', { 
            id: result.data?.id, 
            title: result.data?.title 
          })
          return result.data
        } else {
          logger.error('IPC: Failed to create conversation', new Error(result.error), data)
          return null
        }
      } catch (error) {
        logger.error('IPC: Error in save-conversation handler', error as Error, data)
        return null
      }
    })

    // Update existing conversation
    ipcMain.handle('db-update-conversation', async (event: IpcMainInvokeEvent, id: string, updates: IUpdateConversationData) => {
      try {
        logger.debug('IPC: Updating conversation', { id, updates })
        const result = await this.conversationService.updateConversation(id, updates)
        
        if (result.success) {
          logger.success('IPC: Updated conversation', { 
            id: result.data?.id, 
            title: result.data?.title 
          })
          return result.data
        } else {
          logger.error('IPC: Failed to update conversation', new Error(result.error), { id, updates })
          return null
        }
      } catch (error) {
        logger.error('IPC: Error in update-conversation handler', error as Error, { id, updates })
        return null
      }
    })

    // Delete conversation
    ipcMain.handle('db-delete-conversation', async (event: IpcMainInvokeEvent, id: string) => {
      try {
        logger.debug('IPC: Deleting conversation', { id })
        const result = await this.conversationService.deleteConversation(id)
        
        if (result.success) {
          logger.success('IPC: Deleted conversation', { id })
          return true
        } else {
          logger.error('IPC: Failed to delete conversation', new Error(result.error), { id })
          return false
        }
      } catch (error) {
        logger.error('IPC: Error in delete-conversation handler', error as Error, { id })
        return false
      }
    })

    // Add message to conversation
    ipcMain.handle('db-add-message-to-conversation', async (
      event: IpcMainInvokeEvent, 
      conversationId: string, 
      message: Omit<IMessage, 'id' | 'timestamp'>
    ) => {
      try {
        logger.debug('IPC: Adding message to conversation', { 
          conversationId, 
          role: message.role 
        })
        const result = await this.conversationService.addMessageToConversation(conversationId, message)
        
        if (result.success) {
          logger.success('IPC: Added message to conversation', { 
            conversationId, 
            messageCount: result.data?.messages.length 
          })
          return result.data
        } else {
          logger.error('IPC: Failed to add message', new Error(result.error), { 
            conversationId, 
            message 
          })
          return null
        }
      } catch (error) {
        logger.error('IPC: Error in add-message-to-conversation handler', error as Error, { 
          conversationId, 
          message 
        })
        return null
      }
    })

    // Update conversation title
    ipcMain.handle('db-update-conversation-title', async (
      event: IpcMainInvokeEvent, 
      id: string, 
      title: string
    ) => {
      try {
        logger.debug('IPC: Updating conversation title', { id, title })
        const result = await this.conversationService.updateConversationTitle(id, title)
        
        if (result.success) {
          logger.success('IPC: Updated conversation title', { id, title })
          return result.data
        } else {
          logger.error('IPC: Failed to update title', new Error(result.error), { id, title })
          return null
        }
      } catch (error) {
        logger.error('IPC: Error in update-conversation-title handler', error as Error, { 
          id, 
          title 
        })
        return null
      }
    })

    // Update conversation model
    ipcMain.handle('db-update-conversation-model', async (
      event: IpcMainInvokeEvent, 
      id: string, 
      model: string, 
      provider: string
    ) => {
      try {
        logger.debug('IPC: Updating conversation model', { id, model, provider })
        const result = await this.conversationService.updateConversationModel(id, model, provider)
        
        if (result.success) {
          logger.success('IPC: Updated conversation model', { id, model, provider })
          return result.data
        } else {
          logger.error('IPC: Failed to update model', new Error(result.error), { 
            id, 
            model, 
            provider 
          })
          return null
        }
      } catch (error) {
        logger.error('IPC: Error in update-conversation-model handler', error as Error, { 
          id, 
          model, 
          provider 
        })
        return null
      }
    })
  }

  // Method to unregister handlers (useful for cleanup)
  unregisterHandlers(): void {
    const handlers = [
      'db-get-conversations',
      'db-get-conversation',
      'db-save-conversation',
      'db-update-conversation',
      'db-delete-conversation',
      'db-add-message-to-conversation',
      'db-update-conversation-title',
      'db-update-conversation-model'
    ]

    handlers.forEach(handler => {
      ipcMain.removeAllListeners(handler)
    })

    logger.info('Conversation IPC handlers unregistered')
  }
}