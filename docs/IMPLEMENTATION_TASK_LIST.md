# Plan de Implementación y Seguimiento de Tareas

## Estado del Proyecto
**Inicio:** 2025-12-09
**Estado General:** En Progreso

## 1. Configuración e Instalación
- [x] Instalación de dependencias de LangChain (`langchain`, `@langchain/core`, `@langchain/community`, `@langchain/openai`)

## 2. Base de Datos (Prisma)
- [x] Definir modelo `Feedback` para RLHF.
- [x] Definir modelo para `LongTermMemory` (hechos extraidos).
- [x] Ejecutar migración de base de datos.

## 3. Backend: Implementación de LangChain RAG
- [x] Crear servicio `EmbeddingService` (OpenAI/Ollama).
- [x] Crear servicio `LangChainRAGService`.
- [x] Implementar flujo Agentic (Retrieval -> Geneartion).
- [x] Conectar con IPC de Electron (`agentic-rag-query`).

## 4. Backend: Sistema de Memoria
- [x] Implementar Memoria a Corto Plazo (BufferWindow logic in Service).
- [x] Persistencia de mensajes en DB (Message table).

## 5. Backend: RLHF (Feedback Loop)
- [x] Crear endpoints/IPC para recibir feedback.
- [x] Implementar método `saveFeedback` en servicio.

## 6. Análisis y Corrección: Simulación y Mapas
- [x] Analizar `WNTRAdvancedMapViewer` y `WNTRMapViewer`.
- [x] **FIX CRÍTICO**: `WNTRMapViewer` no recibía props de datos. Se refactorizó para aceptar `networkData` y `simulationResults`.
- [x] Refactorizar `WNTRAdvancedMapViewer` para pasar los datos al componente hijo.

## 7. Sistema de Q&A Automatizado
- [x] Crear script de pruebas `scripts/qa_system.ts`.
- [x] Ejecutar script de validación (Validación de código estático exitosa, ejecución en entorno local requiere configuración de dependencias `tsx/ts-node`).

## Próximos Pasos (Usuario)
- Configurar claves de API (OpenAI) en `.env` o Base de Datos.
- Ejecutar la aplicación (`npm run dev` + `npm run electron:start`) para verificar integración completa.
