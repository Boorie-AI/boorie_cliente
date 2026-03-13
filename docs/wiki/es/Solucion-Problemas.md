# Guía de Solución de Problemas

## Descripción General

Esta guía completa de solución de problemas ayuda a resolver problemas comunes con Boorie. Los problemas están organizados por categoría con soluciones paso a paso.

## Problemas de la Aplicación

### 1. La Aplicación No Inicia

#### **Síntomas**
- La aplicación se cierra inesperadamente al iniciar
- Mensajes de error durante el lanzamiento
- La ventana no aparece

#### **Soluciones**

**Verificar Requisitos del Sistema**
```bash
# Verificar versión de Node.js
node --version  # Debe ser 16.x o superior

# Verificar memoria disponible
free -h  # Linux
vm_stat  # macOS
```

**Limpiar Caché de la Aplicación**
```bash
# Eliminar directorios de caché
rm -rf ~/.boorie/cache
rm -rf ~/.boorie/logs

# En Windows
del /q "%APPDATA%\Boorie\cache\*"
```

**Ejecutar en Modo de Depuración**
```bash
# Habilitar registro de depuración
boorie --debug --log-level=debug

# Verificar salida de consola para errores
tail -f ~/.boorie/logs/main.log
```

**Restablecer Configuración**
```bash
# Respaldar configuración actual
cp ~/.boorie/config.json ~/.boorie/config.json.backup

# Restablecer a valores predeterminados
rm ~/.boorie/config.json
```

### 2. Problemas de Rendimiento

#### **Síntomas**
- Respuesta lenta de la aplicación
- Alto uso de CPU/memoria
- Congelamiento durante operaciones

#### **Soluciones**

**Monitorear Uso de Recursos**
```bash
# Verificar recursos del proceso
ps aux | grep boorie
top -p $(pgrep boorie)

# En Windows
tasklist | findstr boorie
```

**Optimizar Ajustes**
```json
{
  "performance": {
    "reduceAnimations": true,
    "limitSimultaneousOperations": 2,
    "backgroundProcessing": false,
    "memoryLimit": "2GB"
  }
}
```

**Limpiar Archivos Temporales**
```bash
# Limpiar directorios temporales
rm -rf /tmp/wntr-*
rm -rf ~/.boorie/temp/*

# Limpiar vacuum de base de datos
npm run db:vacuum
```

### 3. Problemas de Visualización de Ventana

#### **Síntomas**
- Pantalla en blanco/blanca
- Elementos de UI faltantes
- Problemas de escala

#### **Soluciones**

**Desactivar Aceleración por Hardware**
```bash
boorie --disable-gpu --disable-software-rasterizer
```

**Restablecer Estado de Ventana**
```javascript
// En la consola de desarrollo (Ctrl+Shift+I)
localStorage.removeItem('window-state');
location.reload();
```

**Verificar Ajustes de Pantalla**
```bash
# Verificar configuración de pantalla
xrandr  # Linux
system_profiler SPDisplaysDataType  # macOS
```

## Problemas con Proveedores AI

### 1. Fallos de Conexión API

#### **Síntomas**
- "Error al conectar con el proveedor AI"
- Errores de tiempo de espera
- Fallos de autenticación

#### **Soluciones**

**Verificar Claves API**
```bash
# Probar conexión OpenAI
curl -H "Authorization: Bearer sk-your-key" \
  https://api.openai.com/v1/models

# Probar conexión Anthropic
curl -H "x-api-key: sk-ant-your-key" \
  https://api.anthropic.com/v1/messages
```

**Verificar Conectividad de Red**
```bash
# Probar conexión a internet
ping api.openai.com
nslookup api.anthropic.com

# Verificar configuración de proxy
curl -I --proxy http://proxy:8080 https://api.openai.com
```

**Actualizar Configuración**
```json
{
  "ai": {
    "timeout": 60000,
    "retries": 5,
    "fallbackProvider": "anthropic",
    "proxy": {
      "enabled": false,
      "host": "proxy.company.com",
      "port": 8080
    }
  }
}
```

### 2. Calidad de Respuesta Deficiente

#### **Síntomas**
- Respuestas irrelevantes
- Errores de cálculo
- Respuestas incompletas

#### **Soluciones**

**Optimizar Prompts**
```typescript
// Proporcionar más contexto
const prompt = `
Como ingeniero hidráulico trabajando en un sistema de distribución de agua en México:
- La red tiene 150 nodos y 200 tuberías
- Presión de diseño: 20-50 m
- Caudales: 50-300 L/s
- Siguiendo estándares NOM-127-SSA1

Pregunta: ${userQuestion}
`;
```

**Ajustar Parámetros del Modelo**
```json
{
  "temperature": 0.1,     // Más preciso
  "maxTokens": 4000,      // Respuestas más largas
  "topP": 0.8,           // Muestreo enfocado
  "presencePenalty": 0.1  // Reducir repetición
}
```

