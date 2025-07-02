// Offline Detection Hook - Detect and handle offline/online states

import { useState, useEffect, useCallback, useRef } from 'react'

export interface OfflineState {
  isOnline: boolean
  isOffline: boolean
  lastOnlineTime: Date | null
  offlineDuration: number
  connectionQuality: 'poor' | 'good' | 'excellent' | 'unknown'
  retryCount: number
}

export interface OfflineConfig {
  enablePing: boolean
  pingInterval: number
  pingTimeout: number
  pingUrls: string[]
  retryAttempts: number
  retryDelay: number
  storageKey: string
}

const defaultConfig: OfflineConfig = {
  enablePing: true,
  pingInterval: 30000, // 30 seconds
  pingTimeout: 5000,   // 5 seconds
  pingUrls: [
    'https://www.google.com/favicon.ico',
    'https://httpstat.us/200',
    'https://jsonplaceholder.typicode.com/posts/1'
  ],
  retryAttempts: 3,
  retryDelay: 2000,
  storageKey: 'calendar_offline_state'
}

export const useOfflineDetection = (config: Partial<OfflineConfig> = {}) => {
  const finalConfig = { ...defaultConfig, ...config }
  
  const [state, setState] = useState<OfflineState>({
    isOnline: navigator.onLine,
    isOffline: !navigator.onLine,
    lastOnlineTime: navigator.onLine ? new Date() : null,
    offlineDuration: 0,
    connectionQuality: 'unknown',
    retryCount: 0
  })

  const pingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Test connection quality by measuring ping response time
  const testConnectionQuality = useCallback(async (): Promise<'poor' | 'good' | 'excellent'> => {
    const startTime = performance.now()
    
    try {
      const response = await fetch(finalConfig.pingUrls[0], {
        method: 'HEAD',
        mode: 'no-cors',
        cache: 'no-cache',
        signal: AbortSignal.timeout(finalConfig.pingTimeout)
      })
      
      const endTime = performance.now()
      const latency = endTime - startTime
      
      if (latency < 100) return 'excellent'
      if (latency < 500) return 'good'
      return 'poor'
    } catch {
      return 'poor'
    }
  }, [finalConfig.pingUrls, finalConfig.pingTimeout])

  // Ping multiple URLs to verify connectivity
  const pingCheck = useCallback(async (): Promise<boolean> => {
    const promises = finalConfig.pingUrls.map(async (url) => {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), finalConfig.pingTimeout)
        
        const response = await fetch(url, {
          method: 'HEAD',
          mode: 'no-cors',
          cache: 'no-cache',
          signal: controller.signal
        })
        
        clearTimeout(timeoutId)
        return true
      } catch {
        return false
      }
    })

    const results = await Promise.allSettled(promises)
    const successCount = results.filter(result => 
      result.status === 'fulfilled' && result.value === true
    ).length

    // Consider online if at least one ping succeeds
    return successCount > 0
  }, [finalConfig.pingUrls, finalConfig.pingTimeout])

  // Handle online state change
  const handleOnline = useCallback(async () => {
    // Verify with ping if enabled
    if (finalConfig.enablePing) {
      const isActuallyOnline = await pingCheck()
      if (!isActuallyOnline) return
    }

    const quality = await testConnectionQuality()
    
    setState(prev => ({
      ...prev,
      isOnline: true,
      isOffline: false,
      lastOnlineTime: new Date(),
      connectionQuality: quality,
      retryCount: 0
    }))

    // Clear offline duration timer
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current)
      durationIntervalRef.current = null
    }

    // Save state to localStorage
    localStorage.setItem(finalConfig.storageKey, JSON.stringify({
      lastOnlineTime: new Date().toISOString(),
      wasOnline: true
    }))
  }, [finalConfig.enablePing, finalConfig.storageKey, pingCheck, testConnectionQuality])

  // Handle offline state change
  const handleOffline = useCallback(() => {
    setState(prev => ({
      ...prev,
      isOnline: false,
      isOffline: true,
      connectionQuality: 'poor',
      offlineDuration: 0
    }))

    // Start offline duration timer
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current)
    }
    
    durationIntervalRef.current = setInterval(() => {
      setState(prev => ({
        ...prev,
        offlineDuration: prev.offlineDuration + 1000
      }))
    }, 1000)

    // Save state to localStorage
    localStorage.setItem(finalConfig.storageKey, JSON.stringify({
      lastOnlineTime: state.lastOnlineTime?.toISOString(),
      wasOnline: false,
      offlineStartTime: new Date().toISOString()
    }))
  }, [finalConfig.storageKey, state.lastOnlineTime])

  // Retry connection check
  const retryConnection = useCallback(async () => {
    if (state.retryCount >= finalConfig.retryAttempts) {
      return false
    }

    setState(prev => ({
      ...prev,
      retryCount: prev.retryCount + 1
    }))

    try {
      const isOnline = await pingCheck()
      if (isOnline) {
        await handleOnline()
        return true
      }
    } catch (error) {
      console.error('Connection retry failed:', error)
    }

    // Schedule next retry with exponential backoff
    const delay = finalConfig.retryDelay * Math.pow(2, state.retryCount)
    retryTimeoutRef.current = setTimeout(() => {
      retryConnection()
    }, delay)

    return false
  }, [state.retryCount, finalConfig.retryAttempts, finalConfig.retryDelay, pingCheck, handleOnline])

  // Manual connection check
  const checkConnection = useCallback(async (): Promise<boolean> => {
    try {
      const isOnline = await pingCheck()
      if (isOnline && state.isOffline) {
        await handleOnline()
      } else if (!isOnline && state.isOnline) {
        handleOffline()
      }
      return isOnline
    } catch (error) {
      console.error('Connection check failed:', error)
      return false
    }
  }, [pingCheck, state.isOffline, state.isOnline, handleOnline, handleOffline])

  // Periodic ping check
  useEffect(() => {
    if (!finalConfig.enablePing) return

    const interval = setInterval(async () => {
      if (!state.isOnline) return // Skip if already offline
      
      try {
        const isOnline = await pingCheck()
        if (!isOnline) {
          handleOffline()
        } else {
          // Update connection quality
          const quality = await testConnectionQuality()
          setState(prev => ({
            ...prev,
            connectionQuality: quality
          }))
        }
      } catch (error) {
        console.error('Periodic ping check failed:', error)
      }
    }, finalConfig.pingInterval)

    return () => clearInterval(interval)
  }, [finalConfig.enablePing, finalConfig.pingInterval, state.isOnline, pingCheck, handleOffline, testConnectionQuality])

  // Browser online/offline event listeners
  useEffect(() => {
    const handleBrowserOnline = () => {
      handleOnline()
    }

    const handleBrowserOffline = () => {
      handleOffline()
    }

    window.addEventListener('online', handleBrowserOnline)
    window.addEventListener('offline', handleBrowserOffline)

    return () => {
      window.removeEventListener('online', handleBrowserOnline)
      window.removeEventListener('offline', handleBrowserOffline)
    }
  }, [handleOnline, handleOffline])

  // Load previous state from localStorage
  useEffect(() => {
    try {
      const savedState = localStorage.getItem(finalConfig.storageKey)
      if (savedState) {
        const parsed = JSON.parse(savedState)
        if (parsed.lastOnlineTime) {
          setState(prev => ({
            ...prev,
            lastOnlineTime: new Date(parsed.lastOnlineTime)
          }))
        }
      }
    } catch (error) {
      console.error('Failed to load offline state from storage:', error)
    }
  }, [finalConfig.storageKey])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pingTimeoutRef.current) clearTimeout(pingTimeoutRef.current)
      if (durationIntervalRef.current) clearInterval(durationIntervalRef.current)
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current)
    }
  }, [])

  // Get formatted offline duration
  const getFormattedDuration = useCallback((): string => {
    if (state.offlineDuration < 60000) {
      return `${Math.floor(state.offlineDuration / 1000)}s`
    } else if (state.offlineDuration < 3600000) {
      return `${Math.floor(state.offlineDuration / 60000)}m`
    } else {
      const hours = Math.floor(state.offlineDuration / 3600000)
      const minutes = Math.floor((state.offlineDuration % 3600000) / 60000)
      return `${hours}h ${minutes}m`
    }
  }, [state.offlineDuration])

  // Get connection status message
  const getStatusMessage = useCallback((): string => {
    if (state.isOnline) {
      switch (state.connectionQuality) {
        case 'excellent': return 'Connected (Excellent)'
        case 'good': return 'Connected (Good)'
        case 'poor': return 'Connected (Poor)'
        default: return 'Connected'
      }
    } else {
      return `Offline for ${getFormattedDuration()}`
    }
  }, [state.isOnline, state.connectionQuality, getFormattedDuration])

  return {
    ...state,
    retryConnection,
    checkConnection,
    getFormattedDuration,
    getStatusMessage,
    config: finalConfig
  }
}

export default useOfflineDetection