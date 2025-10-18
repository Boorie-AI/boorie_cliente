# Architecture Overview

## System Architecture

Boorie is built as a modern Electron application with a React frontend, TypeScript backend, and Python integration for hydraulic analysis. The architecture is designed for scalability, maintainability, and specialized hydraulic engineering workflows.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    User Interface                       │
│               (React + TypeScript)                      │
└─────────────────────┬───────────────────────────────────┘
                      │
                      │ IPC Communication
                      │
┌─────────────────────▼───────────────────────────────────┐
│                Electron Main Process                    │
│               (TypeScript + Node.js)                    │
├─────────────────────┬───────────────────────────────────┤
│                     │                                   │
│   ┌─────────────────▼────────┐  ┌─────────────────────┐ │
│   │    Backend Services      │  │    Python Services  │ │
│   │  (Database, AI, Chat)    │  │   (WNTR, Analysis)  │ │
│   └──────────────────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## Technology Stack

### Frontend Layer
- **React 18**: Modern UI library with hooks and concurrent features
- **TypeScript**: Type safety and enhanced developer experience
- **Vite**: Fast build tool and development server
- **TailwindCSS**: Utility-first CSS framework
- **Zustand**: Lightweight state management
- **Radix UI**: Accessible component primitives
- **Framer Motion**: Animation library

### Backend Layer
- **Electron 28**: Cross-platform desktop framework
- **Node.js**: JavaScript runtime for backend services
- **TypeScript**: Backend type safety and consistency
- **Prisma ORM**: Database toolkit and query builder
- **SQLite**: Embedded database for local storage

### Integration Layer
- **Python 3.8+**: Hydraulic analysis and WNTR integration
- **WNTR**: Water Network Tool for Resilience
- **NumPy/SciPy**: Scientific computing libraries
- **Matplotlib**: Plotting and visualization

### External Services
- **AI Providers**: OpenAI, Anthropic, Google, OpenRouter, Ollama
- **Analytics**: Microsoft Clarity for usage tracking
- **Maps**: Mapbox for geographic visualization
- **Visualization**: vis-network for network diagrams

## Detailed Architecture

### Frontend Architecture

```
src/
├── components/           # React components
│   ├── ui/              # Reusable UI components
│   ├── chat/            # Chat interface components
│   ├── hydraulic/       # Engineering-specific components
│   └── layout/          # Layout and navigation
├── services/            # Frontend services
│   ├── api/             # API communication
│   ├── clarity.ts       # Analytics service
│   └── database/        # Database interfaces
├── stores/              # State management
│   ├── authStore.ts     # Authentication state
│   ├── chatStore.ts     # Chat conversations
│   ├── appStore.ts      # Application state
│   └── preferencesStore.ts # User preferences
├── types/               # TypeScript definitions
│   ├── electron.d.ts    # Electron API types
│   ├── hydraulic.ts     # Engineering types
│   └── api.ts           # API response types
└── hooks/               # Custom React hooks
    ├── useClarity.ts    # Analytics hooks
    ├── useHydraulic.ts  # Engineering hooks
    └── useDatabase.ts   # Database hooks
```

### Backend Architecture

```
backend/
├── models/              # Data models
│   ├── index.ts         # Model exports
│   ├── User.ts          # User model
│   ├── Project.ts       # Project model
│   └── Calculation.ts   # Calculation model
├── services/            # Business logic services
│   ├── database.service.ts      # Database operations
│   ├── conversation.service.ts  # Chat management
│   ├── aiProvider.service.ts    # AI integration
│   └── hydraulic/              # Engineering services
│       ├── contextProcessor.ts  # Context processing
│       ├── ragService.ts       # Knowledge retrieval
│       ├── calculatorWrapper.ts # Calculation wrapper
│       ├── wntrService.py      # Python WNTR service
│       └── wntrWrapper.ts      # TypeScript wrapper
└── utils/               # Utility functions
    ├── logger.ts        # Logging utilities
    ├── encryption.ts    # Data encryption
    └── validation.ts    # Input validation
```

### Electron Architecture

```
electron/
├── main.ts              # Main process entry point
├── preload.ts           # Preload script for IPC
├── handlers/            # IPC handlers
│   ├── index.ts         # Handler registration
│   ├── chat.handler.ts  # Chat operations
│   ├── database.handler.ts # Database operations
│   ├── hydraulic.handler.ts # Engineering operations
│   └── wntr.handler.ts  # WNTR operations
└── services/            # System services
    ├── authService.ts   # Authentication
    ├── securityService.ts # Security features
    └── windowManager.ts # Window management
```

## Data Flow Architecture

### 1. User Interface Layer
```typescript
// React Component
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

### 2. State Management Layer
```typescript
// Zustand Store
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

