import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import Graph from 'react-vis-network-graph'
import {
  FileUp,
  Play,
  BarChart3,
  Download,
  Settings,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Info,
  Loader2,
  AlertCircle,
  Map,
  Network
} from 'lucide-react'
import { cn } from '@/utils/cn'
import * as Tabs from '@radix-ui/react-tabs'
import * as Dialog from '@radix-ui/react-dialog'
import * as Tooltip from '@radix-ui/react-tooltip'

interface NetworkData {
  name: string
  summary: {
    junctions: number
    tanks: number
    reservoirs: number
    pipes: number
    pumps: number
    valves: number
    patterns: number
    curves: number
  }
  nodes: any[]
  links: any[]
  options: any
  patterns: Record<string, number[]>
  curves: Record<string, any>
}

interface SimulationResults {
  node_results: any
  link_results: any
  timestamps: number[]
}

interface NetworkAnalysis {
  topology: {
    is_connected: boolean
    bridges: string[][]
    articulation_points: string[]
  }
  hydraulic_analysis: any
  demand_analysis: any
  energy_analysis: any
}

export function WNTRNetworkViewer() {
  const { t } = useTranslation()
  const [networkData, setNetworkData] = useState<NetworkData | null>(null)
  const [simulationResults, setSimulationResults] = useState<SimulationResults | null>(null)
  const [networkAnalysis, setNetworkAnalysis] = useState<NetworkAnalysis | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedNode, setSelectedNode] = useState<any>(null)
  const [selectedLink, setSelectedLink] = useState<any>(null)
  const [activeTab, setActiveTab] = useState('network')
  const [showNodeInfo, setShowNodeInfo] = useState(false)
  const [showLinkInfo, setShowLinkInfo] = useState(false)
  
  const networkRef = useRef<any>(null)

  // Convert WNTR data to vis.js format
  const convertToVisData = useCallback(() => {
    if (!networkData) return { nodes: [], edges: [] }

    const nodes = networkData.nodes.map((node: any) => {
      let color = '#97C2FC' // Default junction color
      let shape = 'dot'
      let size = 10

      if (node.type === 'tank') {
        color = '#FB7E81'
        shape = 'square'
        size = 15
      } else if (node.type === 'reservoir') {
        color = '#7BE141'
        shape = 'triangle'
        size = 20
      }

      // Apply simulation results if available
      let title = `${node.type}: ${node.label}`
      if (simulationResults?.node_results && simulationResults.node_results[node.id]) {
        const results = simulationResults.node_results[node.id]
        title += `\nPressure: ${results.pressure?.toFixed(2) || 'N/A'} m\nDemand: ${results.demand?.toFixed(4) || 'N/A'} L/s`
        
        // Color based on pressure (example thresholds)
        if (results.pressure < 20) {
          color = '#FF0000' // Red for low pressure
        } else if (results.pressure > 80) {
          color = '#FFA500' // Orange for high pressure
        }
      }

      return {
        id: node.id,
        label: node.label,
        x: node.x * 10, // Scale coordinates
        y: -node.y * 10, // Invert Y axis
        color,
        shape,
        size,
        title,
        physics: false // Disable physics for fixed layout
      }
    })

    const edges = networkData.links.map((link: any) => {
      let color = '#848484' // Default pipe color
      let width = 2
      let dashes = false

      if (link.type === 'pump') {
        color = '#FF6B6B'
        width = 4
      } else if (link.type === 'valve') {
        color = '#4ECDC4'
        width = 3
        if (link.status === 'CLOSED') {
          dashes = true
        }
      }

      // Apply simulation results if available
      let title = `${link.type}: ${link.label}`
      if (link.type === 'pipe') {
        title += `\nLength: ${link.length} m\nDiameter: ${link.diameter} mm`
      }
      
      if (simulationResults?.link_results && simulationResults.link_results[link.id]) {
        const results = simulationResults.link_results[link.id]
        title += `\nFlow: ${results.flowrate?.toFixed(4) || 'N/A'} L/s\nVelocity: ${results.velocity?.toFixed(2) || 'N/A'} m/s`
        
        // Width based on flow magnitude
        if (results.flowrate) {
          width = Math.min(Math.abs(results.flowrate) * 2 + 2, 10)
        }
        
        // Arrow direction based on flow
        if (results.flowrate < 0) {
          // Reverse flow
          return {
            from: link.to,
            to: link.from,
            id: link.id,
            label: link.label,
            color,
            width,
            dashes,
            title,
            arrows: 'to',
            smooth: { type: 'continuous' }
          }
        }
      }

      return {
        id: link.id,
        from: link.from,
        to: link.to,
        label: link.label,
        color,
        width,
        dashes,
        title,
        arrows: link.type === 'pump' ? 'to' : undefined,
        smooth: { type: 'continuous' }
      }
    })

    return { nodes, edges }
  }, [networkData, simulationResults])

  const graphData = convertToVisData()

  const options = {
    layout: {
      hierarchical: false
    },
    edges: {
      smooth: {
        type: 'continuous'
      }
    },
    physics: {
      enabled: false
    },
    interaction: {
      hover: true,
      tooltipDelay: 200
    },
    height: '600px'
  }

  const events = {
    select: (event: any) => {
      const { nodes, edges } = event
      if (nodes.length > 0) {
        const nodeData = networkData?.nodes.find(n => n.id === nodes[0])
        setSelectedNode(nodeData)
        setShowNodeInfo(true)
        setShowLinkInfo(false)
      } else if (edges.length > 0) {
        const linkData = networkData?.links.find(l => l.id === edges[0])
        setSelectedLink(linkData)
        setShowLinkInfo(true)
        setShowNodeInfo(false)
      }
    }
  }

  const handleFileUpload = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const result = await window.electronAPI.wntr.loadINPFile()
      
      if (result.success && result.data) {
        setNetworkData(result.data)
        setActiveTab('network')
      } else {
        setError(result.error || 'Failed to load file')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load file')
    } finally {
      setLoading(false)
    }
  }

  const handleRunSimulation = async () => {
    if (!networkData) return

    try {
      setLoading(true)
      setError(null)
      
      const result = await window.electronAPI.wntr.runSimulation({ simulationType: 'single' })
      
      if (result.success && result.data) {
        setSimulationResults(result.data)
      } else {
        setError(result.error || 'Simulation failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Simulation failed')
    } finally {
      setLoading(false)
    }
  }

  const handleAnalyzeNetwork = async () => {
    if (!networkData) return

    try {
      setLoading(true)
      setError(null)
      
      const result = await window.electronAPI.wntr.analyzeNetwork()
      
      if (result.success && result.data) {
        setNetworkAnalysis(result.data)
        setActiveTab('analysis')
      } else {
        setError(result.error || 'Analysis failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed')
    } finally {
      setLoading(false)
    }
  }

  const handleExportJSON = async () => {
    if (!networkData) return

    try {
      setLoading(true)
      setError(null)
      
      const result = await window.electronAPI.wntr.exportJSON()
      
      if (!result.success) {
        setError(result.error || 'Export failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setLoading(false)
    }
  }

  const handleZoomIn = () => {
    if (networkRef.current) {
      const scale = networkRef.current.Network.getScale()
      networkRef.current.Network.moveTo({ scale: scale * 1.2 })
    }
  }

  const handleZoomOut = () => {
    if (networkRef.current) {
      const scale = networkRef.current.Network.getScale()
      networkRef.current.Network.moveTo({ scale: scale * 0.8 })
    }
  }

  const handleFitNetwork = () => {
    if (networkRef.current) {
      networkRef.current.Network.fit()
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-background">
      {/* Header */}
      <div className="border-b border-border p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">WNTR Network Analysis</h1>
            <p className="text-muted-foreground mt-1">
              Load and analyze EPANET water distribution networks
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={handleFileUpload}
              disabled={loading}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg",
                "bg-primary text-primary-foreground hover:bg-primary/90",
                "transition-colors disabled:opacity-50"
              )}
            >
              <FileUp className="w-4 h-4" />
              Load INP File
            </button>
            
            {networkData && (
              <>
                <button
                  onClick={handleRunSimulation}
                  disabled={loading}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg",
                    "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                    "transition-colors disabled:opacity-50"
                  )}
                >
                  <Play className="w-4 h-4" />
                  Simulate
                </button>
                
                <button
                  onClick={handleAnalyzeNetwork}
                  disabled={loading}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg",
                    "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                    "transition-colors disabled:opacity-50"
                  )}
                >
                  <BarChart3 className="w-4 h-4" />
                  Analyze
                </button>
                
                <button
                  onClick={handleExportJSON}
                  disabled={loading}
                  className={cn(
                    "p-2 rounded-lg",
                    "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                    "transition-colors disabled:opacity-50"
                  )}
                  title="Export to JSON"
                >
                  <Download className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>
        
        {/* Network Summary */}
        {networkData && (
          <div className="mt-4 flex gap-4 text-sm">
            <span className="text-muted-foreground">
              <strong className="text-foreground">{networkData.summary.junctions}</strong> Junctions
            </span>
            <span className="text-muted-foreground">
              <strong className="text-foreground">{networkData.summary.tanks}</strong> Tanks
            </span>
            <span className="text-muted-foreground">
              <strong className="text-foreground">{networkData.summary.reservoirs}</strong> Reservoirs
            </span>
            <span className="text-muted-foreground">
              <strong className="text-foreground">{networkData.summary.pipes}</strong> Pipes
            </span>
            <span className="text-muted-foreground">
              <strong className="text-foreground">{networkData.summary.pumps}</strong> Pumps
            </span>
            <span className="text-muted-foreground">
              <strong className="text-foreground">{networkData.summary.valves}</strong> Valves
            </span>
          </div>
        )}
      </div>
      
      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {!networkData ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <FileUp className="w-12 h-12 text-muted-foreground mb-4 mx-auto" />
              <h3 className="text-lg font-medium text-foreground mb-2">No network loaded</h3>
              <p className="text-muted-foreground mb-4">
                Load an EPANET INP file to visualize and analyze the network
              </p>
              <button
                onClick={handleFileUpload}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg mx-auto",
                  "bg-primary text-primary-foreground hover:bg-primary/90",
                  "transition-colors"
                )}
              >
                <FileUp className="w-4 h-4" />
                Load INP File
              </button>
            </div>
          </div>
        ) : (
          <Tabs.Root value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <Tabs.List className="flex gap-2 p-4 border-b border-border">
              <Tabs.Trigger
                value="network"
                className={cn(
                  "px-4 py-2 rounded-lg",
                  "hover:bg-accent transition-colors",
                  "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                )}
              >
                Network View
              </Tabs.Trigger>
              <Tabs.Trigger
                value="analysis"
                className={cn(
                  "px-4 py-2 rounded-lg",
                  "hover:bg-accent transition-colors",
                  "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                )}
              >
                Analysis Results
              </Tabs.Trigger>
              <Tabs.Trigger
                value="patterns"
                className={cn(
                  "px-4 py-2 rounded-lg",
                  "hover:bg-accent transition-colors",
                  "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                )}
              >
                Patterns
              </Tabs.Trigger>
              <Tabs.Trigger
                value="options"
                className={cn(
                  "px-4 py-2 rounded-lg",
                  "hover:bg-accent transition-colors",
                  "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                )}
              >
                Options
              </Tabs.Trigger>
            </Tabs.List>
            
            <Tabs.Content value="network" className="flex-1 flex overflow-hidden">
              <div className="flex-1 relative">
                {loading && (
                  <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-10">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  </div>
                )}
                
                {/* Network Controls */}
                <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
                  <button
                    onClick={handleZoomIn}
                    className="p-2 bg-background border border-border rounded-lg hover:bg-accent"
                    title="Zoom In"
                  >
                    <ZoomIn className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleZoomOut}
                    className="p-2 bg-background border border-border rounded-lg hover:bg-accent"
                    title="Zoom Out"
                  >
                    <ZoomOut className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleFitNetwork}
                    className="p-2 bg-background border border-border rounded-lg hover:bg-accent"
                    title="Fit Network"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                </div>
                
                {/* Network Visualization */}
                <div className="w-full h-full">
                  <Graph
                    ref={networkRef}
                    graph={graphData}
                    options={options}
                    events={events}
                  />
                </div>
              </div>
              
              {/* Info Panel */}
              {(showNodeInfo || showLinkInfo) && (
                <div className="w-80 border-l border-border p-4 overflow-y-auto">
                  {showNodeInfo && selectedNode && (
                    <div>
                      <h3 className="font-semibold text-lg mb-4">Node Information</h3>
                      <div className="space-y-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">ID:</span>
                          <span className="ml-2 font-medium">{selectedNode.id}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Type:</span>
                          <span className="ml-2 font-medium capitalize">{selectedNode.type}</span>
                        </div>
                        {selectedNode.elevation !== undefined && (
                          <div>
                            <span className="text-muted-foreground">Elevation:</span>
                            <span className="ml-2 font-medium">{selectedNode.elevation} m</span>
                          </div>
                        )}
                        {selectedNode.demand !== undefined && (
                          <div>
                            <span className="text-muted-foreground">Base Demand:</span>
                            <span className="ml-2 font-medium">{selectedNode.demand} L/s</span>
                          </div>
                        )}
                        {simulationResults?.node_results?.[selectedNode.id] && (
                          <>
                            <hr className="my-2" />
                            <h4 className="font-medium">Simulation Results</h4>
                            <div>
                              <span className="text-muted-foreground">Pressure:</span>
                              <span className="ml-2 font-medium">
                                {simulationResults.node_results[selectedNode.id].pressure?.toFixed(2)} m
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Head:</span>
                              <span className="ml-2 font-medium">
                                {simulationResults.node_results[selectedNode.id].head?.toFixed(2)} m
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Demand:</span>
                              <span className="ml-2 font-medium">
                                {simulationResults.node_results[selectedNode.id].demand?.toFixed(4)} L/s
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {showLinkInfo && selectedLink && (
                    <div>
                      <h3 className="font-semibold text-lg mb-4">Link Information</h3>
                      <div className="space-y-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">ID:</span>
                          <span className="ml-2 font-medium">{selectedLink.id}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Type:</span>
                          <span className="ml-2 font-medium capitalize">{selectedLink.type}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">From Node:</span>
                          <span className="ml-2 font-medium">{selectedLink.from}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">To Node:</span>
                          <span className="ml-2 font-medium">{selectedLink.to}</span>
                        </div>
                        {selectedLink.length !== undefined && (
                          <div>
                            <span className="text-muted-foreground">Length:</span>
                            <span className="ml-2 font-medium">{selectedLink.length} m</span>
                          </div>
                        )}
                        {selectedLink.diameter !== undefined && (
                          <div>
                            <span className="text-muted-foreground">Diameter:</span>
                            <span className="ml-2 font-medium">{selectedLink.diameter} mm</span>
                          </div>
                        )}
                        {simulationResults?.link_results?.[selectedLink.id] && (
                          <>
                            <hr className="my-2" />
                            <h4 className="font-medium">Simulation Results</h4>
                            <div>
                              <span className="text-muted-foreground">Flow:</span>
                              <span className="ml-2 font-medium">
                                {simulationResults.link_results[selectedLink.id].flowrate?.toFixed(4)} L/s
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Velocity:</span>
                              <span className="ml-2 font-medium">
                                {simulationResults.link_results[selectedLink.id].velocity?.toFixed(2)} m/s
                              </span>
                            </div>
                            {simulationResults.link_results[selectedLink.id].headloss !== undefined && (
                              <div>
                                <span className="text-muted-foreground">Headloss:</span>
                                <span className="ml-2 font-medium">
                                  {simulationResults.link_results[selectedLink.id].headloss?.toFixed(3)} m/km
                                </span>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Tabs.Content>
            
            <Tabs.Content value="analysis" className="flex-1 p-6 overflow-y-auto">
              {networkAnalysis ? (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Network Topology</h3>
                    <div className="bg-card p-4 rounded-lg border border-border space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Connected:</span>
                        <span className={cn(
                          "font-medium",
                          networkAnalysis.topology.is_connected ? "text-green-600" : "text-red-600"
                        )}>
                          {networkAnalysis.topology.is_connected ? 'Yes' : 'No'}
                        </span>
                      </div>
                      {networkAnalysis.topology.articulation_points.length > 0 && (
                        <div>
                          <span className="text-muted-foreground">Critical Nodes:</span>
                          <span className="ml-2 font-medium text-yellow-600">
                            {networkAnalysis.topology.articulation_points.join(', ')}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Hydraulic Analysis</h3>
                    <div className="bg-card p-4 rounded-lg border border-border space-y-2">
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <div className="text-sm text-muted-foreground">Min Pressure</div>
                          <div className="text-xl font-semibold">
                            {networkAnalysis.hydraulic_analysis?.pressure_stats?.min?.toFixed(2)} m
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">Max Pressure</div>
                          <div className="text-xl font-semibold">
                            {networkAnalysis.hydraulic_analysis?.pressure_stats?.max?.toFixed(2)} m
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">Avg Pressure</div>
                          <div className="text-xl font-semibold">
                            {networkAnalysis.hydraulic_analysis?.pressure_stats?.mean?.toFixed(2)} m
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Demand Analysis</h3>
                    <div className="bg-card p-4 rounded-lg border border-border space-y-2">
                      <div>
                        <span className="text-muted-foreground">Total Base Demand:</span>
                        <span className="ml-2 font-medium">
                          {networkAnalysis.demand_analysis?.total_base_demand?.toFixed(4)} L/s
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Demand Nodes:</span>
                        <span className="ml-2 font-medium">
                          {networkAnalysis.demand_analysis?.number_of_demand_nodes}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-64">
                  <div className="text-center">
                    <BarChart3 className="w-12 h-12 text-muted-foreground mb-4 mx-auto" />
                    <p className="text-muted-foreground">
                      Run network analysis to see detailed results
                    </p>
                  </div>
                </div>
              )}
            </Tabs.Content>
            
            <Tabs.Content value="patterns" className="flex-1 p-6 overflow-y-auto">
              {Object.keys(networkData.patterns).length > 0 ? (
                <div className="space-y-4">
                  {Object.entries(networkData.patterns).map(([name, values]) => (
                    <div key={name} className="bg-card p-4 rounded-lg border border-border">
                      <h4 className="font-medium mb-2">{name}</h4>
                      <div className="flex flex-wrap gap-2">
                        {values.map((value, index) => (
                          <span key={index} className="px-2 py-1 bg-secondary text-secondary-foreground rounded text-sm">
                            {value.toFixed(2)}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">No patterns defined in this network</p>
              )}
            </Tabs.Content>
            
            <Tabs.Content value="options" className="flex-1 p-6 overflow-y-auto">
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold mb-4">Time Options</h3>
                  <div className="bg-card p-4 rounded-lg border border-border space-y-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Duration:</span>
                      <span className="ml-2 font-medium">{networkData.options.time.duration} seconds</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Hydraulic Timestep:</span>
                      <span className="ml-2 font-medium">{networkData.options.time.hydraulic_timestep} seconds</span>
                    </div>
                  </div>
                </div>
                
                <div>
                  <h3 className="text-lg font-semibold mb-4">Hydraulic Options</h3>
                  <div className="bg-card p-4 rounded-lg border border-border space-y-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Headloss Formula:</span>
                      <span className="ml-2 font-medium">{networkData.options.hydraulic.headloss}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Demand Model:</span>
                      <span className="ml-2 font-medium">{networkData.options.hydraulic.demand_model}</span>
                    </div>
                  </div>
                </div>
              </div>
            </Tabs.Content>
          </Tabs.Root>
        )}
      </div>
      
      {/* Error Display */}
      {error && (
        <div className="absolute bottom-4 right-4 max-w-md p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-destructive mt-0.5" />
            <div>
              <p className="text-sm text-destructive">{error}</p>
              <button
                onClick={() => setError(null)}
                className="text-xs text-destructive/80 hover:text-destructive mt-1"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}