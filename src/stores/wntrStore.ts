import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

// Import existing types
interface WNTRNode {
  id: string
  nodeType: 'junction' | 'reservoir' | 'tank'
  x: number
  y: number
  elevation?: number
  demand?: number
  head?: number
  pressure?: number
  [key: string]: any
}

interface WNTRLink {
  id: string
  linkType: 'pipe' | 'pump' | 'valve'
  startNode: string
  endNode: string
  length?: number
  diameter?: number
  roughness?: number
  flow?: number
  velocity?: number
  headloss?: number
  [key: string]: any
}

interface NetworkData {
  nodes: WNTRNode[]
  links: WNTRLink[]
  summary: {
    totalNodes: number
    totalLinks: number
    totalJunctions: number
    totalPipes: number
    totalPumps: number
    totalValves: number
    totalReservoirs: number
    totalTanks: number
  }
  coordinateSystem?: string
  bounds?: {
    minX: number
    maxX: number
    minY: number
    maxY: number
  }
}

interface SimulationResults {
  timestamp: string
  nodeResults: {
    [nodeId: string]: {
      head?: number
      pressure?: number
      demand?: number
      [parameter: string]: number | undefined
    }
  }
  linkResults: {
    [linkId: string]: {
      flow?: number
      velocity?: number
      headloss?: number
      [parameter: string]: number | undefined
    }
  }
  timesteps?: string[]
  metadata?: {
    simulationType: 'hydraulic' | 'quality'
    duration: number
    timeStep: number
    startTime: string
    endTime: string
  }
}

interface AnalysisResults {
  topology?: {
    connectedComponents: number
    bridges: string[]
    cutVertices: string[]
    networkDiameter: number
  }
  criticality?: {
    criticalNodes: Array<{ id: string, score: number }>
    criticalLinks: Array<{ id: string, score: number }>
  }
  resilience?: {
    overallScore: number
    redundancy: number
    reliability: number
    flexibility: number
  }
  [analysisType: string]: any
}

interface StoredNetwork {
  id: string
  name: string
  description?: string
  filePath: string
  fileName: string
  networkData: NetworkData
  createdAt: Date
  lastUsed: Date
  projectId?: string
  tags: string[]
  metadata: {
    fileSize?: number
    originalFormat?: string
    source?: 'file' | 'created' | 'imported'
    version?: string
  }
}

export interface WNTRState {
  // Network data
  currentNetwork: NetworkData | null
  currentNetworkId: string | null
  networkFilePath: string | null
  networkFileName: string | null

  // Network repository/depot
  storedNetworks: StoredNetwork[]
  networkHistory: NetworkData[]
  recentNetworkIds: string[]

  // Simulation state
  simulationResults: SimulationResults | null
  multipleSimulationResults: SimulationResults[]
  isSimulating: boolean
  simulationProgress: number
  simulationType: 'hydraulic' | 'quality' | null

  // Analysis state
  analysisResults: AnalysisResults
  isAnalyzing: boolean
  analysisProgress: number
  analysisType: string | null

  // Visualization state
  selectedNodes: Set<string>
  selectedLinks: Set<string>
  currentTimeStep: number
  maxTimeSteps: number
  selectedParameter: 'pressure' | 'flow' | 'velocity' | 'head' | 'demand' | 'headloss'
  selectedParameterType: 'node' | 'link'

  // Animation state
  isAnimating: boolean
  animationSpeed: number

  // Loading states
  isLoadingNetwork: boolean
  error: string | null

  // Network operations
  loadNetwork: (filePath?: string) => Promise<boolean>
  setNetworkData: (data: NetworkData, filePath?: string, fileName?: string) => void
  clearNetwork: () => void

  // Network repository operations
  saveNetworkToDepot: (name: string, description?: string, tags?: string[], projectId?: string) => string | null
  loadNetworkFromDepot: (networkId: string) => boolean
  deleteNetworkFromDepot: (networkId: string) => boolean
  updateNetworkInDepot: (networkId: string, updates: Partial<Pick<StoredNetwork, 'name' | 'description' | 'tags'>>) => boolean
  duplicateNetworkInDepot: (networkId: string, newName: string) => string | null
  getStoredNetworkById: (networkId: string) => StoredNetwork | null
  searchStoredNetworks: (query: string) => StoredNetwork[]
  getNetworksByProject: (projectId: string) => StoredNetwork[]
  getNetworksByTag: (tag: string) => StoredNetwork[]
  clearDepot: () => void

