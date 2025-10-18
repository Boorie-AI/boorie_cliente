import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import proj4 from 'proj4'
import {
  FileUp,
  Play,
  BarChart3,
  Download,
  Map,
  Network,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Layers,
  Loader2,
  AlertCircle,
  MapPin,
  Settings2
} from 'lucide-react'
import { cn } from '@/utils/cn'
import * as Tabs from '@radix-ui/react-tabs'
import * as Dialog from '@radix-ui/react-dialog'
import * as Select from '@radix-ui/react-select'

// Mapbox access token from environment variables
const MAPBOX_ACCESS_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || ''

console.log('Mapbox token loaded:', MAPBOX_ACCESS_TOKEN ? `${MAPBOX_ACCESS_TOKEN.substring(0, 10)}...` : 'NO TOKEN')

// Set the access token if available
if (MAPBOX_ACCESS_TOKEN) {
  mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN
} else {
  console.error('No Mapbox access token found. Please set VITE_MAPBOX_ACCESS_TOKEN in your .env file.')
}

// Define coordinate systems for Latin America
proj4.defs('EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs') // WGS84 Geographic
// Mexico
proj4.defs('EPSG:32614', '+proj=utm +zone=14 +datum=WGS84 +units=m +no_defs') // UTM Zone 14N (Mexico City)
proj4.defs('EPSG:32615', '+proj=utm +zone=15 +datum=WGS84 +units=m +no_defs') // UTM Zone 15N (Mexico)
proj4.defs('EPSG:32616', '+proj=utm +zone=16 +datum=WGS84 +units=m +no_defs') // UTM Zone 16N (Mexico)
// Colombia
proj4.defs('EPSG:32617', '+proj=utm +zone=17 +datum=WGS84 +units=m +no_defs') // UTM Zone 17N
proj4.defs('EPSG:32618', '+proj=utm +zone=18 +datum=WGS84 +units=m +no_defs') // UTM Zone 18N (Cartagena)
proj4.defs('EPSG:32619', '+proj=utm +zone=19 +datum=WGS84 +units=m +no_defs') // UTM Zone 19N
proj4.defs('EPSG:3116', '+proj=tmerc +lat_0=4.596200416666666 +lon_0=-74.07750791666666 +k=1 +x_0=1000000 +y_0=1000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs') // MAGNA-SIRGAS Bogotá

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
  coordinate_system?: {
    type: 'geographic' | 'projected' | 'unknown'
    bounds?: {
      minLat?: number
      maxLat?: number
      minLon?: number
      maxLon?: number
      minX?: number
      maxX?: number
      minY?: number
      maxY?: number
    }
    epsg?: string
    units?: string
    possible_system?: string
  }
}

interface SimulationResults {
  node_results: any
  link_results: any
  timestamps: number[]
}

interface MapSettings {
  baseMap: 'streets' | 'satellite' | 'outdoors' | 'light' | 'dark'
  showLabels: boolean
  opacity: number
  nodeSize: number
  linkWidth: number
  manualPosition?: {
    lat: number
    lon: number
  }
}

interface TimeSeriesData {
  timestamps: number[]
  pressure: { [nodeId: string]: number[] }
  flow: { [linkId: string]: number[] }
  velocity: { [linkId: string]: number[] }
  head: { [nodeId: string]: number[] }
}

