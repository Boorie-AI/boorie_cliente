# Visión General de la Arquitectura

## Arquitectura del Sistema

Boorie está construido como una aplicación Electron moderna con un frontend React, un backend TypeScript e integración Python para análisis hidráulico. La arquitectura está diseñada para escalabilidad, mantenibilidad y flujos de trabajo especializados de ingeniería hidráulica.

## Arquitectura de Alto Nivel

```
┌─────────────────────────────────────────────────────────┐
│                  Interfaz de Usuario                     │
│               (React + TypeScript)                       │
└─────────────────────┬───────────────────────────────────┘
                      │
                      │ Comunicación IPC
                      │
┌─────────────────────▼───────────────────────────────────┐
│              Proceso Principal Electron                   │
│               (TypeScript + Node.js)                      │
├─────────────────────┬───────────────────────────────────┤
│                     │                                    │
│   ┌─────────────────▼────────┐  ┌──────────────────────┐│
│   │   Servicios Backend      │  │  Servicios Python     ││
│   │  (BD, AI, Chat)          │  │  (WNTR, Análisis)    ││
│   └──────────────────────────┘  └──────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

## Pila Tecnológica

### Capa Frontend
- **React 18**: Biblioteca UI moderna con hooks y características concurrentes
- **TypeScript**: Seguridad de tipos y experiencia de desarrollador mejorada
- **Vite**: Herramienta de compilación rápida y servidor de desarrollo
- **TailwindCSS**: Framework CSS basado en utilidades
- **Zustand**: Gestión de estado ligera
- **Radix UI**: Primitivos de componentes accesibles
- **Framer Motion**: Biblioteca de animaciones

### Capa Backend
- **Electron 28**: Framework de escritorio multiplataforma
- **Node.js**: Runtime JavaScript para servicios backend
- **TypeScript**: Seguridad de tipos y consistencia en el backend
- **Prisma ORM**: Kit de herramientas de base de datos y constructor de consultas
- **SQLite**: Base de datos embebida para almacenamiento local

### Capa de Integración
- **Python 3.8+**: Análisis hidráulico e integración WNTR
- **WNTR**: Water Network Tool for Resilience
- **NumPy/SciPy**: Bibliotecas de computación científica
- **Matplotlib**: Gráficos y visualización

### Servicios Externos
- **Proveedores AI**: OpenAI, Anthropic, Google, OpenRouter, Ollama
- **Analíticas**: Microsoft Clarity para seguimiento de uso
- **Mapas**: Mapbox para visualización geográfica
- **Visualización**: vis-network para diagramas de red

## Arquitectura Detallada

### Arquitectura del Frontend

```
src/
├── components/           # Componentes React
│   ├── ui/              # Componentes UI reutilizables
│   ├── chat/            # Componentes de interfaz de chat
│   ├── hydraulic/       # Componentes específicos de ingeniería
│   └── layout/          # Diseño y navegación
├── services/            # Servicios del frontend
│   ├── api/             # Comunicación con API
│   ├── clarity.ts       # Servicio de analíticas
│   └── database/        # Interfaces de base de datos
├── stores/              # Gestión de estado
│   ├── authStore.ts     # Estado de autenticación
│   ├── chatStore.ts     # Conversaciones de chat
│   ├── appStore.ts      # Estado de la aplicación
│   └── preferencesStore.ts # Preferencias del usuario
├── types/               # Definiciones TypeScript
│   ├── electron.d.ts    # Tipos de API Electron
│   ├── hydraulic.ts     # Tipos de ingeniería
│   └── api.ts           # Tipos de respuesta API
└── hooks/               # Hooks React personalizados
    ├── useClarity.ts    # Hooks de analíticas
    ├── useHydraulic.ts  # Hooks de ingeniería
    └── useDatabase.ts   # Hooks de base de datos
```

### Arquitectura del Backend

```
backend/
├── models/              # Modelos de datos
│   ├── index.ts         # Exportaciones de modelos
│   ├── User.ts          # Modelo de usuario
│   ├── Project.ts       # Modelo de proyecto
│   └── Calculation.ts   # Modelo de cálculo
├── services/            # Servicios de lógica de negocio
│   ├── database.service.ts      # Operaciones de base de datos
│   ├── conversation.service.ts  # Gestión de chat
│   ├── aiProvider.service.ts    # Integración AI
│   └── hydraulic/              # Servicios de ingeniería
│       ├── contextProcessor.ts  # Procesamiento de contexto
│       ├── ragService.ts       # Recuperación de conocimiento
│       ├── calculatorWrapper.ts # Wrapper de cálculos
│       ├── wntrService.py      # Servicio Python WNTR
│       └── wntrWrapper.ts      # Wrapper TypeScript
└── utils/               # Funciones utilitarias
    ├── logger.ts        # Utilidades de registro
    ├── encryption.ts    # Encriptación de datos
    └── validation.ts    # Validación de entrada
