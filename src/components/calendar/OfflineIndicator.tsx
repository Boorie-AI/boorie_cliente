// Offline Indicator Components - UI indicators for offline/online states

import React, { useState } from 'react'
import useOfflineDetection from '../../hooks/useOfflineDetection'
import '../../styles/components.css';
import '../../styles/modals.css';
import '../../styles/recurrence.css';

interface OfflineIndicatorProps {
  position?: 'top' | 'bottom' | 'floating'
  showWhenOnline?: boolean
  autoHide?: boolean
  className?: string
}

interface OfflineBannerProps {
  isVisible: boolean
  onRetry: () => void
  onDismiss?: () => void
  message: string
  duration?: string
  canRetry?: boolean
}

interface ConnectionQualityProps {
  quality: 'poor' | 'good' | 'excellent' | 'unknown'
  showLabel?: boolean
  size?: 'sm' | 'md' | 'lg'
}

interface OfflineActionsProps {
  onRetry: () => void
  onRefresh: () => void
  retryCount: number
  maxRetries?: number
}

// Main Offline Indicator Component
export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({
  position = 'floating',
  showWhenOnline = false,
  autoHide = true,
  className = ''
}) => {
  const {
    isOnline,
    isOffline,
    connectionQuality,
    offlineDuration,
    retryCount,
    retryConnection,
    checkConnection,
    getStatusMessage,
    getFormattedDuration
  } = useOfflineDetection()

  const [dismissed, setDismissed] = useState(false)
  const [isRetrying, setIsRetrying] = useState(false)

  // Don't show if online and not configured to show when online
  if (isOnline && !showWhenOnline) return null

  // Don't show if dismissed and auto-hide is enabled
  if (dismissed && autoHide) return null

  const handleRetry = async () => {
    setIsRetrying(true)
    try {
      await retryConnection()
    } finally {
      setIsRetrying(false)
    }
  }

  const handleRefresh = () => {
    window.location.reload()
  }

  const handleDismiss = () => {
    if (autoHide) {
      setDismissed(true)
    }
  }

  const getIndicatorClass = () => {
    const baseClass = `offline-indicator ${className}`
    const positionClass = `offline-indicator-${position}`
    const statusClass = isOnline ? 'online' : 'offline'
    const qualityClass = `quality-${connectionQuality}`
    
    return `${baseClass} ${positionClass} ${statusClass} ${qualityClass}`
  }

  return (
    <div className={getIndicatorClass()}>
      {position === 'floating' ? (
        <FloatingIndicator
          isOnline={isOnline}
          connectionQuality={connectionQuality}
          statusMessage={getStatusMessage()}
          onRetry={handleRetry}
          onRefresh={handleRefresh}
          isRetrying={isRetrying}
          retryCount={retryCount}
        />
      ) : (
        <OfflineBanner
          isVisible={isOffline || showWhenOnline}
          onRetry={handleRetry}
          onDismiss={autoHide ? handleDismiss : undefined}
          message={getStatusMessage()}
          duration={isOffline ? getFormattedDuration() : ''}
          canRetry={isOffline}
        />
      )}
    </div>
  )
}

