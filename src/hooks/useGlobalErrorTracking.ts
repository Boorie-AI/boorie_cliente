/**
 * Global Error Tracking Hook
 * Automatically tracks JavaScript errors and unhandled promise rejections
 */

import { useEffect } from 'react';
import { clarityService } from '@/services/clarity';

export function useGlobalErrorTracking() {

  useEffect(() => {
    // Track JavaScript errors
    const handleError = (event: ErrorEvent) => {
      if (clarityService.isReady()) {
        clarityService.trackEvent('error_occurred', {
          error_type: 'javascript',
          error_message: event.message,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          stack: event.error?.stack,
          source: 'global_error_handler',
          timestamp: new Date().toISOString()
        });
      }
    };

    // Track unhandled promise rejections
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      let errorMessage = 'Unhandled Promise Rejection';
      let errorStack;

      if (reason instanceof Error) {
        errorMessage = reason.message;
        errorStack = reason.stack;
      } else if (typeof reason === 'string') {
        errorMessage = reason;
      } else {
        errorMessage = 'Unknown rejection reason';
      }

      if (clarityService.isReady()) {
        clarityService.trackEvent('error_occurred', {
          error_type: 'javascript',
          error_message: errorMessage,
          type: 'unhandled_promise_rejection',
          reason: String(reason),
          stack: errorStack,
          source: 'global_rejection_handler',
          timestamp: new Date().toISOString()
        });
      }
    };

    // Add event listeners
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    // Cleanup
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);
}