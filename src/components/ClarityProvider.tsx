/**
 * Microsoft Clarity Provider Component
 * Integrates Microsoft Clarity analytics with the React application
 */

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { clarityService, trackClarityEvent, setClarityUserId, setClaritySessionTag } from '@/services/clarity';

interface ClarityContextType {
  isReady: boolean;
  trackEvent: (event: string, properties?: Record<string, any>) => void;
  setUserId: (userId: string) => void;
  setSessionTag: (key: string, value: string) => void;
  getSessionUrl: () => string | null;
}

const ClarityContext = createContext<ClarityContextType | null>(null);

interface ClarityProviderProps {
  children: ReactNode;
}

export function ClarityProvider({ children }: ClarityProviderProps) {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const initializeClarity = async () => {
      try {
        await clarityService.initialize();
        setIsReady(clarityService.isReady());
        
        // Set initial session tags for Electron app
        if (clarityService.isReady()) {
          setClaritySessionTag('app_type', 'electron');
          setClaritySessionTag('app_name', 'boorie');
          setClaritySessionTag('platform', navigator.platform || 'unknown');
          
          // Track app start event
          trackClarityEvent('app_started', {
            timestamp: new Date().toISOString(),
            version: '1.0.0' // You can get this from package.json
          });
        }
      } catch (error) {
        console.error('Failed to initialize Clarity provider:', error);
      }
    };

    initializeClarity();
  }, []);

  const contextValue: ClarityContextType = {
    isReady,
    trackEvent: trackClarityEvent,
    setUserId: setClarityUserId,
    setSessionTag: setClaritySessionTag,
    getSessionUrl: () => clarityService.getSessionUrl()
  };

  return (
    <ClarityContext.Provider value={contextValue}>
      {children}
    </ClarityContext.Provider>
  );
}

/**
 * Hook to use Clarity analytics
 */
export function useClarity(): ClarityContextType {
  const context = useContext(ClarityContext);
  if (!context) {
    throw new Error('useClarity must be used within a ClarityProvider');
  }
  return context;
}

/**
 * HOC to track page/component views
 */
export function withClarityTracking<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  pageName: string
) {
  return function ClarityTrackedComponent(props: P) {
    const { trackEvent, isReady } = useClarity();

    useEffect(() => {
      if (isReady) {
        trackEvent('page_view', {
          page: pageName,
          timestamp: new Date().toISOString()
        });
      }
    }, [trackEvent, isReady]);

    return <WrappedComponent {...props} />;
  };
}

/**
 * Component to track specific user interactions
 */
interface ClarityEventTrackerProps {
  event: string;
  properties?: Record<string, any>;
  children: ReactNode;
  trigger?: 'click' | 'hover' | 'focus';
}

export function ClarityEventTracker({ 
  event, 
  properties, 
  children, 
  trigger = 'click' 
}: ClarityEventTrackerProps) {
  const { trackEvent, isReady } = useClarity();

  const handleInteraction = () => {
    if (isReady) {
      trackEvent(event, {
        ...properties,
        timestamp: new Date().toISOString()
      });
    }
  };

  const eventHandlers = {
    click: { onClick: handleInteraction },
    hover: { onMouseEnter: handleInteraction },
    focus: { onFocus: handleInteraction }
  };

  return (
    <div {...eventHandlers[trigger]}>
      {children}
    </div>
  );
}