  // Bulk operations
  importNetworksFromFiles: (filePaths: string[]) => Promise<number>
  exportNetworkToFile: (networkId: string, exportPath?: string) => Promise<boolean>

  // Project integration
  saveCurrentNetworkToProject: (projectId: string, name: string, description?: string) => Promise<boolean>
  loadNetworkFromProject: (projectId: string) => Promise<boolean>
  syncWithProject: (projectId: string) => void

  // Simulation operations
  runSimulation: (type: 'hydraulic' | 'quality', options?: any) => Promise<boolean>
  setSimulationResults: (results: SimulationResults) => void
  addSimulationResults: (results: SimulationResults) => void
  clearSimulationResults: () => void

  // Analysis operations
  runAnalysis: (type: string, options?: any) => Promise<boolean>
  setAnalysisResults: (results: AnalysisResults) => void
  clearAnalysisResults: () => void

  // Selection operations
  selectNode: (nodeId: string, addToSelection?: boolean) => void
  selectLink: (linkId: string, addToSelection?: boolean) => void
  selectMultipleNodes: (nodeIds: string[]) => void
  selectMultipleLinks: (linkIds: string[]) => void
  clearSelection: () => void

  // Visualization operations
  setSelectedParameter: (parameter: 'pressure' | 'flow' | 'velocity' | 'head' | 'demand' | 'headloss', type: 'node' | 'link') => void
  setCurrentTimeStep: (step: number) => void
  nextTimeStep: () => void
  previousTimeStep: () => void

  // Animation operations
  startAnimation: () => void
  stopAnimation: () => void
  setAnimationSpeed: (speed: number) => void

  // Utility operations
  setError: (error: string | null) => void
  resetState: () => void
}

const initialState = {
  currentNetwork: null,
  currentNetworkId: null,
  networkFilePath: null,
  networkFileName: null,

  storedNetworks: [],
  networkHistory: [],
  recentNetworkIds: [],

  simulationResults: null,
  multipleSimulationResults: [],
  isSimulating: false,
  simulationProgress: 0,
  simulationType: null,

  analysisResults: {},
  isAnalyzing: false,
  analysisProgress: 0,
  analysisType: null,

  selectedNodes: new Set<string>(),
  selectedLinks: new Set<string>(),
  currentTimeStep: 0,
  maxTimeSteps: 0,
  selectedParameter: 'pressure' as const,
  selectedParameterType: 'node' as const,

  isAnimating: false,
  animationSpeed: 1,

  isLoadingNetwork: false,
  error: null,
}

