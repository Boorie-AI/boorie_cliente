import { useState, useEffect } from 'react'
import {
  Activity, Cpu, Database, RefreshCw,
  BarChart3, Network, AlertTriangle, CheckCircle, XCircle,
  Zap, Target, BookOpen, Grid
} from 'lucide-react'
import { DynamicVectorGraph } from './DynamicVectorGraph'

interface VectorGraphViewerProps {
  isOpen: boolean
  onClose: () => void
}

export function VectorGraphViewer({ isOpen, onClose }: VectorGraphViewerProps) {

  // State
  const [loading, setLoading] = useState(false)
  const [graphData, setGraphData] = useState<any>(null)
  const [healthData, setHealthData] = useState<any>(null)
  const [clustersData, setClustersData] = useState<any>(null)
  const [activeTab, setActiveTab] = useState<'graph' | 'health' | 'clusters'>('graph')
  const [viewOptions, setViewOptions] = useState({
    limit: 200,
    category: '',
    includeEmbeddings: false
  })

  // Load data when component opens
  useEffect(() => {
    if (isOpen) {
      loadAllData()
    }
  }, [isOpen])

  const loadAllData = async () => {
    setLoading(true)
    try {
      await Promise.all([
        loadHealthData(),
        loadGraphData(),
        loadClustersData()
      ])
    } catch (error) {
      console.error('Error loading vector graph data:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadHealthData = async () => {
    try {
      const result = await window.electronAPI.wisdom.getRAGHealth()
      if (result.success) {
        setHealthData(result.health)
      }
    } catch (error) {
      console.error('Error loading health data:', error)
    }
  }

  const loadGraphData = async () => {
    try {
      const result = await window.electronAPI.wisdom.getVectorGraph(viewOptions)
      if (result.success) {
        setGraphData(result.graph)
      }
    } catch (error) {
      console.error('Error loading graph data:', error)
    }
  }

  const loadClustersData = async () => {
    try {
      const result = await window.electronAPI.wisdom.getVectorClusters({
        maxClusters: 15,
        category: viewOptions.category || undefined
      })
      if (result.success) {
        setClustersData(result)
      }
    } catch (error) {
      console.error('Error loading clusters data:', error)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'excellent': return <CheckCircle className="w-5 h-5 text-green-500" />
      case 'healthy': return <CheckCircle className="w-5 h-5 text-blue-500" />
      case 'degraded': return <AlertTriangle className="w-5 h-5 text-yellow-500" />
      case 'critical': return <XCircle className="w-5 h-5 text-red-500" />
      default: return <Activity className="w-5 h-5 text-gray-500" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'excellent': return 'text-green-600 bg-green-50 border-green-200'
      case 'healthy': return 'text-blue-600 bg-blue-50 border-blue-200'
      case 'degraded': return 'text-yellow-600 bg-yellow-50 border-yellow-200'
      case 'critical': return 'text-red-600 bg-red-50 border-red-200'
      default: return 'text-gray-600 bg-gray-50 border-gray-200'
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-7xl h-5/6 flex flex-col m-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <Network className="w-6 h-6 text-primary" />
            <h2 className="text-xl font-bold text-foreground">🔗 Vector Graph & RAG Health</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadAllData}
              disabled={loading}
              className="p-2 text-muted-foreground hover:text-foreground transition-colors"
              title="Refresh Data"
            >
              <RefreshCw className={`w - 4 h - 4 ${loading ? 'animate-spin' : ''} `} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              ×
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          <button
            onClick={() => setActiveTab('health')}
            className={`px - 6 py - 3 font - medium transition - colors ${activeTab === 'health'
              ? 'text-primary border-b-2 border-primary bg-primary/5'
              : 'text-muted-foreground hover:text-foreground'
              } `}
          >
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4" />
              System Health
            </div>
          </button>
          <button
            onClick={() => setActiveTab('graph')}
            className={`px - 6 py - 3 font - medium transition - colors ${activeTab === 'graph'
              ? 'text-primary border-b-2 border-primary bg-primary/5'
              : 'text-muted-foreground hover:text-foreground'
              } `}
          >
            <div className="flex items-center gap-2">
              <Network className="w-4 h-4" />
              Vector Graph
            </div>
          </button>
          <button
            onClick={() => setActiveTab('clusters')}
            className={`px - 6 py - 3 font - medium transition - colors ${activeTab === 'clusters'
              ? 'text-primary border-b-2 border-primary bg-primary/5'
              : 'text-muted-foreground hover:text-foreground'
              } `}
          >
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Clusters
            </div>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <RefreshCw className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
                <p className="text-muted-foreground">Loading vector graph data...</p>
              </div>
            </div>
          ) : (
            <>
              {/* Health Tab */}
              {activeTab === 'health' && healthData && (
                <div className="space-y-6">
                  {/* Status Overview */}
                  <div className={`flex items - center justify - between p - 4 rounded - lg border ${getStatusColor(healthData.status)} `}>
                    <div className="flex items-center gap-3">
                      {getStatusIcon(healthData.status)}
                      <div>
                        <h3 className="font-semibold capitalize">{healthData.status} Status</h3>
                        <p className="text-sm">Last checked: {new Date(healthData.timestamp).toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{healthData.issues.length} Issues</div>
                      <div className="text-sm">
                        {healthData.metrics.performance?.recentSearches || 0} searches (24h)
                      </div>
                    </div>
                  </div>

                  {/* Issues */}
                  {healthData.issues.length > 0 && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                      <h3 className="font-semibold text-yellow-800 mb-2">⚠️ Issues Found</h3>
                      <ul className="space-y-1">
                        {healthData.issues.map((issue: any, index: number) => (
                          <li key={index} className="text-sm text-yellow-700">• {issue}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Metrics Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* Database Status */}
                    <div className="bg-card border border-border rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Database className="w-4 h-4 text-blue-500" />
                        <h3 className="font-medium">Database</h3>
                      </div>
                      <div className="text-2xl font-bold text-foreground">
                        {healthData.metrics.databaseStatus === 'connected' ? '✅' : '❌'}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {healthData.metrics.databaseStatus}
                      </div>
                    </div>

                    {/* Documents */}
                    {healthData.metrics.documents && (
                      <div className="bg-card border border-border rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <BookOpen className="w-4 h-4 text-green-500" />
                          <h3 className="font-medium">Documents</h3>
                        </div>
                        <div className="text-2xl font-bold text-foreground">
                          {healthData.metrics.documents.total}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {healthData.metrics.documents.indexedPercentage}% indexed
                        </div>
                      </div>
                    )}

                    {/* Embeddings */}
                    {healthData.metrics.embeddings && (
                      <div className="bg-card border border-border rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Cpu className="w-4 h-4 text-purple-500" />
                          <h3 className="font-medium">Embeddings</h3>
                        </div>
                        <div className="text-2xl font-bold text-foreground">
                          {healthData.metrics.embeddings.coverage}%
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {healthData.metrics.embeddings.total} chunks
                        </div>
                      </div>
                    )}

                    {/* Performance */}
                    {healthData.metrics.performance && (
                      <div className="bg-card border border-border rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Zap className="w-4 h-4 text-yellow-500" />
                          <h3 className="font-medium">Performance</h3>
                        </div>
                        <div className="text-2xl font-bold text-foreground">
                          {healthData.metrics.performance.avgProcessingTime}ms
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Avg search time
                        </div>
                      </div>
                    )}

                    {/* Quality */}
                    {healthData.metrics.performance?.avgResponseQuality && (
                      <div className="bg-card border border-border rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Target className="w-4 h-4 text-red-500" />
                          <h3 className="font-medium">Quality</h3>
                        </div>
                        <div className="text-2xl font-bold text-foreground">
                          {healthData.metrics.performance.avgResponseQuality.toFixed(1)}/5
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Response quality
                        </div>
                      </div>
                    )}

                    {/* Chunks */}
                    {healthData.metrics.chunks && (
                      <div className="bg-card border border-border rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Grid className="w-4 h-4 text-cyan-500" />
                          <h3 className="font-medium">Chunks</h3>
                        </div>
                        <div className="text-2xl font-bold text-foreground">
                          {healthData.metrics.chunks.total}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          ~{healthData.metrics.chunks.avgPerDocument} per doc
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Categories */}
                  {healthData.metrics.categories && (
                    <div className="bg-card border border-border rounded-lg p-4">
                      <h3 className="font-medium mb-3">📊 Category Distribution</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {healthData.metrics.categories.map((cat: any, index: number) => (
                          <div key={index} className="flex justify-between text-sm">
                            <span className="text-muted-foreground">{cat.category}</span>
                            <span className="font-medium">{cat.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Graph Tab */}
              {activeTab === 'graph' && (
                <div className="space-y-4">
                  {/* Graph Controls */}
                  <div className="flex flex-wrap gap-4 items-center p-4 bg-muted/20 rounded-lg">
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-medium">Limit:</label>
                      <select
                        value={viewOptions.limit}
                        onChange={(e) => setViewOptions(prev => ({ ...prev, limit: Number(e.target.value) }))}
                        className="px-3 py-1 bg-background border border-border rounded text-sm"
                      >
                        <option value={50}>50 nodes</option>
                        <option value={100}>100 nodes</option>
                        <option value={200}>200 nodes</option>
                        <option value={500}>500 nodes</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-2">
                      <label className="text-sm font-medium">Category:</label>
                      <select
                        value={viewOptions.category}
                        onChange={(e) => setViewOptions(prev => ({ ...prev, category: e.target.value }))}
                        className="px-3 py-1 bg-background border border-border rounded text-sm"
                      >
                        <option value="">All Categories</option>
                        <option value="fuentes-hidrologia">Fuentes e Hidrología</option>
                        <option value="obras-toma">Obras de Toma</option>
                        <option value="hidraulica-aducciones">Hidráulica y Aducciones</option>
                        <option value="potabilizacion">Potabilización</option>
                        <option value="almacenamiento">Almacenamiento</option>
                        <option value="bombeo">Bombeo</option>
                        <option value="redes-distribucion">Redes de Distribución</option>
                        <option value="aguas-servidas">Aguas Servidas</option>
                        <option value="tratamiento">Tratamiento</option>
                      </select>
                    </div>

                    <button
                      onClick={loadGraphData}
                      disabled={loading}
                      className="px-4 py-1 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90 transition-colors"
                    >
                      Update Graph
                    </button>
                  </div>

                  {/* Graph Statistics */}
                  {graphData && graphData.statistics && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <div className="bg-card border border-border rounded-lg p-3 text-center">
                        <div className="text-2xl font-bold text-foreground">{graphData.statistics.totalNodes || 0}</div>
                        <div className="text-sm text-muted-foreground">Nodes</div>
                      </div>
                      <div className="bg-card border border-border rounded-lg p-3 text-center">
                        <div className="text-2xl font-bold text-foreground">{graphData.statistics.totalEdges || 0}</div>
                        <div className="text-sm text-muted-foreground">Connections</div>
                      </div>
                      <div className="bg-card border border-border rounded-lg p-3 text-center">
                        <div className="text-2xl font-bold text-foreground">{graphData.statistics.categories || 0}</div>
                        <div className="text-sm text-muted-foreground">Categories</div>
                      </div>
                      <div className="bg-card border border-border rounded-lg p-3 text-center">
                        <div className="text-2xl font-bold text-foreground">
                          {graphData.statistics.categoryStats ?
                            (Object.values(graphData.statistics.categoryStats as Record<string, any>).reduce((sum: number, cat: any) => sum + cat.avgChunkSize, 0) / (Object.keys(graphData.statistics.categoryStats).length || 1)).toFixed(0) : 0}
                        </div>
                        <div className="text-sm text-muted-foreground">Avg Chunk Size</div>
                      </div>
                    </div>
                  )}

                  {/* Graph Visualization */}
                  {graphData && graphData.nodes?.length > 0 ? (
                    <div className="bg-card border border-border rounded-lg overflow-hidden" style={{ height: '600px' }}>
                      <DynamicVectorGraph
                        graphData={graphData}
                        width={800}
                        height={600}
                        onNodeSelect={(node) => {
                          console.log('Node selected:', node)
                        }}
                        onNodeDoubleClick={(node) => {
                          console.log('Node double-clicked:', node)
                          // Could open a detailed view or focus on related documents
                        }}
                        onEdgeSelect={(edge) => {
                          console.log('Edge selected:', edge)
                        }}
                      />
                    </div>
                  ) : (
                    <div className="bg-card border border-border rounded-lg p-8 text-center">
                      <Network className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-foreground mb-2">No Graph Data</h3>
                      <p className="text-muted-foreground">
                        No vector data available for visualization. Try indexing some documents first.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Clusters Tab */}
              {activeTab === 'clusters' && clustersData && (
                <div className="space-y-4">
                  <div className="text-sm text-muted-foreground mb-4">
                    Found {clustersData.totalClusters} clusters from {clustersData.totalChunks} total chunks
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {clustersData.clusters?.map((cluster: any, index: number) => (
                      <div key={cluster.id} className="bg-card border border-border rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <div className={`w - 3 h - 3 rounded - full bg - blue - ${(index % 5 + 1) * 100} `}></div>
                          <h3 className="font-medium text-foreground">{cluster.label}</h3>
                        </div>

                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Chunks:</span>
                            <span className="font-medium">{cluster.chunkCount}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Avg Size:</span>
                            <span className="font-medium">{cluster.avgChunkSize} chars</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Density:</span>
                            <span className="font-medium">{(cluster.density * 100).toFixed(1)}%</span>
                          </div>
                        </div>

                        <div className="mt-3 pt-3 border-t border-border">
                          <div className="w-full bg-muted rounded-full h-2">
                            <div
                              className="bg-primary h-2 rounded-full"
                              style={{ width: `${cluster.density * 100}% ` }}
                            ></div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}