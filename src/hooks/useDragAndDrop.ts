// Drag and Drop Hook - Event editing through drag and drop

import { useState, useCallback, useRef, useEffect } from 'react'
import { useCalendarStore } from '../stores/calendarStore'

export interface DragState {
  isDragging: boolean
  draggedEvent: UnifiedCalendarEvent | null
  dragOffset: { x: number; y: number }
  originalPosition: { x: number; y: number }
  ghostPosition: { x: number; y: number }
  targetDate: Date | null
  targetTimeSlot: { date: Date; hour?: number; minute?: number } | null
  canDrop: boolean
  dragMode: 'move' | 'resize-start' | 'resize-end' | null
}

export interface DragHandlers {
  onDragStart: (event: UnifiedCalendarEvent, dragMode: 'move' | 'resize-start' | 'resize-end', mouseEvent: React.MouseEvent) => void
  onDragMove: (mouseEvent: React.MouseEvent | MouseEvent) => void
  onDragEnd: (mouseEvent: React.MouseEvent | MouseEvent) => void
  onDragCancel: () => void
}

export interface DropZone {
  id: string
  date: Date
  hour?: number
  minute?: number
  bounds: DOMRect
  isValid: boolean
}

const DRAG_THRESHOLD = 5 // pixels before drag starts
const SNAP_THRESHOLD = 15 // pixels for snapping to time slots
const MIN_EVENT_DURATION = 15 // minimum 15 minutes

