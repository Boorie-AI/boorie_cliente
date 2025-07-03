// Calendar Page Component - Main calendar interface with views and modals

import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useCalendarStore } from '../../stores/calendarStore'
import CalendarNavigation from './CalendarNavigation'
import Sidebar from '@/components/common/Sidebar'
import MonthView from './views/MonthView'
import WeekView from './views/WeekView'
import DayView from './views/DayView'
import EventModal from './modals/EventModal'
import EventDetailsModal from './modals/EventDetailsModal'
import '../../styles/components.css';
import '../../styles/modals.css';
import '../../styles/recurrence.css';

const CalendarPage: React.FC = () => {
  const { t } = useTranslation()
  const {
    currentView,
    currentDate,
    events,
    selectedEvent,
    isLoading,
    errors,
    connectedAccounts,
    loadConnectedAccounts,
    loadAllEvents,
    selectEvent,
    setCurrentView,
    setCurrentDate,
    navigateDate,
    goToToday
  } = useCalendarStore()

  // Modal states
  const [eventModalState, setEventModalState] = useState<{
    isOpen: boolean
    mode: 'create' | 'edit'
    event?: UnifiedCalendarEvent | null
    initialDate?: Date
    initialHour?: number
    initialMinute?: number
  }>({
    isOpen: false,
    mode: 'create'
  })

  const [eventDetailsModalOpen, setEventDetailsModalOpen] = useState(false)

  // Initialize calendar data
  useEffect(() => {
    const initializeCalendar = async () => {
      await loadConnectedAccounts()
      await loadAllEvents()
    }

    initializeCalendar()
  }, [])

  // Handle event creation
  const handleEventCreate = (date: Date, hour?: number, minute?: number) => {
    setEventModalState({
      isOpen: true,
      mode: 'create',
      event: null,
      initialDate: date,
      initialHour: hour,
      initialMinute: minute
    })
  }

  // Handle event click
  const handleEventClick = (event: UnifiedCalendarEvent) => {
    selectEvent(event)
    setEventDetailsModalOpen(true)
  }

  // Handle date click (navigate to day view)
  const handleDateClick = (date: Date) => {
    setCurrentDate(date)
    setCurrentView('day')
  }

  // Handle time slot click
  const handleTimeSlotClick = (date: Date) => {
    setCurrentDate(date)
    // Optionally auto-create event on double-click
  }

  // Close modals
  const closeEventModal = () => {
    setEventModalState({
      isOpen: false,
      mode: 'create'
    })
  }

  const closeEventDetailsModal = () => {
    setEventDetailsModalOpen(false)
    selectEvent(null)
  }

  // Filter events for current view
  const getEventsForView = () => {
    // This could be enhanced with date range filtering
    return events
  }

  // Check if we have connected accounts
  const hasConnectedAccounts = connectedAccounts.some(acc =>
    acc.isConnected && acc.hasCalendarAccess
  )

  return (
    <div className="calendar-page">
      {/* Sidebar */}
      <div className="calendar-sidebar">
        <Sidebar
          accounts={connectedAccounts}
          selectedAccount={null} // or track selected account if needed
          onAccountSelect={(accountId) => {
            // Handle account selection logic
            console.log('Selected account:', accountId)
          }}
          isLoading={isLoading.accounts}
        />
      </div>

      {/* Main Calendar */}
      <div className="calendar-main">
        {/* Navigation Header */}
        <div className="calendar-header">
          <CalendarNavigation
            currentDate={currentDate}
            currentView={currentView}
            onViewChange={setCurrentView}
            onDateSelect={setCurrentDate}
            onDateNavigation={navigateDate}
            onTodayClick={goToToday}
            isLoading={isLoading.events}
          />

          {/* Actions */}
          <div className="calendar-actions">
            <button
              className="create-event-btn"
              onClick={() => handleEventCreate(currentDate)}
              disabled={!hasConnectedAccounts || isLoading.eventCreation}
              title={!hasConnectedAccounts ? t('calendar.page.connectAccountTooltip') : t('calendar.page.createEventTooltip')}
            >
              <PlusIcon className="w-4 h-4" />
              {t('calendar.page.createEvent')}
            </button>
          </div>
        </div>

        {/* Calendar Content */}
        <div className="calendar-content">
          {/* Error Messages */}
          {(errors.accounts || errors.events || errors.operations) && (
            <div className="error-banner">
              {errors.accounts && (
                <div className="error-message">
                  <strong>{t('calendar.page.accountError')}:</strong> {errors.accounts}
                </div>
              )}
              {errors.events && (
                <div className="error-message">
                  <strong>{t('calendar.page.eventsError')}:</strong> {errors.events}
                </div>
              )}
              {errors.operations && (
                <div className="error-message">
                  <strong>{t('calendar.page.operationError')}:</strong> {errors.operations}
                </div>
              )}
            </div>
          )}

          {/* No Accounts Message */}
          {!hasConnectedAccounts && !isLoading.accounts && (
            <div className="no-accounts-message">
              <div className="empty-state">
                <CalendarIcon className="w-16 h-16 text-gray-400" />
                <h3>{t('calendar.page.noAccountsTitle')}</h3>
                <p>{t('calendar.page.noAccountsDescription')}</p>
                <button className="btn btn-primary">
                  {t('calendar.page.connectAccount')}
                </button>
              </div>
            </div>
          )}

          {/* Calendar Views */}
          {hasConnectedAccounts && (
            <>
              {currentView === 'month' && (
                <MonthView
                  currentDate={currentDate}
                  events={getEventsForView()}
                  onEventClick={handleEventClick}
                  onDateClick={handleDateClick}
                  onEventCreate={handleEventCreate}
                  isLoading={isLoading.events}
                />
              )}

              {currentView === 'week' && (
                <WeekView
                  currentDate={currentDate}
                  events={getEventsForView()}
                  onEventClick={handleEventClick}
                  onDateClick={handleDateClick}
                  onEventCreate={handleEventCreate}
                  onTimeSlotClick={handleTimeSlotClick}
                  isLoading={isLoading.events}
                />
              )}

              {currentView === 'day' && (
                <DayView
                  currentDate={currentDate}
                  events={getEventsForView()}
                  onEventClick={handleEventClick}
                  onEventCreate={handleEventCreate}
                  onTimeSlotClick={handleTimeSlotClick}
                  isLoading={isLoading.events}
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* Modals */}
      <EventModal
        isOpen={eventModalState.isOpen}
        onClose={closeEventModal}
        event={eventModalState.event}
        initialDate={eventModalState.initialDate}
        initialHour={eventModalState.initialHour}
        initialMinute={eventModalState.initialMinute}
        mode={eventModalState.mode}
      />

      <EventDetailsModal
        isOpen={eventDetailsModalOpen}
        onClose={closeEventDetailsModal}
        event={selectedEvent}
      />
    </div>
  )
}

// Helper icon components
const PlusIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
  </svg>
)

const CalendarIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
)

export default CalendarPage