```

### Arquitectura de Electron

```
electron/
├── main.ts              # Punto de entrada del proceso principal
├── preload.ts           # Script preload para IPC
├── handlers/            # Manejadores IPC
│   ├── index.ts         # Registro de manejadores
│   ├── chat.handler.ts  # Operaciones de chat
│   ├── database.handler.ts # Operaciones de base de datos
│   ├── hydraulic.handler.ts # Operaciones de ingeniería
│   └── wntr.handler.ts  # Operaciones WNTR
└── services/            # Servicios del sistema
    ├── authService.ts   # Autenticación
    ├── securityService.ts # Características de seguridad
    └── windowManager.ts # Gestión de ventanas
```

## Arquitectura del Flujo de Datos

### 1. Capa de Interfaz de Usuario
```typescript
// Componente React
function HydraulicCalculator() {
  const { performCalculation } = useHydraulicCalculations();
  const { trackEvent } = useClarity();

  const handleCalculation = async (params) => {
    try {
      const result = await performCalculation(params);
      trackEvent('calculation_success', { type: params.type });
      return result;
    } catch (error) {
      trackEvent('calculation_error', { error: error.message });
      throw error;
    }
  };
}
```

### 2. Capa de Gestión de Estado
```typescript
// Almacén Zustand
export const useAppStore = create<AppState>((set, get) => ({
  hydraulicProjects: [],
  currentProject: null,

  loadProject: async (projectId: string) => {
    const project = await window.electronAPI.database.getProject(projectId);
    set({ currentProject: project });
  },

  updateProject: async (project: HydraulicProject) => {
    await window.electronAPI.database.updateProject(project);
    set({ currentProject: project });
  }
}));
```

### 3. Capa de Comunicación IPC
```typescript
// Script Preload (electron/preload.ts)
const electronAPI = {
  database: {
    getProject: (id: string) => ipcRenderer.invoke('db:getProject', id),
    updateProject: (project: HydraulicProject) =>
      ipcRenderer.invoke('db:updateProject', project)
  },
  hydraulic: {
    calculate: (params: CalculationParams) =>
      ipcRenderer.invoke('hydraulic:calculate', params),
    loadNetwork: (filePath: string) =>
      ipcRenderer.invoke('wntr:loadNetwork', filePath)
  }
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
```

### 4. Capa de Manejadores
```typescript
// Manejador IPC (electron/handlers/hydraulic.handler.ts)
export class HydraulicHandler {
  constructor(private services: ServiceContainer) {}

  async calculate(params: CalculationParams): Promise<CalculationResult> {
    try {
      const result = await this.services.hydraulicService.calculate(params);
      this.services.logger.info('Cálculo completado', {
        type: params.type,
        success: true
      });
      return result;
    } catch (error) {
      this.services.logger.error('Cálculo fallido', { error });
      throw error;
    }
  }
}
```

### 5. Capa de Servicios
```typescript
// Servicio Backend (backend/services/hydraulic/calculatorWrapper.ts)
export class HydraulicCalculatorWrapper {
  private pythonPath: string;
  private scriptPath: string;

  async calculate(params: CalculationParams): Promise<CalculationResult> {
    const command = [
      this.scriptPath,
      '--type', params.type,
      '--params', JSON.stringify(params.values)
    ];

    const result = await this.executePythonScript(command);

    if (!result.success) {
      throw new Error(result.error);
    }

    return result.data;
  }
}
```

### 6. Capa de Base de Datos
```typescript
// Servicio de Base de Datos (backend/services/database.service.ts)
export class DatabaseService {
  private prisma: PrismaClient;

  async getProject(id: string): Promise<HydraulicProject> {
    return await this.prisma.hydraulicProject.findUnique({
      where: { id },
      include: {
        calculations: true,
        documents: true,
        networkData: true
      }
    });
  }
}
```

## Arquitectura de Seguridad

### Aislamiento de Procesos
```typescript
// Aislamiento de Contexto en Electron
const preloadScript = {
  // Exposición segura de API
  electronAPI: {
    // Solo exponer métodos necesarios
    database: {
      getProject: (id: string) => ipcRenderer.invoke('db:getProject', id)
    }
  }
};

// Sin acceso directo a Node.js en el renderer
// Sin eval() ni ejecución de código inseguro
// Política de Seguridad de Contenido estricta
```

### Encriptación de Datos
```typescript
// Servicio de Encriptación
export class EncryptionService {
  private algorithm = 'aes-256-gcm';
  private keyDerivation = 'pbkdf2';

  encrypt(data: string, password: string): EncryptedData {
    const salt = crypto.randomBytes(16);
    const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipher(this.algorithm, key);
    const encrypted = Buffer.concat([
      cipher.update(data, 'utf8'),
      cipher.final()
    ]);

    return {
      encrypted: encrypted.toString('base64'),
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64')
    };
  }
}
```

## Arquitectura de Rendimiento

### Carga Diferida
```typescript
// Carga diferida de componentes
const HydraulicCalculator = lazy(() => import('./components/hydraulic/HydraulicCalculator'));
const WNTRViewer = lazy(() => import('./components/hydraulic/WNTRViewer'));

// División de código basada en rutas
const AppRoutes = () => (
  <Suspense fallback={<LoadingSpinner />}>
    <Routes>
      <Route path="/hydraulic" element={<HydraulicCalculator />} />
      <Route path="/wntr" element={<WNTRViewer />} />
    </Routes>
  </Suspense>
);
```

### Estrategia de Caché
```typescript
// Caché multinivel
export class CacheManager {
  private memoryCache = new Map<string, any>();
  private diskCache = new Map<string, string>();

  async get<T>(key: string): Promise<T | null> {
    // Nivel 1: Caché en memoria
    if (this.memoryCache.has(key)) {
      return this.memoryCache.get(key);
    }

    // Nivel 2: Caché en disco
    if (this.diskCache.has(key)) {
      const data = await this.readFromDisk(this.diskCache.get(key)!);
      this.memoryCache.set(key, data);
      return data;
    }

    return null;
  }
}
```

### Procesamiento en Segundo Plano
```typescript
// Worker Threads para cómputos pesados
import { Worker, isMainThread, parentPort } from 'worker_threads';

if (isMainThread) {
  export class BackgroundProcessor {
    private workers: Worker[] = [];

    async processLargeNetwork(networkData: any): Promise<any> {
      return new Promise((resolve, reject) => {
        const worker = new Worker(__filename);
        worker.postMessage({ type: 'PROCESS_NETWORK', data: networkData });
        worker.on('message', (result) => {
          if (result.success) {
            resolve(result.data);
          } else {
            reject(new Error(result.error));
          }
          worker.terminate();
        });
      });
    }
  }
}
```

## Consideraciones de Escalabilidad

### Diseño Modular
- **Módulos basados en características**: Cada característica principal es autónoma
- **Arquitectura de plugins**: Fácil añadir nuevos tipos de cálculo
- **Orientado a servicios**: Clara separación de responsabilidades
- **Dirigido por interfaces**: Contratos bien definidos entre capas

### Escalabilidad de Base de Datos
```sql
-- Esquema de base de datos optimizado
CREATE INDEX idx_hydraulic_projects_user_id ON hydraulic_projects(user_id);
CREATE INDEX idx_calculations_project_id ON hydraulic_calculations(project_id);
CREATE INDEX idx_documents_project_id ON project_documents(project_id);
```

## Arquitectura de Despliegue

### Proceso de Compilación
```typescript
export const buildConfig = {
  frontend: {
    tool: 'vite',
    outputDir: 'dist',
    optimization: {
      splitChunks: true,
      minify: true,
      treeshaking: true
    }
  },
  backend: {
    tool: 'tsc',
    outputDir: 'dist-electron',
    target: 'node18'
  },
  distribution: {
    tool: 'electron-builder',
    platforms: ['darwin', 'win32', 'linux'],
    formats: {
      darwin: 'dmg',
      win32: 'nsis',
      linux: 'AppImage'
    }
  }
};
```

Esta arquitectura proporciona una base sólida para una aplicación de escritorio compleja con capacidades especializadas de ingeniería, mientras mantiene una buena separación de responsabilidades, seguridad y escalabilidad.
