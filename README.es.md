# Boorie - Cliente de Escritorio AI Avanzado para Ingenieros Hidráulicos

![Logo de Boorie](resources/icon.png)

**Boorie** es un cliente de escritorio AI especializado diseñado específicamente para ingenieros hidráulicos. Construido con tecnologías web modernas e integrado con capacidades AI avanzadas, combina chat AI multiproveedores con herramientas especializadas de ingeniería hidráulica, integración WNTR para análisis de redes de agua y funciones completas de gestión de proyectos.

## 🎯 Características Principales

### 🤖 Integración AI Multiproveedores
- **Proveedores Soportados**: OpenAI, Anthropic Claude, Google Gemini, OpenRouter, Ollama
- **Contexto Especializado**: Experiencia en el dominio de ingeniería hidráulica
- **Sistema RAG**: Recuperación de conocimiento de documentación técnica y regulaciones
- **Respuestas Conscientes del Contexto**: Procesamiento de consultas específicas de ingeniería

### 🔧 Herramientas de Ingeniería Hidráulica
- **Integración WNTR**: Análisis con Water Network Tool for Resilience
- **Análisis de Redes**: Cargar y visualizar archivos EPANET (.inp)
- **Simulaciones Hidráulicas**: Ejecutar simulaciones completas de sistemas de agua
- **Motor de Cálculo**: Dimensionado de tuberías, selección de bombas, cálculos de volumen de tanques
- **Cumplimiento Normativo**: Soporte para múltiples estándares regionales

### 📊 Analíticas Avanzadas
- **Microsoft Clarity**: Analíticas completas de comportamiento del usuario
- **Seguimiento de Rendimiento**: Seguimiento especializado para cálculos hidráulicos
- **Monitoreo de Errores**: Seguimiento y reporte de errores en tiempo real
- **Perspectivas de Uso**: Analíticas detalladas para flujos de trabajo de ingeniería

### 🌐 Visualización de Redes
- **Diagramas Interactivos**: Integración vis-network para redes hidráulicas
- **Vistas Geográficas**: Integración Mapbox para análisis espacial
- **Topología de Red**: Análisis de conectividad y componentes
- **Actualizaciones en Tiempo Real**: Visualización dinámica de resultados de simulación

### 🗂️ Gestión de Proyectos
- **Proyectos Hidráulicos**: Crear y gestionar proyectos de ingeniería
- **Gestión de Documentos**: Subir y organizar documentos técnicos
- **Colaboración en Equipo**: Soporte de proyectos multiusuario
- **Control de Versiones**: Seguimiento de cambios y historial de proyectos

## 🚀 Inicio Rápido

### Requisitos Previos
- Node.js 18+ y npm
- Python 3.8+ con pip
- Git

### Instalación

1. **Clonar el repositorio**
   ```bash
   git clone https://github.com/your-username/boorie_cliente.git
   cd boorie_cliente
   ```

2. **Instalar dependencias**
   ```bash
   npm install
   ```

3. **Configurar entorno Python para WNTR**
   ```bash
   ./setup-python-wntr.sh
   ```

4. **Configurar variables de entorno**
   ```bash
   cp .env.example .env
   # Editar .env con tu configuración
   ```

5. **Inicializar base de datos**
   ```bash
   npm run db:generate
   npm run db:push
   ```

6. **Iniciar entorno de desarrollo**
   ```bash
   npm run dev
   ```

## 🛠️ Desarrollo

