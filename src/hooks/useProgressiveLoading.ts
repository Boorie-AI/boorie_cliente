// Progressive Loading Hook - Smart loading for large calendar datasets

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useCalendarStore } from '../stores/calendarStore'

export interface ProgressiveLoadingConfig {
  initialPageSize: number
  incrementalPageSize: number
  maxPageSize: number
  loadThreshold: number // How close to the end before loading more
  preloadOffset: number // Number of days to preload ahead/behind
}

export interface ProgressiveLoadingState {
  isLoading: boolean
  hasMore: boolean
  totalLoaded: number
  totalEstimated: number
  currentPage: number
  loadingProgress: number
}

const defaultConfig: ProgressiveLoadingConfig = {
  initialPageSize: 50,
  incrementalPageSize: 25,
  maxPageSize: 200,
  loadThreshold: 0.8, // Load more when 80% through current data
  preloadOffset: 30 // Preload 30 days ahead/behind
}

export const useProgressiveLoading = (
  accountId: string | null,
  currentDate: Date,
  currentView: 'month' | 'week' | 'day',
  config: Partial<ProgressiveLoadingConfig> = {}
) => {
  const loadingConfig = useMemo(() => ({ ...defaultConfig, ...config }), [config])
  
  const [state, setState] = useState<ProgressiveLoadingState>({
    isLoading: false,
    hasMore: true,
    totalLoaded: 0,
    totalEstimated: 0,
    currentPage: 0,
    loadingProgress: 0
  })

  const [loadedRanges, setLoadedRanges] = useState<Array<{ start: Date; end: Date }>>([])
  const [eventBuffer, setEventBuffer] = useState<Map<string, UnifiedCalendarEvent[]>>(new Map())

  const { events, loadEvents } = useCalendarStore()

  // Calculate the current visible date range
  const getVisibleRange = useCallback(() => {
    const start = new Date(currentDate)
    const end = new Date(currentDate)
    
    switch (currentView) {
      case 'day':
        start.setHours(0, 0, 0, 0)
        end.setHours(23, 59, 59, 999)
        break
      case 'week':
        start.setDate(start.getDate() - start.getDay())
        start.setHours(0, 0, 0, 0)
        end.setDate(start.getDate() + 6)
        end.setHours(23, 59, 59, 999)
        break
      case 'month':
        start.setDate(1)
        start.setHours(0, 0, 0, 0)
        end.setMonth(end.getMonth() + 1, 0)
        end.setHours(23, 59, 59, 999)
        break
    }
    
    return { start, end }
  }, [currentDate, currentView])

  // Calculate expanded range for progressive loading
  const getExpandedRange = useCallback((visibleRange: { start: Date; end: Date }, offset: number) => {
    const start = new Date(visibleRange.start)
    const end = new Date(visibleRange.end)
    
    start.setDate(start.getDate() - offset)
    end.setDate(end.getDate() + offset)
    
    return { start, end }
  }, [])

  // Check if a range is already loaded
  const isRangeLoaded = useCallback((targetRange: { start: Date; end: Date }) => {
    return loadedRanges.some(range => 
      range.start <= targetRange.start && range.end >= targetRange.end
    )
  }, [loadedRanges])

  // Load events for a specific range
  const loadEventsRange = useCallback(async (
    range: { start: Date; end: Date },
    isIncremental: boolean = false
  ) => {
    if (!accountId) return

    setState(prev => ({ 
      ...prev, 
      isLoading: true,
      loadingProgress: isIncremental ? 50 : 0
    }))

    try {
      await loadEvents(accountId, range.start, range.end)
      
      // Update loaded ranges
      setLoadedRanges(prev => {
        const newRanges = [...prev, range]
        // Merge overlapping ranges
        return mergeOverlappingRanges(newRanges)
      })

      setState(prev => ({ 
        ...prev, 
        isLoading: false,
        totalLoaded: events.length,
        currentPage: prev.currentPage + (isIncremental ? 1 : 0),
        loadingProgress: 100
      }))

    } catch (error) {
      console.error('Failed to load events range:', error)
      setState(prev => ({ 
        ...prev, 
        isLoading: false,
        loadingProgress: 0
      }))
    }
  }, [accountId, loadEvents, events.length])

  // Progressive load more events
  const loadMore = useCallback(async () => {
    if (!accountId || state.isLoading || !state.hasMore) return

    const visibleRange = getVisibleRange()
    const currentPageSize = Math.min(
      loadingConfig.initialPageSize + (state.currentPage * loadingConfig.incrementalPageSize),
      loadingConfig.maxPageSize
    )

    // Expand the loading range based on current page
    const expandedOffset = loadingConfig.preloadOffset * (state.currentPage + 1)
    const expandedRange = getExpandedRange(visibleRange, expandedOffset)

    // Check if we've already loaded this range
    if (isRangeLoaded(expandedRange)) {
      setState(prev => ({ ...prev, hasMore: false }))
      return
    }

    await loadEventsRange(expandedRange, true)
  }, [accountId, state.isLoading, state.hasMore, state.currentPage, getVisibleRange, getExpandedRange, isRangeLoaded, loadEventsRange, loadingConfig])

  // Initial load when account or date changes
  useEffect(() => {
    if (!accountId) return

    const visibleRange = getVisibleRange()
    const expandedRange = getExpandedRange(visibleRange, loadingConfig.preloadOffset)

    // Reset state for new account/date
    setState({
      isLoading: false,
      hasMore: true,
      totalLoaded: 0,
      totalEstimated: 0,
      currentPage: 0,
      loadingProgress: 0
    })
    setLoadedRanges([])

    // Load initial range if not already loaded
    if (!isRangeLoaded(expandedRange)) {
      loadEventsRange(expandedRange)
    }
  }, [accountId, currentDate, currentView])

  // Background preloading for adjacent time periods
  const preloadAdjacentPeriods = useCallback(async () => {
    if (!accountId || state.isLoading) return

    const visibleRange = getVisibleRange()
    
    // Calculate previous and next periods
    const prevPeriod = new Date(currentDate)
    const nextPeriod = new Date(currentDate)
    
    switch (currentView) {
      case 'day':
        prevPeriod.setDate(prevPeriod.getDate() - 1)
        nextPeriod.setDate(nextPeriod.getDate() + 1)
        break
      case 'week':
        prevPeriod.setDate(prevPeriod.getDate() - 7)
        nextPeriod.setDate(nextPeriod.getDate() + 7)
        break
      case 'month':
        prevPeriod.setMonth(prevPeriod.getMonth() - 1)
        nextPeriod.setMonth(nextPeriod.getMonth() + 1)
        break
    }

    const prevRange = getExpandedRange(
      { start: prevPeriod, end: prevPeriod },
      loadingConfig.preloadOffset / 2
    )
    const nextRange = getExpandedRange(
      { start: nextPeriod, end: nextPeriod },
      loadingConfig.preloadOffset / 2
    )

    // Preload in background without blocking UI
    setTimeout(() => {
      if (!isRangeLoaded(prevRange)) {
        loadEventsRange(prevRange, true)
      }
    }, 500)

    setTimeout(() => {
      if (!isRangeLoaded(nextRange)) {
        loadEventsRange(nextRange, true)
      }
    }, 1000)
  }, [accountId, state.isLoading, currentDate, currentView, getVisibleRange, getExpandedRange, isRangeLoaded, loadEventsRange, loadingConfig])

  // Trigger preloading when view stabilizes
  useEffect(() => {
    const timer = setTimeout(preloadAdjacentPeriods, 2000)
    return () => clearTimeout(timer)
  }, [preloadAdjacentPeriods])

  // Check if we need to load more based on scroll position or date navigation
  const checkLoadMore = useCallback((scrollProgress: number = 0) => {
    if (scrollProgress >= loadingConfig.loadThreshold && state.hasMore && !state.isLoading) {
      loadMore()
    }
  }, [loadingConfig.loadThreshold, state.hasMore, state.isLoading, loadMore])

  return {
    ...state,
    loadMore,
    checkLoadMore,
    preloadAdjacentPeriods,
    loadedRanges,
    isRangeLoaded,
    config: loadingConfig
  }
}

// Helper function to merge overlapping date ranges
function mergeOverlappingRanges(ranges: Array<{ start: Date; end: Date }>): Array<{ start: Date; end: Date }> {
  if (ranges.length <= 1) return ranges

  // Sort by start date
  const sorted = ranges.sort((a, b) => a.start.getTime() - b.start.getTime())
  const merged: Array<{ start: Date; end: Date }> = [sorted[0]]

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]
    const last = merged[merged.length - 1]

    // If ranges overlap or are adjacent, merge them
    if (current.start <= last.end || 
        current.start.getTime() - last.end.getTime() <= 24 * 60 * 60 * 1000) {
      last.end = new Date(Math.max(last.end.getTime(), current.end.getTime()))
    } else {
      merged.push(current)
    }
  }

  return merged
}

export default useProgressiveLoading