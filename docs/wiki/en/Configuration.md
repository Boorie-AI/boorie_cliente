# Configuration Guide

## 🔧 Overview

Boorie offers extensive configuration options to customize the application for your specific hydraulic engineering workflows, regional standards, and team requirements.

## ⚙️ Application Settings

### 1. General Settings

Navigate to **Settings** → **General** to configure:

#### Language and Localization
```json
{
  "language": "en",           // en, es, ca
  "dateFormat": "YYYY-MM-DD", // ISO format
  "numberFormat": "en-US",    // Locale for numbers
  "unitSystem": "metric"      // metric, imperial
}
```

#### Regional Standards
- **Mexico**: NOM standards (NOM-127-SSA1, NOM-001-CONAGUA)
- **Colombia**: RAS 2000, Decreto 1594
- **Spain**: UNE standards, CTE DB-HS
- **International**: ISO standards

#### Theme and Display
```json
{
  "theme": "light",           // light, dark, auto
  "fontSize": "medium",       // small, medium, large
  "compactMode": false,       // Reduce spacing
  "animations": true          // Enable UI animations
}
```

### 2. AI Provider Configuration

#### OpenAI Setup
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

#### Anthropic Claude Setup
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

#### Google Gemini Setup
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

#### OpenRouter Setup
```json
{
  "provider": "openrouter",
  "apiKey": "sk-or-your-key",
  "baseURL": "https://openrouter.ai/api/v1",
  "model": "anthropic/claude-3-sonnet",
  "temperature": 0.1
}
```

#### Ollama (Local AI) Setup
```json
{
  "provider": "ollama",
  "baseURL": "http://localhost:11434",
  "model": "llama2:7b",
  "temperature": 0.1,
  "keepAlive": "5m"
}
```

### 3. WNTR Configuration

#### Python Environment
```env
# Python executable path
PYTHON_PATH=/path/to/venv-wntr/bin/python

# WNTR configuration
WNTR_TIMEOUT=300              # Simulation timeout (seconds)
WNTR_MAX_MEMORY=2048          # Max memory usage (MB)
WNTR_TEMP_DIR=/tmp/wntr       # Temporary files directory
```

#### Simulation Defaults
```json
{
  "hydraulic": {
    "duration": 86400,          // 24 hours in seconds
    "timeStep": 3600,           // 1 hour timestep
    "solver": "PDD",            // PDD or DD
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

### 4. Database Configuration

#### SQLite Settings
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

#### Performance Tuning
```sql
-- SQLite optimization settings
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = 10000;
PRAGMA temp_store = memory;
```

## 🗂️ Project Configuration

### 1. Project Templates

#### Water Distribution Template
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
    "minPressure": 20,          // meters
    "maxPressure": 50,          // meters  
    "maxVelocity": 3.0,         // m/s
    "minVelocity": 0.3          // m/s
  }
}
```

