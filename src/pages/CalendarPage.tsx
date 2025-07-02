// Calendar Page - Main calendar interface with sidebar and calendar view

import React, { useEffect, useState } from 'react'
import { useCalendarStore } from '../stores/calendarStore'
import Sidebar from '../components/common/Sidebar'
import CalendarView from '../components/calendar/CalendarView'
import '../styles/components.css';
import '../styles/modals.css';
import '../styles/recurrence.css';
import '../styles/calendar.css';

const CalendarPage: React.FC = () => {
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
      throw new Error('No account selected')
    }

    if (eventData.isTeamsMeeting) {
      return await createTeamsMeeting(selectedAccount, eventData)
    } else {
      return await createEvent(eventData)
    }
  }

  const handleEventUpdate = async (eventId: string, eventData: UpdateEventData) => {
    if (!selectedAccount) {
      throw new Error('No account selected')
    }

    return await updateEvent(eventId, eventData)
  }

  const handleEventDelete = async (eventId: string) => {
    if (!selectedAccount) {
      throw new Error('No account selected')
    }

    return await deleteEvent(eventId)
  }

  const handleAddTeamsToEvent = async (eventId: string) => {
    if (!selectedAccount) {
      throw new Error('No account selected')
    }

    return await addTeamsToEvent(selectedAccount, eventId)
  }

  const handleAddMeetToEvent = async (eventId: string) => {
    if (!selectedAccount) {
      throw new Error('No account selected')
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
      <div className="calendar-page loading">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading calendar...</p>
        </div>
      </div>
    )
  }

  // Show error state if no accounts are available
  if (connectedAccounts.length === 0 && !isLoading.accounts) {
    return (
      <div className="calendar-page no-accounts">
        <div className="no-accounts-container">
          <div className="no-accounts-content">
            <h2>No Calendar Accounts</h2>
            <p>
              You need to connect a Microsoft or Google account to use the calendar feature.
            </p>
            <div className="no-accounts-actions">
              <button 
                onClick={() => window.location.href = '/settings?tab=accounts'}
                className="btn btn-primary"
              >
                Connect Account
              </button>
              <button 
                onClick={loadConnectedAccounts}
                className="btn btn-secondary"
                disabled={isLoading.accounts}
              >
                {isLoading.accounts ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="calendar-page">
      {/* Sidebar for account selection */}
      <Sidebar 
        accounts={connectedAccounts}
        selectedAccount={selectedAccount}
        onAccountSelect={handleAccountSelect}
        isLoading={isLoading.accounts || isLoading.accountSelection}
        className="calendar-sidebar"
      />
      
      {/* Main calendar view */}
      <div className="calendar-main">
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
        <div className="calendar-error-toast">
          <div className="error-content">
            <span className="error-message">{errors.accounts}</span>
            <button 
              onClick={() => clearErrors()}
              className="error-dismiss"
              aria-label="Dismiss error"
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