### Scripts Disponibles

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Iniciar entorno de desarrollo completo |
| `npm run dev:vite` | Solo frontend (http://localhost:3000) |
| `npm run dev:electron` | Solo Electron |
| `npm run build` | Construir frontend y Electron |
| `npm run build:app` | Crear paquetes distribuibles |
| `npm run dist` | Crear paquetes distribuibles (DMG/NSIS/AppImage) |
| `npm run lint` | Ejecutar verificaciones ESLint |
| `npm run lint:fix` | Auto-corregir problemas ESLint |
| `npm run typecheck` | Verificación de tipos TypeScript |

### Comandos de Base de Datos

| Comando | Descripción |
|---------|-------------|
| `npm run db:generate` | Generar cliente Prisma |
| `npm run db:push` | Enviar cambios de esquema |
| `npm run db:migrate` | Ejecutar migraciones de base de datos |

### Comandos Python/WNTR

| Comando | Descripción |
|---------|-------------|
| `./setup-python-wntr.sh` | Configuración inicial entorno WNTR |
| `./activate-wntr.sh` | Activar entorno WNTR |
| `./run-with-wntr.sh` | Ejecutar comandos en entorno WNTR |
| `./check-python-wntr.js` | Verificar instalación WNTR |

## 🏗️ Arquitectura

### Stack Tecnológico
- **Frontend**: React 18 + TypeScript + Vite + TailwindCSS
- **Gestión de Estado**: Zustand + React Context
- **Componentes UI**: Primitivos Radix UI
- **Backend**: Electron 28 + TypeScript + Prisma ORM
- **Base de Datos**: SQLite con soporte de encriptación
- **Analíticas**: Integración Microsoft Clarity
- **Hidráulica**: Integración Python WNTR
- **Visualización**: vis-network + Mapbox
- **Build**: Vite + scripts de build Electron personalizados

### Estructura del Proyecto
```
boorie_cliente/
├── backend/              # Lógica de negocio backend
│   ├── models/           # Modelos de datos
│   └── services/         # Servicios principales
│       └── hydraulic/    # Servicios específicos hidráulicos
├── electron/             # Proceso principal Electron
│   ├── handlers/         # Manejadores IPC por dominio
│   └── services/         # Servicios del sistema
├── src/                  # Frontend React
│   ├── components/       # Componentes UI
│   │   ├── hydraulic/    # Componentes ingeniería hidráulica
│   │   └── ui/           # Componentes UI reutilizables
│   ├── services/         # Servicios frontend
│   ├── stores/           # Gestión estado Zustand
│   └── types/            # Definiciones TypeScript
├── prisma/               # Esquema base de datos
├── rag-knowledge/        # Base de conocimiento hidráulico
│   ├── hydraulics/       # Documentación técnica
│   ├── regulations/      # Estándares regionales
│   └── best-practices/   # Guías de industria
└── venv-wntr/           # Entorno Python WNTR
```

## 🔧 Configuración

### Variables de Entorno

Crear un archivo `.env` en el directorio raíz:

```env
# Analíticas Microsoft Clarity
VITE_CLARITY_PROJECT_ID=tu_proyecto_clarity_id
VITE_CLARITY_ENABLED=true

# Configuración Mapbox
VITE_MAPBOX_ACCESS_TOKEN=tu_token_mapbox
VITE_DEFAULT_MAP_LNG=-70.9
VITE_DEFAULT_MAP_LAT=42.35
VITE_DEFAULT_MAP_ZOOM=9

# Configuración Python
PYTHON_PATH=/ruta/a/python/con/wntr

# Configuración OAuth (Opcional)
MS_CLIENT_ID=tu_microsoft_client_id
GOOGLE_CLIENT_ID=tu_google_client_id
GOOGLE_CLIENT_SECRET=tu_google_secret
```

### Configuración Proveedores AI

Configura tus proveedores AI en los ajustes de la aplicación:

1. **OpenAI**: Requiere clave API
2. **Anthropic Claude**: Requiere clave API
3. **Google Gemini**: Requiere clave API
4. **OpenRouter**: Requiere clave API
5. **Ollama**: Requiere instalación local

## 🌊 Características de Ingeniería Hidráulica

### Integración WNTR
- **Soporte de Archivos**: Importar/exportar archivos EPANET (.inp)
- **Tipos de Simulación**: Análisis hidráulico y de calidad de agua
- **Análisis de Red**: Topología, conectividad y análisis de componentes
- **Exportación de Resultados**: Formato JSON con datos completos

### Motor de Cálculo
- **Dimensionado de Tuberías**: Ecuaciones Darcy-Weisbach y Hazen-Williams
- **Análisis de Bombas**: Análisis de curvas y herramientas de selección
- **Cálculos de Tanques**: Cómputos de volumen y dimensionado
- **Pérdida de Carga**: Cálculos completos de pérdida por fricción

### Estándares Regionales
- **México**: Normas NOM y regulaciones
- **Colombia**: Estándares técnicos y mejores prácticas
- **España**: Normas UNE y regulaciones
- **Internacional**: ISO y otros estándares globales

## 📊 Analíticas y Monitoreo

### Integración Microsoft Clarity
- **Comportamiento del Usuario**: Seguimiento completo de interacciones
- **Métricas de Rendimiento**: Monitoreo de rendimiento de aplicación
- **Seguimiento de Errores**: Detección y reporte de errores en tiempo real
- **Eventos Personalizados**: Seguimiento especializado para operaciones hidráulicas

### Eventos Rastreados
- Cálculos y simulaciones hidráulicas
- Operaciones de análisis WNTR
- Importaciones y exportaciones de archivos
- Actividades de gestión de proyectos
- Interacciones de chat AI
- Ocurrencias de errores y problemas del sistema

## 🔒 Características de Seguridad

- **Aislamiento de Contexto**: Arquitectura Electron segura
- **Almacenamiento Encriptado**: Encriptación de claves API y datos sensibles
- **Integración OAuth**: Autenticación segura con proveedores principales
- **Política de Seguridad de Contenido**: CSP estricta para seguridad web
- **Seguridad IPC**: Comunicación inter-proceso tipo-segura

## 🌍 Internacionalización

Soporte para múltiples idiomas:
- **Inglés** (predeterminado)
- **Español (ES)**
- **Catalán (CA)**

La terminología técnica está localizada para los estándares de ingeniería de cada región.

## 🧪 Pruebas

### Archivos de Prueba
- Archivos de prueba WNTR en `test-files/`
- Guías de pruebas visuales incluidas
- Redes de ejemplo para validación

### Ejecutar Pruebas
```bash
# Pruebas de funcionalidad WNTR
python test-files/test-wntr-complete.py

# Con entorno WNTR
./run-with-wntr.sh python test-files/test-wntr-complete.py
```

## 📦 Construcción y Distribución

### Build de Desarrollo
```bash
npm run build
```

### Distribución de Producción
```bash
npm run dist
```

### Builds Específicos por Plataforma
- **macOS**: Instalador DMG
- **Windows**: Instalador NSIS  
- **Linux**: AppImage

## 🤝 Contribuir

1. Hacer fork del repositorio
2. Crear rama de característica (`git checkout -b feature/caracteristica-increible`)
3. Commit de cambios (`git commit -m 'Añadir característica increíble'`)
4. Push a la rama (`git push origin feature/caracteristica-increible`)
5. Abrir Pull Request

### Guías de Desarrollo
- Seguir mejores prácticas TypeScript
- Usar componentes UI existentes de Radix UI
- Mantener mejores prácticas de seguridad Electron
- Añadir pruebas para nuevos cálculos hidráulicos
- Actualizar documentación para nuevas características

## 📄 Licencia

Este proyecto está licenciado bajo la Licencia MIT - ver el archivo [LICENSE](LICENSE) para detalles.

## 🙏 Reconocimientos

- **Equipo WNTR**: Water Network Tool for Resilience
- **Equipo Electron**: Aplicaciones de escritorio multiplataforma
- **Equipo React**: Biblioteca de interfaz de usuario
- **Comunidad de Ingeniería Hidráulica**: Experiencia del dominio y retroalimentación

## 📞 Soporte

Para soporte y preguntas:
- 📧 Email: support@boorie.com
- 💬 Discord: [Comunidad Boorie](https://discord.gg/boorie)
- 📖 Documentación: [GitHub Wiki](https://github.com/your-username/boorie_cliente/wiki)
- 🐛 Problemas: [GitHub Issues](https://github.com/your-username/boorie_cliente/issues)

## 📚 Documentación Adicional

### Wiki Multiidioma
- 🇺🇸 [English Documentation](docs/wiki/en/Home.md)
- 🇪🇸 [Documentación en Español](docs/wiki/es/Home.md)
- 🇨🇦 [Documentació en Català](docs/wiki/ca/Home.md)

---

**Hecho con ❤️ para Ingenieros Hidráulicos**