// Day View Component - Single day calendar with detailed hourly breakdown

import React, { useState, useRef, useEffect } from 'react'
import { getProviderColor, getEventStyles, getAllDayEventStyles } from '../../../utils/calendarColors'

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

interface DayViewProps {
  currentDate: Date
  events: UnifiedCalendarEvent[]
  onEventClick: (event: UnifiedCalendarEvent) => void
  onEventCreate: (date: Date, hour?: number, minute?: number) => void
  onTimeSlotClick: (date: Date, hour: number, minute: number) => void
  isLoading: boolean
}

const DayView: React.FC<DayViewProps> = ({
  currentDate,
  events,
  onEventClick,
  onEventCreate,
  onTimeSlotClick,
  isLoading
}) => {
  const [currentTime, setCurrentTime] = useState(new Date())
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Update current time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date())
    }, 60000)
    return () => clearInterval(interval)
  }, [])

  // Scroll to current time on mount (if viewing today)
  useEffect(() => {
    if (scrollContainerRef.current && isToday(currentDate)) {
      const now = new Date()
      const currentHour = now.getHours()
      const currentMinute = now.getMinutes()
      const scrollPosition = (currentHour * 60 + currentMinute - 60) * 1 // 1px per minute, start 1 hour before
      scrollContainerRef.current.scrollTop = Math.max(0, scrollPosition)
    }
  }, [currentDate])

  // Get events for the current date
  const getDayEvents = () => {
    return events.filter(event => {
      const eventDate = new Date(event.startTime)
      return (
        eventDate.getFullYear() === currentDate.getFullYear() &&
        eventDate.getMonth() === currentDate.getMonth() &&
        eventDate.getDate() === currentDate.getDate()
      )
    })
  }

  // Get all-day events
  const getAllDayEvents = () => {
    return getDayEvents().filter(event => event.isAllDay)
  }

  // Get timed events
  const getTimedEvents = () => {
    return getDayEvents().filter(event => !event.isAllDay)
  }

  // Check if the current date is today
  const isToday = (date: Date) => {
    const today = new Date()
    return (
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate()
    )
  }


  // Calculate event position and height with minute precision
  const calculateEventPosition = (event: UnifiedCalendarEvent) => {
    const startTime = new Date(event.startTime)
    const endTime = new Date(event.endTime)
    
    // Convert to minutes from midnight
    const startMinutes = startTime.getHours() * 60 + startTime.getMinutes()
    const endMinutes = endTime.getHours() * 60 + endTime.getMinutes()
    
    // Height of one minute in pixels (1px per minute = 60px per hour)
    const minuteHeight = 1
    
    // Calculate position (top) and height
    const top = startMinutes * minuteHeight
    const height = Math.max((endMinutes - startMinutes) * minuteHeight, 15) // Minimum 15px height
    
    return { top, height }
  }

  // Handle overlapping events
  const layoutTimedEvents = () => {
    const timedEvents = getTimedEvents()
    const layoutEvents: Array<UnifiedCalendarEvent & { column: number; width: number; left: number }> = []
    
    // Sort events by start time
    timedEvents.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    
    timedEvents.forEach(event => {
      // Find overlapping events that are already laid out
      const overlapping = layoutEvents.filter(layoutEvent => {
        const eventStart = new Date(event.startTime).getTime()
        const eventEnd = new Date(event.endTime).getTime()
        const layoutStart = new Date(layoutEvent.startTime).getTime()
        const layoutEnd = new Date(layoutEvent.endTime).getTime()
        
        return (eventStart < layoutEnd && eventEnd > layoutStart)
      })
      
      // Find the first available column
      let column = 0
      const usedColumns = overlapping.map(e => e.column).sort((a, b) => a - b)
      
      for (let i = 0; i < usedColumns.length; i++) {
        if (usedColumns[i] !== i) {
          column = i
          break
        }
      }
      if (column === 0 && usedColumns.length > 0) {
        column = usedColumns.length
      }
      
      // Calculate width and left position based on overlapping events
      const maxColumns = Math.max(1, overlapping.length + 1)
      const width = 100 / maxColumns
      const left = column * width
      
      // Update width for all overlapping events
      overlapping.forEach(overlappingEvent => {
        overlappingEvent.width = 100 / maxColumns
        overlappingEvent.left = overlappingEvent.column * (100 / maxColumns)
      })
      
      layoutEvents.push({
        ...event,
        column,
        width,
        left
      })
    })
    
    return layoutEvents
  }

  // Generate hours and quarter-hours
  const timeSlots = []
  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += 15) {
      timeSlots.push({ hour, minute })
    }
  }

  // Format time display
  const formatTime = (hour: number, minute: number = 0) => {
    const period = hour >= 12 ? 'PM' : 'AM'
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
    return minute === 0 
      ? `${displayHour} ${period}`
      : `${displayHour}:${minute.toString().padStart(2, '0')} ${period}`
  }

  // Calculate current time line position
  const getCurrentTimeLinePosition = () => {
    const now = new Date()
    const minutes = now.getHours() * 60 + now.getMinutes()
    return minutes // 1px per minute
  }

  // Format date for header
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const dayEvents = getDayEvents()
  const allDayEvents = getAllDayEvents()
  const layoutedTimedEvents = layoutTimedEvents()
  const isTodayView = isToday(currentDate)

  if (isLoading) {
    return (
      <div className="day-view loading">
        <div className="day-loading">
          <div className="loading-spinner"></div>
          <p>Loading day view...</p>
        </div>
        <DaySkeleton />
      </div>
    )
  }

  return (
    <div className="day-view">
      {/* Day header */}
      <div className="day-header">
        <div className="day-date">
          <h2 className={`date-title ${isTodayView ? 'today-title' : ''}`}>
            {formatDate(currentDate)}
          </h2>
          {isTodayView && <span className="today-badge">Today</span>}
        </div>
        <div className="day-stats">
          <span className="event-count">{dayEvents.length} events</span>
          {allDayEvents.length > 0 && (
            <span className="all-day-count">{allDayEvents.length} all-day</span>
          )}
        </div>
      </div>

      {/* All-day events section */}
      {allDayEvents.length > 0 && (
        <div className="day-all-day-section">
          <div className="all-day-header">
            <span>All day</span>
          </div>
          <div className="all-day-events">
            {allDayEvents.map(event => (
              <div
                key={event.id}
                className="all-day-event"
                style={getAllDayEventStyles(event.provider)}
                onClick={() => onEventClick(event)}
                title={`${event.title}${event.location ? ` - ${event.location}` : ''}`}
              >
                <div className="event-content">
                  <span className="event-title">{event.title}</span>
                  {event.location && (
                    <span className="event-location">📍 {event.location}</span>
                  )}
                  {event.hasOnlineMeeting && (
                    <span className="meeting-indicator">
                      {event.meetingProvider === 'teams' ? '📹 Teams' : '🎥 Meet'}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Time grid */}
      <div className="day-time-grid" ref={scrollContainerRef}>
        <div className="time-grid-container">
          {/* Time column */}
          <div className="time-column">
            {Array.from({ length: 24 }, (_, hour) => (
              <div key={hour} className="hour-block">
                <div className="hour-label">
                  <span className="hour-text">{formatTime(hour)}</span>
                </div>
                <div className="quarter-hours">
                  {[15, 30, 45].map(minute => (
                    <div key={minute} className="quarter-hour">
                      <span className="quarter-label">{formatTime(hour, minute)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Day column */}
          <div className={`day-column ${isTodayView ? 'today-column' : ''}`}>
            {/* Time slots */}
            <div className="time-slots">
              {timeSlots.map(({ hour, minute }, index) => (
                <div
                  key={index}
                  className={`time-slot ${minute === 0 ? 'hour-slot' : 'quarter-slot'}`}
                  onClick={() => onTimeSlotClick(currentDate, hour, minute)}
                  onDoubleClick={() => onEventCreate(currentDate, hour, minute)}
                />
              ))}
            </div>

            {/* Events container */}
            <div className="events-container">
              {layoutedTimedEvents.map(event => {
                const { top, height } = calculateEventPosition(event)
                return (
                  <div
                    key={event.id}
                    className="timed-event"
                    style={{
                      top: `${top}px`,
                      height: `${height}px`,
                      width: `${event.width}%`,
                      left: `${event.left}%`,
                      ...getEventStyles(event.provider)
                    }}
                    onClick={() => onEventClick(event)}
                    title={`${event.title}${event.location ? ` - ${event.location}` : ''}`}
                  >
                    <div className="event-content">
                      <div className="event-title">{event.title}</div>
                      <div className="event-details">
                        <div className="event-time">
                          {new Date(event.startTime).toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true
                          })} - {new Date(event.endTime).toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true
                          })}
                        </div>
                        {event.location && (
                          <div className="event-location">📍 {event.location}</div>
                        )}
                        {event.description && (
                          <div className="event-description">{event.description}</div>
                        )}
                        {event.hasOnlineMeeting && (
                          <div className="meeting-badge">
                            {event.meetingProvider === 'teams' ? '📹 Teams Meeting' : '🎥 Google Meet'}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Current time line */}
            {isTodayView && (
              <div
                className="current-time-line"
                style={{ top: `${getCurrentTimeLinePosition()}px` }}
              >
                <div className="time-line-dot" />
                <div className="time-line" />
                <div className="time-label">
                  {currentTime.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="day-quick-actions">
        <button
          className="quick-action-btn"
          onClick={() => onEventCreate(currentDate)}
          title="Add event"
        >
          <PlusIcon className="w-4 h-4" />
          Add Event
        </button>
        {dayEvents.length === 0 && (
          <div className="empty-day-message">
            <span>No events scheduled for this day</span>
            <button
              className="btn btn-link"
              onClick={() => onEventCreate(currentDate)}
            >
              Create your first event
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// Skeleton loading component for day view
const DaySkeleton: React.FC = () => (
  <div className="day-skeleton">
    {/* Header skeleton */}
    <div className="skeleton-day-header">
      <div className="skeleton-date-title"></div>
      <div className="skeleton-stats"></div>
    </div>
    
    {/* All day skeleton */}
    <div className="skeleton-all-day">
      <div className="skeleton-all-day-header"></div>
      <div className="skeleton-all-day-events">
        <div className="skeleton-all-day-event"></div>
      </div>
    </div>
    
    {/* Time grid skeleton */}
    <div className="skeleton-time-grid">
      <div className="skeleton-time-column">
        {Array(24).fill(0).map((_, i) => (
          <div key={i} className="skeleton-hour-block">
            <div className="skeleton-hour-label"></div>
          </div>
        ))}
      </div>
      <div className="skeleton-day-column">
        {Array(Math.floor(Math.random() * 5) + 2).fill(0).map((_, i) => (
          <div
            key={i}
            className="skeleton-timed-event"
            style={{
              top: `${Math.random() * 1200}px`,
              height: `${30 + Math.random() * 90}px`
            }}
          />
        ))}
      </div>
    </div>
  </div>
)

// Plus icon component
const PlusIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
  </svg>
)

export default DayView