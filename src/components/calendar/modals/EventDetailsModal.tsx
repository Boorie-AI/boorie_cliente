// Event Details Modal Component - View and edit event details

import React, { useState } from 'react'
import { useCalendarStore } from '../../../stores/calendarStore'
import EventModal from './EventModal'
import DeleteConfirmationModal from './DeleteConfirmationModal'
//import { UnifiedCalendarEvent } from '../../../types/calendar'
import '../../../styles/components.css';
import '../../../styles/modals.css';
import '../../../styles/calendar.css';
import '../../../styles/recurrence.css'

interface EventDetailsModalProps {
  isOpen: boolean
  onClose: () => void
  event: UnifiedCalendarEvent | null
}

const EventDetailsModal: React.FC<EventDetailsModalProps> = ({
  isOpen,
  onClose,
  event
}) => {
  const { deleteEvent, isLoading } = useCalendarStore()
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)

  if (!isOpen || !event) return null

  const formatDateTime = (date: Date, isAllDay: boolean) => {
    if (isAllDay) {
      return date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    }
    
    return date.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  }

  const formatDuration = (startTime: Date, endTime: Date, isAllDay: boolean) => {
    if (isAllDay) {
      const days = Math.ceil((endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60 * 24))
      return days === 1 ? 'All day' : `${days} days`
    }

    const duration = endTime.getTime() - startTime.getTime()
    const hours = Math.floor(duration / (1000 * 60 * 60))
    const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60))

    if (hours === 0) {
      return `${minutes} minutes`
    } else if (minutes === 0) {
      return `${hours} ${hours === 1 ? 'hour' : 'hours'}`
    } else {
      return `${hours}h ${minutes}m`
    }
  }

  const getProviderIcon = (provider: string) => {
    switch (provider) {
      case 'microsoft':
        return '🟦'
      case 'google':
        return '🔵'
      default:
        return '📅'
    }
  }

  const getMeetingIcon = (meetingProvider?: string) => {
    switch (meetingProvider) {
      case 'teams':
        return '📹'
      case 'meet':
        return '🎥'
      default:
        return '💻'
    }
  }

  const handleEdit = () => {
    setIsEditModalOpen(true)
  }

  const handleDelete = () => {
    setIsDeleteModalOpen(true)
  }

  const handleEditClose = () => {
    setIsEditModalOpen(false)
  }

  const handleDeleteClose = () => {
    setIsDeleteModalOpen(false)
  }

  const handleDeleteConfirm = async () => {
    try {
      await deleteEvent(event.id)
      setIsDeleteModalOpen(false)
      onClose()
    } catch (error) {
      console.error('Error deleting event:', error)
    }
  }

  const startTime = new Date(event.startTime)
  const endTime = new Date(event.endTime)

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content event-details-modal" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <div className="event-title-section">
              <div className="provider-indicator">
                {getProviderIcon(event.provider)}
                <span className="provider-name">{event.provider}</span>
              </div>
              <h2 className="event-title">{event.title}</h2>
            </div>
            <button className="modal-close" onClick={onClose}>
              <CloseIcon className="w-5 h-5" />
            </button>
          </div>

          <div className="event-details-content">
            {/* Date and Time */}
            <div className="detail-section">
              <div className="detail-item">
                <div className="detail-icon">
                  <CalendarIcon className="w-5 h-5" />
                </div>
                <div className="detail-content">
                  <div className="detail-label">When</div>
                  <div className="detail-value">
                    <div className="datetime-info">
                      <span className="start-time">
                        {formatDateTime(startTime, event.isAllDay)}
                      </span>
                      {!event.isAllDay && (
                        <>
                          <span className="time-separator"> - </span>
                          <span className="end-time">
                            {endTime.getDate() === startTime.getDate()
                              ? endTime.toLocaleTimeString('en-US', {
                                  hour: 'numeric',
                                  minute: '2-digit',
                                  hour12: true
                                })
                              : formatDateTime(endTime, false)
                            }
                          </span>
                        </>
                      )}
                    </div>
                    <div className="duration-info">
                      {formatDuration(startTime, endTime, event.isAllDay)}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Location */}
            {event.location && (
              <div className="detail-section">
                <div className="detail-item">
                  <div className="detail-icon">
                    <LocationIcon className="w-5 h-5" />
                  </div>
                  <div className="detail-content">
                    <div className="detail-label">Location</div>
                    <div className="detail-value">{event.location}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Online Meeting */}
            {event.hasOnlineMeeting && (
              <div className="detail-section">
                <div className="detail-item">
                  <div className="detail-icon">
                    <VideoIcon className="w-5 h-5" />
                  </div>
                  <div className="detail-content">
                    <div className="detail-label">Online Meeting</div>
                    <div className="detail-value">
                      <div className="meeting-info">
                        {getMeetingIcon(event.meetingProvider)}
                        <span className="meeting-provider">
                          {event.meetingProvider === 'teams' ? 'Microsoft Teams' : 'Google Meet'}
                        </span>
                      </div>
                      {event.meetingUrl && (
                        <a
                          href={event.meetingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="meeting-link"
                        >
                          Join Meeting
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Description */}
            {event.description && (
              <div className="detail-section">
                <div className="detail-item">
                  <div className="detail-icon">
                    <DocumentIcon className="w-5 h-5" />
                  </div>
                  <div className="detail-content">
                    <div className="detail-label">Description</div>
                    <div className="detail-value description-text">
                      {event.description}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Account Info */}
            <div className="detail-section">
              <div className="detail-item">
                <div className="detail-icon">
                  <UserIcon className="w-5 h-5" />
                </div>
                <div className="detail-content">
                  <div className="detail-label">Calendar</div>
                  <div className="detail-value">
                    <div className="account-info">
                      {getProviderIcon(event.provider)}
                      <span className="account-name">
                        {event.provider === 'microsoft' ? 'Microsoft Calendar' : 'Google Calendar'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Event ID (for debugging) */}
            <div className="detail-section metadata">
              <div className="detail-item">
                <div className="detail-content">
                  <div className="detail-label">Event ID</div>
                  <div className="detail-value event-id">{event.id}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <div className="footer-actions">
              <button
                className="btn btn-danger"
                onClick={handleDelete}
                disabled={isLoading.eventDeletion}
              >
                {isLoading.eventDeletion ? (
                  <>
                    <LoadingSpinner className="w-4 h-4" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <TrashIcon className="w-4 h-4" />
                    Delete
                  </>
                )}
              </button>
              <button
                className="btn btn-primary"
                onClick={handleEdit}
                disabled={isLoading.eventUpdate}
              >
                <EditIcon className="w-4 h-4" />
                Edit Event
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      <EventModal
        isOpen={isEditModalOpen}
        onClose={handleEditClose}
        event={event}
        mode="edit"
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={handleDeleteClose}
        onConfirm={handleDeleteConfirm}
        eventTitle={event.title}
        isLoading={isLoading.eventDeletion}
      />
    </>
  )
}

// Helper icon components
const CloseIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
)

const CalendarIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
)

const LocationIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
)

const VideoIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
)

const DocumentIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
)

const UserIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
)

const EditIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
  </svg>
)

const TrashIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
)

const LoadingSpinner: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={`animate-spin ${className}`} fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
)

export default EventDetailsModal