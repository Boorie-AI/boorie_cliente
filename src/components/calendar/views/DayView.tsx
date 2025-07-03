// Day View Component - Single day calendar with detailed hourly breakdown

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

  // Scroll to current time on mount (if viewing today)
  useEffect(() => {
    if (scrollContainerRef.current) {
      const now = new Date()
      const currentHour = now.getHours()
      const currentMinute = now.getMinutes()
      // Each hour is 64px (h-16), scroll to show current time with some context above
      const scrollPosition = Math.max(0, (currentHour - 2) * 64 + (currentMinute / 60) * 64)
      scrollContainerRef.current.scrollTop = scrollPosition
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
    
    // Height of one hour in pixels (64px for h-16)
    const hourHeight = 64
    
    // Calculate position (top) and height
    const top = (startMinutes / 60) * hourHeight
    const height = Math.max(((endMinutes - startMinutes) / 60) * hourHeight, 15) // Minimum 15px height
    
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

  // Generate half-hour time slots
  const timeSlots = []
  for (let hour = 0; hour < 24; hour++) {
    timeSlots.push({ hour, minute: 0 })
    timeSlots.push({ hour, minute: 30 })
  }

  // Format time display
  const formatTime = (hour: number, minute: number = 0) => {
    const period = hour >= 12 ? t('calendar.dayView.pm') : t('calendar.dayView.am')
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
    return minute === 0 
      ? `${displayHour} ${period}`
      : `${displayHour}:${minute.toString().padStart(2, '0')} ${period}`
  }

  // Calculate current time line position
  const getCurrentTimeLinePosition = () => {
    const now = new Date()
    const totalMinutes = now.getHours() * 60 + now.getMinutes()
    // Each hour is 64px (h-16), so each minute is 64/60 px
    return (totalMinutes / 60) * 64
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
      <div className="flex flex-col h-full items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm text-muted-foreground">{t('calendar.dayView.loading')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Day header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-muted/30">
        <div className="flex items-center gap-3">
          {isTodayView && (
            <span className="bg-primary text-primary-foreground text-xs px-2 py-1 rounded-full font-medium">
              {t('calendar.dayView.today')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="font-medium">{dayEvents.length} {t('calendar.dayView.events')}</span>
          {allDayEvents.length > 0 && (
            <span className="font-medium">{allDayEvents.length} {t('calendar.dayView.allDay')}</span>
          )}
        </div>
      </div>

      {/* All-day events section */}
      {allDayEvents.length > 0 && (
        <div className="border-b border-border bg-muted/10">
          <div className="flex">
            <div className="w-20 flex items-center justify-center py-2 border-r border-border">
              <span className="text-xs text-muted-foreground font-medium">{t('calendar.dayView.allDay')}</span>
            </div>
            <div className="flex-1 p-2">
              <div className="space-y-1">
                {allDayEvents.map(event => (
                  <div
                    key={event.id}
                    className={`px-3 py-2 rounded cursor-pointer transition-opacity hover:opacity-90 border-l-2 ${
                      event.provider === 'microsoft' 
                        ? 'bg-blue-100 border-blue-500 text-blue-900' 
                        : 'bg-green-100 border-green-500 text-green-900'
                    }`}
                    onClick={() => onEventClick(event)}
                    title={`${event.title}${event.location ? ` - ${event.location}` : ''}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{event.title}</span>
                        {event.hasOnlineMeeting && (
                          <span className="text-xs">
                            {event.meetingProvider === 'teams' ? `📹 ${t('calendar.dayView.teams')}` : `🎥 ${t('calendar.dayView.meet')}`}
                          </span>
                        )}
                      </div>
                      {event.location && (
                        <span className="text-xs opacity-70">📍 {event.location}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Time grid */}
      <div className="flex-1 overflow-auto" ref={scrollContainerRef}>
        <div className="flex min-h-[1536px]"> {/* 24 hours * 64px = 1536px */}
          {/* Time column */}
          <div className="w-20 border-r border-border bg-muted/10">
            {Array.from({ length: 24 }, (_, hour) => (
              <div key={hour} className="h-16 border-b border-border/30">
                <div className="h-8 flex items-center justify-end pr-2">
                  <span className="text-xs text-muted-foreground font-medium">{formatTime(hour)}</span>
                </div>
                <div className="h-8 flex items-center justify-end pr-2 border-t border-border/10">
                  <span className="text-xs text-muted-foreground/60">{formatTime(hour, 30)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Day column */}
          <div className={`flex-1 relative ${isTodayView ? 'bg-primary/5' : ''}`}>
            {/* Time slots */}
            <div className="absolute inset-0">
              {timeSlots.map(({ hour, minute }, index) => (
                <div
                  key={index}
                  className={`h-8 border-b cursor-pointer hover:bg-accent/30 transition-colors group ${
                    minute === 0 ? 'border-border/30' : 'border-border/10'
                  }`}
                  onClick={() => onTimeSlotClick(currentDate, hour, minute)}
                  onDoubleClick={() => onEventCreate(currentDate, hour, minute)}
                >
                  {/* Add event indicator on hover */}
                  <div className="h-full w-full relative">
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="w-5 h-5 bg-primary/20 text-primary rounded-full flex items-center justify-center text-xs font-bold">
                        +
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Events container */}
            <div className="absolute inset-0 pointer-events-none">
              {layoutedTimedEvents.map(event => {
                const { top, height } = calculateEventPosition(event)
                return (
                  <div
                    key={event.id}
                    className={`absolute rounded shadow-sm cursor-pointer pointer-events-auto transition-opacity hover:opacity-90 border-l-2 ${
                      event.provider === 'microsoft' 
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
                    <div className="p-2 overflow-hidden h-full">
                      <div className="font-medium text-sm leading-tight truncate">{event.title}</div>
                      {height > 20 && (
                        <div className="text-xs opacity-80 mt-1">
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
                      )}
                      {height > 40 && event.location && (
                        <div className="text-xs opacity-70 truncate mt-1">📍 {event.location}</div>
                      )}
                      {height > 60 && event.description && (
                        <div className="text-xs opacity-70 truncate mt-1">{event.description}</div>
                      )}
                      {height > 50 && event.hasOnlineMeeting && (
                        <div className="text-xs mt-1 flex items-center gap-1">
                          <span>{event.meetingProvider === 'teams' ? '📹' : '🎥'}</span>
                          <span>{event.meetingProvider === 'teams' ? t('calendar.dayView.teams') : t('calendar.dayView.meet')}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Current time line */}
            {isTodayView && (
              <div
                className="absolute left-0 right-0 z-10 pointer-events-none"
                style={{ top: `${getCurrentTimeLinePosition()}px` }}
              >
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-red-500 rounded-full -ml-1"></div>
                  <div className="flex-1 h-0.5 bg-red-500"></div>
                </div>
                <div className="absolute -top-3 -left-1 bg-red-500 text-white text-xs px-1.5 py-0.5 rounded font-medium">
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

      {/* Empty day message */}
      {dayEvents.length === 0 && (
        <div className="p-4 border-t border-border bg-muted/10">
          <div className="text-center text-sm text-muted-foreground">
            <span>{t('calendar.dayView.noEvents')}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// Skeleton loading component for day view
const DaySkeleton: React.FC = () => (
  <div className="flex flex-col h-full bg-background">
    {/* Header skeleton */}
    <div className="flex items-center justify-between p-4 border-b border-border bg-muted/30">
      <div className="flex items-center gap-3">
        <div className="w-48 h-6 bg-muted animate-pulse rounded"></div>
        <div className="w-12 h-5 bg-muted animate-pulse rounded-full"></div>
      </div>
      <div className="flex items-center gap-4">
        <div className="w-16 h-4 bg-muted animate-pulse rounded"></div>
        <div className="w-12 h-4 bg-muted animate-pulse rounded"></div>
      </div>
    </div>
    
    {/* All day skeleton */}
    <div className="border-b border-border bg-muted/10">
      <div className="flex">
        <div className="w-20 flex items-center justify-center py-2 border-r border-border">
          <div className="w-10 h-3 bg-muted animate-pulse rounded"></div>
        </div>
        <div className="flex-1 p-2">
          <div className="w-full h-8 bg-muted/50 animate-pulse rounded"></div>
        </div>
      </div>
    </div>
    
    {/* Time grid skeleton */}
    <div className="flex-1 overflow-auto">
      <div className="flex min-h-[1536px]">
        <div className="w-20 border-r border-border bg-muted/10">
          {Array(24).fill(0).map((_, i) => (
            <div key={i} className="h-16 border-b border-border/30">
              <div className="h-8 flex items-center justify-end pr-2">
                <div className="w-8 h-3 bg-muted animate-pulse rounded"></div>
              </div>
              <div className="h-8 flex items-center justify-end pr-2 border-t border-border/10">
                <div className="w-6 h-2 bg-muted/60 animate-pulse rounded"></div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex-1 relative">
          {Array(48).fill(0).map((_, index) => (
            <div key={index} className="h-8 border-b border-border/30"></div>
          ))}
          {Array(Math.floor(Math.random() * 5) + 2).fill(0).map((_, i) => (
            <div
              key={i}
              className="absolute left-1 right-1 bg-muted/50 animate-pulse rounded"
              style={{
                top: `${Math.random() * 1200}px`,
                height: `${30 + Math.random() * 90}px`
              }}
            />
          ))}
        </div>
      </div>
    </div>
    
    {/* Empty message skeleton */}
    <div className="p-4 border-t border-border bg-muted/10">
      <div className="text-center">
        <div className="w-48 h-4 bg-muted animate-pulse rounded mx-auto"></div>
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