#### Wastewater Collection Template
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
    "fillRatio": 0.75           // dimensionless
  }
}
```

### 2. Calculation Parameters

#### Pipe Flow Calculations
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

#### Pump Configuration
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

## 🌐 Network and Security

### 1. Proxy Configuration

#### Corporate Proxy Setup
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

#### SSL/TLS Configuration
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

### 2. Security Settings

#### Authentication
```json
{
  "auth": {
    "sessionTimeout": 3600,      // seconds
    "maxLoginAttempts": 5,
    "lockoutDuration": 900,      // seconds
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

#### Data Encryption
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

## 📊 Analytics and Monitoring

### 1. Microsoft Clarity
```env
# Clarity configuration
VITE_CLARITY_PROJECT_ID=your_project_id
VITE_CLARITY_ENABLED=true
CLARITY_SAMPLE_RATE=100      # Percentage of sessions to record
```

### 2. Performance Monitoring
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

### 3. Usage Analytics
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

## 🗺️ Mapping Configuration

### 1. Mapbox Setup
```env
# Mapbox configuration
VITE_MAPBOX_ACCESS_TOKEN=your_mapbox_token
VITE_DEFAULT_MAP_LNG=-70.9
VITE_DEFAULT_MAP_LAT=42.35
VITE_DEFAULT_MAP_ZOOM=9
```

### 2. Network Visualization
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

## 📂 File Management

### 1. Import/Export Settings
```json
{
  "files": {
    "autoBackup": true,
    "backupInterval": 300,       // seconds
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

### 2. Document Processing
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

## 🔧 Advanced Configuration

### 1. Environment Variables

Create a comprehensive `.env` file:

```env
# Application
NODE_ENV=production
LOG_LEVEL=info
PORT=3000

# Database
DATABASE_URL="file:./prisma/hydraulic.db"
DATABASE_BACKUP_ENABLED=true

# Python/WNTR
PYTHON_PATH=/path/to/venv-wntr/bin/python
WNTR_TIMEOUT=300
WNTR_MAX_MEMORY=2048

# AI Providers
OPENAI_API_KEY=sk-your-openai-key
ANTHROPIC_API_KEY=sk-ant-your-key
GOOGLE_API_KEY=your-google-key
OPENROUTER_API_KEY=sk-or-your-key

# OAuth
MS_CLIENT_ID=your-ms-client-id
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-secret

# Analytics
VITE_CLARITY_PROJECT_ID=your-clarity-id
VITE_CLARITY_ENABLED=true

# Mapping
VITE_MAPBOX_ACCESS_TOKEN=your-mapbox-token
VITE_DEFAULT_MAP_LNG=-70.9
VITE_DEFAULT_MAP_LAT=42.35
VITE_DEFAULT_MAP_ZOOM=9

# Security
ENCRYPTION_KEY=your-32-char-encryption-key
JWT_SECRET=your-jwt-secret
CORS_ORIGIN=http://localhost:3000

# Email (optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

### 2. Configuration File Schema

Boorie supports JSON configuration files in `~/.boorie/config.json`:

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

### 3. Command Line Options

```bash
# Development mode
boorie --dev

# Custom config file
boorie --config=/path/to/config.json

# Debug mode
boorie --debug --log-level=debug

# Disable GPU acceleration
boorie --disable-gpu

# Custom data directory
boorie --user-data-dir=/path/to/data

# Headless mode (for testing)
boorie --headless

# Enable verbose logging
boorie --verbose --log-file=/path/to/log.txt
```

## 🔄 Configuration Management

### 1. Export/Import Settings

Export current configuration:
```typescript
const config = await window.electronAPI.config.export();
// Save to file or backup
```

Import configuration:
```typescript
await window.electronAPI.config.import(configData);
// Restart application to apply changes
```

### 2. Reset to Defaults

```typescript
// Reset specific section
await window.electronAPI.config.reset('ai');

// Reset all settings
await window.electronAPI.config.resetAll();
```

### 3. Configuration Validation

```typescript
// Validate configuration
const validation = await window.electronAPI.config.validate();

if (!validation.valid) {
  console.error('Configuration errors:', validation.errors);
}
```

## 🚨 Troubleshooting Configuration

### Common Issues

#### 1. AI Provider Connection Fails
- Verify API key format and permissions
- Check network connectivity and firewall settings
- Validate provider-specific configuration parameters

#### 2. WNTR Integration Issues
- Confirm Python path is correct
- Verify WNTR installation: `python -c "import wntr; print(wntr.__version__)"`
- Check file permissions for temp directory

#### 3. Database Connection Problems
- Verify database file permissions
- Check disk space availability
- Ensure SQLite version compatibility

#### 4. Performance Issues
- Reduce simulation complexity
- Increase memory limits
- Disable unnecessary features

### Configuration Reset

If configuration becomes corrupted:

1. **Backup current settings**:
   ```bash
   cp ~/.boorie/config.json ~/.boorie/config.json.backup
   ```

2. **Reset to defaults**:
   ```bash
   rm ~/.boorie/config.json
   ```

3. **Restart Boorie** and reconfigure

---

**Next Steps**: Explore [Troubleshooting](Troubleshooting.md) for detailed problem-solving guides.