### 3. IPC Communication Layer
```typescript
// Preload Script (electron/preload.ts)
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

### 4. Handler Layer
```typescript
// IPC Handler (electron/handlers/hydraulic.handler.ts)
export class HydraulicHandler {
  constructor(private services: ServiceContainer) {}
  
  async calculate(params: CalculationParams): Promise<CalculationResult> {
    try {
      const result = await this.services.hydraulicService.calculate(params);
      
      // Log the calculation
      this.services.logger.info('Calculation completed', {
        type: params.type,
        success: true
      });
      
      return result;
    } catch (error) {
      this.services.logger.error('Calculation failed', { error });
      throw error;
    }
  }
}
```

### 5. Service Layer
```typescript
// Backend Service (backend/services/hydraulic/calculatorWrapper.ts)
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
  
  private async executePythonScript(command: string[]): Promise<any> {
    return new Promise((resolve, reject) => {
      const process = spawn(this.pythonPath, command);
      // Handle process execution...
    });
  }
}
```

### 6. Database Layer
```typescript
// Database Service (backend/services/database.service.ts)
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
  
  async updateProject(project: HydraulicProject): Promise<HydraulicProject> {
    return await this.prisma.hydraulicProject.update({
      where: { id: project.id },
      data: {
        name: project.name,
        description: project.description,
        updatedAt: new Date()
      }
    });
  }
}
```

## Security Architecture

### Process Isolation
```typescript
// Context Isolation in Electron
const preloadScript = {
  // Safe API exposure
  electronAPI: {
    // Only expose necessary methods
    database: {
      getProject: (id: string) => ipcRenderer.invoke('db:getProject', id)
    }
  }
};

// No direct Node.js access in renderer
// No eval() or unsafe code execution
// Strict Content Security Policy
```

### Data Encryption
```typescript
// Encryption Service (backend/services/encryption.service.ts)
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

### Authentication Architecture
```typescript
// OAuth Service (electron/services/authService.ts)
export class AuthService {
  private oauthServer: http.Server;
  private readonly CALLBACK_PORT = 8020;
  
  async authenticateWithGoogle(): Promise<AuthResult> {
    const authUrl = this.buildGoogleAuthUrl();
    
    // Open external browser
    shell.openExternal(authUrl);
    
    // Wait for callback
    const authCode = await this.waitForCallback();
    
    // Exchange code for tokens
    const tokens = await this.exchangeCodeForTokens(authCode);
    
    // Store encrypted tokens
    await this.storeTokensSecurely(tokens);
    
    return { success: true, user: tokens.user };
  }
}
```

## Performance Architecture

### Lazy Loading
```typescript
// Component Lazy Loading
const HydraulicCalculator = lazy(() => import('./components/hydraulic/HydraulicCalculator'));
const WNTRViewer = lazy(() => import('./components/hydraulic/WNTRViewer'));

// Route-based code splitting
const AppRoutes = () => (
  <Suspense fallback={<LoadingSpinner />}>
    <Routes>
      <Route path="/hydraulic" element={<HydraulicCalculator />} />
      <Route path="/wntr" element={<WNTRViewer />} />
    </Routes>
  </Suspense>
);
```

### Caching Strategy
```typescript
// Multi-level caching
export class CacheManager {
  private memoryCache = new Map<string, any>();
  private diskCache = new Map<string, string>();
  
  async get<T>(key: string): Promise<T | null> {
    // Level 1: Memory cache
    if (this.memoryCache.has(key)) {
      return this.memoryCache.get(key);
    }
    
    // Level 2: Disk cache
    if (this.diskCache.has(key)) {
      const data = await this.readFromDisk(this.diskCache.get(key)!);
      this.memoryCache.set(key, data);
      return data;
    }
    
    return null;
  }
  
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    // Store in memory
    this.memoryCache.set(key, value);
    
    // Store on disk for persistence
    const filePath = await this.writeToDisk(key, value);
    this.diskCache.set(key, filePath);
    
    // Set TTL if specified
    if (ttl) {
      setTimeout(() => this.delete(key), ttl);
    }
  }
}
```

### Background Processing
```typescript
// Worker Threads for Heavy Computations
import { Worker, isMainThread, parentPort } from 'worker_threads';

if (isMainThread) {
  // Main thread - dispatch work
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
} else {
  // Worker thread - process work
  parentPort?.on('message', async (message) => {
    try {
      if (message.type === 'PROCESS_NETWORK') {
        const result = await processNetworkData(message.data);
        parentPort?.postMessage({ success: true, data: result });
      }
    } catch (error) {
      parentPort?.postMessage({ success: false, error: error.message });
    }
  });
}
```

## Scalability Considerations

