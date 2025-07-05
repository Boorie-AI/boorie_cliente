import { ipcMain } from 'electron'
import { SystemPromptService } from '../../backend/services/systemPrompt.service'
import { ICreateSystemPromptData, IUpdateSystemPromptData } from '../../backend/models'
import { appLogger } from '../../backend/utils/logger'

export class SystemPromptHandler {
  constructor(private systemPromptService: SystemPromptService) {
    this.registerHandlers()
  }

  private registerHandlers(): void {
    // Get all system prompts
    ipcMain.handle('system-prompt-get-all', async () => {
      try {
        appLogger.info('IPC: system-prompt-get-all called')
        return await this.systemPromptService.getAllSystemPrompts()
      } catch (error) {
        appLogger.error('IPC: system-prompt-get-all failed', error as Error)
        return {
          success: false,
          error: 'Failed to get system prompts'
        }
      }
    })

    // Get active system prompts
    ipcMain.handle('system-prompt-get-active', async () => {
      try {
        appLogger.info('IPC: system-prompt-get-active called')
        return await this.systemPromptService.getActiveSystemPrompts()
      } catch (error) {
        appLogger.error('IPC: system-prompt-get-active failed', error as Error)
        return {
          success: false,
          error: 'Failed to get active system prompts'
        }
      }
    })

    // Get system prompt by ID
    ipcMain.handle('system-prompt-get-by-id', async (_, id: string) => {
      try {
        appLogger.info('IPC: system-prompt-get-by-id called', { id })
        return await this.systemPromptService.getSystemPromptById(id)
      } catch (error) {
        appLogger.error('IPC: system-prompt-get-by-id failed', error as Error)
        return {
          success: false,
          error: 'Failed to get system prompt'
        }
      }
    })

    // Get default system prompt
    ipcMain.handle('system-prompt-get-default', async () => {
      try {
        appLogger.info('IPC: system-prompt-get-default called')
        return await this.systemPromptService.getDefaultSystemPrompt()
      } catch (error) {
        appLogger.error('IPC: system-prompt-get-default failed', error as Error)
        return {
          success: false,
          error: 'Failed to get default system prompt'
        }
      }
    })

    // Create system prompt
    ipcMain.handle('system-prompt-create', async (_, data: ICreateSystemPromptData) => {
      try {
        appLogger.info('IPC: system-prompt-create called', { name: data.name })
        return await this.systemPromptService.createSystemPrompt(data)
      } catch (error) {
        appLogger.error('IPC: system-prompt-create failed', error as Error)
        return {
          success: false,
          error: 'Failed to create system prompt'
        }
      }
    })

    // Update system prompt
    ipcMain.handle('system-prompt-update', async (_, id: string, data: IUpdateSystemPromptData) => {
      try {
        appLogger.info('IPC: system-prompt-update called', { id, name: data.name })
        return await this.systemPromptService.updateSystemPrompt(id, data)
      } catch (error) {
        appLogger.error('IPC: system-prompt-update failed', error as Error)
        return {
          success: false,
          error: 'Failed to update system prompt'
        }
      }
    })

    // Delete system prompt
    ipcMain.handle('system-prompt-delete', async (_, id: string) => {
      try {
        appLogger.info('IPC: system-prompt-delete called', { id })
        return await this.systemPromptService.deleteSystemPrompt(id)
      } catch (error) {
        appLogger.error('IPC: system-prompt-delete failed', error as Error)
        return {
          success: false,
          error: 'Failed to delete system prompt'
        }
      }
    })

    // Set default system prompt
    ipcMain.handle('system-prompt-set-default', async (_, id: string) => {
      try {
        appLogger.info('IPC: system-prompt-set-default called', { id })
        return await this.systemPromptService.setDefaultSystemPrompt(id)
      } catch (error) {
        appLogger.error('IPC: system-prompt-set-default failed', error as Error)
        return {
          success: false,
          error: 'Failed to set default system prompt'
        }
      }
    })

    appLogger.success('System prompt IPC handlers registered')
  }

  unregisterHandlers(): void {
    // Remove all system prompt related IPC handlers
    ipcMain.removeAllListeners('system-prompt-get-all')
    ipcMain.removeAllListeners('system-prompt-get-active')
    ipcMain.removeAllListeners('system-prompt-get-by-id')
    ipcMain.removeAllListeners('system-prompt-get-default')
    ipcMain.removeAllListeners('system-prompt-create')
    ipcMain.removeAllListeners('system-prompt-update')
    ipcMain.removeAllListeners('system-prompt-delete')
    ipcMain.removeAllListeners('system-prompt-set-default')
    
    appLogger.info('System prompt IPC handlers unregistered')
  }
}