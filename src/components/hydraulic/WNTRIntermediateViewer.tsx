import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import {
  FileUp,
  Play,
  BarChart3,
  Loader2,
  AlertCircle,
  Map,
  Layers
} from 'lucide-react'
import { cn } from '@/utils/cn'

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

export function WNTRIntermediateViewer() {
  const { t } = useTranslation()
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  
  const [networkData, setNetworkData] = useState<NetworkData | null>(null)
  const [mapStyle, setMapStyle] = useState('light')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [simulationResults, setSimulationResults] = useState<any>(null)
  const [selectedParameter, setSelectedParameter] = useState('pressure')

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return
    
    try {
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/light-v11',
        center: [0, 20],
        zoom: 2
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

  const convertCoords = useCallback((x: number, y: number) => {
    if (!networkData?.coordinate_system) return [x, y]
    
    if (networkData.coordinate_system.type === 'projected' && networkData.coordinate_system.bounds) {
      const bounds = networkData.coordinate_system.bounds
      const baseLon = -96.13
      const baseLat = 19.17
      const baseUTMX = (bounds.minX + bounds.maxX) / 2
      const baseUTMY = (bounds.minY + bounds.maxY) / 2
      const metersPerDegreeLon = 92844.0
      const metersPerDegreeLat = 110946.0
      
      const lon = baseLon + (x - baseUTMX) / metersPerDegreeLon
      const lat = baseLat + (y - baseUTMY) / metersPerDegreeLat
      
      return [lon, lat]
    }
    return [x, y]
  }, [networkData])

  const updateVisualization = useCallback(() => {
    if (!map.current || !networkData) return

    // Remove existing layers
    ['network-nodes', 'network-links'].forEach(id => {
      if (map.current?.getLayer(id)) map.current.removeLayer(id)
      if (map.current?.getSource(id)) map.current.removeSource(id)
    })

    // Create GeoJSON for nodes
    const nodesGeoJSON = {
      type: 'FeatureCollection',
      features: networkData.nodes.map(node => {
        let color = '#3B82F6' // Default blue for junctions
        if (node.type === 'tank') color = '#EF4444'
        else if (node.type === 'reservoir') color = '#10B981'
        
        return {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: convertCoords(node.x || 0, node.y || 0)
          },
          properties: {
            id: node.id,
            type: node.type,
            color: color
          }
        }
      })
    }

    // Create GeoJSON for links
    const linksGeoJSON = {
      type: 'FeatureCollection',
      features: networkData.links.map(link => {
        const fromNode = networkData.nodes.find(n => n.id === link.from)
        const toNode = networkData.nodes.find(n => n.id === link.to)
        
        if (fromNode && toNode) {
          let color = '#6B7280' // Default gray for pipes
          if (link.type === 'pump') color = '#F59E0B'
          else if (link.type === 'valve') color = '#8B5CF6'
          
          return {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: [
                convertCoords(fromNode.x || 0, fromNode.y || 0),
                convertCoords(toNode.x || 0, toNode.y || 0)
              ]
            },
            properties: {
              id: link.id,
              type: link.type,
              color: color
            }
          }
        }
        return null
      }).filter(Boolean)
    }

    // Add sources and layers
    map.current.addSource('network-links', {
      type: 'geojson',
      data: linksGeoJSON as any
    })

    map.current.addSource('network-nodes', {
      type: 'geojson',
      data: nodesGeoJSON as any
    })

    map.current.addLayer({
      id: 'network-links',
      type: 'line',
      source: 'network-links',
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 2
      }
    })

    map.current.addLayer({
      id: 'network-nodes',
      type: 'circle',
      source: 'network-nodes',
      paint: {
        'circle-radius': 6,
        'circle-color': ['get', 'color'],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff'
      }
    })

    // Fit bounds if first load
    if (networkData.coordinate_system?.bounds) {
      const bounds = networkData.coordinate_system.bounds
      const sw = convertCoords(bounds.minX, bounds.minY)
      const ne = convertCoords(bounds.maxX, bounds.maxY)
      
      // Wait for map to be fully loaded before fitting bounds
      const tryFitBounds = () => {
        if (map.current?.loaded()) {
          try {
            map.current.fitBounds([sw, ne], {
              padding: 100,
              maxZoom: 14,
              duration: 2000
            })
          } catch (e) {
            console.warn('Could not fit bounds:', e)
          }
        } else {
          // Retry after a short delay
          setTimeout(tryFitBounds, 100)
        }
      }
      
      setTimeout(tryFitBounds, 100)
    }
  }, [networkData, convertCoords])

  // Update visualization when network data changes
  useEffect(() => {
    if (networkData) {
      updateVisualization()
    }
  }, [networkData, updateVisualization])

  const handleFileUpload = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const result = await window.electronAPI.wntr.loadINPFile()
      
      if (result.success && result.data) {
        setNetworkData(result.data)
        setSimulationResults(null)
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
        simulationType: 'single'
      })
      
      if (result.success && result.data) {
        setSimulationResults(result.data)
        setError(null)
        
        // Check for warnings
        if (result.warning) {
          // Show warning to user
          console.warn('Simulation warning:', result.warning)
          setWarning(`${result.warning.message}\n\n${result.warning.details}`)
        } else {
          setWarning(null)
        }
      } else {
        setError(result.error || 'Simulation failed')
        setWarning(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Simulation failed')
    } finally {
      setLoading(false)
    }
  }

  const handleMapStyleChange = (style: string) => {
    if (!map.current) return
    
    const styles: { [key: string]: string } = {
      'light': 'mapbox://styles/mapbox/light-v11',
      'dark': 'mapbox://styles/mapbox/dark-v11',
      'streets': 'mapbox://styles/mapbox/streets-v11',
      'outdoors': 'mapbox://styles/mapbox/outdoors-v11'
    }
    
    if (styles[style]) {
      try {
        // Store current center and zoom
        const center = map.current.getCenter()
        const zoom = map.current.getZoom()
        
        // Change style
        map.current.setStyle(styles[style])
        setMapStyle(style)
        
        // Re-apply view and data after style loads
        map.current.once('style.load', () => {
          // Restore view
          map.current!.setCenter(center)
          map.current!.setZoom(zoom)
          
          // Re-add data
          setTimeout(() => {
            updateVisualization()
          }, 100)
        })
      } catch (e) {
        console.warn('Style change warning:', e)
      }
    }
  }

  const centerOnNetwork = () => {
    if (!map.current || !networkData?.coordinate_system?.bounds) return
    
    if (!map.current.loaded()) {
      console.warn('Map not fully loaded yet')
      return
    }
    
    try {
      const bounds = networkData.coordinate_system.bounds
      const sw = convertCoords(bounds.minX, bounds.minY)
      const ne = convertCoords(bounds.maxX, bounds.maxY)
      
      map.current.fitBounds([sw, ne], {
        padding: 100,
        maxZoom: 14,
        duration: 1500
      })
    } catch (e) {
      console.warn('Could not center on network:', e)
    }
  }

  return (
    <div className="flex h-full bg-background">
      {/* Left Control Panel */}
      <div className="w-80 border-r border-border flex flex-col bg-card">
        <div className="p-4 border-b border-border">
          <h2 className="text-lg font-semibold">WNTR Network Analysis</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {networkData ? networkData.name : 'No network loaded'}
          </p>
        </div>
        
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
              
              <button
                onClick={centerOnNetwork}
                className={cn(
                  "w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg",
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
          </select>
        </div>
        
        {networkData && (
          <div className="p-4 flex-1 overflow-y-auto">
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
            
            {simulationResults && (
              <div className="mt-4 p-3 bg-green-100 dark:bg-green-900/20 rounded">
                <p className="text-sm text-green-700 dark:text-green-400">
                  Simulation completed successfully
                </p>
              </div>
            )}
          </div>
        )}
        
        {error && (
          <div className="p-4">
            <div className="flex items-start gap-2 p-3 bg-destructive/10 text-destructive rounded-lg">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <p className="text-sm whitespace-pre-line">{error}</p>
            </div>
          </div>
        )}
        
        {warning && !error && (
          <div className="p-4">
            <div className="flex items-start gap-2 p-3 bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 rounded-lg">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <p className="text-sm whitespace-pre-line">{warning}</p>
            </div>
          </div>
        )}
      </div>
      
      {/* Map Container */}
      <div className="flex-1 relative">
        {!MAPBOX_ACCESS_TOKEN ? (
          <div className="flex items-center justify-center h-full bg-muted">
            <div className="text-center">
              <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-lg font-medium">No Mapbox Access Token</p>
              <p className="text-sm text-muted-foreground mt-2">
                Please set VITE_MAPBOX_ACCESS_TOKEN in your .env file
              </p>
            </div>
          </div>
        ) : (
          <>
            <div ref={mapContainer} className="w-full h-full" />
            {loading && (
              <div className="absolute inset-0 bg-background/50 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}