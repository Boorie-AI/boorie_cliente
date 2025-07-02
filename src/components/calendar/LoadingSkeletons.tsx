// Loading Skeletons and Animations - Enhanced loading states for calendar

import React from 'react'

interface SkeletonProps {
  width?: string | number
  height?: string | number
  borderRadius?: string | number
  className?: string
  animate?: boolean
}

interface CalendarSkeletonProps {
  view: 'month' | 'week' | 'day'
  showHeader?: boolean
  showSidebar?: boolean
}

interface EventSkeletonProps {
  count?: number
  showDetails?: boolean
  size?: 'sm' | 'md' | 'lg'
}

interface ProgressBarProps {
  progress: number
  label?: string
  showPercentage?: boolean
  color?: 'blue' | 'green' | 'yellow' | 'red'
  size?: 'sm' | 'md' | 'lg'
  animated?: boolean
}

// Base Skeleton Component
export const Skeleton: React.FC<SkeletonProps> = ({
  width = '100%',
  height = '1rem',
  borderRadius = '0.25rem',
  className = '',
  animate = true
}) => {
  const style = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
    borderRadius: typeof borderRadius === 'number' ? `${borderRadius}px` : borderRadius
  }

  return (
    <div 
      className={`skeleton ${animate ? 'skeleton-animate' : ''} ${className}`}
      style={style}
    />
  )
}

// Calendar View Skeletons
export const CalendarSkeleton: React.FC<CalendarSkeletonProps> = ({
  view,
  showHeader = true,
  showSidebar = true
}) => {
  return (
    <div className="calendar-skeleton">
      {/* Sidebar Skeleton */}
      {showSidebar && <SidebarSkeleton />}
      
      <div className="calendar-main-skeleton">
        {/* Header Skeleton */}
        {showHeader && <CalendarHeaderSkeleton />}
        
        {/* View-specific Skeleton */}
        <div className="calendar-content-skeleton">
          {view === 'month' && <MonthViewSkeleton />}
          {view === 'week' && <WeekViewSkeleton />}
          {view === 'day' && <DayViewSkeleton />}
        </div>
      </div>
    </div>
  )
}

// Sidebar Skeleton
const SidebarSkeleton: React.FC = () => (
  <div className="sidebar-skeleton">
    <div className="sidebar-header-skeleton">
      <Skeleton width="70%" height="1.5rem" />
    </div>
    
    <div className="account-list-skeleton">
      {Array(3).fill(0).map((_, index) => (
        <div key={index} className="account-card-skeleton">
          <div className="account-avatar-skeleton">
            <Skeleton width="2.5rem" height="2.5rem" borderRadius="50%" />
          </div>
          <div className="account-info-skeleton">
            <Skeleton width="80%" height="1rem" />
            <Skeleton width="60%" height="0.75rem" />
          </div>
          <div className="account-status-skeleton">
            <Skeleton width="1rem" height="1rem" borderRadius="50%" />
          </div>
        </div>
      ))}
    </div>
  </div>
)

// Calendar Header Skeleton
const CalendarHeaderSkeleton: React.FC = () => (
  <div className="calendar-header-skeleton">
    <div className="header-navigation-skeleton">
      <Skeleton width="2rem" height="2rem" borderRadius="0.5rem" />
      <Skeleton width="8rem" height="1.5rem" />
      <Skeleton width="2rem" height="2rem" borderRadius="0.5rem" />
    </div>
    
    <div className="header-actions-skeleton">
      <Skeleton width="6rem" height="2rem" borderRadius="0.25rem" />
      <Skeleton width="2rem" height="2rem" borderRadius="0.25rem" />
    </div>
  </div>
)