### Modular Design
- **Feature-based modules**: Each major feature is self-contained
- **Plugin architecture**: Easy to add new calculation types
- **Service-oriented**: Clear separation of concerns
- **Interface-driven**: Well-defined contracts between layers

### Database Scalability
```sql
-- Optimized database schema
CREATE INDEX idx_hydraulic_projects_user_id ON hydraulic_projects(user_id);
CREATE INDEX idx_calculations_project_id ON hydraulic_calculations(project_id);
CREATE INDEX idx_documents_project_id ON project_documents(project_id);

-- Partitioning for large datasets
CREATE TABLE calculation_results_2024 PARTITION OF calculation_results
FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');
```

### Memory Management
```typescript
// Memory optimization strategies
export class MemoryManager {
  private readonly MAX_MEMORY_USAGE = 512 * 1024 * 1024; // 512MB
  
  async processLargeFile(filePath: string): Promise<void> {
    const stream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });
    
    for await (const chunk of stream) {
      await this.processChunk(chunk);
      
      // Check memory usage
      const usage = process.memoryUsage();
      if (usage.heapUsed > this.MAX_MEMORY_USAGE) {
        // Force garbage collection
        if (global.gc) {
          global.gc();
        }
        
        // Add backpressure
        await this.sleep(100);
      }
    }
  }
}
```

## Error Handling Architecture

### Global Error Handling
```typescript
// Global error boundary
export class GlobalErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }
  
  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }
  
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log to analytics
    clarityService.trackEvent('react_error', {
      error_message: error.message,
      error_stack: error.stack,
      component_stack: errorInfo.componentStack
    });
    
    // Log to file
    logger.error('React component error', { error, errorInfo });
    
    // Report to error service
    errorReportingService.report(error, errorInfo);
  }
  
  render() {
    if (this.state.hasError) {
      return <ErrorFallback error={this.state.error} />;
    }
    
    return this.props.children;
  }
}
```

### Service Error Handling
```typescript
// Service-level error handling
export abstract class BaseService {
  protected logger: Logger;
  
  protected async executeWithErrorHandling<T>(
    operation: () => Promise<T>,
    context: string
  ): Promise<Result<T>> {
    try {
      const result = await operation();
      return { success: true, data: result };
    } catch (error) {
      this.logger.error(`${context} failed`, { error });
      
      // Classify error
      const errorType = this.classifyError(error);
      
      // Report if necessary
      if (errorType === 'CRITICAL') {
        await this.reportCriticalError(error, context);
      }
      
      return {
        success: false,
        error: error.message,
        errorType,
        retryable: this.isRetryableError(error)
      };
    }
  }
}
```

## Monitoring and Observability

### Logging Architecture
```typescript
// Structured logging
export class Logger {
  private winston: winston.Logger;
  
  constructor() {
    this.winston = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' }),
        new winston.transports.Console({
          format: winston.format.simple()
        })
      ]
    });
  }
  
  info(message: string, meta?: any) {
    this.winston.info(message, { ...meta, timestamp: new Date() });
  }
  
  error(message: string, meta?: any) {
    this.winston.error(message, { ...meta, timestamp: new Date() });
  }
}
```

### Metrics Collection
```typescript
// Performance metrics
export class MetricsCollector {
  private metrics = new Map<string, number[]>();
  
  recordTiming(operation: string, duration: number) {
    if (!this.metrics.has(operation)) {
      this.metrics.set(operation, []);
    }
    
    this.metrics.get(operation)!.push(duration);
    
    // Send to analytics
    clarityService.trackEvent('performance_metric', {
      operation,
      duration,
      timestamp: Date.now()
    });
  }
  
  getAverageTime(operation: string): number {
    const times = this.metrics.get(operation) || [];
    return times.reduce((a, b) => a + b, 0) / times.length;
  }
}
```

## Deployment Architecture

### Build Process
```typescript
// Build configuration
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
    target: 'node18',
    optimization: {
      bundling: false, // Keep Node.js modules separate
      minify: false    // Preserve debugging info
    }
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

### Distribution Strategy
```yaml
# GitHub Actions workflow
name: Build and Release
on:
  push:
    tags: ['v*']

jobs:
  build:
    strategy:
      matrix:
        os: [macos-latest, windows-latest, ubuntu-latest]
    
    runs-on: ${{ matrix.os }}
    
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Setup Python environment
        run: ./setup-python-wntr.sh
      
      - name: Build application
        run: npm run build
      
      - name: Create distribution
        run: npm run dist
      
      - name: Upload artifacts
        uses: actions/upload-artifact@v2
        with:
          name: ${{ matrix.os }}-dist
          path: dist-electron/
```

This architecture provides a solid foundation for a complex desktop application with specialized engineering capabilities, while maintaining good separation of concerns, security, and scalability.