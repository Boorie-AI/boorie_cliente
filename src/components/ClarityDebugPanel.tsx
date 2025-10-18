/**
 * Clarity Debug Panel - Only shown in development
 * Helps verify that Microsoft Clarity is working correctly
 */

import React from 'react';
import { useClarity } from './ClarityProvider';
import { useClarityTracking } from '@/hooks/useClarityTracking';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export function ClarityDebugPanel() {
  const { isReady, getSessionUrl } = useClarity();
  const { 
    trackEvent, 
    trackFeatureUsage, 
    trackError,
    trackPerformance 
  } = useClarityTracking();

  // Only show in development
  if (import.meta.env.PROD) {
    return null;
  }

  const handleTestEvent = () => {
    trackEvent('debug_test_event', {
      test_type: 'manual_trigger',
      trigger_time: new Date().toISOString()
    });
  };

  const handleTestFeature = () => {
    trackFeatureUsage('settings', 'open', {
      source: 'debug_panel'
    });
  };

  const handleTestError = () => {
    trackError('javascript', 'Test error from debug panel', {
      source: 'debug_panel',
      test: true
    });
  };

  const handleTestPerformance = () => {
    const start = performance.now();
    setTimeout(() => {
      const duration = performance.now() - start;
      trackPerformance('debug_operation', duration, true);
    }, 100);
  };

  return (
    <Card className="fixed bottom-4 right-4 w-80 z-50 shadow-lg">
      <CardHeader>
        <CardTitle className="text-sm flex items-center justify-between">
          Clarity Debug Panel
          <Badge variant={isReady ? "default" : "destructive"}>
            {isReady ? "Ready" : "Not Ready"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="text-xs text-muted-foreground">
          Project ID: {import.meta.env.VITE_CLARITY_PROJECT_ID || 'Not configured'}
        </div>
        
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" onClick={handleTestEvent}>
            Test Event
          </Button>
          <Button size="sm" onClick={handleTestFeature}>
            Test Feature
          </Button>
          <Button size="sm" onClick={handleTestError} variant="destructive">
            Test Error
          </Button>
          <Button size="sm" onClick={handleTestPerformance}>
            Test Perf
          </Button>
        </div>

        {isReady && (
          <div className="text-xs text-muted-foreground">
            Session URL: <a 
              href={getSessionUrl() || '#'} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-500 hover:underline"
            >
              View Dashboard
            </a>
          </div>
        )}
      </CardContent>
    </Card>
  );
}