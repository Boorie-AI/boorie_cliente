# Guía de Configuración

## Descripción General

Boorie ofrece amplias opciones de configuración para personalizar la aplicación según tus flujos de trabajo específicos de ingeniería hidráulica, estándares regionales y requisitos de equipo.

## Ajustes de la Aplicación

### 1. Ajustes Generales

Navega a **Ajustes** -> **General** para configurar:

#### Idioma y Localización
```json
{
  "language": "en",           // en, es, ca
  "dateFormat": "YYYY-MM-DD", // Formato ISO
  "numberFormat": "en-US",    // Configuración regional para números
  "unitSystem": "metric"      // metric, imperial
}
```

#### Estándares Regionales
- **México**: Estándares NOM (NOM-127-SSA1, NOM-001-CONAGUA)
- **Colombia**: RAS 2000, Decreto 1594
- **España**: Estándares UNE, CTE DB-HS
- **Internacional**: Estándares ISO

#### Tema y Visualización
```json
{
  "theme": "light",           // light, dark, auto
  "fontSize": "medium",       // small, medium, large
  "compactMode": false,       // Reducir espaciado
  "animations": true          // Habilitar animaciones de UI
}
```

### 2. Configuración de Proveedores AI

#### Configuración de OpenAI
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

#### Configuración de Anthropic Claude
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

#### Configuración de Google Gemini
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

#### Configuración de OpenRouter
```json
{
  "provider": "openrouter",
  "apiKey": "sk-or-your-key",
  "baseURL": "https://openrouter.ai/api/v1",
  "model": "anthropic/claude-3-sonnet",
  "temperature": 0.1
}
```

#### Configuración de Ollama (AI Local)
```json
{
  "provider": "ollama",
  "baseURL": "http://localhost:11434",
  "model": "llama2:7b",
  "temperature": 0.1,
  "keepAlive": "5m"
}
```

### 3. Configuración WNTR

#### Entorno Python
```env
# Ruta del ejecutable Python
PYTHON_PATH=/path/to/venv-wntr/bin/python

# Configuración de WNTR
WNTR_TIMEOUT=300              # Tiempo límite de simulación (segundos)
WNTR_MAX_MEMORY=2048          # Uso máximo de memoria (MB)
WNTR_TEMP_DIR=/tmp/wntr       # Directorio de archivos temporales
```

#### Valores Predeterminados de Simulación
```json
{
  "hydraulic": {
    "duration": 86400,          // 24 horas en segundos
    "timeStep": 3600,           // Paso de tiempo de 1 hora
    "solver": "PDD",            // PDD o DD
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

### 4. Configuración de Base de Datos

#### Ajustes de SQLite
```json
{
  "database": {
    "path": "./prisma/hydraulic.db",
    "backupEnabled": true,
    "backupInterval": "daily",    // daily, weekly, manual
    "maxBackups": 7,
    "vacuumInterval": "weekly"
  }
}
```

#### Ajuste de Rendimiento
```sql
-- Ajustes de optimización de SQLite
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = 10000;
PRAGMA temp_store = memory;
```

## Configuración de Proyectos

### 1. Plantillas de Proyecto

#### Plantilla de Distribución de Agua
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
    "minPressure": 20,          // metros
    "maxPressure": 50,          // metros
    "maxVelocity": 3.0,         // m/s
    "minVelocity": 0.3          // m/s
  }
}
```

#### Plantilla de Recolección de Aguas Residuales
```json
{
  "name": "Wastewater Collection",
  "type": "collection",
  "standards": ["NOM-001-ECOL"],
  "units": {
    "flow": "L/s",
    "slope": "%",
    "diameter": "mm"
  },
  "designCriteria": {
    "minSlope": 0.5,            // %
    "maxVelocity": 5.0,         // m/s
    "minVelocity": 0.6,         // m/s
    "fillRatio": 0.75           // adimensional
  }
}
```

### 2. Parámetros de Cálculo

