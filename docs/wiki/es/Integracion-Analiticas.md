# Integración de Analíticas Microsoft Clarity

## Visión General

Boorie integra Microsoft Clarity para analíticas completas de comportamiento del usuario, monitoreo de rendimiento y seguimiento de errores. Esta integración proporciona perspectivas profundas sobre cómo los ingenieros hidráulicos interactúan con la aplicación y ayuda a optimizar la experiencia del usuario.

## Características

### 📊 Analíticas de Comportamiento del Usuario
- **Grabaciones de Sesión**: Grabaciones visuales de sesiones de usuario
- **Mapas de Calor**: Visualización de comportamiento de clics y desplazamiento
- **Viajes de Usuario**: Seguimiento completo del flujo de trabajo
- **Análisis de Interacción**: Métricas detalladas de interacción de componentes

### 🔍 Monitoreo de Rendimiento
- **Tiempos de Carga**: Rendimiento de carga de aplicación y componentes
- **Uso de Recursos**: Seguimiento de utilización de memoria y CPU
- **Rendimiento de Red**: Monitoreo de API y transferencia de datos
- **Rendimiento de Renderizado**: Métricas de renderizado del frontend

### 🚨 Seguimiento de Errores
- **Errores JavaScript**: Detección y reporte automático de errores
- **Promesas No Manejadas**: Seguimiento de rechazos de promesas
- **Eventos de Error Personalizado**: Reporte manual de errores
- **Contexto de Error**: Información detallada del entorno de error

### 🧮 Seguimiento Hidráulico Especializado
- **Eventos de Cálculo**: Seguimiento de uso de cálculos hidráulicos
- **Operaciones WNTR**: Monitoreo de análisis de redes de agua
- **Procesamiento de Archivos**: Seguimiento de operaciones de archivos EPANET
- **Actividades de Proyecto**: Monitoreo de acciones de gestión de proyectos

## Configuración

### Configuración de Entorno

Añade lo siguiente a tu archivo `.env`:

```env
VITE_CLARITY_PROJECT_ID=ts4zpakpjj
VITE_CLARITY_ENABLED=true
```

### Política de Seguridad de Contenido

La aplicación incluye configuración CSP para permitir scripts de Clarity:

```html
<meta http-equiv="Content-Security-Policy" content="
  script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://www.clarity.ms;
  connect-src 'self' https: https://www.clarity.ms;
">
```

## Detalles de Implementación

### Servicio Principal

La clase `ClarityService` maneja todas las operaciones de Clarity:

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

### Integración React

#### Configuración del Proveedor
```typescript
// src/components/ClarityProvider.tsx
export function ClarityProvider({ children }: ClarityProviderProps) {
  // Inicializa Clarity y proporciona contexto
}
```

#### Uso de Hook
```typescript
// src/hooks/useClarityTracking.ts
export function useClarityTracking() {
  // Funciones de seguimiento especializadas para diferentes características
}
```

### Eventos de Seguimiento

#### Cálculos Hidráulicos
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

#### Análisis WNTR
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

#### Interacciones de Chat
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

#### Gestión de Proyectos
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

#### Operaciones de Archivos
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

### Seguimiento de Errores

#### Manejador Global de Errores
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

## Privacidad de Datos y Cumplimiento

### Recopilación de Datos
- **Sin PII**: No se recopila información de identificación personal
- **Anonimizado**: Todos los datos se anonimizan antes de la transmisión
- **Consentimiento**: Los usuarios pueden optar por no participar en las analíticas en los ajustes de la aplicación
- **Cumplimiento GDPR**: Sigue las regulaciones europeas de protección de datos

### Tipos de Datos Recopilados
- Patrones de uso de la aplicación
- Métricas de rendimiento
- Ocurrencias de errores
- Tasas de adopción de características
- Interacciones de interfaz de usuario
- Información del entorno técnico

### Retención de Datos
- Microsoft Clarity retiene datos según su política de retención
- Los datos pueden exportarse o eliminarse bajo solicitud
- Las grabaciones de sesión pueden deshabilitarse en los ajustes

## Depuración y Desarrollo

### Panel de Depuración
Las compilaciones de desarrollo incluyen un panel de depuración para probar la integración de Clarity:

```typescript
// Eventos de depuración
trackEvent('debug_test_event', {
  test_type: 'manual',
  timestamp: new Date().toISOString()
});
```

### Registro en Consola
En modo de desarrollo, todos los eventos de Clarity se registran en la consola para depuración.

### Eventos de Prueba
```typescript
// Probar todas las funciones de seguimiento
const testAllTracking = () => {
  trackHydraulicCalculation('test', {}, true);
  trackWNTRAnalysis('test', true);
  trackChatMessage('test', 'user', true);
  trackProjectAction('create', 'test', true);
  trackFileOperation('import', 'test');
};
```

## Consideraciones de Rendimiento

### Carga Perezosa
- Los scripts de Clarity se cargan de forma asíncrona
- Sin impacto en el tiempo de inicio de la aplicación
- Degradación elegante si Clarity falla al cargar

### Agrupación de Eventos
- Los eventos se agrupan para reducir las solicitudes de red
- Reintento automático en fallas de red
- Cola de eventos sin conexión

### Uso de Recursos
- Sobrecarga mínima de CPU y memoria
- Tasas de muestreo configurables
- Limpieza automática de datos antiguos

## Solución de Problemas

### Problemas Comunes

1. **Scripts Bloqueados por CSP**
   - Asegurar que CSP incluya `https://www.clarity.ms`
   - Verificar consola del navegador para violaciones CSP

2. **Eventos No Aparecen**
   - Verificar ID del proyecto en variables de entorno
   - Verificar conectividad de red
   - Confirmar acceso al dashboard de Clarity

3. **Impacto en Rendimiento**
   - Monitorear rendimiento de la aplicación
   - Ajustar tasas de muestreo si es necesario
   - Deshabilitar en desarrollo si es necesario

### Pasos de Depuración

1. Verificar variables de entorno
2. Verificar configuración CSP
3. Monitorear consola del navegador para errores
4. Probar con panel de depuración
5. Validar solicitudes de red

## Mejores Prácticas

### Nomenclatura de Eventos
- Usar convenciones de nomenclatura consistentes
- Incluir contexto relevante en nombres de eventos
- Agrupar eventos relacionados lógicamente

### Propiedades Personalizadas
- Incluir metadatos significativos
- Evitar información sensible
- Usar nombres de propiedades consistentes

### Rendimiento
- Seguir solo eventos significativos
- Evitar frecuencia excesiva de eventos
- Usar tasas de muestreo apropiadas

### Privacidad
- Anonimizar datos de usuario
- Respetar preferencias del usuario
- Seguir regulaciones de protección de datos

## Ver También

- [Documentación Microsoft Clarity](https://docs.microsoft.com/en-us/clarity/)
- [Optimización de Rendimiento](Optimizacion-Rendimiento.md)
- [Implementación de Seguridad](Implementacion-Seguridad.md)
- [Guía de Interfaz de Usuario](Guia-Interfaz-Usuario.md)