export const useWNTRStore = create<WNTRState>()(
  devtools(
    (set, get) => ({
      ...initialState,

      // Network operations
      loadNetwork: async (filePath?: string) => {
        set({ isLoadingNetwork: true, error: null })

        try {
          console.log('🌊 [WNTR Store] Loading network...', filePath ? `from ${filePath}` : 'via dialog')

          let result
          if (filePath) {
            result = await window.electronAPI.wntr.loadINPFromPath(filePath)
          } else {
            result = await window.electronAPI.wntr.loadINPFile()
          }

          if (result.success && result.data) {
            const fileName = filePath ? filePath.split('/').pop() || 'network.inp' : result.fileName || 'network.inp'
            get().setNetworkData(result.data, filePath || result.filePath, fileName)
            console.log('✅ [WNTR Store] Network loaded successfully:', fileName)
            return true
          } else {
            set({ error: result.error || 'Failed to load network' })
            console.error('❌ [WNTR Store] Failed to load network:', result.error)
            return false
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          set({ error: errorMessage })
          console.error('❌ [WNTR Store] Error loading network:', error)
          return false
        } finally {
          set({ isLoadingNetwork: false })
        }
      },

      setNetworkData: (data: NetworkData, filePath?: string, fileName?: string) => {
        set(state => ({
          currentNetwork: data,
          networkFilePath: filePath || null,
          networkFileName: fileName || null,
          networkHistory: [...state.networkHistory, data].slice(-10), // Keep last 10 networks
          selectedNodes: new Set(),
          selectedLinks: new Set(),
          currentTimeStep: 0,
          maxTimeSteps: 0,
          error: null
        }))

        console.log('🌊 [WNTR Store] Network data set:', {
          nodes: data.nodes.length,
          links: data.links.length,
          fileName
        })
      },

      clearNetwork: () => {
        set({
          currentNetwork: null,
          currentNetworkId: null,
          networkFilePath: null,
          networkFileName: null,
          simulationResults: null,
          multipleSimulationResults: [],
          analysisResults: {},
          selectedNodes: new Set(),
          selectedLinks: new Set(),
          currentTimeStep: 0,
          maxTimeSteps: 0,
          error: null
        })
        console.log('🧹 [WNTR Store] Network cleared')
      },

      // Network repository operations
      saveNetworkToDepot: (name: string, description?: string, tags: string[] = [], projectId?: string) => {
        const { currentNetwork, networkFilePath, networkFileName } = get()

        if (!currentNetwork) {
          console.error('❌ [WNTR Store] No network loaded to save')
          return null
        }

        const networkId = `network_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        const now = new Date()

        const storedNetwork: StoredNetwork = {
          id: networkId,
          name: name,
          description: description || '',
          filePath: networkFilePath || '',
          fileName: networkFileName || 'unknown.inp',
          networkData: JSON.parse(JSON.stringify(currentNetwork)), // Deep clone
          createdAt: now,
          lastUsed: now,
          projectId: projectId,
          tags: tags,
          metadata: {
            source: networkFilePath ? 'file' : 'created',
            originalFormat: 'inp',
            version: '1.0'
          }
        }

        set(state => ({
          storedNetworks: [...state.storedNetworks, storedNetwork],
          currentNetworkId: networkId,
          recentNetworkIds: [networkId, ...state.recentNetworkIds.filter(id => id !== networkId)].slice(0, 10)
        }))

        console.log('💾 [WNTR Store] Network saved to depot:', { id: networkId, name })
        return networkId
      },

      loadNetworkFromDepot: (networkId: string) => {
        const { storedNetworks } = get()
        const storedNetwork = storedNetworks.find(net => net.id === networkId)

        if (!storedNetwork) {
          console.error('❌ [WNTR Store] Network not found in depot:', networkId)
          return false
        }

        // Update last used time
        set(state => ({
          storedNetworks: state.storedNetworks.map(net =>
            net.id === networkId
              ? { ...net, lastUsed: new Date() }
              : net
          ),
          currentNetwork: storedNetwork.networkData,
          currentNetworkId: networkId,
          networkFilePath: storedNetwork.filePath,
          networkFileName: storedNetwork.fileName,
          recentNetworkIds: [networkId, ...state.recentNetworkIds.filter(id => id !== networkId)].slice(0, 10),
          // Clear previous results when switching networks
          simulationResults: null,
          multipleSimulationResults: [],
          analysisResults: {},
          selectedNodes: new Set(),
          selectedLinks: new Set(),
          currentTimeStep: 0,
          maxTimeSteps: 0,
          error: null
        }))

        console.log('📂 [WNTR Store] Network loaded from depot:', { id: networkId, name: storedNetwork.name })
        return true
      },

      deleteNetworkFromDepot: (networkId: string) => {
        const { storedNetworks, currentNetworkId } = get()
        const networkExists = storedNetworks.some(net => net.id === networkId)

        if (!networkExists) {
          console.error('❌ [WNTR Store] Network not found for deletion:', networkId)
          return false
        }

        set(state => ({
          storedNetworks: state.storedNetworks.filter(net => net.id !== networkId),
          recentNetworkIds: state.recentNetworkIds.filter(id => id !== networkId),
          // Clear current network if it's the one being deleted
          ...(currentNetworkId === networkId ? {
            currentNetwork: null,
            currentNetworkId: null,
            networkFilePath: null,
            networkFileName: null,
            simulationResults: null,
            analysisResults: {},
            selectedNodes: new Set(),
            selectedLinks: new Set()
          } : {})
        }))

        console.log('🗑️ [WNTR Store] Network deleted from depot:', networkId)
        return true
      },

      updateNetworkInDepot: (networkId: string, updates: Partial<Pick<StoredNetwork, 'name' | 'description' | 'tags'>>) => {
        const { storedNetworks } = get()
        const networkExists = storedNetworks.some(net => net.id === networkId)

        if (!networkExists) {
          console.error('❌ [WNTR Store] Network not found for update:', networkId)
          return false
        }

        set(state => ({
          storedNetworks: state.storedNetworks.map(net =>
            net.id === networkId
              ? { ...net, ...updates, lastUsed: new Date() }
              : net
          )
        }))

        console.log('✏️ [WNTR Store] Network updated in depot:', { id: networkId, updates })
        return true
      },

      duplicateNetworkInDepot: (networkId: string, newName: string) => {
        const { storedNetworks } = get()
        const originalNetwork = storedNetworks.find(net => net.id === networkId)

        if (!originalNetwork) {
          console.error('❌ [WNTR Store] Network not found for duplication:', networkId)
          return null
        }

        const newNetworkId = `network_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        const now = new Date()

        const duplicatedNetwork: StoredNetwork = {
          ...originalNetwork,
          id: newNetworkId,
          name: newName,
          description: `Copy of ${originalNetwork.name}`,
          networkData: JSON.parse(JSON.stringify(originalNetwork.networkData)), // Deep clone
          createdAt: now,
          lastUsed: now,
          tags: [...originalNetwork.tags, 'copy']
        }

        set(state => ({
          storedNetworks: [...state.storedNetworks, duplicatedNetwork]
        }))

        console.log('📄 [WNTR Store] Network duplicated in depot:', { originalId: networkId, newId: newNetworkId, newName })
        return newNetworkId
      },

      getStoredNetworkById: (networkId: string) => {
        const { storedNetworks } = get()
        return storedNetworks.find(net => net.id === networkId) || null
      },

      searchStoredNetworks: (query: string) => {
        const { storedNetworks } = get()
        const lowercaseQuery = query.toLowerCase()

        return storedNetworks.filter(net =>
          net.name.toLowerCase().includes(lowercaseQuery) ||
          net.description?.toLowerCase().includes(lowercaseQuery) ||
          net.fileName.toLowerCase().includes(lowercaseQuery) ||
          net.tags.some(tag => tag.toLowerCase().includes(lowercaseQuery))
        )
      },

      getNetworksByProject: (projectId: string) => {
        const { storedNetworks } = get()
        return storedNetworks.filter(net => net.projectId === projectId)
      },

      getNetworksByTag: (tag: string) => {
        const { storedNetworks } = get()
        return storedNetworks.filter(net => net.tags.includes(tag))
      },

      clearDepot: () => {
        set({
          storedNetworks: [],
          recentNetworkIds: []
        })
        console.log('🧹 [WNTR Store] Network depot cleared')
      },

      // Bulk operations
      importNetworksFromFiles: async (filePaths: string[]) => {
        let successCount = 0

        for (const filePath of filePaths) {
          try {
            const result = await window.electronAPI.wntr.loadINPFromPath(filePath)
            if (result.success && result.data) {
              const fileName = filePath.split('/').pop() || 'network.inp'
              const networkName = fileName.replace('.inp', '')

              // Temporarily set network data to save it
              get().setNetworkData(result.data, filePath, fileName)
              const networkId = get().saveNetworkToDepot(networkName, `Imported from ${filePath}`, ['imported'])

              if (networkId) {
                successCount++
              }
            }
          } catch (error) {
            console.error('❌ [WNTR Store] Failed to import network:', filePath, error)
          }
        }

        console.log(`📥 [WNTR Store] Imported ${successCount}/${filePaths.length} networks`)
        return successCount
      },

      exportNetworkToFile: async (networkId: string, exportPath?: string) => {
        const storedNetwork = get().getStoredNetworkById(networkId)

        if (!storedNetwork) {
          console.error('❌ [WNTR Store] Network not found for export:', networkId)
          return false
        }

        try {
          const result = await window.electronAPI.wntr.exportNetwork({
            networkData: storedNetwork.networkData,
            filePath: exportPath,
            fileName: storedNetwork.fileName
          })

          if (result.success) {
            console.log('📤 [WNTR Store] Network exported successfully:', { networkId, exportPath: result.filePath })
            return true
          } else {
            console.error('❌ [WNTR Store] Export failed:', result.error)
            return false
          }
        } catch (error) {
          console.error('❌ [WNTR Store] Error exporting network:', error)
          return false
        }
      },

      // Project integration operations
      saveCurrentNetworkToProject: async (projectId: string, name: string, description?: string) => {
        const { currentNetwork, networkFilePath, networkFileName } = get()

        if (!currentNetwork) {
          console.error('❌ [WNTR Store] No current network to save to project')
          return false
        }

        try {
          const result = await window.electronAPI.hydraulic.saveNetworkToProject(projectId, {
            name,
            description,
            networkData: currentNetwork,
            filePath: networkFilePath || undefined,
            fileName: networkFileName || undefined
          })

          if (result.success) {
            console.log('💾 [WNTR Store] Network saved to project:', { projectId, name })

            // Also save to depot with project ID
            await get().saveNetworkToDepot(name, description, ['project'], projectId)

            return true
          } else {
            console.error('❌ [WNTR Store] Failed to save network to project:', result.error)
            return false
          }
        } catch (error) {
          console.error('❌ [WNTR Store] Error saving network to project:', error)
          return false
        }
      },

      loadNetworkFromProject: async (projectId: string) => {
        try {
          const result = await window.electronAPI.hydraulic.loadNetworkFromProject(projectId)

          if (result.success && result.data) {
            const { networkData, fileName, filePath, name } = result.data

            // Set the network data in the store
            get().setNetworkData(networkData, filePath, fileName || 'project_network.inp')

            console.log('📂 [WNTR Store] Network loaded from project:', { projectId, name })
            return true
          } else {
            console.error('❌ [WNTR Store] Failed to load network from project:', result.error)
            return false
          }
        } catch (error) {
          console.error('❌ [WNTR Store] Error loading network from project:', error)
          return false
        }
      },

      syncWithProject: (projectId: string) => {
        // Update any networks in depot that belong to this project
        set(state => {
          const updatedNetworks = state.storedNetworks.map(network =>
            network.projectId === projectId
              ? { ...network, lastUsed: new Date() }
              : network
          )
          return { storedNetworks: updatedNetworks }
        })

        console.log('🔄 [WNTR Store] Synced with project:', projectId)
      },

      // Simulation operations
      runSimulation: async (type: 'hydraulic' | 'quality', options = {}) => {
        const { currentNetwork } = get()
        if (!currentNetwork) {
          set({ error: 'No network loaded' })
          return false
        }

        set({ isSimulating: true, simulationType: type, simulationProgress: 0, error: null })

        try {
          console.log(`🔬 [WNTR Store] Running ${type} simulation...`)

          const result = await window.electronAPI.wntr.runSimulation({
            type,
            options,
            filePath: get().networkFilePath
          })

          if (result.success && result.data) {
            get().setSimulationResults(result.data)
            console.log(`✅ [WNTR Store] ${type} simulation completed`)
            return true
          } else {
            set({ error: result.error || 'Simulation failed' })
            console.error(`❌ [WNTR Store] ${type} simulation failed:`, result.error)
            return false
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          set({ error: errorMessage })
          console.error(`❌ [WNTR Store] Error running ${type} simulation:`, error)
          return false
        } finally {
          set({ isSimulating: false, simulationProgress: 0 })
        }
      },

      setSimulationResults: (results: SimulationResults) => {
        const maxSteps = results.timesteps ? results.timesteps.length : 1
        set({
          simulationResults: results,
          maxTimeSteps: maxSteps,
          currentTimeStep: 0
        })
        console.log('📊 [WNTR Store] Simulation results set:', { timesteps: maxSteps })
      },

      addSimulationResults: (results: SimulationResults) => {
        set(state => ({
          multipleSimulationResults: [...state.multipleSimulationResults, results]
        }))
      },

      clearSimulationResults: () => {
        set({
          simulationResults: null,
          multipleSimulationResults: [],
          currentTimeStep: 0,
          maxTimeSteps: 0
        })
      },

      // Analysis operations
      runAnalysis: async (type: string, options = {}) => {
        const { currentNetwork } = get()
        if (!currentNetwork) {
          set({ error: 'No network loaded' })
          return false
        }

        set({ isAnalyzing: true, analysisType: type, analysisProgress: 0, error: null })

        try {
          console.log(`📈 [WNTR Store] Running ${type} analysis...`)

          const result = await window.electronAPI.wntr.runAnalysis({
            type,
            options,
            filePath: get().networkFilePath
          })

          if (result.success && result.data) {
            get().setAnalysisResults({ ...get().analysisResults, [type]: result.data })
            console.log(`✅ [WNTR Store] ${type} analysis completed`)
            return true
          } else {
            set({ error: result.error || 'Analysis failed' })
            console.error(`❌ [WNTR Store] ${type} analysis failed:`, result.error)
            return false
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          set({ error: errorMessage })
          console.error(`❌ [WNTR Store] Error running ${type} analysis:`, error)
          return false
        } finally {
          set({ isAnalyzing: false, analysisProgress: 0 })
        }
      },

      setAnalysisResults: (results: AnalysisResults) => {
        set({ analysisResults: results })
        console.log('📈 [WNTR Store] Analysis results set')
      },

      clearAnalysisResults: () => {
        set({ analysisResults: {} })
      },

      // Selection operations
      selectNode: (nodeId: string, addToSelection = false) => {
        set(state => {
          const newSelection = addToSelection
            ? new Set([...state.selectedNodes, nodeId])
            : new Set([nodeId])
          return { selectedNodes: newSelection }
        })
      },

      selectLink: (linkId: string, addToSelection = false) => {
        set(state => {
          const newSelection = addToSelection
            ? new Set([...state.selectedLinks, linkId])
            : new Set([linkId])
          return { selectedLinks: newSelection }
        })
      },

      selectMultipleNodes: (nodeIds: string[]) => {
        set({ selectedNodes: new Set(nodeIds) })
      },

      selectMultipleLinks: (linkIds: string[]) => {
        set({ selectedLinks: new Set(linkIds) })
      },

      clearSelection: () => {
        set({ selectedNodes: new Set(), selectedLinks: new Set() })
      },

      // Visualization operations
      setSelectedParameter: (parameter: 'pressure' | 'flow' | 'velocity' | 'head' | 'demand' | 'headloss', type: 'node' | 'link') => {
        set({ selectedParameter: parameter, selectedParameterType: type })
        console.log(`🎨 [WNTR Store] Parameter changed to: ${parameter} (${type})`)
      },

      setCurrentTimeStep: (step: number) => {
        const { maxTimeSteps } = get()
        const clampedStep = Math.max(0, Math.min(step, maxTimeSteps - 1))
        set({ currentTimeStep: clampedStep })
      },

      nextTimeStep: () => {
        const { currentTimeStep, maxTimeSteps } = get()
        if (currentTimeStep < maxTimeSteps - 1) {
          set({ currentTimeStep: currentTimeStep + 1 })
        }
      },

      previousTimeStep: () => {
        const { currentTimeStep } = get()
        if (currentTimeStep > 0) {
          set({ currentTimeStep: currentTimeStep - 1 })
        }
      },

      // Animation operations
      startAnimation: () => {
        set({ isAnimating: true })
        console.log('▶️ [WNTR Store] Animation started')
      },

      stopAnimation: () => {
        set({ isAnimating: false })
        console.log('⏸️ [WNTR Store] Animation stopped')
      },

      setAnimationSpeed: (speed: number) => {
        set({ animationSpeed: Math.max(0.1, Math.min(5, speed)) })
      },

      // Utility operations
      setError: (error: string | null) => {
        set({ error })
      },

      resetState: () => {
        set(initialState)
        console.log('🔄 [WNTR Store] State reset')
      }
    }),
    {
      name: 'wntr-store',
      partialize: (state: WNTRState) => ({
        // Only persist essential data, not loading states
        networkHistory: state.networkHistory.slice(-3), // Keep last 3 networks
        selectedParameter: state.selectedParameter,
        selectedParameterType: state.selectedParameterType,
        animationSpeed: state.animationSpeed
      })
    }
  )
)