#### Cálculos de Flujo en Tuberías
```json
{
  "friction": {
    "formula": "darcy-weisbach",    // darcy-weisbach, hazen-williams
    "roughness": {
      "PVC": 0.0015,               // mm
      "HDPE": 0.007,               // mm
      "Steel": 0.045,              // mm
      "Cast_Iron": 0.25            // mm
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

#### Configuración de Bombas
```json
{
  "pumps": {
    "efficiency": {
      "minimum": 0.65,
      "target": 0.80,
      "maximum": 0.90
    },
    "operating_range": {
      "min_flow_ratio": 0.5,
      "max_flow_ratio": 1.2
    },
    "vfd_enabled": true
  }
}
```

## Red y Seguridad

### 1. Configuración de Proxy

#### Configuración de Proxy Corporativo
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

#### Configuración SSL/TLS
```json
{
  "tls": {
    "rejectUnauthorized": true,
    "certificatePath": "/path/to/cert.pem",
    "keyPath": "/path/to/key.pem",
    "caPath": "/path/to/ca.pem"
  }
}
```

### 2. Ajustes de Seguridad

#### Autenticación
```json
{
  "auth": {
    "sessionTimeout": 3600,      // segundos
    "maxLoginAttempts": 5,
    "lockoutDuration": 900,      // segundos
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

#### Encriptación de Datos
```json
{
  "encryption": {
    "algorithm": "AES-256-GCM",
    "keyDerivation": "PBKDF2",
    "iterations": 100000,
    "saltLength": 32
  }
}
```

## Analíticas y Monitoreo

### 1. Microsoft Clarity
```env
# Configuración de Clarity
VITE_CLARITY_PROJECT_ID=your_project_id
VITE_CLARITY_ENABLED=true
CLARITY_SAMPLE_RATE=100      # Porcentaje de sesiones a grabar
```

### 2. Monitoreo de Rendimiento
```json
{
  "monitoring": {
    "enableMetrics": true,
    "sampleRate": 0.1,
    "logLevel": "info",        // debug, info, warn, error
    "maxLogSize": "10MB",
    "logRetention": "30d"
  }
}
```

### 3. Analíticas de Uso
```json
{
  "analytics": {
    "trackEvents": true,
    "trackPerformance": true,
    "trackErrors": true,
    "anonymizeData": true,
    "dataRetention": "1y"
  }
}
```

## Configuración de Mapas

### 1. Configuración de Mapbox
```env
# Configuración de Mapbox
VITE_MAPBOX_ACCESS_TOKEN=your_mapbox_token
VITE_DEFAULT_MAP_LNG=-70.9
VITE_DEFAULT_MAP_LAT=42.35
VITE_DEFAULT_MAP_ZOOM=9
```

### 2. Visualización de Red
```json
{
  "visualization": {
    "defaultLayout": "spring",    // spring, hierarchical, circular
    "nodeSize": {
      "junction": 10,
      "reservoir": 15,
      "tank": 12
    },
    "edgeWidth": {
      "pipe": 2,
      "pump": 4,
      "valve": 3
    },
    "colorSchemes": {
      "pressure": ["#ff0000", "#ffff00", "#00ff00"],
      "flow": ["#0000ff", "#ffffff", "#ff0000"],
      "velocity": ["#800080", "#ff1493", "#ff6347"]
    }
  }
}
```

## Gestión de Archivos

### 1. Ajustes de Importación/Exportación
```json
{
  "files": {
    "autoBackup": true,
    "backupInterval": 300,       // segundos
    "maxFileSize": "100MB",
    "supportedFormats": [
      ".inp", ".net", ".wn",
      ".json", ".csv", ".xlsx"
    ],
    "exportFormats": [
      "epanet", "json", "csv", "pdf"
    ]
  }
}
```

### 2. Procesamiento de Documentos
```json
{
  "documents": {
    "ocrEnabled": true,
    "maxUploadSize": "50MB",
    "supportedTypes": [
      "pdf", "docx", "xlsx",
      "jpg", "png", "tiff"
    ],
    "ragProcessing": {
      "chunkSize": 1000,
      "overlap": 200,
      "embeddingModel": "text-embedding-ada-002"
    }
  }
}
```

## Configuración Avanzada

### 1. Variables de Entorno

Crea un archivo `.env` completo:

```env
# Aplicación
NODE_ENV=production
LOG_LEVEL=info
PORT=3000

# Base de Datos
DATABASE_URL="file:./prisma/hydraulic.db"
DATABASE_BACKUP_ENABLED=true

# Python/WNTR
PYTHON_PATH=/path/to/venv-wntr/bin/python
WNTR_TIMEOUT=300
WNTR_MAX_MEMORY=2048

# Proveedores AI
OPENAI_API_KEY=sk-your-openai-key
ANTHROPIC_API_KEY=sk-ant-your-key
GOOGLE_API_KEY=your-google-key
OPENROUTER_API_KEY=sk-or-your-key

# OAuth
MS_CLIENT_ID=your-ms-client-id
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-secret

# Analíticas
VITE_CLARITY_PROJECT_ID=your-clarity-id
VITE_CLARITY_ENABLED=true

# Mapas
VITE_MAPBOX_ACCESS_TOKEN=your-mapbox-token
VITE_DEFAULT_MAP_LNG=-70.9
VITE_DEFAULT_MAP_LAT=42.35
VITE_DEFAULT_MAP_ZOOM=9

# Seguridad
ENCRYPTION_KEY=your-32-char-encryption-key
JWT_SECRET=your-jwt-secret
CORS_ORIGIN=http://localhost:3000

# Email (opcional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

### 2. Esquema de Archivo de Configuración

Boorie soporta archivos de configuración JSON en `~/.boorie/config.json`:

```json
{
  "version": "1.0.0",
  "application": {
    "autoStart": false,
    "minimizeToTray": true,
    "notifications": true,
    "updateCheck": "weekly"
  },
  "ui": {
    "theme": "auto",
    "language": "en",
    "compactMode": false,
    "animations": true
  },
  "ai": {
    "defaultProvider": "openai",
    "fallbackProvider": "anthropic",
    "timeout": 30000,
    "retries": 3
  },
  "hydraulics": {
    "defaultUnits": "metric",
    "precision": 3,
    "autoSave": true,
    "saveInterval": 300
  },
  "security": {
    "encryptProjects": true,
    "sessionTimeout": 3600,
    "auditLog": true
  }
}
```

### 3. Opciones de Línea de Comandos

```bash
# Modo desarrollo
boorie --dev

# Archivo de configuración personalizado
boorie --config=/path/to/config.json

# Modo depuración
boorie --debug --log-level=debug

# Desactivar aceleración GPU
boorie --disable-gpu

# Directorio de datos personalizado
boorie --user-data-dir=/path/to/data

# Modo sin cabeza (para pruebas)
boorie --headless

# Habilitar registro detallado
boorie --verbose --log-file=/path/to/log.txt
```

## Gestión de Configuración

### 1. Exportar/Importar Ajustes

Exportar configuración actual:
```typescript
const config = await window.electronAPI.config.export();
// Guardar en archivo o respaldo
```

Importar configuración:
```typescript
await window.electronAPI.config.import(configData);
// Reiniciar la aplicación para aplicar cambios
```

### 2. Restablecer a Valores Predeterminados

```typescript
// Restablecer sección específica
await window.electronAPI.config.reset('ai');

// Restablecer todos los ajustes
await window.electronAPI.config.resetAll();
```

### 3. Validación de Configuración

```typescript
// Validar configuración
const validation = await window.electronAPI.config.validate();

if (!validation.valid) {
  console.error('Errores de configuración:', validation.errors);
}
```

## Solución de Problemas de Configuración

### Problemas Comunes

#### 1. La Conexión del Proveedor AI Falla
- Verificar formato y permisos de la clave API
- Comprobar conectividad de red y configuración de firewall
- Validar parámetros de configuración específicos del proveedor

#### 2. Problemas de Integración WNTR
- Confirmar que la ruta de Python es correcta
- Verificar instalación de WNTR: `python -c "import wntr; print(wntr.__version__)"`
- Comprobar permisos de archivo para el directorio temporal

#### 3. Problemas de Conexión a Base de Datos
- Verificar permisos del archivo de base de datos
- Comprobar disponibilidad de espacio en disco
- Asegurar compatibilidad de versión de SQLite

#### 4. Problemas de Rendimiento
- Reducir complejidad de la simulación
- Aumentar límites de memoria
- Desactivar funciones innecesarias

### Restablecimiento de Configuración

Si la configuración se corrompe:

1. **Respaldar ajustes actuales**:
   ```bash
   cp ~/.boorie/config.json ~/.boorie/config.json.backup
   ```

2. **Restablecer a valores predeterminados**:
   ```bash
   rm ~/.boorie/config.json
   ```

3. **Reiniciar Boorie** y reconfigurar

---

**Próximos Pasos**: Explora [Solución de Problemas](Solucion-Problemas.md) para guías detalladas de resolución de problemas.
