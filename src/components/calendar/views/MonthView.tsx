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
    // Start week on Monday: if first day is Sunday (0), go back 6 days, otherwise go back (day - 1) days
    const firstCalendarDay = new Date(firstDayOfMonth)
    const dayOfWeek = firstDayOfMonth.getDay()
    const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    firstCalendarDay.setDate(firstCalendarDay.getDate() - daysToSubtract)
    
    // Last day of the calendar grid (might be from next month)
    const lastCalendarDay = new Date(lastDayOfMonth)
    // For Monday-based weeks: if last day is Sunday (0), add 0 days, otherwise add (7 - day) days
    const lastDayOfWeek = lastDayOfMonth.getDay()
    const remainingDays = lastDayOfWeek === 0 ? 0 : 7 - lastDayOfWeek
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

  // Get events for a specific date (including multi-day events)
  const getEventsForDate = (date: Date) => {
    return events.filter(event => {
      const eventStart = new Date(event.startTime)
      const eventEnd = new Date(event.endTime)
      const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate())
      const dateEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59)
      
      // Handle events that end at midnight - they shouldn't appear on that end day
      let effectiveEventEnd = eventEnd
      if (eventEnd.getHours() === 0 && eventEnd.getMinutes() === 0 && eventEnd.getSeconds() === 0) {
        // If event ends at exactly midnight, subtract 1 second so it doesn't include that day
        effectiveEventEnd = new Date(eventEnd.getTime() - 1000)
      }
      
      // Event overlaps with this date if:
      // 1. Event starts on this date
      // 2. Event ends on this date (but not at midnight)
      // 3. Event spans across this date
      return eventStart <= dateEnd && effectiveEventEnd >= dateStart
    })
  }
  
  // Check if event is the first day, continuation, or last day
  const getEventDayType = (event: UnifiedCalendarEvent, date: Date) => {
    const eventStart = new Date(event.startTime)
    const eventEnd = new Date(event.endTime)
    
    // Normalize to start of day for accurate day counting
    const eventStartDate = new Date(eventStart.getFullYear(), eventStart.getMonth(), eventStart.getDate())
    const eventEndDate = new Date(eventEnd.getFullYear(), eventEnd.getMonth(), eventEnd.getDate())
    const currentDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    
    // For events ending at midnight (00:00), they actually end at the end of the previous day
    let effectiveEndDate = eventEndDate
    if (eventEnd.getHours() === 0 && eventEnd.getMinutes() === 0 && eventEnd.getSeconds() === 0) {
      effectiveEndDate = new Date(eventEndDate)
      effectiveEndDate.setDate(effectiveEndDate.getDate() - 1)
    }
    
    const isFirstDay = eventStartDate.getTime() === currentDate.getTime()
    const isLastDay = effectiveEndDate.getTime() === currentDate.getTime()
    
    // Calculate total days: Friday to Monday = 4 days (Fri, Sat, Sun, Mon)
    const totalDays = Math.floor((effectiveEndDate.getTime() - eventStartDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
    
    // Calculate which day number this is (1-based)
    const dayNumber = Math.floor((currentDate.getTime() - eventStartDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
    
    const isMultiDay = totalDays > 1
    
    
    return {
      isFirstDay,
      isLastDay,
      isContinuation: !isFirstDay && !isLastDay,
      isMultiDay,
      dayNumber,
      totalDays
    }
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
  const weekDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

  if (isLoading) {
    return (
      <div className="flex flex-col h-full items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm text-muted-foreground">Loading month view...</p>
        </div>
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
              <div className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden max-h-20 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
                {dayEvents.map((event, eventIndex) => {
                  const dayType = getEventDayType(event, date)
                  
                  return (
                    <div
                      key={event.id}
                      className={`px-2 py-1 rounded text-xs cursor-pointer transition-opacity hover:opacity-80 border-l-2 ${
                        event.provider === 'microsoft' ? 'bg-blue-100 border-blue-500 text-blue-900' : 'bg-green-100 border-green-500 text-green-900'
                      }`}
                      onClick={(e) => {
                        e.stopPropagation()
                        onEventClick(event)
                      }}
                      title={`${event.title}${event.location ? ` - ${event.location}` : ''}${dayType.isMultiDay ? ` (Day ${dayType.dayNumber} of ${dayType.totalDays})` : ''}`}
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
                        {dayType.isMultiDay && (
                          <div className="text-xs opacity-70">
                            Day {dayType.dayNumber} of {dayType.totalDays}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
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