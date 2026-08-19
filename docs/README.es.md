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

## 📦 Descargar e Instalar

### 🚀 Última Versión - v1.11.0

| Plataforma | Arquitectura | Descarga | Tamaño |
|------------|-------------|----------|--------|
| 🍎 **macOS** | ARM64 (M1/M2/M3) | [Boorie-1.11.0-arm64.dmg](https://github.com/Boorie-AI/boorie_cliente/releases/download/v1.11.0/Boorie-1.11.0-arm64.dmg) | ~279 MB |
| 🪟 **Windows** | x64 | [Boorie-Setup-1.11.0.exe](https://github.com/Boorie-AI/boorie_cliente/releases/download/v1.11.0/Boorie-Setup-1.11.0.exe) | ~223 MB |
| 🐧 **Linux** | x64 | [Boorie-1.11.0.AppImage](https://github.com/Boorie-AI/boorie_cliente/releases/download/v1.11.0/Boorie-1.11.0.AppImage) | ~344 MB |



### 📝 Novedades en v1.11.0
- Tu red se puede ver como **esquema** aunque no se pueda situar en el mapa: una red sin coordenadas, o con un sistema que nadie ha declarado, ya no se queda sin ninguna vista.
- Si tu `.inp` trae coordenadas de dibujo en vez de coordenadas reales, Boorie te lo dice en vez de invitarte a declarar un EPSG que plantaría tu red en otro continente.
- Todos los ajustes del mapa están en un solo panel. Antes estaban en tres sitios y la mayoría no llegaba al dibujo.
- La vista de satélite vuelve: estaba desactivada para todos los equipos y el mensaje culpaba a tu sistema sin haberlo mirado.
- Cambiar el mapa base ya no borra tu red, y con la ventana maximizada ya no se corta la fila de botones.
- El botón «Abrir» de la lista de proyectos abre el proyecto.
- Ver las [notas completas de la release](https://github.com/Boorie-AI/boorie_cliente/releases/tag/v1.11.0).

### 📝 Novedades en v1.10.0
- Boorie ya no adivina el sistema de coordenadas de tu red: te lo pregunta. Un selector nuevo te deja declarar el EPSG —los 120 husos UTM, MAGNA-SIRGAS de Colombia, ETRS89 y ED50 de España, ITRF2008 de México, o cualquier código que escribas— y te enseña dónde va a caer el centro de la red antes de que aceptes.
- Una red sin sistema declarado ya no se dibuja en un sitio inventado: el mapa te dice que falta declararlo y te da el botón. Antes, cualquier red que no encajara en los rangos con los que se programó acababa pintada en el Caribe colombiano sin avisar.
- Cambiar el EPSG recoloca la red al instante, sin volver a cargar el `.inp`.
- Si la red reproyectada cae fuera del país de tu proyecto, Boorie te avisa: es la forma de cazar un huso equivocado antes de trabajar sobre una ubicación falsa.
- Las coordenadas de tu `.inp` no se tocan nunca: la reproyección existe sólo para pintar el mapa.
- Ver las [notas completas de la release](https://github.com/Boorie-AI/boorie_cliente/releases/tag/v1.10.0).

### 📝 Novedades en v1.9.0
- El menú se organiza en tres bloques: lo que pertenece al proyecto activo, las herramientas que funcionan sin él y lo del sistema. Antes era una lista plana donde «Red WNTR» estaba al mismo nivel que «Configuración».
- El nombre del proyecto en el que trabajas está siempre a la vista, y de él cuelgan su red, sus simulaciones y su chat. Sin proyecto activo esos ítems no aparecen y el menú lo dice.
- «Proyectos» te enseña siempre tu lista, con el activo marcado. Antes, con un proyecto abierto, esa pantalla mostraba lo mismo que «Red WNTR» y no había forma de volver a la lista sin cerrar el proyecto.
- El chat general y el chat del proyecto son dos entradas distintas, cada una con sus conversaciones.
- Sin proyecto activo, Boorie abre en Proyectos; con proyecto, sigue abriendo donde lo dejaste.
- Ver las [notas completas de la release](https://github.com/Boorie-AI/boorie_cliente/releases/tag/v1.9.0).

### 📝 Novedades en v1.8.0
- El agente recibe los datos reales de la red cargada —nudos, depósitos, tuberías, longitud total, demanda y rango de diámetros— en lugar de un escueto «hay una red cargada». Antes, a «¿cómo mejoro el flujo en el nudo J3?» respondía consejos genéricos sobre limpiar una junta mecánica, sin enterarse de que J3 es un nudo de tu red.
- Puede consultar un nudo o un tramo concreto cuando se lo preguntas, en vez de responder con cifras aproximadas. En una red de 92 nudos el resumen no cabe entero en la conversación, así que mira sólo lo que necesita para responderte.
- La cabecera del chat indica qué red está viendo el agente. Si no ve ninguna, lo dice y te explica que cargues un archivo .inp en el proyecto.
- Sin proyecto abierto, el chat responde con conocimiento general de ingeniería hidráulica y con tu base de conocimiento, pero ya no describe redes que no tiene delante ni suelta ejemplos numéricos que puedan confundirse con la tuya.
- Cuando el modelo que usas no admite consultas a la red, el agente lo sabe y te dice que no puede mirarlo, en lugar de estimarlo.
- Ver las [notas completas de la release](https://github.com/Boorie-AI/boorie_cliente/releases/tag/v1.8.0).

### 📝 Novedades en v1.7.0
- Si entras en la red hidráulica sin un proyecto activo, Boorie te lo dice y te ofrece elegir uno. Antes te cambiaba la pantalla por la lista de proyectos sin explicar por qué.
- Los ítems del menú que necesitan algo aparecen atenuados y con un candado, y te dicen qué les falta. Siguen pudiéndose pulsar, para que llegues a la pantalla que te lo resuelve.
- El tutorial de primer uso te lleva ahora a crear un proyecto y cargar tu red, en vez de terminar en la calculadora.
- La calculadora sigue funcionando sola, sin pedirte ningún proyecto.
- Los nombres del menú ya salen en tu idioma: «Projects», «Calculator» y «WNTR Network» estaban en inglés.
- Ver las [notas completas de la release](https://github.com/Boorie-AI/boorie_cliente/releases/tag/v1.7.0).

### 📝 Novedades en v1.6.0
- La simulación de interrupción del servicio dice ahora a cuánta gente deja sin agua: habitantes afectados, en qué nudos, cuánto dura el déficit y cuánta agua no llega a entregarse.
- Sale todo de la misma ejecución: no hay que lanzar una segunda simulación ni volver a describir la avería.
- Puedes ajustar el módulo de demanda de tu zona en litros por habitante y día, y el resultado se recalcula.
- Si indicas cuántos habitantes tiene una acometida, Boorie traduce la población a número de clientes afectados.
- Boorie separa lo que causa la avería de lo que la red ya tenía mal, y muestra ambas cifras.
- Las simulaciones de interrupción pasan a calcularse con demanda dependiente de la presión, lo correcto cuando falta agua: antes un nudo con muy poca presión se daba por bien servido y el impacto salía en cero.
- **Fix**: las horas fuera de servicio podían superar la duración de la propia simulación.
- Ver las [notas completas de la release](https://github.com/Boorie-AI/boorie_cliente/releases/tag/v1.6.0).

### 📝 Novedades en v1.5.2
- Un único proyecto activo para toda la aplicación: el chat, la red y el Wisdom Center trabajan sobre el mismo contexto.
- Al cerrar y reabrir Boorie se recupera el último proyecto en el que estabas.
- Si abres una conversación de otro proyecto, Boorie avisa y te deja elegir, para que el asistente no responda con el contexto equivocado.
- Tus redes y cálculos se guardan en el proyecto y no solo en este equipo. Al actualizar se trasladan solos, conservando los datos anteriores.
- Una red guardada se abre aunque hayas movido o borrado el archivo .inp original.
- Los escenarios derivados de una red pueden guardarse colgando de ella, con su propia carpeta de resultados. Se sigue pudiendo guardarlos como proyecto aparte.
- **Fix**: al analizar o simular podía usarse una red distinta de la mostrada en pantalla.
- Ver las [notas completas de la release](https://github.com/Boorie-AI/boorie_cliente/releases/tag/v1.5.2).

<details>
<summary>Novedades en v1.5.1</summary>

- El arranque de Python/WNTR en Windows sobrevive a un reinicio: la ruta del entorno virtual se conserva entre sesiones.
- El asistente de preparación explica **por qué** falla una instalación, en vez de limitarse a «verification-failed», e indica qué paquete falta.
- Rango soportado acotado a **Python 3.10 – 3.13**: WNTR 1.5 no publica rueda para la 3.14. Un entorno fuera de rango se conserva y se recrea.
- **Fix**: «Reindexar» en el Wisdom Center borraba los fragmentos del documento y reportaba éxito sin recrearlos.
- Los indicadores de resiliencia se presentan en tabla con encabezados, distinguiendo el escenario anterior del posterior a la interrupción simulada.
- Los nudos afectados por una interrupción del servicio se resaltan sobre el mapa.
- La curva de fragilidad y los indicadores de resiliencia se pueden exportar a CSV.
- Nueva sección **Acerca de** en Configuración, con la versión instalada y el historial de versiones (#30).
- Ver las [notas completas de la release](https://github.com/Boorie-AI/boorie_cliente/releases/tag/v1.5.1).
</details>

<details>
<summary>Novedades en v1.5.0</summary>

- Nuevas rutinas de resiliencia en el módulo WNTR Network: esqueletización de redes, simulación de interrupción del servicio, indicadores de resiliencia (índice de Todini, entropía de red, redundancia hidráulica) y curvas de fragilidad sísmica.
- **Fix #16**: la interfaz se congelaba al cambiar el modelo de IA de indexación en el Wisdom Center.
- **Fix #17**: el selector de proyecto del Chat no aplicaba la selección, y el LLM no recibía contexto del proyecto hidráulico vinculado.
- Ver las [notas completas de la release](https://github.com/Boorie-AI/boorie_cliente/releases/tag/v1.5.0).
</details>

<details>
<summary>Novedades en v1.4.3</summary>

- **Fix #15**: los proyectos no aparecían en el selector de proyectos del Chat (un solo proyecto con datos corruptos vaciaba silenciosamente toda la lista).
- **Fix #14**: documentos del Wisdom Center atascados en "Not Indexed" en Windows (URL de Ollama hardcodeada a una IP de LAN en vez de `localhost`).
- Refactor del logger de backend y actualización de dependencias.
- Ver las [notas completas de la release](https://github.com/Boorie-AI/boorie_cliente/releases/tag/v1.4.3).
</details>

📖 Documentación completa: [GitHub Wiki](https://github.com/Boorie-AI/boorie_cliente/wiki)

### Instrucciones de Instalación

#### macOS
1. Descarga el archivo DMG del enlace anterior
2. Abre el archivo DMG descargado
3. Arrastra Boorie.app a tu carpeta Aplicaciones
4. Ejecuta Boorie desde Aplicaciones

#### Linux
1. Descarga `Boorie-1.11.0.AppImage` del enlace anterior
2. Dale permisos de ejecución: `chmod +x Boorie-1.11.0.AppImage`
3. Ejecuta: `./Boorie-1.11.0.AppImage`

#### Windows
1. Descarga `Boorie-Setup-1.11.0.exe` del enlace anterior
2. Ejecuta el instalador y sigue el asistente
3. Inicia Boorie desde el Menú Inicio o el acceso directo del Escritorio

### 🔗 Todas las Versiones
Ver todas las versiones disponibles: [**GitHub Releases**](https://github.com/Boorie-AI/boorie_cliente/releases)

## 🛠️ Configuración de Desarrollo

### Requisitos Previos
- Node.js 18+ y npm
- Python 3.10 – 3.13 con pip (la 3.14 no sirve todavía: WNTR no publica paquete para ella)
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
- 🏴󠁥󠁳󠁣󠁴󠁿 [Documentació en Català](docs/wiki/ca/Home.md)

---

**Hecho con ❤️ para Ingenieros Hidráulicos**