export function WNTRMapViewer() {
  const { t } = useTranslation()
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  // Default to Mexico City coordinates (TK_Lomas appears to be from Mexico)
  const [lng, setLng] = useState(-99.133208)
  const [lat, setLat] = useState(19.432608)
  const [zoom, setZoom] = useState(10)
  const [networkData, setNetworkData] = useState<NetworkData | null>(null)
  const [simulationResults, setSimulationResults] = useState<SimulationResults | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [styleChanging, setStyleChanging] = useState(false)
  const [satelliteDisabled, setSatelliteDisabled] = useState(false)
  // Network overlay is always visible
  const showNetworkOverlay = true
  const [selectedNode, setSelectedNode] = useState<any>(null)
  const [selectedLink, setSelectedLink] = useState<any>(null)
  
  // Check WebGL capabilities and satellite compatibility
  const checkSatelliteCompatibility = useCallback(() => {
    try {
      // Check if WebGL is available and working
      const canvas = document.createElement('canvas')
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
      
      if (!gl) {
        console.warn('WebGL not available - disabling satellite mode')
        setSatelliteDisabled(true)
        return false
      }
      
      // Check for known problematic renderer strings
      const renderer = gl.getParameter(gl.RENDERER)
      const vendor = gl.getParameter(gl.VENDOR)
      
      console.log('WebGL Renderer:', renderer)
      console.log('WebGL Vendor:', vendor)
      
      // Known problematic configurations that cause crashes with satellite imagery
      const problematicPatterns = [
        /software/i,
        /mesa/i,
        /llvmpipe/i,
        /microsoft basic render driver/i
      ]
      
      const isProblematic = problematicPatterns.some(pattern => 
        pattern.test(renderer) || pattern.test(vendor)
      )
      
      if (isProblematic) {
        console.warn('Problematic WebGL renderer detected - disabling satellite mode')
        setSatelliteDisabled(true)
        return false
      }
      
      // Test WebGL context loss recovery
      const ext = gl.getExtension('WEBGL_lose_context')
      if (ext) {
        // This is just a capability check, not actually losing context
        console.log('WebGL context loss recovery available')
      }
      
      return true
    } catch (error) {
      console.error('Error checking WebGL compatibility:', error)
      setSatelliteDisabled(true)
      return false
    }
  }, [])
  
  // Check satellite compatibility on mount
  useEffect(() => {
    // Check if satellite was previously disabled due to crashes
    const satelliteDisabledBySystem = localStorage.getItem('satellite-disabled-by-system')
    if (satelliteDisabledBySystem === 'true') {
      console.log('Satellite mode was previously disabled by system')
      setSatelliteDisabled(true)
      setError('Modo satélite deshabilitado debido a incompatibilidad del sistema.')
    } else {
      // For now, disable satellite mode completely to prevent crashes
      // TODO: Remove this when satellite mode is stable
      console.warn('Satellite mode disabled preventively due to known crash issues')
      setSatelliteDisabled(true)
      localStorage.setItem('satellite-disabled-by-system', 'true')
      setError('Modo satélite temporalmente deshabilitado para prevenir crashes del sistema.')
      
      // Uncomment this line when satellite mode is stable:
      // checkSatelliteCompatibility()
    }
  }, [checkSatelliteCompatibility])
  
  const [showSettingsDialog, setShowSettingsDialog] = useState(false)
  const [mapSettings, setMapSettings] = useState<MapSettings>({
    baseMap: 'streets',
    showLabels: true,
    opacity: 0.8,
    nodeSize: 8,
    linkWidth: 2
  })
  
  // Listen for crash recovery messages from main process
  useEffect(() => {
    const cleanup = window.electronAPI?.onDisableSatelliteMode?.((data) => {
      console.warn('Received satellite disable request:', data)
      setSatelliteDisabled(true)
      setError(`${data.message} - Modo satélite ha sido deshabilitado permanentemente.`)
      
      // Persist the disable state
      localStorage.setItem('satellite-disabled-by-system', 'true')
      
      // If currently on satellite, switch to streets
      if (mapSettings.baseMap === 'satellite') {
        setMapSettings(prev => ({ ...prev, baseMap: 'streets' }))
      }
    })
    
    return cleanup
  }, [mapSettings.baseMap])
  
  // New states for advanced visualization
  const [currentTimeStep, setCurrentTimeStep] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [showTimeSeries, setShowTimeSeries] = useState(true)
  const [selectedParameter, setSelectedParameter] = useState<'pressure' | 'flow' | 'velocity' | 'head'>('pressure')
  const [colorScale, setColorScale] = useState({ min: 0, max: 100 })
  const [selectedElements, setSelectedElements] = useState<string[]>([])
  const [timeSeriesData, setTimeSeriesData] = useState<TimeSeriesData | null>(null)
  
  // Initialize map
  useEffect(() => {
    console.log('Map initialization useEffect triggered')
    console.log('mapContainer.current:', mapContainer.current)
    console.log('MAPBOX_ACCESS_TOKEN exists:', !!MAPBOX_ACCESS_TOKEN)
    
    if (!mapContainer.current) {
      console.error('Map container ref is null')
      return
    }
    
    // Check container dimensions
    const containerRect = mapContainer.current.getBoundingClientRect()
    console.log('Container dimensions:', {
      width: containerRect.width,
      height: containerRect.height,
      top: containerRect.top,
      left: containerRect.left
    })
    
    if (containerRect.width === 0 || containerRect.height === 0) {
      console.error('Map container has zero dimensions:', containerRect)
      setError('Map container has invalid dimensions. Please check the layout.')
      return
    }
    
    // Clean up existing map instance
    if (map.current) {
      map.current.remove()
      map.current = null
    }
    
    // Check if Mapbox token is available
    if (!MAPBOX_ACCESS_TOKEN) {
      setError('Mapbox access token not configured. Please add VITE_MAPBOX_ACCESS_TOKEN to your .env file.')
      return
    }
    
    try {
      console.log('Initializing Mapbox with token:', MAPBOX_ACCESS_TOKEN.substring(0, 10) + '...')
      console.log('Map container element:', mapContainer.current)
      console.log('Map settings:', { baseMap: mapSettings.baseMap, lng, lat, zoom })
      
      // Verify mapboxgl is properly loaded
      console.log('mapboxgl object:', mapboxgl)
      console.log('mapboxgl.accessToken:', mapboxgl.accessToken)
      
      // Try to create map with fallback styles
      const createMap = (style: string) => {
        return new mapboxgl.Map({
          container: mapContainer.current,
          style: style,
          center: [lng, lat],
          zoom: zoom,
          failIfMajorPerformanceCaveat: false, // Allow map to load even with poor performance
          preserveDrawingBuffer: true, // Help with WebGL issues in Electron
          antialias: false, // Disable antialiasing to reduce WebGL load
          transformRequest: (url, resourceType) => {
            console.log('Transform request:', url, resourceType)
            return { url }
          }
        })
      }
      
      // Try different styles with fallbacks
      let mapStyle = `mapbox://styles/mapbox/${mapSettings.baseMap}-v11`
      
      // Fallback for satellite style if it fails
      if (mapSettings.baseMap === 'satellite') {
        mapStyle = 'mapbox://styles/mapbox/satellite-streets-v12' // Try newer satellite style
      }
      
      console.log('Creating map with style:', mapStyle)
      map.current = createMap(mapStyle)
      
      console.log('Map instance created:', map.current)
    
    // Add error handler with style fallback
    map.current.on('error', (e) => {
      console.error('Mapbox error:', e)
      console.error('Error details:', {
        status: e.error?.status,
        message: e.error?.message,
        type: e.type,
        target: e.target
      })
      
      if (e.error && e.error.status === 401) {
        setError('Token de acceso Mapbox inválido. Verifique su token en el archivo .env.')
      } else if (mapSettings.baseMap === 'satellite' && e.error) {
        console.warn('Satellite style failed, falling back to streets')
        try {
          // Prevent infinite error loops
          if (map.current) {
            map.current.setStyle('mapbox://styles/mapbox/streets-v11')
            setMapSettings(prev => ({ ...prev, baseMap: 'streets' }))
            setError('Las imágenes satelitales fallaron. Se cambió a vista de calles automáticamente.')
          }
        } catch (fallbackError) {
          console.error('Fallback error:', fallbackError)
          setError(`Error del mapa: ${e.error?.message || 'Error desconocido'}. Intente recargar la página.`)
        }
      } else {
        setError(`Error del mapa: ${e.error?.message || 'Error desconocido'}`)
      }
    })

    map.current.on('load', () => {
      console.log('Map loaded successfully')
    })

    map.current.on('move', () => {
      if (map.current) {
        setLng(Number(map.current.getCenter().lng.toFixed(4)))
        setLat(Number(map.current.getCenter().lat.toFixed(4)))
        setZoom(Number(map.current.getZoom().toFixed(2)))
      }
    })
    
      // Add navigation controls
      map.current.addControl(new mapboxgl.NavigationControl(), 'top-left')
      map.current.addControl(new mapboxgl.ScaleControl(), 'bottom-left')
      
      // Click handlers will be added in separate useEffect
    } catch (err) {
      console.error('Map initialization error:', err)
      if (err instanceof Error) {
        if (err.message.includes('WebGL')) {
          setError('WebGL not available. The map requires hardware acceleration. You can still load networks and view them in the network viewer.')
          setWarning('Try restarting the application or use the Network Graph view instead of Map view.')
        } else {
          setError(`Failed to initialize map: ${err.message}`)
        }
      } else {
        setError('Failed to initialize map. Please check your Mapbox configuration.')
      }
    }
    
    return () => {
      // Reset any pending style changes
      setStyleChanging(false)
      setError(null)
      
      map.current?.remove()
      map.current = null
    }
  }, []) // Only run once on mount
  
  // Update map style
  useEffect(() => {
    if (!map.current || styleChanging) return
    
    // Check if map is loaded before changing style
    if (!map.current.loaded()) {
      console.log('Map not yet loaded, waiting...')
      map.current.once('load', () => {
        console.log('Map loaded, proceeding with style change')
        // Trigger this effect again by updating a dummy state
        setTimeout(() => {
          if (map.current && !styleChanging) {
            setMapSettings(prev => ({ ...prev }))
          }
        }, 100)
      })
      return
    }
    
    // Check satellite compatibility before switching
    if (mapSettings.baseMap === 'satellite') {
      if (satelliteDisabled || !checkSatelliteCompatibility()) {
        console.warn('Satellite mode not compatible with current system')
        setError('Modo satélite no compatible con su sistema. Use otro estilo de mapa.')
        setMapSettings(prev => ({ ...prev, baseMap: 'streets' }))
        return
      }
    }
    
    // Prevent multiple simultaneous style changes
    setStyleChanging(true)
    
    try {
      let newStyle = `mapbox://styles/mapbox/${mapSettings.baseMap}-v11`
      
      // Use updated satellite style
      if (mapSettings.baseMap === 'satellite') {
        newStyle = 'mapbox://styles/mapbox/satellite-streets-v12'
        console.log('Switching to satellite mode...')
      }
      
      console.log('Changing map style to:', newStyle)
      
      // Clear any previous errors
      setError(null)
      
      // Set up one-time error handler for style change
      const handleStyleError = (e: any) => {
        console.error('Style change error:', e)
        setStyleChanging(false)
        
        if (mapSettings.baseMap === 'satellite') {
          console.warn('Satellite style failed during change, reverting to streets')
          try {
            if (map.current && !map.current.isStyleLoaded()) {
              // If style is not loaded, set a timeout to prevent crashes
              setTimeout(() => {
                if (map.current) {
                  map.current.setStyle('mapbox://styles/mapbox/streets-v11')
                  setMapSettings(prev => ({ ...prev, baseMap: 'streets' }))
                }
              }, 100)
            } else {
              map.current?.setStyle('mapbox://styles/mapbox/streets-v11')
              setMapSettings(prev => ({ ...prev, baseMap: 'streets' }))
            }
            setError('Error al cargar imágenes satelitales. Se cambió a vista de calles.')
          } catch (revertError) {
            console.error('Failed to revert to streets style:', revertError)
            setError('Error crítico al cambiar vista del mapa. Recargue la página.')
          }
        } else {
          setError(`Error al cambiar vista del mapa: ${e.error?.message || 'Error desconocido'}`)
        }
        // Remove the error handler after use
        map.current?.off('error', handleStyleError)
      }
      
      // Add temporary error handler
      map.current.on('error', handleStyleError)
      
      // Set the new style
      map.current.setStyle(newStyle)
      
      // Safety timeout to reset state even if style.load doesn't fire
      const timeoutId = setTimeout(() => {
        console.warn('Style change timeout, resetting state')
        setStyleChanging(false)
        setError('Tiempo de espera agotado al cambiar estilo. Intente de nuevo.')
        map.current?.off('error', handleStyleError)
      }, 5000) // 5 second timeout
      
      // Remove error handler and reset state after successful style load
      map.current.once('style.load', () => {
        console.log('Style loaded successfully:', newStyle)
        setStyleChanging(false)
        clearTimeout(timeoutId)
        map.current?.off('error', handleStyleError)
      })
      
    } catch (error) {
      console.error('Critical error changing map style:', error)
      setStyleChanging(false)
      setError(`Error crítico al cambiar estilo del mapa: ${error instanceof Error ? error.message : 'Error desconocido'}`)
      
      // Revert to safe default if satellite fails
      if (mapSettings.baseMap === 'satellite') {
        setMapSettings(prev => ({ ...prev, baseMap: 'streets' }))
      }
    }
  }, [mapSettings.baseMap, styleChanging])
  
  // Handle click events for manual positioning
  useEffect(() => {
    if (!map.current) return
    
    const handleMapClick = (e: mapboxgl.MapMouseEvent) => {
      if (showSettingsDialog && networkData && networkData.coordinate_system?.type !== 'geographic') {
        setMapSettings(prev => ({
          ...prev,
          manualPosition: {
            lat: e.lngLat.lat,
            lon: e.lngLat.lng
          }
        }))
      }
    }
    
    map.current.on('click', handleMapClick)
    
    return () => {
      if (map.current) {
        map.current.off('click', handleMapClick)
      }
    }
  }, [showSettingsDialog, networkData])
  
  // Smart coordinate system detection and conversion
  const detectCoordinateSystem = useCallback((networkData: NetworkData) => {
    // Find bounds of network
    const xCoords = networkData.nodes.map(n => n.x || n.coordinates?.[0] || 0)
    const yCoords = networkData.nodes.map(n => n.y || n.coordinates?.[1] || 0)
    
    const minX = Math.min(...xCoords)
    const maxX = Math.max(...xCoords)
    const minY = Math.min(...yCoords)
    const maxY = Math.max(...yCoords)
    
    // Get file name for detection
    const fileName = networkData.name?.toLowerCase() || ''
    
    console.log('=== COORDINATE ANALYSIS ===')
    console.log('File name:', fileName)
    console.log('Coordinate bounds:', { minX, maxX, minY, maxY })
    console.log('Coordinate ranges:', { rangeX: maxX - minX, rangeY: maxY - minY })
    console.log('First 5 node coordinates:', networkData.nodes.slice(0, 5).map(n => ({ id: n.id, x: n.x, y: n.y })))
    console.log('Network coordinate_system from backend:', networkData.coordinate_system)
    console.log('Sample coordinate values:', { 
      sampleX: [minX, (minX + maxX) / 2, maxX],
      sampleY: [minY, (minY + maxY) / 2, maxY]
    })
    console.log('TK-Lomas detected:', fileName.includes('tk-lomas'))
    console.log('Cartagena detected:', fileName.includes('cartagena'))
    
    // Check if already geographic
    if (minX >= -180 && maxX <= 180 && minY >= -90 && maxY <= 90 && 
        Math.abs(maxX - minX) < 10 && Math.abs(maxY - minY) < 10) {
      return {
        isGeographic: true,
        epsgCode: 'EPSG:4326',
        region: 'Geographic coordinates'
      }
    }
    
    // Analyze for UTM zones (multiple regions)
    if (minX > 100000 && minX < 1000000) {
      
      // Special handling for TK-Lomas Cartagena file (highest priority)
      if (fileName.includes('tk-lomas') || fileName.includes('cartagena')) {
        console.log('🎯 Detected TK-Lomas/Cartagena file')
        
        // Test different coordinate systems for these specific coordinates
        // Current coordinates: ~842913, 1641804
        // These don't match typical Cartagena UTM coordinates
        
        // Try MAGNA-SIRGAS Colombia Bogotá zone (EPSG:3116)
        if (minX > 800000 && minX < 1200000 && minY > 1600000 && minY < 1700000) {
          console.log('Using MAGNA-SIRGAS Bogotá zone for TK-Lomas')
          return {
            isGeographic: false,
            epsgCode: 'EPSG:3116',
            region: 'MAGNA-SIRGAS Colombia Bogotá zone (TK-Lomas)',
            centerApprox: [-75.5, 10.4]
          }
        }
        
        // Try UTM Zone 17N (western Colombia)
        if (minX > 800000 && minX < 900000) {
          console.log('Using UTM Zone 17N for TK-Lomas (western coordinates)')
          return {
            isGeographic: false,
            epsgCode: 'EPSG:32617',
            region: 'UTM Zone 17N - Colombia west (TK-Lomas)',
            centerApprox: [-75.5, 10.4]
          }
        }
        
        // Fallback to UTM Zone 18N
        console.log('Using UTM Zone 18N for TK-Lomas (fallback)')
        return {
          isGeographic: false,
          epsgCode: 'EPSG:32618',
          region: 'UTM Zone 18N - Colombia Caribbean (Cartagena)',
          centerApprox: [-75.5, 10.4]
        }
      }
      
      // Colombia Caribbean coast (Cartagena zone) - typical coordinates
      if (minX > 200000 && minX < 900000 && minY > 1000000 && minY < 1300000) {
        return {
          isGeographic: false,
          epsgCode: 'EPSG:32618',
          region: 'UTM Zone 18N - Colombia Caribbean (Cartagena)',
          centerApprox: [-75.5, 10.4]
        }
      }
      
      // Mexico zones (but NOT for TK-Lomas which is Cartagena)
      if ((fileName.includes('mexico') || fileName.includes('mx')) ||
          (minX > 200000 && minX < 900000 && minY > 1800000 && minY < 2600000)) {
        
        // Mexico City area (Zone 14N)
        if (minX > 400000 && minX < 700000 && minY > 2000000 && minY < 2300000) {
          return {
            isGeographic: false,
            epsgCode: 'EPSG:32614',
            region: 'UTM Zone 14N - Mexico (Mexico City area)',
            centerApprox: [-99.1, 19.4] // Mexico City
          }
        }
        
        // Generic Mexico
        return {
          isGeographic: false,
          epsgCode: 'EPSG:32614',
          region: 'UTM Zone 14N - Mexico',
          centerApprox: [-99.1, 19.4]
        }
      }
      
      // Colombia interior
      if (minX > 200000 && minX < 900000 && minY > 400000 && minY < 700000) {
        return {
          isGeographic: false,
          epsgCode: 'EPSG:32619',
          region: 'UTM Zone 19N - Colombia interior (Bogotá)',
          centerApprox: [-74.1, 4.6]
        }
      }
      
      // MAGNA-SIRGAS Bogotá
      if (minX > 900000 && minX < 1200000 && minY > 900000 && minY < 1200000) {
        return {
          isGeographic: false,
          epsgCode: 'EPSG:3116',
          region: 'MAGNA-SIRGAS Bogotá zone',
          centerApprox: [-74.1, 4.6]
        }
      }
      
      // Generic UTM detection - try to guess by Y coordinate
      if (minY > 1800000) {
        // Likely Mexico/North America
        return {
          isGeographic: false,
          epsgCode: 'EPSG:32614',
          region: 'UTM (estimated Mexico Zone 14N)',
          centerApprox: [-99.1, 19.4]
        }
      } else if (minY > 1400000 && minY < 1800000) {
        // Likely Central America (Guatemala, Honduras, etc.) - Zone 15N or 16N
        if (minX > 600000) {
          // Zone 15N
          return {
            isGeographic: false,
            epsgCode: 'EPSG:32615',
            region: 'UTM Zone 15N - Central America (Guatemala, Honduras)',
            centerApprox: [-90.0, 15.0] // Guatemala approximate
          }
        } else {
          // Zone 16N
          return {
            isGeographic: false,
            epsgCode: 'EPSG:32616',
            region: 'UTM Zone 16N - Central America',
            centerApprox: [-84.0, 15.0] // Central America
          }
        }
      } else if (minY > 1000000) {
        // Likely Colombia Caribbean
        return {
          isGeographic: false,
          epsgCode: 'EPSG:32618',
          region: 'UTM (estimated Colombia Zone 18N)',
          centerApprox: [-75.5, 10.4]
        }
      } else {
        // Likely Colombia interior
        return {
          isGeographic: false,
          epsgCode: 'EPSG:32619',
          region: 'UTM (estimated Colombia Zone 19N)',
          centerApprox: [-74.1, 4.6]
        }
      }
    }
    
    // Fallback
    return {
      isGeographic: false,
      epsgCode: 'EPSG:32618',
      region: 'Unknown coordinate system, assuming UTM 18N',
      centerApprox: [-75.5, 10.4]
    }
  }, [])
  
  // Convert network coordinates to geographic coordinates using proj4
  const convertToGeoCoordinates = useCallback((networkData: NetworkData) => {
    const coordSystem = detectCoordinateSystem(networkData)
    
    console.log('Detected coordinate system:', coordSystem)
    
    // If already geographic, no conversion needed
    if (coordSystem.isGeographic) {
      const xCoords = networkData.nodes.map(n => n.x || n.coordinates?.[0] || 0)
      const yCoords = networkData.nodes.map(n => n.y || n.coordinates?.[1] || 0)
      
      return {
        bounds: {
          minLon: Math.min(...xCoords),
          maxLon: Math.max(...xCoords),
          minLat: Math.min(...yCoords),
          maxLat: Math.max(...yCoords)
        },
        transform: (x: number, y: number) => [x, y],
        coordinateSystem: coordSystem
      }
    }
    
    // Use proj4 for accurate coordinate transformation
    try {
      const sourceProjection = coordSystem.epsgCode
      const targetProjection = 'EPSG:4326' // WGS84
      
      console.log(`Converting from ${sourceProjection} to ${targetProjection}`)
      
      // Get sample coordinates to establish bounds
      const sampleCoords = networkData.nodes.slice(0, Math.min(100, networkData.nodes.length))
        .map(node => {
          const x = node.x || node.coordinates?.[0] || 0
          const y = node.y || node.coordinates?.[1] || 0
          
          try {
            const [lon, lat] = proj4(sourceProjection, targetProjection, [x, y])
            return { lon, lat, valid: true }
          } catch (e) {
            console.warn(`Failed to convert coordinate [${x}, ${y}]:`, e)
            return { lon: 0, lat: 0, valid: false }
          }
        })
        .filter(coord => coord.valid)
      
      if (sampleCoords.length === 0) {
        throw new Error('No valid coordinates could be converted')
      }
      
      // Calculate bounds from converted coordinates
      const lons = sampleCoords.map(c => c.lon)
      const lats = sampleCoords.map(c => c.lat)
      
      const bounds = {
        minLon: Math.min(...lons),
        maxLon: Math.max(...lons),
        minLat: Math.min(...lats),
        maxLat: Math.max(...lats)
      }
      
      console.log('=== COORDINATE CONVERSION RESULTS ===')
      console.log('Source projection:', sourceProjection)
      console.log('Target projection:', targetProjection)
      console.log('Geographic bounds after conversion:', bounds)
      console.log('Sample original -> converted coordinates:')
      networkData.nodes.slice(0, 3).forEach((node, i) => {
        const original = [node.x || 0, node.y || 0]
        const converted = sampleCoords[i]
        console.log(`  Node ${node.id}: [${original[0]}, ${original[1]}] -> [${converted?.lon}, ${converted?.lat}]`)
      })
      
      return {
        bounds,
        transform: (x: number, y: number) => {
          try {
            return proj4(sourceProjection, targetProjection, [x, y])
          } catch (e) {
            console.warn(`Failed to convert [${x}, ${y}], using fallback`)
            // Fallback to center of detected bounds
            return [coordSystem.centerApprox?.[0] || -75.5, coordSystem.centerApprox?.[1] || 10.4]
          }
        },
        coordinateSystem: coordSystem
      }
      
    } catch (error) {
      console.error('Coordinate conversion failed:', error)
      
      // Fallback to approximate conversion
      const centerLon = coordSystem.centerApprox?.[0] || -75.5
      const centerLat = coordSystem.centerApprox?.[1] || 10.4
      
      return {
        bounds: {
          minLon: centerLon - 0.05,
          maxLon: centerLon + 0.05,
          minLat: centerLat - 0.05,
          maxLat: centerLat + 0.05
        },
        transform: (x: number, y: number) => [centerLon, centerLat],
        coordinateSystem: coordSystem,
        error: `Coordinate conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  }, [detectCoordinateSystem])
  
  // Add network overlay to map
  const addNetworkToMap = useCallback(() => {
    if (!map.current || !networkData) return
    
    console.log('Adding network to map:', {
      nodesCount: networkData.nodes.length,
      linksCount: networkData.links.length,
      firstNode: networkData.nodes[0],
      coordinateSystem: networkData.coordinate_system
    })
    
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
    
    const geoConversion = convertToGeoCoordinates(networkData)
    console.log('GeoConversion result:', geoConversion)
    
    // Create GeoJSON for nodes
    const nodesGeoJSON: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: networkData.nodes.map(node => {
        const coords = geoConversion.transform(
          node.x || node.coordinates?.[0] || 0,
          node.y || node.coordinates?.[1] || 0
        )
        
        // Debug first few nodes
        if (networkData.nodes.indexOf(node) < 3) {
          console.log(`Node ${node.id}: Original (${node.x}, ${node.y}) -> Transformed (${coords[0]}, ${coords[1]})`)
        }
        
        let color = '#3B82F6' // Default junction color
        if (node.type === 'tank') color = '#EF4444'
        else if (node.type === 'reservoir') color = '#10B981'
        
        // Apply simulation results if available
        if (simulationResults?.node_results?.[node.id]) {
          const pressure = simulationResults.node_results[node.id].pressure
          if (pressure < 20) color = '#DC2626' // Red for low pressure
          else if (pressure > 80) color = '#F97316' // Orange for high pressure
        }
        
        return {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: coords
          },
          properties: {
            id: node.id,
            type: node.type,
            label: node.label,
            color: color,
            elevation: node.elevation,
            demand: node.demand,
            pressure: simulationResults?.node_results?.[node.id]?.pressure,
            head: simulationResults?.node_results?.[node.id]?.head
          }
        }
      })
    }
    
    // Create GeoJSON for links
    const linksGeoJSON: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: networkData.links.map(link => {
        const fromNode = networkData.nodes.find(n => n.id === link.from)
        const toNode = networkData.nodes.find(n => n.id === link.to)
        
        if (!fromNode || !toNode) return null
        
        const fromCoords = geoConversion.transform(
          fromNode.x || fromNode.coordinates?.[0] || 0,
          fromNode.y || fromNode.coordinates?.[1] || 0
        )
        const toCoords = geoConversion.transform(
          toNode.x || toNode.coordinates?.[0] || 0,
          toNode.y || toNode.coordinates?.[1] || 0
        )
        
        let color = '#6B7280' // Default pipe color
        let width = mapSettings.linkWidth
        
        if (link.type === 'pump') {
          color = '#DC2626'
          width = mapSettings.linkWidth * 2
        } else if (link.type === 'valve') {
          color = '#0891B2'
          width = mapSettings.linkWidth * 1.5
        }
        
        // Apply simulation results if available
        if (simulationResults?.link_results?.[link.id]) {
          const flow = Math.abs(simulationResults.link_results[link.id].flowrate || 0)
          width = Math.min(flow * 0.5 + mapSettings.linkWidth, mapSettings.linkWidth * 4)
        }
        
        return {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [fromCoords, toCoords]
          },
          properties: {
            id: link.id,
            type: link.type,
            label: link.label,
            color: color,
            width: width,
            length: link.length,
            diameter: link.diameter,
            flowrate: simulationResults?.link_results?.[link.id]?.flowrate,
            velocity: simulationResults?.link_results?.[link.id]?.velocity
          }
        }
      }).filter(Boolean) as GeoJSON.Feature[]
    }
    
    // Add sources
    try {
      map.current.addSource('network-links', {
        type: 'geojson',
        data: linksGeoJSON
      })
      console.log('Links source added successfully')
    } catch (e) {
      console.error('Error adding links source:', e)
    }
    
    try {
      map.current.addSource('network-nodes', {
        type: 'geojson',
        data: nodesGeoJSON
      })
      console.log('Nodes source added successfully')
    } catch (e) {
      console.error('Error adding nodes source:', e)
    }
    
    // Add layers
    console.log('Adding layers to map...')
    console.log('Links GeoJSON features:', linksGeoJSON.features.length)
    console.log('Nodes GeoJSON features:', nodesGeoJSON.features.length)
    
    // Links layer
    map.current.addLayer({
      id: 'network-links',
      type: 'line',
      source: 'network-links',
      paint: {
        'line-color': ['get', 'color'],
        'line-width': ['get', 'width'],
        'line-opacity': mapSettings.opacity
      }
    })
    console.log('Links layer added')
    
    // Nodes layer
    map.current.addLayer({
      id: 'network-nodes',
      type: 'circle',
      source: 'network-nodes',
      paint: {
        'circle-radius': mapSettings.nodeSize,
        'circle-color': ['get', 'color'],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
        'circle-opacity': mapSettings.opacity
      }
    })
    console.log('Nodes layer added')
    
    // Check if layers were added successfully
    setTimeout(() => {
      if (map.current) {
        const nodesLayer = map.current.getLayer('network-nodes')
        const linksLayer = map.current.getLayer('network-links')
        console.log('Layers check:', {
          nodesLayerExists: !!nodesLayer,
          linksLayerExists: !!linksLayer
        })
        
        // Check source data
        const nodesSource = map.current.getSource('network-nodes') as mapboxgl.GeoJSONSource
        const linksSource = map.current.getSource('network-links') as mapboxgl.GeoJSONSource
        if (nodesSource && linksSource) {
          console.log('Sources exist, checking features...')
        }
      }
    }, 1000)
    
    // Labels layer
    if (mapSettings.showLabels) {
      map.current.addLayer({
        id: 'node-labels',
        type: 'symbol',
        source: 'network-nodes',
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 12,
          'text-offset': [0, 1.5]
        },
        paint: {
          'text-color': '#000000',
          'text-halo-color': '#ffffff',
          'text-halo-width': 2
        }
      })
    }
    
    // Add click handlers
    map.current.on('click', 'network-nodes', (e) => {
      if (e.features && e.features.length > 0) {
        const feature = e.features[0]
        setSelectedNode(feature.properties)
      }
    })
    
    map.current.on('click', 'network-links', (e) => {
      if (e.features && e.features.length > 0) {
        const feature = e.features[0]
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
    
    // Fit map to network bounds
    const bounds = new mapboxgl.LngLatBounds()
    let boundsCount = 0
    nodesGeoJSON.features.forEach(feature => {
      if (feature.geometry.type === 'Point') {
        bounds.extend(feature.geometry.coordinates as [number, number])
        boundsCount++
      }
    })
    console.log(`Extended bounds with ${boundsCount} points`)
    
    // Only fit bounds if we have valid bounds
    try {
      const sw = bounds.getSouthWest()
      const ne = bounds.getNorthEast()
      
      // Check if bounds are valid (not infinite or NaN)
      if (isFinite(sw.lat) && isFinite(sw.lng) && isFinite(ne.lat) && isFinite(ne.lng)) {
        console.log('Fitting to bounds:', {
          sw: { lat: sw.lat, lng: sw.lng },
          ne: { lat: ne.lat, lng: ne.lng }
        })
        map.current.fitBounds(bounds, { 
          padding: 50,
          maxZoom: 16
        })
      } else {
        console.warn('Invalid bounds:', { sw, ne })
      }
    } catch (e) {
      console.warn('Could not fit bounds:', e)
    }
    
  }, [networkData, simulationResults, mapSettings, convertToGeoCoordinates])
  
  // Update network overlay when data or settings change
  useEffect(() => {
    if (showNetworkOverlay && networkData && map.current) {
      // Wait for map style to be loaded
      if (map.current.isStyleLoaded()) {
        addNetworkToMap()
      } else {
        map.current.once('styledata', () => {
          setTimeout(() => {
            addNetworkToMap()
          }, 100)
        })
      }
    }
  }, [networkData, simulationResults, showNetworkOverlay, mapSettings, addNetworkToMap])
  
  const handleFileUpload = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const result = await window.electronAPI.wntr.loadINPFile()
      
      if (result.success && result.data) {
        console.log('Network loaded:', result.data)
        setNetworkData(result.data)
        // Network overlay is always visible
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
        // Refresh the map overlay with new results
        if (showNetworkOverlay) {
          addNetworkToMap()
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
  
  const handleExportGeoJSON = () => {
    if (!networkData) return
    
    const geoConversion = convertToGeoCoordinates(networkData)
    console.log('GeoConversion result:', geoConversion)
    
    const exportData = {
      type: 'FeatureCollection',
      features: [
        ...networkData.nodes.map(node => {
          const coords = geoConversion.transform(
            node.x || node.coordinates?.[0] || 0,
            node.y || node.coordinates?.[1] || 0
          )
          
          return {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: coords
            },
            properties: {
              ...node,
              featureType: 'hydraulic_node'
            }
          }
        }),
        ...networkData.links.map(link => {
          const fromNode = networkData.nodes.find(n => n.id === link.from)
          const toNode = networkData.nodes.find(n => n.id === link.to)
          
          if (!fromNode || !toNode) return null
          
          const fromCoords = geoConversion.transform(
            fromNode.x || fromNode.coordinates?.[0] || 0,
            fromNode.y || fromNode.coordinates?.[1] || 0
          )
          const toCoords = geoConversion.transform(
            toNode.x || toNode.coordinates?.[0] || 0,
            toNode.y || toNode.coordinates?.[1] || 0
          )
          
          return {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: [fromCoords, toCoords]
            },
            properties: {
              ...link,
              featureType: 'hydraulic_link'
            }
          }
        }).filter(Boolean)
      ]
    }
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${networkData.name || 'network'}_geo.json`
    a.click()
    URL.revokeObjectURL(url)
  }
  

  return (
    <div className="flex-1 flex flex-col h-full bg-background">
      {/* Header */}
      <div className="border-b border-border p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">WNTR Network Visualization</h1>
            <p className="text-muted-foreground mt-1">
              Water distribution networks overlaid on OpenStreetMap
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Test button to add sample network */}
            <button
              onClick={() => {
                const testNetwork = {
                  name: 'Test Network',
                  summary: { junctions: 3, tanks: 0, reservoirs: 1, pipes: 3, pumps: 0, valves: 0 },
                  nodes: [
                    { id: 'J1', label: 'J1', type: 'junction', x: -99.133, y: 19.433 },
                    { id: 'J2', label: 'J2', type: 'junction', x: -99.132, y: 19.432 },
                    { id: 'J3', label: 'J3', type: 'junction', x: -99.134, y: 19.432 },
                    { id: 'R1', label: 'R1', type: 'reservoir', x: -99.133, y: 19.431 }
                  ],
                  links: [
                    { id: 'P1', label: 'P1', type: 'pipe', from: 'R1', to: 'J1' },
                    { id: 'P2', label: 'P2', type: 'pipe', from: 'J1', to: 'J2' },
                    { id: 'P3', label: 'P3', type: 'pipe', from: 'J1', to: 'J3' }
                  ],
                  options: {},
                  coordinate_system: { type: 'geographic' }
                }
                setNetworkData(testNetwork as any)
              }}
              className={cn(
                "px-4 py-2 rounded-lg",
                "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                "transition-colors text-sm"
              )}
            >
              Test Network
            </button>
            
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
                  onClick={() => {
                    if (map.current && networkData) {
                      const geoConversion = convertToGeoCoordinates(networkData)
                      
                      // Get the first few nodes to check their coordinates
                      const firstNodes = networkData.nodes.slice(0, 5)
                      console.log('Checking first nodes:')
                      firstNodes.forEach(node => {
                        const coords = geoConversion.transform(node.x, node.y)
                        console.log(`${node.id}: [${coords[0]}, ${coords[1]}]`)
                      })
                      
                      // Try to fit bounds again
                      const bounds = new mapboxgl.LngLatBounds()
                      networkData.nodes.forEach(node => {
                        const coords = geoConversion.transform(node.x, node.y)
                        bounds.extend(coords as [number, number])
                      })
                      
                      map.current.fitBounds(bounds, { padding: 50, maxZoom: 16 })
                    }
                  }}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg",
                    "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                    "transition-colors"
                  )}
                >
                  Center on Network
                </button>
                
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
                  onClick={handleExportGeoJSON}
                  disabled={loading}
                  className={cn(
                    "p-2 rounded-lg",
                    "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                    "transition-colors disabled:opacity-50"
                  )}
                  title="Export as GeoJSON"
                >
                  <Download className="w-4 h-4" />
                </button>
                
                <button
                  onClick={() => {
                    if (networkData) {
                      const coordSystem = detectCoordinateSystem(networkData)
                      const geoConversion = convertToGeoCoordinates(networkData)
                      console.log('=== DEBUG COORDINATE INFO ===')
                      console.log('Network name:', networkData.name)
                      console.log('Detected system:', coordSystem)
                      console.log('Conversion result:', geoConversion)
                      console.log('First 3 nodes with coordinates:')
                      networkData.nodes.slice(0, 3).forEach(node => {
                        const converted = geoConversion.transform(node.x || 0, node.y || 0)
                        console.log(`${node.id}: [${node.x}, ${node.y}] -> [${converted[0]}, ${converted[1]}]`)
                      })
                      alert(`Debug info logged to console. Check F12 > Console for details.\n\nDetected: ${coordSystem.region}`)
                    }
                  }}
                  className={cn(
                    "p-2 rounded-lg",
                    "bg-yellow-500 text-white hover:bg-yellow-600",
                    "transition-colors"
                  )}
                  title="Debug Coordinates"
                >
                  🐛
                </button>

                <button
                  onClick={() => setShowSettingsDialog(true)}
                  className={cn(
                    "p-2 rounded-lg",
                    "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                    "transition-colors"
                  )}
                  title="Map Settings"
                >
                  <Settings2 className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>
        
        {/* Network Summary */}
        {networkData && (
          <div className="mt-4 space-y-2">
            <div className="flex gap-4 text-sm">
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
            
            {/* Coordinate System Info */}
            {networkData && (
              <div className="text-xs text-muted-foreground space-y-1">
                <div className="flex items-center gap-2">
                  <MapPin className="w-3 h-3" />
                  <span>
                    Coordinate System: {networkData.coordinate_system?.type === 'geographic' ? 'Geographic (Lat/Lon)' : 
                                       networkData.coordinate_system?.type === 'projected' ? 'Projected' : 'Auto-detected'}
                    {networkData.coordinate_system?.units && ` • Units: ${networkData.coordinate_system.units}`}
                  </span>
                </div>
                {(() => {
                  const detectedSystem = detectCoordinateSystem(networkData)
                  return (
                    <div className="flex items-center gap-2 ml-5">
                      <span className="text-green-600">🎯</span>
                      <span>
                        Detected: {detectedSystem.region}
                        {detectedSystem.epsgCode && ` (${detectedSystem.epsgCode})`}
                      </span>
                    </div>
                  )
                })()}
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Map Container */}
      <div className="flex-1 relative">
        {loading && (
          <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-10">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        )}
        
        {!MAPBOX_ACCESS_TOKEN ? (
          <div className="w-full h-full flex items-center justify-center bg-muted/20">
            <div className="text-center max-w-md p-8">
              <Map className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-foreground mb-2">Mapbox Configuration Required</h3>
              <p className="text-muted-foreground mb-4">
                To visualize EPANET networks on the map, you need to configure a Mapbox access token.
              </p>
              <div className="bg-card rounded-lg p-4 text-left border border-border">
                <p className="text-sm font-medium mb-2">Setup Instructions:</p>
                <ol className="text-sm text-muted-foreground space-y-2">
                  <li>1. Create a free account at <a href="https://account.mapbox.com/auth/signup/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">mapbox.com</a></li>
                  <li>2. Copy your access token from the dashboard</li>
                  <li>3. Create a <code className="bg-muted px-1 py-0.5 rounded">.env</code> file in the project root</li>
                  <li>4. Add: <code className="bg-muted px-1 py-0.5 rounded">VITE_MAPBOX_ACCESS_TOKEN=your_token_here</code></li>
                  <li>5. Restart the development server</li>
                </ol>
              </div>
              <p className="text-xs text-muted-foreground mt-4">
                The map view integrates WNTR networks with OpenStreetMap data for geographic visualization.
              </p>
            </div>
          </div>
        ) : (
          <div className="relative w-full h-full">
            <div ref={mapContainer} className="w-full h-full">
              {/* Map will be rendered here */}
            </div>
            
            {/* Overlay message when style is changing */}
            {styleChanging && (
              <div className="absolute inset-0 pointer-events-auto flex items-center justify-center">
                <div className="bg-background/90 backdrop-blur-sm rounded-lg p-4 border border-border cursor-pointer hover:bg-background/95 transition-colors"
                     onClick={() => {
                       console.log('User cancelled style change')
                       setStyleChanging(false)
                       setError('Cambio de estilo cancelado por el usuario.')
                     }}>
                  <div className="text-center">
                    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                    <p className="text-sm font-medium">Cambiando estilo del mapa...</p>
                    <p className="text-xs text-muted-foreground mt-1">Haz clic para cancelar</p>
                  </div>
                </div>
              </div>
            )}
            
            {/* Overlay message when no network is loaded */}
            {!networkData && !loading && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="bg-background/90 backdrop-blur-sm rounded-lg p-6 border border-border pointer-events-auto">
                  <div className="text-center">
                    <Map className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                    <p className="text-lg font-medium mb-2">No Network Loaded</p>
                    <p className="text-sm text-muted-foreground mb-4">
                      Load an EPANET .inp file to visualize the network on the map
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
              </div>
            )}
          </div>
        )}
        
        {/* Map Controls */}
        <div className="absolute bottom-20 right-4 bg-background/90 backdrop-blur-sm rounded-lg p-2 text-xs">
          <div>Longitude: {lng} | Latitude: {lat} | Zoom: {zoom}</div>
        </div>
        
        
        {/* Selected Element Info */}
        {(selectedNode || selectedLink) && (
          <div className="absolute top-4 left-4 bg-background/95 backdrop-blur-sm rounded-lg p-4 max-w-sm shadow-lg border border-border">
            {selectedNode && (
              <div className="space-y-2">
                <h3 className="font-semibold flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-primary" />
                  Node: {selectedNode.label}
                </h3>
                <div className="text-sm space-y-1">
                  <div>Type: <span className="font-medium capitalize">{selectedNode.type}</span></div>
                  {selectedNode.elevation !== undefined && (
                    <div>Elevation: <span className="font-medium">{selectedNode.elevation} m</span></div>
                  )}
                  {selectedNode.pressure !== undefined && (
                    <div>Pressure: <span className="font-medium">{selectedNode.pressure?.toFixed(2)} m</span></div>
                  )}
                </div>
              </div>
            )}
            
            {selectedLink && (
              <div className="space-y-2">
                <h3 className="font-semibold">Link: {selectedLink.label}</h3>
                <div className="text-sm space-y-1">
                  <div>Type: <span className="font-medium capitalize">{selectedLink.type}</span></div>
                  {selectedLink.length !== undefined && (
                    <div>Length: <span className="font-medium">{selectedLink.length} m</span></div>
                  )}
                  {selectedLink.flowrate !== undefined && (
                    <div>Flow: <span className="font-medium">{selectedLink.flowrate?.toFixed(4)} L/s</span></div>
                  )}
                </div>
              </div>
            )}
            
            <button
              onClick={() => {
                setSelectedNode(null)
                setSelectedLink(null)
              }}
              className="mt-2 text-xs text-muted-foreground hover:text-foreground"
            >
              Close
            </button>
          </div>
        )}
      </div>
      
      {/* Settings Dialog */}
      <Dialog.Root open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
          <Dialog.Content className={cn(
            "fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
            "w-full max-w-md bg-background rounded-lg shadow-xl",
            "p-6 z-50"
          )}>
            <Dialog.Title className="text-xl font-semibold mb-4">Map Settings</Dialog.Title>
            
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Base Map Style
                  {styleChanging && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      (Cambiando estilo...)
                    </span>
                  )}
                </label>
                <select
                  value={mapSettings.baseMap}
                  onChange={(e) => setMapSettings({ 
                    ...mapSettings, 
                    baseMap: e.target.value as MapSettings['baseMap'] 
                  })}
                  disabled={styleChanging}
                  className={cn(
                    "w-full px-3 py-2 rounded-lg bg-input border border-border",
                    styleChanging && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <option value="streets">Streets</option>
                  <option value="satellite" disabled={satelliteDisabled}>
                    Satellite {satelliteDisabled ? '(No compatible)' : ''}
                  </option>
                  <option value="outdoors">Outdoors</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
                {satelliteDisabled && (
                  <div className="mt-2 p-2 bg-muted/20 rounded text-xs">
                    <p className="text-muted-foreground mb-2">
                      ⚠️ Modo satélite deshabilitado para prevenir errores del sistema
                    </p>
                    <button
                      onClick={() => {
                        setSatelliteDisabled(false)
                        localStorage.removeItem('satellite-disabled-by-system')
                        setError(null)
                        checkSatelliteCompatibility()
                      }}
                      className="text-primary hover:text-primary/80 underline text-xs"
                    >
                      Volver a intentar habilitar satélite
                    </button>
                  </div>
                )}
              </div>
              
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Network Opacity: {mapSettings.opacity}
                </label>
                <input
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.1"
                  value={mapSettings.opacity}
                  onChange={(e) => setMapSettings({ 
                    ...mapSettings, 
                    opacity: parseFloat(e.target.value) 
                  })}
                  className="w-full"
                />
              </div>
              
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Node Size: {mapSettings.nodeSize}
                </label>
                <input
                  type="range"
                  min="4"
                  max="20"
                  step="1"
                  value={mapSettings.nodeSize}
                  onChange={(e) => setMapSettings({ 
                    ...mapSettings, 
                    nodeSize: parseInt(e.target.value) 
                  })}
                  className="w-full"
                />
              </div>
              
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Link Width: {mapSettings.linkWidth}
                </label>
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="1"
                  value={mapSettings.linkWidth}
                  onChange={(e) => setMapSettings({ 
                    ...mapSettings, 
                    linkWidth: parseInt(e.target.value) 
                  })}
                  className="w-full"
                />
              </div>
              
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="showLabels"
                  checked={mapSettings.showLabels}
                  onChange={(e) => setMapSettings({ 
                    ...mapSettings, 
                    showLabels: e.target.checked 
                  })}
                  className="rounded"
                />
                <label htmlFor="showLabels" className="text-sm">Show node labels</label>
              </div>
              
              {/* Manual Position Adjustment */}
              {networkData && networkData.coordinate_system?.type !== 'geographic' && (
                <div className="pt-4 border-t border-border">
                  <h4 className="text-sm font-medium mb-3">Network Position Adjustment</h4>
                  <p className="text-xs text-muted-foreground mb-3">
                    Click on the map to set the center point for your network
                  </p>
                  
                  {mapSettings.manualPosition && (
                    <div className="space-y-2">
                      <div className="text-xs">
                        <span className="text-muted-foreground">Latitude:</span>
                        <span className="ml-2 font-mono">{mapSettings.manualPosition.lat.toFixed(6)}</span>
                      </div>
                      <div className="text-xs">
                        <span className="text-muted-foreground">Longitude:</span>
                        <span className="ml-2 font-mono">{mapSettings.manualPosition.lon.toFixed(6)}</span>
                      </div>
                      <button
                        onClick={() => setMapSettings({ 
                          ...mapSettings, 
                          manualPosition: undefined 
                        })}
                        className="text-xs text-primary hover:underline"
                      >
                        Reset to default position
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
            
            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setShowSettingsDialog(false)}
                className="flex-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Done
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      
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