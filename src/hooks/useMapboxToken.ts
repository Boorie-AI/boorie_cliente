import { useEffect, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import { databaseService } from '@/services/database'

const ENV_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || ''
const SETTING_KEY = 'mapbox_access_token'

/**
 * Resolves the Mapbox token to use, in priority order: the token the user
 * pasted in Settings → General (persisted in the app DB, works in the
 * packaged app) → the VITE_MAPBOX_ACCESS_TOKEN build-time env var (dev only).
 * Sets mapboxgl.accessToken reactively so pasting a token in Settings takes
 * effect without restarting the app (issue #18).
 */
export function useMapboxToken(): { token: string; loading: boolean } {
  const [token, setToken] = useState(ENV_TOKEN)
  const [loading, setLoading] = useState(!ENV_TOKEN)

  useEffect(() => {
    let cancelled = false
    databaseService.getSetting(SETTING_KEY).then((stored) => {
      if (cancelled) return
      const resolved = stored?.trim() || ENV_TOKEN
      setToken(resolved)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (token) {
      mapboxgl.accessToken = token
    }
  }, [token])

  return { token, loading }
}
