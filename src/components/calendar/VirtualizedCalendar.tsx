// Virtualized Calendar Component - Efficient rendering for large datasets

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { FixedSizeList as List, VariableSizeList, ListChildComponentProps } from 'react-window'
import { useCalendarStore } from '../../stores/calendarStore'
import useProgressiveLoading from '../../hooks/useProgressiveLoading'


interface VirtualizedCalendarProps {
  events: UnifiedCalendarEvent[]
  currentDate: Date
  currentView: 'month' | 'week' | 'day'
  selectedAccount: string | null
  onEventClick: (event: UnifiedCalendarEvent) => void
  onDateClick: (date: Date) => void
  height: number
  width: number
}

interface VirtualizedEventItemProps extends ListChildComponentProps {
  data: {
    events: UnifiedCalendarEvent[]
    onEventClick: (event: UnifiedCalendarEvent) => void
    currentView: 'month' | 'week' | 'day'
  }
}

interface VirtualizedTimeSlotProps extends ListChildComponentProps {
  data: {
    timeSlots: TimeSlot[]
    events: UnifiedCalendarEvent[]
    onEventClick: (event: UnifiedCalendarEvent) => void
    onTimeSlotClick: (date: Date, hour?: number) => void
    currentDate: Date
  }
}

interface TimeSlot {
  date: Date
  hour: number
  events: UnifiedCalendarEvent[]
  isCurrentHour: boolean
  isBusinessHour: boolean
}

const ITEM_HEIGHT = {
  month: 120, // Height for month view cells
  week: 60,   // Height for week view hour slots
  day: 60     // Height for day view hour slots
}

const EVENT_HEIGHT = 24
const MIN_EVENT_HEIGHT = 18
const MAX_EVENTS_PER_SLOT = 5

