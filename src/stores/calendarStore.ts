// Calendar Store - Calendar state management with Zustand

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { useAuthStore } from './authStore'

export interface CalendarState {
  // Connected accounts
  connectedAccounts: CalendarAccount[]
  selectedAccount: string | null

  // Events
  events: UnifiedCalendarEvent[]
  selectedEvent: UnifiedCalendarEvent | null

  // Current view state
  currentView: 'month' | 'week' | 'day'
  currentDate: Date

  // Loading states
  isLoading: {
    accounts: boolean
    events: boolean
    operations: boolean
    accountSelection: boolean
    eventCreation: boolean
    eventUpdate: boolean
    eventDeletion: boolean
  }

  // Error states
  errors: {
    accounts?: string
    events?: string
    operations?: string
  }

  // Cache and performance
  lastUpdated?: Date
  cacheStats?: any
  eventCache: Map<string, { events: UnifiedCalendarEvent[], timestamp: Date, range: { start: Date, end: Date } }>
  accountCache: Map<string, { account: CalendarAccount, timestamp: Date }>

  // Actions
  // Account management
  loadConnectedAccounts: () => Promise<void>
  refreshConnectedAccounts: () => Promise<void>
  selectAccount: (accountId: string) => Promise<void>
  testAccountConnection: (accountId: string) => Promise<boolean>
  handleAccountDisconnection: (accountId: string) => Promise<void>
  retryAccountConnection: (accountId: string) => Promise<boolean>

  // Event operations
  loadEvents: (accountId?: string, startDate?: Date, endDate?: Date) => Promise<void>
  loadAllEvents: (startDate?: Date, endDate?: Date) => Promise<void>
  refreshEvents: () => Promise<void>
  getEvent: (accountId: string, eventId: string) => Promise<UnifiedCalendarEvent | null>

  // Event CRUD
  createEvent: (eventData: CreateEventData) => Promise<UnifiedCalendarEvent | null>
  updateEvent: (eventId: string, eventData: UpdateEventData) => Promise<UnifiedCalendarEvent | null>
  deleteEvent: (eventId: string) => Promise<boolean>

  // Teams/Meet integration
  createTeamsMeeting: (accountId: string, eventData: CreateEventData) => Promise<UnifiedCalendarEvent | null>
  addTeamsToEvent: (accountId: string, eventId: string) => Promise<UnifiedCalendarEvent | null>
  addMeetToEvent: (accountId: string, eventId: string) => Promise<UnifiedCalendarEvent | null>

  // View management
  setCurrentView: (view: 'month' | 'week' | 'day') => void
  setCurrentDate: (date: Date) => void
  navigateDate: (direction: 'prev' | 'next') => void
  goToToday: () => void

  // Event selection
  selectEvent: (event: UnifiedCalendarEvent | null) => void

  // Utility actions
  setLoading: (type: 'accounts' | 'events' | 'operations' | 'accountSelection' | 'eventCreation' | 'eventUpdate' | 'eventDeletion', loading: boolean) => void
  setError: (type: 'accounts' | 'events' | 'operations', error?: string) => void
  clearErrors: () => void
  clearCache: () => Promise<void>
  getCacheStats: () => Promise<void>
}

// Helper method to calculate date range for current view
const calculateDateRange = (date: Date, view: 'month' | 'week' | 'day') => {
  const start = new Date(date)
  const end = new Date(date)

  switch (view) {
    case 'day':
      start.setHours(0, 0, 0, 0)
      end.setHours(23, 59, 59, 999)
      break
    case 'week':
      // Get start of week (Sunday)
      start.setDate(start.getDate() - start.getDay())
      start.setHours(0, 0, 0, 0)
      // Get end of week (Saturday)
      end.setDate(start.getDate() + 6)
      end.setHours(23, 59, 59, 999)
      break
    case 'month':
      // Get start of month
      start.setDate(1)
      start.setHours(0, 0, 0, 0)
      // Get end of month
      end.setMonth(end.getMonth() + 1, 0)
      end.setHours(23, 59, 59, 999)
      break
  }

  return { start, end }
}

