import type { PrismaClient } from '@prisma/client'

export interface NetworkData {
  name: string
  summary: {
    junctions: number
    tanks: number
    reservoirs: number
    pipes: number
    pumps: number
    valves: number
  }
  nodes: any[]
  links: any[]
  options: any
  coordinate_system?: {
    type: 'geographic' | 'projected' | 'unknown'
    bounds?: any
    epsg?: string
    units?: string
    possible_system?: string
    region_hint?: string
  }
}

export interface SavedNetwork {
  id: string
  projectId: string
  name: string
  description?: string
  filename: string
  summary: {
    junctions: number
    tanks: number
    reservoirs: number
    pipes: number
    pumps: number
    valves: number
  }
  coordinateSystem?: any
  version: string
  isActive: boolean
  lastLoaded?: Date
  createdAt: Date
  updatedAt: Date
}

export class NetworkRepositoryService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Save a network to the repository
   */
  async saveNetwork(
    projectId: string,
    networkData: NetworkData,
    fileContent: string,
    filename: string,
    description?: string
  ): Promise<SavedNetwork> {
    // Check if network with same name exists in project
    const existing = await this.prisma.hydraulicNetwork.findFirst({
      where: {
        projectId,
        name: networkData.name,
        isActive: true
      }
    })

    if (existing) {
      throw new Error(`Una red con el nombre "${networkData.name}" ya existe en este proyecto. Use actualizar() para modificarla.`)
    }

    const network = await this.prisma.hydraulicNetwork.create({
      data: {
        projectId,
        name: networkData.name,
        description,
        filename,
        fileContent,
        networkData: JSON.stringify(networkData),
        coordinateSystem: networkData.coordinate_system ? JSON.stringify(networkData.coordinate_system) : null,
        summary: JSON.stringify(networkData.summary),
        version: '1.0'
      }
    })

    return this.formatNetwork(network)
  }

  /**
   * Update an existing network
   */
  async updateNetwork(
    networkId: string,
    networkData: NetworkData,
    fileContent: string,
    filename: string,
    description?: string
  ): Promise<SavedNetwork> {
    const network = await this.prisma.hydraulicNetwork.update({
      where: { id: networkId },
      data: {
        name: networkData.name,
        description,
        filename,
        fileContent,
        networkData: JSON.stringify(networkData),
        coordinateSystem: networkData.coordinate_system ? JSON.stringify(networkData.coordinate_system) : null,
        summary: JSON.stringify(networkData.summary),
        version: '1.1', // Increment version
        updatedAt: new Date()
      }
    })

    return this.formatNetwork(network)
  }

  /**
   * Get all networks for a project
   */
  async getProjectNetworks(projectId: string): Promise<SavedNetwork[]> {
    const networks = await this.prisma.hydraulicNetwork.findMany({
      where: {
        projectId,
        isActive: true
      },
      orderBy: {
        updatedAt: 'desc'
      }
    })

    return networks.map(this.formatNetwork)
  }

  /**
   * Get a specific network by ID
   */
  async getNetwork(networkId: string): Promise<{ network: SavedNetwork; networkData: NetworkData; fileContent: string } | null> {
    const network = await this.prisma.hydraulicNetwork.findUnique({
      where: { id: networkId }
    })

    if (!network) return null

    const networkData = JSON.parse(network.networkData)
    
    return {
      network: this.formatNetwork(network),
      networkData,
      fileContent: network.fileContent
    }
  }

  /**
   * Load a network (mark as last loaded)
   */
  async loadNetwork(networkId: string): Promise<{ networkData: NetworkData; fileContent: string }> {
    const network = await this.prisma.hydraulicNetwork.update({
      where: { id: networkId },
      data: {
        lastLoaded: new Date()
      }
    })

    const networkData = JSON.parse(network.networkData)
    
    return {
      networkData,
      fileContent: network.fileContent
    }
  }

  /**
   * Delete a network
   */
  async deleteNetwork(networkId: string): Promise<void> {
    await this.prisma.hydraulicNetwork.update({
      where: { id: networkId },
      data: {
        isActive: false
      }
    })
  }

  /**
   * Save simulation results for a network
   */
  async saveSimulationResults(networkId: string, results: any): Promise<void> {
    await this.prisma.hydraulicNetwork.update({
      where: { id: networkId },
      data: {
        simulationResults: JSON.stringify(results),
        updatedAt: new Date()
      }
    })
  }

  /**
   * Search networks by name across projects
   */
  async searchNetworks(query: string, projectId?: string): Promise<SavedNetwork[]> {
    const where: any = {
      isActive: true,
      name: {
        contains: query,
        mode: 'insensitive'
      }
    }

    if (projectId) {
      where.projectId = projectId
    }

    const networks = await this.prisma.hydraulicNetwork.findMany({
      where,
      orderBy: {
        updatedAt: 'desc'
      }
    })

    return networks.map(this.formatNetwork)
  }

  /**
   * Get network statistics for a project
   */
  async getProjectNetworkStats(projectId: string): Promise<{
    totalNetworks: number
    recentlyLoaded: number
    totalNodes: number
    totalLinks: number
  }> {
    const networks = await this.prisma.hydraulicNetwork.findMany({
      where: {
        projectId,
        isActive: true
      }
    })

    const recentlyLoaded = networks.filter(n => 
      n.lastLoaded && new Date().getTime() - n.lastLoaded.getTime() < 7 * 24 * 60 * 60 * 1000 // Last week
    ).length

    const totalNodes = networks.reduce((sum, network) => {
      const summary = JSON.parse(network.summary)
      return sum + (summary.junctions || 0) + (summary.tanks || 0) + (summary.reservoirs || 0)
    }, 0)

    const totalLinks = networks.reduce((sum, network) => {
      const summary = JSON.parse(network.summary)
      return sum + (summary.pipes || 0) + (summary.pumps || 0) + (summary.valves || 0)
    }, 0)

    return {
      totalNetworks: networks.length,
      recentlyLoaded,
      totalNodes,
      totalLinks
    }
  }

  private formatNetwork = (network: any): SavedNetwork => ({
    id: network.id,
    projectId: network.projectId,
    name: network.name,
    description: network.description,
    filename: network.filename,
    summary: JSON.parse(network.summary),
    coordinateSystem: network.coordinateSystem ? JSON.parse(network.coordinateSystem) : undefined,
    version: network.version,
    isActive: network.isActive,
    lastLoaded: network.lastLoaded,
    createdAt: network.createdAt,
    updatedAt: network.updatedAt
  })
}