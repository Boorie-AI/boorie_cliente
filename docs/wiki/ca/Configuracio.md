# Guia de Configuració

## Descripció General

Boorie ofereix àmplies opcions de configuració per personalitzar l'aplicació segons els teus fluxos de treball específics d'enginyeria hidràulica, estàndards regionals i requisits d'equip.

## Ajustos de l'Aplicació

### 1. Ajustos Generals

Navega a **Ajustos** -> **General** per configurar:

#### Idioma i Localització
```json
{
  "language": "en",           // en, es, ca
  "dateFormat": "YYYY-MM-DD", // Format ISO
  "numberFormat": "en-US",    // Configuració regional per a números
  "unitSystem": "metric"      // metric, imperial
}
```

#### Estàndards Regionals
- **Mèxic**: Estàndards NOM (NOM-127-SSA1, NOM-001-CONAGUA)
- **Colòmbia**: RAS 2000, Decret 1594
- **Espanya**: Estàndards UNE, CTE DB-HS
- **Internacional**: Estàndards ISO

#### Tema i Visualització
```json
{
  "theme": "light",           // light, dark, auto
  "fontSize": "medium",       // small, medium, large
  "compactMode": false,       // Reduir espaiat
  "animations": true          // Habilitar animacions de UI
}
```

### 2. Configuració de Proveïdors AI

#### Configuració d'OpenAI
```json
{
  "provider": "openai",
  "apiKey": "sk-your-openai-key",
  "model": "gpt-4-turbo-preview",
  "maxTokens": 4000,
  "temperature": 0.1,
  "timeout": 30000,
  "retries": 3
}
```

#### Configuració d'Anthropic Claude
```json
{
  "provider": "anthropic",
  "apiKey": "sk-ant-your-key",
  "model": "claude-3-sonnet-20240229",
  "maxTokens": 4000,
  "temperature": 0,
  "timeout": 30000
}
```

#### Configuració de Google Gemini
```json
{
  "provider": "google",
  "apiKey": "your-google-key",
  "model": "gemini-pro",
  "safetySettings": "block_few",
  "generationConfig": {
    "temperature": 0.1,
    "topP": 0.8,
    "topK": 10
  }
}
```

#### Configuració d'OpenRouter
```json
{
  "provider": "openrouter",
  "apiKey": "sk-or-your-key",
  "baseURL": "https://openrouter.ai/api/v1",
  "model": "anthropic/claude-3-sonnet",
  "temperature": 0.1
}
```

#### Configuració d'Ollama (AI Local)
```json
{
  "provider": "ollama",
  "baseURL": "http://localhost:11434",
  "model": "llama2:7b",
  "temperature": 0.1,
  "keepAlive": "5m"
}
```

### 3. Configuració WNTR

#### Entorn Python
```env
# Ruta de l'executable Python
PYTHON_PATH=/path/to/venv-wntr/bin/python

# Configuració de WNTR
WNTR_TIMEOUT=300              # Temps límit de simulació (segons)
WNTR_MAX_MEMORY=2048          # Ús màxim de memòria (MB)
WNTR_TEMP_DIR=/tmp/wntr       # Directori d'arxius temporals
```

#### Valors Predeterminats de Simulació
```json
{
  "hydraulic": {
    "duration": 86400,
    "timeStep": 3600,
    "solver": "PDD",
    "accuracy": 0.001,
    "trials": 100,
    "checkFreq": 2
  },
  "quality": {
    "qualityType": "CHEMICAL",
    "chemicalName": "Chlorine",
    "units": "mg/L",
    "diffusivity": 1.0,
    "tolerance": 0.01
  }
}
```

### 4. Configuració de Base de Dades

#### Ajustos de SQLite
```json
{
  "database": {
    "path": "./prisma/hydraulic.db",
    "backupEnabled": true,
    "backupInterval": "daily",
    "maxBackups": 7,
    "vacuumInterval": "weekly"
  }
}
```

## Configuració de Projectes

### 1. Plantilles de Projecte

#### Plantilla de Distribució d'Aigua
```json
{
  "name": "Water Distribution System",
  "type": "distribution",
  "standards": ["NOM-127-SSA1"],
  "units": {
    "flow": "L/s",
    "pressure": "m",
    "diameter": "mm",
    "length": "m"
  },
  "designCriteria": {
    "minPressure": 20,
    "maxPressure": 50,
    "maxVelocity": 3.0,
    "minVelocity": 0.3
  }
}
```

### 2. Paràmetres de Càlcul

#### Càlculs de Flux en Canonades
```json
{
  "friction": {
    "formula": "darcy-weisbach",
    "roughness": {
      "PVC": 0.0015,
      "HDPE": 0.007,
      "Steel": 0.045,
      "Cast_Iron": 0.25
    }
  },
  "minor_losses": {
    "enabled": true,
    "fittings": {
      "elbow_90": 0.9,
      "elbow_45": 0.4,
      "tee_through": 0.6,
      "gate_valve": 0.15
    }
  }
}
```

