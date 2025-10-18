# Integració d'Analítiques Microsoft Clarity

## Visió General

Boorie integra Microsoft Clarity per a analítiques completes de comportament de l'usuari, monitoratge de rendiment i seguiment d'errors. Aquesta integració proporciona perspectives profundes sobre com els enginyers hidràulics interactuen amb l'aplicació i ajuda a optimitzar l'experiència de l'usuari.

## Característiques

### 📊 Analítiques de Comportament de l'Usuari
- **Gravacions de Sessió**: Gravacions visuals de sessions d'usuari
- **Mapes de Calor**: Visualització de comportament de clics i desplaçament
- **Viatges d'Usuari**: Seguiment complet del flux de treball
- **Anàlisi d'Interacció**: Mètriques detallades d'interacció de components

### 🔍 Monitoratge de Rendiment
- **Temps de Càrrega**: Rendiment de càrrega d'aplicació i components
- **Ús de Recursos**: Seguiment d'utilització de memòria i CPU
- **Rendiment de Xarxa**: Monitoratge d'API i transferència de dades
- **Rendiment de Renderitzat**: Mètriques de renderitzat del frontend

### 🚨 Seguiment d'Errors
- **Errors JavaScript**: Detecció i informe automàtic d'errors
- **Promeses No Manejades**: Seguiment de rebutjos de promeses
- **Esdeveniments d'Error Personalitzat**: Informe manual d'errors
- **Context d'Error**: Informació detallada de l'entorn d'error

### 🧮 Seguiment Hidràulic Especialitzat
- **Esdeveniments de Càlcul**: Seguiment d'ús de càlculs hidràulics
- **Operacions WNTR**: Monitoratge d'anàlisi de xarxes d'aigua
- **Processament d'Arxius**: Seguiment d'operacions d'arxius EPANET
- **Activitats de Projecte**: Monitoratge d'accions de gestió de projectes

## Configuració

### Configuració d'Entorn

Afegeix el següent al teu arxiu `.env`:

```env
VITE_CLARITY_PROJECT_ID=ts4zpakpjj
VITE_CLARITY_ENABLED=true
```

### Política de Seguretat de Contingut

L'aplicació inclou configuració CSP per permetre scripts de Clarity:

```html
<meta http-equiv="Content-Security-Policy" content="
  script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://www.clarity.ms;
  connect-src 'self' https: https://www.clarity.ms;
">
```

## Detalls d'Implementació

### Servei Principal

La classe `ClarityService` maneja totes les operacions de Clarity:

```typescript
// src/services/clarity.ts
class ClarityService {
  private config: ClarityConfig;
  private isInitialized = false;
  private isElectron = false;

  async initialize(): Promise<void>
  trackEvent(eventName: string, customProperties?: Record<string, any>): void
  identify(userId: string, sessionProperties?: Record<string, any>): void
  setSessionTag(key: string, value: string): void
}
```

### Integració React

#### Configuració del Proveïdor
```typescript
// src/components/ClarityProvider.tsx
export function ClarityProvider({ children }: ClarityProviderProps) {
  // Inicialitza Clarity i proporciona context
}
```

#### Ús de Hook
```typescript
// src/hooks/useClarityTracking.ts
export function useClarityTracking() {
  // Funcions de seguiment especialitzades per a diferents característiques
}
```

### Esdeveniments de Seguiment

#### Càlculs Hidràulics
```typescript
const trackHydraulicCalculation = (
  calculationType: string,
  inputParams: Record<string, any>,
  success: boolean,
  result?: any,
  errorMessage?: string
) => {
  trackEvent('hydraulic_calculation', {
    calculation_type: calculationType,
    input_parameters: inputParams,
    success,
    result_summary: result ? JSON.stringify(result) : undefined,
    error_message: errorMessage,
    timestamp: new Date().toISOString(),
    user_agent: navigator.userAgent
  });
};
```

#### Anàlisi WNTR
```typescript
const trackWNTRAnalysis = (
  analysisType: string,
  success: boolean,
  networkName?: string,
  errorMessage?: string
) => {
  trackEvent('wntr_analysis', {
    analysis_type: analysisType,
    success,
    network_name: networkName,
    error_message: errorMessage,
    timestamp: new Date().toISOString()
  });
};
```

#### Interaccions de Xat
```typescript
const trackChatMessage = (
  provider: string,
  messageType: 'user' | 'assistant',
  success: boolean,
  responseTime?: number,
  errorMessage?: string
) => {
  trackEvent('chat_message', {
    ai_provider: provider,
    message_type: messageType,
    success,
    response_time_ms: responseTime,
    error_message: errorMessage,
    timestamp: new Date().toISOString()
  });
};
```

#### Gestió de Projectes
```typescript
const trackProjectAction = (
  action: 'create' | 'update' | 'delete' | 'load',
  projectType: string,
  success: boolean,
  errorMessage?: string
) => {
  trackEvent('project_action', {
    action,
    project_type: projectType,
    success,
    error_message: errorMessage,
    timestamp: new Date().toISOString()
  });
};
```

