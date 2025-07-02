// Calendar View Component - Main calendar display component

import React, { useState } from 'react'
import MonthView from './views/MonthView'
import WeekView from './views/WeekView'
import DayView from './views/DayView'
import CalendarNavigation from './CalendarNavigation'
import '../../styles/components.css';
import '../../styles/modals.css';
import '../../styles/recurrence.css';

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

  const handleEventClick = (event: UnifiedCalendarEvent) => {
    setSelectedEvent(event)
    setEventModalMode('view')
    setShowEventModal(true)
    onEventClick(event)
  }

  const handleCreateEvent = (dateTime?: Date) => {
    setSelectedEvent(null)
    setEventModalMode('create')
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
    <div className="calendar-view">
      {/* Calendar Header */}
      <div className="calendar-header">
        <CalendarNavigation
          currentDate={currentDate}
          currentView={currentView}
          isLoading={isLoading}
          onDateNavigation={onDateNavigation}
          onViewChange={onViewChange}
          onTodayClick={onTodayClick}
          onDateSelect={onDateChange}
        />
        
        <div className="calendar-actions">
          <button 
            className="btn btn-primary btn-sm create-event-btn"
            onClick={() => handleCreateEvent()}
            disabled={isLoading}
          >
            <PlusIcon className="w-4 h-4 mr-2" />
            New Event
          </button>
        </div>
      </div>
      
      {/* Calendar Content */}
      <div className="calendar-content">
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
                onEventCreate={(date, hour) => handleCreateEvent(date)}
                onTimeSlotClick={(date, hour) => handleCreateEvent(date)}
                isLoading={isLoading}
              />
            )}
            {currentView === 'day' && (
              <DayView
                currentDate={currentDate}
                events={events}
                onEventClick={handleEventClick}
                onEventCreate={(date, hour, minute) => handleCreateEvent(date)}
                onTimeSlotClick={(date, hour, minute) => handleCreateEvent(date)}
                isLoading={isLoading}
              />
            )}
          </>
        )}
      </div>

      {/* Event Modal Placeholder */}
      {showEventModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>
                {eventModalMode === 'create' 
                  ? 'Create Event' 
                  : eventModalMode === 'edit' 
                    ? 'Edit Event' 
                    : 'Event Details'
                }
              </h3>
              <button 
                className="btn btn-ghost btn-sm"
                onClick={() => setShowEventModal(false)}
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>
            <div className="modal-body">
              <p>Event modal content will be implemented in Phase 4</p>
              {selectedEvent && (
                <div className="event-preview">
                  <h4>{selectedEvent.title}</h4>
                  <p>{selectedEvent.description}</p>
                  <p>
                    {selectedEvent.startTime.toLocaleString()} - {selectedEvent.endTime.toLocaleString()}
                  </p>
                  {selectedEvent.location && <p>📍 {selectedEvent.location}</p>}
                  {selectedEvent.hasOnlineMeeting && (
                    <p>
                      🎥 {selectedEvent.meetingProvider === 'teams' ? 'Teams Meeting' : 'Google Meet'}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// No account selected state
const NoAccountSelectedState: React.FC = () => (
  <div className="calendar-empty-state">
    <div className="empty-content">
      <CalendarIcon className="w-16 h-16 text-gray-300 mb-4" />
      <h3>Select a Calendar Account</h3>
      <p>Choose an account from the sidebar to view and manage your calendar events.</p>
    </div>
  </div>
)

// Error state component
const ErrorState: React.FC<{ 
  error: string
  onRetry: () => void 
  onDismiss: () => void 
}> = ({ error, onRetry, onDismiss }) => (
  <div className="calendar-error-state">
    <div className="error-content">
      <ExclamationIcon className="w-16 h-16 text-red-400 mb-4" />
      <h3>Unable to Load Calendar</h3>
      <p className="error-message">{error}</p>
      <div className="error-actions">
        <button className="btn btn-primary" onClick={onRetry}>
          Try Again
        </button>
        <button className="btn btn-ghost" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  </div>
)

// Loading state component
const CalendarLoadingState: React.FC<{ view: 'month' | 'week' | 'day' }> = ({ view }) => (
  <div className="calendar-loading">
    <div className="loading-content">
      <div className="loading-spinner large"></div>
      <p>Loading {view} view...</p>
    </div>
    <div className="loading-skeleton">
      {/* Basic skeleton structure based on view */}
      {view === 'month' && <MonthSkeleton />}
      {view === 'week' && <WeekSkeleton />}
      {view === 'day' && <DaySkeleton />}
    </div>
  </div>
)


// Skeleton loading components
const MonthSkeleton: React.FC = () => (
  <div className="month-skeleton">
    <div className="skeleton-grid">
      {Array(35).fill(0).map((_, i) => (
        <div key={i} className="skeleton-day"></div>
      ))}
    </div>
  </div>
)

const WeekSkeleton: React.FC = () => (
  <div className="week-skeleton">
    <div className="skeleton-week">
      {Array(7).fill(0).map((_, i) => (
        <div key={i} className="skeleton-day-column"></div>
      ))}
    </div>
  </div>
)

const DaySkeleton: React.FC = () => (
  <div className="day-skeleton">
    <div className="skeleton-day-view">
      {Array(24).fill(0).map((_, i) => (
        <div key={i} className="skeleton-hour"></div>
      ))}
    </div>
  </div>
)

// Icon components
const ChevronLeftIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
  </svg>
)

const ChevronRightIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
)

const PlusIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
  </svg>
)

const XIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
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