import { logger } from '@/utils/logger'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import {
  FileUp,
  Play,
  Download,
  Map,
  Loader2,
  AlertCircle,
  MapPin,
  Globe2
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { useMapboxToken } from '@/hooks/useMapboxToken'
import { comprobarSoporteSatelite } from '@/utils/webgl'
import { useProjectStore } from '@/stores/projectStore'
import { CRSSelector } from './CRSSelector'
// Las definiciones proj4 viven en `@/services/geo/crs`, no aqui: cuando cada
// visor registraba las suyas, dos visores podian pintar la misma red con
// definiciones distintas del mismo EPSG (#36).
import {
  calcularLimites,
  nombreCRS,
  reproyectarLimites,
  motivoEsquematico,
  resolverCRS,
  validarCordura,
} from '@/services/geo/crs'

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
    epsg?: string | null
    units?: string
    possible_system?: string
    /** EPSG confirmado por el ingeniero; manda sobre cualquier deteccion (#36). */
    declared_epsg?: string | null
    requires_user_crs?: boolean
    detection_note?: string
  }
}

interface SimulationResults {
  node_results: any
  link_results: any
  timestamps: number[]
}

/**
 * Ajustes del mapa. Los posee el visor canónico (`WNTRAdvancedMapViewer`) y
 * viajan hasta aquí como props, para que haya un único panel donde tocarlos
 * (#37) en lugar de un diálogo propio compitiendo con el panel lateral.
 */
export interface MapSettings {
  baseMap: 'streets' | 'satellite' | 'outdoors' | 'light' | 'dark'
  showLabels: boolean
  opacity: number
  nodeSize: number
  linkWidth: number
  /** Qué magnitud de la simulación colorea la red. */
  simbologia: 'ninguna' | 'presion' | 'caudal'
}

interface WNTRMapViewerProps {
  networkData?: NetworkData | null
  simulationResults?: SimulationResults | null
  activeTimeStep?: number
  /** IDs de nudos a destacar sobre el resto (p. ej. los afectados por una interrupción). */
  highlightedNodes?: string[]
  /**
   * Red guardada que se está mostrando. Es donde se persiste el EPSG declarado;
   * sin ella la declaración vale sólo para la sesión en curso.
   */
  networkId?: string | null
  mapSettings: MapSettings
  onMapSettingsChange: (ajustes: MapSettings) => void
  /**
   * La red cargada desde el propio mapa tiene que subir al armazón: mientras se
   * quedaba aquí, el panel lateral seguía contando los nudos de la red anterior
   * y las dos vistas podían enseñar redes distintas (#37).
   */
  onNetworkLoaded?: (datos: NetworkData) => void
  /**
   * Salida hacia la vista topológica. La ofrece el aviso de «esta red no se
   * puede situar en el mapa»: es la respuesta a esa situación, no un modo suelto.
   */
  onVerTopologia?: () => void
}

// `in` sobre una lista literal: si está vacía la expresión es siempre falsa, así
// que sirve igual para "sin nada resaltado" sin ramas especiales.
const isHighlighted = (ids?: string[]) =>
  ['in', ['get', 'id'], ['literal', ids ?? []]] as unknown as mapboxgl.ExpressionSpecification

const highlightRadius = (ids: string[] | undefined, nodeSize: number) =>
  ['case', isHighlighted(ids), nodeSize * 2, nodeSize] as unknown as mapboxgl.ExpressionSpecification

const highlightStrokeWidth = (ids?: string[]) =>
  ['case', isHighlighted(ids), 3, 1] as unknown as mapboxgl.ExpressionSpecification

const highlightStrokeColor = (ids?: string[]) =>
  ['case', isHighlighted(ids), '#FACC15', '#ffffff'] as unknown as mapboxgl.ExpressionSpecification

