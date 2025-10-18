import { useState, useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

// Set Mapbox access token
const MAPBOX_ACCESS_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || ''
if (MAPBOX_ACCESS_TOKEN) {
  mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN
}

export function WNTRSimpleViewer() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const [networkData, setNetworkData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mapStyle, setMapStyle] = useState('light')

  useEffect(() => {
    if (!mapContainer.current || map.current) return
    
    try {
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/light-v11',
        center: [0, 20],
        zoom: 2
      })
    } catch (err) {
      setError('Failed to initialize map')
    }

    return () => {
      map.current?.remove()
      map.current = null
    }
  }, [])

  const handleFileUpload = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const result = await window.electronAPI.wntr.loadINPFile()
      
      if (result.success && result.data) {
        setNetworkData(result.data)
        console.log('Network loaded:', result.data)
        // Display network after loading
        displayNetwork(result.data)
      } else {
        setError(result.error || 'Failed to load file')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load file')
    } finally {
      setLoading(false)
    }
  }

  const displayNetwork = (data: any) => {
    if (!map.current || !data) return

    // Remove existing layers
    ['network-nodes', 'network-links'].forEach(id => {
      if (map.current?.getLayer(id)) map.current.removeLayer(id)
      if (map.current?.getSource(id)) map.current.removeSource(id)
    })

    // Convert coordinates
    const convertCoords = (x: number, y: number) => {
      if (data.coordinate_system?.type === 'projected' && data.coordinate_system.bounds) {
        const bounds = data.coordinate_system.bounds
        // UTM Zone 14N for Mexico
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
    }

    // Create GeoJSON for nodes
    const nodesGeoJSON = {
      type: 'FeatureCollection',
      features: data.nodes.map((node: any) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: convertCoords(node.x || 0, node.y || 0)
        },
        properties: {
          id: node.id,
          type: node.type,
          color: node.type === 'tank' ? '#EF4444' : 
                 node.type === 'reservoir' ? '#10B981' : '#3B82F6'
        }
      }))
    }

    // Create GeoJSON for links
    const linksGeoJSON = {
      type: 'FeatureCollection',
      features: data.links.map((link: any) => {
        const fromNode = data.nodes.find((n: any) => n.id === link.from)
        const toNode = data.nodes.find((n: any) => n.id === link.to)
        
        if (fromNode && toNode) {
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
              color: link.type === 'pump' ? '#F59E0B' : 
                     link.type === 'valve' ? '#8B5CF6' : '#6B7280'
            }
          }
        }
        return null
      }).filter(Boolean)
    }

    // Add sources
    map.current.addSource('network-links', {
      type: 'geojson',
      data: linksGeoJSON as any
    })

    map.current.addSource('network-nodes', {
      type: 'geojson',
      data: nodesGeoJSON as any
    })

    // Add layers
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
        'circle-radius': 8,
        'circle-color': ['get', 'color'],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff'
      }
    })

    // Fit bounds
    if (data.coordinate_system?.bounds) {
      const bounds = data.coordinate_system.bounds
      const sw = convertCoords(bounds.minX, bounds.minY)
      const ne = convertCoords(bounds.maxX, bounds.maxY)
      
      map.current.fitBounds([sw, ne], {
        padding: 100,
        maxZoom: 14,
        duration: 2000
      })
    }
  }

  const handleMapStyleChange = async (style: string) => {
    if (!map.current || loading) return
    
    const styles: { [key: string]: string } = {
      'light': 'mapbox://styles/mapbox/light-v11',
      'dark': 'mapbox://styles/mapbox/dark-v11',
      'streets': 'mapbox://styles/mapbox/streets-v11',
      'outdoors': 'mapbox://styles/mapbox/outdoors-v11'
      // Temporarily removed satellite style due to stability issues
      // 'satellite': 'mapbox://styles/mapbox/satellite-v9'
    }
    
    if (styles[style]) {
      try {
        setLoading(true)
        setError(null)
        
        // Remove existing layers before changing style
        ['network-nodes', 'network-links'].forEach(id => {
          if (map.current?.getLayer(id)) {
            map.current.removeLayer(id)
          }
        })
        
        // Change style
        map.current.setStyle(styles[style])
        setMapStyle(style)
        
        // Wait for style to load completely
        await new Promise((resolve) => {
          if (map.current) {
            map.current.once('style.load', resolve)
          }
        })
        
        // Add a longer delay for satellite style
        const delay = style === 'satellite' ? 500 : 100
        await new Promise(resolve => setTimeout(resolve, delay))
        
        // Re-add network layers if data exists
        if (networkData && map.current) {
          displayNetwork(networkData)
        }
        
      } catch (error) {
        console.error('Error changing map style:', error)
        setError('Failed to change map style. Try another style.')
        // Revert to previous style
        setMapStyle('light')
      } finally {
        setLoading(false)
      }
    }
  }

  return (
    <div className="flex h-full bg-background">
      <div className="w-80 border-r p-4">
        <h2 className="text-lg font-semibold mb-4">WNTR Simple Test</h2>
        
        <button
          onClick={handleFileUpload}
          disabled={loading}
          className="w-full px-4 py-2 bg-primary text-white rounded"
        >
          {loading ? 'Loading...' : 'Load INP File'}
        </button>

        {error && (
          <div className="mt-4 p-2 bg-red-100 text-red-700 rounded">
            {error}
          </div>
        )}

        {networkData && (
          <div className="mt-4">
            <p>Nodes: {networkData.nodes?.length || 0}</p>
            <p>Links: {networkData.links?.length || 0}</p>
          </div>
        )}

        <div className="mt-4">
          <label className="block text-sm font-medium mb-2">Map Style</label>
          <select 
            value={mapStyle} 
            onChange={(e) => handleMapStyleChange(e.target.value)}
            disabled={loading}
            className="w-full px-3 py-2 border rounded disabled:opacity-50 disabled:cursor-not-allowed"
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

        {networkData && (
          <button
            onClick={() => {
              if (map.current && networkData.coordinate_system?.bounds) {
                const bounds = networkData.coordinate_system.bounds
                const convertCoords = (x: number, y: number) => {
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
                
                const sw = convertCoords(bounds.minX, bounds.minY)
                const ne = convertCoords(bounds.maxX, bounds.maxY)
                
                map.current.fitBounds([sw, ne], {
                  padding: 100,
                  maxZoom: 14,
                  duration: 1000
                })
              }
            }}
            className="mt-4 w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Center on Network
          </button>
        )}
      </div>
      
      <div className="flex-1">
        {!MAPBOX_ACCESS_TOKEN ? (
          <div className="flex items-center justify-center h-full">
            <p>Please set VITE_MAPBOX_ACCESS_TOKEN in .env</p>
          </div>
        ) : (
          <div ref={mapContainer} className="w-full h-full" />
        )}
      </div>
    </div>
  )
}