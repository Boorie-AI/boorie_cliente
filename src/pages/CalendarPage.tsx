// Calendar Page - Main calendar interface with sidebar and calendar view

import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCalendarStore } from '../stores/calendarStore'
import CalendarSidebar from '../components/calendar/CalendarSidebar'
import CalendarView from '../components/calendar/CalendarView'

const CalendarPage: React.FC = () => {
  const { t } = useTranslation()
  const {
    connectedAccounts,
    selectedAccount,
    events,
    currentView,
    currentDate,
    isLoading,
    errors,
    // Actions
    loadConnectedAccounts,
    selectAccount,
    loadEvents,
    createEvent,
    updateEvent,
    deleteEvent,
    createTeamsMeeting,
    addTeamsToEvent,
    addMeetToEvent,
    setCurrentView,
    setCurrentDate,
    navigateDate,
    goToToday,
    selectEvent,
    clearErrors
  } = useCalendarStore()

  const [isInitialized, setIsInitialized] = useState(false)

  // Initialize calendar on mount
  useEffect(() => {
    const initializeCalendar = async () => {
      try {
        await loadConnectedAccounts()
        setIsInitialized(true)
      } catch (error) {
        console.error('Failed to initialize calendar:', error)
        setIsInitialized(true) // Set to true even on error to show the UI
      }
    }

    initializeCalendar()
  }, [loadConnectedAccounts])

  // Auto-load events when selected account changes
  useEffect(() => {
    if (selectedAccount && isInitialized) {
      loadEvents(selectedAccount)
    }
  }, [selectedAccount, currentDate, currentView, isInitialized])

  const handleAccountSelect = async (accountId: string) => {
    try {
      await selectAccount(accountId)
    } catch (error) {
      console.error('Failed to select account:', error)
    }
  }

  const handleEventCreate = async (eventData: CreateEventData) => {
    if (!selectedAccount) {
      throw new Error(t('calendar.page.noAccountSelected'))
    }

    if (eventData.isTeamsMeeting) {
      return await createTeamsMeeting(selectedAccount, eventData)
    } else {
      return await createEvent(eventData)
    }
  }

  const handleEventUpdate = async (eventId: string, eventData: UpdateEventData) => {
    if (!selectedAccount) {
      throw new Error(t('calendar.page.noAccountSelected'))
    }

    return await updateEvent(eventId, eventData)
  }

  const handleEventDelete = async (eventId: string) => {
    if (!selectedAccount) {
      throw new Error(t('calendar.page.noAccountSelected'))
    }

    return await deleteEvent(eventId)
  }

  const handleAddTeamsToEvent = async (eventId: string) => {
    if (!selectedAccount) {
      throw new Error(t('calendar.page.noAccountSelected'))
    }

    return await addTeamsToEvent(selectedAccount, eventId)
  }

  const handleAddMeetToEvent = async (eventId: string) => {
    if (!selectedAccount) {
      throw new Error(t('calendar.page.noAccountSelected'))
    }

    return await addMeetToEvent(selectedAccount, eventId)
  }

  const handleDateNavigation = (direction: 'prev' | 'next') => {
    navigateDate(direction)
  }

  const handleViewChange = (view: 'month' | 'week' | 'day') => {
    setCurrentView(view)
  }

  const handleDateChange = (date: Date) => {
    setCurrentDate(date)
  }

  const handleTodayClick = () => {
    goToToday()
  }

  const handleEventClick = (event: UnifiedCalendarEvent) => {
    selectEvent(event)
  }

  // Show loading state while initializing
  if (!isInitialized) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center space-y-4">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm text-muted-foreground">{t('calendar.page.loadingCalendar')}</p>
        </div>
      </div>
    )
  }

  // Show error state if no accounts are available
  if (connectedAccounts.length === 0 && !isLoading.accounts) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center space-y-6 max-w-md">
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-foreground">{t('calendar.page.noAccountsConnected')}</h2>
            <p className="text-muted-foreground">
              {t('calendar.page.connectAccountDesc')}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button 
              onClick={() => window.location.href = '/settings?tab=accounts'}
              className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium"
            >
              {t('calendar.page.connectAccount')}
            </button>
            <button 
              onClick={loadConnectedAccounts}
              className="px-6 py-3 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isLoading.accounts}
            >
              {isLoading.accounts ? t('calendar.page.refreshing') : t('calendar.page.refresh')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar for account selection */}
      <CalendarSidebar />
      
      {/* Main calendar view */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <CalendarView 
          events={events}
          selectedAccount={selectedAccount}
          currentView={currentView}
          currentDate={currentDate}
          isLoading={isLoading.events || isLoading.eventCreation || isLoading.eventUpdate || isLoading.eventDeletion}
          error={errors.events || errors.operations}
          
          // Event handlers
          onEventCreate={handleEventCreate}
          onEventUpdate={handleEventUpdate}
          onEventDelete={handleEventDelete}
          onEventClick={handleEventClick}
          
          // Teams/Meet handlers
          onAddTeamsToEvent={handleAddTeamsToEvent}
          onAddMeetToEvent={handleAddMeetToEvent}
          
          // View management
          onViewChange={handleViewChange}
          onDateChange={handleDateChange}
          onDateNavigation={handleDateNavigation}
          onTodayClick={handleTodayClick}
          
          // Error handling
          onErrorDismiss={() => clearErrors()}
        />
      </div>

      {/* Global error display */}
      {errors.accounts && (
        <div className="fixed top-4 right-4 bg-destructive text-destructive-foreground px-4 py-3 rounded-lg shadow-lg border border-destructive/20 z-50">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">{errors.accounts}</span>
            <button 
              onClick={() => clearErrors()}
              className="text-destructive-foreground/80 hover:text-destructive-foreground transition-colors"
              aria-label={t('calendar.page.dismissError')}
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default CalendarPage