## Xarxa i Seguretat

### 1. Configuració de Proxy

```json
{
  "proxy": {
    "enabled": true,
    "host": "proxy.company.com",
    "port": 8080,
    "username": "your-username",
    "password": "encrypted-password",
    "bypass": ["localhost", "127.0.0.1", "*.local"]
  }
}
```

### 2. Ajustos de Seguretat

#### Autenticació
```json
{
  "auth": {
    "sessionTimeout": 3600,
    "maxLoginAttempts": 5,
    "lockoutDuration": 900,
    "requireMFA": false,
    "passwordPolicy": {
      "minLength": 8,
      "requireUppercase": true,
      "requireLowercase": true,
      "requireNumbers": true,
      "requireSymbols": false
    }
  }
}
```

## Analítiques i Monitoratge

### 1. Microsoft Clarity
```env
VITE_CLARITY_PROJECT_ID=your_project_id
VITE_CLARITY_ENABLED=true
CLARITY_SAMPLE_RATE=100
```

## Configuració de Mapes

### 1. Configuració de Mapbox
```env
VITE_MAPBOX_ACCESS_TOKEN=your_mapbox_token
VITE_DEFAULT_MAP_LNG=-70.9
VITE_DEFAULT_MAP_LAT=42.35
VITE_DEFAULT_MAP_ZOOM=9
```

## Configuració Avançada

### 1. Variables d'Entorn

Crea un arxiu `.env` complet:

```env
# Aplicació
NODE_ENV=production
LOG_LEVEL=info
PORT=3000

# Base de Dades
DATABASE_URL="file:./prisma/hydraulic.db"
DATABASE_BACKUP_ENABLED=true

# Python/WNTR
PYTHON_PATH=/path/to/venv-wntr/bin/python
WNTR_TIMEOUT=300
WNTR_MAX_MEMORY=2048

# Proveïdors AI
OPENAI_API_KEY=sk-your-openai-key
ANTHROPIC_API_KEY=sk-ant-your-key
GOOGLE_API_KEY=your-google-key
OPENROUTER_API_KEY=sk-or-your-key

# OAuth
MS_CLIENT_ID=your-ms-client-id
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-secret

# Analítiques
VITE_CLARITY_PROJECT_ID=your-clarity-id
VITE_CLARITY_ENABLED=true

# Mapes
VITE_MAPBOX_ACCESS_TOKEN=your-mapbox-token
VITE_DEFAULT_MAP_LNG=-70.9
VITE_DEFAULT_MAP_LAT=42.35
VITE_DEFAULT_MAP_ZOOM=9

# Seguretat
ENCRYPTION_KEY=your-32-char-encryption-key
JWT_SECRET=your-jwt-secret
CORS_ORIGIN=http://localhost:3000
```

### 2. Opcions de Línia de Comandes

```bash
# Mode desenvolupament
boorie --dev

# Arxiu de configuració personalitzat
boorie --config=/path/to/config.json

# Mode depuració
boorie --debug --log-level=debug

# Desactivar acceleració GPU
boorie --disable-gpu

# Directori de dades personalitzat
boorie --user-data-dir=/path/to/data
```

## Gestió de Configuració

### 1. Exportar/Importar Ajustos

```typescript
// Exportar configuració actual
const config = await window.electronAPI.config.export();

// Importar configuració
await window.electronAPI.config.import(configData);
```

### 2. Restablir a Valors Predeterminats

```typescript
// Restablir secció específica
await window.electronAPI.config.reset('ai');

// Restablir tots els ajustos
await window.electronAPI.config.resetAll();
```

## Solució de Problemes de Configuració

### Problemes Comuns

#### 1. La Connexió del Proveïdor AI Falla
- Verificar format i permisos de la clau API
- Comprovar connectivitat de xarxa i configuració de firewall

#### 2. Problemes d'Integració WNTR
- Confirmar que la ruta de Python és correcta
- Verificar instal·lació de WNTR: `python -c "import wntr; print(wntr.__version__)"`

#### 3. Problemes de Connexió a Base de Dades
- Verificar permisos de l'arxiu de base de dades
- Comprovar disponibilitat d'espai al disc

### Restabliment de Configuració

Si la configuració es corromp:

1. **Fer còpia de seguretat dels ajustos actuals**:
   ```bash
   cp ~/.boorie/config.json ~/.boorie/config.json.backup
   ```

2. **Restablir a valors predeterminats**:
   ```bash
   rm ~/.boorie/config.json
   ```

3. **Reiniciar Boorie** i reconfigurar

---

**Propers Passos**: Explora [Solució de Problemes](Solucio-Problemes.md) per a guies detallades de resolució de problemes.