**Cambiar Modelos**
```typescript
// Para cálculos: Usar GPT-4 o Claude Sonnet
// Para tareas creativas: Usar GPT-3.5-turbo
// Para código: Usar Claude o CodeLlama
```

### 3. Problemas de Límite de Tasa

#### **Síntomas**
- Errores de "límite de tasa excedido"
- Tiempos de respuesta lentos
- Rechazos de solicitudes

#### **Soluciones**

**Implementar Cola de Solicitudes**
```typescript
const rateLimiter = {
  requests: [],
  maxPerMinute: 60,

  async addRequest(request) {
    if (this.requests.length >= this.maxPerMinute) {
      await this.wait(60000);
    }
    return this.execute(request);
  }
};
```

**Usar Múltiples Proveedores**
```json
{
  "providers": [
    {"name": "openai", "priority": 1, "limit": 100},
    {"name": "anthropic", "priority": 2, "limit": 50},
    {"name": "openrouter", "priority": 3, "limit": 200}
  ]
}
```

## Problemas con Python/WNTR

### 1. Problemas del Entorno Python

#### **Síntomas**
- Errores de "Python no encontrado"
- Errores de importación para WNTR
- Problemas de compatibilidad de versión

#### **Soluciones**

**Verificar Instalación de Python**
```bash
# Verificar versión de Python
python --version
python3 --version

# Verificar instalación de WNTR
python -c "import wntr; print(wntr.__version__)"

# Listar paquetes instalados
pip list | grep -E "(numpy|scipy|pandas|networkx|wntr)"
```

**Recrear Entorno Virtual**
```bash
# Eliminar entorno existente
rm -rf venv-wntr

# Crear nuevo entorno
python3 -m venv venv-wntr
source venv-wntr/bin/activate

# Instalar dependencias
pip install --upgrade pip
pip install numpy>=1.20 scipy>=1.7 pandas>=1.3 networkx>=2.6 matplotlib>=3.4 wntr>=0.5.0
```

**Actualizar Ruta del Entorno**
```bash
# Encontrar ruta de Python
which python

# Actualizar archivo .env
echo "PYTHON_PATH=$(which python)" > .env
```

### 2. Fallos de Simulación WNTR

#### **Síntomas**
- Tiempos de espera de simulación
- Errores de convergencia
- Errores de memoria

#### **Soluciones**

**Verificar Archivo de Red**
```python
import wntr

# Validar archivo de red
try:
    wn = wntr.network.WaterNetworkModel('network.inp')
    print(f"Nodos: {len(wn.junction_name_list)}")
    print(f"Tuberías: {len(wn.pipe_name_list)}")
except Exception as e:
    print(f"Error de red: {e}")
```

**Optimizar Parámetros de Simulación**
```python
# Ajustar configuración del solucionador
wn.options.time.duration = 24 * 3600  # 24 horas
wn.options.time.hydraulic_timestep = 3600  # 1 hora
wn.options.hydraulic.accuracy = 0.001
wn.options.hydraulic.trials = 100
wn.options.hydraulic.checkfreq = 2
```

**Manejar Redes Grandes**
```python
# Simplificar red para análisis
def simplify_network(wn, min_diameter=100):
    """Eliminar tuberías pequeñas para reducir complejidad"""
    pipes_to_remove = []
    for pipe_name in wn.pipe_name_list:
        pipe = wn.get_link(pipe_name)
        if pipe.diameter * 1000 < min_diameter:  # Convertir a mm
            pipes_to_remove.append(pipe_name)

    for pipe_name in pipes_to_remove:
        wn.remove_link(pipe_name)

    return wn
```

### 3. Problemas de Memoria y Rendimiento

#### **Síntomas**
- Errores de memoria insuficiente
- Tiempos de simulación lentos
- Cierre inesperado del proceso

#### **Soluciones**

**Aumentar Límites de Memoria**
```bash
# Establecer variables de entorno de memoria
export PYTHONMALLOC=malloc
export OMP_NUM_THREADS=4

# Limitar uso de memoria de WNTR
export WNTR_MAX_MEMORY=4096  # MB
```

**Optimizar Tamaño de Red**
```python
def reduce_network_complexity(wn):
    """Reducir complejidad de la red para simulación más rápida"""

    # Eliminar nodos innecesarios
    small_demands = []
    for junction_name in wn.junction_name_list:
        junction = wn.get_node(junction_name)
        total_demand = sum([d.base_value for d in junction.demand_timeseries_list])
        if total_demand < 0.001:  # Demandas muy pequeñas
            small_demands.append(junction_name)

    # Fusionar tuberías cortas
    short_pipes = []
    for pipe_name in wn.pipe_name_list:
        pipe = wn.get_link(pipe_name)
        if pipe.length < 10:  # Tuberías muy cortas
            short_pipes.append(pipe_name)

    return wn
```

