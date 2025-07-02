// Drag and Drop Calendar Component - Enhanced calendar with drag and drop functionality

import React, { useCallback, useRef } from 'react'
import useDragAndDrop from '../../hooks/useDragAndDrop'
import { useCalendarStore } from '../../stores/calendarStore'
import '../../styles/components.css';
import '../../styles/modals.css';
import '../../styles/recurrence.css';

interface DragDropCalendarProps {
  events: UnifiedCalendarEvent[]
  currentDate: Date
  currentView: 'month' | 'week' | 'day'
  selectedAccount: string | null
  onEventClick: (event: UnifiedCalendarEvent) => void
  onDateClick: (date: Date) => void
  className?: string
}

interface DraggableEventProps {
  event: UnifiedCalendarEvent
  onEventClick: (event: UnifiedCalendarEvent) => void
  isDragging: boolean
  isBeingDragged: boolean
  style?: React.CSSProperties
  currentView: 'month' | 'week' | 'day'
}

interface DropZoneProps {
  date: Date
  hour?: number
  minute?: number
  isValidDrop: boolean
  isTargeted: boolean
  onDateClick: (date: Date) => void
  children?: React.ReactNode
}

export const DragDropCalendar: React.FC<DragDropCalendarProps> = ({
  events,
  currentDate,
  currentView,
  selectedAccount,
  onEventClick,
  onDateClick,
  className = ''
}) => {
  const { updateEvent } = useCalendarStore()
  const calendarRef = useRef<HTMLDivElement>(null)

  const handleEventUpdate = useCallback(async (eventId: string, updates: Partial<UnifiedCalendarEvent>) => {
    const updateData: UpdateEventData = {
      ...updates,
      attendees: updates.attendees?.map(attendee => 
        typeof attendee === 'string' ? attendee : attendee.email
      )
    }
    await updateEvent(eventId, updateData)
  }, [updateEvent])

  const { dragState, handlers, setCalendarRef } = useDragAndDrop(
    currentView,
    currentDate,
    handleEventUpdate
  )

  // Set the calendar ref for drop zone calculations
  React.useEffect(() => {
    setCalendarRef(calendarRef.current)
  }, [setCalendarRef])

  const renderCalendarView = () => {
    switch (currentView) {
      case 'month':
        return <MonthViewDragDrop />
      case 'week':
        return <WeekViewDragDrop />
      case 'day':
        return <DayViewDragDrop />
      default:
        return null
    }
  }

  return (
    <div
      ref={calendarRef}
      className={`drag-drop-calendar ${className} ${dragState.isDragging ? 'is-dragging' : ''}`}
      onMouseMove={handlers.onDragMove}
    >
      {renderCalendarView()}
      
      {/* Drag Ghost */}
      {dragState.isDragging && dragState.draggedEvent && (
        <DragGhost
          event={dragState.draggedEvent}
          position={dragState.ghostPosition}
          canDrop={dragState.canDrop}
          dragMode={dragState.dragMode}
        />
      )}
      
      {/* Drop Zone Overlay */}
      {dragState.isDragging && (
        <DropZoneOverlay
          targetTimeSlot={dragState.targetTimeSlot}
          canDrop={dragState.canDrop}
        />
      )}
    </div>
  )

  // Month View with Drag & Drop
  function MonthViewDragDrop() {
    const monthDays = generateMonthDays(currentDate)
    
    return (
      <div className="month-view-grid">
        {/* Header with day names */}
        <div className="month-header">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="day-header">{day}</div>
          ))}
        </div>
        
        {/* Month days */}
        <div className="month-grid">
          {monthDays.map((day, index) => {
            const dayEvents = events.filter(event => 
              event.startTime.toDateString() === day.toDateString()
            )
            
            return (
              <DropZone
                key={index}
                date={day}
                isValidDrop={true}
                isTargeted={dragState.targetDate?.toDateString() === day.toDateString()}
                onDateClick={onDateClick}
              >
                <div className={`month-cell ${isToday(day) ? 'today' : ''} ${isCurrentMonth(day) ? 'current-month' : 'other-month'}`}>
                  <div className="cell-header">
                    <span className="date-number">{day.getDate()}</span>
                  </div>
                  
                  <div className="cell-events">
                    {dayEvents.slice(0, 3).map(event => (
                      <DraggableEvent
                        key={event.id}
                        event={event}
                        onEventClick={onEventClick}
                        isDragging={dragState.isDragging}
                        isBeingDragged={dragState.draggedEvent?.id === event.id}
                        currentView={currentView}
                      />
                    ))}
                    
                    {dayEvents.length > 3 && (
                      <div className="more-events">
                        +{dayEvents.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              </DropZone>
            )
          })}
        </div>
      </div>
    )
  }

  // Week View with Drag & Drop
  function WeekViewDragDrop() {
    const weekDays = generateWeekDays(currentDate)
    const hours = Array.from({ length: 24 }, (_, i) => i)
    
    return (
      <div className="week-view-grid">
        {/* Header with dates */}
        <div className="week-header">
          <div className="time-column-header"></div>
          {weekDays.map(day => (
            <div key={day.toISOString()} className="day-column-header">
              <div className="day-name">{day.toLocaleDateString('en', { weekday: 'short' })}</div>
              <div className="day-number">{day.getDate()}</div>
            </div>
          ))}
        </div>
        
        {/* Time grid */}
        <div className="week-grid">
          {hours.map(hour => (
            <div key={hour} className="hour-row">
              <div className="time-label">
                {formatHour(hour)}
              </div>
              
              {weekDays.map(day => {
                const slotEvents = events.filter(event => {
                  const eventDate = new Date(event.startTime)
                  return eventDate.toDateString() === day.toDateString() &&
                         eventDate.getHours() === hour
                })
                
                return (
                  <DropZone
                    key={`${day.toISOString()}-${hour}`}
                    date={day}
                    hour={hour}
                    isValidDrop={true}
                    isTargeted={dragState.targetTimeSlot?.date.toDateString() === day.toDateString() && 
                               dragState.targetTimeSlot?.hour === hour}
                    onDateClick={(date) => {
                      const clickDate = new Date(date)
                      clickDate.setHours(hour)
                      onDateClick(clickDate)
                    }}
                  >
                    <div className={`time-slot ${isCurrentHour(day, hour) ? 'current-hour' : ''}`}>
                      {slotEvents.map(event => (
                        <DraggableEvent
                          key={event.id}
                          event={event}
                          onEventClick={onEventClick}
                          isDragging={dragState.isDragging}
                          isBeingDragged={dragState.draggedEvent?.id === event.id}
                          currentView={currentView}
                          style={{
                            height: `${calculateEventHeight(event)}px`,
                            top: `${calculateEventTopOffset(event, hour)}px`
                          }}
                        />
                      ))}
                    </div>
                  </DropZone>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Day View with Drag & Drop  
  function DayViewDragDrop() {
    const hours = Array.from({ length: 24 }, (_, i) => i)
    
    return (
      <div className="day-view-grid">
        <div className="day-header">
          <div className="day-title">
            {currentDate.toLocaleDateString('en', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}
          </div>
        </div>
        
        <div className="day-grid">
          {hours.map(hour => {
            const hourEvents = events.filter(event => {
              const eventDate = new Date(event.startTime)
              return eventDate.toDateString() === currentDate.toDateString() &&
                     eventDate.getHours() === hour
            })
            
            return (
              <DropZone
                key={hour}
                date={currentDate}
                hour={hour}
                isValidDrop={true}
                isTargeted={dragState.targetTimeSlot?.hour === hour}
                onDateClick={(date) => {
                  const clickDate = new Date(date)
                  clickDate.setHours(hour)
                  onDateClick(clickDate)
                }}
              >
                <div className={`hour-slot ${isCurrentHour(currentDate, hour) ? 'current-hour' : ''}`}>
                  <div className="time-label">{formatHour(hour)}</div>
                  
                  <div className="hour-content">
                    {hourEvents.map(event => (
                      <DraggableEvent
                        key={event.id}
                        event={event}
                        onEventClick={onEventClick}
                        isDragging={dragState.isDragging}
                        isBeingDragged={dragState.draggedEvent?.id === event.id}
                        currentView={currentView}
                        style={{
                          height: `${calculateEventHeight(event)}px`,
                          top: `${calculateEventTopOffset(event, hour)}px`
                        }}
                      />
                    ))}
                  </div>
                </div>
              </DropZone>
            )
          })}
        </div>
      </div>
    )
  }
}

// Draggable Event Component
const DraggableEvent: React.FC<DraggableEventProps> = ({
  event,
  onEventClick,
  isDragging,
  isBeingDragged,
  style = {},
  currentView
}) => {
  const { handlers } = useDragAndDrop('month', new Date(), async () => {})

  const handleMouseDown = useCallback((e: React.MouseEvent, dragMode: 'move' | 'resize-start' | 'resize-end') => {
    e.stopPropagation()
    handlers.onDragStart(event, dragMode, e)
  }, [event, handlers])

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (!isDragging) {
      onEventClick(event)
    }
  }, [event, onEventClick, isDragging])

  return (
    <div
      className={`calendar-event draggable-event ${isBeingDragged ? 'being-dragged' : ''} provider-${event.provider}`}
      style={{
        ...style,
        opacity: isBeingDragged ? 0.3 : 1,
        cursor: isDragging ? 'grabbing' : 'grab'
      }}
      onClick={handleClick}
      onMouseDown={(e) => handleMouseDown(e, 'move')}
    >
      {/* Event content */}
      <div className="event-content">
        <span className="event-title">{event.title}</span>
        <span className="event-time">
          {event.startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
        {event.hasOnlineMeeting && (
          <span className="meeting-indicator">📹</span>
        )}
      </div>
      
      {/* Resize handles for detailed views */}
      {(currentView === 'week' || currentView === 'day') && (
        <>
          <div
            className="resize-handle resize-start"
            onMouseDown={(e) => handleMouseDown(e, 'resize-start')}
          />
          <div
            className="resize-handle resize-end"
            onMouseDown={(e) => handleMouseDown(e, 'resize-end')}
          />
        </>
      )}
    </div>
  )
}

// Drop Zone Component
const DropZone: React.FC<DropZoneProps> = ({
  date,
  hour,
  minute,
  isValidDrop,
  isTargeted,
  onDateClick,
  children
}) => {
  const handleClick = useCallback(() => {
    const clickDate = new Date(date)
    if (hour !== undefined) {
      clickDate.setHours(hour, minute || 0)
    }
    onDateClick(clickDate)
  }, [date, hour, minute, onDateClick])

  return (
    <div
      className={`drop-zone ${isValidDrop ? 'valid-drop' : 'invalid-drop'} ${isTargeted ? 'targeted' : ''}`}
      onClick={handleClick}
      data-date={date.toISOString()}
      data-hour={hour}
      data-minute={minute}
    >
      {children}
    </div>
  )
}

// Drag Ghost Component
const DragGhost: React.FC<{
  event: UnifiedCalendarEvent
  position: { x: number; y: number }
  canDrop: boolean
  dragMode: 'move' | 'resize-start' | 'resize-end' | null
}> = ({ event, position, canDrop, dragMode }) => (
  <div
    className={`drag-ghost ${canDrop ? 'can-drop' : 'cannot-drop'} ${dragMode}`}
    style={{
      position: 'fixed',
      left: position.x,
      top: position.y,
      zIndex: 9999,
      pointerEvents: 'none'
    }}
  >
    <div className={`event-preview provider-${event.provider}`}>
      <span className="event-title">{event.title}</span>
      <span className="event-time">
        {event.startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </span>
    </div>
  </div>
)

// Drop Zone Overlay Component
const DropZoneOverlay: React.FC<{
  targetTimeSlot: any
  canDrop: boolean
}> = ({ targetTimeSlot, canDrop }) => {
  if (!targetTimeSlot) return null

  return (
    <div className={`drop-zone-overlay ${canDrop ? 'valid' : 'invalid'}`}>
      <div className="drop-indicator">
        {canDrop ? '✓ Drop here' : '✗ Cannot drop here'}
      </div>
    </div>
  )
}

// Helper functions
function generateMonthDays(date: Date): Date[] {
  const year = date.getFullYear()
  const month = date.getMonth()
  const firstDay = new Date(year, month, 1)
  const startDate = new Date(firstDay)
  startDate.setDate(startDate.getDate() - startDate.getDay())
  
  const days = []
  for (let i = 0; i < 42; i++) {
    const day = new Date(startDate)
    day.setDate(startDate.getDate() + i)
    days.push(day)
  }
  
  return days
}

function generateWeekDays(date: Date): Date[] {
  const startOfWeek = new Date(date)
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay())
  
  const days = []
  for (let i = 0; i < 7; i++) {
    const day = new Date(startOfWeek)
    day.setDate(startOfWeek.getDate() + i)
    days.push(day)
  }
  
  return days
}

function isToday(date: Date): boolean {
  const today = new Date()
  return date.toDateString() === today.toDateString()
}

function isCurrentMonth(date: Date): boolean {
  const today = new Date()
  return date.getMonth() === today.getMonth()
}

function isCurrentHour(date: Date, hour: number): boolean {
  const now = new Date()
  return date.toDateString() === now.toDateString() && hour === now.getHours()
}

function formatHour(hour: number): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    hour12: true
  }).format(new Date(2000, 0, 1, hour))
}

function calculateEventHeight(event: UnifiedCalendarEvent): number {
  const duration = event.endTime.getTime() - event.startTime.getTime()
  const hours = duration / (1000 * 60 * 60)
  return Math.max(hours * 60, 20) // Minimum 20px height
}

function calculateEventTopOffset(event: UnifiedCalendarEvent, slotHour: number): number {
  const eventHour = event.startTime.getHours()
  const eventMinute = event.startTime.getMinutes()
  
  if (eventHour === slotHour) {
    return (eventMinute / 60) * 60 // 60px per hour
  }
  return 0
}

export default DragDropCalendar