export const useDragAndDrop = (
  currentView: 'month' | 'week' | 'day',
  currentDate: Date,
  onEventUpdate: (eventId: string, updates: Partial<UnifiedCalendarEvent>) => Promise<void>
) => {
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    draggedEvent: null,
    dragOffset: { x: 0, y: 0 },
    originalPosition: { x: 0, y: 0 },
    ghostPosition: { x: 0, y: 0 },
    targetDate: null,
    targetTimeSlot: null,
    canDrop: false,
    dragMode: null
  })

  const [dropZones, setDropZones] = useState<DropZone[]>([])
  const dragStartPos = useRef({ x: 0, y: 0 })
  const hasStartedDrag = useRef(false)
  const calendarRef = useRef<HTMLElement | null>(null)

  const { updateEvent } = useCalendarStore()

  // Initialize drop zones based on current view
  useEffect(() => {
    updateDropZones()
  }, [currentView, currentDate])

  // Global mouse events for dragging
  useEffect(() => {
    if (dragState.isDragging) {
      const handleMouseMove = (e: MouseEvent) => onDragMove(e)
      const handleMouseUp = (e: MouseEvent) => onDragEnd(e)
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onDragCancel()
        }
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.addEventListener('keydown', handleKeyDown)

      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        document.removeEventListener('keydown', handleKeyDown)
      }
    }
  }, [dragState.isDragging])

  const updateDropZones = useCallback(() => {
    if (!calendarRef.current) return

    const zones: DropZone[] = []
    
    switch (currentView) {
      case 'month':
        zones.push(...generateMonthDropZones())
        break
      case 'week':
        zones.push(...generateWeekDropZones())
        break
      case 'day':
        zones.push(...generateDayDropZones())
        break
    }

    setDropZones(zones)
  }, [currentView, currentDate])

  const generateMonthDropZones = (): DropZone[] => {
    const zones: DropZone[] = []
    
    // Find all date cells in the month view
    const dateCells = calendarRef.current?.querySelectorAll('.month-cell')
    
    dateCells?.forEach((cell, index) => {
      const bounds = cell.getBoundingClientRect()
      const date = calculateDateForMonthCell(index)
      
      zones.push({
        id: `month-${index}`,
        date,
        bounds,
        isValid: true
      })
    })

    return zones
  }

  const generateWeekDropZones = (): DropZone[] => {
    const zones: DropZone[] = []
    
    // Find all time slots in week view
    const timeSlots = calendarRef.current?.querySelectorAll('.time-slot')
    
    timeSlots?.forEach((slot, index) => {
      const bounds = slot.getBoundingClientRect()
      const { date, hour } = calculateDateForWeekSlot(index)
      
      zones.push({
        id: `week-${index}`,
        date,
        hour,
        bounds,
        isValid: true
      })
    })

    return zones
  }

  const generateDayDropZones = (): DropZone[] => {
    const zones: DropZone[] = []
    
    // Generate zones for each 15-minute interval
    for (let hour = 0; hour < 24; hour++) {
      for (let minute = 0; minute < 60; minute += 15) {
        const slotElement = document.querySelector(`[data-time="${hour}:${minute}"]`)
        if (slotElement) {
          const bounds = slotElement.getBoundingClientRect()
          const date = new Date(currentDate)
          date.setHours(hour, minute, 0, 0)
          
          zones.push({
            id: `day-${hour}-${minute}`,
            date,
            hour,
            minute,
            bounds,
            isValid: true
          })
        }
      }
    }

    return zones
  }

  const onDragStart = useCallback((
    event: UnifiedCalendarEvent,
    dragMode: 'move' | 'resize-start' | 'resize-end',
    mouseEvent: React.MouseEvent
  ) => {
    mouseEvent.preventDefault()
    
    const rect = (mouseEvent.currentTarget as HTMLElement).getBoundingClientRect()
    const x = mouseEvent.clientX
    const y = mouseEvent.clientY
    
    dragStartPos.current = { x, y }
    hasStartedDrag.current = false
    
    setDragState({
      isDragging: false, // Will be set to true after threshold
      draggedEvent: event,
      dragOffset: {
        x: x - rect.left,
        y: y - rect.top
      },
      originalPosition: { x, y },
      ghostPosition: { x, y },
      targetDate: null,
      targetTimeSlot: null,
      canDrop: false,
      dragMode
    })
  }, [])

  const onDragMove = useCallback((mouseEvent: React.MouseEvent | MouseEvent) => {
    if (!dragState.draggedEvent) return

    const x = mouseEvent.clientX
    const y = mouseEvent.clientY
    
    // Check if we've moved enough to start dragging
    if (!hasStartedDrag.current) {
      const deltaX = Math.abs(x - dragStartPos.current.x)
      const deltaY = Math.abs(y - dragStartPos.current.y)
      
      if (deltaX > DRAG_THRESHOLD || deltaY > DRAG_THRESHOLD) {
        hasStartedDrag.current = true
        setDragState(prev => ({ ...prev, isDragging: true }))
        
        // Add dragging class to body
        document.body.classList.add('calendar-dragging')
      } else {
        return
      }
    }

    // Update ghost position
    const ghostPosition = {
      x: x - dragState.dragOffset.x,
      y: y - dragState.dragOffset.y
    }

    // Find target drop zone
    const targetZone = findDropZoneAt(x, y)
    const canDrop = targetZone ? isValidDrop(dragState.draggedEvent, targetZone, dragState.dragMode!) : false

    setDragState(prev => ({
      ...prev,
      ghostPosition,
      targetDate: targetZone?.date || null,
      targetTimeSlot: targetZone || null,
      canDrop
    }))
  }, [dragState.draggedEvent, dragState.dragOffset, dragState.dragMode])

  const onDragEnd = useCallback(async (mouseEvent: React.MouseEvent | MouseEvent) => {
    if (!dragState.isDragging || !dragState.draggedEvent) {
      // Clean up even if not dragging
      setDragState(prev => ({ ...prev, draggedEvent: null }))
      return
    }

    document.body.classList.remove('calendar-dragging')
    
    const x = mouseEvent.clientX
    const y = mouseEvent.clientY
    
    const targetZone = findDropZoneAt(x, y)
    const canDrop = targetZone ? isValidDrop(dragState.draggedEvent, targetZone, dragState.dragMode!) : false

    if (canDrop && targetZone) {
      try {
        const updates = calculateEventUpdates(dragState.draggedEvent, targetZone, dragState.dragMode!)
        
        // Transform attendees from EventAttendee[] to string[] for UpdateEventData
        const updateData: UpdateEventData = {
          ...updates,
          attendees: updates.attendees?.map(attendee => 
            typeof attendee === 'string' ? attendee : attendee.email
          )
        }
        
        await updateEvent(dragState.draggedEvent.id, updateData)
      } catch (error) {
        console.error('Failed to update event:', error)
        // Could show a toast notification here
      }
    }

    // Reset drag state
    setDragState({
      isDragging: false,
      draggedEvent: null,
      dragOffset: { x: 0, y: 0 },
      originalPosition: { x: 0, y: 0 },
      ghostPosition: { x: 0, y: 0 },
      targetDate: null,
      targetTimeSlot: null,
      canDrop: false,
      dragMode: null
    })
    
    hasStartedDrag.current = false
  }, [dragState, updateEvent])

  const onDragCancel = useCallback(() => {
    document.body.classList.remove('calendar-dragging')
    
    setDragState({
      isDragging: false,
      draggedEvent: null,
      dragOffset: { x: 0, y: 0 },
      originalPosition: { x: 0, y: 0 },
      ghostPosition: { x: 0, y: 0 },
      targetDate: null,
      targetTimeSlot: null,
      canDrop: false,
      dragMode: null
    })
    
    hasStartedDrag.current = false
  }, [])

  const findDropZoneAt = useCallback((x: number, y: number): DropZone | null => {
    return dropZones.find(zone => {
      const { bounds } = zone
      return x >= bounds.left && 
             x <= bounds.right && 
             y >= bounds.top && 
             y <= bounds.bottom
    }) || null
  }, [dropZones])

  const isValidDrop = useCallback((
    event: UnifiedCalendarEvent,
    targetZone: DropZone,
    dragMode: 'move' | 'resize-start' | 'resize-end'
  ): boolean => {
    if (!targetZone.isValid) return false

    // Check if the target date/time makes sense
    const currentStart = new Date(event.startTime)
    const currentEnd = new Date(event.endTime)
    const targetDate = new Date(targetZone.date)

    switch (dragMode) {
      case 'move':
        // Event can be moved to any valid date
        return true
        
      case 'resize-start':
        // New start time must be before current end time
        if (targetZone.hour !== undefined) {
          targetDate.setHours(targetZone.hour, targetZone.minute || 0)
        }
        return targetDate < currentEnd
        
      case 'resize-end':
        // New end time must be after current start time
        if (targetZone.hour !== undefined) {
          targetDate.setHours(targetZone.hour, targetZone.minute || 0)
        }
        return targetDate > currentStart
        
      default:
        return false
    }
  }, [])

  const calculateEventUpdates = useCallback((
    event: UnifiedCalendarEvent,
    targetZone: DropZone,
    dragMode: 'move' | 'resize-start' | 'resize-end'
  ): Partial<UnifiedCalendarEvent> => {
    const updates: Partial<UnifiedCalendarEvent> = {}
    const targetDate = new Date(targetZone.date)
    
    if (targetZone.hour !== undefined) {
      targetDate.setHours(targetZone.hour, targetZone.minute || 0, 0, 0)
    }

    switch (dragMode) {
      case 'move':
        const duration = event.endTime.getTime() - event.startTime.getTime()
        updates.startTime = targetDate
        updates.endTime = new Date(targetDate.getTime() + duration)
        break
        
      case 'resize-start':
        updates.startTime = targetDate
        // Ensure minimum duration
        const minEndTime = new Date(targetDate.getTime() + MIN_EVENT_DURATION * 60 * 1000)
        if (event.endTime < minEndTime) {
          updates.endTime = minEndTime
        }
        break
        
      case 'resize-end':
        updates.endTime = targetDate
        // Ensure minimum duration
        const minStartTime = new Date(targetDate.getTime() - MIN_EVENT_DURATION * 60 * 1000)
        if (event.startTime > minStartTime) {
          updates.startTime = minStartTime
        }
        break
    }

    return updates
  }, [])

  // Helper functions for calculating dates (simplified)
  const calculateDateForMonthCell = (index: number): Date => {
    // This would calculate the actual date for the month cell
    const date = new Date(currentDate)
    date.setDate(1)
    date.setDate(date.getDate() + index - date.getDay())
    return date
  }

  const calculateDateForWeekSlot = (index: number): { date: Date; hour: number } => {
    const dayIndex = Math.floor(index / 24)
    const hour = index % 24
    
    const date = new Date(currentDate)
    date.setDate(date.getDate() - date.getDay() + dayIndex)
    
    return { date, hour }
  }

  // Set calendar ref
  const setCalendarRef = useCallback((element: HTMLElement | null) => {
    calendarRef.current = element
    if (element) {
      updateDropZones()
    }
  }, [updateDropZones])

  const handlers: DragHandlers = {
    onDragStart,
    onDragMove,
    onDragEnd,
    onDragCancel
  }

  return {
    dragState,
    handlers,
    dropZones,
    setCalendarRef,
    updateDropZones
  }
}

export default useDragAndDrop