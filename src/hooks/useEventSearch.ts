// Event Search Hook - Advanced search and filtering for calendar events

import { useState, useMemo, useCallback, useEffect } from 'react'
import { useCalendarStore } from '../stores/calendarStore'

export interface SearchFilters {
  query: string
  dateRange: {
    start: Date | null
    end: Date | null
  }
  providers: Array<'microsoft' | 'google'>
  accounts: string[]
  hasOnlineMeeting: boolean | null
  meetingProvider: Array<'teams' | 'meet' | 'other'> | null
  eventTypes: Array<'meeting' | 'appointment' | 'reminder' | 'other'>
  timeOfDay: {
    morning: boolean // 6-12
    afternoon: boolean // 12-18
    evening: boolean // 18-24
    night: boolean // 0-6
  }
  duration: {
    min: number | null // minutes
    max: number | null // minutes
  }
  attendees: {
    hasAttendees: boolean | null
    minAttendees: number | null
    maxAttendees: number | null
  }
  recurrence: {
    isRecurring: boolean | null
    frequency: Array<'daily' | 'weekly' | 'monthly' | 'yearly'> | null
  }
  location: {
    hasLocation: boolean | null
    isOnline: boolean | null
  }
  tags: string[]
  customFields: Record<string, any>
}

export interface SearchResult {
  events: UnifiedCalendarEvent[]
  totalCount: number
  filteredCount: number
  searchTime: number
  facets: SearchFacets
  suggestions: string[]
}

export interface SearchFacets {
  providers: Array<{ name: string; count: number }>
  accounts: Array<{ id: string; name: string; count: number }>
  timeOfDay: Array<{ period: string; count: number }>
  duration: Array<{ range: string; count: number }>
  meetingTypes: Array<{ type: string; count: number }>
  dates: Array<{ date: string; count: number }>
}

export interface SearchHistory {
  id: string
  query: string
  filters: Partial<SearchFilters>
  timestamp: Date
  resultCount: number
}

const defaultFilters: SearchFilters = {
  query: '',
  dateRange: { start: null, end: null },
  providers: [],
  accounts: [],
  hasOnlineMeeting: null,
  meetingProvider: null,
  eventTypes: [],
  timeOfDay: {
    morning: true,
    afternoon: true,
    evening: true,
    night: true
  },
  duration: { min: null, max: null },
  attendees: {
    hasAttendees: null,
    minAttendees: null,
    maxAttendees: null
  },
  recurrence: {
    isRecurring: null,
    frequency: null
  },
  location: {
    hasLocation: null,
    isOnline: null
  },
  tags: [],
  customFields: {}
}

