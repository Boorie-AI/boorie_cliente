# Microsoft Clarity Analytics Integration

## Overview

Boorie integrates Microsoft Clarity for comprehensive user behavior analytics, performance monitoring, and error tracking. This integration provides deep insights into how hydraulic engineers interact with the application and helps optimize the user experience.

## Features

### 📊 User Behavior Analytics
- **Session Recordings**: Visual recordings of user sessions
- **Heatmaps**: Click and scroll behavior visualization
- **User Journeys**: Complete workflow tracking
- **Interaction Analysis**: Detailed component interaction metrics

### 🔍 Performance Monitoring
- **Load Times**: Application and component loading performance
- **Resource Usage**: Memory and CPU utilization tracking
- **Network Performance**: API and data transfer monitoring
- **Rendering Performance**: Frontend rendering metrics

### 🚨 Error Tracking
- **JavaScript Errors**: Automatic error detection and reporting
- **Unhandled Promises**: Promise rejection tracking
- **Custom Error Events**: Manual error reporting
- **Error Context**: Detailed error environment information

### 🧮 Specialized Hydraulic Tracking
- **Calculation Events**: Track hydraulic calculation usage
- **WNTR Operations**: Monitor water network analysis
- **File Processing**: Track EPANET file operations
- **Project Activities**: Monitor project management actions

## Configuration

### Environment Setup

Add the following to your `.env` file:

```env
VITE_CLARITY_PROJECT_ID=ts4zpakpjj
VITE_CLARITY_ENABLED=true
```

### Content Security Policy

The application includes CSP configuration to allow Clarity scripts:

```html
<meta http-equiv="Content-Security-Policy" content="
  script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://www.clarity.ms;
  connect-src 'self' https: https://www.clarity.ms;
">
```

## Implementation Details

### Core Service

The `ClarityService` class handles all Clarity operations:

```typescript
// src/services/clarity.ts
class ClarityService {
  private config: ClarityConfig;
  private isInitialized = false;
  private isElectron = false;

  async initialize(): Promise<void>
  trackEvent(eventName: string, customProperties?: Record<string, any>): void
  identify(userId: string, sessionProperties?: Record<string, any>): void
  setSessionTag(key: string, value: string): void
}
```

### React Integration

#### Provider Setup
```typescript
// src/components/ClarityProvider.tsx
export function ClarityProvider({ children }: ClarityProviderProps) {
  // Initializes Clarity and provides context
}
```

#### Hook Usage
```typescript
// src/hooks/useClarityTracking.ts
export function useClarityTracking() {
  // Specialized tracking functions for different features
}
```

### Tracking Events

#### Hydraulic Calculations
```typescript
const trackHydraulicCalculation = (
  calculationType: string,
  inputParams: Record<string, any>,
  success: boolean,
  result?: any,
  errorMessage?: string
) => {
  trackEvent('hydraulic_calculation', {
    calculation_type: calculationType,
    input_parameters: inputParams,
    success,
    result_summary: result ? JSON.stringify(result) : undefined,
    error_message: errorMessage,
    timestamp: new Date().toISOString(),
    user_agent: navigator.userAgent
  });
};
```

#### WNTR Analysis
```typescript
const trackWNTRAnalysis = (
  analysisType: string,
  success: boolean,
  networkName?: string,
  errorMessage?: string
) => {
  trackEvent('wntr_analysis', {
    analysis_type: analysisType,
    success,
    network_name: networkName,
    error_message: errorMessage,
    timestamp: new Date().toISOString()
  });
};
```

#### Chat Interactions
```typescript
const trackChatMessage = (
  provider: string,
  messageType: 'user' | 'assistant',
  success: boolean,
  responseTime?: number,
  errorMessage?: string
) => {
  trackEvent('chat_message', {
    ai_provider: provider,
    message_type: messageType,
    success,
    response_time_ms: responseTime,
    error_message: errorMessage,
    timestamp: new Date().toISOString()
  });
};
```

#### Project Management
```typescript
const trackProjectAction = (
  action: 'create' | 'update' | 'delete' | 'load',
  projectType: string,
  success: boolean,
  errorMessage?: string
) => {
  trackEvent('project_action', {
    action,
    project_type: projectType,
    success,
    error_message: errorMessage,
    timestamp: new Date().toISOString()
  });
};
```

#### File Operations
```typescript
const trackFileOperation = (
  operation: 'import' | 'export' | 'upload' | 'download',
  fileType: string,
  fileSize?: number,
  success?: boolean,
  errorMessage?: string
) => {
  trackEvent('file_operation', {
    operation,
    file_type: fileType,
    file_size_bytes: fileSize,
    success,
    error_message: errorMessage,
    timestamp: new Date().toISOString()
  });
};
```

