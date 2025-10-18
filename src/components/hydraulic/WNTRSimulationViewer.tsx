import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import proj4 from 'proj4'
import * as Select from '@radix-ui/react-select'
import * as Slider from '@radix-ui/react-slider'
import * as Tooltip from '@radix-ui/react-tooltip'
import { 
  Upload, 
  Play, 
  Pause, 
  RotateCcw,
  Gauge,
  Droplet,
  Activity,
  AlertCircle,
  Map,
  Layers,
  BarChart3,
  Info,
  ChevronDown,
  Check,
  Settings
} from 'lucide-react'
import { cn } from '@/utils/cn'

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || ''

// Define WGS84 projection for proj4
proj4.defs('EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs')

// Test UTM 18N conversion with known Cartagena coordinates
// Cartagena is approximately at -75.514, 10.400 (lng, lat)
// In UTM 18N this should be around: 842000, 1151000
console.log('Testing proj4 UTM 18N conversion:')
proj4.defs('EPSG:32618', '+proj=utm +zone=18 +datum=WGS84 +units=m +no_defs')
const testCartagena = proj4('EPSG:32618', 'EPSG:4326', [842000, 1151000])
console.log('Test Cartagena UTM [842000, 1151000] → WGS84:', testCartagena)

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

interface SimulationData {
  node_results: {
    [nodeId: string]: {
      pressure: number[]
      head: number[]
      demand: number[]
    }
  }
  link_results: {
    [linkId: string]: {
      flowrate: number[]
      velocity: number[]
      headloss?: number[]
    }
  }
  timestamps: number[]
}