const initialState = {
  connectedAccounts: [],
  selectedAccount: null,
  events: [],
  selectedEvent: null,
  currentView: 'month' as const,
  currentDate: new Date(),
  isLoading: {
    accounts: false,
    events: false,
    operations: false,
    accountSelection: false,
    eventCreation: false,
    eventUpdate: false,
    eventDeletion: false
  },
  errors: {},
  lastUpdated: undefined,
  cacheStats: undefined,
  eventCache: new Map(),
  accountCache: new Map()
}

export const useCalendarStore = create<CalendarState>()(
  devtools(
    (set, get) => ({
      ...initialState,

      // Load connected accounts
      loadConnectedAccounts: async () => {
        try {
          get().setLoading('accounts', true)
          get().setError('accounts', undefined)

          if (!window.electronAPI?.calendar) {
            throw new Error('Calendar API not available')
          }

          // Get auth store data for connection status
          const authStore = useAuthStore.getState()

          // Ensure auth is initialized
          if (!authStore.lastUpdated) {
            await authStore.initializeAuth()
          }

          const result = await window.electronAPI.calendar.getConnectedAccounts()

          if (result.success && result.data) {
            // Enhance account data with auth information
            const enhancedAccounts = result.data.map((account: CalendarAccount) => {
              const userProfile = authStore.getUserProfile(account.provider)
              const connectionStatus = authStore.connectionStatus[account.provider as 'microsoft' | 'google']

              return {
                ...account,
                // Update connection status from auth store
                isConnected: connectionStatus?.isConnected && connectionStatus?.hasTokens,
                hasCalendarAccess: connectionStatus?.isConnected && !connectionStatus?.isExpired,
                // Add user profile information
                name: userProfile?.name || account.name,
                email: userProfile?.email || account.email,
                pictureUrl: userProfile?.pictureUrl || account.pictureUrl,
                // Add last sync information
                lastSync: account.lastSync ? new Date(account.lastSync) : undefined
              }
            })

            set((state) => ({
              connectedAccounts: enhancedAccounts,
              lastUpdated: new Date()
            }))

            // Auto-select first connected account if none selected or if current selection is invalid
            const connectedAccounts = enhancedAccounts.filter((acc: CalendarAccount) =>
              acc.isConnected && acc.hasCalendarAccess
            )

            const currentSelected = get().selectedAccount
            const isCurrentSelectionValid = currentSelected &&
              connectedAccounts.some(acc => acc.id === currentSelected)

            if (connectedAccounts.length > 0 && !isCurrentSelectionValid) {
              // Sort by provider preference (Microsoft first) and last sync time
              const sortedAccounts = connectedAccounts.sort((a, b) => {
                // Microsoft first
                if (a.provider === 'microsoft' && b.provider !== 'microsoft') return -1
                if (b.provider === 'microsoft' && a.provider !== 'microsoft') return 1

                // Then by last sync time (most recent first)
                const aLastSync = a.lastSync?.getTime() || 0
                const bLastSync = b.lastSync?.getTime() || 0
                return bLastSync - aLastSync
              })

              await get().selectAccount(sortedAccounts[0].id)
            }
          } else {
            throw new Error(result.error || 'Failed to load connected accounts')
          }
        } catch (error) {
          console.error('Failed to load connected accounts:', error)
          const errorMessage = error instanceof Error ? error.message : String(error)
          get().setError('accounts', `Failed to load accounts: ${errorMessage}`)
        } finally {
          get().setLoading('accounts', false)
        }
      },

      // Refresh connected accounts
      refreshConnectedAccounts: async () => {
        await get().loadConnectedAccounts()
      },

      // Select an account and load its events
      selectAccount: async (accountId: string) => {
        try {
          get().setLoading('accountSelection', true)
          get().setError('events', undefined)

          // Validate account exists and is connected
          const account = get().connectedAccounts.find(acc => acc.id === accountId)
          if (!account) {
            throw new Error('Account not found')
          }

          if (!account.isConnected || !account.hasCalendarAccess) {
            throw new Error('Account is not connected or lacks calendar access')
          }

          // Set selected account
          set({ selectedAccount: accountId })

          // Load events for the selected account
          await get().loadEvents(accountId)

        } catch (error) {
          console.error('Failed to select account:', error)
          const errorMessage = error instanceof Error ? error.message : String(error)
          get().setError('events', `Failed to select account: ${errorMessage}`)
          // Clear selection if it failed
          set({ selectedAccount: null })
        } finally {
          get().setLoading('accountSelection', false)
        }
      },

      // Test account connection
      testAccountConnection: async (accountId: string): Promise<boolean> => {
        try {
          if (!window.electronAPI?.calendar) {
            throw new Error('Calendar API not available')
          }

          const result = await window.electronAPI.calendar.testConnection(accountId)
          return Boolean(result.success && result.data)
        } catch (error) {
          console.error('Failed to test account connection:', error)
          return false
        }
      },

      // Handle account disconnection
      handleAccountDisconnection: async (accountId: string) => {
        try {
          // If the disconnected account was selected, auto-select another
          if (get().selectedAccount === accountId) {
            const connectedAccounts = get().connectedAccounts.filter(acc =>
              acc.id !== accountId && acc.isConnected && acc.hasCalendarAccess
            )

            if (connectedAccounts.length > 0) {
              await get().selectAccount(connectedAccounts[0].id)
            } else {
              // No other accounts available
              set({
                selectedAccount: null,
                events: []
              })
            }
          }

          // Clear any cached data for this account
          const { eventCache } = get()
          const newEventCache = new Map(eventCache)

          for (const [key] of newEventCache) {
            if (key.startsWith(accountId)) {
              newEventCache.delete(key)
            }
          }

          set({ eventCache: newEventCache })

          // Refresh accounts to update connection status
          await get().refreshConnectedAccounts()
        } catch (error) {
          console.error('Failed to handle account disconnection:', error)
        }
      },

      // Retry account connection
      retryAccountConnection: async (accountId: string): Promise<boolean> => {
        try {
          get().setLoading('accounts', true)

          // Find the account
          const account = get().connectedAccounts.find(acc => acc.id === accountId)
          if (!account) {
            return false
          }

          // Test connection first
          const isConnected = await get().testAccountConnection(accountId)

          if (isConnected) {
            // Refresh accounts to update status
            await get().refreshConnectedAccounts()

            // If no account is currently selected, select this one
            if (!get().selectedAccount) {
              await get().selectAccount(accountId)
            }

            return true
          } else {
            // Connection failed, redirect to auth flow
            const authStore = useAuthStore.getState()
            if (account.provider === 'microsoft') {
              return await authStore.connectMicrosoft()
            } else if (account.provider === 'google') {
              return await authStore.connectGoogle()
            }
          }

          return false
        } catch (error) {
          console.error('Failed to retry account connection:', error)
          return false
        } finally {
          get().setLoading('accounts', false)
        }
      },

      // Load events for specific account or all accounts
      loadEvents: async (accountId?: string, startDate?: Date, endDate?: Date) => {
        try {
          get().setLoading('events', true)
          get().setError('events', undefined)

          if (!window.electronAPI?.calendar) {
            throw new Error('Calendar API not available')
          }

          // Use current date range if not provided
          const { currentDate, currentView } = get()
          const calculatedRange = calculateDateRange(startDate || currentDate, currentView)

          const start = startDate || calculatedRange.start
          const end = endDate || calculatedRange.end

          // Generate cache key
          const cacheKey = `${accountId || 'all'}_${start.toISOString()}_${end.toISOString()}`

          // Check cache first (cache valid for 5 minutes)
          const cached = get().eventCache.get(cacheKey)
          const cacheValidTime = 5 * 60 * 1000 // 5 minutes

          if (cached && (Date.now() - cached.timestamp.getTime()) < cacheValidTime) {
            // Use cached data
            set((state) => ({
              events: cached.events,
              lastUpdated: cached.timestamp
            }))
            return
          }

          let result: any

          if (accountId) {
            // Load events for specific account
            result = await window.electronAPI.calendar.getEvents(
              accountId,
              start.toISOString(),
              end.toISOString()
            )
          } else {
            // Load events from all accounts
            result = await window.electronAPI.calendar.getAllEvents(
              start.toISOString(),
              end.toISOString()
            )
          }

          if (result.success && result.data) {
            // Convert date strings back to Date objects
            const events = result.data.map((event: any) => ({
              ...event,
              startTime: new Date(event.startTime),
              endTime: new Date(event.endTime),
              lastSync: event.lastSync ? new Date(event.lastSync) : undefined
            }))

            const now = new Date()

            // Update cache
            set((state) => {
              const newEventCache = new Map(state.eventCache)
              newEventCache.set(cacheKey, {
                events,
                timestamp: now,
                range: { start, end }
              })

              // Clean old cache entries (keep only last 10)
              if (newEventCache.size > 10) {
                const sortedEntries = Array.from(newEventCache.entries())
                  .sort(([, a], [, b]) => b.timestamp.getTime() - a.timestamp.getTime())
                newEventCache.clear()
                sortedEntries.slice(0, 10).forEach(([key, value]) => {
                  newEventCache.set(key, value)
                })
              }

              return {
                events,
                lastUpdated: now,
                eventCache: newEventCache
              }
            })
          } else {
            throw new Error(result.error || 'Failed to load events')
          }
        } catch (error) {
          console.error('Failed to load events:', error)
          const errorMessage = error instanceof Error ? error.message : String(error)
          get().setError('events', `Failed to load events: ${errorMessage}`)
        } finally {
          get().setLoading('events', false)
        }
      },

      // Load events from all connected accounts
      loadAllEvents: async (startDate?: Date, endDate?: Date) => {
        await get().loadEvents(undefined, startDate, endDate)
      },

      // Refresh current events
      refreshEvents: async () => {
        const { selectedAccount, currentDate } = get()
        await get().loadEvents(selectedAccount || undefined, currentDate)
      },

      // Get specific event
      getEvent: async (accountId: string, eventId: string): Promise<UnifiedCalendarEvent | null> => {
        try {
          if (!window.electronAPI?.calendar) {
            throw new Error('Calendar API not available')
          }

          const result = await window.electronAPI.calendar.getEvent(accountId, eventId)

          if (result.success && result.data) {
            // Convert date strings back to Date objects
            return {
              ...result.data,
              startTime: new Date(result.data.startTime),
              endTime: new Date(result.data.endTime)
            }
          }

          return null
        } catch (error) {
          console.error('Failed to get event:', error)
          return null
        }
      },

      // Create new event
      createEvent: async (eventData: CreateEventData): Promise<UnifiedCalendarEvent | null> => {
        try {
          get().setLoading('eventCreation', true)
          get().setError('operations', undefined)

          if (!window.electronAPI?.calendar) {
            throw new Error('Calendar API not available')
          }

          // Use the accountId from eventData
          const result = await window.electronAPI.calendar.createEvent(eventData.accountId, eventData)

          if (result.success && result.data) {
            // Clear cache for this account to force refresh
            const newEventCache = new Map(get().eventCache)
            for (const [key] of newEventCache) {
              if (key.startsWith(eventData.accountId)) {
                newEventCache.delete(key)
              }
            }
            set({ eventCache: newEventCache })

            // Refresh events from server to get proper timezone data
            await get().loadEvents(eventData.accountId)

            // Find the newly created event in the refreshed data
            const refreshedEvent = get().events.find(event => 
              event.title === eventData.title && 
              Math.abs(new Date(event.startTime).getTime() - eventData.startTime.getTime()) < 60000 // Within 1 minute
            )

            return refreshedEvent || {
              ...result.data,
              startTime: new Date(result.data.startTime),
              endTime: new Date(result.data.endTime)
            }
          } else {
            throw new Error(result.error || 'Failed to create event')
          }
        } catch (error) {
          console.error('Failed to create event:', error)
          const errorMessage = error instanceof Error ? error.message : String(error)
          get().setError('operations', `Failed to create event: ${errorMessage}`)
          return null
        } finally {
          get().setLoading('eventCreation', false)
        }
      },

      // Update existing event
      updateEvent: async (eventId: string, eventData: UpdateEventData): Promise<UnifiedCalendarEvent | null> => {
        try {
          get().setLoading('eventUpdate', true)
          get().setError('operations', undefined)

          if (!window.electronAPI?.calendar) {
            throw new Error('Calendar API not available')
          }

          // Find the existing event to get accountId
          const existingEvent = get().events.find(event => event.id === eventId)
          if (!existingEvent) {
            throw new Error('Event not found')
          }

          const result = await window.electronAPI.calendar.updateEvent(existingEvent.accountId, eventId, eventData)

          if (result.success && result.data) {
            // Clear cache for this account to force refresh
            const newEventCache = new Map(get().eventCache)
            for (const [key] of newEventCache) {
              if (key.startsWith(existingEvent.accountId)) {
                newEventCache.delete(key)
              }
            }
            set({ eventCache: newEventCache })

            // Refresh events from server to get proper timezone data
            await get().loadEvents(existingEvent.accountId)

            // Find the updated event in the refreshed data
            const refreshedEvent = get().events.find(event => event.id === eventId)

            // Update selected event if it was the one being edited
            if (get().selectedEvent?.id === eventId && refreshedEvent) {
              set({ selectedEvent: refreshedEvent })
            }

            return refreshedEvent || {
              ...result.data,
              startTime: new Date(result.data.startTime),
              endTime: new Date(result.data.endTime)
            }
          } else {
            throw new Error(result.error || 'Failed to update event')
          }
        } catch (error) {
          console.error('Failed to update event:', error)
          const errorMessage = error instanceof Error ? error.message : String(error)
          get().setError('operations', `Failed to update event: ${errorMessage}`)
          return null
        } finally {
          get().setLoading('eventUpdate', false)
        }
      },

      // Delete event
      deleteEvent: async (eventId: string): Promise<boolean> => {
        try {
          get().setLoading('eventDeletion', true)
          get().setError('operations', undefined)

          if (!window.electronAPI?.calendar) {
            throw new Error('Calendar API not available')
          }

          // Find the existing event to get accountId
          const existingEvent = get().events.find(event => event.id === eventId)
          if (!existingEvent) {
            throw new Error('Event not found')
          }

          const result = await window.electronAPI.calendar.deleteEvent(existingEvent.accountId, eventId)

          if (result.success) {
            // Remove from local state
            set((state) => ({
              events: state.events.filter(event => event.id !== eventId),
              selectedEvent: state.selectedEvent?.id === eventId
                ? null
                : state.selectedEvent,
              lastUpdated: new Date()
            }))

            // Clear cache for this account to force refresh
            const newEventCache = new Map(get().eventCache)
            for (const [key] of newEventCache) {
              if (key.startsWith(existingEvent.accountId)) {
                newEventCache.delete(key)
              }
            }
            set({ eventCache: newEventCache })

            return true
          } else {
            throw new Error(result.error || 'Failed to delete event')
          }
        } catch (error) {
          console.error('Failed to delete event:', error)
          const errorMessage = error instanceof Error ? error.message : String(error)
          get().setError('operations', `Failed to delete event: ${errorMessage}`)
          return false
        } finally {
          get().setLoading('eventDeletion', false)
        }
      },

      // Create Teams meeting
      createTeamsMeeting: async (accountId: string, eventData: CreateEventData): Promise<UnifiedCalendarEvent | null> => {
        try {
          get().setLoading('operations', true)
          get().setError('operations', undefined)

          if (!window.electronAPI?.calendar) {
            throw new Error('Calendar API not available')
          }

          const result = await window.electronAPI.calendar.createTeamsMeeting(accountId, eventData)

          if (result.success && result.data) {
            const newEvent = {
              ...result.data,
              startTime: new Date(result.data.startTime),
              endTime: new Date(result.data.endTime)
            }

            // Add to local state
            set((state) => ({
              events: [...state.events, newEvent],
              lastUpdated: new Date()
            }))

            return newEvent
          } else {
            throw new Error(result.error || 'Failed to create Teams meeting')
          }
        } catch (error) {
          console.error('Failed to create Teams meeting:', error)
          const errorMessage = error instanceof Error ? error.message : String(error)
          get().setError('operations', `Failed to create Teams meeting: ${errorMessage}`)
          return null
        } finally {
          get().setLoading('operations', false)
        }
      },

      // Add Teams to existing event
      addTeamsToEvent: async (accountId: string, eventId: string): Promise<UnifiedCalendarEvent | null> => {
        try {
          get().setLoading('operations', true)
          get().setError('operations', undefined)

          if (!window.electronAPI?.calendar) {
            throw new Error('Calendar API not available')
          }

          const result = await window.electronAPI.calendar.addTeamsToEvent(accountId, eventId)

          if (result.success && result.data) {
            const updatedEvent = {
              ...result.data,
              startTime: new Date(result.data.startTime),
              endTime: new Date(result.data.endTime)
            }

            // Update in local state
            set((state) => ({
              events: state.events.map(event =>
                event.id === eventId && event.accountId === accountId
                  ? updatedEvent
                  : event
              ),
              selectedEvent: state.selectedEvent?.id === eventId
                ? updatedEvent
                : state.selectedEvent,
              lastUpdated: new Date()
            }))

            return updatedEvent
          } else {
            throw new Error(result.error || 'Failed to add Teams to event')
          }
        } catch (error) {
          console.error('Failed to add Teams to event:', error)
          const errorMessage = error instanceof Error ? error.message : String(error)
          get().setError('operations', `Failed to add Teams: ${errorMessage}`)
          return null
        } finally {
          get().setLoading('operations', false)
        }
      },

      // Add Google Meet to existing event
      addMeetToEvent: async (accountId: string, eventId: string): Promise<UnifiedCalendarEvent | null> => {
        try {
          get().setLoading('operations', true)
          get().setError('operations', undefined)

          if (!window.electronAPI?.calendar) {
            throw new Error('Calendar API not available')
          }

          const result = await window.electronAPI.calendar.addMeetToEvent(accountId, eventId)

          if (result.success && result.data) {
            const updatedEvent = {
              ...result.data,
              startTime: new Date(result.data.startTime),
              endTime: new Date(result.data.endTime)
            }

            // Update in local state
            set((state) => ({
              events: state.events.map(event =>
                event.id === eventId && event.accountId === accountId
                  ? updatedEvent
                  : event
              ),
              selectedEvent: state.selectedEvent?.id === eventId
                ? updatedEvent
                : state.selectedEvent,
              lastUpdated: new Date()
            }))

            return updatedEvent
          } else {
            throw new Error(result.error || 'Failed to add Google Meet to event')
          }
        } catch (error) {
          console.error('Failed to add Google Meet to event:', error)
          const errorMessage = error instanceof Error ? error.message : String(error)
          get().setError('operations', `Failed to add Google Meet: ${errorMessage}`)
          return null
        } finally {
          get().setLoading('operations', false)
        }
      },

      // Set current view
      setCurrentView: (view: 'month' | 'week' | 'day') => {
        set({ currentView: view })
        // Reload events with new view range
        get().refreshEvents()
      },

      // Set current date
      setCurrentDate: (date: Date) => {
        set({ currentDate: new Date(date) })
        // Reload events for new date
        get().refreshEvents()
      },

      // Navigate date
      navigateDate: (direction: 'prev' | 'next') => {
        const { currentDate, currentView } = get()
        const newDate = new Date(currentDate)

        switch (currentView) {
          case 'day':
            newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1))
            break
          case 'week':
            newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7))
            break
          case 'month':
            newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 1 : -1))
            break
        }

        get().setCurrentDate(newDate)
      },

      // Go to today
      goToToday: () => {
        get().setCurrentDate(new Date())
      },

      // Select event
      selectEvent: (event: UnifiedCalendarEvent | null) => {
        set({ selectedEvent: event })
      },

      // Set loading state
      setLoading: (type: 'accounts' | 'events' | 'operations' | 'accountSelection' | 'eventCreation' | 'eventUpdate' | 'eventDeletion', loading: boolean) => {
        set((state) => ({
          isLoading: {
            ...state.isLoading,
            [type]: loading
          }
        }))
      },

      // Set error state
      setError: (type: 'accounts' | 'events' | 'operations', error?: string) => {
        set((state) => ({
          errors: {
            ...state.errors,
            [type]: error
          }
        }))
      },

      // Clear all errors
      clearErrors: () => {
        set({ errors: {} })
      },

      // Clear cache
      clearCache: async () => {
        try {
          if (!window.electronAPI?.calendar) {
            throw new Error('Calendar API not available')
          }

          await window.electronAPI.calendar.clearCache()
        } catch (error) {
          console.error('Failed to clear cache:', error)
        }
      },

      // Get cache stats
      getCacheStats: async () => {
        try {
          if (!window.electronAPI?.calendar) {
            throw new Error('Calendar API not available')
          }

          const result = await window.electronAPI.calendar.getCacheStats()

          if (result.success && result.data) {
            set({ cacheStats: result.data })
          }
        } catch (error) {
          console.error('Failed to get cache stats:', error)
        }
      },

    }),
    {
      name: 'calendar-store',
      partialize: (state: CalendarState) => ({
        // Persist view preferences and selected account
        selectedAccount: state.selectedAccount,
        currentView: state.currentView,
        currentDate: state.currentDate,
        lastUpdated: state.lastUpdated
      })
    }
  )
)