### Error Tracking

#### Global Error Handler
```typescript
// src/components/GlobalErrorTracker.tsx
export function GlobalErrorTracker() {
  const { trackEvent, isReady } = useClarity();

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      if (isReady) {
        trackEvent('error_occurred', {
          error_type: 'javascript',
          error_message: event.message,
          error_filename: event.filename,
          error_lineno: event.lineno,
          error_colno: event.colno,
          error_stack: event.error?.stack,
          timestamp: new Date().toISOString(),
          user_agent: navigator.userAgent,
          url: window.location.href
        });
      }
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (isReady) {
        trackEvent('error_occurred', {
          error_type: 'unhandled_promise_rejection',
          error_message: event.reason?.message || String(event.reason),
          error_stack: event.reason?.stack,
          timestamp: new Date().toISOString(),
          user_agent: navigator.userAgent,
          url: window.location.href
        });
      }
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, [trackEvent, isReady]);

  return null;
}
```

## Integration Points

### Main Application
```typescript
// src/main.tsx
<ClarityProvider>
  <App />
  <GlobalErrorTracker />
</ClarityProvider>
```

### Component Integration
```typescript
// Example component usage
function HydraulicCalculator() {
  const { trackHydraulicCalculation } = useClarityTracking();

  const handleCalculation = async (params) => {
    try {
      const result = await performCalculation(params);
      trackHydraulicCalculation('pipe_sizing', params, true, result);
    } catch (error) {
      trackHydraulicCalculation('pipe_sizing', params, false, null, error.message);
    }
  };
}
```

## Data Privacy and Compliance

### Data Collection
- **No PII**: Personal identifiable information is not collected
- **Anonymized**: All data is anonymized before transmission
- **Consent**: Users can opt-out of analytics in application settings
- **GDPR Compliant**: Follows European data protection regulations

### Data Types Collected
- Application usage patterns
- Performance metrics
- Error occurrences
- Feature adoption rates
- User interface interactions
- Technical environment information

### Data Retention
- Microsoft Clarity retains data according to their retention policy
- Data can be exported or deleted upon request
- Session recordings can be disabled in settings

## Debug and Development

### Debug Panel
Development builds include a debug panel for testing Clarity integration:

```typescript
// Debug events
trackEvent('debug_test_event', {
  test_type: 'manual',
  timestamp: new Date().toISOString()
});
```

### Console Logging
In development mode, all Clarity events are logged to the console for debugging.

### Testing Events
```typescript
// Test all tracking functions
const testAllTracking = () => {
  trackHydraulicCalculation('test', {}, true);
  trackWNTRAnalysis('test', true);
  trackChatMessage('test', 'user', true);
  trackProjectAction('create', 'test', true);
  trackFileOperation('import', 'test');
};
```

## Performance Considerations

### Lazy Loading
- Clarity scripts are loaded asynchronously
- No impact on application startup time
- Graceful degradation if Clarity fails to load

### Event Batching
- Events are batched to reduce network requests
- Automatic retry on network failures
- Offline event queuing

### Resource Usage
- Minimal CPU and memory overhead
- Configurable sampling rates
- Automatic cleanup of old data

## Troubleshooting

### Common Issues

1. **Scripts Blocked by CSP**
   - Ensure CSP includes `https://www.clarity.ms`
   - Check browser console for CSP violations

2. **Events Not Appearing**
   - Verify project ID in environment variables
   - Check network connectivity
   - Confirm Clarity dashboard access

3. **Performance Impact**
   - Monitor application performance
   - Adjust sampling rates if needed
   - Disable in development if necessary

### Debugging Steps

1. Check environment variables
2. Verify CSP configuration
3. Monitor browser console for errors
4. Test with debug panel
5. Validate network requests

## Best Practices

### Event Naming
- Use consistent naming conventions
- Include relevant context in event names
- Group related events logically

### Custom Properties
- Include meaningful metadata
- Avoid sensitive information
- Use consistent property names

### Performance
- Track only meaningful events
- Avoid excessive event frequency
- Use appropriate sampling rates

### Privacy
- Anonymize user data
- Respect user preferences
- Follow data protection regulations

## See Also

- [Microsoft Clarity Documentation](https://docs.microsoft.com/en-us/clarity/)
- [Performance Optimization](Performance-Optimization.md)
- [Security Implementation](Security-Implementation.md)
- [User Interface Guide](User-Interface-Guide.md)