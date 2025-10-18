# Microsoft Clarity Implementation in Boorie

Esta documentación describe la implementación completa de Microsoft Clarity en la aplicación Boorie.

## Resumen

Microsoft Clarity ha sido implementado completamente en toda la aplicación Boorie para proporcionar analytics detallados de la experiencia del usuario, especialmente para las funcionalidades hidráulicas especializadas.

## Archivos Creados/Modificados

### 1. Configuración del Entorno

**`.env.example`** - Agregado:
```env
# Microsoft Clarity Analytics Configuration
VITE_CLARITY_PROJECT_ID=your_clarity_project_id_here
VITE_CLARITY_ENABLED=true
```

**`.env`** - Configurado con:
```env
VITE_CLARITY_PROJECT_ID=ts4zpakpjj
VITE_CLARITY_ENABLED=true
```

### 2. Servicio Principal de Clarity

**`src/services/clarity.ts`** - Nuevo archivo:
- Clase `ClarityService` con métodos para inicialización segura
- Soporte específico para entorno Electron
- Manejo de Content Security Policy
- Métodos para tracking de eventos, usuarios y sesiones
- Detección automática del entorno (web vs Electron)

### 3. Proveedor React

**`src/components/ClarityProvider.tsx`** - Nuevo archivo:
- Context provider para toda la aplicación
- Hook `useClarity()` para fácil acceso
- HOC `withClarityTracking()` para componentes
- Componente `ClarityEventTracker` para tracking específico
- Inicialización automática con tags de sesión

### 4. Hook Personalizado de Tracking

**`src/hooks/useClarityTracking.ts`** - Nuevo archivo:
- Funciones especializadas para eventos comunes en Boorie:
  - `trackChatMessage()` - Mensajes de chat
  - `trackHydraulicCalculation()` - Cálculos hidráulicos
  - `trackWNTRAnalysis()` - Análisis WNTR
  - `trackFileOperation()` - Operaciones de archivos
  - `trackNavigation()` - Navegación entre vistas
  - `trackFeatureUsage()` - Uso de funcionalidades
  - `trackError()` - Errores de aplicación
  - `trackPerformance()` - Métricas de rendimiento

### 5. Tracking Global de Errores

**`src/hooks/useGlobalErrorTracking.ts`** - Nuevo archivo:
- Captura automática de errores de JavaScript
- Tracking de promesas rechazadas no manejadas
- Integración con Clarity para análisis de errores

### 6. Panel de Debug (Desarrollo)

**`src/components/ClarityDebugPanel.tsx`** - Nuevo archivo:
- Panel flotante solo visible en desarrollo
- Botones de prueba para eventos
- Estado de inicialización de Clarity
- Link directo al dashboard de Clarity

### 7. Configuración de Seguridad

**`index.html`** - Modificado:
```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://www.clarity.ms; worker-src 'self' blob:; child-src 'self' blob:; style-src 'self' 'unsafe-inline' https://api.mapbox.com; img-src 'self' data: https: blob:; connect-src 'self' https: http://localhost:* https://api.mapbox.com https://*.tiles.mapbox.com https://events.mapbox.com https://www.clarity.ms;">
```

### 8. Integración en la Aplicación

**`src/main.tsx`** - Modificado:
```tsx
import { ClarityProvider } from './components/ClarityProvider'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ClarityProvider>
      <App />
    </ClarityProvider>
  </React.StrictMode>,
)
```

**`src/App.tsx`** - Modificado:
- Importación del panel de debug (solo desarrollo)
- Integración del debug panel

### 9. Tracking en Componentes Específicos

**`src/components/chat/ChatLayout.tsx`** - Modificado:
- Tracking de cambios de vista
- Tracking de estado del sidebar

**`src/components/hydraulic/WNTRMainInterface.tsx`** - Modificado:
- Tracking de inicio/finalización de análisis WNTR
- Tracking de errores en análisis
- Tracking de carga de archivos INP

