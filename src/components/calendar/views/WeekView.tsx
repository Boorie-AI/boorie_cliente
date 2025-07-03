// Week View Component - Calendar week grid with time slots

import React, { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
  const [currentTime, setCurrentTime] = useState(new Date())
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Update current time every second for smooth timeline
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000) // Update every second for smooth timeline movement
    return () => clearInterval(interval)
  }, [])

  // Scroll to current time on mount and when date changes
  useEffect(() => {
    if (scrollContainerRef.current) {
      const now = new Date()
      const currentHour = now.getHours()
      const currentMinute = now.getMinutes()
      // Each hour is 64px (h-16), scroll to show current time with some context above
      const scrollPosition = Math.max(0, (currentHour - 2) * 64 + (currentMinute / 60) * 64)
      scrollContainerRef.current.scrollTop = scrollPosition
    }
  }, [currentDate]) // Re-scroll when date changes

  // Get the week days starting from Monday
  const getWeekDays = () => {
    const startOfWeek = new Date(currentDate)
    // Get Monday: if day is Sunday (0), go back 6 days, otherwise go back (day - 1) days
    const dayOfWeek = startOfWeek.getDay()
    const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    startOfWeek.setDate(startOfWeek.getDate() - daysToSubtract)

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

    // Height of one hour in pixels (64px for h-16)
    const hourHeight = 64

    // Calculate position (top) and height
    const top = (startMinutes / 60) * hourHeight
    const height = Math.max(((endMinutes - startMinutes) / 60) * hourHeight, 20) // Minimum 20px height

    return { top, height }
  }

  // Handle overlapping events for a specific date
  const layoutEventsForDate = (date: Date) => {
    const timedEvents = getTimedEventsForDate(date)
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

  // Generate hours array (0-23)
  const hours = Array.from({ length: 24 }, (_, i) => i)
  const weekDays = getWeekDays()
  const weekDayNames = [
    t('calendar.monthView.monday'),
    t('calendar.monthView.tuesday'),
    t('calendar.monthView.wednesday'),
    t('calendar.monthView.thursday'),
    t('calendar.monthView.friday'),
    t('calendar.monthView.saturday'),
    t('calendar.monthView.sunday')
  ]

  // Format hour display
  const formatHour = (hour: number) => {
    if (hour === 0) return `12 AM`
    if (hour === 12) return `12 PM`
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
    const totalMinutes = now.getHours() * 60 + now.getMinutes()
    // Each hour is 64px (h-16), so each minute is 64/60 px
    return (totalMinutes / 60) * 64
  }

  if (isLoading) {
    return (
      <div className="flex flex-col h-full items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm text-muted-foreground">{t('calendar.weekView.loading')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Week header with dates */}
      <div className="flex border-b border-border bg-muted/30">
        <div className="w-16 lg:w-20 flex items-center justify-center py-3 border-r border-border">
          <span className="text-xs text-muted-foreground">GMT{currentDate.getTimezoneOffset() > 0 ? '-' : '+'}{Math.abs(currentDate.getTimezoneOffset() / 60)}</span>
        </div>
        {weekDays.map((date, index) => (
          <div
            key={index}
            className={`flex-1 flex flex-col items-center py-3 cursor-pointer hover:bg-accent/50 transition-colors border-r border-border last:border-r-0 ${isToday(date) ? 'bg-primary/10 border-primary/20' : ''
              }`}
            onClick={() => onDateClick(date)}
          >
            <div className="text-xs text-muted-foreground font-medium mb-1">{weekDayNames[index]}</div>
            <div className={`text-sm font-semibold ${isToday(date) ? 'text-primary bg-primary/20 rounded-full w-6 h-6 flex items-center justify-center' : 'text-foreground'
              }`}>
              {date.getDate()}
            </div>
          </div>
        ))}
      </div>

      {/* All-day events section */}
      <div className="flex border-b border-border bg-muted/10">
        <div className="w-16 lg:w-20 flex items-center justify-center py-2 border-r border-border">
          <span className="text-xs text-muted-foreground font-medium">{t('calendar.weekView.allDay')}</span>
        </div>
        {weekDays.map((date, index) => {
          const allDayEvents = getAllDayEventsForDate(date)
          return (
            <div key={index} className="flex-1 border-r border-border last:border-r-0 p-1 min-h-12">
              <div className="space-y-1">
                {allDayEvents.map(event => (
                  <div
                    key={event.id}
                    className={`px-2 py-1 rounded text-xs cursor-pointer transition-opacity hover:opacity-80 border-l-2 overflow-hidden ${event.provider === 'microsoft'
                        ? 'bg-blue-100 border-blue-500 text-blue-900'
                        : 'bg-green-100 border-green-500 text-green-900'
                      }`}
                    onClick={() => onEventClick(event)}
                    title={`${event.title}${event.location ? ` - ${event.location}` : ''}`}
                  >
                    <div className="flex items-center gap-1 w-full">
                      <span className="font-medium truncate flex-1 min-w-0">{event.title}</span>
                      {event.hasOnlineMeeting && (
                        <span className="text-xs flex-shrink-0">
                          {event.meetingProvider === 'teams' ? '📹' : '🎥'}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {allDayEvents.length === 0 && (
                  <div
                    className="h-full cursor-pointer hover:bg-accent/30 rounded transition-colors"
                    onClick={() => onEventCreate(date)}
                  />
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Time grid */}
      <div className="flex-1 overflow-auto" ref={scrollContainerRef}>
        <div className="flex min-h-[1536px]"> {/* 24 hours * 64px = 1536px */}
          {/* Time column */}
          <div className="w-16 lg:w-20 border-r border-border bg-muted/10">
            {hours.map(hour => (
              <div key={hour} className="h-16 border-b border-border/30 flex items-start justify-end pr-2 pt-1">
                <span className="text-xs text-muted-foreground font-medium">{formatHour(hour)}</span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          <div className="flex flex-1">
            {weekDays.map((date, dayIndex) => {
              const layoutedEvents = layoutEventsForDate(date)
              const showTimeLine = shouldShowCurrentTimeLine(date)

              return (
                <div key={dayIndex} className={`flex-1 relative border-r border-border last:border-r-0 ${isToday(date) ? 'bg-primary/5' : ''
                  }`}>
                  {/* Hour slots */}
                  {hours.map(hour => (
                    <div
                      key={hour}
                      className="h-16 border-b border-border/30 cursor-pointer hover:bg-accent/30 transition-colors group"
                      onClick={() => onTimeSlotClick(date, hour)}
                      onDoubleClick={() => onEventCreate(date, hour)}
                    >
                      <div className="h-full w-full relative">
                        {/* Quarter hour lines */}
                        <div className="absolute inset-x-0 top-1/4 h-px bg-border/20"></div>
                        <div className="absolute inset-x-0 top-1/2 h-px bg-border/20"></div>
                        <div className="absolute inset-x-0 top-3/4 h-px bg-border/20"></div>

                        {/* Add event indicator on hover */}
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="w-6 h-6 bg-primary/20 text-primary rounded-full flex items-center justify-center text-xs font-bold">
                            +
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Timed events */}
                  <div className="absolute inset-0 pointer-events-none">
                    {layoutedEvents.map(event => {
                      const { top, height } = calculateEventPosition(event)
                      return (
                        <div
                          key={event.id}
                          className={`absolute rounded shadow-sm cursor-pointer pointer-events-auto transition-opacity hover:opacity-90 border-l-2 overflow-hidden ${event.provider === 'microsoft'
                              ? 'bg-blue-100 border-blue-500 text-blue-900'
                              : 'bg-green-100 border-green-500 text-green-900'
                            }`}
                          style={{
                            top: `${top}px`,
                            height: `${height}px`,
                            width: `calc(${event.width}% - 8px)`,
                            left: `calc(${event.left}% + 4px)`
                          }}
                          onClick={() => onEventClick(event)}
                          title={`${event.title}${event.location ? ` - ${event.location}` : ''}`}
                        >
                          <div className="p-1 overflow-hidden h-full">
                            <div className="font-medium text-xs leading-tight truncate">{event.title}</div>
                            {height > 30 && (
                              <div className="text-xs opacity-80 mt-1 truncate">
                                {new Date(event.startTime).toLocaleTimeString('en-US', {
                                  hour: 'numeric',
                                  minute: '2-digit',
                                  hour12: true
                                })}
                              </div>
                            )}
                            {height > 50 && event.location && (
                              <div className="text-xs opacity-70 truncate">📍 {event.location}</div>
                            )}
                            {height > 40 && event.hasOnlineMeeting && (
                              <div className="text-xs mt-1 truncate">
                                {event.meetingProvider === 'teams' ? `📹 ${t('calendar.weekView.meeting.teams')}` : `🎥 ${t('calendar.weekView.meeting.meet')}`}
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
                      className="absolute left-0 right-0 z-10 pointer-events-none"
                      style={{ top: `${getCurrentTimeLinePosition()}px` }}
                    >
                      <div className="flex items-center">
                        <div className="w-2 h-2 bg-red-500 rounded-full -ml-1"></div>
                        <div className="flex-1 h-0.5 bg-red-500"></div>
                      </div>
                      <div className="absolute -top-2 -left-1 bg-red-500 text-white text-xs px-1.5 py-0.5 rounded text-center font-medium">
                        {currentTime.toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true
                        })}
                      </div>
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
  <div className="flex flex-col h-full bg-background">
    {/* Header skeleton */}
    <div className="flex border-b border-border bg-muted/30">
      <div className="w-16 lg:w-20 flex items-center justify-center py-3 border-r border-border">
        <div className="w-8 h-3 bg-muted animate-pulse rounded"></div>
      </div>
      {Array(7).fill(0).map((_, i) => (
        <div key={i} className="flex-1 flex flex-col items-center py-3 border-r border-border last:border-r-0">
          <div className="w-6 h-3 bg-muted animate-pulse rounded mb-1"></div>
          <div className="w-4 h-4 bg-muted animate-pulse rounded"></div>
        </div>
      ))}
    </div>

    {/* All day skeleton */}
    <div className="flex border-b border-border bg-muted/10">
      <div className="w-16 lg:w-20 flex items-center justify-center py-2 border-r border-border">
        <div className="w-10 h-3 bg-muted animate-pulse rounded"></div>
      </div>
      {Array(7).fill(0).map((_, i) => (
        <div key={i} className="flex-1 border-r border-border last:border-r-0 p-1 min-h-12">
          {Math.random() > 0.7 && <div className="w-full h-6 bg-muted/50 animate-pulse rounded"></div>}
        </div>
      ))}
    </div>

    {/* Time grid skeleton */}
    <div className="flex-1 flex overflow-hidden">
      <div className="flex w-full">
        <div className="w-16 lg:w-20 border-r border-border bg-muted/10">
          {Array(24).fill(0).map((_, i) => (
            <div key={i} className="h-16 border-b border-border/30 flex items-start justify-end pr-2 pt-1">
              <div className="w-8 h-3 bg-muted animate-pulse rounded"></div>
            </div>
          ))}
        </div>
        <div className="flex flex-1">
          {Array(7).fill(0).map((_, dayIndex) => (
            <div key={dayIndex} className="flex-1 relative border-r border-border last:border-r-0">
              {Array(24).fill(0).map((_, hour) => (
                <div key={hour} className="h-15 border-b border-border/30"></div>
              ))}
              {Array(Math.floor(Math.random() * 3) + 1).fill(0).map((_, eventIndex) => (
                <div
                  key={eventIndex}
                  className="absolute left-1 right-1 bg-muted/50 animate-pulse rounded"
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
  </div>
)

export default WeekView