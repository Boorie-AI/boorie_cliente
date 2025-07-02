// Month View Component - Calendar month grid display

import React from 'react'
import { getProviderColor, getEventStyles } from '../../../utils/calendarColors'

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
      <div className="relative h-full">
        <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm z-10">
          <div className="text-center space-y-3">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-sm text-muted-foreground">Loading month view...</p>
          </div>
        </div>
        <MonthSkeleton />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Days of week header */}
      <div className="grid grid-cols-7 bg-muted/50 border-b border-border">
        {weekDays.map(day => (
          <div key={day} className="p-3 text-center font-medium text-muted-foreground border-r border-border last:border-r-0">
            <span className="hidden sm:inline">{day}</span>
            <span className="hidden xs:inline sm:hidden">{day.substring(0, 3)}</span>
            <span className="inline xs:hidden">{day.substring(0, 1)}</span>
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="flex-1 grid grid-cols-7 grid-rows-6 overflow-hidden">
        {calendarDays.map((date, index) => {
          const dayEvents = getEventsForDate(date)
          const isCurrentMonthDay = isCurrentMonth(date)
          const isTodayDate = isToday(date)
          
          return (
            <div
              key={index}
              className={`relative border-r border-b border-border p-2 cursor-pointer transition-colors hover:bg-accent/50 flex flex-col min-h-24 ${
                !isCurrentMonthDay ? 'bg-muted/30 text-muted-foreground' : 'bg-background'
              } ${isTodayDate ? 'bg-primary/5 border-primary/20' : ''} last:border-r-0`}
              onClick={() => onDateClick(date)}
              onDoubleClick={() => onEventCreate(date)}
            >
              {/* Day number */}
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-sm font-medium ${
                  isTodayDate ? 'text-primary font-semibold' : isCurrentMonthDay ? 'text-foreground' : 'text-muted-foreground'
                }`}>
                  {date.getDate()}
                </span>
                {isTodayDate && <div className="w-2 h-2 bg-primary rounded-full" />}
              </div>

              {/* Events for this day */}
              <div className="flex-1 space-y-1 overflow-hidden">
                {dayEvents.slice(0, 3).map((event, eventIndex) => (
                  <div
                    key={event.id}
                    className={`px-2 py-1 rounded text-xs cursor-pointer transition-opacity hover:opacity-80 border-l-2 ${
                      event.provider === 'microsoft' ? 'bg-blue-100 border-blue-500 text-blue-900' : 'bg-green-100 border-green-500 text-green-900'
                    }`}
                    onClick={(e) => {
                      e.stopPropagation()
                      onEventClick(event)
                    }}
                    title={`${event.title}${event.location ? ` - ${event.location}` : ''}`}
                  >
                    <div className="space-y-1">
                      <div className="font-medium truncate">{event.title}</div>
                      {!event.isAllDay && (
                        <div className="text-xs opacity-80 truncate">{formatEventTime(event)}</div>
                      )}
                      {event.hasOnlineMeeting && (
                        <div className="text-xs">
                          {event.meetingProvider === 'teams' ? '📹' : '🎥'}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                
                {/* Show "more events" indicator if there are more than 3 */}
                {dayEvents.length > 3 && (
                  <div 
                    className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors text-center py-1 bg-muted/50 rounded"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDateClick(date)
                    }}
                  >
                    +{dayEvents.length - 3} more
                  </div>
                )}
              </div>

              {/* Add event button on hover */}
              <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  className="w-6 h-6 bg-primary text-primary-foreground rounded-full text-xs font-bold hover:bg-primary/90 transition-colors flex items-center justify-center"
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
  <div className="flex flex-col h-full">
    {/* Header skeleton */}
    <div className="grid grid-cols-7 bg-muted/30 border-b border-border">
      {Array(7).fill(0).map((_, i) => (
        <div key={i} className="p-3 border-r border-border last:border-r-0">
          <div className="w-16 h-4 bg-muted animate-pulse rounded mx-auto"></div>
        </div>
      ))}
    </div>
    
    {/* Grid skeleton */}
    <div className="flex-1 grid grid-cols-7 grid-rows-6">
      {Array(42).fill(0).map((_, i) => (
        <div key={i} className="border-r border-b border-border p-2 space-y-2 last:border-r-0">
          <div className="w-6 h-4 bg-muted animate-pulse rounded"></div>
          <div className="space-y-1">
            {Math.random() > 0.5 && <div className="w-full h-3 bg-muted/50 animate-pulse rounded"></div>}
            {Math.random() > 0.7 && <div className="w-3/4 h-3 bg-muted/50 animate-pulse rounded"></div>}
          </div>
        </div>
      ))}
    </div>
  </div>
)

export default MonthView