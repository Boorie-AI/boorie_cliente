// Month View Component - Calendar month grid display

import React from 'react'
import { getProviderColor, getEventStyles } from '../../../utils/calendarColors'
import '../../../styles/components.css';
import '../../../styles/modals.css';
import '../../../styles/recurrence.css';

// Import types
declare global {
  interface UnifiedCalendarEvent {
    id: string
    provider: 'microsoft' | 'google'
    accountId: string
    title: string
    description?: string
    startTime: Date
    endTime: Date
    isAllDay: boolean
    location?: string
    hasOnlineMeeting: boolean
    meetingUrl?: string
    meetingProvider?: 'teams' | 'meet' | 'other'
    originalEvent: any
  }
}

interface MonthViewProps {
  currentDate: Date
  events: UnifiedCalendarEvent[]
  onEventClick: (event: UnifiedCalendarEvent) => void
  onDateClick: (date: Date) => void
  onEventCreate: (date: Date) => void
  isLoading: boolean
}

const MonthView: React.FC<MonthViewProps> = ({
  currentDate,
  events,
  onEventClick,
  onDateClick,
  onEventCreate,
  isLoading
}) => {
  // Calculate the calendar grid for the current month
  const getCalendarDays = () => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    
    // First day of the month
    const firstDayOfMonth = new Date(year, month, 1)
    // Last day of the month
    const lastDayOfMonth = new Date(year, month + 1, 0)
    
    // First day of the calendar grid (might be from previous month)
    const firstCalendarDay = new Date(firstDayOfMonth)
    firstCalendarDay.setDate(firstCalendarDay.getDate() - firstDayOfMonth.getDay())
    
    // Last day of the calendar grid (might be from next month)
    const lastCalendarDay = new Date(lastDayOfMonth)
    const remainingDays = 6 - lastDayOfMonth.getDay()
    lastCalendarDay.setDate(lastCalendarDay.getDate() + remainingDays)
    
    // Generate all days for the calendar grid
    const days: Date[] = []
    const currentDay = new Date(firstCalendarDay)
    
    while (currentDay <= lastCalendarDay) {
      days.push(new Date(currentDay))
      currentDay.setDate(currentDay.getDate() + 1)
    }
    
    return days
  }

  // Get events for a specific date
  const getEventsForDate = (date: Date) => {
    return events.filter(event => {
      const eventDate = new Date(event.startTime)
      return (
        eventDate.getFullYear() === date.getFullYear() &&
        eventDate.getMonth() === date.getMonth() &&
        eventDate.getDate() === date.getDate()
      )
    })
  }

  // Check if a date is in the current month
  const isCurrentMonth = (date: Date) => {
    return date.getMonth() === currentDate.getMonth()
  }

  // Check if a date is today
  const isToday = (date: Date) => {
    const today = new Date()
    return (
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate()
    )
  }


  // Format time for event display
  const formatEventTime = (event: UnifiedCalendarEvent) => {
    if (event.isAllDay) {
      return 'All day'
    }
    
    const start = new Date(event.startTime)
    const end = new Date(event.endTime)
    
    const formatTime = (date: Date) => {
      return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      })
    }
    
    // If same day, show time range
    if (start.getDate() === end.getDate()) {
      return `${formatTime(start)} - ${formatTime(end)}`
    } else {
      return formatTime(start)
    }
  }

  const calendarDays = getCalendarDays()
  const weekDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

  if (isLoading) {
    return (
      <div className="month-view loading">
        <div className="month-loading">
          <div className="loading-spinner"></div>
          <p>Loading month view...</p>
        </div>
        <MonthSkeleton />
      </div>
    )
  }

  return (
    <div className="month-view">
      {/* Days of week header */}
      <div className="month-header">
        {weekDays.map(day => (
          <div key={day} className="day-header">
            <span className="day-name-full">{day}</span>
            <span className="day-name-short">{day.substring(0, 3)}</span>
            <span className="day-name-minimal">{day.substring(0, 1)}</span>
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="month-grid">
        {calendarDays.map((date, index) => {
          const dayEvents = getEventsForDate(date)
          const isCurrentMonthDay = isCurrentMonth(date)
          const isTodayDate = isToday(date)
          
          return (
            <div
              key={index}
              className={`month-day ${isCurrentMonthDay ? 'current-month' : 'other-month'} ${isTodayDate ? 'today' : ''}`}
              onClick={() => onDateClick(date)}
              onDoubleClick={() => onEventCreate(date)}
            >
              {/* Day number */}
              <div className="day-number">
                <span className={`day-text ${isTodayDate ? 'today-text' : ''}`}>
                  {date.getDate()}
                </span>
                {isTodayDate && <div className="today-indicator" />}
              </div>

              {/* Events for this day */}
              <div className="day-events">
                {dayEvents.slice(0, 3).map((event, eventIndex) => (
                  <div
                    key={event.id}
                    className={`event-item ${event.isAllDay ? 'all-day' : 'timed'}`}
                    style={getEventStyles(event.provider)}
                    onClick={(e) => {
                      e.stopPropagation()
                      onEventClick(event)
                    }}
                    title={`${event.title}${event.location ? ` - ${event.location}` : ''}`}
                  >
                    <div className="event-content">
                      <div className="event-title">{event.title}</div>
                      {!event.isAllDay && (
                        <div className="event-time">{formatEventTime(event)}</div>
                      )}
                      {event.hasOnlineMeeting && (
                        <div className="event-meeting-indicator">
                          {event.meetingProvider === 'teams' ? '📹' : '🎥'}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                
                {/* Show "more events" indicator if there are more than 3 */}
                {dayEvents.length > 3 && (
                  <div className="more-events" onClick={(e) => {
                    e.stopPropagation()
                    onDateClick(date)
                  }}>
                    +{dayEvents.length - 3} more
                  </div>
                )}
              </div>

              {/* Add event button on hover */}
              <div className="day-add-event">
                <button
                  className="add-event-btn"
                  onClick={(e) => {
                    e.stopPropagation()
                    onEventCreate(date)
                  }}
                  title="Add event"
                >
                  +
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Skeleton loading component for month view
const MonthSkeleton: React.FC = () => (
  <div className="month-skeleton">
    {/* Header skeleton */}
    <div className="skeleton-header">
      {Array(7).fill(0).map((_, i) => (
        <div key={i} className="skeleton-day-header"></div>
      ))}
    </div>
    
    {/* Grid skeleton */}
    <div className="skeleton-grid">
      {Array(42).fill(0).map((_, i) => (
        <div key={i} className="skeleton-day">
          <div className="skeleton-day-number"></div>
          <div className="skeleton-events">
            {Math.random() > 0.5 && <div className="skeleton-event"></div>}
            {Math.random() > 0.7 && <div className="skeleton-event"></div>}
          </div>
        </div>
      ))}
    </div>
  </div>
)

export default MonthView