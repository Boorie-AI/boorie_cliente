// Calendar Navigation Component - Enhanced navigation controls

import React from 'react'
import '../../styles/components.css';
import '../../styles/modals.css';
import '../../styles/recurrence.css';

interface CalendarNavigationProps {
  currentDate: Date
  currentView: 'month' | 'week' | 'day'
  isLoading: boolean
  onDateNavigation: (direction: 'prev' | 'next') => void
  onViewChange: (view: 'month' | 'week' | 'day') => void
  onTodayClick: () => void
  onDateSelect: (date: Date) => void
}

const CalendarNavigation: React.FC<CalendarNavigationProps> = ({
  currentDate,
  currentView,
  isLoading,
  onDateNavigation,
  onViewChange,
  onTodayClick,
  onDateSelect
}) => {
  // Format date range for display
  const formatDateRange = (date: Date, view: 'month' | 'week' | 'day') => {
    switch (view) {
      case 'day':
        return date.toLocaleDateString('en-US', { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        })
      case 'week':
        const startOfWeek = new Date(date)
        startOfWeek.setDate(date.getDate() - date.getDay())
        const endOfWeek = new Date(startOfWeek)
        endOfWeek.setDate(startOfWeek.getDate() + 6)
        
        if (startOfWeek.getMonth() === endOfWeek.getMonth()) {
          return `${startOfWeek.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} ${startOfWeek.getDate()}-${endOfWeek.getDate()}`
        } else {
          return `${startOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
        }
      case 'month':
      default:
        return date.toLocaleDateString('en-US', { 
          year: 'numeric',
          month: 'long'
        })
    }
  }

  // Get navigation step text
  const getNavigationStepText = (view: 'month' | 'week' | 'day') => {
    switch (view) {
      case 'day':
        return { prev: 'Previous day', next: 'Next day' }
      case 'week':
        return { prev: 'Previous week', next: 'Next week' }
      case 'month':
      default:
        return { prev: 'Previous month', next: 'Next month' }
    }
  }

  // Check if date is today
  const isToday = (date: Date) => {
    const today = new Date()
    return (
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate()
    )
  }

  const stepText = getNavigationStepText(currentView)
  const isTodayView = isToday(currentDate)

  return (
    <div className="calendar-navigation">
      {/* Main navigation controls */}
      <div className="nav-main-controls">
        <div className="nav-buttons">
          <button 
            className="nav-btn nav-prev"
            onClick={() => onDateNavigation('prev')}
            disabled={isLoading}
            title={stepText.prev}
            aria-label={stepText.prev}
          >
            <ChevronLeftIcon className="w-5 h-5" />
          </button>
          <button 
            className="nav-btn nav-next"
            onClick={() => onDateNavigation('next')}
            disabled={isLoading}
            title={stepText.next}
            aria-label={stepText.next}
          >
            <ChevronRightIcon className="w-5 h-5" />
          </button>
        </div>
        
        <div className="current-date-display">
          <h2 className="date-title">
            {formatDateRange(currentDate, currentView)}
          </h2>
        </div>
        
        <button 
          className={`today-btn ${isTodayView ? 'is-today' : ''}`}
          onClick={onTodayClick}
          disabled={isLoading || isTodayView}
          title="Go to today"
        >
          {isTodayView ? 'Today' : 'Go to Today'}
        </button>
      </div>

      {/* View switcher */}
      <div className="view-switcher">
        <div className="view-buttons" role="tablist" aria-label="Calendar view">
          <button 
            className={`view-btn ${currentView === 'month' ? 'active' : ''}`}
            onClick={() => onViewChange('month')}
            disabled={isLoading}
            role="tab"
            aria-selected={currentView === 'month'}
            aria-controls="calendar-content"
          >
            <CalendarIcon className="w-4 h-4" />
            <span>Month</span>
          </button>
          <button 
            className={`view-btn ${currentView === 'week' ? 'active' : ''}`}
            onClick={() => onViewChange('week')}
            disabled={isLoading}
            role="tab"
            aria-selected={currentView === 'week'}
            aria-controls="calendar-content"
          >
            <ViewWeekIcon className="w-4 h-4" />
            <span>Week</span>
          </button>
          <button 
            className={`view-btn ${currentView === 'day' ? 'active' : ''}`}
            onClick={() => onViewChange('day')}
            disabled={isLoading}
            role="tab"
            aria-selected={currentView === 'day'}
            aria-controls="calendar-content"
          >
            <ViewDayIcon className="w-4 h-4" />
            <span>Day</span>
          </button>
        </div>
      </div>

      {/* Quick navigation */}
      <div className="quick-navigation">
        <QuickDatePicker 
          currentDate={currentDate}
          onDateSelect={onDateSelect}
          disabled={isLoading}
        />
      </div>
    </div>
  )
}

// Quick date picker component
interface QuickDatePickerProps {
  currentDate: Date
  onDateSelect: (date: Date) => void
  disabled: boolean
}

const QuickDatePicker: React.FC<QuickDatePickerProps> = ({
  currentDate,
  onDateSelect,
  disabled
}) => {
  const handleDateChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedDate = new Date(event.target.value)
    if (!isNaN(selectedDate.getTime())) {
      onDateSelect(selectedDate)
    }
  }

  // Format date for input value (YYYY-MM-DD)
  const formatDateForInput = (date: Date) => {
    return date.toISOString().split('T')[0]
  }

  return (
    <div className="quick-date-picker">
      <label htmlFor="date-picker" className="sr-only">
        Select date
      </label>
      <input
        id="date-picker"
        type="date"
        value={formatDateForInput(currentDate)}
        onChange={handleDateChange}
        disabled={disabled}
        className="date-input"
        title="Select date"
      />
      <CalendarSelectorIcon className="date-picker-icon" />
    </div>
  )
}

// Icon components
const ChevronLeftIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
  </svg>
)

const ChevronRightIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
)

const CalendarIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
)

const ViewWeekIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
  </svg>
)

const ViewDayIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
  </svg>
)

const CalendarSelectorIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
)

export default CalendarNavigation