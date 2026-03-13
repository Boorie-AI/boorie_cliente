# Boorie v1.3.2 - Plan de Correcciones y Mejoras

## Bugs Criticos (v1.3.2)

### BUG-1: Tablas de base de datos no existen en produccion
- **Estado**: ✅ Corregido
- **Severidad**: CRITICA
- **Afecta**: Wisdom Center (indexar docs), Chat (crear conversaciones), Projects (cargar datos)
- **Error**: `The table 'main.hydraulic_knowledge' does not exist in the current database`
- **Causa raiz**: `prisma db push` solo se ejecuta en modo desarrollo (`if (isDev)`). En produccion, si la DB copiada desde resources no tiene el schema actualizado, las tablas nuevas no existen.
- **Solucion**: Funcion `ensureProductionSchema()` en `electron/main.ts` que ejecuta CREATE TABLE IF NOT EXISTS para las 21 tablas + indices en cada inicio de produccion.

### BUG-2: Python no se detecta en Windows para WNTR
- **Estado**: ✅ Corregido
- **Severidad**: CRITICA
- **Afecta**: Cargar archivos .inp, simulaciones, calculos hidraulicos
- **Error**: Python error code 9009 (el alias `python` redirige a Microsoft Store)
- **Solucion**: Creada utilidad compartida `backend/services/hydraulic/pythonDetector.ts` con deteccion multi-plataforma (macOS, Windows, Linux). Todos los servicios ahora usan esta utilidad.

### BUG-3: Chat no responde consultas / error al crear proyecto
- **Estado**: ✅ Corregido (resuelto con BUG-1)
- **Severidad**: CRITICA

### BUG-4: Proyectos creados no cargan informacion
- **Estado**: ✅ Corregido (resuelto con BUG-1)
- **Severidad**: MEDIA

---

## Mejoras Tecnicas

### TECH-1: Framework de testing
- **Estado**: ✅ Completado
- **Prioridad**: Alta
- **Implementacion**:
  - Vitest configurado en `vite.config.ts` con happy-dom
  - Setup de mocks para electronAPI en `src/test/setup.ts`
  - Scripts: `npm test`, `npm run test:watch`, `npm run test:ui`, `npm run test:coverage`
  - Tests iniciales:
    - `backend/services/hydraulic/pythonDetector.test.ts` (4 tests)
    - `src/stores/preferencesStore.test.ts` (5 tests)

### TECH-2: Completar OAuth Phase 4
- **Estado**: ⏳ Pendiente
- **Prioridad**: Media
- **Descripcion**: Faltan unit tests, integration tests, security testing, error handling robusto

### TECH-3: Wisdom Center - Nuevas funcionalidades
- **Estado**: ✅ Completado
- **Prioridad**: Media
- **Funcionalidades implementadas**:
  - [x] **Export masivo**: Boton Export en toolbar, export JSON/CSV con seleccion de documentos
    - Handler: `wisdom:exportDocuments` en `document.handler.ts`
    - API: `window.electronAPI.wisdom.exportDocuments()`
  - [x] **Tags personalizados**: Usa campo `secondaryCategories` del schema existente
    - Handlers: `wisdom:updateTags`, `wisdom:getAllTags`
    - API: `window.electronAPI.wisdom.updateTags()`, `getAllTags()`
  - [x] **Historial de busquedas**: Dropdown con busquedas recientes
    - Handlers: `wisdom:saveSearchHistory`, `wisdom:getSearchHistory`, `wisdom:clearSearchHistory`
    - Usa modelo `AppSetting` con category `search_history`
  - [x] **Lazy loading / Paginacion**: Endpoint paginado con offset/limit
    - Handler: `wisdom:listPaginated`
    - Soporte para ordenamiento y busqueda
  - [ ] Caching inteligente de resultados (pendiente - requiere store Zustand dedicado)

### TECH-4: Clarity Analytics - Alertas y reportes
- **Estado**: ✅ Completado
- **Prioridad**: Baja
- **Implementacion**:
  - [x] **Servicio de alertas criticas**: `src/services/errorAlertService.ts`
    - Deteccion de patrones de error (5+ errores del mismo tipo en 1 minuto)
    - Notificaciones de escritorio para alertas criticas
    - Tracking en Clarity de alertas disparadas
  - [x] **Metricas y reportes**: Metodo `getMetrics()` y `generateReport()`
    - Errores por tipo y por fuente
    - Conteo de errores criticos
    - Generacion de reporte JSON de sesion
  - [x] **Integracion con error tracking global**: `useGlobalErrorTracking.ts` actualizado
    - Errores JS y promesas rechazadas se rastrean automaticamente

### TECH-5: Wiki multilingue
- **Estado**: ✅ Completado
- **Prioridad**: Baja
- **Traducciones completadas**:
  - ES: 12/12 paginas
  - CA: 12/12 paginas
