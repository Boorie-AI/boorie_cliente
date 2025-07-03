// Event Modal Component - Create and edit calendar events

import React, { useState, useEffect, useCallback } from 'react'
import { useCalendarStore } from '../../../stores/calendarStore'
import RecurrenceEditor from '../RecurrenceEditor'

// Utility function to strip HTML tags and decode HTML entities
const stripHtml = (html: string): string => {
  if (!html) return ''
  
  // Create a temporary div element to parse HTML
  const tempDiv = document.createElement('div')
  tempDiv.innerHTML = html
  
  // Get text content (this removes all HTML tags)
  const textContent = tempDiv.textContent || tempDiv.innerText || ''
  
  // Clean up extra whitespace and line breaks
  return textContent.replace(/\s+/g, ' ').trim()
}

interface EventFormData {
  title: string
  description: string
  location: string
  startDate: string
  startTime: string
  endDate: string
  endTime: string
  isAllDay: boolean
  provider: 'microsoft' | 'google'
  accountId: string
  hasOnlineMeeting: boolean
  meetingProvider: 'teams' | 'meet' | 'other'
  recurrence?: {
    type: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'
    interval: number
    endDate?: string
    count?: number
  }
}

interface EventModalProps {
  isOpen: boolean
  onClose: () => void
  event?: UnifiedCalendarEvent | null
  initialDate?: Date
  initialHour?: number
  initialMinute?: number
  mode: 'create' | 'edit'
}

