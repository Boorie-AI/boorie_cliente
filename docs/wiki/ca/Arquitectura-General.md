# Visió General de l'Arquitectura

## Arquitectura del Sistema

Boorie està construït com una aplicació Electron moderna amb un frontend React, un backend TypeScript i integració Python per a anàlisi hidràulica. L'arquitectura està dissenyada per a escalabilitat, mantenibilitat i fluxos de treball especialitzats d'enginyeria hidràulica.

## Arquitectura d'Alt Nivell

```
┌─────────────────────────────────────────────────────────┐
│                 Interfície d'Usuari                       │
│               (React + TypeScript)                        │
└─────────────────────┬───────────────────────────────────┘
                      │
                      │ Comunicació IPC
                      │
┌─────────────────────▼───────────────────────────────────┐
│             Procés Principal Electron                     │
│               (TypeScript + Node.js)                      │
├─────────────────────┬───────────────────────────────────┤
│                     │                                    │
│   ┌─────────────────▼────────┐  ┌──────────────────────┐│
│   │   Serveis Backend        │  │  Serveis Python       ││
│   │  (BD, AI, Xat)           │  │  (WNTR, Anàlisi)     ││
│   └──────────────────────────┘  └──────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

## Pila Tecnològica

### Capa Frontend
- **React 18**: Biblioteca UI moderna amb hooks i característiques concurrents
- **TypeScript**: Seguretat de tipus i experiència de desenvolupador millorada
- **Vite**: Eina de compilació ràpida i servidor de desenvolupament
- **TailwindCSS**: Framework CSS basat en utilitats
- **Zustand**: Gestió d'estat lleugera
- **Radix UI**: Primitius de components accessibles
- **Framer Motion**: Biblioteca d'animacions

### Capa Backend
- **Electron 28**: Framework d'escriptori multiplataforma
- **Node.js**: Runtime JavaScript per a serveis backend
- **TypeScript**: Seguretat de tipus i consistència al backend
- **Prisma ORM**: Kit d'eines de base de dades i constructor de consultes
- **SQLite**: Base de dades embeguda per a emmagatzematge local

### Capa d'Integració
- **Python 3.8+**: Anàlisi hidràulica i integració WNTR
- **WNTR**: Water Network Tool for Resilience
- **NumPy/SciPy**: Biblioteques de computació científica
- **Matplotlib**: Gràfics i visualització

### Serveis Externs
- **Proveïdors AI**: OpenAI, Anthropic, Google, OpenRouter, Ollama
- **Analítiques**: Microsoft Clarity per a seguiment d'ús
- **Mapes**: Mapbox per a visualització geogràfica
- **Visualització**: vis-network per a diagrames de xarxa

## Arquitectura Detallada

### Arquitectura del Frontend

```
src/
├── components/           # Components React
│   ├── ui/              # Components UI reutilitzables
│   ├── chat/            # Components d'interfície de xat
│   ├── hydraulic/       # Components específics d'enginyeria
│   └── layout/          # Disseny i navegació
├── services/            # Serveis del frontend
│   ├── api/             # Comunicació amb API
│   ├── clarity.ts       # Servei d'analítiques
│   └── database/        # Interfícies de base de dades
├── stores/              # Gestió d'estat
│   ├── authStore.ts     # Estat d'autenticació
│   ├── chatStore.ts     # Converses de xat
│   ├── appStore.ts      # Estat de l'aplicació
│   └── preferencesStore.ts # Preferències de l'usuari
├── types/               # Definicions TypeScript
└── hooks/               # Hooks React personalitzats
```

### Arquitectura del Backend

```
backend/
├── models/              # Models de dades
├── services/            # Serveis de lògica de negoci
│   ├── database.service.ts      # Operacions de base de dades
│   ├── conversation.service.ts  # Gestió de xat
│   ├── aiProvider.service.ts    # Integració AI
│   └── hydraulic/              # Serveis d'enginyeria
│       ├── contextProcessor.ts
│       ├── ragService.ts
│       ├── calculatorWrapper.ts
│       ├── wntrService.py
│       └── wntrWrapper.ts
└── utils/               # Funcions utilitàries
```

### Arquitectura d'Electron

```
electron/
├── main.ts              # Punt d'entrada del procés principal
├── preload.ts           # Script preload per a IPC
├── handlers/            # Manejadors IPC
│   ├── index.ts
│   ├── chat.handler.ts
│   ├── database.handler.ts
│   ├── hydraulic.handler.ts
│   └── wntr.handler.ts
└── services/            # Serveis del sistema
    ├── authService.ts
    ├── securityService.ts
    └── windowManager.ts
```

## Flux de Dades

### 1. Capa d'Interfície d'Usuari
```typescript
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

### 2. Comunicació IPC
```typescript
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

## Arquitectura de Seguretat

### Aïllament de Processos
- Aïllament de context habilitat
- Sense accés directe a Node.js al renderer
- Sense eval() ni execució de codi insegur
- Política de Seguretat de Contingut estricta

### Encriptació de Dades
```typescript
export class EncryptionService {
  private algorithm = 'aes-256-gcm';

  encrypt(data: string, password: string): EncryptedData {
    const salt = crypto.randomBytes(16);
    const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
    const iv = crypto.randomBytes(16);
    // ...
  }
}
```

## Arquitectura de Rendiment

### Càrrega Diferida
```typescript
const HydraulicCalculator = lazy(() => import('./components/hydraulic/HydraulicCalculator'));
const WNTRViewer = lazy(() => import('./components/hydraulic/WNTRViewer'));
```

### Estratègia de Caché
- Caché multinivell: memòria i disc
- TTL configurable per a cada tipus de dada
- Invalidació automàtica en canvis

### Processament en Segon Pla
- Worker Threads per a còmputs pesants
- Processament asíncron de simulacions
- Indicadors de progrés per a operacions llargues

## Consideracions d'Escalabilitat

### Disseny Modular
- **Mòduls basats en característiques**: Cada característica principal és autònoma
- **Arquitectura de plugins**: Fàcil afegir nous tipus de càlcul
- **Orientat a serveis**: Clara separació de responsabilitats
- **Dirigit per interfícies**: Contractes ben definits entre capes

### Escalabilitat de Base de Dades
```sql
CREATE INDEX idx_hydraulic_projects_user_id ON hydraulic_projects(user_id);
CREATE INDEX idx_calculations_project_id ON hydraulic_calculations(project_id);
CREATE INDEX idx_documents_project_id ON project_documents(project_id);
```

## Arquitectura de Desplegament

```typescript
export const buildConfig = {
  frontend: { tool: 'vite', outputDir: 'dist' },
  backend: { tool: 'tsc', outputDir: 'dist-electron', target: 'node18' },
  distribution: {
    tool: 'electron-builder',
    platforms: ['darwin', 'win32', 'linux'],
    formats: { darwin: 'dmg', win32: 'nsis', linux: 'AppImage' }
  }
};
```

Aquesta arquitectura proporciona una base sòlida per a una aplicació d'escriptori complexa amb capacitats especialitzades d'enginyeria, mentre manté una bona separació de responsabilitats, seguretat i escalabilitat.
