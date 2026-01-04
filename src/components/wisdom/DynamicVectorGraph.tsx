import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import Graph from '@/components/common/VisNetworkGraph'
import {
  Play, Pause, RotateCcw, Download, Search, Eye, EyeOff,
  Layers, Activity, Network as NetworkIcon
} from 'lucide-react'

interface DynamicVectorGraphProps {
  graphData: {
    nodes: any[]
    edges: any[]
    statistics: any
  }
  width?: number
  height?: number
  onNodeSelect?: (node: any) => void
  onNodeDoubleClick?: (node: any) => void
  onEdgeSelect?: (edge: any) => void
}

export function DynamicVectorGraph({
  graphData,
  onNodeSelect,
  onNodeDoubleClick,
  onEdgeSelect
}: DynamicVectorGraphProps) {
  const graphRef = useRef<any>(null)

  // State
  const [isPhysicsEnabled, setIsPhysicsEnabled] = useState(true)
  const [selectedLayout, setSelectedLayout] = useState<'force' | 'hierarchical' | 'circular'>('force')
  const [selectedNode, setSelectedNode] = useState<any>(null)
  // const [selectedEdge, setSelectedEdge] = useState<any>(null)
  const [showControls, setShowControls] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterOptions, setFilterOptions] = useState({
    category: '',
    minConnections: 0,
    maxConnections: 100,
    showLabels: true,
    nodeSize: 'default',
    colorBy: 'category'
  })
  const [networkStats, setNetworkStats] = useState({
    totalNodes: 0,
    totalEdges: 0,
    clusters: 0,
    avgDegree: 0
  })

  // Color schemes for different categories
  const categoryColors: Record<string, string> = {
    'fuentes-hidrologia': '#3b82f6',     // blue
    'obras-toma': '#10b981',             // green
    'hidraulica-aducciones': '#f59e0b',  // amber
    'potabilizacion': '#ef4444',         // red
    'almacenamiento': '#8b5cf6',         // violet
    'bombeo': '#06b6d4',                 // cyan
    'redes-distribucion': '#84cc16',     // lime
    'aguas-servidas': '#f97316',         // orange
    'tratamiento': '#ec4899',            // pink
    'general': '#6b7280',                // gray
    'hydraulics': '#3b82f6',
    'regulations': '#10b981',
    'best-practices': '#f59e0b'
  }

  // Create tooltips functions before using them in useMemo
  const createNodeTooltip = useCallback((node: any, connections: number): string => {
    return `
      <div style="max-width: 300px; padding: 8px;">
        <strong>${node.title || node.label || 'Unknown'}</strong><br/>
        <em>Category: ${node.category || 'Unknown'}</em><br/>
        <em>Connections: ${connections}</em><br/>
        <em>Language: ${node.language || 'Unknown'}</em><br/>
        ${node.content ? `<br/><small>${node.content.substring(0, 200)}...</small>` : ''}
      </div>
    `
  }, [])

  const createEdgeTooltip = useCallback((edge: any): string => {
    return `
      <div style="padding: 8px;">
        <strong>Connection</strong><br/>
        Weight: ${edge.weight || 1}<br/>
        Type: ${edge.type || 'similarity'}
      </div>
    `
  }, [])

  // Process and filter data
  const processedData = useMemo(() => {
    if (!graphData?.nodes || !graphData?.edges) {
      return { nodes: [], edges: [] }
    }

    let filteredNodes = graphData.nodes.filter(node => {
      // Category filter
      if (filterOptions.category && node.category !== filterOptions.category) {
        return false
      }

      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const matches = (
          node.label?.toLowerCase().includes(query) ||
          node.title?.toLowerCase().includes(query) ||
          node.content?.toLowerCase().includes(query) ||
          node.category?.toLowerCase().includes(query)
        )
        if (!matches) return false
      }

      return true
    })

    // Calculate connections for each node
    const nodeConnections = new Map()
    graphData.edges.forEach(edge => {
      nodeConnections.set(edge.from, (nodeConnections.get(edge.from) || 0) + 1)
      nodeConnections.set(edge.to, (nodeConnections.get(edge.to) || 0) + 1)
    })

    // Filter by connection count
    filteredNodes = filteredNodes.filter(node => {
      const connections = nodeConnections.get(node.id) || 0
      return connections >= filterOptions.minConnections && connections <= filterOptions.maxConnections
    })

    // Process nodes for visualization
    const processedNodes = filteredNodes.map(node => {
      const connections = nodeConnections.get(node.id) || 0
      let size = 10

      // Size based on connections or content length
      if (filterOptions.nodeSize === 'connections') {
        size = Math.max(5, Math.min(30, 5 + connections * 2))
      } else if (filterOptions.nodeSize === 'content') {
        size = Math.max(5, Math.min(30, 5 + (node.content?.length || 0) / 100))
      } else {
        size = node.size || 10
      }

      // Color based on selected scheme
      let color = categoryColors[node.category] || categoryColors['general']
      if (filterOptions.colorBy === 'connections') {
        const intensity = Math.min(connections / 10, 1)
        color = `hsl(${220 + intensity * 120}, 70%, ${50 + intensity * 20}%)`
      } else if (filterOptions.colorBy === 'size') {
        const intensity = Math.min((node.content?.length || 0) / 2000, 1)
        color = `hsl(${300 - intensity * 60}, 70%, ${50 + intensity * 20}%)`
      }

      return {
        id: node.id,
        label: filterOptions.showLabels ? (node.label || node.title || `Node ${node.id}`) : '',
        size: size,
        color: {
          background: color,
          border: color,
          highlight: {
            background: color,
            border: '#000000'
          }
        },
        font: {
          size: filterOptions.showLabels ? Math.max(8, size / 2) : 0,
          color: '#000000',
          face: 'Inter, system-ui, sans-serif'
        },
        borderWidth: 2,
        shadow: true,
        title: createNodeTooltip(node, connections),
        // Custom data for callbacks
        originalData: node,
        connections: connections
      }
    })

    // Filter edges to only include those between visible nodes
    const visibleNodeIds = new Set(processedNodes.map(n => n.id))
    const filteredEdges = graphData.edges.filter(edge =>
      visibleNodeIds.has(edge.from) && visibleNodeIds.has(edge.to)
    )

    const processedEdges = filteredEdges.map(edge => ({
      id: edge.id || `${edge.from}-${edge.to}`,
      from: edge.from,
      to: edge.to,
      width: Math.max(1, Math.min(5, edge.weight || 1)),
      color: {
        color: 'rgba(128, 128, 128, 0.6)',
        highlight: 'rgba(0, 123, 255, 0.8)',
        hover: 'rgba(0, 123, 255, 0.6)'
      },
      smooth: {
        enabled: true,
        type: 'dynamic',
        roundness: 0.5
      },
      arrows: {
        to: { enabled: false }
      },
      title: createEdgeTooltip(edge),
      // Custom data for callbacks
      originalData: edge
    }))

    return {
      nodes: processedNodes,
      edges: processedEdges
    }
  }, [graphData, filterOptions, searchQuery, createNodeTooltip, createEdgeTooltip])

  // Network options based on layout
  const networkOptions = useMemo(() => {
    const baseOptions: any = {
      physics: {
        enabled: isPhysicsEnabled,
        stabilization: { iterations: 150 },
        adaptiveTimestep: true,
        timestep: 0.5,
        maxVelocity: 50,
        minVelocity: 0.1
      },
      layout: {
        randomSeed: undefined,
        improvedLayout: true,
        hierarchical: {
          enabled: selectedLayout === 'hierarchical',
          levelSeparation: 150,
          nodeSpacing: 100,
          treeSpacing: 200,
          blockShifting: true,
          edgeMinimization: true,
          parentCentralization: true,
          direction: 'UD',
          sortMethod: 'hubsize'
        }
      },
      interaction: {
        dragNodes: true,
        dragView: true,
        hideEdgesOnDrag: false,
        hideEdgesOnZoom: false,
        keyboard: {
          enabled: true,
          speed: { x: 10, y: 10, zoom: 0.02 }
        },
        multiselect: true,
        navigationButtons: false,
        selectable: true,
        selectConnectedEdges: true,
        tooltipDelay: 300,
        zoomView: true
      }
    }

    // Configure physics solver based on layout
    if (selectedLayout === 'hierarchical') {
      baseOptions.physics.solver = 'hierarchicalRepulsion'
      baseOptions.physics.hierarchicalRepulsion = {
        centralGravity: 0.0,
        springLength: 100,
        springConstant: 0.01,
        nodeDistance: 120,
        damping: 0.09
      }
    } else if (selectedLayout === 'circular') {
      baseOptions.physics.solver = 'barnesHut'
      baseOptions.physics.barnesHut = {
        gravitationalConstant: -2000,
        centralGravity: 0.3,
        springLength: 95,
        springConstant: 0.04,
        damping: 0.09,
        avoidOverlap: 0
      }
    } else {
      // Force layout (default)
      baseOptions.physics.solver = 'forceAtlas2Based'
      baseOptions.physics.forceAtlas2Based = {
        gravitationalConstant: -50,
        centralGravity: 0.01,
        springLength: 100,
        springConstant: 0.08,
        damping: 0.4,
        avoidOverlap: 0.5
      }
    }

    return baseOptions
  }, [selectedLayout, isPhysicsEnabled])

  // Calculate network statistics
  useEffect(() => {
    if (processedData.nodes.length > 0) {
      const nodeConnections = new Map()
      processedData.edges.forEach(edge => {
        nodeConnections.set(edge.from, (nodeConnections.get(edge.from) || 0) + 1)
        nodeConnections.set(edge.to, (nodeConnections.get(edge.to) || 0) + 1)
      })

      const totalDegree = Array.from(nodeConnections.values()).reduce((sum, degree) => sum + degree, 0)
      const avgDegree = processedData.nodes.length > 0 ? totalDegree / processedData.nodes.length : 0
      const categories = new Set(processedData.nodes.map(n => n.originalData?.category).filter(Boolean))

      setNetworkStats({
        totalNodes: processedData.nodes.length,
        totalEdges: processedData.edges.length,
        clusters: categories.size,
        avgDegree: Math.round(avgDegree * 100) / 100
      })
    }
  }, [processedData])

  // Event handlers
  const events = {
    select: ({ nodes, edges }: { nodes: any[], edges: any[] }) => {
      if (nodes.length > 0) {
        const nodeId = nodes[0]
        const node = processedData.nodes.find(n => n.id === nodeId)
        setSelectedNode(node?.originalData || null)
        onNodeSelect?.(node?.originalData || null)
      }

      if (edges.length > 0) {
        const edgeId = edges[0]
        const edge = processedData.edges.find(e => e.id === edgeId)
        // setSelectedEdge(edge?.originalData || null)
        onEdgeSelect?.(edge?.originalData || null)
      }

      if (nodes.length === 0 && edges.length === 0) {
        setSelectedNode(null)
        // setSelectedEdge(null)
      }
    },
    doubleClick: ({ nodes }: { nodes: any[] }) => {
      if (nodes.length > 0) {
        const nodeId = nodes[0]
        const node = processedData.nodes.find(n => n.id === nodeId)
        onNodeDoubleClick?.(node?.originalData || null)
      }
    }
  }

  // Control functions
  const resetView = () => {
    if (graphRef.current) {
      graphRef.current.fit({ animation: { duration: 1000 } })
    }
  }

  const togglePhysics = () => {
    setIsPhysicsEnabled(!isPhysicsEnabled)
  }

  const changeLayout = (layout: 'force' | 'hierarchical' | 'circular') => {
    setSelectedLayout(layout)
    setIsPhysicsEnabled(true)
  }

  const exportNetwork = () => {
    // This would require access to the canvas, which is more complex with react-vis-network-graph
    console.log('Export functionality would need to be implemented differently with react-vis-network-graph')
  }

  return (
    <div className="relative w-full h-full bg-background border border-border rounded-lg overflow-hidden">
      {/* Controls Panel */}
      <div className={`absolute top-4 left-4 z-10 bg-card/95 backdrop-blur border border-border rounded-lg p-3 transition-all duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}>
        <div className="flex flex-col gap-3">
          {/* Layout Controls */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">Layout</label>
            <div className="flex gap-1">
              {(['force', 'hierarchical', 'circular'] as const).map(layout => (
                <button
                  key={layout}
                  onClick={() => changeLayout(layout)}
                  className={`px-2 py-1 text-xs rounded transition-colors ${selectedLayout === layout
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted hover:bg-muted/80'
                    }`}
                >
                  {layout === 'force' ? 'Force' : layout === 'hierarchical' ? 'Tree' : 'Circle'}
                </button>
              ))}
            </div>
          </div>

          {/* Physics & View Controls */}
          <div className="flex gap-2">
            <button
              onClick={togglePhysics}
              className={`p-2 rounded transition-colors ${isPhysicsEnabled
                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              title={isPhysicsEnabled ? 'Stop Physics' : 'Start Physics'}
            >
              {isPhysicsEnabled ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
            <button
              onClick={resetView}
              className="p-2 bg-muted hover:bg-muted/80 rounded transition-colors"
              title="Reset View"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              onClick={exportNetwork}
              className="p-2 bg-muted hover:bg-muted/80 rounded transition-colors"
              title="Export Image"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>

          {/* Search */}
          <div>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search nodes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-7 pr-3 py-1 text-xs bg-background border border-border rounded"
              />
            </div>
          </div>

          {/* Filters */}
          <div className="space-y-2">
            <select
              value={filterOptions.category}
              onChange={(e) => setFilterOptions(prev => ({ ...prev, category: e.target.value }))}
              className="w-full px-2 py-1 text-xs bg-background border border-border rounded"
            >
              <option value="">All Categories</option>
              {Object.keys(categoryColors).map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>

            <div className="flex gap-2">
              <select
                value={filterOptions.nodeSize}
                onChange={(e) => setFilterOptions(prev => ({ ...prev, nodeSize: e.target.value }))}
                className="flex-1 px-2 py-1 text-xs bg-background border border-border rounded"
              >
                <option value="default">Default Size</option>
                <option value="connections">By Connections</option>
                <option value="content">By Content</option>
              </select>

              <select
                value={filterOptions.colorBy}
                onChange={(e) => setFilterOptions(prev => ({ ...prev, colorBy: e.target.value }))}
                className="flex-1 px-2 py-1 text-xs bg-background border border-border rounded"
              >
                <option value="category">By Category</option>
                <option value="connections">By Connections</option>
                <option value="size">By Size</option>
              </select>
            </div>

            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={filterOptions.showLabels}
                onChange={(e) => setFilterOptions(prev => ({ ...prev, showLabels: e.target.checked }))}
                className="rounded"
              />
              Show Labels
            </label>
          </div>
        </div>
      </div>

      {/* Controls Toggle */}
      <button
        onClick={() => setShowControls(!showControls)}
        className="absolute top-4 right-4 z-10 p-2 bg-card/95 backdrop-blur border border-border rounded transition-colors hover:bg-card"
      >
        {showControls ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>

      {/* Stats Panel */}
      <div className="absolute bottom-4 left-4 z-10 bg-card/95 backdrop-blur border border-border rounded-lg p-3">
        <div className="text-xs space-y-1">
          <div className="flex items-center gap-2">
            <NetworkIcon className="w-3 h-3" />
            <span>{networkStats.totalNodes} nodes, {networkStats.totalEdges} edges</span>
          </div>
          <div className="flex items-center gap-2">
            <Activity className="w-3 h-3" />
            <span>Avg degree: {networkStats.avgDegree}</span>
          </div>
          <div className="flex items-center gap-2">
            <Layers className="w-3 h-3" />
            <span>{networkStats.clusters} categories</span>
          </div>
        </div>
      </div>

      {/* Selected Node Info */}
      {selectedNode && (
        <div className="absolute top-4 right-16 z-10 bg-card border border-border rounded-lg p-4 max-w-sm shadow-lg">
          <div className="flex items-start justify-between mb-2">
            <h3 className="font-medium text-sm">{selectedNode.title || selectedNode.label}</h3>
            <button
              onClick={() => setSelectedNode(null)}
              className="text-muted-foreground hover:text-foreground"
            >
              ×
            </button>
          </div>
          <div className="space-y-1 text-xs text-muted-foreground">
            <div>Category: {selectedNode.category}</div>
            {selectedNode.subcategory && <div>Subcategory: {selectedNode.subcategory}</div>}
            <div>Language: {selectedNode.language}</div>
            {selectedNode.chunkIndex !== undefined && <div>Chunk: {selectedNode.chunkIndex}</div>}
            {selectedNode.content && (
              <div className="mt-2 p-2 bg-muted rounded text-xs max-h-32 overflow-y-auto">
                {selectedNode.content.substring(0, 300)}...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Network Container */}
      <div className="w-full h-full">
        <Graph
          graph={{ nodes: processedData.nodes, edges: processedData.edges }}
          options={networkOptions}
          events={events}
          getNetwork={(network: any) => {
            graphRef.current = network
          }}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    </div>
  )
}