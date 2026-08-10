# Unified Wisdom Center

## Descripción

El **Unified Wisdom Center** es una interfaz consolidada que fusiona la gestión de documentos con el catálogo de conocimiento hidráulico de Boorie, proporcionando una experiencia unificada para administrar toda la base de conocimiento.

## Características Principales

### 🔗 **Vista Unificada Simplificada**
- **📚 All Documents**: Vista única que incluye todos los documentos (subidos + catálogo)
- **Distinción visual**: Los documentos se distinguen por badges y iconos (Uploaded vs Catalog)
- **Filtrado inteligente**: Búsqueda y filtros integrados sin necesidad de pestañas separadas

### 📊 **Vistas Flexibles**
- **Vista Grid**: Organización en tarjetas para exploración visual
- **Vista Lista**: Información detallada en formato tabular
- Alternancia fácil entre vistas con controles intuitivos

### ⚡ **Funcionalidades Avanzadas**

#### Gestión de Documentos
- **Subida de documentos** con soporte avanzado para PDF
- **Procesamiento inteligente** con extracción de metadatos
- **Eliminación selectiva** de documentos subidos
- **Categorización automática** por tipo de contenido

#### Búsqueda y Filtrado
- **Búsqueda semántica RAG** (Shift+Enter) con IA
- **Búsqueda textual simple** con filtrado en tiempo real
- **Filtros por categoría**: Fuentes, Hidráulica, Bombeo, Redes, etc.
- **Filtros por región**: MX, CO, ES, y otros códigos de país

#### Catálogo Preindexado
- **Vista jerárquica** por secciones técnicas expandibles
- **Estado de indexación** claramente visible (✓ Indexed / ○ Not Indexed)
- **Indexación bajo demanda** con un solo clic
- **Metadatos completos**: páginas, tamaño, temas, descripción

#### Configuración de Embeddings
- **Múltiples proveedores** de embeddings soportados (OpenAI, Ollama)
- **Cambio dinámico** entre modelos de embedding
- **Detección automática de Ollama** con modelos locales
- **Estado en tiempo real** de conexión con Ollama
- **Recomendaciones de modelos** populares para embedding

### 🛠 **Arquitectura Técnica**

#### Componente Principal
```typescript
UnifiedWisdomPanel.tsx
```
- Fusiona funcionalidades de `RAGPanel` y `WisdomCatalog`
- Estado unificado para documentos y entradas de catálogo
- Interfaces TypeScript para type safety

#### APIs Integradas
- **IPC Electron**: Comunicación segura con el backend
- **wisdom:upload**: Subida y procesamiento de documentos
- **wisdom:search**: Búsqueda semántica con RAG
- **wisdom:list**: Listado con filtros avanzados
- **wisdom:getCatalog**: Acceso al catálogo preindexado
- **wisdom:indexFromCatalog**: Indexación de documentos del catálogo

#### Manejo de Errores
- **Verificación de API**: Comprobación de disponibilidad de electronAPI
- **Reintentos automáticos**: Sistema de retry en caso de fallos temporales
- **Mensajes informativos**: Feedback claro al usuario sobre el estado

### 📚 **Tipos de Documentos Soportados**

#### Documentos Subidos
- **PDF**: Procesamiento avanzado con extracción de contenido
- **TXT/MD**: Procesamiento directo de texto
- **DOC/DOCX**: Soporte para documentos de Word

#### Catálogo Preindexado
- **Manuales técnicos** de ingeniería hidráulica
- **Regulaciones regionales** (México, Colombia, España)
- **Mejores prácticas** de la industria
- **Referencias de fórmulas** con ejemplos

### 🎯 **Casos de Uso**

#### Para Ingenieros Hidráulicos
1. **Consulta rápida** de regulaciones por región
2. **Búsqueda semántica** de soluciones técnicas
3. **Acceso centralizado** a documentación técnica
4. **Gestión de proyectos** con documentos asociados

#### Para Equipos de Trabajo
1. **Colaboración en documentos** compartidos
2. **Indexación distribuida** del catálogo
3. **Búsqueda unificada** en toda la base de conocimiento
4. **Versionado y control** de documentos técnicos

### 🔧 **Configuración y Uso**

#### Navegación
- Acceso desde el sidebar: **"Wisdom Center"**
- Vista única con filtros integrados
- Controles de vista (Grid/Lista) en la esquina superior derecha

#### Búsqueda
- **Búsqueda simple**: Escribir y presionar Enter
- **Búsqueda RAG**: Shift+Enter para búsqueda semántica
- **Filtros**: Usar selects de categoría y región

#### Gestión
- **Subir documentos**: Botón "Add Document"
- **Eliminar documentos**: Icono de papelera en documentos subidos
- **Indexar catálogo**: Botón "Index" en documentos no indexados