**Usar Procesamiento Paralelo**
```python
import multiprocessing as mp

def run_parallel_simulation(networks):
    """Ejecutar múltiples redes en paralelo"""
    with mp.Pool(processes=mp.cpu_count()) as pool:
        results = pool.map(simulate_network, networks)
    return results
```

## Problemas de Base de Datos

### 1. Fallos de Conexión a Base de Datos

#### **Síntomas**
- Errores de "base de datos bloqueada"
- Tiempos de espera de conexión
- Advertencias de corrupción

#### **Soluciones**

**Verificar Archivo de Base de Datos**
```bash
# Verificar que la base de datos existe y tiene permisos
ls -la prisma/hydraulic.db
sqlite3 prisma/hydraulic.db ".tables"

# Verificar integridad de la base de datos
sqlite3 prisma/hydraulic.db "PRAGMA integrity_check;"
```

**Corregir Bloqueos de Base de Datos**
```bash
# Terminar procesos bloqueados
lsof prisma/hydraulic.db
kill -9 <PID>

# Eliminar archivos de bloqueo
rm -f prisma/hydraulic.db-wal
rm -f prisma/hydraulic.db-shm
```

**Reparar Base de Datos**
```bash
# Respaldar base de datos actual
cp prisma/hydraulic.db prisma/hydraulic.db.backup

# Vacuum de base de datos
sqlite3 prisma/hydraulic.db "VACUUM;"

# Regenerar si es necesario
npm run db:push --force-reset
```

### 2. Fallos de Migración

#### **Síntomas**
- Errores de discrepancia de esquema
- Conflictos de migración
- Advertencias de pérdida de datos

#### **Soluciones**

**Restablecer Esquema de Base de Datos**
```bash
# Respaldar datos primero
npm run db:backup

# Restablecer esquema
npx prisma db push --force-reset

# Restaurar datos
npm run db:restore
```

**Migración Manual**
```sql
-- Verificar esquema actual
.schema

-- Añadir columnas faltantes
ALTER TABLE HydraulicProject ADD COLUMN new_field TEXT;

-- Actualizar tipos de datos
-- (Las limitaciones de SQLite pueden requerir recreación de tabla)
```

### 3. Problemas de Rendimiento

#### **Síntomas**
- Consultas lentas
- Alto uso de disco
- Fugas de memoria

#### **Soluciones**

**Optimizar Base de Datos**
```sql
-- Crear índices
CREATE INDEX idx_project_created ON HydraulicProject(createdAt);
CREATE INDEX idx_calculation_project ON HydraulicCalculation(projectId);

-- Analizar planes de consulta
EXPLAIN QUERY PLAN SELECT * FROM HydraulicProject WHERE userId = ?;
```

**Limpiar Datos Antiguos**
```sql
-- Eliminar cálculos antiguos
DELETE FROM HydraulicCalculation
WHERE createdAt < datetime('now', '-30 days');

-- Vacuum para recuperar espacio
VACUUM;
```

## Problemas de Importación/Exportación de Archivos

### 1. Problemas con Archivos EPANET

#### **Síntomas**
- Errores de análisis
- Datos faltantes
- Incompatibilidad de formato

#### **Soluciones**

**Validar Formato de Archivo**
```bash
# Verificar codificación del archivo
file network.inp
head -n 10 network.inp

# Verificar formato EPANET
grep -E "\[(JUNCTIONS|PIPES|RESERVOIRS)\]" network.inp
```

**Corregir Problemas Comunes**
```python
def fix_epanet_file(filename):
    """Corregir problemas comunes de archivos EPANET"""
    with open(filename, 'r') as f:
        content = f.read()

    # Corregir finales de línea
    content = content.replace('\r\n', '\n')

    # Eliminar líneas vacías en secciones
    lines = content.split('\n')
    fixed_lines = []
    in_section = False

    for line in lines:
        if line.startswith('[') and line.endswith(']'):
            in_section = True
            fixed_lines.append(line)
        elif in_section and line.strip() == '':
            continue  # Omitir líneas vacías en secciones
        else:
            fixed_lines.append(line)

    with open(filename + '.fixed', 'w') as f:
        f.write('\n'.join(fixed_lines))
```

### 2. Problemas de Exportación

#### **Síntomas**
- Exportaciones incompletas
- Errores de formato
- Datos faltantes

#### **Soluciones**

**Verificar Datos de Exportación**
```typescript
const validateExport = (data: any, format: string) => {
  switch (format) {
    case 'json':
      return JSON.parse(JSON.stringify(data));
    case 'csv':
      return data.every(row => Object.keys(row).length > 0);
    case 'epanet':
      return data.includes('[JUNCTIONS]') && data.includes('[PIPES]');
  }
};
```

