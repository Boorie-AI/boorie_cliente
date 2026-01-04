# Análisis y Plan de Optimización Boorie

## 1. Análisis del Código y Arquitectura Actual

### Arquitectura General
Boorie es una aplicación de escritorio construida con **Electron**, utilizando **React** para el frontend y un backend modular en **Node.js** que se ejecuta dentro del proceso principal de Electron (o como servicios importados).

*   **Frontend**: React + Vite + TailwindCSS. Estructura de componentes clara.
*   **Backend**: Servicios TypeScript modulares (`backend/services`).
*   **Base de Datos**: SQLite (vía Prisma ORM).
*   **Comunicación**: IPC (Inter-Process Communication) entre Electron Main y Renderer.
*   **IA/RAG**: Implementación personalizada de RAG y gestión de proveedores de IA (OpenAI, Anthropic, Ollama).

### Estado Actual del RAG y Agentes
Actualmente, el sistema cuenta con dos implementaciones de RAG:
1.  **HydraulicRAGService**: Un RAG clásico que usa embeddings y búsqueda vectorial en SQLite (vía Prisma).
2.  **AgenticRAGService**: Un flujo de trabajo agéntico personalizado basado en grafos (nodos) que implementa pasos como `Retrieve`, `Grade`, `Generate`, `Reformulate`, `WebSearch`.

**Observaciones:**
*   La implementación "agéntica" actual es una máquina de estados personalizada (`StateManager` + `Nodes`). Aunque funcional, reinventa la rueda en lugar de usar frameworks establecidos como **LangChain** o **LangGraph**, lo que dificulta la mantenibilidad y la extensión.
*   No hay un sistema formal de **Memoria** conversacional a largo plazo integrado profundamente en el flujo RAG.
*   No existe un mecanismo de **RLHF** (Reinforcement Learning from Human Feedback) para recoger feedback del usuario y mejorar el sistema.

## 2. Plan de Optimización y Mejoras

### Objetivos
1.  **Migración a LangChain**: Reemplazar la orquestación personalizada por LangChain/LangGraph para aprovechar su ecosistema y robustez.
2.  **Implementación de Memoria**: Dotar al agente de memoria conversacional persistente (Short-term y Long-term).
3.  **Sistema RLHF**: Implementar captura de feedback y almacenamiento para futura optimización.
4.  **Optimización de Rendimiento**: Mejorar la recuperación y generación.

### Soluciones Propuestas

#### A. Red Agéntica basada en LangChain
Implementar un grafo de agentes utilizando **LangGraph** (o LangChain RunnableSequences) que replique y mejore el flujo actual:
*   **Nodos**:
    *   `Retriever`: Búsqueda híbrida (vectorial + keywords).
    *   `Grader`: Evaluar relevancia usando LLM (LangChain output parsers).
    *   `Generator`: Generar respuesta final.
    *   `HallucinationGrader`: Verificar si la respuesta se basa en documentos.
    *   `AnswerGrader`: Verificar si la respuesta responde la pregunta.
*   **Ventajas**: Manejo de estado nativo, facilidad para añadir herramientas (WebSearch, Calculator), trazabilidad (LangSmith si se desea).

#### B. Memoria (Memory)
*   **Short-term**: `ConversationBufferWindowMemory` o similar, almacenado en la sesión activa.
*   **Long-term**: Almacenar resúmenes de conversaciones y "hechos" extraídos en la base de datos (Prisma) asociados al usuario/proyecto.
*   **Integración**: Inyectar el historial relevante en el prompt del `Generator`.

#### C. RLHF (Feedback Loop)
*   **Frontend**: Añadir botones de 👍/👎 y campo de texto para corrección en cada respuesta del chat.
*   **Backend**:
    *   Nuevo modelo en Prisma `Feedback`.
    *   Almacenar: `query`, `response`, `rating`, `correction`, `context` (documentos usados).
    *   **Uso**: Estos datos se usarán para:
        1.  Evaluar la calidad del RAG (métricas offline).
        2.  Few-shot prompting dinámico (inyectar ejemplos de correcciones previas).
        3.  Futuro fine-tuning de modelos pequeños (ej. Llama-3-8b).

#### D. Mejoras de Funcionalidad
1.  **Citas Precisas**: Mejorar el prompt para que las citas sean estrictas y verificables.
2.  **Soporte Multimodal**: Preparar la arquitectura para aceptar imágenes (planos) en el futuro.
3.  **Web Search Tool**: Integrar Tavily o DuckDuckGo vía LangChain tools.

## 3. Plan de Implementación

1.  **Instalación de Dependencias**:
    *   `langchain`, `@langchain/core`, `@langchain/community`, `@langchain/openai` (compatible con Ollama).

2.  **Refactorización del Servicio RAG (`AgenticRAGService`)**:
    *   Crear `LangChainRAGService`.
    *   Definir el grafo de ejecución.
    *   Conectar con Prisma para recuperación de documentos.

3.  **Implementación de Memoria**:
    *   Modificar el esquema de Prisma para guardar historial de chat (si no existe ya una estructura robusta).
    *   Integrar `RunnableWithMessageHistory`.

4.  **Implementación de RLHF**:
    *   Crear endpoint/IPC para recibir feedback.
    *   Crear tabla `Feedback` en Prisma.

5.  **Validación**:
    *   Probar con preguntas técnicas de hidráulica.
    *   Verificar persistencia de memoria.

---
*Este plan servirá como hoja de ruta para las siguientes tareas de codificación.*