#### Configuración de Ollama
- **Detección automática**: Verifica si Ollama está ejecutándose en `localhost:11434`
- **Indicador de estado**: Muestra Available/Offline/Checking en tiempo real
- **Modelos auto-detectados**: Filtra automáticamente modelos de embedding disponibles
- **Configuración en Settings**: Dropdown expandido con información detallada sobre modelos
- **Comandos de instalación**: Instrucciones directas para instalar modelos populares

### 📊 **Estadísticas y Métricas**

#### Footer Informativo
- **Total de documentos**: Conteo completo de la base de conocimiento
- **Documentos subidos**: Número de documentos del usuario
- **Catálogo disponible**: Documentos en el catálogo preindexado
- **Estado de indexación**: Documentos indexados del catálogo

#### Indicadores Visuales
- **Badges de tipo**: Distinción clara entre Uploaded y Catalog
- **Estados de indexación**: Indicadores visuales claros (✓ Indexed / ○ Not Indexed)
- **Progreso de carga**: Spinners durante operaciones
- **Iconos distintivos**: Diferentes iconos por fuente de documento

### 🚀 **Beneficios Clave**

#### Experiencia de Usuario
- **Interfaz simplificada**: Vista única sin pestañas confusas
- **Navegación intuitiva**: Controles familiares y filtros claros
- **Respuesta inmediata**: Feedback visual en todas las operaciones

#### Eficiencia Operativa
- **Búsqueda potenciada por IA**: Resultados más precisos y relevantes
- **Gestión centralizada**: Elimina la necesidad de múltiples interfaces
- **Acceso rápido**: Documentos técnicos al alcance de un clic

#### Escalabilidad
- **Arquitectura modular**: Fácil extensión de funcionalidades
- **APIs bien definidas**: Integración con otros sistemas
- **Soporte multi-proveedor**: Flexibilidad en la elección de embeddings

## Instalación y Configuración

### Requisitos Previos
1. **Node.js 18+** para el entorno de desarrollo
2. **Python 3.10 – 3.13** con WNTR para funcionalidades hidráulicas
3. **Electron 28+** para la aplicación de escritorio

### Comandos de Desarrollo
```bash
# Instalar dependencias
npm install

# Desarrollo (con build automático de Electron)
npm run dev

# Build completo
npm run build

# Solo frontend
npm run build:vite

# Solo Electron
npm run build:electron
```

### Variables de Entorno
```env
DATABASE_URL=file:./prisma/hydraulic.db
PYTHON_PATH=/path/to/python/with/wntr
```

## Solución de Problemas

### API No Disponible
- **Síntoma**: "Electron API not available" en consola
- **Solución**: Ejecutar `npm run build:electron` antes de `npm run dev`

### Documentos No Se Cargan
- **Síntoma**: Lista vacía de documentos
- **Solución**: Verificar permisos de base de datos y conexión

### Búsqueda RAG No Funciona
- **Síntoma**: Error en búsqueda semántica
- **Solución**: Configurar provider de embeddings en Settings

### Catálogo Vacío
- **Síntoma**: No se muestran documentos del catálogo
- **Solución**: Verificar estructura de carpetas `rag-knowledge/`

## Contribución

### Estructura de Archivos
```
src/components/wisdom/
├── UnifiedWisdomPanel.tsx    # Componente principal
├── WisdomCatalog.tsx         # Catálogo original (legacy)
└── index.ts                  # Exports

src/types/
└── electron.d.ts             # Definiciones de API
```

### Extensión de Funcionalidades
1. **Nuevos tipos de documento**: Actualizar interfaces TypeScript
2. **Nuevas búsquedas**: Extender opciones de filtrado
3. **Nuevos proveedores**: Agregar a configuración de embeddings

## Roadmap

### Próximas Funcionalidades
- [ ] **Export masivo** de documentos seleccionados
- [ ] **Tags personalizados** para documentos
- [ ] **Historial de búsquedas** para acceso rápido
- [ ] **Sincronización en la nube** para equipos distribuidos
- [ ] **Análisis de relevancia** con métricas avanzadas
- [ ] **Integración con proyectos** hidráulicos específicos

### Mejoras Técnicas
- [ ] **Lazy loading** para listas grandes de documentos
- [ ] **Caching inteligente** de resultados de búsqueda
- [ ] **Optimización de embeddings** para velocidad
- [ ] **Backup automático** de la base de conocimiento
- [ ] **Compresión de documentos** para almacenamiento eficiente

---

**Unified Wisdom Center** representa la evolución natural de la gestión documental en Boorie, proporcionando una plataforma robusta y escalable para el conocimiento técnico en ingeniería hidráulica.