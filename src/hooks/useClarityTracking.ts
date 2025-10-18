/**
 * Custom hook for common Clarity tracking events in Boorie
 */

import { useClarity } from '@/components/ClarityProvider';

export function useClarityTracking() {
  const { trackEvent, isReady, setUserId, setSessionTag } = useClarity();

  // Chat-related tracking
  const trackChatMessage = (messageType: 'user' | 'assistant', model?: string) => {
    if (isReady) {
      trackEvent('chat_message_sent', {
        message_type: messageType,
        model_used: model,
        timestamp: new Date().toISOString()
      });
    }
  };

  const trackConversationStarted = (model?: string) => {
    if (isReady) {
      trackEvent('conversation_started', {
        model_used: model,
        timestamp: new Date().toISOString()
      });
    }
  };

  // Hydraulic calculations tracking
  const trackHydraulicCalculation = (
    formulaId: string, 
    formulaName: string, 
    category: string,
    success: boolean,
    errorMessage?: string
  ) => {
    if (isReady) {
      trackEvent('hydraulic_calculation', {
        formula_id: formulaId,
        formula_name: formulaName,
        category,
        success,
        error_message: errorMessage,
        timestamp: new Date().toISOString()
      });
    }
  };

  // WNTR analysis tracking
  const trackWNTRAnalysis = (
    analysisType: 'topology' | 'criticality' | 'resilience',
    success: boolean,
    networkName?: string,
    errorMessage?: string
  ) => {
    if (isReady) {
      trackEvent('wntr_analysis', {
        analysis_type: analysisType,
        success,
        network_name: networkName,
        error_message: errorMessage,
        timestamp: new Date().toISOString()
      });
    }
  };

  // File operations tracking
  const trackFileOperation = (
    operation: 'load' | 'save' | 'export' | 'import',
    fileType: 'inp' | 'json' | 'pdf' | 'csv',
    success: boolean,
    errorMessage?: string
  ) => {
    if (isReady) {
      trackEvent('file_operation', {
        operation,
        file_type: fileType,
        success,
        error_message: errorMessage,
        timestamp: new Date().toISOString()
      });
    }
  };

  // Navigation tracking
  const trackNavigation = (fromView: string, toView: string) => {
    if (isReady) {
      trackEvent('navigation', {
        from_view: fromView,
        to_view: toView,
        timestamp: new Date().toISOString()
      });
    }
  };

  // Feature usage tracking
  const trackFeatureUsage = (
    feature: 'calculator' | 'wntr' | 'chat' | 'rag' | 'projects' | 'settings',
    action: 'open' | 'close' | 'use' | 'configure',
    details?: Record<string, any>
  ) => {
    if (isReady) {
      trackEvent('feature_usage', {
        feature,
        action,
        details,
        timestamp: new Date().toISOString()
      });
    }
  };

  // Error tracking
  const trackError = (
    errorType: 'javascript' | 'network' | 'calculation' | 'file' | 'wntr',
    errorMessage: string,
    context?: Record<string, any>
  ) => {
    if (isReady) {
      trackEvent('error_occurred', {
        error_type: errorType,
        error_message: errorMessage,
        context,
        timestamp: new Date().toISOString()
      });
    }
  };

  // Performance tracking
  const trackPerformance = (
    operation: string,
    duration: number,
    success: boolean
  ) => {
    if (isReady) {
      trackEvent('performance_metric', {
        operation,
        duration_ms: duration,
        success,
        timestamp: new Date().toISOString()
      });
    }
  };

  // User session tracking
  const trackUserSession = (sessionType: 'start' | 'end', duration?: number) => {
    if (isReady) {
      trackEvent('user_session', {
        session_type: sessionType,
        duration_minutes: duration,
        timestamp: new Date().toISOString()
      });
    }
  };

  // Settings changes tracking
  const trackSettingsChange = (
    setting: string,
    oldValue: any,
    newValue: any
  ) => {
    if (isReady) {
      trackEvent('settings_changed', {
        setting_name: setting,
        old_value: String(oldValue),
        new_value: String(newValue),
        timestamp: new Date().toISOString()
      });
    }
  };

  // Custom event tracking with common metadata
  const trackCustomEvent = (eventName: string, properties?: Record<string, any>) => {
    if (isReady) {
      trackEvent(eventName, {
        ...properties,
        timestamp: new Date().toISOString(),
        app_version: '1.0.0',
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'
      });
    }
  };

  return {
    // Core tracking functions
    trackEvent: trackCustomEvent,
    setUserId,
    setSessionTag,
    isReady,

    // Specialized tracking functions
    trackChatMessage,
    trackConversationStarted,
    trackHydraulicCalculation,
    trackWNTRAnalysis,
    trackFileOperation,
    trackNavigation,
    trackFeatureUsage,
    trackError,
    trackPerformance,
    trackUserSession,
    trackSettingsChange
  };
}