// Month View Skeleton
const MonthViewSkeleton: React.FC = () => (
  <div className="month-view-skeleton">
    {/* Days of week header */}
    <div className="month-header-skeleton">
      {Array(7).fill(0).map((_, index) => (
        <div key={index} className="day-header-skeleton">
          <Skeleton width="2rem" height="1rem" />
        </div>
      ))}
    </div>
    
    {/* Calendar grid */}
    <div className="month-grid-skeleton">
      {Array(42).fill(0).map((_, index) => (
        <div key={index} className="month-cell-skeleton">
          <div className="cell-date-skeleton">
            <Skeleton width="1.5rem" height="1.5rem" borderRadius="50%" />
          </div>
          <div className="cell-events-skeleton">
            {/* Random number of event skeletons per cell */}
            {Array(Math.floor(Math.random() * 4)).fill(0).map((_, eventIndex) => (
              <Skeleton 
                key={eventIndex}
                width="90%"
                height="1rem"
                borderRadius="0.25rem"
                className="event-skeleton"
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  </div>
)

// Week View Skeleton
const WeekViewSkeleton: React.FC = () => (
  <div className="week-view-skeleton">
    {/* Week header */}
    <div className="week-header-skeleton">
      <div className="time-column-header-skeleton">
        <Skeleton width="3rem" height="1rem" />
      </div>
      {Array(7).fill(0).map((_, index) => (
        <div key={index} className="day-column-header-skeleton">
          <Skeleton width="2rem" height="1rem" />
          <Skeleton width="1.5rem" height="1.5rem" borderRadius="50%" />
        </div>
      ))}
    </div>
    
    {/* Time grid */}
    <div className="week-grid-skeleton">
      {Array(24).fill(0).map((_, hourIndex) => (
        <div key={hourIndex} className="hour-row-skeleton">
          <div className="time-label-skeleton">
            <Skeleton width="3rem" height="1rem" />
          </div>
          {Array(7).fill(0).map((_, dayIndex) => (
            <div key={dayIndex} className="time-slot-skeleton">
              {/* Random events in some slots */}
              {Math.random() > 0.7 && (
                <Skeleton 
                  width="90%"
                  height="2rem"
                  borderRadius="0.25rem"
                  className="event-skeleton"
                />
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  </div>
)

// Day View Skeleton
const DayViewSkeleton: React.FC = () => (
  <div className="day-view-skeleton">
    {/* Day header */}
    <div className="day-header-skeleton">
      <Skeleton width="12rem" height="1.5rem" />
    </div>
    
    {/* Hour slots */}
    <div className="day-grid-skeleton">
      {Array(24).fill(0).map((_, hourIndex) => (
        <div key={hourIndex} className="hour-slot-skeleton">
          <div className="hour-label-skeleton">
            <Skeleton width="3rem" height="1rem" />
          </div>
          <div className="hour-content-skeleton">
            {/* Random events in some hours */}
            {Math.random() > 0.8 && (
              <Skeleton 
                width="95%"
                height="3rem"
                borderRadius="0.5rem"
                className="event-skeleton"
              />
            )}
          </div>
        </div>
      ))}
    </div>
  </div>
)

// Event List Skeleton
export const EventListSkeleton: React.FC<EventSkeletonProps> = ({
  count = 5,
  showDetails = true,
  size = 'md'
}) => (
  <div className={`event-list-skeleton size-${size}`}>
    {Array(count).fill(0).map((_, index) => (
      <div key={index} className="event-item-skeleton">
        <div className="event-time-skeleton">
          <Skeleton width="4rem" height="1rem" />
        </div>
        <div className="event-content-skeleton">
          <Skeleton width="80%" height="1.25rem" />
          {showDetails && (
            <>
              <Skeleton width="60%" height="1rem" />
              <Skeleton width="40%" height="0.875rem" />
            </>
          )}
        </div>
        <div className="event-provider-skeleton">
          <Skeleton width="1rem" height="1rem" borderRadius="50%" />
        </div>
      </div>
    ))}
  </div>
)

// Search Results Skeleton
export const SearchResultsSkeleton: React.FC = () => (
  <div className="search-results-skeleton">
    <div className="search-stats-skeleton">
      <Skeleton width="8rem" height="1rem" />
      <Skeleton width="4rem" height="0.875rem" />
    </div>
    
    <div className="search-filters-skeleton">
      {Array(4).fill(0).map((_, index) => (
        <Skeleton 
          key={index}
          width="5rem"
          height="2rem"
          borderRadius="1rem"
        />
      ))}
    </div>
    
    <EventListSkeleton count={8} showDetails={true} />
  </div>
)

// Modal Skeleton
export const ModalSkeleton: React.FC<{ title?: boolean; content?: boolean; actions?: boolean }> = ({
  title = true,
  content = true,
  actions = true
}) => (
  <div className="modal-skeleton">
    {title && (
      <div className="modal-header-skeleton">
        <Skeleton width="8rem" height="1.5rem" />
        <Skeleton width="1.5rem" height="1.5rem" borderRadius="50%" />
      </div>
    )}
    
    {content && (
      <div className="modal-content-skeleton">
        {Array(4).fill(0).map((_, index) => (
          <div key={index} className="form-group-skeleton">
            <Skeleton width="6rem" height="1rem" />
            <Skeleton width="100%" height="2.5rem" borderRadius="0.25rem" />
          </div>
        ))}
      </div>
    )}
    
    {actions && (
      <div className="modal-actions-skeleton">
        <Skeleton width="4rem" height="2rem" borderRadius="0.25rem" />
        <Skeleton width="6rem" height="2rem" borderRadius="0.25rem" />
      </div>
    )}
  </div>
)

// Progress Bar Component
export const ProgressBar: React.FC<ProgressBarProps> = ({
  progress,
  label,
  showPercentage = true,
  color = 'blue',
  size = 'md',
  animated = true
}) => {
  const clampedProgress = Math.max(0, Math.min(100, progress))
  
  return (
    <div className={`progress-bar progress-${size}`}>
      {label && (
        <div className="progress-label">
          <span>{label}</span>
          {showPercentage && (
            <span className="progress-percentage">{Math.round(clampedProgress)}%</span>
          )}
        </div>
      )}
      
      <div className={`progress-track progress-${color}`}>
        <div 
          className={`progress-fill ${animated ? 'progress-animated' : ''}`}
          style={{ width: `${clampedProgress}%` }}
        />
      </div>
    </div>
  )
}

// Loading Spinner Component
export const LoadingSpinner: React.FC<{
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  color?: 'blue' | 'green' | 'red' | 'yellow' | 'gray'
  className?: string
}> = ({ size = 'md', color = 'blue', className = '' }) => (
  <div className={`loading-spinner spinner-${size} spinner-${color} ${className}`}>
    <div className="spinner-ring">
      <div></div>
      <div></div>
      <div></div>
      <div></div>
    </div>
  </div>
)

// Pulsing Dot Loader
export const PulsingDots: React.FC<{
  count?: number
  size?: 'sm' | 'md' | 'lg'
  color?: string
}> = ({ count = 3, size = 'md', color = 'blue' }) => (
  <div className={`pulsing-dots dots-${size}`}>
    {Array(count).fill(0).map((_, index) => (
      <div 
        key={index}
        className={`pulsing-dot dot-${color}`}
        style={{ animationDelay: `${index * 0.1}s` }}
      />
    ))}
  </div>
)

// Skeleton Shimmer Effect Component
export const ShimmerEffect: React.FC<{
  children: React.ReactNode
  loading: boolean
}> = ({ children, loading }) => (
  <div className={`shimmer-container ${loading ? 'shimmer-loading' : ''}`}>
    {children}
    {loading && <div className="shimmer-overlay" />}
  </div>
)

// Loading State Manager Component
export const LoadingStateManager: React.FC<{
  isLoading: boolean
  loadingComponent?: React.ReactNode
  children: React.ReactNode
  delay?: number
}> = ({ isLoading, loadingComponent, children, delay = 0 }) => {
  const [showLoading, setShowLoading] = React.useState(false)

  React.useEffect(() => {
    if (isLoading) {
      const timer = setTimeout(() => setShowLoading(true), delay)
      return () => clearTimeout(timer)
    } else {
      setShowLoading(false)
    }
  }, [isLoading, delay])

  if (showLoading) {
    return <>{loadingComponent || <LoadingSpinner />}</>
  }

  return <>{children}</>
}

// Fade-in Animation Component
export const FadeIn: React.FC<{
  children: React.ReactNode
  duration?: number
  delay?: number
  className?: string
}> = ({ children, duration = 300, delay = 0, className = '' }) => {
  const [isVisible, setIsVisible] = React.useState(false)

  React.useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay)
    return () => clearTimeout(timer)
  }, [delay])

  return (
    <div 
      className={`fade-in ${isVisible ? 'fade-in-visible' : ''} ${className}`}
      style={{ 
        transitionDuration: `${duration}ms`,
        transitionDelay: `${delay}ms`
      }}
    >
      {children}
    </div>
  )
}

// Slide-in Animation Component
export const SlideIn: React.FC<{
  children: React.ReactNode
  direction?: 'left' | 'right' | 'up' | 'down'
  duration?: number
  delay?: number
  className?: string
}> = ({ children, direction = 'up', duration = 300, delay = 0, className = '' }) => {
  const [isVisible, setIsVisible] = React.useState(false)

  React.useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay)
    return () => clearTimeout(timer)
  }, [delay])

  return (
    <div 
      className={`slide-in slide-in-${direction} ${isVisible ? 'slide-in-visible' : ''} ${className}`}
      style={{ 
        transitionDuration: `${duration}ms`,
        transitionDelay: `${delay}ms`
      }}
    >
      {children}
    </div>
  )
}

export default CalendarSkeleton