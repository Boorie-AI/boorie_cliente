// Week View Component - Calendar week grid with time slots

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

interface WeekViewProps {
  currentDate: Date
  events: UnifiedCalendarEvent[]
  onEventClick: (event: UnifiedCalendarEvent) => void
  onDateClick: (date: Date) => void
  onEventCreate: (date: Date, hour?: number) => void
  onTimeSlotClick: (date: Date, hour: number) => void
  isLoading: boolean
}

const WeekView: React.FC<WeekViewProps> = ({
  currentDate,
  events,
  onEventClick,
  onDateClick,
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

  // Scroll to current time on mount
  useEffect(() => {
    if (scrollContainerRef.current) {
      const now = new Date()
      const currentHour = now.getHours()
      const scrollPosition = (currentHour - 6) * 60 // 60px per hour, start 6 hours before
      scrollContainerRef.current.scrollTop = Math.max(0, scrollPosition)
    }
  }, [])

  // Get the week days starting from Sunday
  const getWeekDays = () => {
    const startOfWeek = new Date(currentDate)
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay())
    
    const days: Date[] = []
    for (let i = 0; i < 7; i++) {
      const day = new Date(startOfWeek)
      day.setDate(startOfWeek.getDate() + i)
      days.push(day)
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

  // Get all-day events for a specific date
  const getAllDayEventsForDate = (date: Date) => {
    return getEventsForDate(date).filter(event => event.isAllDay)
  }

  // Get timed events for a specific date
  const getTimedEventsForDate = (date: Date) => {
    return getEventsForDate(date).filter(event => !event.isAllDay)
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


  // Calculate event position and height
  const calculateEventPosition = (event: UnifiedCalendarEvent) => {
    const startTime = new Date(event.startTime)
    const endTime = new Date(event.endTime)
    
    // Convert to minutes from midnight
    const startMinutes = startTime.getHours() * 60 + startTime.getMinutes()
    const endMinutes = endTime.getHours() * 60 + endTime.getMinutes()
    
    // Height of one hour in pixels
    const hourHeight = 60
    
    // Calculate position (top) and height
    const top = (startMinutes / 60) * hourHeight
    const height = Math.max(((endMinutes - startMinutes) / 60) * hourHeight, 20) // Minimum 20px height
    
    return { top, height }
  }

  // Generate hours array (0-23)
  const hours = Array.from({ length: 24 }, (_, i) => i)
  const weekDays = getWeekDays()
  const weekDayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  // Format hour display
  const formatHour = (hour: number) => {
    if (hour === 0) return '12 AM'
    if (hour === 12) return '12 PM'
    if (hour < 12) return `${hour} AM`
    return `${hour - 12} PM`
  }

  // Check if current time line should be shown for this date
  const shouldShowCurrentTimeLine = (date: Date) => {
    return isToday(date)
  }

  // Calculate current time line position
  const getCurrentTimeLinePosition = () => {
    const now = new Date()
    const minutes = now.getHours() * 60 + now.getMinutes()
    return (minutes / 60) * 60 // 60px per hour
  }

  if (isLoading) {
    return (
      <div className="week-view loading">
        <div className="week-loading">
          <div className="loading-spinner"></div>
          <p>Loading week view...</p>
        </div>
        <WeekSkeleton />
      </div>
    )
  }

  return (
    <div className="week-view">
      {/* Week header with dates */}
      <div className="week-header">
        <div className="time-column-header">
          <span className="gmt-label">GMT-{currentDate.getTimezoneOffset() / 60}</span>
        </div>
        {weekDays.map((date, index) => (
          <div
            key={index}
            className={`week-day-header ${isToday(date) ? 'today' : ''}`}
            onClick={() => onDateClick(date)}
          >
            <div className="day-name">{weekDayNames[index]}</div>
            <div className={`day-number ${isToday(date) ? 'today-number' : ''}`}>
              {date.getDate()}
            </div>
          </div>
        ))}
      </div>

      {/* All-day events section */}
      <div className="all-day-section">
        <div className="all-day-label">
          <span>All day</span>
        </div>
        {weekDays.map((date, index) => {
          const allDayEvents = getAllDayEventsForDate(date)
          return (
            <div key={index} className="all-day-column">
              {allDayEvents.map(event => (
                <div
                  key={event.id}
                  className="all-day-event"
                  style={getAllDayEventStyles(event.provider)}
                  onClick={() => onEventClick(event)}
                  title={`${event.title}${event.location ? ` - ${event.location}` : ''}`}
                >
                  <span className="event-title">{event.title}</span>
                  {event.hasOnlineMeeting && (
                    <span className="meeting-indicator">
                      {event.meetingProvider === 'teams' ? '📹' : '🎥'}
                    </span>
                  )}
                </div>
              ))}
              {allDayEvents.length === 0 && (
                <div 
                  className="all-day-empty"
                  onClick={() => onEventCreate(date)}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Time grid */}
      <div className="week-time-grid" ref={scrollContainerRef}>
        <div className="time-grid-container">
          {/* Time column */}
          <div className="time-column">
            {hours.map(hour => (
              <div key={hour} className="time-slot">
                <span className="time-label">{formatHour(hour)}</span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          <div className="day-columns">
            {weekDays.map((date, dayIndex) => {
              const timedEvents = getTimedEventsForDate(date)
              const showTimeLine = shouldShowCurrentTimeLine(date)
              
              return (
                <div key={dayIndex} className={`day-column ${isToday(date) ? 'today-column' : ''}`}>
                  {/* Hour slots */}
                  {hours.map(hour => (
                    <div
                      key={hour}
                      className="hour-slot"
                      onClick={() => onTimeSlotClick(date, hour)}
                      onDoubleClick={() => onEventCreate(date, hour)}
                    >
                      <div className="hour-slot-content" />
                    </div>
                  ))}

                  {/* Timed events */}
                  <div className="events-container">
                    {timedEvents.map(event => {
                      const { top, height } = calculateEventPosition(event)
                      return (
                        <div
                          key={event.id}
                          className="timed-event"
                          style={{
                            top: `${top}px`,
                            height: `${height}px`,
                            ...getEventStyles(event.provider)
                          }}
                          onClick={() => onEventClick(event)}
                          title={`${event.title}${event.location ? ` - ${event.location}` : ''}`}
                        >
                          <div className="event-content">
                            <div className="event-title">{event.title}</div>
                            <div className="event-time">
                              {new Date(event.startTime).toLocaleTimeString('en-US', {
                                hour: 'numeric',
                                minute: '2-digit',
                                hour12: true
                              })}
                              {event.location && (
                                <div className="event-location">📍 {event.location}</div>
                              )}
                            </div>
                            {event.hasOnlineMeeting && (
                              <div className="meeting-badge">
                                {event.meetingProvider === 'teams' ? '📹 Teams' : '🎥 Meet'}
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Current time line */}
                  {showTimeLine && (
                    <div
                      className="current-time-line"
                      style={{ top: `${getCurrentTimeLinePosition()}px` }}
                    >
                      <div className="time-line-dot" />
                      <div className="time-line" />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// Skeleton loading component for week view
const WeekSkeleton: React.FC = () => (
  <div className="week-skeleton">
    {/* Header skeleton */}
    <div className="skeleton-week-header">
      <div className="skeleton-time-header"></div>
      {Array(7).fill(0).map((_, i) => (
        <div key={i} className="skeleton-day-header">
          <div className="skeleton-day-name"></div>
          <div className="skeleton-day-number"></div>
        </div>
      ))}
    </div>
    
    {/* All day skeleton */}
    <div className="skeleton-all-day">
      <div className="skeleton-all-day-label"></div>
      {Array(7).fill(0).map((_, i) => (
        <div key={i} className="skeleton-all-day-column">
          {Math.random() > 0.7 && <div className="skeleton-all-day-event"></div>}
        </div>
      ))}
    </div>
    
    {/* Time grid skeleton */}
    <div className="skeleton-time-grid">
      <div className="skeleton-time-column">
        {Array(24).fill(0).map((_, i) => (
          <div key={i} className="skeleton-time-slot"></div>
        ))}
      </div>
      <div className="skeleton-day-columns">
        {Array(7).fill(0).map((_, dayIndex) => (
          <div key={dayIndex} className="skeleton-day-column">
            {Array(Math.floor(Math.random() * 3) + 1).fill(0).map((_, eventIndex) => (
              <div
                key={eventIndex}
                className="skeleton-timed-event"
                style={{
                  top: `${Math.random() * 1000}px`,
                  height: `${60 + Math.random() * 120}px`
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  </div>
)

export default WeekView