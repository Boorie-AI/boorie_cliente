import { ipcMain } from 'electron'
import { NetworkRepositoryService } from '../../backend/services/hydraulic/networkRepository'
import type { PrismaClient } from '@prisma/client'
import { appLogger } from '../../backend/utils/logger'

export class NetworkRepositoryHandler {
  private networkRepo: NetworkRepositoryService

  constructor(prisma: PrismaClient) {
    this.networkRepo = new NetworkRepositoryService(prisma)
    this.setupHandlers()
  }

  private setupHandlers() {
    // Save network to repository
    ipcMain.handle('network-repo:save', async (_, data: {
      projectId: string
      networkData: any
      fileContent: string
      filename: string
      description?: string
    }) => {
      try {
        appLogger.info('Saving network to repository', {
          projectId: data.projectId,
          networkName: data.networkData.name,
          filename: data.filename
        })

        const savedNetwork = await this.networkRepo.saveNetwork(
          data.projectId,
          data.networkData,
          data.fileContent,
          data.filename,
          data.description
        )

        appLogger.success('Network saved successfully', {
          networkId: savedNetwork.id,
          name: savedNetwork.name
        })

        return {
          success: true,
          data: savedNetwork
        }
      } catch (error) {
        appLogger.error('Failed to save network', error as Error)
        return {
          success: false,
          error: (error as Error).message
        }
      }
    })

    // Update existing network
    ipcMain.handle('network-repo:update', async (_, data: {
      networkId: string
      networkData: any
      fileContent: string
      filename: string
      description?: string
    }) => {
      try {
        const updatedNetwork = await this.networkRepo.updateNetwork(
          data.networkId,
          data.networkData,
          data.fileContent,
          data.filename,
          data.description
        )

        appLogger.success('Network updated successfully', {
          networkId: updatedNetwork.id,
          name: updatedNetwork.name
        })

        return {
          success: true,
          data: updatedNetwork
        }
      } catch (error) {
        appLogger.error('Failed to update network', error as Error)
        return {
          success: false,
          error: (error as Error).message
        }
      }
    })

    // Get networks for a project
    ipcMain.handle('network-repo:get-project-networks', async (_, projectId: string) => {
      try {
        const networks = await this.networkRepo.getProjectNetworks(projectId)

        return {
          success: true,
          data: networks
        }
      } catch (error) {
        appLogger.error('Failed to get project networks', error as Error)
        return {
          success: false,
          error: (error as Error).message
        }
      }
    })

    // Load network from repository
    ipcMain.handle('network-repo:load', async (_, networkId: string) => {
      try {
        appLogger.info('Loading network from repository', { networkId })

        const result = await this.networkRepo.loadNetwork(networkId)

        appLogger.success('Network loaded successfully', { networkId })

        return {
          success: true,
          data: result.networkData
        }
      } catch (error) {
        appLogger.error('Failed to load network', error as Error)
        return {
          success: false,
          error: (error as Error).message
        }
      }
    })

    // Get network details
    ipcMain.handle('network-repo:get', async (_, networkId: string) => {
      try {
        const result = await this.networkRepo.getNetwork(networkId)

        if (!result) {
          return {
            success: false,
            error: 'Red no encontrada'
          }
        }

        return {
          success: true,
          data: result
        }
      } catch (error) {
        appLogger.error('Failed to get network', error as Error)
        return {
          success: false,
          error: (error as Error).message
        }
      }
    })

    // Delete network
    ipcMain.handle('network-repo:delete', async (_, networkId: string) => {
      try {
        appLogger.info('Deleting network', { networkId })

        await this.networkRepo.deleteNetwork(networkId)

        appLogger.success('Network deleted successfully', { networkId })

        return {
          success: true
        }
      } catch (error) {
        appLogger.error('Failed to delete network', error as Error)
        return {
          success: false,
          error: (error as Error).message
        }
      }
    })

    // Save simulation results
    ipcMain.handle('network-repo:save-simulation', async (_, data: {
      networkId: string
      results: any
    }) => {
      try {
        await this.networkRepo.saveSimulationResults(data.networkId, data.results)

        return {
          success: true
        }
      } catch (error) {
        appLogger.error('Failed to save simulation results', error as Error)
        return {
          success: false,
          error: (error as Error).message
        }
      }
    })

    // Search networks
    ipcMain.handle('network-repo:search', async (_, data: {
      query: string
      projectId?: string
    }) => {
      try {
        const networks = await this.networkRepo.searchNetworks(data.query, data.projectId)

        return {
          success: true,
          data: networks
        }
      } catch (error) {
        appLogger.error('Failed to search networks', error as Error)
        return {
          success: false,
          error: (error as Error).message
        }
      }
    })

    // Get project network statistics
    ipcMain.handle('network-repo:stats', async (_, projectId: string) => {
      try {
        const stats = await this.networkRepo.getProjectNetworkStats(projectId)

        return {
          success: true,
          data: stats
        }
      } catch (error) {
        appLogger.error('Failed to get network stats', error as Error)
        return {
          success: false,
          error: (error as Error).message
        }
      }
    })
  }

  cleanup() {
    const handlers = [
      'network-repo:save',
      'network-repo:update',
      'network-repo:get-project-networks',
      'network-repo:load',
      'network-repo:get',
      'network-repo:delete',
      'network-repo:save-simulation',
      'network-repo:search',
      'network-repo:stats'
    ]

    handlers.forEach(handler => {
      ipcMain.removeAllListeners(handler)
    })
  }
}