export function WNTRMapViewer({
  networkData: propNetworkData,
  simulationResults: propSimulationResults,
  activeTimeStep: propActiveTimeStep,
  highlightedNodes,
  networkId,
  mapSettings,
  onMapSettingsChange,
  onVerTopologia,
  onNetworkLoaded
}: WNTRMapViewerProps) {
  // Priority: token pasted in Settings → General (persisted, works in the
  // packaged app) over the VITE_MAPBOX_ACCESS_TOKEN build-time env var.
  const { token: MAPBOX_ACCESS_TOKEN } = useMapboxToken()
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  // Default to Mexico City coordinates (TK_Lomas appears to be from Mexico)
  const [lng, setLng] = useState(-99.133208)
  const [lat, setLat] = useState(19.432608)
  const [zoom, setZoom] = useState(10)
  const [networkData, setNetworkData] = useState<NetworkData | null>(propNetworkData || null)
  const [simulationResults, setSimulationResults] = useState<SimulationResults | null>(propSimulationResults || null)

  // Sync props to state
  useEffect(() => {
    setNetworkData(propNetworkData || null)
  }, [propNetworkData])

  useEffect(() => {
    setSimulationResults(propSimulationResults || null)
  }, [propSimulationResults])

  // Sync time step from parent
  useEffect(() => {
    if (propActiveTimeStep !== undefined) {
      setCurrentTimeStep(propActiveTimeStep)
    }
  }, [propActiveTimeStep])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [styleChanging, setStyleChanging] = useState(false)
  // Network overlay is always visible
  const showNetworkOverlay = true
  const [selectedNode, setSelectedNode] = useState<any>(null)
  const [selectedLink, setSelectedLink] = useState<any>(null)

  // Check WebGL capabilities and satellite compatibility
  // El satélite se comprueba de verdad, una vez, en lugar de desactivarse para
  // todo el mundo. `satelliteDisabled` sigue existiendo porque el estilo puede
  // fallar también en marcha, y entonces se cae a calles.
  const soporteSatelite = useMemo(() => comprobarSoporteSatelite(), [])
  // Clave nueva a proposito: la anterior («satellite-disabled-by-system») la
  // escribia el codigo viejo en el primer arranque de cualquier equipo, asi que
  // su valor no distingue una caida real de la desactivacion universal.
  const [satelliteDisabled, setSatelliteDisabled] = useState(
    () => !soporteSatelite.disponible || localStorage.getItem('satelite-tumbo-la-app') === 'true'
  )


  // El mapa sigue necesitando cambiar sus propios ajustes en un caso —cuando el
  // estilo satélite falla y hay que caer a calles—, así que en vez de dejar de
  // poder hacerlo, avisa al dueño del estado. La ref evita que este shim tenga
  // que entrar en las dependencias de todos los callbacks que lo usan.
  const mapSettingsRef = useRef(mapSettings)
  useEffect(() => { mapSettingsRef.current = mapSettings }, [mapSettings])

  const setMapSettings = useCallback(
    (siguiente: MapSettings | ((previo: MapSettings) => MapSettings)) => {
      onMapSettingsChange(
        typeof siguiente === 'function' ? siguiente(mapSettingsRef.current) : siguiente
      )
    },
    [onMapSettingsChange]
  )

  // Listen for crash recovery messages from main process
  useEffect(() => {
    const cleanup = window.electronAPI?.onDisableSatelliteMode?.((data: { reason: string; message: string }) => {
      logger.warn('Received satellite disable request:', data)
      setSatelliteDisabled(true)
      setError(`${data.message} - Modo satélite ha sido deshabilitado permanentemente.`)

      // Persist the disable state
      localStorage.setItem('satelite-tumbo-la-app', 'true')

      // If currently on satellite, switch to streets
      if (mapSettings.baseMap === 'satellite') {
        setMapSettings(prev => ({ ...prev, baseMap: 'streets' }))
      }
    })

    return cleanup
  }, [mapSettings.baseMap])

  // New states for advanced visualization
  const [currentTimeStep, setCurrentTimeStep] = useState(0)

  // Initialize map
  useEffect(() => {
    logger.debug('Map initialization useEffect triggered')
    logger.debug('mapContainer.current:', mapContainer.current)
    logger.debug('MAPBOX_ACCESS_TOKEN exists:', !!MAPBOX_ACCESS_TOKEN)

    if (!mapContainer.current) {
      logger.error('Map container ref is null')
      return
    }

    // Check container dimensions
    const containerRect = mapContainer.current.getBoundingClientRect()
    logger.debug('Container dimensions:', {
      width: containerRect.width,
      height: containerRect.height,
      top: containerRect.top,
      left: containerRect.left
    })

    if (containerRect.width === 0 || containerRect.height === 0) {
      logger.error('Map container has zero dimensions:', containerRect)
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
      setError('Mapbox access token not configured. Add it in ⚙️ Settings → General.')
      return
    }

    try {
      logger.debug('Initializing Mapbox with token:', MAPBOX_ACCESS_TOKEN.substring(0, 10) + '...')
      logger.debug('Map container element:', mapContainer.current)
      logger.debug('Map settings:', { baseMap: mapSettings.baseMap, lng, lat, zoom })

      // Verify mapboxgl is properly loaded
      logger.debug('mapboxgl object:', mapboxgl)
      logger.debug('mapboxgl.accessToken:', mapboxgl.accessToken)

      // Capture container in a local so TS narrowing survives the inner closure.
      const container = mapContainer.current
      if (!container) {
        logger.error('Map container ref became null before map creation')
        return
      }

      // Try to create map with fallback styles
      const createMap = (style: string) => {
        return new mapboxgl.Map({
          container,
          style: style,
          center: [lng, lat],
          zoom: zoom,
          failIfMajorPerformanceCaveat: false, // Allow map to load even with poor performance
          preserveDrawingBuffer: true, // Help with WebGL issues in Electron
          antialias: false, // Disable antialiasing to reduce WebGL load
          transformRequest: (url, resourceType) => {
            logger.debug('Transform request:', url, resourceType)
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

      logger.debug('Creating map with style:', mapStyle)
      map.current = createMap(mapStyle)

      logger.debug('Map instance created:', map.current)

      // Add error handler with style fallback
      map.current.on('error', (e) => {
        // Mapbox attaches an HTTP `status` to the Error for AJAX failures via
        // its internal AJAXError subclass; the public `Error` type doesn't
        // expose it, so we read it through a structural type.
        const mapboxError = e.error as (Error & { status?: number }) | undefined
        logger.error('Mapbox error:', e)
        logger.error('Error details:', {
          status: mapboxError?.status,
          message: mapboxError?.message,
          type: e.type,
          target: e.target
        })

        if (mapboxError && mapboxError.status === 401) {
          setError('Token de acceso Mapbox inválido. Verifique su token en el archivo .env.')
        } else if (mapSettings.baseMap === 'satellite' && e.error) {
          logger.warn('Satellite style failed, falling back to streets')
          try {
            // Prevent infinite error loops
            if (map.current) {
              map.current.setStyle('mapbox://styles/mapbox/streets-v11')
              setSatelliteDisabled(true)
              setMapSettings(prev => ({ ...prev, baseMap: 'streets' }))
              setError('Las imágenes satelitales fallaron. Se cambió a vista de calles automáticamente.')
            }
          } catch (fallbackError) {
            logger.error('Fallback error:', fallbackError)
            setError(`Error del mapa: ${e.error?.message || 'Error desconocido'}. Intente recargar la página.`)
          }
        } else {
          setError(`Error del mapa: ${e.error?.message || 'Error desconocido'}`)
        }
      })

      map.current.on('load', () => {
        logger.debug('Map loaded successfully')
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
      logger.error('Map initialization error:', err)
      if (err instanceof Error) {
        if (err.message.includes('WebGL')) {
          // No `setWarning` exists in this component, so surface the hint via
          // the same error channel used elsewhere.
          setError(
            'WebGL not available. The map requires hardware acceleration. You can still load networks and view them in the network viewer. ' +
            'Try restarting the application or use the Network Graph view instead of Map view.'
          )
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
    // Re-run when the token resolves/changes: it now loads asynchronously
    // from Settings (DB) and may not be available yet on first mount.
  }, [MAPBOX_ACCESS_TOKEN])

  /**
   * `setStyle` de Mapbox se lleva por delante todas las fuentes y capas propias,
   * asi que al cambiar el mapa base hay que volver a pintar la red. Vive en una
   * ref porque el efecto que cambia el estilo se declara antes que
   * `addNetworkToMap`, y meterlo en sus dependencias reiniciaria el estilo cada
   * vez que cambiara cualquier ajuste del dibujo.
   */
  const repintarRedRef = useRef<() => void>(() => {})

  // Update map style
  useEffect(() => {
    if (!map.current || styleChanging) return

    // Check if map is loaded before changing style
    if (!map.current.loaded()) {
      logger.debug('Map not yet loaded, waiting...')
      map.current.once('load', () => {
        logger.debug('Map loaded, proceeding with style change')
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
    if (mapSettings.baseMap === 'satellite' && satelliteDisabled) {
      logger.warn('Satellite mode not available:', soporteSatelite.motivo)
      setError(soporteSatelite.motivo || 'Las imágenes satelitales no están disponibles en este equipo.')
      setMapSettings(prev => ({ ...prev, baseMap: 'streets' }))
      return
    }

    // Prevent multiple simultaneous style changes
    setStyleChanging(true)

    try {
      let newStyle = `mapbox://styles/mapbox/${mapSettings.baseMap}-v11`

      // Use updated satellite style
      if (mapSettings.baseMap === 'satellite') {
        newStyle = 'mapbox://styles/mapbox/satellite-streets-v12'
        logger.debug('Switching to satellite mode...')
      }

      logger.debug('Changing map style to:', newStyle)

      // Clear any previous errors
      setError(null)

      // Set up one-time error handler for style change
      const handleStyleError = (e: any) => {
        logger.error('Style change error:', e)
        setStyleChanging(false)

        if (mapSettings.baseMap === 'satellite') {
          logger.warn('Satellite style failed during change, reverting to streets')
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
            logger.error('Failed to revert to streets style:', revertError)
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
        logger.warn('Style change timeout, resetting state')
        setStyleChanging(false)
        setError('Tiempo de espera agotado al cambiar estilo. Intente de nuevo.')
        map.current?.off('error', handleStyleError)
      }, 5000) // 5 second timeout

      // Remove error handler and reset state after successful style load
      map.current.once('style.load', () => {
        logger.debug('Style loaded successfully:', newStyle)
        setStyleChanging(false)
        clearTimeout(timeoutId)
        map.current?.off('error', handleStyleError)
        // El estilo nuevo llega sin la red: hay que volver a ponerla.
        repintarRedRef.current()
      })

    } catch (error) {
      logger.error('Critical error changing map style:', error)
      setStyleChanging(false)
      setError(`Error crítico al cambiar estilo del mapa: ${error instanceof Error ? error.message : 'Error desconocido'}`)

      // Revert to safe default if satellite fails
      if (mapSettings.baseMap === 'satellite') {
        setMapSettings(prev => ({ ...prev, baseMap: 'streets' }))
      }
    }
  }, [mapSettings.baseMap, styleChanging])

  // El posicionamiento manual —pinchar el mapa para colocar la red a ojo— se
  // retira con #37: guardaba el punto y no lo usaba para nada, y desde #36 la
  // posición sale del EPSG declarado, no de una estimación del usuario.


  // Sistema de coordenadas de la red (#36, #48)
  //
  // Lo declarado por el ingeniero manda sobre cualquier deteccion. La deteccion
  // solo reconoce coordenadas geograficas, que es lo unico que las coordenadas
  // demuestran por si solas: el huso de una UTM no se puede deducir de la X.
  // Hasta la v1.9 aqui habia 200 lineas de rangos codificados a mano por pais y
  // un `else` final que asumia UTM 18N, asi que una red de un pais no
  // contemplado se pintaba en el Caribe colombiano sin avisar de nada.
  const [epsgDeclarado, setEpsgDeclarado] = useState<string | null>(null)
  const [mostrarSelectorCRS, setMostrarSelectorCRS] = useState(false)
  const paisProyecto = useProjectStore(s => s.currentProject?.location?.country ?? null)

  useEffect(() => {
    setEpsgDeclarado(networkData?.coordinate_system?.declared_epsg ?? null)
  }, [networkData])

  const limitesRed = useMemo(
    () => (networkData ? calcularLimites(networkData.nodes) : null),
    [networkData]
  )

  const crs = useMemo(() => resolverCRS(epsgDeclarado, limitesRed), [epsgDeclarado, limitesRed])

  /**
   * Reproyeccion a WGS84. `null` cuando no hay sistema con el que reproyectar:
   * quien pinta comprueba esto y no dibuja, en lugar de recibir un transformador
   * de mentira que devuelva un punto cualquiera.
   *
   * Depende del EPSG y de los nudos, no del .inp: cambiar el sistema en el
   * selector recoloca la red sin volver a cargar el fichero.
   */
  const conversion = useMemo(() => {
    if (!crs.epsg || !limitesRed) return null
    try {
      const { transformar, limites, centroide } = reproyectarLimites(limitesRed, crs.epsg)
      return {
        transformar,
        limites,
        centroide,
        cordura: validarCordura(centroide, paisProyecto),
      }
    } catch (e) {
      logger.error('No se pudo reproyectar la red:', e)
      return null
    }
  }, [crs.epsg, limitesRed, paisProyecto])

  // En una ref, no en las dependencias de addNetworkToMap: si entrara ahí, cada
  // cambio de selección recrearía capas y fuentes (y con ellas el encuadre). La
  // ref permite que una reconstrucción por otro motivo pinte el resaltado
  // vigente en lugar del que hubiera cuando se creó el callback.
  const highlightedNodesRef = useRef<string[] | undefined>(highlightedNodes)
  useEffect(() => { highlightedNodesRef.current = highlightedNodes }, [highlightedNodes])

  // Add network overlay to map
  const addNetworkToMap = useCallback(() => {
    if (!map.current || !networkData) return

    logger.debug('Adding network to map:', {
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

    // Sin sistema de coordenadas no se pinta nada: dibujar la red en un sitio
    // inventado es peor que no dibujarla, porque el ingeniero no tiene forma de
    // saber que la posicion es falsa (#48). El aviso de la cabecera explica que
    // falta declarar el EPSG.
    if (!conversion) {
      logger.warn('Red sin sistema de coordenadas resuelto: no se dibuja', { motivo: crs.motivo })
      return
    }
    const geoConversion = conversion

    // Create GeoJSON for nodes
    const nodesGeoJSON: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: networkData.nodes.map(node => {
        const coords = geoConversion.transformar(
          node.x || node.coordinates?.[0] || 0,
          node.y || node.coordinates?.[1] || 0
        )

        // Debug first few nodes
        if (networkData.nodes.indexOf(node) < 3) {
          logger.debug(`Node ${node.id}: Original (${node.x}, ${node.y}) -> Transformed (${coords[0]}, ${coords[1]})`)
        }

        let color = '#3B82F6' // Default junction color
        if (node.type === 'tank') color = '#EF4444'
        else if (node.type === 'reservoir') color = '#10B981'

        // La presión colorea los nudos sólo cuando el panel lo pide. Antes lo
        // hacía siempre y el interruptor «mapa de presiones» no llegaba al mapa:
        // encendido o apagado, se pintaba igual (#37).
        if (mapSettings.simbologia === 'presion' && simulationResults?.node_results?.[node.id]) {
          const pressureArray = simulationResults.node_results[node.id].pressure
          // Access specific time step if it exists, otherwise use 0 or default
          const pressure = Array.isArray(pressureArray) && currentTimeStep !== undefined
            ? pressureArray[currentTimeStep] ?? pressureArray[0]
            : pressureArray

          if (typeof pressure === 'number') {
            if (pressure < 20) color = '#DC2626' // Red for low pressure
            else if (pressure > 80) color = '#F97316' // Orange for high pressure
          }
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
            pressure: Array.isArray(simulationResults?.node_results?.[node.id]?.pressure)
              ? simulationResults?.node_results?.[node.id]?.pressure[currentTimeStep]
              : simulationResults?.node_results?.[node.id]?.pressure,
            head: Array.isArray(simulationResults?.node_results?.[node.id]?.head)
              ? simulationResults?.node_results?.[node.id]?.head[currentTimeStep]
              : simulationResults?.node_results?.[node.id]?.head
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

        const fromCoords = geoConversion.transformar(
          fromNode.x || fromNode.coordinates?.[0] || 0,
          fromNode.y || fromNode.coordinates?.[1] || 0
        )
        const toCoords = geoConversion.transformar(
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

        // Igual que con la presión: el caudal engorda el tramo sólo si es la
        // simbología elegida.
        if (mapSettings.simbologia === 'caudal' && simulationResults?.link_results?.[link.id]) {
          const flowArray = simulationResults.link_results[link.id].flowrate
          const flowValue = Array.isArray(flowArray) && currentTimeStep !== undefined
            ? flowArray[currentTimeStep] ?? flowArray[0]
            : flowArray

          const flow = Math.abs(flowValue || 0)
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
            flowrate: Array.isArray(simulationResults?.link_results?.[link.id]?.flowrate)
              ? simulationResults?.link_results?.[link.id]?.flowrate[currentTimeStep]
              : simulationResults?.link_results?.[link.id]?.flowrate,
            velocity: Array.isArray(simulationResults?.link_results?.[link.id]?.velocity)
              ? simulationResults?.link_results?.[link.id]?.velocity[currentTimeStep]
              : simulationResults?.link_results?.[link.id]?.velocity
          }
        }
      }).filter(Boolean) as GeoJSON.Feature[]
    }

    // Add sources
    try {
      if (map.current.getSource('network-links')) {
        (map.current.getSource('network-links') as mapboxgl.GeoJSONSource).setData(linksGeoJSON);
      } else {
        map.current.addSource('network-links', {
          type: 'geojson',
          data: linksGeoJSON
        })
      }
    } catch (e) {
      logger.error('Error adding/updating links source:', e)
    }

    try {
      if (map.current.getSource('network-nodes')) {
        (map.current.getSource('network-nodes') as mapboxgl.GeoJSONSource).setData(nodesGeoJSON);
      } else {
        map.current.addSource('network-nodes', {
          type: 'geojson',
          data: nodesGeoJSON
        })
      }
    } catch (e) {
      logger.error('Error adding/updating nodes source:', e)
    }

    // Add layers if they don't exist
    if (!map.current.getLayer('network-links')) {
      map.current.addLayer({
        id: 'network-links',
        type: 'line',
        source: 'network-links',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['get', 'width'],
          'line-opacity': mapSettings.opacity
        }
      });
    }

    if (!map.current.getLayer('network-nodes')) {
      map.current.addLayer({
        id: 'network-nodes',
        type: 'circle',
        source: 'network-nodes',
        paint: {
          // El nudo resaltado gana tamaño y un halo ámbar: el color base ya lo
          // usa la capa de presiones, así que distinguirlo sólo por color no
          // serviría cuando la simulación pinta los nudos de rojo o naranja.
          // La lista va en el paint, no en las propiedades de cada feature, para
          // que resaltar no obligue a reconstruir la fuente (y con ella el
          // encuadre del mapa) cada vez que cambia la selección.
          'circle-radius': highlightRadius(highlightedNodesRef.current, mapSettings.nodeSize),
          'circle-color': ['get', 'color'],
          'circle-opacity': mapSettings.opacity,
          'circle-stroke-width': highlightStrokeWidth(highlightedNodesRef.current),
          'circle-stroke-color': highlightStrokeColor(highlightedNodesRef.current)
        }
      });
    }

    if (mapSettings.showLabels) {
      if (!map.current.getLayer('node-labels')) {
        map.current.addLayer({
          id: 'node-labels',
          type: 'symbol',
          source: 'network-nodes',
          layout: {
            'text-field': ['get', 'label'],
            'text-variable-anchor': ['top', 'bottom', 'left', 'right'],
            'text-radial-offset': 0.5,
            'text-justify': 'auto',
            'text-size': 12
          },
          paint: {
            'text-color': '#000000',
            'text-halo-color': '#ffffff',
            'text-halo-width': 2
          }
        });
      }
    } else {
      if (map.current.getLayer('node-labels')) {
        map.current.removeLayer('node-labels');
      }
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
    logger.debug(`Extended bounds with ${boundsCount} points`)

    // Only fit bounds if we have valid bounds
    try {
      const sw = bounds.getSouthWest()
      const ne = bounds.getNorthEast()

      // Check if bounds are valid (not infinite or NaN)
      if (isFinite(sw.lat) && isFinite(sw.lng) && isFinite(ne.lat) && isFinite(ne.lng)) {
        logger.debug('Fitting to bounds:', {
          sw: { lat: sw.lat, lng: sw.lng },
          ne: { lat: ne.lat, lng: ne.lng }
        })
        map.current.fitBounds(bounds, {
          padding: 50,
          maxZoom: 16
        })
      } else {
        logger.warn('Invalid bounds:', { sw, ne })
      }
    } catch (e) {
      logger.warn('Could not fit bounds:', e)
    }

  // `currentTimeStep` en las dependencias: sin él, la simbología se quedaba
  // congelada en el paso que hubiera cuando se creó el callback y mover la barra
  // no repintaba el mapa (#45).
  }, [networkData, simulationResults, mapSettings, conversion, crs.motivo, currentTimeStep])

  useEffect(() => { repintarRedRef.current = addNetworkToMap }, [addNetworkToMap])

  // Resaltar es sólo cambiar el paint de la capa ya montada: nada de rehacer
  // fuentes ni volver a encuadrar.
  useEffect(() => {
    if (!map.current?.getLayer('network-nodes')) return
    map.current.setPaintProperty('network-nodes', 'circle-radius', highlightRadius(highlightedNodes, mapSettings.nodeSize))
    map.current.setPaintProperty('network-nodes', 'circle-stroke-width', highlightStrokeWidth(highlightedNodes))
    map.current.setPaintProperty('network-nodes', 'circle-stroke-color', highlightStrokeColor(highlightedNodes))
  }, [highlightedNodes, mapSettings.nodeSize, networkData])

  // La opacidad se aplica sobre las capas ya montadas: `addNetworkToMap` sólo
  // las crea si no existen, así que sin esto mover el deslizador no haría nada
  // hasta la siguiente reconstrucción. Antes no hacía nada nunca: el valor se
  // guardaba y no llegaba al mapa (#37).
  useEffect(() => {
    if (!map.current) return
    if (map.current.getLayer('network-nodes')) {
      map.current.setPaintProperty('network-nodes', 'circle-opacity', mapSettings.opacity)
    }
    if (map.current.getLayer('network-links')) {
      map.current.setPaintProperty('network-links', 'line-opacity', mapSettings.opacity)
    }
  }, [mapSettings.opacity, networkData])

  // Al perder el sistema de coordenadas hay que retirar lo pintado: si no, la
  // red seguiria dibujada en su posicion anterior mientras el aviso dice que no
  // se puede situar.
  useEffect(() => {
    if (conversion || !map.current) return
    for (const capa of ['node-labels', 'network-nodes', 'network-links']) {
      if (map.current.getLayer(capa)) map.current.removeLayer(capa)
    }
    for (const fuente of ['network-nodes', 'network-links']) {
      if (map.current.getSource(fuente)) map.current.removeSource(fuente)
    }
  }, [conversion])

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
  }, [networkData, simulationResults, showNetworkOverlay, mapSettings, currentTimeStep, addNetworkToMap])

  const handleFileUpload = async () => {
    try {
      setLoading(true)
      setError(null)

      const result = await window.electronAPI.wntr.loadINPFile()

      if (result.success && result.data) {
        logger.debug('Network loaded:', result.data)
        setNetworkData(result.data)
        onNetworkLoaded?.(result.data)
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

    // El GeoJSON es WGS84 por definicion, asi que exportar sin CRS declarado
    // produciria un fichero con coordenadas falsas.
    if (!conversion) {
      setError('Declara el sistema de coordenadas de la red antes de exportar a GeoJSON.')
      return
    }
    const geoConversion = conversion

    const exportData = {
      type: 'FeatureCollection',
      features: [
        ...networkData.nodes.map(node => {
          const coords = geoConversion.transformar(
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

          const fromCoords = geoConversion.transformar(
            fromNode.x || fromNode.coordinates?.[0] || 0,
            fromNode.y || fromNode.coordinates?.[1] || 0
          )
          const toCoords = geoConversion.transformar(
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
                    if (map.current && networkData && conversion) {
                      const geoConversion = conversion

                      // Get the first few nodes to check their coordinates
                      const firstNodes = networkData.nodes.slice(0, 5)
                      logger.debug('Checking first nodes:')
                      firstNodes.forEach(node => {
                        const coords = geoConversion.transformar(node.x, node.y)
                        logger.debug(`${node.id}: [${coords[0]}, ${coords[1]}]`)
                      })

                      // Try to fit bounds again
                      const bounds = new mapboxgl.LngLatBounds()
                      networkData.nodes.forEach(node => {
                        const coords = geoConversion.transformar(node.x, node.y)
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
                  onClick={() => setMostrarSelectorCRS(true)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg transition-colors",
                    crs.epsg
                      ? "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                      : "bg-yellow-500 text-white hover:bg-yellow-600"
                  )}
                  title="Sistema de coordenadas de la red"
                >
                  <Globe2 className="w-4 h-4" />
                  {crs.epsg ?? 'Declarar EPSG'}
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

            {/* Sistema de coordenadas: estado explícito, nunca un dato inventado (#36) */}
            <div className="text-xs space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="w-3 h-3" />
                <span>
                  Coordenadas del fichero:{' '}
                  {networkData.coordinate_system?.type === 'geographic'
                    ? 'geográficas (lon/lat)'
                    : networkData.coordinate_system?.type === 'projected'
                      ? 'proyectadas'
                      : 'sin determinar'}
                  {networkData.coordinate_system?.units && ` • unidades: ${networkData.coordinate_system.units}`}
                </span>
              </div>

              {crs.epsg ? (
                <div className="flex items-center gap-2 ml-5 text-muted-foreground">
                  <Globe2 className="w-3 h-3" />
                  <span>
                    {crs.origen === 'declarado' ? 'Declarado' : 'Sugerido'}: {crs.epsg} —{' '}
                    {nombreCRS(crs.epsg)}
                    {crs.origen === 'sugerido' && ' (sin confirmar)'}
                  </span>
                  <button
                    onClick={() => setMostrarSelectorCRS(true)}
                    className="underline hover:text-foreground"
                  >
                    cambiar
                  </button>
                </div>
              ) : (
                <div className="ml-5 flex items-start gap-2 rounded-md border border-yellow-500/50 bg-yellow-500/10 px-3 py-2 text-yellow-700 dark:text-yellow-400">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    Esta red no se puede situar en el mapa: {crs.motivo}{' '}
                    {/* Con coordenadas de esquema la salida buena es el esquema, no
                        declarar un EPSG: se ofrece primero. */}
                    {crs.esquematico && onVerTopologia ? (
                      <>
                        <button onClick={onVerTopologia} className="font-medium underline">
                          Ver el esquema de la red
                        </button>
                        {' · '}
                        <button
                          onClick={() => setMostrarSelectorCRS(true)}
                          className="underline"
                        >
                          declarar un EPSG de todos modos
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => setMostrarSelectorCRS(true)}
                          className="font-medium underline"
                        >
                          Declarar sistema de coordenadas
                        </button>
                        {onVerTopologia && (
                          <>
                            {' · '}
                            <button onClick={onVerTopologia} className="font-medium underline">
                              Ver el esquema de la red
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </span>
                </div>
              )}

              {crs.epsg && crs.esquematico && (
                <div className="ml-5 flex items-start gap-2 rounded-md border border-yellow-500/50 bg-yellow-500/10 px-3 py-2 text-yellow-700 dark:text-yellow-400">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    Ojo: {limitesRed && motivoEsquematico(limitesRed)} Se está dibujando donde{' '}
                    {crs.epsg} manda para esos números, que no tiene por qué ser dónde está.{' '}
                    {onVerTopologia && (
                      <button onClick={onVerTopologia} className="font-medium underline">
                        Ver el esquema
                      </button>
                    )}
                  </span>
                </div>
              )}

              {conversion && !conversion.cordura.ok && (
                <div className="ml-5 flex items-start gap-2 rounded-md border border-yellow-500/50 bg-yellow-500/10 px-3 py-2 text-yellow-700 dark:text-yellow-400">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{conversion.cordura.aviso}</span>
                </div>
              )}
            </div>
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
                  <li>3. Open <strong>⚙️ Settings → General</strong> in Boorie</li>
                  <li>4. Paste it into the <strong>Mapbox Access Token</strong> field and click Save</li>
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
                    logger.debug('User cancelled style change')
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

      <CRSSelector
        abierto={mostrarSelectorCRS}
        onCerrar={() => setMostrarSelectorCRS(false)}
        limites={limitesRed}
        epsgActual={crs.epsg}
        networkId={networkId}
        onDeclarado={setEpsgDeclarado}
      />

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