export const VirtualizedCalendar: React.FC<VirtualizedCalendarProps> = ({
  events,
  currentDate,
  currentView,
  selectedAccount,
  onEventClick,
  onDateClick,
  height,
  width
}) => {
  const listRef = useRef<VariableSizeList>(null)
  const [scrollOffset, setScrollOffset] = useState(0)
  
  const {
    isLoading,
    hasMore,
    loadMore,
    checkLoadMore,
    loadingProgress
  } = useProgressiveLoading(selectedAccount, currentDate, currentView)

  // Calculate virtualized items based on current view
  const virtualizedItems = useMemo(() => {
    switch (currentView) {
      case 'month':
        return calculateMonthItems(currentDate, events)
      case 'week':
        return calculateWeekItems(currentDate, events)
      case 'day':
        return calculateDayItems(currentDate, events)
      default:
        return []
    }
  }, [currentDate, currentView, events])

  // Calculate item height dynamically based on content
  const getItemHeight = useCallback((index: number) => {
    const item = virtualizedItems[index]
    if (!item) return ITEM_HEIGHT[currentView]

    const baseHeight = ITEM_HEIGHT[currentView]
    const eventCount = item.events?.length || 0
    
    // Adjust height based on number of events
    if (currentView === 'month') {
      return baseHeight + Math.min(eventCount * EVENT_HEIGHT, MAX_EVENTS_PER_SLOT * EVENT_HEIGHT)
    }
    
    return baseHeight
  }, [virtualizedItems, currentView])

  // Handle scroll events for progressive loading
  const handleScroll = useCallback(({ scrollOffset: newScrollOffset }: { scrollOffset: number }) => {
    setScrollOffset(newScrollOffset)
    
    // Calculate scroll progress
    const maxScroll = Math.max(0, virtualizedItems.length * ITEM_HEIGHT[currentView] - height)
    const scrollProgress = maxScroll > 0 ? newScrollOffset / maxScroll : 0
    
    // Trigger progressive loading
    checkLoadMore(scrollProgress)
  }, [virtualizedItems.length, currentView, height, checkLoadMore])

  // Auto-scroll to current time in day/week view
  useEffect(() => {
    if (currentView !== 'month' && listRef.current) {
      const now = new Date()
      const currentHour = now.getHours()
      const scrollToIndex = Math.max(0, currentHour - 2) // Show 2 hours before current time
      
      setTimeout(() => {
        listRef.current?.scrollToItem(scrollToIndex, 'start')
      }, 100)
    }
  }, [currentView, currentDate])

  // Render month view items
  const renderMonthItem = useCallback((props: VirtualizedEventItemProps) => {
    const { index, style, data } = props
    const item = virtualizedItems[index]
    
    if (!item) return null

    return (
      <div style={style} className="virtual-month-cell">
        <MonthCell
          date={item.date}
          events={item.events}
          isToday={item.isToday}
          isCurrentMonth={item.isCurrentMonth}
          onEventClick={data.onEventClick}
          onDateClick={onDateClick}
        />
      </div>
    )
  }, [virtualizedItems, onDateClick])

  // Render time slot items (week/day view)
  const renderTimeSlotItem = useCallback((props: VirtualizedTimeSlotProps) => {
    const { index, style, data } = props
    const timeSlot = data.timeSlots[index]
    
    if (!timeSlot) return null

    return (
      <div style={style} className="virtual-time-slot">
        <TimeSlotCell
          timeSlot={timeSlot}
          onEventClick={data.onEventClick}
          onTimeSlotClick={data.onTimeSlotClick}
          view={currentView}
        />
      </div>
    )
  }, [currentView])

  // Prepare data for list rendering
  const listData = useMemo(() => {
    if (currentView === 'month') {
      return {
        events,
        onEventClick,
        currentView
      }
    } else {
      return {
        timeSlots: virtualizedItems as TimeSlot[],
        events,
        onEventClick,
        onTimeSlotClick: onDateClick,
        currentDate
      }
    }
  }, [currentView, events, onEventClick, onDateClick, currentDate, virtualizedItems])

  return (
    <div className="virtualized-calendar" style={{ height, width }}>
      {/* Loading indicator */}
      {isLoading && (
        <div className="virtual-loading-overlay">
          <div className="loading-progress">
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${loadingProgress}%` }}
              />
            </div>
            <span>Loading events... {loadingProgress}%</span>
          </div>
        </div>
      )}

      {/* Virtualized list */}
      {currentView === 'month' ? (
        <VariableSizeList
          ref={listRef}
          height={height}
          width={width}
          itemCount={virtualizedItems.length}
          itemSize={getItemHeight}
          itemData={listData}
          onScroll={handleScroll}
          overscanCount={5}
        >
          {renderMonthItem}
        </VariableSizeList>
      ) : (
        <List
          ref={listRef}
          height={height}
          width={width}
          itemCount={virtualizedItems.length}
          itemSize={ITEM_HEIGHT[currentView]}
          itemData={listData}
          onScroll={handleScroll}
          overscanCount={10}
        >
          {renderTimeSlotItem}
        </List>
      )}

      {/* Load more indicator */}
      {hasMore && !isLoading && (
        <div className="virtual-load-more">
          <button onClick={loadMore} className="btn btn-ghost btn-sm">
            Load More Events
          </button>
        </div>
      )}
    </div>
  )
}

// Month cell component
const MonthCell: React.FC<{
  date: Date
  events: UnifiedCalendarEvent[]
  isToday: boolean
  isCurrentMonth: boolean
  onEventClick: (event: UnifiedCalendarEvent) => void
  onDateClick: (date: Date) => void
}> = ({ date, events, isToday, isCurrentMonth, onEventClick, onDateClick }) => {
  const displayEvents = events.slice(0, MAX_EVENTS_PER_SLOT)
  const hiddenCount = Math.max(0, events.length - MAX_EVENTS_PER_SLOT)

  return (
    <div 
      className={`month-cell ${isToday ? 'today' : ''} ${isCurrentMonth ? 'current-month' : 'other-month'}`}
      onClick={() => onDateClick(date)}
    >
      <div className="cell-header">
        <span className="date-number">{date.getDate()}</span>
      </div>
      
      <div className="cell-events">
        {displayEvents.map((event, index) => (
          <div
            key={`${event.id}-${index}`}
            className={`mini-event provider-${event.provider}`}
            onClick={(e) => {
              e.stopPropagation()
              onEventClick(event)
            }}
            title={event.title}
          >
            <span className="event-title">{event.title}</span>
            {event.hasOnlineMeeting && (
              <span className="meeting-indicator">📹</span>
            )}
          </div>
        ))}
        
        {hiddenCount > 0 && (
          <div className="more-events">
            +{hiddenCount} more
          </div>
        )}
      </div>
    </div>
  )
}

// Time slot cell component
const TimeSlotCell: React.FC<{
  timeSlot: TimeSlot
  onEventClick: (event: UnifiedCalendarEvent) => void
  onTimeSlotClick: (date: Date, hour?: number) => void
  view: 'week' | 'day'
}> = ({ timeSlot, onEventClick, onTimeSlotClick, view }) => {
  const handleSlotClick = () => {
    const slotDate = new Date(timeSlot.date)
    slotDate.setHours(timeSlot.hour)
    onTimeSlotClick(slotDate, timeSlot.hour)
  }

  return (
    <div 
      className={`time-slot ${timeSlot.isCurrentHour ? 'current-hour' : ''} ${timeSlot.isBusinessHour ? 'business-hour' : 'off-hour'}`}
      onClick={handleSlotClick}
    >
      <div className="time-label">
        {formatHour(timeSlot.hour)}
      </div>
      
      <div className="slot-events">
        {timeSlot.events.map((event, index) => (
          <div
            key={`${event.id}-${index}`}
            className={`time-event provider-${event.provider}`}
            onClick={(e) => {
              e.stopPropagation()
              onEventClick(event)
            }}
            style={{
              top: calculateEventPosition(event, timeSlot.hour),
              height: calculateEventHeight(event)
            }}
          >
            <div className="event-content">
              <span className="event-title">{event.title}</span>
              <span className="event-time">
                {event.startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              {event.hasOnlineMeeting && (
                <span className="meeting-indicator">📹</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Helper functions
function calculateMonthItems(currentDate: Date, events: UnifiedCalendarEvent[]) {
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  
  // Get first day of month and adjust to start of week
  const firstDay = new Date(year, month, 1)
  const startDate = new Date(firstDay)
  startDate.setDate(startDate.getDate() - startDate.getDay())
  
  // Generate 6 weeks of days
  const items = []
  const today = new Date()
  
  for (let week = 0; week < 6; week++) {
    for (let day = 0; day < 7; day++) {
      const date = new Date(startDate)
      date.setDate(startDate.getDate() + (week * 7) + day)
      
      // Get events for this date
      const dayEvents = events.filter(event => {
        const eventDate = new Date(event.startTime)
        return eventDate.toDateString() === date.toDateString()
      })
      
      items.push({
        date,
        events: dayEvents,
        isToday: date.toDateString() === today.toDateString(),
        isCurrentMonth: date.getMonth() === month
      })
    }
  }
  
  return items
}

function calculateWeekItems(currentDate: Date, events: UnifiedCalendarEvent[]): TimeSlot[] {
  // Get start of week
  const startOfWeek = new Date(currentDate)
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay())
  startOfWeek.setHours(0, 0, 0, 0)
  
  const items: TimeSlot[] = []
  const now = new Date()
  
  // Generate 24 hours for each day of the week
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      const slotDate = new Date(startOfWeek)
      slotDate.setDate(slotDate.getDate() + day)
      slotDate.setHours(hour)
      
      // Get events for this time slot
      const slotEvents = events.filter(event => {
        const eventStart = new Date(event.startTime)
        const eventEnd = new Date(event.endTime)
        return eventStart <= slotDate && eventEnd > slotDate
      })
      
      items.push({
        date: slotDate,
        hour,
        events: slotEvents,
        isCurrentHour: slotDate.getTime() === new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours()).getTime(),
        isBusinessHour: hour >= 9 && hour < 17
      })
    }
  }
  
  return items
}

function calculateDayItems(currentDate: Date, events: UnifiedCalendarEvent[]): TimeSlot[] {
  const items: TimeSlot[] = []
  const now = new Date()
  
  // Generate 24 hours for the day
  for (let hour = 0; hour < 24; hour++) {
    const slotDate = new Date(currentDate)
    slotDate.setHours(hour, 0, 0, 0)
    
    // Get events for this time slot
    const slotEvents = events.filter(event => {
      const eventStart = new Date(event.startTime)
      const eventEnd = new Date(event.endTime)
      return eventStart <= slotDate && eventEnd > slotDate
    })
    
    items.push({
      date: slotDate,
      hour,
      events: slotEvents,
      isCurrentHour: slotDate.getTime() === new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours()).getTime(),
      isBusinessHour: hour >= 9 && hour < 17
    })
  }
  
  return items
}

function formatHour(hour: number): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    hour12: true
  }).format(new Date(2000, 0, 1, hour))
}

function calculateEventPosition(event: UnifiedCalendarEvent, slotHour: number): string {
  const eventHour = event.startTime.getHours()
  const eventMinute = event.startTime.getMinutes()
  
  if (eventHour === slotHour) {
    return `${(eventMinute / 60) * 100}%`
  }
  return '0%'
}

function calculateEventHeight(event: UnifiedCalendarEvent): string {
  const duration = event.endTime.getTime() - event.startTime.getTime()
  const hours = duration / (1000 * 60 * 60)
  return `${Math.max(hours * EVENT_HEIGHT, MIN_EVENT_HEIGHT)}px`
}

export default VirtualizedCalendar