// Floating Indicator Component
const FloatingIndicator: React.FC<{
  isOnline: boolean
  connectionQuality: 'poor' | 'good' | 'excellent' | 'unknown'
  statusMessage: string
  onRetry: () => void
  onRefresh: () => void
  isRetrying: boolean
  retryCount: number
}> = ({
  isOnline,
  connectionQuality,
  statusMessage,
  onRetry,
  onRefresh,
  isRetrying,
  retryCount
}) => {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={`floating-indicator ${expanded ? 'expanded' : 'collapsed'}`}>
      <div 
        className="indicator-trigger"
        onClick={() => setExpanded(!expanded)}
      >
        <ConnectionQualityIcon quality={connectionQuality} />
        <span className="status-text">{isOnline ? 'Online' : 'Offline'}</span>
      </div>

      {expanded && (
        <div className="indicator-details">
          <div className="status-details">
            <ConnectionQuality 
              quality={connectionQuality} 
              showLabel={true}
              size="md"
            />
            <span className="detailed-status">{statusMessage}</span>
          </div>

          {!isOnline && (
            <OfflineActions
              onRetry={onRetry}
              onRefresh={onRefresh}
              retryCount={retryCount}
              maxRetries={3}
            />
          )}

          <button 
            className="collapse-btn"
            onClick={() => setExpanded(false)}
          >
            <ChevronUpIcon className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}

// Banner Indicator Component
const OfflineBanner: React.FC<OfflineBannerProps> = ({
  isVisible,
  onRetry,
  onDismiss,
  message,
  duration,
  canRetry = false
}) => {
  if (!isVisible) return null

  return (
    <div className="offline-banner">
      <div className="banner-content">
        <div className="banner-icon">
          <WifiOffIcon className="w-5 h-5" />
        </div>
        
        <div className="banner-message">
          <span className="primary-message">{message}</span>
          {duration && (
            <span className="duration-text">({duration})</span>
          )}
        </div>

        <div className="banner-actions">
          {canRetry && (
            <button 
              onClick={onRetry}
              className="retry-btn"
            >
              <RefreshIcon className="w-4 h-4" />
              Try Again
            </button>
          )}
          
          {onDismiss && (
            <button 
              onClick={onDismiss}
              className="dismiss-btn"
            >
              <XIcon className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// Connection Quality Component
const ConnectionQuality: React.FC<ConnectionQualityProps> = ({
  quality,
  showLabel = false,
  size = 'md'
}) => {
  const getQualityConfig = () => {
    switch (quality) {
      case 'excellent':
        return {
          bars: 4,
          color: 'text-green-500',
          label: 'Excellent'
        }
      case 'good':
        return {
          bars: 3,
          color: 'text-yellow-500',
          label: 'Good'
        }
      case 'poor':
        return {
          bars: 1,
          color: 'text-red-500',
          label: 'Poor'
        }
      default:
        return {
          bars: 0,
          color: 'text-gray-400',
          label: 'Unknown'
        }
    }
  }

  const config = getQualityConfig()
  const sizeClass = `signal-${size}`

  return (
    <div className={`connection-quality ${sizeClass}`}>
      <div className={`signal-bars ${config.color}`}>
        {[1, 2, 3, 4].map(bar => (
          <div
            key={bar}
            className={`signal-bar bar-${bar} ${bar <= config.bars ? 'active' : 'inactive'}`}
          />
        ))}
      </div>
      {showLabel && (
        <span className={`quality-label ${config.color}`}>
          {config.label}
        </span>
      )}
    </div>
  )
}

// Connection Quality Icon Component
const ConnectionQualityIcon: React.FC<{ quality: 'poor' | 'good' | 'excellent' | 'unknown' }> = ({ quality }) => {
  switch (quality) {
    case 'excellent':
      return <WifiIcon className="w-5 h-5 text-green-500" />
    case 'good':
      return <WifiIcon className="w-5 h-5 text-yellow-500" />
    case 'poor':
      return <WifiIcon className="w-5 h-5 text-red-500" />
    default:
      return <WifiOffIcon className="w-5 h-5 text-gray-400" />
  }
}

// Offline Actions Component
const OfflineActions: React.FC<OfflineActionsProps> = ({
  onRetry,
  onRefresh,
  retryCount,
  maxRetries = 3
}) => {
  const canRetry = retryCount < maxRetries

  return (
    <div className="offline-actions">
      {canRetry ? (
        <button 
          onClick={onRetry}
          className="action-btn primary"
        >
          <RefreshIcon className="w-4 h-4" />
          Retry Connection ({retryCount}/{maxRetries})
        </button>
      ) : (
        <button 
          onClick={onRefresh}
          className="action-btn secondary"
        >
          <RefreshIcon className="w-4 h-4" />
          Refresh Page
        </button>
      )}
    </div>
  )
}

// Offline Mode Component for Calendar
export const CalendarOfflineMode: React.FC<{
  children: React.ReactNode
}> = ({ children }) => {
  const { isOffline, isOnline, checkConnection } = useOfflineDetection()
  const [showOfflineOverlay, setShowOfflineOverlay] = useState(false)

  React.useEffect(() => {
    if (isOffline) {
      // Show overlay after 5 seconds of being offline
      const timer = setTimeout(() => {
        setShowOfflineOverlay(true)
      }, 5000)

      return () => clearTimeout(timer)
    } else {
      setShowOfflineOverlay(false)
    }
  }, [isOffline])

  return (
    <div className="calendar-offline-wrapper">
      {children}
      
      {/* Offline Overlay */}
      {showOfflineOverlay && (
        <div className="offline-overlay">
          <div className="offline-content">
            <WifiOffIcon className="w-16 h-16 text-gray-400 mb-4" />
            <h3>You're offline</h3>
            <p>Your calendar data might be outdated. Check your connection and try refreshing.</p>
            <div className="offline-overlay-actions">
              <button 
                onClick={checkConnection}
                className="btn btn-primary"
              >
                Check Connection
              </button>
              <button 
                onClick={() => window.location.reload()}
                className="btn btn-secondary"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Always show indicator */}
      <OfflineIndicator position="floating" showWhenOnline={false} />
    </div>
  )
}

// Enhanced Calendar Status Bar
export const CalendarStatusBar: React.FC = () => {
  const {
    isOnline,
    connectionQuality,
    getStatusMessage,
    checkConnection,
    lastOnlineTime
  } = useOfflineDetection()

  return (
    <div className="calendar-status-bar">
      <div className="status-left">
        <ConnectionQuality 
          quality={connectionQuality}
          showLabel={false}
          size="sm"
        />
        <span className="status-message">{getStatusMessage()}</span>
      </div>

      <div className="status-right">
        {lastOnlineTime && (
          <span className="last-sync">
            Last sync: {lastOnlineTime.toLocaleTimeString()}
          </span>
        )}
        
        <button 
          onClick={checkConnection}
          className="check-connection-btn"
          title="Check connection"
        >
          <RefreshIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// Icon Components
const WifiIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
  </svg>
)

const WifiOffIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-12.728 12.728M8.11 8.11L3.515 3.515M20.485 20.485L15.89 15.89M8.11 8.11l7.778 7.778M8.11 8.11C4.668 11.552 4.668 17.448 8.11 20.89M15.89 15.89c3.441-3.442 3.441-9.338 0-12.78" />
  </svg>
)

const RefreshIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
)

const XIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
)

const ChevronUpIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
  </svg>
)

export default OfflineIndicator