#### Operacions d'Arxius
```typescript
const trackFileOperation = (
  operation: 'import' | 'export' | 'upload' | 'download',
  fileType: string,
  fileSize?: number,
  success?: boolean,
  errorMessage?: string
) => {
  trackEvent('file_operation', {
    operation,
    file_type: fileType,
    file_size_bytes: fileSize,
    success,
    error_message: errorMessage,
    timestamp: new Date().toISOString()
  });
};
```

### Seguiment d'Errors

#### Manejador Global d'Errors
```typescript
// src/components/GlobalErrorTracker.tsx
export function GlobalErrorTracker() {
  const { trackEvent, isReady } = useClarity();

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      if (isReady) {
        trackEvent('error_occurred', {
          error_type: 'javascript',
          error_message: event.message,
          error_filename: event.filename,
          error_lineno: event.lineno,
          error_colno: event.colno,
          error_stack: event.error?.stack,
          timestamp: new Date().toISOString(),
          user_agent: navigator.userAgent,
          url: window.location.href
        });
      }
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (isReady) {
        trackEvent('error_occurred', {
          error_type: 'unhandled_promise_rejection',
          error_message: event.reason?.message || String(event.reason),
          error_stack: event.reason?.stack,
          timestamp: new Date().toISOString(),
          user_agent: navigator.userAgent,
          url: window.location.href
        });
      }
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, [trackEvent, isReady]);

  return null;
}
```

## Privacitat de Dades i Compliment

### Recopilació de Dades
- **Sense PII**: No es recopila informació d'identificació personal
- **Anonimitzat**: Totes les dades s'anonimitzen abans de la transmissió
- **Consentiment**: Els usuaris poden optar per no participar en les analítiques als ajustos de l'aplicació
- **Compliment GDPR**: Segueix les regulacions europees de protecció de dades

### Tipus de Dades Recopilades
- Patrons d'ús de l'aplicació
- Mètriques de rendiment
- Ocurrències d'errors
- Taxes d'adopció de característiques
- Interaccions d'interfície d'usuari
- Informació de l'entorn tècnic

### Retenció de Dades
- Microsoft Clarity reté dades segons la seva política de retenció
- Les dades poden exportar-se o eliminar-se sota sol·licitud
- Les gravacions de sessió poden deshabilitar-se als ajustos

## Depuració i Desenvolupament

### Panell de Depuració
Les compilacions de desenvolupament inclouen un panell de depuració per provar la integració de Clarity:

```typescript
// Esdeveniments de depuració
trackEvent('debug_test_event', {
  test_type: 'manual',
  timestamp: new Date().toISOString()
});
```

### Registre a Consola
En mode de desenvolupament, tots els esdeveniments de Clarity es registren a la consola per a depuració.

### Esdeveniments de Prova
```typescript
// Provar totes les funcions de seguiment
const testAllTracking = () => {
  trackHydraulicCalculation('test', {}, true);
  trackWNTRAnalysis('test', true);
  trackChatMessage('test', 'user', true);
  trackProjectAction('create', 'test', true);
  trackFileOperation('import', 'test');
};
```

## Consideracions de Rendiment

### Càrrega Mandrosa
- Els scripts de Clarity es carreguen de forma asíncrona
- Sense impacte en el temps d'inici de l'aplicació
- Degradació elegant si Clarity falla al carregar

### Agrupació d'Esdeveniments
- Els esdeveniments s'agrupen per reduir les sol·licituds de xarxa
- Reintent automàtic en falles de xarxa
- Cua d'esdeveniments sense connexió

### Ús de Recursos
- Sobrecàrrega mínima de CPU i memòria
- Taxes de mostreig configurables
- Neteja automàtica de dades antigues

## Solució de Problemes

### Problemes Comuns

1. **Scripts Bloquejats per CSP**
   - Assegurar que CSP inclogui `https://www.clarity.ms`
   - Verificar consola del navegador per a violacions CSP

2. **Esdeveniments No Apareixen**
   - Verificar ID del projecte a variables d'entorn
   - Verificar connectivitat de xarxa
   - Confirmar accés al dashboard de Clarity

3. **Impacte al Rendiment**
   - Monitorar rendiment de l'aplicació
   - Ajustar taxes de mostreig si cal
   - Deshabilitar en desenvolupament si cal

### Passos de Depuració

1. Verificar variables d'entorn
2. Verificar configuració CSP
3. Monitorar consola del navegador per a errors
4. Provar amb panell de depuració
5. Validar sol·licituds de xarxa

## Millors Pràctiques

### Nomenclatura d'Esdeveniments
- Usar convencions de nomenclatura consistents
- Incloure context rellevant en noms d'esdeveniments
- Agrupar esdeveniments relacionats lògicament

### Propietats Personalitzades
- Incloure metadades significatives
- Evitar informació sensible
- Usar noms de propietats consistents

### Rendiment
- Seguir només esdeveniments significatius
- Evitar freqüència excessiva d'esdeveniments
- Usar taxes de mostreig apropiades

### Privacitat
- Anonimitzar dades d'usuari
- Respectar preferències de l'usuari
- Seguir regulacions de protecció de dades

## Veure També

- [Documentació Microsoft Clarity](https://docs.microsoft.com/en-us/clarity/)
- [Optimització de Rendiment](Optimitzacio-Rendiment.md)
- [Implementació de Seguretat](Implementacio-Seguretat.md)
- [Guia d'Interfície d'Usuari](Guia-Interficie-Usuari.md)