**`src/components/hydraulic/HydraulicCalculator.tsx`** - Modificado:
- Tracking de cálculos hidráulicos
- Tracking de errores en cálculos
- Métricas de éxito/fallo

## Eventos Tracked

### Eventos Principales:
1. **`app_started`** - Inicio de la aplicación
2. **`view_changed`** - Cambio de vista/pantalla
3. **`chat_message_sent`** - Mensaje enviado en chat
4. **`conversation_started`** - Nueva conversación iniciada
5. **`hydraulic_calculation_started`** - Inicio de cálculo hidráulico
6. **`hydraulic_calculation_completed`** - Cálculo completado exitosamente
7. **`hydraulic_calculation_error`** - Error en cálculo
8. **`wntr_file_load_started`** - Inicio de carga de archivo INP
9. **`wntr_file_loaded`** - Archivo INP cargado exitosamente
10. **`wntr_file_load_error`** - Error en carga de archivo
11. **`wntr_analysis_started`** - Inicio de análisis WNTR
12. **`wntr_analysis_completed`** - Análisis WNTR completado
13. **`wntr_analysis_error`** - Error en análisis WNTR
14. **`error_occurred`** - Error general de aplicación
15. **`feature_usage`** - Uso de funcionalidades específicas

### Propiedades de Sesión:
- `app_type`: "electron"
- `app_name`: "boorie"
- `platform`: Sistema operativo

## Configuración de Clarity

### Proyecto ID
- **ID del Proyecto**: `ts4zpakpjj`
- **Dashboard**: https://clarity.microsoft.com/dashboard/project/ts4zpakpjj

### Configuración de Privacidad
- Scripts cargados de forma segura con CSP
- No se trackea información personal identificable
- Tracking de errores sin datos sensibles

## Uso en Desarrollo

### Panel de Debug
En modo desarrollo, se muestra un panel flotante en la esquina inferior derecha con:
- Estado de inicialización de Clarity
- Botones de prueba para eventos
- Link al dashboard de Clarity

### Eventos de Prueba
```typescript
import { useClarityTracking } from '@/hooks/useClarityTracking';

const { trackCustomEvent } = useClarityTracking();

// Ejemplo de uso
trackCustomEvent('custom_event', {
  feature: 'hydraulic_calculator',
  action: 'calculation_completed',
  value: 42.5
});
```

## Beneficios Implementados

1. **Tracking Automático**: Errores de JavaScript y navegación
2. **Métricas Específicas**: Cálculos hidráulicos y análisis WNTR
3. **Debugging Mejorado**: Panel de pruebas en desarrollo
4. **Seguridad**: CSP configurada correctamente
5. **Flexibilidad**: Hooks personalizados para diferentes tipos de eventos
6. **Electron Compatible**: Funciona correctamente en entorno Electron

## Próximos Pasos

1. **Monitoreo**: Revisar dashboard de Clarity regularmente
2. **Optimización**: Usar datos para mejorar UX
3. **Alertas**: Configurar alertas para errores críticos
4. **A/B Testing**: Usar datos para experimentación
5. **Reportes**: Crear reportes automatizados de métricas clave

## Comandos de Verificación

```bash
# Compilar con cambios de Clarity
npm run build:vite
npm run build:electron

# Ejecutar en desarrollo (con panel de debug)
npm run dev
```

## Solución de Problemas

### Si Clarity no se inicializa:
1. Verificar que `VITE_CLARITY_PROJECT_ID` esté configurado
2. Verificar que `VITE_CLARITY_ENABLED=true`
3. Verificar CSP en `index.html`
4. Revisar consola para errores de CSP
5. Usar panel de debug para testing

### CSP Errors:
Si aparecen errores de Content Security Policy, verificar que la CSP incluya:
- `https://www.clarity.ms` en `script-src`
- `https://www.clarity.ms` en `connect-src`