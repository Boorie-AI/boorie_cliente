import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import {
  FileUp,
  Play,
  Pause,
  RotateCcw,
  Settings2,
  Download,
  Layers,
  Info,
  BarChart3,
  Loader2,
  AlertCircle,
  ChevronUp,
  ChevronDown,
  Eye,
  EyeOff,
  Map
} from 'lucide-react'
import { cn } from '@/utils/cn'
import * as Slider from '@radix-ui/react-slider'
import * as Select from '@radix-ui/react-select'
// Dynamically import Chart.js components to avoid initial load issues
let Line: any = null
let ChartJS: any = null

const loadChartJS = async () => {
  try {
    const { Line: LineChart } = await import('react-chartjs-2')
    const {
      Chart,
      CategoryScale,
      LinearScale,
      PointElement,
      LineElement,
      Title,
      Tooltip,
      Legend,
      TimeScale
    } = await import('chart.js')
    await import('chartjs-adapter-date-fns')
    
    Chart.register(
      CategoryScale,
      LinearScale,
      PointElement,
      LineElement,
      Title,
      Tooltip,
      Legend,
      TimeScale
    )
    
    Line = LineChart
    ChartJS = Chart
    return true
  } catch (error) {
    console.error('Failed to load Chart.js:', error)
    return false
  }
}

// Set Mapbox access token
const MAPBOX_ACCESS_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || ''
if (MAPBOX_ACCESS_TOKEN) {
  mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN
}

interface NetworkData {
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
  coordinate_system?: any
}

interface SimulationResults {
  node_results: { [nodeId: string]: any }
  link_results: { [linkId: string]: any }
  timestamps: number[]
}