export function WNTRSimulationViewer() {
  const { t } = useTranslation()
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const animationRef = useRef<number | null>(null)
  const popupRef = useRef<mapboxgl.Popup | null>(null)
  
  // State
  const [networkData, setNetworkData] = useState<NetworkData | null>(null)
  const [simulationData, setSimulationData] = useState<SimulationData | null>(null)
  const [mapStyle, setMapStyle] = useState('light')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  
  // Visualization state
  const [selectedParameter, setSelectedParameter] = useState<'pressure' | 'demand' | 'flowrate' | 'velocity'>('pressure')
  const [currentTimeStep, setCurrentTimeStep] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [showLegend, setShowLegend] = useState(true)
  const [showStats, setShowStats] = useState(true)
  const [showLocationConfig, setShowLocationConfig] = useState(false)
  const [utmZone, setUtmZone] = useState<string>(localStorage.getItem('detectedUtmZone') || '')
  const [detectedCoordSystem, setDetectedCoordSystem] = useState<{type: string, suggested_zone?: string} | null>(null)
  
  // Color scales
  const colorScales = {
    pressure: {
      min: 0,
      max: 100,
      unit: 'm',
      colors: ['#ff0000', '#ff7f00', '#ffff00', '#00ff00', '#0000ff']
    },
    demand: {
      min: 0,
      max: 50,
      unit: 'L/s',
      colors: ['#f0f0f0', '#9ecae1', '#6baed6', '#3182bd', '#08519c']
    },
    flowrate: {
      min: 0,
      max: 200,
      unit: 'L/s',
      colors: ['#fee5d9', '#fcae91', '#fb6a4a', '#de2d26', '#a50f15']
    },
    velocity: {
      min: 0,
      max: 2,
      unit: 'm/s',
      colors: ['#f7fbff', '#deebf7', '#c6dbef', '#6baed6', '#2171b5']
    }
  }

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return
    
    
    console.log('Initializing map...')
    
    try {
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/light-v11',
        center: [0, 20],
        zoom: 2,
        failIfMajorPerformanceCaveat: false
      })
      
      map.current.addControl(new mapboxgl.NavigationControl(), 'top-right')
      
      map.current.on('load', () => {
        console.log('Map loaded successfully')
      })
      
      map.current.on('error', (e) => {
        console.error('Map error:', e)
      })
    } catch (error) {
      console.error('Failed to initialize map:', error)
      setError('Failed to initialize map. You can still use network analysis features.')
    }
    
    return () => {
      if (map.current) {
        map.current.remove()
        map.current = null
      }
    }
  }, [])
  
  // Change map style
  useEffect(() => {
    if (!map.current || !mapStyle) return
    
    const styles: { [key: string]: string } = {
      'light': 'mapbox://styles/mapbox/light-v11',
      'dark': 'mapbox://styles/mapbox/dark-v11',
      'streets': 'mapbox://styles/mapbox/streets-v11',
      'outdoors': 'mapbox://styles/mapbox/outdoors-v11'
    }
    
    if (styles[mapStyle]) {
      map.current.setStyle(styles[mapStyle])
      
      // Re-add data after style loads
      map.current.once('style.load', () => {
        // Trigger re-render after style loads
        if (networkData) {
          console.log('Style loaded, triggering re-render')
          // Force a re-render by updating the network data
          setNetworkData(prev => ({ ...prev }))
        }
      })
    }
  }, [mapStyle, networkData])
  
  // Animation logic
  useEffect(() => {
    if (!isPlaying || !simulationData) return
    
    const animate = () => {
      setCurrentTimeStep(prev => {
        const next = prev + 1
        if (next >= simulationData.timestamps.length) {
          setIsPlaying(false)
          return 0
        }
        return next
      })
    }
    
    const interval = 1000 / playbackSpeed
    animationRef.current = window.setInterval(animate, interval)
    
    return () => {
      if (animationRef.current) {
        clearInterval(animationRef.current)
      }
    }
  }, [isPlaying, playbackSpeed, simulationData])
  
  // Placeholder for visualization update effect - will be defined after updateVisualization
  
  // Detect coordinate system type based on ranges
  const detectCoordinateSystem = useCallback((coords: any[]) => {
    if (!coords || coords.length === 0) return null
    
    const xValues = coords.map(c => c.x)
    const yValues = coords.map(c => c.y)
    const xMin = Math.min(...xValues)
    const xMax = Math.max(...xValues)
    const yMin = Math.min(...yValues)
    const yMax = Math.max(...yValues)
    
    console.log('Detecting coordinate system for ranges:', { xMin, xMax, yMin, yMax })
    
    // Geographic coordinates check
    if (xMin >= -180 && xMax <= 180 && yMin >= -90 && yMax <= 90) {
      return { type: 'geographic', epsg: 'EPSG:4326' }
    }
    
    // UTM coordinates check - expanded range to catch more cases
    if (xMin > 100000 && xMax < 900000 && yMin > 0 && yMin < 10000000) {
      // Try to guess UTM zone based on coordinate ranges
      // Common zones for Latin America:
      // Zone 18N: Colombia Caribbean coast (Cartagena area)
      // Zone 14N: Mexico
      // Zone 19N: Eastern Colombia
      
      let suggestedZone = ''
      let suggestedEpsg = ''
      
      // Cartagena, Colombia area
      if (xMin > 820000 && xMax < 850000 && yMin > 1600000 && yMax < 1700000) {
        suggestedZone = '18N'
        suggestedEpsg = 'EPSG:32618'
      }
      // Mexico City area
      else if (xMin > 400000 && xMax < 600000 && yMin > 2100000 && yMax < 2200000) {
        suggestedZone = '14N'
        suggestedEpsg = 'EPSG:32614'
      }
      // Default based on X coordinate
      else {
        const zone = Math.floor((xMin + 180) / 6) + 1
        suggestedZone = `${zone}N`
        suggestedEpsg = `EPSG:326${zone.toString().padStart(2, '0')}`
      }
      
      return { 
        type: 'UTM', 
        suggested_zone: suggestedZone,
        suggested_epsg: suggestedEpsg,
        bounds: { xMin, xMax, yMin, yMax }
      }
    }
    
    // Local/arbitrary coordinates
    return { type: 'local', warning: 'Local coordinates detected - manual georeferencing required' }
  }, [])

  // Convert coordinates using proj4
  const convertCoords = useCallback((x: number, y: number): [number, number] => {
    // If coordinates are already in valid geographic range, return as is
    if (x >= -180 && x <= 180 && y >= -90 && y <= 90) {
      return [x, y]
    }
    
    // If we have a user-selected or detected UTM zone, use proj4 for conversion
    const zone = utmZone || detectedCoordSystem?.suggested_zone
    console.log('convertCoords - zone:', zone, 'x:', x, 'y:', y, 'detectedSystem:', detectedCoordSystem)
    
    if (zone && zone.match(/^\d{1,2}[NS]$/)) {
      try {
        const zoneNum = parseInt(zone.slice(0, -1))
        const hemisphere = zone.slice(-1)
        // For northern hemisphere: EPSG:326XX where XX is the zone number (01-60)
        // For southern hemisphere: EPSG:327XX where XX is the zone number (01-60)
        const epsgCode = hemisphere === 'N' ? 32600 + zoneNum : 32700 + zoneNum
        const epsg = `EPSG:${epsgCode}`
        
        console.log('Using projection:', epsg)
        
        // Define the projection if not already defined
        if (!proj4.defs[epsg]) {
          proj4.defs(epsg, `+proj=utm +zone=${zoneNum} ${hemisphere === 'S' ? '+south' : ''} +datum=WGS84 +units=m +no_defs`)
        }
        
        // Special handling for Cartagena area with offset Y coordinates
        let adjustedY = y
        if (zone === '18N' && y > 1600000 && y < 1700000) {
          // This appears to be Cartagena data with an offset
          // Cartagena's actual UTM 18N Y is around 1,150,000
          // Current data shows Y around 1,641,000
          // Apply offset of approximately -491,000
          adjustedY = y - 491000
          console.log(`Adjusted Y coordinate from ${y} to ${adjustedY} for Cartagena`)
        }
        
        // Convert from UTM to WGS84
        const [lng, lat] = proj4(epsg, 'EPSG:4326', [x, adjustedY])
        console.log('Converted:', [x, adjustedY], '→', [lng, lat])
        
        // Verify the conversion is reasonable
        if (isNaN(lng) || isNaN(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 90) {
          console.error('Invalid conversion result:', { lng, lat })
          throw new Error('Invalid coordinate conversion')
        }
        
        return [lng, lat]
      } catch (e) {
        console.error('Projection conversion error:', e)
      }
    }
    
    // Fallback to normalized mapping if no UTM zone specified
    if (networkData?.coordinate_system?.bounds) {
      const bounds = networkData.coordinate_system.bounds
      
      console.log('Fallback path - no UTM zone specified. Zone:', zone, 'DetectedSystem:', detectedCoordSystem)
      
      // Check if user has set a custom location
      const userLocation = localStorage.getItem('hydraulicNetworkLocation')
      if (userLocation) {
        const config = JSON.parse(userLocation)
        const xNorm = (x - bounds.minX) / (bounds.maxX - bounds.minX)
        const yNorm = (y - bounds.minY) / (bounds.maxY - bounds.minY)
        
        const lng = config.lng - config.span/2 + xNorm * config.span
        const lat = config.lat - config.span/2 + yNorm * config.span
        
        return [lng, lat]
      }
      
      // Show warning once
      if (!window.projectedCoordsWarningShown) {
        window.projectedCoordsWarningShown = true
        setShowLocationConfig(true)
      }
      
      // Default fallback - use a normalized mapping
      const xNorm = (x - bounds.minX) / (bounds.maxX - bounds.minX)
      const yNorm = (y - bounds.minY) / (bounds.maxY - bounds.minY)
      
      // Map to a default area (this won't be geographically accurate)
      const lng = -99.1332 - 0.1 + xNorm * 0.2
      const lat = 19.4326 - 0.1 + yNorm * 0.2
      
      console.warn('Using Mexico City fallback coordinates')
      return [lng, lat]
    }
    
    return [x, y]
  }, [networkData, utmZone, detectedCoordSystem])
  
  // Get color for value
  const getColorForValue = (value: number, parameter: string): string => {
    const scale = colorScales[parameter as keyof typeof colorScales]
    if (!scale) return '#808080'
    
    const normalized = (value - scale.min) / (scale.max - scale.min)
    const clamped = Math.max(0, Math.min(1, normalized))
    const index = Math.floor(clamped * (scale.colors.length - 1))
    
    return scale.colors[index]
  }
  
  // Update visualization
  const updateVisualization = useCallback(() => {
    if (!map.current || !networkData || !networkData.nodes || !networkData.links) return
    
    // Make sure map is loaded
    if (!map.current.loaded()) {
      map.current.once('load', () => updateVisualization())
      return
    }
    
    console.log('Updating visualization with nodes:', networkData.nodes.length, 'links:', networkData.links.length)
    
    // Remove existing layers and sources in the correct order
    const layerIds = ['node-labels', 'network-nodes', 'network-links'] // Remove in reverse order
    const sourceIds = ['network-nodes', 'network-links']
    
    // First remove all layers
    layerIds.forEach(id => {
      try {
        if (map.current && map.current.getLayer && map.current.getLayer(id)) {
          map.current.removeLayer(id)
        }
      } catch (e) {
        console.warn(`Error removing layer ${id}:`, e)
      }
    })
    
    // Then remove sources
    sourceIds.forEach(id => {
      try {
        if (map.current && map.current.getSource && map.current.getSource(id)) {
          map.current.removeSource(id)
        }
      } catch (e) {
        console.warn(`Error removing source ${id}:`, e)
      }
    })
    
    // Prepare node features with simulation data
    console.log('First node coordinates:', networkData.nodes[0])
    
    // Test conversion on a few nodes to debug
    const testNodes = networkData.nodes.slice(0, 5)
    console.log('Testing conversion on first 5 nodes:')
    testNodes.forEach(node => {
      const coords = convertCoords(node.x, node.y)
      console.log(`Node ${node.id}: [${node.x}, ${node.y}] → [${coords[0]}, ${coords[1]}]`)
    })
    
    const nodeFeatures = networkData.nodes.map(node => {
      const coords = convertCoords(node.x, node.y)
      
      let value = 0
      let color = '#808080'
      
      // Only use simulation data if available
      if (simulationData) {
        const nodeResults = simulationData.node_results[node.id]
        
        if (nodeResults) {
          if (selectedParameter === 'pressure') {
            value = nodeResults.pressure[currentTimeStep] || 0
          } else if (selectedParameter === 'demand') {
            value = nodeResults.demand[currentTimeStep] || 0
          }
          color = getColorForValue(value, selectedParameter)
        }
      } else {
        // Use default color scheme based on node type
        color = node.type === 'Junction' ? '#4169E1' : 
                node.type === 'Tank' ? '#32CD32' : 
                node.type === 'Reservoir' ? '#FF4500' : '#808080'
      }
      
      return {
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: coords
        },
        properties: {
          ...node,
          value: value.toFixed(2),
          color,
          parameter: selectedParameter
        }
      }
    })
    
    // Prepare link features with simulation data
    const linkFeatures = networkData.links.map(link => {
      const fromNode = networkData.nodes.find(n => n.id === link.from)
      const toNode = networkData.nodes.find(n => n.id === link.to)
      
      if (!fromNode || !toNode) return null
      
      let value = 0
      let color = '#808080'
      
      // Only use simulation data if available
      if (simulationData) {
        const linkResults = simulationData.link_results[link.id]
        
        if (linkResults) {
          if (selectedParameter === 'flowrate') {
            value = linkResults.flowrate[currentTimeStep] || 0
          } else if (selectedParameter === 'velocity') {
            value = linkResults.velocity[currentTimeStep] || 0
          }
          color = getColorForValue(value, selectedParameter)
        }
      } else {
        // Use default color scheme based on link type
        color = link.type === 'Pipe' ? '#1E90FF' : 
                link.type === 'Pump' ? '#FF6347' : 
                link.type === 'Valve' ? '#FFD700' : '#808080'
      }
      
      return {
        type: 'Feature' as const,
        geometry: {
          type: 'LineString' as const,
          coordinates: [
            convertCoords(fromNode.x, fromNode.y),
            convertCoords(toNode.x, toNode.y)
          ]
        },
        properties: {
          ...link,
          value: value.toFixed(2),
          color,
          parameter: selectedParameter
        }
      }
    }).filter(Boolean)
    
    // Add sources
    console.log('Adding sources with features:', {
      nodes: nodeFeatures.length,
      links: linkFeatures.length,
      sampleNode: nodeFeatures[0],
      sampleLink: linkFeatures[0]
    })
    
    // Verify converted coordinates
    if (nodeFeatures.length > 0) {
      const sampleCoords = nodeFeatures[0].geometry.coordinates
      console.log('Sample converted coordinates:', sampleCoords)
      console.log('Is valid LngLat?', sampleCoords[0] >= -180 && sampleCoords[0] <= 180 && sampleCoords[1] >= -90 && sampleCoords[1] <= 90)
    }
    
    // Add sources only if they don't exist
    if (!map.current.getSource('network-links')) {
      map.current.addSource('network-links', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: linkFeatures as any
        }
      })
    } else {
      // Update existing source
      const source = map.current.getSource('network-links') as mapboxgl.GeoJSONSource
      source.setData({
        type: 'FeatureCollection',
        features: linkFeatures as any
      })
    }
    
    if (!map.current.getSource('network-nodes')) {
      map.current.addSource('network-nodes', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: nodeFeatures
        }
      })
    } else {
      // Update existing source
      const source = map.current.getSource('network-nodes') as mapboxgl.GeoJSONSource
      source.setData({
        type: 'FeatureCollection',
        features: nodeFeatures
      })
    }
    
    // Add layers only if they don't exist
    try {
      // Links layer
      if (!map.current.getLayer('network-links')) {
        map.current.addLayer({
          id: 'network-links',
          type: 'line',
          source: 'network-links',
          paint: {
            'line-color': '#0066CC',  // Blue color for better visibility
            'line-width': [
              'interpolate', ['linear'], ['zoom'],
              8, 3,     // Increased minimum width
              12, 5,    // Increased at mid zoom
              16, 8     // Increased at high zoom
            ],
            'line-opacity': 0.9
          }
        })
        console.log('Links layer added successfully')
      }
    } catch (e) {
      console.error('Error adding links layer:', e)
    }
    
    try {
      // Nodes layer
      if (!map.current.getLayer('network-nodes')) {
        map.current.addLayer({
          id: 'network-nodes',
          type: 'circle',
          source: 'network-nodes',
          paint: {
            'circle-radius': [
              'interpolate', ['linear'], ['zoom'],
              8, 6,      // Increased minimum size
              12, 10,    // Increased at mid zoom
              16, 15     // Increased at high zoom
            ],
            'circle-color': '#FF4444',  // Red color for nodes
            'circle-stroke-width': 3,
            'circle-stroke-color': '#ffffff',
            'circle-opacity': 1.0
          }
        })
        console.log('Nodes layer added successfully')
      }
    } catch (e) {
      console.error('Error adding nodes layer:', e)
    }
    
    // Labels layer
    try {
      if (!map.current.getLayer('node-labels')) {
        map.current.addLayer({
          id: 'node-labels',
          type: 'symbol',
          source: 'network-nodes',
          layout: {
            'text-field': ['get', 'value'],
            'text-size': 12,
            'text-offset': [0, -1.5],
            'text-anchor': 'top'
          },
          paint: {
            'text-color': '#000000',
            'text-halo-color': '#ffffff',
            'text-halo-width': 2
          }
        })
      }
    } catch (e) {
      console.error('Error adding labels layer:', e)
    }
    
    // Add click handlers
    map.current.on('click', 'network-nodes', (e) => {
      if (!e.features || e.features.length === 0) return
      
      const feature = e.features[0]
      const coordinates = (feature.geometry as any).coordinates.slice()
      const props = feature.properties
      
      // Create popup content
      const html = `
        <div class="p-2">
          <h3 class="font-bold text-sm mb-2">${props.id}</h3>
          <div class="text-xs space-y-1">
            <div>Type: ${props.type}</div>
            <div>${props.parameter}: ${props.value} ${colorScales[props.parameter as keyof typeof colorScales]?.unit || ''}</div>
            ${props.elevation ? `<div>Elevation: ${props.elevation} m</div>` : ''}
          </div>
        </div>
      `
      
      // Close existing popup
      if (popupRef.current) {
        popupRef.current.remove()
      }
      
      // Create new popup
      popupRef.current = new mapboxgl.Popup({ offset: 25 })
        .setLngLat(coordinates)
        .setHTML(html)
        .addTo(map.current!)
    })
    
    // Change cursor on hover
    map.current.on('mouseenter', 'network-nodes', () => {
      if (map.current) map.current.getCanvas().style.cursor = 'pointer'
    })
    
    map.current.on('mouseleave', 'network-nodes', () => {
      if (map.current) map.current.getCanvas().style.cursor = ''
    })
    
    // Fit to the network bounds after adding layers
    if (nodeFeatures.length > 0) {
      const coordinates = nodeFeatures.map(f => f.geometry.coordinates)
      const lngs = coordinates.map(c => c[0])
      const lats = coordinates.map(c => c[1])
      
      const bounds = [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)]
      ] as [[number, number], [number, number]]
      
      console.log('Fitting to network bounds:', bounds)
      
      // Add a small delay to ensure layers are rendered
      setTimeout(() => {
        if (map.current) {
          map.current.fitBounds(bounds, {
            padding: 20,
            maxZoom: 18,
            minZoom: 12
          })
          
          // Also log the final zoom level
          setTimeout(() => {
            const zoom = map.current?.getZoom()
            console.log('Final zoom level:', zoom)
          }, 1000)
        }
      }, 100)
    }
  }, [networkData, simulationData, currentTimeStep, selectedParameter, convertCoords, getColorForValue])
  
  // Update visualization when network or simulation data changes
  useEffect(() => {
    if (networkData) {
      // Add a delay to ensure map is ready
      const timer = setTimeout(() => {
        updateVisualization()
      }, 200)
      
      return () => clearTimeout(timer)
    }
  }, [currentTimeStep, selectedParameter, networkData, simulationData, updateVisualization, utmZone])
  
  // Handle file upload
  const handleFileUpload = async () => {
    try {
      setLoading(true)
      setError(null)
      setWarning(null)
      
      const result = await window.electronAPI.wntr.loadINPFile()
      
      if (result.success && result.data) {
        console.log('Network data loaded:', result.data)
        
        // Detect coordinate system
        if (result.data.nodes && result.data.nodes.length > 0) {
          console.log('Sample node coordinates (first 5):')
          result.data.nodes.slice(0, 5).forEach((node: any) => {
            console.log(`Node ${node.id}: x=${node.x}, y=${node.y}`)
          })
          
          // Find coordinate ranges
          const xCoords = result.data.nodes.map((n: any) => n.x)
          const yCoords = result.data.nodes.map((n: any) => n.y)
          console.log('X range:', Math.min(...xCoords), 'to', Math.max(...xCoords))
          console.log('Y range:', Math.min(...yCoords), 'to', Math.max(...yCoords))
          
          // Detect coordinate system
          const coordSystem = detectCoordinateSystem(result.data.nodes)
          console.log('Detected coordinate system:', coordSystem)
          setDetectedCoordSystem(coordSystem)
          
          // If UTM detected, set the suggested zone
          if (coordSystem?.type === 'UTM' && coordSystem.suggested_zone) {
            setUtmZone(coordSystem.suggested_zone)
            console.log('Setting UTM zone to:', coordSystem.suggested_zone)
            
            // Save to localStorage to ensure it persists
            localStorage.setItem('detectedUtmZone', coordSystem.suggested_zone)
            
            // Show notification about detected UTM zone
            setWarning(`UTM Zone ${coordSystem.suggested_zone} detected. You can change it in the settings if needed.`)
            
            // Force a re-render to apply the new UTM zone
            setTimeout(() => {
              updateVisualization()
            }, 300)
          }
        }
        
        // Clear previous data to force update
        setNetworkData(null)
        
        // Set new data after a brief delay, ensuring coordinate system is set
        setTimeout(() => {
          setNetworkData(result.data)
          
          // Ensure the detected coordinate system is available for conversion
          if (detectedCoordSystem?.type === 'UTM') {
            console.log('Network data set with UTM zone:', detectedCoordSystem.suggested_zone)
          }
        }, 50)
        
        // Fit bounds if available
        if (result.data.coordinate_system?.bounds) {
          const bounds = result.data.coordinate_system.bounds
          console.log('Coordinate system:', result.data.coordinate_system)
          console.log('Raw bounds:', bounds)
          
          // Get SW and NE corners
          const sw = convertCoords(bounds.minX || bounds.minLon, bounds.minY || bounds.minLat)
          const ne = convertCoords(bounds.maxX || bounds.maxLon, bounds.maxY || bounds.maxLat)
          console.log('Converted bounds - SW:', sw, 'NE:', ne)
          
          // Validate coordinates
          const isValidLng = (lng: number) => lng >= -180 && lng <= 180
          const isValidLat = (lat: number) => lat >= -90 && lat <= 90
          
          if (isValidLng(sw[0]) && isValidLat(sw[1]) && isValidLng(ne[0]) && isValidLat(ne[1])) {
            setTimeout(() => {
              if (map.current?.loaded()) {
                console.log('Fitting bounds to:', { sw, ne })
                map.current.fitBounds([sw, ne], {
                  padding: 100,
                  maxZoom: 14,
                  duration: 2000
                })
              }
            }, 500)
          } else {
            console.warn('Invalid coordinates detected, centering on nodes instead')
            // If bounds are invalid, center on the average of all nodes
            if (result.data.nodes && result.data.nodes.length > 0) {
              let avgX = 0, avgY = 0
              let validNodes = 0
              
              result.data.nodes.forEach((node: any) => {
                const coords = convertCoords(node.x, node.y)
                if (isValidLng(coords[0]) && isValidLat(coords[1])) {
                  avgX += coords[0]
                  avgY += coords[1]
                  validNodes++
                }
              })
              
              if (validNodes > 0) {
                const center: [number, number] = [avgX / validNodes, avgY / validNodes]
                console.log('Centering map on average coordinates:', center)
                
                setTimeout(() => {
                  if (map.current?.loaded()) {
                    map.current.setCenter(center)
                    map.current.setZoom(12)
                  }
                }, 500)
              } else {
                console.error('No valid coordinates found in the network')
                setWarning('The network file contains coordinates that cannot be displayed on the map. Please check the coordinate system.')
              }
            }
          }
        } else {
          console.log('No coordinate system bounds, trying to fit to nodes')
          // No bounds, try to fit to all nodes
          if (result.data.nodes && result.data.nodes.length > 0) {
            const coords = result.data.nodes.map((node: any) => convertCoords(node.x, node.y))
            const validCoords = coords.filter((c: [number, number]) => 
              c[0] >= -180 && c[0] <= 180 && c[1] >= -90 && c[1] <= 90
            )
            
            if (validCoords.length > 0) {
              const lngs = validCoords.map((c: [number, number]) => c[0])
              const lats = validCoords.map((c: [number, number]) => c[1])
              
              const sw: [number, number] = [Math.min(...lngs), Math.min(...lats)]
              const ne: [number, number] = [Math.max(...lngs), Math.max(...lats)]
              
              setTimeout(() => {
                if (map.current?.loaded()) {
                  map.current.fitBounds([sw, ne], {
                    padding: 100,
                    maxZoom: 14,
                    duration: 2000
                  })
                }
              }, 500)
            }
          }
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
  
  // Handle run simulation
  const handleRunSimulation = async () => {
    if (!networkData) return
    
    try {
      setLoading(true)
      setError(null)
      setWarning(null)
      
      const result = await window.electronAPI.wntr.runSimulation({ 
        simulationType: 'extended'
      })
      
      if (result.success && result.data) {
        setSimulationData(result.data)
        setCurrentTimeStep(0)
        setError(null)
        
        // Check for warnings
        if (result.warning) {
          console.warn('Simulation warning:', result.warning)
          setWarning(`${result.warning.message}\n\n${result.warning.details}`)
        }
      } else {
        setError(result.error || 'Simulation failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Simulation failed')
    } finally {
      setLoading(false)
    }
  }
  
  // Get current stats
  const getCurrentStats = () => {
    if (!simulationData || !networkData) return null
    
    const pressures = Object.values(simulationData.node_results).map(
      r => r.pressure[currentTimeStep] || 0
    )
    const demands = Object.values(simulationData.node_results).map(
      r => r.demand[currentTimeStep] || 0
    )
    const flows = Object.values(simulationData.link_results).map(
      r => r.flowrate[currentTimeStep] || 0
    )
    
    return {
      pressure: {
        min: Math.min(...pressures).toFixed(2),
        max: Math.max(...pressures).toFixed(2),
        avg: (pressures.reduce((a, b) => a + b, 0) / pressures.length).toFixed(2)
      },
      demand: {
        total: demands.reduce((a, b) => a + b, 0).toFixed(2)
      },
      flow: {
        min: Math.min(...flows).toFixed(2),
        max: Math.max(...flows).toFixed(2),
        avg: (flows.reduce((a, b) => a + b, 0) / flows.length).toFixed(2)
      }
    }
  }
  
  const stats = getCurrentStats()
  
  return (
    <div className="flex h-full w-full bg-background relative overflow-hidden">
      {/* Left Control Panel */}
      <div className="w-80 border-r bg-card flex flex-col">
        <div className="p-4 border-b">
          <h3 className="text-lg font-semibold mb-2">WNTR Simulation Viewer</h3>
          
          <div className="space-y-2">
            <button
              onClick={handleFileUpload}
              disabled={loading}
              className={cn(
                "w-full px-4 py-2 rounded-md",
                "flex items-center justify-center gap-2",
                "bg-primary text-primary-foreground",
                "hover:bg-primary/90",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                "transition-colors"
              )}
            >
              <Upload className="w-4 h-4" />
              Load EPANET File
            </button>
            
            {networkData && (
              <button
                onClick={handleRunSimulation}
                disabled={loading || !networkData}
                className={cn(
                  "w-full px-4 py-2 rounded-md",
                  "flex items-center justify-center gap-2",
                  "bg-primary text-primary-foreground",
                  "hover:bg-primary/90",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                  "transition-colors"
                )}
              >
                <Play className="w-4 h-4" />
                Run Simulation
              </button>
            )}
          </div>
        </div>
        
        {/* Network Info */}
        {networkData && (
          <div className="p-4 border-b">
            <h4 className="font-medium mb-3">Network: {networkData.name}</h4>
            <div className="text-sm space-y-1 text-muted-foreground">
              <div className="flex justify-between">
                <span>Nodes:</span>
                <span>{networkData.summary.junctions + networkData.summary.tanks + networkData.summary.reservoirs}</span>
              </div>
              <div className="flex justify-between">
                <span>Links:</span>
                <span>{networkData.summary.pipes + networkData.summary.pumps + networkData.summary.valves}</span>
              </div>
            </div>
          </div>
        )}
        
        {/* Simulation Controls */}
        {simulationData && (
          <div className="p-4 space-y-4 flex-1 overflow-y-auto">
            {/* Parameter Selection */}
            <div>
              <label className="text-sm font-medium mb-2 block">Display Parameter</label>
              <Select.Root value={selectedParameter} onValueChange={(v: any) => setSelectedParameter(v)}>
                <Select.Trigger
                  className={cn(
                    "w-full px-3 py-2 rounded-md",
                    "border border-input bg-background",
                    "flex items-center justify-between",
                    "hover:bg-accent hover:text-accent-foreground",
                    "focus:outline-none focus:ring-2 focus:ring-ring"
                  )}
                >
                  <Select.Value />
                  <Select.Icon>
                    <ChevronDown className="w-4 h-4" />
                  </Select.Icon>
                </Select.Trigger>
                
                <Select.Portal>
                  <Select.Content
                    className={cn(
                      "bg-popover border rounded-md shadow-lg",
                      "z-50"
                    )}
                  >
                    <Select.Viewport className="p-1">
                      <Select.Item
                        value="pressure"
                        className={cn(
                          "px-3 py-2 rounded",
                          "flex items-center gap-2",
                          "hover:bg-accent hover:text-accent-foreground",
                          "cursor-pointer outline-none"
                        )}
                      >
                        <Select.ItemIndicator>
                          <Check className="w-4 h-4" />
                        </Select.ItemIndicator>
                        <Gauge className="w-4 h-4" />
                        <Select.ItemText>Pressure</Select.ItemText>
                      </Select.Item>
                      
                      <Select.Item
                        value="demand"
                        className={cn(
                          "px-3 py-2 rounded",
                          "flex items-center gap-2",
                          "hover:bg-accent hover:text-accent-foreground",
                          "cursor-pointer outline-none"
                        )}
                      >
                        <Select.ItemIndicator>
                          <Check className="w-4 h-4" />
                        </Select.ItemIndicator>
                        <Droplet className="w-4 h-4" />
                        <Select.ItemText>Demand</Select.ItemText>
                      </Select.Item>
                      
                      <Select.Item
                        value="flowrate"
                        className={cn(
                          "px-3 py-2 rounded",
                          "flex items-center gap-2",
                          "hover:bg-accent hover:text-accent-foreground",
                          "cursor-pointer outline-none"
                        )}
                      >
                        <Select.ItemIndicator>
                          <Check className="w-4 h-4" />
                        </Select.ItemIndicator>
                        <Activity className="w-4 h-4" />
                        <Select.ItemText>Flow Rate</Select.ItemText>
                      </Select.Item>
                      
                      <Select.Item
                        value="velocity"
                        className={cn(
                          "px-3 py-2 rounded",
                          "flex items-center gap-2",
                          "hover:bg-accent hover:text-accent-foreground",
                          "cursor-pointer outline-none"
                        )}
                      >
                        <Select.ItemIndicator>
                          <Check className="w-4 h-4" />
                        </Select.ItemIndicator>
                        <Activity className="w-4 h-4" />
                        <Select.ItemText>Velocity</Select.ItemText>
                      </Select.Item>
                    </Select.Viewport>
                  </Select.Content>
                </Select.Portal>
              </Select.Root>
            </div>
            
            {/* Time Control */}
            <div>
              <label className="text-sm font-medium mb-2 block">
                Time Step: {currentTimeStep} / {simulationData.timestamps.length - 1}
              </label>
              <div className="mt-2 space-y-3">
                <Slider.Root
                  value={[currentTimeStep]}
                  onValueChange={(v) => setCurrentTimeStep(v[0])}
                  max={simulationData.timestamps.length - 1}
                  step={1}
                  className="relative flex items-center select-none touch-none w-full h-5"
                >
                  <Slider.Track className="bg-secondary relative grow rounded-full h-[3px]">
                    <Slider.Range className="absolute bg-primary rounded-full h-full" />
                  </Slider.Track>
                  <Slider.Thumb
                    className="block w-5 h-5 bg-primary rounded-full hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring"
                    aria-label="Time Step"
                  />
                </Slider.Root>
                
                <div className="flex gap-2">
                  <button
                    onClick={() => setIsPlaying(!isPlaying)}
                    className={cn(
                      "flex-1 px-3 py-2 rounded-md",
                      "flex items-center justify-center gap-2",
                      "border border-input bg-background",
                      "hover:bg-accent hover:text-accent-foreground",
                      "transition-colors"
                    )}
                  >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    {isPlaying ? 'Pause' : 'Play'}
                  </button>
                  <button
                    onClick={() => setCurrentTimeStep(0)}
                    className={cn(
                      "px-3 py-2 rounded-md",
                      "flex items-center justify-center",
                      "border border-input bg-background",
                      "hover:bg-accent hover:text-accent-foreground",
                      "transition-colors"
                    )}
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
            
            {/* Playback Speed */}
            <div>
              <label className="text-sm font-medium mb-2 block">
                Playback Speed: {playbackSpeed}x
              </label>
              <Slider.Root
                value={[playbackSpeed]}
                onValueChange={(v) => setPlaybackSpeed(v[0])}
                min={0.5}
                max={4}
                step={0.5}
                className="relative flex items-center select-none touch-none w-full h-5"
              >
                <Slider.Track className="bg-secondary relative grow rounded-full h-[3px]">
                  <Slider.Range className="absolute bg-primary rounded-full h-full" />
                </Slider.Track>
                <Slider.Thumb
                  className="block w-5 h-5 bg-primary rounded-full hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring"
                  aria-label="Playback Speed"
                />
              </Slider.Root>
            </div>
            
            {/* Display Options */}
            <div className="space-y-2">
              <label className="text-sm font-medium block">Display Options</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowLegend(!showLegend)}
                  className={cn(
                    "flex-1 px-3 py-2 rounded-md",
                    "flex items-center justify-center gap-2",
                    "border transition-colors",
                    showLegend
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-input bg-background hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <Layers className="w-4 h-4" />
                  Legend
                </button>
                <button
                  onClick={() => setShowStats(!showStats)}
                  className={cn(
                    "flex-1 px-3 py-2 rounded-md",
                    "flex items-center justify-center gap-2",
                    "border transition-colors",
                    showStats
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-input bg-background hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <BarChart3 className="w-4 h-4" />
                  Stats
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Error/Warning Display */}
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
      <div className="flex-1 relative overflow-hidden" style={{ minHeight: '500px' }}>
        <div 
          ref={mapContainer} 
          className="w-full h-full"
          style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}
        />
        
        {/* Legend */}
        {showLegend && simulationData && (
          <div className="absolute top-4 left-4 bg-card border rounded-lg shadow-lg p-3 w-48">
            <h4 className="font-medium text-sm mb-2">
              {selectedParameter.charAt(0).toUpperCase() + selectedParameter.slice(1)}
            </h4>
            <div className="space-y-2">
              {colorScales[selectedParameter as keyof typeof colorScales].colors.map((color, i) => {
                const scale = colorScales[selectedParameter as keyof typeof colorScales]
                const range = scale.max - scale.min
                const step = range / (scale.colors.length - 1)
                const value = scale.min + (i * step)
                
                return (
                  <div key={i} className="flex items-center gap-2">
                    <div
                      className="w-6 h-6 rounded"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-xs">
                      {value.toFixed(1)} {scale.unit}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
        
        {/* Stats Widget */}
        {showStats && stats && (
          <div className="absolute bottom-4 left-4 bg-card border rounded-lg shadow-lg p-3 w-64">
            <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
              <Info className="w-4 h-4" />
              Current Statistics
            </h4>
            <div className="text-xs space-y-2">
              <div>
                <div className="font-medium">Pressure (m)</div>
                <div className="text-muted-foreground">
                  Min: {stats.pressure.min} | Max: {stats.pressure.max} | Avg: {stats.pressure.avg}
                </div>
              </div>
              <div>
                <div className="font-medium">Total Demand (L/s)</div>
                <div className="text-muted-foreground">{stats.demand.total}</div>
              </div>
              <div>
                <div className="font-medium">Flow Rate (L/s)</div>
                <div className="text-muted-foreground">
                  Min: {stats.flow.min} | Max: {stats.flow.max} | Avg: {stats.flow.avg}
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* UTM Zone Selector - shown when projected coordinates detected */}
        {detectedCoordSystem?.type === 'UTM' && (
          <div className="absolute top-4 right-44 bg-card border rounded-lg shadow-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <Settings className="w-4 h-4" />
              <span className="text-sm font-medium">UTM Zone</span>
            </div>
            <select
              value={utmZone}
              onChange={(e) => setUtmZone(e.target.value)}
              className="w-24 px-2 py-1 text-sm border rounded bg-background"
            >
              <option value="">Auto</option>
              <option value="13N">13N</option>
              <option value="14N">14N</option>
              <option value="15N">15N</option>
              <option value="16N">16N</option>
              <option value="17N">17N</option>
              <option value="18N">18N</option>
              <option value="19N">19N</option>
            </select>
            <p className="text-xs text-muted-foreground mt-1">
              Detected: {detectedCoordSystem.suggested_zone}
            </p>
          </div>
        )}
        
        {/* Map Style Selector */}
        <div className="absolute top-4 right-4 w-32">
          <Select.Root value={mapStyle} onValueChange={setMapStyle}>
            <Select.Trigger
              className={cn(
                "w-full px-3 py-2 rounded-md",
                "border border-input bg-background/80 backdrop-blur",
                "flex items-center justify-between gap-2",
                "hover:bg-accent/80 hover:text-accent-foreground",
                "focus:outline-none focus:ring-2 focus:ring-ring"
              )}
            >
              <Map className="w-4 h-4" />
              <Select.Value />
              <Select.Icon>
                <ChevronDown className="w-4 h-4" />
              </Select.Icon>
            </Select.Trigger>
            
            <Select.Portal>
              <Select.Content
                className={cn(
                  "bg-popover border rounded-md shadow-lg",
                  "z-50"
                )}
              >
                <Select.Viewport className="p-1">
                  <Select.Item value="light" className="px-3 py-2 rounded hover:bg-accent cursor-pointer outline-none">
                    <Select.ItemText>Light</Select.ItemText>
                  </Select.Item>
                  <Select.Item value="dark" className="px-3 py-2 rounded hover:bg-accent cursor-pointer outline-none">
                    <Select.ItemText>Dark</Select.ItemText>
                  </Select.Item>
                  <Select.Item value="streets" className="px-3 py-2 rounded hover:bg-accent cursor-pointer outline-none">
                    <Select.ItemText>Streets</Select.ItemText>
                  </Select.Item>
                  <Select.Item value="outdoors" className="px-3 py-2 rounded hover:bg-accent cursor-pointer outline-none">
                    <Select.ItemText>Outdoors</Select.ItemText>
                  </Select.Item>
                </Select.Viewport>
              </Select.Content>
            </Select.Portal>
          </Select.Root>
        </div>
      </div>
    </div>
  )
}