// Calendar View Component - Main calendar display component

import React, { useState } from 'react'
import MonthView from './views/MonthView'
import WeekView from './views/WeekView'
import DayView from './views/DayView'
import CalendarNavigation from './CalendarNavigation'
import EventDetailsModal from './modals/EventDetailsModal'
import EventModal from './modals/EventModal'

// Calendar View Component - Main calendar display component

interface CalendarViewProps {
  events: UnifiedCalendarEvent[]
  selectedAccount: string | null
  currentView: 'month' | 'week' | 'day'
  currentDate: Date
  isLoading: boolean
  error?: string
  
  // Event handlers
  onEventCreate: (eventData: CreateEventData) => Promise<UnifiedCalendarEvent | null>
  onEventUpdate: (eventId: string, eventData: UpdateEventData) => Promise<UnifiedCalendarEvent | null>
  onEventDelete: (eventId: string) => Promise<boolean>
  onEventClick: (event: UnifiedCalendarEvent) => void
  
  // Teams/Meet handlers
  onAddTeamsToEvent: (eventId: string) => Promise<UnifiedCalendarEvent | null>
  onAddMeetToEvent: (eventId: string) => Promise<UnifiedCalendarEvent | null>
  
  // View management
  onViewChange: (view: 'month' | 'week' | 'day') => void
  onDateChange: (date: Date) => void
  onDateNavigation: (direction: 'prev' | 'next') => void
  onTodayClick: () => void
  
  // Error handling
  onErrorDismiss: () => void
}

const CalendarView: React.FC<CalendarViewProps> = ({
  events,
  selectedAccount,
  currentView,
  currentDate,
  isLoading,
  error,
  onEventCreate,
  onEventUpdate,
  onEventDelete,
  onEventClick,
  onAddTeamsToEvent,
  onAddMeetToEvent,
  onViewChange,
  onDateChange,
  onDateNavigation,
  onTodayClick,
  onErrorDismiss
}) => {
  const [showEventModal, setShowEventModal] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<UnifiedCalendarEvent | null>(null)
  const [eventModalMode, setEventModalMode] = useState<'create' | 'edit' | 'view'>('view')
  const [initialDate, setInitialDate] = useState<Date>(new Date())
  const [initialHour, setInitialHour] = useState<number>(9)
  const [initialMinute, setInitialMinute] = useState<number>(0)

  const handleEventClick = (event: UnifiedCalendarEvent) => {
    setSelectedEvent(event)
    setEventModalMode('view')
    setShowEventModal(true)
    onEventClick(event)
  }

  const handleCreateEvent = (date?: Date, hour?: number, minute?: number) => {
    setSelectedEvent(null)
    setEventModalMode('create')
    setInitialDate(date || currentDate)
    setInitialHour(hour || 9)
    setInitialMinute(minute || 0)
    setShowEventModal(true)
  }

  const handleEditEvent = (event: UnifiedCalendarEvent) => {
    setSelectedEvent(event)
    setEventModalMode('edit')
    setShowEventModal(true)
  }


  if (!selectedAccount) {
    return <NoAccountSelectedState />
  }

  if (error) {
    return (
      <ErrorState 
        error={error} 
        onRetry={() => window.location.reload()}
        onDismiss={onErrorDismiss}
      />
    )
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Calendar Header */}
      <div className="flex-shrink-0">
        <div className="flex items-center justify-between p-6 border-b border-border/50">
          <CalendarNavigation
            currentDate={currentDate}
            currentView={currentView}
            isLoading={isLoading}
            onDateNavigation={onDateNavigation}
            onViewChange={onViewChange}
            onTodayClick={onTodayClick}
            onDateSelect={onDateChange}
          />
          
          <div className="flex items-center gap-3">
            <button 
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => handleCreateEvent()}
              disabled={isLoading}
            >
              <PlusIcon className="w-4 h-4" />
              New Event
            </button>
          </div>
        </div>
      </div>
      
      {/* Calendar Content */}
      <div className="flex-1 overflow-hidden bg-background">
        {isLoading ? (
          <CalendarLoadingState view={currentView} />
        ) : (
          <>
            {currentView === 'month' && (
              <MonthView
                currentDate={currentDate}
                events={events}
                onEventClick={handleEventClick}
                onDateClick={(date) => handleCreateEvent(date)}
                onEventCreate={(date) => handleCreateEvent(date)}
                isLoading={isLoading}
              />
            )}
            {currentView === 'week' && (
              <WeekView
                currentDate={currentDate}
                events={events}
                onEventClick={handleEventClick}
                onDateClick={(date) => handleCreateEvent(date)}
                onEventCreate={(date, hour) => handleCreateEvent(date, hour)}
                onTimeSlotClick={(date, hour) => handleCreateEvent(date, hour)}
                isLoading={isLoading}
              />
            )}
            {currentView === 'day' && (
              <DayView
                currentDate={currentDate}
                events={events}
                onEventClick={handleEventClick}
                onEventCreate={(date, hour, minute) => handleCreateEvent(date, hour, minute)}
                onTimeSlotClick={(date, hour, minute) => handleCreateEvent(date, hour, minute)}
                isLoading={isLoading}
              />
            )}
          </>
        )}
      </div>

      {/* Event Details Modal */}
      {eventModalMode === 'view' && (
        <EventDetailsModal
          isOpen={showEventModal}
          onClose={() => setShowEventModal(false)}
          event={selectedEvent}
        />
      )}
      
      {/* Event Create/Edit Modal */}
      {(eventModalMode === 'create' || eventModalMode === 'edit') && (
        <EventModal
          isOpen={showEventModal}
          onClose={() => setShowEventModal(false)}
          event={eventModalMode === 'edit' ? selectedEvent : null}
          initialDate={initialDate}
          initialHour={initialHour}
          initialMinute={initialMinute}
          mode={eventModalMode}
        />
      )}
    </div>
  )
}

// No account selected state
const NoAccountSelectedState: React.FC = () => (
  <div className="flex items-center justify-center h-full">
    <div className="text-center space-y-4">
      <CalendarIcon className="w-16 h-16 text-muted-foreground/50 mx-auto" />
      <div className="space-y-2">
        <h3 className="text-lg font-medium text-foreground">Select a Calendar Account</h3>
        <p className="text-sm text-muted-foreground max-w-sm">Choose an account from the sidebar to view and manage your calendar events.</p>
      </div>
    </div>
  </div>
)

// Error state component
const ErrorState: React.FC<{ 
  error: string
  onRetry: () => void 
  onDismiss: () => void 
}> = ({ error, onRetry, onDismiss }) => (
  <div className="flex items-center justify-center h-full">
    <div className="text-center space-y-4 max-w-md">
      <ExclamationIcon className="w-16 h-16 text-destructive mx-auto" />
      <div className="space-y-2">
        <h3 className="text-lg font-medium text-foreground">Unable to Load Calendar</h3>
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
      <div className="flex items-center justify-center gap-3">
        <button 
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium text-sm"
          onClick={onRetry}
        >
          Try Again
        </button>
        <button 
          className="px-4 py-2 bg-transparent text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-accent transition-colors font-medium text-sm"
          onClick={onDismiss}
        >
          Dismiss
        </button>
      </div>
    </div>
  </div>
)

// Loading state component
const CalendarLoadingState: React.FC<{ view: 'month' | 'week' | 'day' }> = ({ view }) => (
  <div className="flex items-center justify-center h-full">
    <div className="text-center space-y-4">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
      <p className="text-sm text-muted-foreground">Loading {view} view...</p>
    </div>
  </div>
)

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

const ExclamationIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
  </svg>
)

export default CalendarView