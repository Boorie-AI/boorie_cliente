// Calendar Navigation Component - Enhanced navigation controls

import React from 'react'

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
        return date.toLocaleDateString('es-ES', { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        })
      case 'week':
        const startOfWeek = new Date(date)
        // Calculate Monday-based week start (Monday = 1, Sunday = 0)
        const dayOfWeek = startOfWeek.getDay()
        const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1 // If Sunday (0), go back 6 days, otherwise go back (day - 1) days
        startOfWeek.setDate(startOfWeek.getDate() - daysToSubtract)
        
        const endOfWeek = new Date(startOfWeek)
        endOfWeek.setDate(startOfWeek.getDate() + 6)
        
        if (startOfWeek.getMonth() === endOfWeek.getMonth()) {
          return `${startOfWeek.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })} ${startOfWeek.getDate()}-${endOfWeek.getDate()}`
        } else {
          return `${startOfWeek.toLocaleDateString('es-ES', { month: 'short', day: 'numeric' })} - ${endOfWeek.toLocaleDateString('es-ES', { month: 'short', day: 'numeric', year: 'numeric' })}`
        }
      case 'month':
      default:
        return date.toLocaleDateString('es-ES', { 
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
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 border-b border-border/50">
      {/* Main navigation controls */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-1">
          <button 
            className="p-2 rounded-lg border border-border bg-background hover:bg-accent hover:border-accent-foreground/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            onClick={() => onDateNavigation('prev')}
            disabled={isLoading}
            title={stepText.prev}
            aria-label={stepText.prev}
          >
            <ChevronLeftIcon className="w-5 h-5" />
          </button>
          <button 
            className="p-2 rounded-lg border border-border bg-background hover:bg-accent hover:border-accent-foreground/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            onClick={() => onDateNavigation('next')}
            disabled={isLoading}
            title={stepText.next}
            aria-label={stepText.next}
          >
            <ChevronRightIcon className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold text-foreground">
            {formatDateRange(currentDate, currentView)}
          </h2>
        </div>
        
        <button 
          className={`px-3 py-2 text-sm font-medium rounded-lg border transition-all ${
            isTodayView 
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-background text-foreground border-border hover:bg-accent hover:border-accent-foreground/20'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
          onClick={onTodayClick}
          disabled={isLoading || isTodayView}
          title="Go to today"
        >
          {isTodayView ? 'Today' : 'Go to Today'}
        </button>
      </div>

      {/* View switcher */}
      <div className="flex items-center">
        <div className="flex items-center bg-muted rounded-lg p-1" role="tablist" aria-label="Calendar view">
          <button 
            className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-all ${
              currentView === 'month'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
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
            className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-all ${
              currentView === 'week'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
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
            className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-all ${
              currentView === 'day'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
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