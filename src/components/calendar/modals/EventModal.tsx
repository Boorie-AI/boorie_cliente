// Event Modal Component - Create and edit calendar events

import React, { useState, useEffect } from 'react'
import { useCalendarStore } from '../../../stores/calendarStore'
//import { useAuthStore } from '../../../stores/authStore'
import RecurrenceEditor from '../RecurrenceEditor'
import '../../../styles/components.css';
import '../../../styles/modals.css';
import '../../../styles/recurrence.css';

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
  const { createEvent, updateEvent, connectedAccounts } = useCalendarStore()
  //const authStore = useAuthStore()

  // Get connected accounts that can create events
  const activeAccounts = connectedAccounts.filter(account =>
    account.isConnected && account.hasCalendarAccess
  )

  const [formData, setFormData] = useState<EventFormData>({
    title: '',
    description: '',
    location: '',
    startDate: '',
    startTime: '09:00',
    endDate: '',
    endTime: '10:00',
    isAllDay: false,
    provider: activeAccounts[0]?.provider || 'microsoft',
    accountId: activeAccounts[0]?.id || '',
    hasOnlineMeeting: false,
    meetingProvider: 'teams',
    recurrence: {
      type: 'none',
      interval: 1
    }
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Initialize form data when modal opens
  useEffect(() => {
    if (isOpen) {
      if (mode === 'edit' && event) {
        // Edit mode - populate with existing event data
        const startDate = new Date(event.startTime)
        const endDate = new Date(event.endTime)

        setFormData({
          title: event.title,
          description: event.description || '',
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
        })
      } else {
        // Create mode - use initial values
        const date = initialDate || new Date()
        const startDate = new Date(date)
        const endDate = new Date(date)

        if (initialHour !== undefined) {
          startDate.setHours(initialHour, initialMinute || 0, 0, 0)
          endDate.setHours(initialHour + 1, initialMinute || 0, 0, 0)
        }

        setFormData({
          title: '',
          description: '',
          location: '',
          startDate: startDate.toISOString().split('T')[0],
          startTime: `${initialHour.toString().padStart(2, '0')}:${(initialMinute || 0).toString().padStart(2, '0')}`,
          endDate: endDate.toISOString().split('T')[0],
          endTime: `${(initialHour + 1).toString().padStart(2, '0')}:${(initialMinute || 0).toString().padStart(2, '0')}`,
          isAllDay: false,
          provider: activeAccounts[0]?.provider || 'microsoft',
          accountId: activeAccounts[0]?.id || '',
          hasOnlineMeeting: false,
          meetingProvider: activeAccounts[0]?.provider === 'microsoft' ? 'teams' : 'meet',
          recurrence: {
            type: 'none',
            interval: 1
          }
        })
      }
      setErrors({})
    }
  }, [isOpen, mode, event, initialDate, initialHour, initialMinute, activeAccounts])

  // Update meeting provider when account changes
  useEffect(() => {
    const selectedAccount = activeAccounts.find(acc => acc.id === formData.accountId)
    if (selectedAccount) {
      setFormData(prev => ({
        ...prev,
        provider: selectedAccount.provider,
        meetingProvider: selectedAccount.provider === 'microsoft' ? 'teams' : 'meet'
      }))
    }
  }, [formData.accountId, activeAccounts])

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    // Required fields
    if (!formData.title.trim()) {
      newErrors.title = 'Event title is required'
    }

    if (!formData.accountId) {
      newErrors.accountId = 'Please select an account'
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

        if (endDateTime <= startDateTime) {
          newErrors.endTime = 'End time must be after start time'
        }
      }
    } else {
      // All-day event validation
      if (formData.startDate && formData.endDate) {
        const startDate = new Date(formData.startDate)
        const endDate = new Date(formData.endDate)

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
        await updateEvent(event.id, eventData)
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

  const handleInputChange = (field: keyof EventFormData, value: any) => {
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
  }

  const handleClose = () => {
    setFormData({
      title: '',
      description: '',
      location: '',
      startDate: '',
      startTime: '09:00',
      endDate: '',
      endTime: '10:00',
      isAllDay: false,
      provider: activeAccounts[0]?.provider || 'microsoft',
      accountId: activeAccounts[0]?.id || '',
      hasOnlineMeeting: false,
      meetingProvider: 'teams',
      recurrence: {
        type: 'none',
        interval: 1
      }
    })
    setErrors({})
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content event-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{mode === 'edit' ? 'Edit Event' : 'Create New Event'}</h2>
          <button className="modal-close" onClick={handleClose}>
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="event-form">
          <div className="form-section">
            {/* Event Title */}
            <div className="form-group">
              <label htmlFor="title" className="form-label required">
                Event Title
              </label>
              <input
                type="text"
                id="title"
                className={`form-input ${errors.title ? 'error' : ''}`}
                value={formData.title}
                onChange={e => handleInputChange('title', e.target.value)}
                placeholder="Enter event title"
                maxLength={255}
              />
              {errors.title && <span className="error-message">{errors.title}</span>}
            </div>

            {/* Account Selection */}
            <div className="form-group">
              <label htmlFor="accountId" className="form-label required">
                Calendar Account
              </label>
              <select
                id="accountId"
                className={`form-select ${errors.accountId ? 'error' : ''}`}
                value={formData.accountId}
                onChange={e => handleInputChange('accountId', e.target.value)}
              >
                <option value="">Select an account</option>
                {activeAccounts.map(account => (
                  <option key={account.id} value={account.id}>
                    {account.name} ({account.email}) - {account.provider}
                  </option>
                ))}
              </select>
              {errors.accountId && <span className="error-message">{errors.accountId}</span>}
            </div>
          </div>

          <div className="form-section">
            {/* All Day Toggle */}
            <div className="form-group">
              <label className="form-checkbox">
                <input
                  type="checkbox"
                  checked={formData.isAllDay}
                  onChange={e => handleInputChange('isAllDay', e.target.checked)}
                />
                <span className="checkbox-label">All day event</span>
              </label>
            </div>

            {/* Date and Time */}
            <div className="datetime-group">
              <div className="datetime-row">
                <div className="form-group">
                  <label htmlFor="startDate" className="form-label required">
                    Start Date
                  </label>
                  <input
                    type="date"
                    id="startDate"
                    className={`form-input ${errors.startDate ? 'error' : ''}`}
                    value={formData.startDate}
                    onChange={e => handleInputChange('startDate', e.target.value)}
                  />
                  {errors.startDate && <span className="error-message">{errors.startDate}</span>}
                </div>

                {!formData.isAllDay && (
                  <div className="form-group">
                    <label htmlFor="startTime" className="form-label required">
                      Start Time
                    </label>
                    <input
                      type="time"
                      id="startTime"
                      className={`form-input ${errors.startTime ? 'error' : ''}`}
                      value={formData.startTime}
                      onChange={e => handleInputChange('startTime', e.target.value)}
                    />
                    {errors.startTime && <span className="error-message">{errors.startTime}</span>}
                  </div>
                )}
              </div>

              <div className="datetime-row">
                <div className="form-group">
                  <label htmlFor="endDate" className="form-label required">
                    End Date
                  </label>
                  <input
                    type="date"
                    id="endDate"
                    className={`form-input ${errors.endDate ? 'error' : ''}`}
                    value={formData.endDate}
                    onChange={e => handleInputChange('endDate', e.target.value)}
                  />
                  {errors.endDate && <span className="error-message">{errors.endDate}</span>}
                </div>

                {!formData.isAllDay && (
                  <div className="form-group">
                    <label htmlFor="endTime" className="form-label required">
                      End Time
                    </label>
                    <input
                      type="time"
                      id="endTime"
                      className={`form-input ${errors.endTime ? 'error' : ''}`}
                      value={formData.endTime}
                      onChange={e => handleInputChange('endTime', e.target.value)}
                    />
                    {errors.endTime && <span className="error-message">{errors.endTime}</span>}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="form-section">
            {/* Description */}
            <div className="form-group">
              <label htmlFor="description" className="form-label">
                Description
              </label>
              <textarea
                id="description"
                className="form-textarea"
                value={formData.description}
                onChange={e => handleInputChange('description', e.target.value)}
                placeholder="Enter event description (optional)"
                rows={3}
                maxLength={1000}
              />
            </div>

            {/* Location */}
            <div className="form-group">
              <label htmlFor="location" className="form-label">
                Location
              </label>
              <input
                type="text"
                id="location"
                className="form-input"
                value={formData.location}
                onChange={e => handleInputChange('location', e.target.value)}
                placeholder="Enter location (optional)"
                maxLength={255}
              />
            </div>
          </div>

          <div className="form-section">
            {/* Online Meeting */}
            <div className="form-group">
              <label className="form-checkbox">
                <input
                  type="checkbox"
                  checked={formData.hasOnlineMeeting}
                  onChange={e => handleInputChange('hasOnlineMeeting', e.target.checked)}
                />
                <span className="checkbox-label">
                  Add {formData.provider === 'microsoft' ? 'Teams' : 'Google Meet'} meeting
                </span>
              </label>
            </div>

            {/* Recurrence */}
            <div className="form-group">
              <RecurrenceEditor
                value={formData.recurrence || { type: 'none', interval: 1 }}
                onChange={(recurrence) => handleInputChange('recurrence', recurrence)}
                startDate={new Date(`${formData.startDate}T${formData.startTime}`)}
              />
            </div>
          </div>

          {errors.submit && (
            <div className="error-message submit-error">{errors.submit}</div>
          )}

          <div className="modal-footer">
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
                mode === 'edit' ? 'Update Event' : 'Create Event'
              )}
            </button>
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