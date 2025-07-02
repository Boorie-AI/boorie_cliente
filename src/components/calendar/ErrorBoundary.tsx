// Error Boundary Component - Comprehensive error handling UI

import React, { Component, ErrorInfo, ReactNode } from 'react'
import CalendarErrorHandler, { CalendarError, ErrorType, ErrorSeverity } from '../../services/errorHandling.service'
import '../../styles/components.css';
import '../../styles/modals.css';
import '../../styles/recurrence.css';

interface ErrorBoundaryState {
  hasError: boolean
  error: CalendarError | null
  errorInfo: ErrorInfo | null
}

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: React.ComponentType<{ error: CalendarError; retry: () => void }>
}

interface ErrorDisplayProps {
  error: CalendarError
  onRetry?: () => void
  onDismiss?: () => void
  showDetails?: boolean
}

interface ErrorToastProps {
  error: CalendarError
  onDismiss: () => void
  autoHide?: boolean
  duration?: number
}

// Main Error Boundary Component
export class CalendarErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private errorHandler: CalendarErrorHandler

  constructor(props: ErrorBoundaryProps) {
    super(props)
    
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    }

    this.errorHandler = CalendarErrorHandler.getInstance()
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Handle the error through our error handler
    this.errorHandler.handleError(error, {
      component: 'ErrorBoundary',
      operation: 'componentDidCatch'
    }).then(calendarError => {
      this.setState({
        error: calendarError,
        errorInfo
      })
    })
  }

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    })
  }

  render() {
    if (this.state.hasError && this.state.error) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        const FallbackComponent = this.props.fallback
        return <FallbackComponent error={this.state.error} retry={this.handleRetry} />
      }

      // Default error display
      return (
        <ErrorDisplay
          error={this.state.error}
          onRetry={this.handleRetry}
          showDetails={true}
        />
      )
    }

    return this.props.children
  }
}

