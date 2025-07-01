// Database IPC Handlers - Handle generic database operations and settings

import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { DatabaseService } from '../../backend/services'
import { createLogger } from '../../backend/utils/logger'

const logger = createLogger('DatabaseHandler')

export class DatabaseHandler {
  private databaseService: DatabaseService

  constructor(databaseService: DatabaseService) {
    this.databaseService = databaseService
    this.registerHandlers()
    logger.info('Database IPC handlers registered')
  }

  private registerHandlers(): void {
    // Get application setting
    ipcMain.handle('db-get-setting', async (event: IpcMainInvokeEvent, key: string) => {
      try {
        logger.debug('IPC: Getting setting', { key })
        const result = await this.databaseService.getSetting(key)
        
        if (result.success) {
          logger.success('IPC: Retrieved setting', { key, hasValue: !!result.data })
          return result.data
        } else {
          logger.error('IPC: Failed to get setting', new Error(result.error), { key })
          return null
        }
      } catch (error) {
        logger.error('IPC: Error in get-setting handler', error as Error, { key })
        return null
      }
    })

    // Set application setting
    ipcMain.handle('db-set-setting', async (
      event: IpcMainInvokeEvent, 
      key: string, 
      value: string, 
      category?: string
    ) => {
      try {
        logger.debug('IPC: Setting value', { key, category })
        const result = await this.databaseService.setSetting(key, value, category)
        
        if (result.success) {
          logger.success('IPC: Set setting', { key, category })
          return result.data
        } else {
          logger.error('IPC: Failed to set setting', new Error(result.error), { 
            key, 
            category 
          })
          return null
        }
      } catch (error) {
        logger.error('IPC: Error in set-setting handler', error as Error, { 
          key, 
          category 
        })
        return null
      }
    })

    // Get multiple settings
    ipcMain.handle('db-get-settings', async (event: IpcMainInvokeEvent, category?: string) => {
      try {
        logger.debug('IPC: Getting settings', { category })
        const result = await this.databaseService.getSettings(category)
        
        if (result.success) {
          logger.success(`IPC: Retrieved ${result.data?.length || 0} settings`, { category })
          return result.data
        } else {
          logger.error('IPC: Failed to get settings', new Error(result.error), { category })
          return []
        }
      } catch (error) {
        logger.error('IPC: Error in get-settings handler', error as Error, { category })
        return []
      }
    })

    // Generic raw SQL query (for backwards compatibility and special cases)
    ipcMain.handle('db-query', async (event: IpcMainInvokeEvent, sql: string, params: any[] = []) => {
      try {
        logger.debug('IPC: Executing raw query', { sql: sql.substring(0, 100) + '...' })
        logger.warn('Raw SQL query executed - consider using specific service methods', { sql })
        
        // This is a legacy method, we'll log it but still support it
        // In a production environment, you might want to restrict this
        const result = await this.databaseService.prisma.$queryRawUnsafe(sql, ...params)
        
        logger.success('IPC: Raw query executed successfully')
        return result
      } catch (error) {
        logger.error('IPC: Error in raw query handler', error as Error, { sql, params })
        throw error // Re-throw to maintain compatibility
      }
    })

    // Generic raw SQL execution (for backwards compatibility and special cases)
    ipcMain.handle('db-execute', async (event: IpcMainInvokeEvent, sql: string, params: any[] = []) => {
      try {
        logger.debug('IPC: Executing raw statement', { sql: sql.substring(0, 100) + '...' })
        logger.warn('Raw SQL execution - consider using specific service methods', { sql })
        
        // This is a legacy method, we'll log it but still support it
        // In a production environment, you might want to restrict this
        const result = await this.databaseService.prisma.$executeRawUnsafe(sql, ...params)
        
        logger.success('IPC: Raw statement executed successfully')
        return result
      } catch (error) {
        logger.error('IPC: Error in raw execute handler', error as Error, { sql, params })
        throw error // Re-throw to maintain compatibility
      }
    })

    // Database health check
    ipcMain.handle('db-health-check', async (event: IpcMainInvokeEvent) => {
      try {
        logger.debug('IPC: Performing database health check')
        const result = await this.databaseService.healthCheck()
        
        if (result.success) {
          logger.success('IPC: Database health check passed')
          return {
            healthy: true,
            message: 'Database connection is healthy'
          }
        } else {
          logger.error('IPC: Database health check failed', new Error(result.error))
          return {
            healthy: false,
            message: result.error || 'Database health check failed'
          }
        }
      } catch (error) {
        logger.error('IPC: Error in health check handler', error as Error)
        return {
          healthy: false,
          message: 'Health check error'
        }
      }
    })

    // Database statistics
    ipcMain.handle('db-get-stats', async (event: IpcMainInvokeEvent) => {
      try {
        logger.debug('IPC: Getting database statistics')
        
        // Get counts from each table
        const [conversations, providers, models, settings] = await Promise.all([
          this.databaseService.getConversations(),
          this.databaseService.getAIProviders(),
          this.databaseService.getAIModels(),
          this.databaseService.getSettings()
        ])
        
        const stats = {
          conversations: conversations.success ? conversations.data?.length || 0 : 0,
          aiProviders: providers.success ? providers.data?.length || 0 : 0,
          aiModels: models.success ? models.data?.length || 0 : 0,
          settings: settings.success ? settings.data?.length || 0 : 0,
          timestamp: new Date().toISOString()
        }
        
        logger.success('IPC: Retrieved database statistics', stats)
        return stats
      } catch (error) {
        logger.error('IPC: Error in get-stats handler', error as Error)
        return {
          conversations: 0,
          aiProviders: 0,
          aiModels: 0,
          settings: 0,
          timestamp: new Date().toISOString(),
          error: 'Failed to retrieve statistics'
        }
      }
    })
  }

  // Method to unregister handlers (useful for cleanup)
  unregisterHandlers(): void {
    const handlers = [
      'db-get-setting',
      'db-set-setting',
      'db-get-settings',
      'db-query',
      'db-execute',
      'db-health-check',
      'db-get-stats'
    ]

    handlers.forEach(handler => {
      ipcMain.removeAllListeners(handler)
    })

    logger.info('Database IPC handlers unregistered')
  }
}