## Red y Conectividad

### 1. Problemas de Conexión a Internet

#### **Síntomas**
- Tiempos de espera de API
- Fallos de actualización
- Problemas de sincronización

#### **Soluciones**

**Probar Conectividad**
```bash
# Conectividad básica
ping 8.8.8.8
nslookup google.com

# Probar endpoints específicos
curl -I https://api.openai.com
curl -I https://api.anthropic.com
```

### 2. Problemas de Firewall

#### **Síntomas**
- Conexiones bloqueadas
- Acceso a puertos denegado
- Errores SSL/TLS

#### **Soluciones**

**Verificar Puertos Requeridos**
```bash
# APIs de Proveedores AI
443 (HTTPS) - api.openai.com, api.anthropic.com
80 (HTTP) - conexiones de respaldo

# Ollama Local
11434 - servidor Ollama local

# Mapbox
443 - api.mapbox.com
```

## Problemas de Desarrollo

### 1. Fallos de Compilación

#### **Síntomas**
- Errores de compilación
- Dependencias faltantes
- Conflictos de versión

#### **Soluciones**

**Limpiar Entorno de Compilación**
```bash
# Limpiar todos los cachés
npm cache clean --force
rm -rf node_modules package-lock.json
rm -rf dist dist-electron

# Reinstalar dependencias
npm install

# Recompilar módulos nativos
npm run rebuild
```

**Corregir Errores de TypeScript**
```bash
# Actualizar TypeScript
npm install -g typescript@latest

# Verificar configuración
npx tsc --noEmit

# Generar tipos
npm run db:generate
```

### 2. Problemas de Recarga en Caliente

#### **Síntomas**
- Los cambios no se reflejan
- El servidor de desarrollo se cierra inesperadamente
- Fugas de memoria

#### **Soluciones**

**Reiniciar Servidor de Desarrollo**
```bash
# Terminar procesos existentes
pkill -f "vite\|electron"

# Limpiar archivos temporales
rm -rf .vite/

# Reiniciar desarrollo
npm run dev
```

## Herramientas de Diagnóstico

### 1. Diagnósticos Integrados

#### Información del Sistema
```typescript
// Obtener información del sistema
const sysInfo = await window.electronAPI.system.getInfo();
console.log('Plataforma:', sysInfo.platform);
console.log('Memoria:', sysInfo.memory);
console.log('CPU:', sysInfo.cpu);
```

#### Registros de la Aplicación
```bash
# Ver registros de la aplicación
tail -f ~/.boorie/logs/main.log
tail -f ~/.boorie/logs/renderer.log
tail -f ~/.boorie/logs/wntr.log
```

### 2. Modo de Depuración

Habilitar depuración completa:

```bash
# Iniciar con indicadores de depuración
DEBUG=* boorie --debug --log-level=debug

# Habilitar herramientas de desarrollo
boorie --enable-dev-tools

# Desactivar seguridad (solo desarrollo)
boorie --disable-web-security --ignore-certificate-errors
```

### 3. Perfilado de Rendimiento

```typescript
// Perfilar rendimiento
console.time('operation');
await performOperation();
console.timeEnd('operation');

// Uso de memoria
console.log('Memoria:', process.memoryUsage());
```

## Obtener Ayuda

### 1. Recursos de Autoayuda
- [Wiki de Documentación](Home.md)
- [FAQ](FAQ.md)
- [Guía de Inicio Rápido](Inicio-Rapido.md)

### 2. Soporte de la Comunidad
- [Discusiones en GitHub](https://github.com/Boorie-AI/boorie_cliente/discussions)
- [Seguimiento de Problemas](https://github.com/Boorie-AI/boorie_cliente/issues)
- [Comunidad en Discord](https://discord.gg/boorie)

### 3. Soporte Profesional
- Soporte Técnico: support@boorie.com
- Soporte Empresarial: enterprise@boorie.com
- Servicios de Formación: training@boorie.com

### 4. Reportar Errores

Al reportar problemas, incluye:

```
**Entorno:**
- SO: [versión de macOS/Windows/Linux]
- Versión de Boorie: [x.y.z]
- Node.js: [versión]
- Python: [versión]

**Descripción del Problema:**
[Descripción clara del problema]

**Pasos para Reproducir:**
1. [Primer paso]
2. [Segundo paso]
3. [Tercer paso]

**Comportamiento Esperado:**
[Qué debería suceder]

**Comportamiento Real:**
[Qué sucede realmente]

**Registros:**
[Entradas de registro relevantes]

**Capturas de Pantalla:**
[Si aplica]
```

---

**Recuerda**: La mayoría de los problemas pueden resolverse siguiendo estos pasos de solución de problemas. Si los problemas persisten, no dudes en contactar a la comunidad o al equipo de soporte.