const EventModal: React.FC<EventModalProps> = ({
  isOpen,
  onClose,
  event,
  initialDate,
  initialHour = 9,
  initialMinute = 0,
  mode
}) => {
  const { createEvent, updateEvent, addTeamsToEvent, addMeetToEvent, connectedAccounts } = useCalendarStore()

  // Get connected accounts that can create events
  const activeAccounts = connectedAccounts.filter(account =>
    account.isConnected && account.hasCalendarAccess
  )

  // Create initial form data
  const createInitialFormData = useCallback((): EventFormData => {
    const { selectedAccount } = useCalendarStore.getState()
    const defaultAccount = activeAccounts.find(acc => acc.id === selectedAccount) || activeAccounts[0]
    
    if (mode === 'edit' && event) {
      // Edit mode - populate with existing event data
      const startDate = new Date(event.startTime)
      const endDate = new Date(event.endTime)

      return {
        title: event.title,
        description: stripHtml(event.description || ''),
        location: event.location || '',
        startDate: startDate.toISOString().split('T')[0],
        startTime: event.isAllDay ? '09:00' : startDate.toTimeString().slice(0, 5),
        endDate: endDate.toISOString().split('T')[0],
        endTime: event.isAllDay ? '10:00' : endDate.toTimeString().slice(0, 5),
        isAllDay: event.isAllDay,
        provider: event.provider,
        accountId: event.accountId,
        hasOnlineMeeting: event.hasOnlineMeeting,
        meetingProvider: event.meetingProvider || 'teams',
        recurrence: {
          type: 'none',
          interval: 1
        }
      }
    } else {
      // Create mode - use initial values or current time
      const now = new Date()
      const date = initialDate || now
      const startDate = new Date(date)
      const endDate = new Date(date)

      // If no initial hour provided or initial hour is in the past, use current time
      let startHour = initialHour
      let startMinute = initialMinute || 0

      if (initialHour === undefined || (date.toDateString() === now.toDateString() && initialHour <= now.getHours())) {
        startHour = now.getHours()
        startMinute = now.getMinutes()
        // Round to next 15-minute interval
        startMinute = Math.ceil(startMinute / 15) * 15
        if (startMinute >= 60) {
          startHour += 1
          startMinute = 0
        }
      }

      startDate.setHours(startHour, startMinute, 0, 0)
      endDate.setHours(startHour + 1, startMinute, 0, 0)

      return {
        title: '',
        description: '',
        location: '',
        startDate: startDate.toISOString().split('T')[0],
        startTime: `${startHour.toString().padStart(2, '0')}:${startMinute.toString().padStart(2, '0')}`,
        endDate: endDate.toISOString().split('T')[0],
        endTime: `${(startHour + 1).toString().padStart(2, '0')}:${startMinute.toString().padStart(2, '0')}`,
        isAllDay: false,
        provider: defaultAccount?.provider || 'microsoft',
        accountId: defaultAccount?.id || '',
        hasOnlineMeeting: false,
        meetingProvider: defaultAccount?.provider === 'microsoft' ? 'teams' : 'meet',
        recurrence: {
          type: 'none',
          interval: 1
        }
      }
    }
  }, [mode, event, initialDate, initialHour, initialMinute, activeAccounts])

  const [formData, setFormData] = useState<EventFormData>(createInitialFormData())
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Reset form when modal opens/closes or mode changes
  useEffect(() => {
    if (isOpen) {
      setFormData(createInitialFormData())
      setErrors({})
    }
  }, [isOpen, mode, event?.id])

  // Update meeting provider when account changes
  useEffect(() => {
    const selectedAccount = activeAccounts.find(acc => acc.id === formData.accountId)
    if (selectedAccount && selectedAccount.provider !== formData.provider) {
      setFormData(prev => ({
        ...prev,
        provider: selectedAccount.provider,
        meetingProvider: selectedAccount.provider === 'microsoft' ? 'teams' : 'meet'
      }))
    }
  }, [formData.accountId, formData.provider, activeAccounts])

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}
    const now = new Date()

    // Required fields
    if (!formData.title.trim()) {
      newErrors.title = 'Event title is required'
    }

    // Account validation - ensure we have a valid account
    if (!formData.accountId && activeAccounts.length === 0) {
      newErrors.accountId = 'No calendar account available'
    }

    if (!formData.startDate) {
      newErrors.startDate = 'Start date is required'
    }

    if (!formData.endDate) {
      newErrors.endDate = 'End date is required'
    }

    if (!formData.isAllDay) {
      if (!formData.startTime) {
        newErrors.startTime = 'Start time is required'
      }
      if (!formData.endTime) {
        newErrors.endTime = 'End time is required'
      }

      // Validate time logic
      if (formData.startDate && formData.endDate && formData.startTime && formData.endTime) {
        const startDateTime = new Date(`${formData.startDate}T${formData.startTime}`)
        const endDateTime = new Date(`${formData.endDate}T${formData.endTime}`)

        // Check if start date/time is in the past (only for new events)
        if (mode === 'create' && startDateTime < now) {
          newErrors.startTime = 'Cannot create events in the past'
          newErrors.startDate = 'Cannot create events in the past'
        }

        if (endDateTime <= startDateTime) {
          newErrors.endTime = 'End time must be after start time'
        }
      }
    } else {
      // All-day event validation
      if (formData.startDate && formData.endDate) {
        const startDate = new Date(formData.startDate)
        const endDate = new Date(formData.endDate)
        const today = new Date()
        today.setHours(0, 0, 0, 0)

        // Check if start date is in the past (only for new events)
        if (mode === 'create' && startDate < today) {
          newErrors.startDate = 'Cannot create events in the past'
        }

        if (endDate < startDate) {
          newErrors.endDate = 'End date must be on or after start date'
        }
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    setIsSubmitting(true)

    try {
      // Convert recurrence data to match EventRecurrence type
      let recurrenceData: EventRecurrence | undefined = undefined

      if (formData.recurrence?.type !== 'none') {
        recurrenceData = {
          type: formData.recurrence!.type as 'daily' | 'weekly' | 'monthly' | 'yearly',
          interval: formData.recurrence!.interval,
          endDate: formData.recurrence!.endDate ? new Date(formData.recurrence!.endDate) : undefined,
          count: formData.recurrence!.count
        }
      }

      const eventData: CreateEventData = {
        accountId: formData.accountId,
        title: formData.title.trim(),
        description: formData.description.trim(),
        location: formData.location.trim(),
        isAllDay: formData.isAllDay,
        startTime: formData.isAllDay
          ? new Date(`${formData.startDate}T00:00:00`)
          : new Date(`${formData.startDate}T${formData.startTime}`),
        endTime: formData.isAllDay
          ? new Date(`${formData.endDate}T23:59:59`)
          : new Date(`${formData.endDate}T${formData.endTime}`),
        isTeamsMeeting: formData.hasOnlineMeeting && formData.meetingProvider === 'teams',
        isGoogleMeet: formData.hasOnlineMeeting && formData.meetingProvider === 'meet'
      }

      if (mode === 'edit' && event) {
        // Update the basic event details first
        await updateEvent(event.id, eventData)
        
        // Handle meeting integration for edit mode
        const wasOnlineMeeting = event.hasOnlineMeeting
        const isNowOnlineMeeting = formData.hasOnlineMeeting
        
        // If user wants to add a meeting to an existing event without one
        if (!wasOnlineMeeting && isNowOnlineMeeting) {
          if (formData.meetingProvider === 'teams' && formData.provider === 'microsoft') {
            await addTeamsToEvent(formData.accountId, event.id)
          } else if (formData.meetingProvider === 'meet' && formData.provider === 'google') {
            await addMeetToEvent(formData.accountId, event.id)
          }
        }
      } else {
        await createEvent(eventData)
      }

      onClose()
    } catch (error) {
      console.error('Error saving event:', error)
      setErrors({ submit: 'Failed to save event. Please try again.' })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleInputChange = useCallback((field: keyof EventFormData, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))

    // Clear field error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: ''
      }))
    }
  }, [])

  const handleClose = useCallback(() => {
    setFormData(createInitialFormData())
    setErrors({})
    onClose()
  }, [createInitialFormData, onClose])

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose()
    }
  }, [handleClose])

  if (!isOpen) return null

  return (
    <div className="modal-overlay" style={{ zIndex: 60 }} onClick={handleBackdropClick}>
      <div className="modal-content event-modal" onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="event-title-section">
            <h2 className="event-title">{mode === 'edit' ? 'Edit Event' : 'Create New Event'}</h2>
          </div>
          <button className="modal-close" onClick={handleClose}>
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="event-form">
          <div className="event-details-content overflow-y-auto">
            <div className="detail-section">
              {/* Event Title */}
              <div className="detail-item">
                <div className="detail-content">
                  <div className="detail-label">Event Title <span className="required">*</span></div>
                  <input
                    type="text"
                    id="title"
                    name="title"
                    className={`form-input ${errors.title ? 'error' : ''}`}
                    value={formData.title || ''}
                    onChange={e => handleInputChange('title', e.target.value)}
                    placeholder="Enter event title"
                    maxLength={255}
                    autoComplete="off"
                  />
                  {errors.title && <span className="error-message">{errors.title}</span>}
                </div>
              </div>

              {/* Hidden account ID field */}
              <input
                type="hidden"
                name="accountId"
                value={formData.accountId}
              />
              {errors.accountId && <span className="error-message">{errors.accountId}</span>}
            </div>

            <div className="detail-section">
              {/* All Day Toggle */}
              <div className="detail-item">
                <div className="detail-content">
                  <div className="checkbox-wrapper">
                    <input
                      type="checkbox"
                      id="isAllDay"
                      name="isAllDay"
                      checked={formData.isAllDay}
                      onChange={e => handleInputChange('isAllDay', e.target.checked)}
                      className="form-checkbox"
                    />
                    <label htmlFor="isAllDay" className="checkbox-label">All day event</label>
                  </div>
                </div>
              </div>

              {/* Date and Time */}
              <div className="datetime-grid">
                <div className="detail-item">
                  <div className="detail-content">
                    <div className="detail-label">Start Date <span className="required">*</span></div>
                    <input
                      type="date"
                      id="startDate"
                      name="startDate"
                      className={`form-input ${errors.startDate ? 'error' : ''}`}
                      value={formData.startDate}
                      onChange={e => handleInputChange('startDate', e.target.value)}
                    />
                    {errors.startDate && <span className="error-message">{errors.startDate}</span>}
                  </div>
                </div>

                {!formData.isAllDay && (
                  <div className="detail-item">
                    <div className="detail-content">
                      <div className="detail-label">Start Time <span className="required">*</span></div>
                      <input
                        type="time"
                        id="startTime"
                        name="startTime"
                        className={`form-input ${errors.startTime ? 'error' : ''}`}
                        value={formData.startTime}
                        onChange={e => handleInputChange('startTime', e.target.value)}
                      />
                      {errors.startTime && <span className="error-message">{errors.startTime}</span>}
                    </div>
                  </div>
                )}
              </div>

              <div className="datetime-grid">
                <div className="detail-item">
                  <div className="detail-content">
                    <div className="detail-label">End Date <span className="required">*</span></div>
                    <input
                      type="date"
                      id="endDate"
                      name="endDate"
                      className={`form-input ${errors.endDate ? 'error' : ''}`}
                      value={formData.endDate}
                      onChange={e => handleInputChange('endDate', e.target.value)}
                    />
                    {errors.endDate && <span className="error-message">{errors.endDate}</span>}
                  </div>
                </div>

                {!formData.isAllDay && (
                  <div className="detail-item">
                    <div className="detail-content">
                      <div className="detail-label">End Time <span className="required">*</span></div>
                      <input
                        type="time"
                        id="endTime"
                        name="endTime"
                        className={`form-input ${errors.endTime ? 'error' : ''}`}
                        value={formData.endTime}
                        onChange={e => handleInputChange('endTime', e.target.value)}
                      />
                      {errors.endTime && <span className="error-message">{errors.endTime}</span>}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="detail-section">
              {/* Description */}
              <div className="detail-item">
                <div className="detail-content">
                  <div className="detail-label">Description</div>
                  <textarea
                    id="description"
                    name="description"
                    className="form-textarea"
                    value={formData.description}
                    onChange={e => handleInputChange('description', e.target.value)}
                    placeholder="Enter event description (optional)"
                    rows={3}
                    maxLength={1000}
                  />
                </div>
              </div>

              {/* Location */}
              <div className="detail-item">
                <div className="detail-content">
                  <div className="detail-label">Location</div>
                  <input
                    type="text"
                    id="location"
                    name="location"
                    className="form-input"
                    value={formData.location}
                    onChange={e => handleInputChange('location', e.target.value)}
                    placeholder="Enter location (optional)"
                    maxLength={255}
                    autoComplete="off"
                  />
                </div>
              </div>
            </div>

            <div className="detail-section">
              {/* Online Meeting */}
              <div className="detail-item">
                <div className="detail-content">
                  <div className="checkbox-wrapper">
                    <input
                      type="checkbox"
                      id="hasOnlineMeeting"
                      name="hasOnlineMeeting"
                      checked={formData.hasOnlineMeeting}
                      onChange={e => handleInputChange('hasOnlineMeeting', e.target.checked)}
                      className="form-checkbox"
                    />
                    <label htmlFor="hasOnlineMeeting" className="checkbox-label">
                      Add {formData.provider === 'microsoft' ? 'Teams' : 'Google Meet'} meeting
                    </label>
                  </div>
                </div>
              </div>

              {/* Recurrence */}
              <div className="detail-item">
                <div className="detail-content">
                  <RecurrenceEditor
                    value={formData.recurrence || { type: 'none', interval: 1 }}
                    onChange={(recurrence) => handleInputChange('recurrence', recurrence)}
                    startDate={new Date(`${formData.startDate}T${formData.startTime}`)}
                  />
                </div>
              </div>
            </div>

            {errors.submit && (
              <div className="error-banner">{errors.submit}</div>
            )}
          </div>

          <div className="modal-footer">
            <div className="footer-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleClose}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSubmitting || activeAccounts.length === 0}
              >
                {isSubmitting ? (
                  <>
                    <LoadingSpinner className="w-4 h-4" />
                    {mode === 'edit' ? 'Updating...' : 'Creating...'}
                  </>
                ) : (
                  <>
                    {mode === 'edit' ? 'Update Event' : 'Create Event'}
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

// Helper components
const CloseIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
)

const LoadingSpinner: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={`animate-spin ${className}`} fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
)

export default EventModal