// Error Display Component
export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({
  error,
  onRetry,
  onDismiss,
  showDetails = false
}) => {
  const [detailsVisible, setDetailsVisible] = React.useState(showDetails)
  const errorHandler = CalendarErrorHandler.getInstance()
  const recoveryActions = errorHandler.getRecoveryActions(error)

  const getSeverityClass = (severity: ErrorSeverity): string => {
    switch (severity) {
      case ErrorSeverity.LOW:
        return 'error-low'
      case ErrorSeverity.MEDIUM:
        return 'error-medium'
      case ErrorSeverity.HIGH:
        return 'error-high'
      case ErrorSeverity.CRITICAL:
        return 'error-critical'
      default:
        return 'error-medium'
    }
  }

  const getSeverityIcon = (severity: ErrorSeverity): React.ReactNode => {
    switch (severity) {
      case ErrorSeverity.LOW:
        return <InfoIcon className="w-5 h-5" />
      case ErrorSeverity.MEDIUM:
        return <ExclamationIcon className="w-5 h-5" />
      case ErrorSeverity.HIGH:
        return <ExclamationTriangleIcon className="w-5 h-5" />
      case ErrorSeverity.CRITICAL:
        return <XCircleIcon className="w-5 h-5" />
      default:
        return <ExclamationIcon className="w-5 h-5" />
    }
  }

  return (
    <div className={`error-display ${getSeverityClass(error.severity)}`}>
      <div className="error-header">
        <div className="error-icon">
          {getSeverityIcon(error.severity)}
        </div>
        <div className="error-content">
          <h3 className="error-title">
            {error.severity === ErrorSeverity.CRITICAL ? 'Critical Error' : 'Something went wrong'}
          </h3>
          <p className="error-message">{error.userMessage}</p>
        </div>
        {onDismiss && (
          <button onClick={onDismiss} className="error-dismiss">
            <XIcon className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Recovery Actions */}
      {recoveryActions.length > 0 && (
        <div className="error-actions">
          {recoveryActions.map((action, index) => (
            <button
              key={index}
              onClick={action.action}
              className={`error-action-btn ${action.primary ? 'primary' : 'secondary'}`}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}

      {/* Error Details Toggle */}
      <div className="error-details-section">
        <button
          onClick={() => setDetailsVisible(!detailsVisible)}
          className="error-details-toggle"
        >
          <span>Technical Details</span>
          <ChevronDownIcon 
            className={`w-4 h-4 transition-transform ${detailsVisible ? 'rotate-180' : ''}`}
          />
        </button>

        {detailsVisible && (
          <div className="error-details">
            <div className="detail-item">
              <strong>Error Type:</strong> {error.type}
            </div>
            <div className="detail-item">
              <strong>Correlation ID:</strong> {error.correlationId}
            </div>
            <div className="detail-item">
              <strong>Timestamp:</strong> {error.timestamp.toISOString()}
            </div>
            {error.context && (
              <div className="detail-item">
                <strong>Context:</strong>
                <pre className="context-data">{JSON.stringify(error.context, null, 2)}</pre>
              </div>
            )}
            <div className="detail-item">
              <strong>Technical Message:</strong> {error.technicalMessage}
            </div>
            {error.stack && (
              <div className="detail-item">
                <strong>Stack Trace:</strong>
                <pre className="stack-trace">{error.stack}</pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// Error Toast Component for non-critical errors
export const ErrorToast: React.FC<ErrorToastProps> = ({
  error,
  onDismiss,
  autoHide = true,
  duration = 5000
}) => {
  const [isVisible, setIsVisible] = React.useState(true)

  React.useEffect(() => {
    if (autoHide && duration > 0) {
      const timer = setTimeout(() => {
        setIsVisible(false)
        setTimeout(onDismiss, 300) // Allow fade out animation
      }, duration)

      return () => clearTimeout(timer)
    }
  }, [autoHide, duration, onDismiss])

  const handleDismiss = () => {
    setIsVisible(false)
    setTimeout(onDismiss, 300)
  }

  if (!isVisible) return null

  return (
    <div className={`error-toast ${isVisible ? 'visible' : 'hidden'}`}>
      <div className="toast-content">
        <div className="toast-icon">
          {error.severity === ErrorSeverity.LOW ? (
            <InfoIcon className="w-5 h-5" />
          ) : (
            <ExclamationIcon className="w-5 h-5" />
          )}
        </div>
        <div className="toast-message">
          <p>{error.userMessage}</p>
        </div>
        <button onClick={handleDismiss} className="toast-dismiss">
          <XIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// Error Manager Component - Manages global error display
export const ErrorManager: React.FC = () => {
  const [errors, setErrors] = React.useState<CalendarError[]>([])
  const errorHandler = CalendarErrorHandler.getInstance()

  React.useEffect(() => {
    const handleError = (error: CalendarError) => {
      // Only show certain errors as toasts/overlays
      if (error.severity !== ErrorSeverity.CRITICAL && 
          error.type !== ErrorType.AUTH_EXPIRED &&
          error.type !== ErrorType.ACCOUNT_DISCONNECTED) {
        setErrors(prev => [...prev, error])
      }
    }

    errorHandler.addErrorListener(handleError)

    return () => {
      errorHandler.removeErrorListener(handleError)
    }
  }, [errorHandler])

  const dismissError = (errorId: string) => {
    setErrors(prev => prev.filter(err => err.correlationId !== errorId))
  }

  return (
    <div className="error-manager">
      {/* Error Toasts */}
      <div className="error-toasts">
        {errors.map(error => (
          <ErrorToast
            key={error.correlationId}
            error={error}
            onDismiss={() => dismissError(error.correlationId)}
            autoHide={error.severity === ErrorSeverity.LOW}
            duration={error.severity === ErrorSeverity.LOW ? 3000 : 7000}
          />
        ))}
      </div>
    </div>
  )
}

// Specialized Error Components

// Network Error Component
export const NetworkErrorDisplay: React.FC<{ onRetry: () => void }> = ({ onRetry }) => (
  <div className="network-error-display">
    <div className="error-illustration">
      <WifiOffIcon className="w-16 h-16 text-gray-400" />
    </div>
    <h3>Connection Problem</h3>
    <p>Unable to connect to the calendar service. Please check your internet connection.</p>
    <div className="error-actions">
      <button onClick={onRetry} className="btn btn-primary">
        Try Again
      </button>
    </div>
  </div>
)

// Auth Error Component
export const AuthErrorDisplay: React.FC<{ onSignIn: () => void }> = ({ onSignIn }) => (
  <div className="auth-error-display">
    <div className="error-illustration">
      <LockIcon className="w-16 h-16 text-gray-400" />
    </div>
    <h3>Authentication Required</h3>
    <p>Your session has expired. Please sign in again to continue.</p>
    <div className="error-actions">
      <button onClick={onSignIn} className="btn btn-primary">
        Sign In
      </button>
    </div>
  </div>
)

// Account Disconnected Component
export const AccountDisconnectedDisplay: React.FC<{ 
  accountName: string
  onReconnect: () => void 
}> = ({ accountName, onReconnect }) => (
  <div className="account-error-display">
    <div className="error-illustration">
      <UserXIcon className="w-16 h-16 text-gray-400" />
    </div>
    <h3>Account Disconnected</h3>
    <p>Your {accountName} account has been disconnected. Please reconnect to continue accessing your calendar.</p>
    <div className="error-actions">
      <button onClick={onReconnect} className="btn btn-primary">
        Reconnect Account
      </button>
    </div>
  </div>
)

// Icon Components
const InfoIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)

const ExclamationIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)

const ExclamationTriangleIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
  </svg>
)

const XCircleIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)

const XIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
)

const ChevronDownIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
)

const WifiOffIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-12.728 12.728M8.11 8.11L3.515 3.515M20.485 20.485L15.89 15.89M8.11 8.11l7.778 7.778M8.11 8.11C4.668 11.552 4.668 17.448 8.11 20.89M15.89 15.89c3.441-3.442 3.441-9.338 0-12.78" />
  </svg>
)

const LockIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
  </svg>
)

const UserXIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6m6 0l-3-3m3 3l-3 3" />
  </svg>
)

export default CalendarErrorBoundary