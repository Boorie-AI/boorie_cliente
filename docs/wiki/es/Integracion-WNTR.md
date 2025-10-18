# Integración WNTR - Análisis de Redes de Agua

## Visión General

Boorie integra WNTR (Water Network Tool for Resilience) para proporcionar capacidades completas de análisis de sistemas de distribución de agua. Esta integración permite a los ingenieros hidráulicos realizar simulaciones avanzadas de redes, analizar el comportamiento del sistema y optimizar diseños de infraestructura hídrica.

## ¿Qué es WNTR?

WNTR es un paquete de Python diseñado para analizar la resiliencia de redes de distribución de agua. Proporciona herramientas para:
- Simulación hidráulica y de calidad del agua
- Análisis de conectividad de redes
- Evaluación de resiliencia
- Estudios de optimización
- Visualización de datos

## Características Principales

### 🌊 Análisis Hidráulico
- **Simulaciones de estado estacionario**: Analizar comportamiento de la red bajo condiciones normales
- **Simulaciones de período extendido**: Modelar rendimiento del sistema a lo largo del tiempo
- **Análisis de presión**: Evaluar distribuciones de presión en toda la red
- **Análisis de flujo**: Analizar patrones de flujo y velocidades

### 🧪 Análisis de Calidad del Agua
- **Transporte químico**: Modelar propagación de contaminantes
- **Análisis de edad**: Rastrear la edad del agua en todo el sistema
- **Trazabilidad de fuentes**: Identificar fuentes de agua para cualquier ubicación
- **Análisis de mezcla**: Analizar mezcla de agua en uniones

### 🔗 Conectividad de Red
- **Análisis topológico**: Evaluar estructura y conectividad de la red
- **Medidas de centralidad**: Identificar componentes críticos de la red
- **Análisis de ruta más corta**: Encontrar rutas óptimas a través de la red
- **Análisis de agrupamiento**: Identificar comunidades de red

### 📊 Evaluación de Resiliencia
- **Simulación de fallos**: Modelar fallos de componentes y sus impactos
- **Análisis de redundancia**: Evaluar capacidades de respaldo del sistema
- **Métricas de rendimiento**: Calcular indicadores de resiliencia
- **Análisis de escenarios**: Comparar diferentes escenarios operacionales

## Instalación y Configuración

### Configuración del Entorno Python

WNTR requiere un entorno Python correctamente configurado. En macOS, usamos un entorno virtual para evitar problemas de firma de código con Python del sistema:

```bash
# Configuración automática
./setup-python-wntr.sh

# Configuración manual
python3 -m venv venv-wntr
source venv-wntr/bin/activate
pip install numpy>=1.20 scipy>=1.7 pandas>=1.3 networkx>=2.6 matplotlib>=3.4 wntr>=0.5.0
```

### Configuración del Entorno

Añadir la ruta de Python al archivo `.env`:

```env
PYTHON_PATH=/Users/tu-usuario/repositorio/boorie_cliente/venv-wntr/bin/python3
```

### Verificación

Verificar la instalación:

```bash
./check-python-wntr.js
# o
./run-with-wntr.sh python test-wntr-functionality.py
```

## Casos de Uso Prácticos

### 1. Análisis de Red de Distribución Urbana

#### Cargar Red EPANET
```python
# Cargar archivo .inp existente
network = wntr.network.WaterNetworkModel('red-urbana.inp')

# Información básica de la red
print(f"Nodos: {len(network.junction_name_list)}")
print(f"Tuberías: {len(network.pipe_name_list)}")
print(f"Bombas: {len(network.pump_name_list)}")
```

#### Simulación Hidráulica Básica
```python
# Ejecutar simulación hidráulica
sim = wntr.sim.EpanetSimulator(network)
results = sim.run_sim()

# Extraer resultados de presión
pressure = results.node['pressure']
demand = results.node['demand']
flow = results.link['flowrate']

# Análisis de presión mínima
min_pressure = pressure.min().min()
print(f"Presión mínima en la red: {min_pressure:.2f} m")
```

### 2. Análisis de Calidad del Agua

#### Simulación de Contaminación
```python
# Configurar fuente de contaminación
network.add_source('CONT1', 'J-15', 'SETPOINT', 100.0, 'mg/L')

# Ejecutar simulación de calidad
sim = wntr.sim.EpanetSimulator(network)
results = sim.run_sim()

# Analizar propagación
quality = results.node['quality']
affected_nodes = quality[quality > 10.0].dropna()
print(f"Nodos afectados (>10 mg/L): {len(affected_nodes)}")
```

### 3. Análisis de Resiliencia