export const useEventSearch = () => {
  const { events, connectedAccounts } = useCalendarStore()
  
  const [filters, setFilters] = useState<SearchFilters>(defaultFilters)
  const [searchHistory, setSearchHistory] = useState<SearchHistory[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchStats, setSearchStats] = useState({
    totalSearches: 0,
    avgSearchTime: 0,
    popularQueries: [] as string[]
  })

  // Debounced search execution
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null)

  // Perform the actual search with filters
  const searchResults = useMemo((): SearchResult => {
    const startTime = performance.now()
    
    let filteredEvents = [...events]
    
    // Text search in title, description, location
    if (filters.query.trim()) {
      const query = filters.query.toLowerCase().trim()
      const searchTerms = query.split(/\s+/)
      
      filteredEvents = filteredEvents.filter(event => {
        const searchableText = [
          event.title,
          event.description || '',
          event.location || '',
          ...(event.attendees?.map(a => a.name || a.email) || [])
        ].join(' ').toLowerCase()
        
        return searchTerms.every(term => searchableText.includes(term))
      })
    }

    // Date range filter
    if (filters.dateRange.start) {
      filteredEvents = filteredEvents.filter(event => 
        event.startTime >= filters.dateRange.start!
      )
    }
    if (filters.dateRange.end) {
      filteredEvents = filteredEvents.filter(event => 
        event.startTime <= filters.dateRange.end!
      )
    }

    // Provider filter
    if (filters.providers.length > 0) {
      filteredEvents = filteredEvents.filter(event => 
        filters.providers.includes(event.provider)
      )
    }

    // Account filter
    if (filters.accounts.length > 0) {
      filteredEvents = filteredEvents.filter(event => 
        filters.accounts.includes(event.accountId)
      )
    }

    // Online meeting filter
    if (filters.hasOnlineMeeting !== null) {
      filteredEvents = filteredEvents.filter(event => 
        event.hasOnlineMeeting === filters.hasOnlineMeeting
      )
    }

    // Meeting provider filter
    if (filters.meetingProvider && filters.meetingProvider.length > 0) {
      filteredEvents = filteredEvents.filter(event => 
        event.meetingProvider && filters.meetingProvider!.includes(event.meetingProvider)
      )
    }

    // Time of day filter
    const enabledPeriods = Object.entries(filters.timeOfDay)
      .filter(([_, enabled]) => enabled)
      .map(([period]) => period)
    
    if (enabledPeriods.length < 4) { // If not all periods are enabled
      filteredEvents = filteredEvents.filter(event => {
        const hour = event.startTime.getHours()
        
        if (hour >= 6 && hour < 12 && filters.timeOfDay.morning) return true
        if (hour >= 12 && hour < 18 && filters.timeOfDay.afternoon) return true
        if (hour >= 18 && hour < 24 && filters.timeOfDay.evening) return true
        if ((hour >= 0 && hour < 6) && filters.timeOfDay.night) return true
        
        return false
      })
    }

    // Duration filter
    if (filters.duration.min !== null || filters.duration.max !== null) {
      filteredEvents = filteredEvents.filter(event => {
        const duration = (event.endTime.getTime() - event.startTime.getTime()) / (1000 * 60)
        
        if (filters.duration.min !== null && duration < filters.duration.min) return false
        if (filters.duration.max !== null && duration > filters.duration.max) return false
        
        return true
      })
    }

    // Attendees filter
    if (filters.attendees.hasAttendees !== null) {
      filteredEvents = filteredEvents.filter(event => {
        const hasAttendees = (event.attendees?.length || 0) > 0
        return hasAttendees === filters.attendees.hasAttendees
      })
    }

    if (filters.attendees.minAttendees !== null) {
      filteredEvents = filteredEvents.filter(event => 
        (event.attendees?.length || 0) >= filters.attendees.minAttendees!
      )
    }

    if (filters.attendees.maxAttendees !== null) {
      filteredEvents = filteredEvents.filter(event => 
        (event.attendees?.length || 0) <= filters.attendees.maxAttendees!
      )
    }

    // Location filter
    if (filters.location.hasLocation !== null) {
      filteredEvents = filteredEvents.filter(event => {
        const hasLocation = !!event.location && event.location.trim().length > 0
        return hasLocation === filters.location.hasLocation
      })
    }

    if (filters.location.isOnline !== null) {
      filteredEvents = filteredEvents.filter(event => 
        event.hasOnlineMeeting === filters.location.isOnline
      )
    }

    // Generate facets for the UI
    const facets = generateFacets(filteredEvents, connectedAccounts)

    // Generate search suggestions
    const suggestions = generateSuggestions(filters.query, events)

    const searchTime = performance.now() - startTime

    return {
      events: filteredEvents,
      totalCount: events.length,
      filteredCount: filteredEvents.length,
      searchTime,
      facets,
      suggestions
    }
  }, [events, filters, connectedAccounts])

  // Update filters with debouncing for text search
  const updateFilters = useCallback((newFilters: Partial<SearchFilters>) => {
    const updatedFilters = { ...filters, ...newFilters }
    
    // If query changed, debounce the update
    if ('query' in newFilters && newFilters.query !== filters.query) {
      if (searchTimeout) {
        clearTimeout(searchTimeout)
      }
      
      setIsSearching(true)
      
      const timeout = setTimeout(() => {
        setFilters(updatedFilters)
        setIsSearching(false)
        
        // Save to search history if query is not empty
        if (newFilters.query && newFilters.query.trim()) {
          saveToHistory(newFilters.query, updatedFilters)
        }
      }, 300)
      
      setSearchTimeout(timeout)
    } else {
      setFilters(updatedFilters)
    }
  }, [filters, searchTimeout])

  // Clear all filters
  const clearFilters = useCallback(() => {
    setFilters(defaultFilters)
  }, [])

  // Save search to history
  const saveToHistory = useCallback((query: string, searchFilters: SearchFilters) => {
    const historyItem: SearchHistory = {
      id: `search_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      query,
      filters: searchFilters,
      timestamp: new Date(),
      resultCount: searchResults.filteredCount
    }

    setSearchHistory(prev => {
      const updated = [historyItem, ...prev].slice(0, 20) // Keep last 20 searches
      return updated
    })

    // Update search stats
    setSearchStats(prev => ({
      totalSearches: prev.totalSearches + 1,
      avgSearchTime: (prev.avgSearchTime * prev.totalSearches + searchResults.searchTime) / (prev.totalSearches + 1),
      popularQueries: updatePopularQueries(prev.popularQueries, query)
    }))
  }, [searchResults])

  // Get saved searches
  const getSavedSearches = useCallback(() => {
    return searchHistory.slice(0, 10) // Return top 10 recent searches
  }, [searchHistory])

  // Apply saved search
  const applySavedSearch = useCallback((historyItem: SearchHistory) => {
    setFilters({ ...defaultFilters, ...historyItem.filters })
  }, [])

  // Quick filters
  const quickFilters = useMemo(() => ({
    today: () => {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)
      
      updateFilters({
        dateRange: { start: today, end: tomorrow }
      })
    },
    
    thisWeek: () => {
      const today = new Date()
      const startOfWeek = new Date(today)
      startOfWeek.setDate(today.getDate() - today.getDay())
      startOfWeek.setHours(0, 0, 0, 0)
      
      const endOfWeek = new Date(startOfWeek)
      endOfWeek.setDate(startOfWeek.getDate() + 7)
      
      updateFilters({
        dateRange: { start: startOfWeek, end: endOfWeek }
      })
    },
    
    onlineMeetings: () => {
      updateFilters({ hasOnlineMeeting: true })
    },
    
    longMeetings: () => {
      updateFilters({
        duration: { min: 60, max: null } // More than 1 hour
      })
    },
    
    morningEvents: () => {
      updateFilters({
        timeOfDay: {
          morning: true,
          afternoon: false,
          evening: false,
          night: false
        }
      })
    }
  }), [updateFilters])

  // Smart search suggestions based on user patterns
  const getSmartSuggestions = useCallback(() => {
    const suggestions = []
    
    // Suggest popular queries
    suggestions.push(...searchStats.popularQueries.slice(0, 3))
    
    // Suggest based on upcoming events
    const upcomingEvents = events
      .filter(event => event.startTime > new Date())
      .slice(0, 5)
    
    suggestions.push(...upcomingEvents.map(event => event.title))
    
    // Suggest common search patterns
    if (events.some(event => event.hasOnlineMeeting)) {
      suggestions.push('online meetings', 'teams meeting', 'video call')
    }
    
    return [...new Set(suggestions)].slice(0, 8)
  }, [events, searchStats.popularQueries])

  return {
    // Search state
    filters,
    searchResults,
    isSearching,
    searchStats,
    
    // Actions
    updateFilters,
    clearFilters,
    quickFilters,
    
    // History
    searchHistory: getSavedSearches(),
    applySavedSearch,
    
    // Suggestions
    smartSuggestions: getSmartSuggestions()
  }
}

// Helper functions
function generateFacets(events: UnifiedCalendarEvent[], accounts: any[]): SearchFacets {
  const facets: SearchFacets = {
    providers: [],
    accounts: [],
    timeOfDay: [],
    duration: [],
    meetingTypes: [],
    dates: []
  }

  // Provider facets
  const providerCounts = events.reduce((acc, event) => {
    acc[event.provider] = (acc[event.provider] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  facets.providers = Object.entries(providerCounts).map(([name, count]) => ({ name, count }))

  // Account facets
  const accountCounts = events.reduce((acc, event) => {
    acc[event.accountId] = (acc[event.accountId] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  facets.accounts = Object.entries(accountCounts).map(([id, count]) => {
    const account = accounts.find(acc => acc.id === id)
    return {
      id,
      name: account?.name || account?.email || id,
      count
    }
  })

  // Time of day facets
  const timeOfDayCounts = { morning: 0, afternoon: 0, evening: 0, night: 0 }
  events.forEach(event => {
    const hour = event.startTime.getHours()
    if (hour >= 6 && hour < 12) timeOfDayCounts.morning++
    else if (hour >= 12 && hour < 18) timeOfDayCounts.afternoon++
    else if (hour >= 18 && hour < 24) timeOfDayCounts.evening++
    else timeOfDayCounts.night++
  })

  facets.timeOfDay = Object.entries(timeOfDayCounts).map(([period, count]) => ({ period, count }))

  // Duration facets
  const durationRanges = {
    'short (< 30min)': 0,
    'medium (30min - 1h)': 0,
    'long (1h - 2h)': 0,
    'very long (> 2h)': 0
  }

  events.forEach(event => {
    const duration = (event.endTime.getTime() - event.startTime.getTime()) / (1000 * 60)
    if (duration < 30) durationRanges['short (< 30min)']++
    else if (duration < 60) durationRanges['medium (30min - 1h)']++
    else if (duration < 120) durationRanges['long (1h - 2h)']++
    else durationRanges['very long (> 2h)']++
  })

  facets.duration = Object.entries(durationRanges).map(([range, count]) => ({ range, count }))

  // Meeting type facets
  const meetingTypeCounts = {
    'online meeting': events.filter(e => e.hasOnlineMeeting).length,
    'in-person': events.filter(e => !e.hasOnlineMeeting && e.location).length,
    'no location': events.filter(e => !e.hasOnlineMeeting && !e.location).length
  }

  facets.meetingTypes = Object.entries(meetingTypeCounts).map(([type, count]) => ({ type, count }))

  return facets
}

function generateSuggestions(query: string, events: UnifiedCalendarEvent[]): string[] {
  if (!query.trim()) return []

  const suggestions = new Set<string>()
  const queryLower = query.toLowerCase()

  // Suggest event titles that partially match
  events.forEach(event => {
    if (event.title.toLowerCase().includes(queryLower)) {
      suggestions.add(event.title)
    }
  })

  // Suggest common terms
  const commonTerms = ['meeting', 'call', 'standup', 'review', 'sync', 'planning', 'interview']
  commonTerms.forEach(term => {
    if (term.includes(queryLower)) {
      suggestions.add(term)
    }
  })

  return Array.from(suggestions).slice(0, 5)
}

function updatePopularQueries(current: string[], newQuery: string): string[] {
  const updated = [...current]
  const index = updated.indexOf(newQuery)
  
  if (index > -1) {
    // Move to front if already exists
    updated.splice(index, 1)
    updated.unshift(newQuery)
  } else {
    // Add new query to front
    updated.unshift(newQuery)
  }
  
  return updated.slice(0, 10) // Keep top 10
}

export default useEventSearch