export function WNTRAdvancedViewer() {
  const { t } = useTranslation()
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  
  // Map states
  const [networkData, setNetworkData] = useState<NetworkData | null>(null)
  const [mapStyle, setMapStyle] = useState('light')
  const [simulationResults, setSimulationResults] = useState<SimulationResults | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [chartJSLoaded, setChartJSLoaded] = useState(false)
  
  // Visualization states
  const [currentTimeStep, setCurrentTimeStep] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playSpeed, setPlaySpeed] = useState(1000) // ms between frames
  const [selectedParameter, setSelectedParameter] = useState<'pressure' | 'flow' | 'velocity' | 'head'>('pressure')
  const [selectedElements, setSelectedElements] = useState<Set<string>>(new Set())
  const [showLabels, setShowLabels] = useState(true)
  const [showLegend, setShowLegend] = useState(true)
  const [showTimeSeries, setShowTimeSeries] = useState(true)
  const [selectedNode, setSelectedNode] = useState<any>(null)
  const [selectedLink, setSelectedLink] = useState<any>(null)
  
  // Color scale for visualization
  const [colorScale, setColorScale] = useState({
    pressure: { min: 0, max: 100, unit: 'm' },
    flow: { min: 0, max: 10, unit: 'L/s' },
    velocity: { min: 0, max: 2, unit: 'm/s' },
    head: { min: 0, max: 150, unit: 'm' }
  })
  
  // Load Chart.js asynchronously
  useEffect(() => {
    loadChartJS().then(success => {
      setChartJSLoaded(success)
    })
  }, [])

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return
    
    if (!MAPBOX_ACCESS_TOKEN) {
      setError('Mapbox access token not configured')
      return
    }
    
    try {
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/light-v11',
        center: [0, 20], // Vista mundial centrada
        zoom: 2 // Zoom para ver todo el mundo
      })
      
      map.current.on('error', (e) => {
        console.error('Map error:', e)
        setError('Map initialization failed')
      })
      
      map.current.addControl(new mapboxgl.NavigationControl(), 'top-right')
      map.current.addControl(new mapboxgl.ScaleControl(), 'bottom-right')
    } catch (err) {
      console.error('Failed to initialize map:', err)
      setError('Failed to initialize map')
    }
    
    return () => {
      map.current?.remove()
      map.current = null
    }
  }, [])
  
  // Animation effect
  useEffect(() => {
    if (!isPlaying || !simulationResults) return
    
    const interval = setInterval(() => {
      setCurrentTimeStep(prev => {
        if (prev >= simulationResults.timestamps.length - 1) {
          setIsPlaying(false)
          return 0
        }
        return prev + 1
      })
    }, playSpeed)
    
    return () => clearInterval(interval)
  }, [isPlaying, playSpeed, simulationResults])
  
  // Update visualization when network data or time step changes
  useEffect(() => {
    if (!map.current || !networkData) return
    updateVisualization()
  }, [currentTimeStep, selectedParameter, networkData, simulationResults, updateVisualization])
  
  const handleFileUpload = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const result = await window.electronAPI.wntr.loadINPFile()
      
      if (result.success && result.data) {
        // Verificar que los datos tienen la estructura correcta
        if (result.data.nodes && Array.isArray(result.data.nodes)) {
          setNetworkData(result.data)
          // Reset states
          setSimulationResults(null)
          setCurrentTimeStep(0)
          setSelectedElements(new Set())
          setError(null)
        } else {
          console.error('Invalid network data structure:', result.data)
          setError('Invalid network data format received')
        }
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
      
      const result = await window.electronAPI.wntr.runSimulation({ 
        simulationType: 'extended' // Get full time series
      })
      
      if (result.success && result.data) {
        setSimulationResults(result.data)
        setCurrentTimeStep(0)
        updateColorScales(result.data)
      } else {
        setError(result.error || 'Simulation failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Simulation failed')
    } finally {
      setLoading(false)
    }
  }
  
  const updateColorScales = (results: SimulationResults) => {
    // Auto-calculate min/max for color scales based on results
    const pressureValues: number[] = []
    const flowValues: number[] = []
    const velocityValues: number[] = []
    const headValues: number[] = []
    
    Object.values(results.node_results).forEach(nodeData => {
      if (nodeData.pressure) pressureValues.push(...nodeData.pressure)
      if (nodeData.head) headValues.push(...nodeData.head)
    })
    
    Object.values(results.link_results).forEach(linkData => {
      if (linkData.flowrate) flowValues.push(...linkData.flowrate.map(Math.abs))
      if (linkData.velocity) velocityValues.push(...linkData.velocity.map(Math.abs))
    })
    
    setColorScale({
      pressure: {
        min: Math.min(...pressureValues),
        max: Math.max(...pressureValues),
        unit: 'm'
      },
      flow: {
        min: 0,
        max: Math.max(...flowValues),
        unit: 'L/s'
      },
      velocity: {
        min: 0,
        max: Math.max(...velocityValues),
        unit: 'm/s'
      },
      head: {
        min: Math.min(...headValues),
        max: Math.max(...headValues),
        unit: 'm'
      }
    })
  }
  
  // Color value function
  const getColorForValue = useCallback((value: number, parameter: string) => {
    const scale = colorScale[parameter as keyof typeof colorScale]
    const normalized = (value - scale.min) / (scale.max - scale.min)
    
    // Color gradient: Blue -> Green -> Yellow -> Red
    if (normalized < 0.25) {
      return `rgb(0, 0, ${255 - normalized * 4 * 255})`
    } else if (normalized < 0.5) {
      return `rgb(0, ${(normalized - 0.25) * 4 * 255}, 0)`
    } else if (normalized < 0.75) {
      return `rgb(${(normalized - 0.5) * 4 * 255}, 255, 0)`
    } else {
      return `rgb(255, ${255 - (normalized - 0.75) * 4 * 255}, 0)`
    }
  }, [colorScale])

  const updateVisualization = useCallback(() => {
    if (!map.current || !networkData) return
    
    // Remove existing layers if any
    const layersToRemove = ['network-nodes', 'network-links', 'node-labels']
    layersToRemove.forEach(layerId => {
      if (map.current?.getLayer(layerId)) {
        map.current.removeLayer(layerId)
      }
    })
    
    const sourcesToRemove = ['network-nodes', 'network-links']
    sourcesToRemove.forEach(sourceId => {
      if (map.current?.getSource(sourceId)) {
        map.current.removeSource(sourceId)
      }
    })
    
    // Convert network coordinates to geographic coordinates
    const convertCoords = (x: number, y: number) => {
      if (networkData.coordinate_system?.type === 'geographic') {
        return [x, y]
      } else if (networkData.coordinate_system?.type === 'projected') {
        // Use the actual bounds from the coordinate system
        const bounds = networkData.coordinate_system.bounds
        if (bounds) {
          // UTM Zone 14N for Mexico (adjusted for the specific coordinates)
          // These coordinates appear to be in UTM Zone 14N around Veracruz area
          const utmCenterX = (bounds.minX + bounds.maxX) / 2
          const utmCenterY = (bounds.minY + bounds.maxY) / 2
          
          // More accurate conversion for UTM Zone 14N to lat/lon
          // Base point approximately at Veracruz, Mexico
          const baseLon = -96.13
          const baseLat = 19.17
          const baseUTMX = 843614.165  // Center of your bounds
          const baseUTMY = 1641939.0   // Center of your bounds
          
          // UTM scale factors (meters per degree)
          const metersPerDegreeLon = 92844.0  // at ~19° latitude
          const metersPerDegreeLat = 110946.0
          
          const lon = baseLon + (x - baseUTMX) / metersPerDegreeLon
          const lat = baseLat + (y - baseUTMY) / metersPerDegreeLat
          
          return [lon, lat]
        }
      }
      
      // Fallback to simple conversion
      const centerLon = -96.7 + (x - 840000) * 0.0000089
      const centerLat = 16.4 + (y - 1820000) * 0.0000090
      return [centerLon, centerLat]
    }
    
    // Create GeoJSON for nodes
    const nodesGeoJSON: any = {
      type: 'FeatureCollection',
      features: networkData.nodes.map(node => {
        const coords = convertCoords(node.x || 0, node.y || 0)
        
        // Get value for current parameter and time step
        let value = 0
        let color = '#999999'
        
        if (simulationResults && (selectedParameter === 'pressure' || selectedParameter === 'head')) {
          const nodeResult = simulationResults.node_results[node.id]
          if (nodeResult) {
            value = nodeResult[selectedParameter][currentTimeStep] || 0
            color = getColorForValue(value, selectedParameter)
          }
        }
        
        // Special colors for tanks and reservoirs
        if (node.type === 'tank') color = '#EF4444'
        else if (node.type === 'reservoir') color = '#10B981'
        else if (!simulationResults && node.type === 'junction') color = '#3B82F6'
        
        return {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: coords
          },
          properties: {
            id: node.id,
            label: node.label || node.id,
            type: node.type,
            color: color,
            value: value,
            selected: selectedElements.has(node.id)
          }
        }
      })
    }
    
    // Create GeoJSON for links
    const linksGeoJSON: any = {
      type: 'FeatureCollection',
      features: networkData.links.map(link => {
        const fromNode = networkData.nodes.find(n => n.id === link.from)
        const toNode = networkData.nodes.find(n => n.id === link.to)
        
        if (!fromNode || !toNode) return null
        
        const fromCoords = convertCoords(fromNode.x || 0, fromNode.y || 0)
        const toCoords = convertCoords(toNode.x || 0, toNode.y || 0)
        
        // Get value for current parameter and time step
        let value = 0
        let color = '#666666'
        let width = 2
        
        if (simulationResults && (selectedParameter === 'flow' || selectedParameter === 'velocity')) {
          const linkResult = simulationResults.link_results[link.id]
          if (linkResult) {
            const param = selectedParameter === 'flow' ? 'flowrate' : 'velocity'
            value = Math.abs(linkResult[param][currentTimeStep] || 0)
            color = getColorForValue(value, selectedParameter)
            width = Math.max(2, Math.min(8, value * 2))
          }
        } else if (!simulationResults) {
          // Default colors for links without simulation
          if (link.type === 'pump') color = '#F59E0B'
          else if (link.type === 'valve') color = '#8B5CF6'
          else color = '#6B7280'
        }
        
        return {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [fromCoords, toCoords]
          },
          properties: {
            id: link.id,
            label: link.label || link.id,
            type: link.type,
            color: color,
            width: width,
            value: value,
            selected: selectedElements.has(link.id)
          }
        }
      }).filter(Boolean)
    }
    
    // Add sources
    map.current.addSource('network-links', {
      type: 'geojson',
      data: linksGeoJSON
    })
    
    map.current.addSource('network-nodes', {
      type: 'geojson',
      data: nodesGeoJSON
    })
    
    // Add layers
    // Links layer
    map.current.addLayer({
      id: 'network-links',
      type: 'line',
      source: 'network-links',
      paint: {
        'line-color': ['get', 'color'],
        'line-width': ['get', 'width'],
        'line-opacity': 0.8
      }
    })
    
    // Nodes layer
    map.current.addLayer({
      id: 'network-nodes',
      type: 'circle',
      source: 'network-nodes',
      paint: {
        'circle-radius': [
          'case',
          ['get', 'selected'],
          12,
          8
        ],
        'circle-color': ['get', 'color'],
        'circle-stroke-width': [
          'case',
          ['get', 'selected'],
          3,
          2
        ],
        'circle-stroke-color': '#ffffff',
        'circle-opacity': 0.9
      }
    })
    
    // Labels layer
    if (showLabels) {
      map.current.addLayer({
        id: 'node-labels',
        type: 'symbol',
        source: 'network-nodes',
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 10,
          'text-offset': [0, 1.5],
          'text-anchor': 'top'
        },
        paint: {
          'text-color': '#000000',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1
        }
      })
    }
    
    // Add click handlers
    map.current.on('click', 'network-nodes', (e) => {
      if (e.features && e.features.length > 0) {
        const feature = e.features[0]
        const elementId = feature.properties?.id
        
        // Toggle selection
        const newSet = new Set(selectedElements)
        if (newSet.has(elementId)) {
          newSet.delete(elementId)
        } else {
          newSet.add(elementId)
        }
        setSelectedElements(newSet)
        
        // Update selected node info
        setSelectedNode(feature.properties)
      }
    })
    
    map.current.on('click', 'network-links', (e) => {
      if (e.features && e.features.length > 0) {
        const feature = e.features[0]
        const elementId = feature.properties?.id
        
        // Toggle selection
        const newSet = new Set(selectedElements)
        if (newSet.has(elementId)) {
          newSet.delete(elementId)
        } else {
          newSet.add(elementId)
        }
        setSelectedElements(newSet)
        
        // Update selected link info
        setSelectedLink(feature.properties)
      }
    })
    
    // Change cursor on hover
    map.current.on('mouseenter', 'network-nodes', () => {
      if (map.current) map.current.getCanvas().style.cursor = 'pointer'
    })
    
    map.current.on('mouseleave', 'network-nodes', () => {
      if (map.current) map.current.getCanvas().style.cursor = ''
    })
    
    // Fit bounds on first load or when network changes
    if (networkData.nodes.length > 0) {
      const bounds = new mapboxgl.LngLatBounds()
      let validBounds = false
      
      nodesGeoJSON.features.forEach((feature: any) => {
        if (feature.geometry.type === 'Point') {
          const coords = feature.geometry.coordinates as [number, number]
          if (isFinite(coords[0]) && isFinite(coords[1])) {
            bounds.extend(coords)
            validBounds = true
          }
        }
      })
      
      if (validBounds) {
        try {
          const sw = bounds.getSouthWest()
          const ne = bounds.getNorthEast()
          
          if (isFinite(sw.lat) && isFinite(sw.lng) && isFinite(ne.lat) && isFinite(ne.lng)) {
            // Calculate appropriate zoom level based on bounds size
            const latDiff = ne.lat - sw.lat
            const lngDiff = ne.lng - sw.lng
            let zoom = 16
            
            if (latDiff > 0.01 || lngDiff > 0.01) zoom = 14
            if (latDiff > 0.05 || lngDiff > 0.05) zoom = 12
            if (latDiff > 0.1 || lngDiff > 0.1) zoom = 11
            
            // Usar flyTo para una animación más suave desde la vista mundial
            setTimeout(() => {
              map.current?.fitBounds(bounds, { 
                padding: 100,
                maxZoom: zoom,
                duration: 2000, // Animación más larga para navegación desde vista mundial
                essential: true
              })
            }, 500) // Pequeña demora para que el mapa se cargue completamente
          }
        } catch (e) {
          console.warn('Could not fit bounds:', e)
          // Fallback: center on the network's coordinate system center
          if (networkData.coordinate_system?.type === 'projected' && networkData.coordinate_system.bounds) {
            const bounds = networkData.coordinate_system.bounds
            const centerX = (bounds.minX + bounds.maxX) / 2
            const centerY = (bounds.minY + bounds.maxY) / 2
            const [centerLon, centerLat] = convertCoords(centerX, centerY)
            
            // Usar flyTo para animación suave
            setTimeout(() => {
              map.current?.flyTo({
                center: [centerLon, centerLat],
                zoom: 14,
                duration: 2000,
                essential: true
              })
            }, 500)
          }
        }
      }
    }
  }, [currentTimeStep, selectedParameter, networkData, simulationResults, selectedElements, showLabels, getColorForValue])
  
  const formatTime = (timestep: number) => {
    const hours = Math.floor(timestep)
    const minutes = Math.round((timestep - hours) * 60)
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
  }
  
  // Map style handler
  const handleMapStyleChange = (style: string) => {
    if (!map.current) return
    
    const styles: { [key: string]: string } = {
      'light': 'mapbox://styles/mapbox/light-v11',
      'dark': 'mapbox://styles/mapbox/dark-v11',
      'streets': 'mapbox://styles/mapbox/streets-v11',
      'outdoors': 'mapbox://styles/mapbox/outdoors-v11'
      // Temporarily removed satellite style due to stability issues
      // 'satellite': 'mapbox://styles/mapbox/satellite-v9'
    }
    
    if (styles[style]) {
      map.current.setStyle(styles[style])
      setMapStyle(style)
      
      // Re-add layers after style change
      map.current.once('styledata', () => {
        if (networkData) {
          updateVisualization()
        }
      })
    }
  }
  
  return (
    <div className="flex h-full bg-background">
      {/* Left Control Panel */}
      <div className="w-80 border-r border-border flex flex-col bg-card">
        {/* Header */}
        <div className="p-4 border-b border-border">
          <h2 className="text-lg font-semibold">WNTR Network Analysis</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {networkData ? networkData.name : 'No network loaded'}
          </p>
        </div>
        
        {/* File Controls */}
        <div className="p-4 border-b border-border space-y-2">
          <button
            onClick={handleFileUpload}
            disabled={loading}
            className={cn(
              "w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg",
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
                  "w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg",
                  "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                  "transition-colors disabled:opacity-50"
                )}
              >
                <BarChart3 className="w-4 h-4" />
                Run Simulation
              </button>
              
              {/* Center on Network button */}
              <button
                onClick={() => {
                  if (!map.current || !networkData) return
                  
                  if (networkData.coordinate_system?.bounds) {
                    const bounds = networkData.coordinate_system.bounds
                    const centerX = (bounds.minX + bounds.maxX) / 2
                    const centerY = (bounds.minY + bounds.maxY) / 2
                    
                    // Convert UTM to lat/lon using our conversion function
                    const baseLon = -96.13
                    const baseLat = 19.17
                    const baseUTMX = 843614.165
                    const baseUTMY = 1641939.0
                    const metersPerDegreeLon = 92844.0
                    const metersPerDegreeLat = 110946.0
                    
                    const centerLon = baseLon + (centerX - baseUTMX) / metersPerDegreeLon
                    const centerLat = baseLat + (centerY - baseUTMY) / metersPerDegreeLat
                    
                    map.current.flyTo({
                      center: [centerLon, centerLat],
                      zoom: 14,
                      duration: 1500
                    })
                  }
                }}
                className={cn(
                  "w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg mt-2",
                  "bg-accent text-accent-foreground hover:bg-accent/80",
                  "transition-colors"
                )}
              >
                <Layers className="w-4 h-4" />
                Center on Network
              </button>
            </>
          )}
        </div>
        
        {/* Map Style Selector */}
        <div className="p-4 border-b border-border">
          <label className="text-sm font-medium mb-2 block">
            <Map className="w-4 h-4 inline-block mr-2" />
            Map Style
          </label>
          <select 
            value={mapStyle} 
            onChange={(e) => handleMapStyleChange(e.target.value)}
            className={cn(
              "w-full px-3 py-2 rounded-lg",
              "bg-background border border-border hover:border-primary/50",
              "transition-colors text-sm"
            )}
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="streets">Streets</option>
            <option value="outdoors">Outdoors</option>
            {/* Temporarily disabled due to stability issues
            <option value="satellite">Satellite</option>
            */}
          </select>
        </div>
        
        {/* Network Summary */}
        {networkData && (
          <div className="p-4 border-b border-border space-y-2">
            <h3 className="text-sm font-medium mb-2">Network Summary</h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Junctions:</span>
                <span>{networkData.summary.junctions}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tanks:</span>
                <span>{networkData.summary.tanks}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Reservoirs:</span>
                <span>{networkData.summary.reservoirs}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pipes:</span>
                <span>{networkData.summary.pipes}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pumps:</span>
                <span>{networkData.summary.pumps}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Valves:</span>
                <span>{networkData.summary.valves}</span>
              </div>
            </div>
              
              {/* Debug info */}
              {process.env.NODE_ENV === 'development' && (
                <div className="mt-2 p-2 bg-muted/50 rounded text-xs">
                  <p>Nodes: {networkData.nodes?.length || 0}</p>
                  <p>Links: {networkData.links?.length || 0}</p>
                  <p>Map: {map.current ? 'Initialized' : 'Not initialized'}</p>
                  {networkData.coordinate_system?.bounds && (
                    <>
                      <p>X: {networkData.coordinate_system.bounds.minX.toFixed(0)} - {networkData.coordinate_system.bounds.maxX.toFixed(0)}</p>
                      <p>Y: {networkData.coordinate_system.bounds.minY.toFixed(0)} - {networkData.coordinate_system.bounds.maxY.toFixed(0)}</p>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Time Control */}
        {simulationResults && (
          <div className="p-4 border-b border-border space-y-4">
            <div>
              <label className="text-sm font-medium">Simulation Time</label>
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className={cn(
                    "p-2 rounded-lg",
                    "bg-secondary hover:bg-secondary/80 transition-colors"
                  )}
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => setCurrentTimeStep(0)}
                  className={cn(
                    "p-2 rounded-lg",
                    "bg-secondary hover:bg-secondary/80 transition-colors"
                  )}
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <span className="text-sm font-mono flex-1 text-center">
                  {formatTime(simulationResults.timestamps[currentTimeStep])}
                </span>
              </div>
              
              <Slider.Root
                value={[currentTimeStep]}
                onValueChange={([value]) => setCurrentTimeStep(value)}
                max={simulationResults.timestamps.length - 1}
                step={1}
                className="relative flex items-center select-none touch-none w-full h-5 mt-2"
              >
                <Slider.Track className="bg-secondary relative grow rounded-full h-[3px]">
                  <Slider.Range className="absolute bg-primary rounded-full h-full" />
                </Slider.Track>
                <Slider.Thumb
                  className="block w-5 h-5 bg-primary rounded-full hover:bg-primary/90 focus:outline-none"
                  aria-label="Time"
                />
              </Slider.Root>
            </div>
            
            <div>
              <label className="text-sm font-medium">Animation Speed</label>
              <Select.Root value={playSpeed.toString()} onValueChange={(v) => setPlaySpeed(parseInt(v))}>
                <Select.Trigger className="w-full mt-1 px-3 py-2 rounded-lg bg-input border border-border text-sm">
                  <Select.Value />
                </Select.Trigger>
                <Select.Portal>
                  <Select.Content className="bg-popover rounded-lg shadow-lg border border-border">
                    <Select.Viewport className="p-1">
                      <Select.Item value="2000" className="px-3 py-1 rounded hover:bg-accent cursor-pointer">
                        <Select.ItemText>0.5x</Select.ItemText>
                      </Select.Item>
                      <Select.Item value="1000" className="px-3 py-1 rounded hover:bg-accent cursor-pointer">
                        <Select.ItemText>1x</Select.ItemText>
                      </Select.Item>
                      <Select.Item value="500" className="px-3 py-1 rounded hover:bg-accent cursor-pointer">
                        <Select.ItemText>2x</Select.ItemText>
                      </Select.Item>
                      <Select.Item value="250" className="px-3 py-1 rounded hover:bg-accent cursor-pointer">
                        <Select.ItemText>4x</Select.ItemText>
                      </Select.Item>
                    </Select.Viewport>
                  </Select.Content>
                </Select.Portal>
              </Select.Root>
            </div>
          </div>
        )}
        
        {/* Parameter Selection */}
        <div className="p-4 border-b border-border space-y-4">
          <div>
            <label className="text-sm font-medium">Display Parameter</label>
            <Select.Root value={selectedParameter} onValueChange={(v: any) => setSelectedParameter(v)}>
              <Select.Trigger className="w-full mt-1 px-3 py-2 rounded-lg bg-input border border-border text-sm">
                <Select.Value />
              </Select.Trigger>
              <Select.Portal>
                <Select.Content className="bg-popover rounded-lg shadow-lg border border-border">
                  <Select.Viewport className="p-1">
                    <Select.Item value="pressure" className="px-3 py-1 rounded hover:bg-accent cursor-pointer">
                      <Select.ItemText>Pressure</Select.ItemText>
                    </Select.Item>
                    <Select.Item value="head" className="px-3 py-1 rounded hover:bg-accent cursor-pointer">
                      <Select.ItemText>Head</Select.ItemText>
                    </Select.Item>
                    <Select.Item value="flow" className="px-3 py-1 rounded hover:bg-accent cursor-pointer">
                      <Select.ItemText>Flow Rate</Select.ItemText>
                    </Select.Item>
                    <Select.Item value="velocity" className="px-3 py-1 rounded hover:bg-accent cursor-pointer">
                      <Select.ItemText>Velocity</Select.ItemText>
                    </Select.Item>
                  </Select.Viewport>
                </Select.Content>
              </Select.Portal>
            </Select.Root>
          </div>
          
          {/* Display Options */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Display Options</label>
            <div className="flex items-center justify-between">
              <span className="text-sm">Show Labels</span>
              <button
                onClick={() => setShowLabels(!showLabels)}
                className={cn(
                  "p-1 rounded",
                  showLabels ? "text-primary" : "text-muted-foreground"
                )}
              >
                {showLabels ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </button>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Show Legend</span>
              <button
                onClick={() => setShowLegend(!showLegend)}
                className={cn(
                  "p-1 rounded",
                  showLegend ? "text-primary" : "text-muted-foreground"
                )}
              >
                {showLegend ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
        
        {/* Network Summary and Content */}
        <div className="p-4 flex-1 overflow-y-auto">
          {networkData && (
            <>
              <h3 className="text-sm font-medium mb-3">Network Summary</h3>
              <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Junctions</span>
                <span className="font-medium">{networkData.summary.junctions}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tanks</span>
                <span className="font-medium">{networkData.summary.tanks}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Reservoirs</span>
                <span className="font-medium">{networkData.summary.reservoirs}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pipes</span>
                <span className="font-medium">{networkData.summary.pipes}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pumps</span>
                <span className="font-medium">{networkData.summary.pumps}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Valves</span>
                <span className="font-medium">{networkData.summary.valves}</span>
              </div>
            </div>
            
            {/* Selected Elements */}
            {selectedElements.size > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-medium mb-3">
                  Selected Elements ({selectedElements.size})
                </h3>
                <div className="space-y-1 text-sm max-h-40 overflow-y-auto">
                  {Array.from(selectedElements).map(id => (
                    <div key={id} className="flex justify-between items-center py-1">
                      <span className="text-muted-foreground">{id}</span>
                      <button
                        onClick={() => {
                          const newSet = new Set(selectedElements)
                          newSet.delete(id)
                          setSelectedElements(newSet)
                        }}
                        className="text-xs text-muted-foreground hover:text-destructive"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            </>
          )}
        </div>
      </div>
      
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col">
        {/* Map Container */}
        <div className={cn(
          "flex-1 relative",
          showTimeSeries ? "h-[60%]" : "h-full"
        )}>
          {!MAPBOX_ACCESS_TOKEN ? (
            <div className="w-full h-full flex items-center justify-center bg-muted/20">
            <div className="text-center max-w-md p-8">
              <h3 className="text-xl font-semibold mb-2">Mapbox Configuration Required</h3>
              <p className="text-muted-foreground">
                Please configure VITE_MAPBOX_ACCESS_TOKEN in your .env file
              </p>
            </div>
          </div>
        ) : error ? (
          <div className="w-full h-full flex items-center justify-center bg-muted/20 p-8">
            <div className="text-center max-w-2xl">
              <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">Error Loading Network</h3>
              <p className="text-muted-foreground mb-4">{error}</p>
              <button
                onClick={() => {
                  setError(null)
                  setNetworkData(null)
                }}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
              >
                Try Again
              </button>
            </div>
          </div>
        ) : (
          <div ref={mapContainer} className="w-full h-full min-h-[400px]" />
        )}
          
          {/* Legend */}
          {showLegend && simulationResults && (
            <div className="absolute top-4 left-4 bg-background/95 backdrop-blur-sm rounded-lg p-4 shadow-lg border border-border">
              <h3 className="text-sm font-medium mb-2">
                {selectedParameter.charAt(0).toUpperCase() + selectedParameter.slice(1)}
                {' '}({colorScale[selectedParameter].unit})
              </h3>
              <div className="w-48 h-6 rounded" style={{
                background: 'linear-gradient(to right, #0000FF, #00FF00, #FFFF00, #FF0000)'
              }} />
              <div className="flex justify-between text-xs mt-1">
                <span>{colorScale[selectedParameter].min.toFixed(1)}</span>
                <span>{colorScale[selectedParameter].max.toFixed(1)}</span>
              </div>
            </div>
          )}
          
          {/* Loading Overlay */}
          {loading && (
            <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          )}
          
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
        
        {/* Time Series Panel */}
        {showTimeSeries && simulationResults && (
          <div className="h-[40%] border-t border-border bg-card">
            <div className="h-full p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium">Time Series Analysis</h3>
                <button
                  onClick={() => setShowTimeSeries(false)}
                  className="p-1 rounded hover:bg-accent"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>
              
              <div className="h-[calc(100%-3rem)]">
                {!chartJSLoaded ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    Loading chart components...
                  </div>
                ) : selectedElements.size === 0 ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    Select elements on the map to view time series data
                  </div>
                ) : Line ? (
                <Line
                  data={{
                    labels: simulationResults.timestamps.map(t => formatTime(t)),
                    datasets: Array.from(selectedElements).map((elementId, idx) => {
                      const colors = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6']
                      const isNode = networkData?.nodes.some(n => n.id === elementId)
                      
                      let data: number[] = []
                      if (isNode) {
                        if (selectedParameter === 'pressure' || selectedParameter === 'head') {
                          data = simulationResults.timestamps.map((_, i) => 
                            simulationResults.node_results[elementId]?.[selectedParameter]?.[i] || 0
                          )
                        }
                      } else {
                        if (selectedParameter === 'flow' || selectedParameter === 'velocity') {
                          data = simulationResults.timestamps.map((_, i) => 
                            simulationResults.link_results[elementId]?.[
                              selectedParameter === 'flow' ? 'flowrate' : 'velocity'
                            ]?.[i] || 0
                          )
                        }
                      }
                      
                      return {
                        label: elementId,
                        data: data,
                        borderColor: colors[idx % colors.length],
                        backgroundColor: colors[idx % colors.length] + '20',
                        tension: 0.1
                      }
                    })
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        position: 'top' as const,
                      },
                      title: {
                        display: true,
                        text: `${selectedParameter.charAt(0).toUpperCase() + selectedParameter.slice(1)} Over Time`
                      }
                    },
                    scales: {
                      x: {
                        title: {
                          display: true,
                          text: 'Time (HH:MM)'
                        }
                      },
                      y: {
                        title: {
                          display: true,
                          text: `${selectedParameter} (${colorScale[selectedParameter].unit})`
                        }
                      }
                    },
                    interaction: {
                      mode: 'index' as const,
                      intersect: false,
                    },
                    elements: {
                      line: {
                        borderWidth: 2
                      },
                      point: {
                        radius: 0,
                        hoverRadius: 4
                      }
                    }
                  }}
                />
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    Chart component failed to load
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        
        {/* Show Time Series Button */}
        {!showTimeSeries && simulationResults && (
          <button
            onClick={() => setShowTimeSeries(true)}
            className={cn(
              "absolute bottom-4 left-1/2 -translate-x-1/2",
              "px-4 py-2 rounded-lg bg-background/90 backdrop-blur-sm",
              "border border-border hover:bg-accent transition-colors",
              "flex items-center gap-2"
            )}
          >
            <ChevronUp className="w-4 h-4" />
            Show Time Series
          </button>
        )}
      </div>
    </div>
  )
}