#### Análisis de Criticidad de Tuberías
```python
# Evaluar criticidad de cada tubería
pipe_criticality = {}

for pipe_name in network.pipe_name_list:
    # Simular fallo de tubería
    network.get_link(pipe_name).status = 0
    
    # Ejecutar simulación
    sim = wntr.sim.EpanetSimulator(network)
    results = sim.run_sim()
    
    # Calcular impacto
    pressure = results.node['pressure']
    nodes_affected = (pressure < 20.0).sum().sum()
    pipe_criticality[pipe_name] = nodes_affected
    
    # Restaurar tubería
    network.get_link(pipe_name).status = 1

# Identificar tuberías más críticas
critical_pipes = sorted(pipe_criticality.items(), 
                       key=lambda x: x[1], reverse=True)[:5]
```

## Integración con Boorie

### 1. Interfaz de Usuario

#### Carga de Archivos EPANET
```typescript
const loadNetworkFile = async (filePath: string) => {
  try {
    setLoading(true);
    const result = await window.electronAPI.wntr.loadNetwork(filePath);
    
    if (result.success) {
      setNetworkData(result.network);
      trackWNTRAnalysis('network_load', true, result.network.name);
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    console.error('Failed to load network:', error);
    trackWNTRAnalysis('network_load', false, undefined, error.message);
  } finally {
    setLoading(false);
  }
};
```

#### Configuración de Simulación
```typescript
interface SimulationConfig {
  duration: number;        // Duración en segundos
  timeStep: number;        // Paso de tiempo en segundos
  solverType: 'hydraulic' | 'quality';
  demandModel: 'DD' | 'PDA';  // Demand Driven vs Pressure Driven
  qualityParameter?: string;
}

const runSimulation = async (config: SimulationConfig) => {
  const result = await window.electronAPI.wntr.runSimulation(config);
  return result;
};
```

### 2. Visualización de Resultados

#### Visualización de Red con vis-network
```typescript
const createNetworkVisualization = (networkData: WNTRNetworkData) => {
  const nodes = networkData.nodes.junctions.map(junction => ({
    id: junction.id,
    label: junction.id,
    x: junction.coordinates[0],
    y: junction.coordinates[1],
    color: getNodeColor(junction.pressure),
    size: getNodeSize(junction.demand)
  }));
  
  const edges = networkData.links.pipes.map(pipe => ({
    id: pipe.id,
    from: pipe.start_node,
    to: pipe.end_node,
    width: getPipeWidth(pipe.diameter),
    color: getPipeColor(pipe.flow)
  }));
  
  return { nodes, edges };
};
```

#### Mapas con Mapbox
```typescript
const addNetworkToMap = (map: mapboxgl.Map, networkData: WNTRNetworkData) => {
  // Añadir uniones como puntos
  map.addSource('junctions', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: networkData.nodes.junctions.map(junction => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: junction.coordinates
        },
        properties: {
          id: junction.id,
          pressure: junction.pressure,
          demand: junction.demand
        }
      }))
    }
  });
};
```

### 3. Análisis Automatizado

#### Detección de Problemas
```python
def analyze_network_issues(results):
    issues = []
    
    # Verificar presiones bajas
    pressure = results.node['pressure']
    low_pressure_nodes = pressure[pressure < 20.0].dropna()
    if not low_pressure_nodes.empty:
        issues.append({
            'type': 'low_pressure',
            'severity': 'high',
            'nodes': low_pressure_nodes.index.tolist(),
            'description': 'Nodos con presión inferior a 20 m'
        })
    
    # Verificar velocidades altas
    flow = results.link['flowrate']
    velocity = results.link['velocity']
    high_velocity_pipes = velocity[velocity > 3.0].dropna()
    if not high_velocity_pipes.empty:
        issues.append({
            'type': 'high_velocity',
            'severity': 'medium',
            'pipes': high_velocity_pipes.index.tolist(),
            'description': 'Tuberías con velocidad superior a 3 m/s'
        })
    
    return issues
```

#### Optimización Automática
```python
def optimize_pipe_sizes(network, min_pressure=20.0, max_velocity=2.5):
    """Optimizar diámetros de tuberías para cumplir restricciones"""
    
    # Diámetros comerciales disponibles
    available_diameters = [100, 150, 200, 250, 300, 400, 500, 600, 750, 900]
    
    optimized_network = network.copy()
    
    # Algoritmo de optimización simple
    for pipe_name in network.pipe_name_list:
        pipe = optimized_network.get_link(pipe_name)
        
        # Probar diámetros incrementalmente
        for diameter in available_diameters:
            pipe.diameter = diameter / 1000  # Convertir a metros
            
            # Simular y verificar restricciones
            sim = wntr.sim.EpanetSimulator(optimized_network)
            results = sim.run_sim()
            
            pressure = results.node['pressure'].min().min()
            velocity = results.link['velocity'].max().max()
            
            if pressure >= min_pressure and velocity <= max_velocity:
                break
    
    return optimized_network
```

## Ejemplos Regionales

### 1. Red de Distribución - Ciudad de México

```python
# Cargar red típica de CDMX
network = wntr.network.WaterNetworkModel('data/mexico-city-network.inp')

# Configurar patrones de demanda mexicanos
# Patrón residencial típico
residential_pattern = [0.5, 0.3, 0.3, 0.4, 0.6, 0.9, 1.2, 1.0, 
                      0.8, 0.7, 0.8, 0.9, 1.0, 0.9, 0.8, 0.9, 
                      1.1, 1.3, 1.4, 1.2, 1.0, 0.8, 0.7, 0.6]

# Aplicar patrón a nodos residenciales
for junction_name in network.junction_name_list:
    junction = network.get_node(junction_name)
    if junction.tag == 'residential':
        junction.demand_timeseries_list[0].pattern_name = 'residential'

# Análisis de cumplimiento con NOM-127-SSA1
def check_nom_compliance(results):
    pressure = results.node['pressure']
    
    # Verificar presión mínima (20 m según NOM)
    min_pressure = pressure.min().min()
    min_pressure_ok = min_pressure >= 20.0
    
    # Verificar presión máxima (50 m según NOM)
    max_pressure = pressure.max().max()
    max_pressure_ok = max_pressure <= 50.0
    
    return {
        'compliant': min_pressure_ok and max_pressure_ok,
        'min_pressure': min_pressure,
        'max_pressure': max_pressure,
        'issues': []
    }
```

### 2. Sistema Rural - Colombia

```python
# Red rural típica colombiana
network = wntr.network.WaterNetworkModel('data/rural-colombia-network.inp')

# Configurar fuentes de agua intermitentes
def setup_intermittent_supply(network, hours_on=12, hours_off=12):
    """Configurar suministro intermitente típico en zonas rurales"""
    
    # Patrón de suministro intermitente
    pattern = [1.0] * hours_on + [0.0] * hours_off
    
    # Aplicar a fuentes principales
    for reservoir_name in network.reservoir_name_list:
        reservoir = network.get_node(reservoir_name)
        reservoir.head_timeseries.pattern_name = 'intermittent'

# Análisis de almacenamiento requerido
def calculate_storage_requirements(network, results):
    """Calcular capacidad de tanques para suministro intermitente"""
    
    demand = results.node['demand']
    total_daily_demand = demand.sum().sum() * 24  # m³/día
    
    # Factor de seguridad del 20%
    required_storage = total_daily_demand * 1.2
    
    return {
        'daily_demand': total_daily_demand,
        'required_storage': required_storage,
        'storage_per_capita': required_storage / estimated_population
    }
```

## Troubleshooting

### Problemas Comunes

#### 1. Errores de Convergencia
```python
# Configurar parámetros del solver
network.options.time.duration = 24 * 3600
network.options.time.hydraulic_timestep = 3600
network.options.hydraulic.accuracy = 0.001
network.options.hydraulic.trials = 100
network.options.hydraulic.checkfreq = 2
```

#### 2. Problemas de Coordinadas
```python
def fix_coordinates(network):
    """Corregir coordenadas faltantes o incorrectas"""
    
    # Verificar nodos sin coordenadas
    nodes_without_coords = []
    for junction_name in network.junction_name_list:
        junction = network.get_node(junction_name)
        if junction.coordinates is None or junction.coordinates == (0, 0):
            nodes_without_coords.append(junction_name)
    
    # Asignar coordenadas automáticamente usando layout
    if nodes_without_coords:
        G = network.get_graph()
        pos = networkx.spring_layout(G)
        
        for node_name in nodes_without_coords:
            if node_name in pos:
                x, y = pos[node_name]
                network.get_node(node_name).coordinates = (x * 1000, y * 1000)
```

#### 3. Problemas de Unidades
```python
def convert_units(network, from_unit='LPS', to_unit='CMS'):
    """Convertir unidades en la red"""
    
    conversion_factors = {
        ('LPS', 'CMS'): 0.001,
        ('CMS', 'LPS'): 1000,
        ('GPM', 'LPS'): 0.0631,
        ('LPS', 'GPM'): 15.85
    }
    
    factor = conversion_factors.get((from_unit, to_unit), 1.0)
    
    # Convertir demandas
    for junction_name in network.junction_name_list:
        junction = network.get_node(junction_name)
        for demand in junction.demand_timeseries_list:
            demand.base_value *= factor
```

## Mejores Prácticas

### 1. Preparación de Datos
- Verificar consistencia de unidades
- Validar topología de red
- Comprobar datos de demanda
- Revisar propiedades de tuberías

### 2. Configuración de Simulación
- Usar pasos de tiempo apropiados
- Configurar tolerancias del solver
- Establecer condiciones iniciales
- Validar parámetros de calidad

### 3. Análisis de Resultados
- Verificar convergencia
- Validar con mediciones de campo
- Analizar tendencias temporales
- Documentar suposiciones

### 4. Optimización de Rendimiento
- Simplificar redes complejas
- Usar modelos apropiados
- Cachear resultados repetitivos
- Monitorear uso de memoria

---

**Siguiente paso**: Explorar [Herramientas Hidráulicas](Herramientas-Hidraulicas.md) para combinar WNTR con cálculos de ingeniería tradicionales.