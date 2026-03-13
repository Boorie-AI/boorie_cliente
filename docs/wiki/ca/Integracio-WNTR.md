# Integració WNTR - Anàlisi de Xarxes d'Aigua

## Descripció General

Boorie integra el Water Network Tool for Resilience (WNTR) per proporcionar capacitats completes d'anàlisi de sistemes de distribució d'aigua. Aquesta integració permet als enginyers hidràulics realitzar simulacions avançades de xarxa, analitzar el comportament del sistema i optimitzar els dissenys d'infraestructura hídrica.

## Què és WNTR?

WNTR és un paquet Python dissenyat per analitzar la resiliència de xarxes de distribució d'aigua. Proporciona eines per:
- Simulació hidràulica i de qualitat de l'aigua
- Anàlisi de connectivitat de xarxa
- Avaluació de resiliència
- Estudis d'optimització
- Visualització de dades

## Característiques

### Anàlisi Hidràulica
- **Simulacions d'estat estable**: Analitzar el comportament de la xarxa en condicions normals
- **Simulacions de període estès**: Modelar el rendiment del sistema al llarg del temps
- **Anàlisi de pressió**: Avaluar distribucions de pressió a tota la xarxa
- **Anàlisi de flux**: Analitzar patrons de flux i velocitats

### Anàlisi de Qualitat de l'Aigua
- **Transport químic**: Modelar la propagació de contaminants
- **Anàlisi d'edat**: Rastrejar l'edat de l'aigua a tot el sistema
- **Rastreig de fonts**: Identificar fonts d'aigua per a qualsevol ubicació
- **Anàlisi de mescla**: Analitzar la mescla d'aigua a les unions

### Connectivitat de Xarxa
- **Anàlisi topològica**: Avaluar l'estructura i connectivitat de la xarxa
- **Mesures de centralitat**: Identificar components crítics de la xarxa
- **Anàlisi de camí més curt**: Trobar camins òptims a través de la xarxa
- **Anàlisi de clústers**: Identificar comunitats de la xarxa

### Avaluació de Resiliència
- **Simulació de fallades**: Modelar fallades de components i els seus impactes
- **Anàlisi de redundància**: Avaluar capacitats de reforç del sistema
- **Mètriques de rendiment**: Calcular indicadors de resiliència
- **Anàlisi d'escenaris**: Comparar diferents escenaris operacionals

## Instal·lació i Configuració

### Configuració de l'Entorn Python

WNTR requereix un entorn Python correctament configurat. A macOS, usem un entorn virtual per evitar problemes de signatura de codi amb el Python del sistema:

```bash
# Configuració automàtica
./setup-python-wntr.sh

# Configuració manual
python3 -m venv venv-wntr
source venv-wntr/bin/activate
pip install numpy>=1.20 scipy>=1.7 pandas>=1.3 networkx>=2.6 matplotlib>=3.4 wntr>=0.5.0
```

### Configuració de l'Entorn

Afegeix la ruta de Python al teu arxiu `.env`:

```env
PYTHON_PATH=/Users/your-username/repositorio/boorie_cliente/venv-wntr/bin/python3
```

### Verificació

Verifica la instal·lació:

```bash
./check-python-wntr.js
# o
./run-with-wntr.sh python test-wntr-functionality.py
```

## Arquitectura

### Capa de Servei Python

#### Servei WNTR (`wntrService.py`)
```python
class WNTRService:
    def __init__(self):
        self.network = None
        self.simulation_results = None

    def load_network(self, inp_file_path):
        """Carregar arxiu EPANET .inp"""

    def run_hydraulic_simulation(self, duration=24*3600):
        """Executar simulació hidràulica"""

    def run_water_quality_simulation(self, duration=24*3600):
        """Executar simulació de qualitat de l'aigua"""

    def analyze_network_connectivity(self):
        """Analitzar topologia de la xarxa"""

    def export_results_to_json(self):
        """Exportar resultats en format JSON"""
```

### Capa d'Interfície TypeScript

#### Wrapper WNTR (`wntrWrapper.ts`)
```typescript
export class WNTRWrapper {
  private pythonPath: string;
  private scriptPath: string;

  constructor(pythonPath?: string, scriptPath?: string);

  async loadNetwork(inputFilePath: string): Promise<WNTRLoadResult>;
  async runHydraulicSimulation(duration?: number): Promise<WNTRSimulationResult>;
  async runWaterQualitySimulation(duration?: number): Promise<WNTRSimulationResult>;
  async analyzeConnectivity(): Promise<WNTRConnectivityResult>;
  async getNetworkSummary(): Promise<WNTRNetworkSummary>;
}
```

### Capa de Manejador IPC

#### Manejador WNTR (`electron/handlers/wntr.handler.ts`)
```typescript
export class WNTRHandler {
  private wntr: WNTRWrapper;

  async loadNetwork(inputFilePath: string): Promise<WNTRLoadResult>;
  async runSimulation(type: 'hydraulic' | 'quality', duration?: number);
  async analyzeNetwork(): Promise<WNTRConnectivityResult>;
  async exportResults(format: 'json' | 'csv'): Promise<string>;
}
```

## Exemples d'Ús

### Carregar una Xarxa

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
    console.error('Error en carregar la xarxa:', error);
    trackWNTRAnalysis('network_load', false, undefined, error.message);
  } finally {
    setLoading(false);
  }
};
```

### Executar Simulació Hidràulica

```typescript
const runHydraulicAnalysis = async () => {
  try {
    setAnalysisLoading(true);
    trackWNTRAnalysis('hydraulic_simulation_start', true, networkData?.name);

    const result = await window.electronAPI.wntr.runSimulation('hydraulic', 86400);

    if (result.success) {
      setSimulationResults(result.results);
      trackWNTRAnalysis('hydraulic_simulation', true, networkData?.name);
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    console.error('La simulació ha fallat:', error);
    trackWNTRAnalysis('hydraulic_simulation', false, networkData?.name, error.message);
  } finally {
    setAnalysisLoading(false);
  }
};
```

## Estructures de Dades

### Estructura de Dades de Xarxa
```typescript
interface WNTRNetworkData {
  name: string;
  nodes: {
    junctions: WNTRJunction[];
    reservoirs: WNTRReservoir[];
    tanks: WNTRTank[];
  };
  links: {
    pipes: WNTRPipe[];
    pumps: WNTRPump[];
    valves: WNTRValve[];
  };
  summary: WNTRNetworkSummary;
}
```

### Resultats de Simulació
```typescript
interface WNTRSimulationResult {
  success: boolean;
  results?: {
    nodes: {
      pressure: Record<string, number[]>;
      head: Record<string, number[]>;
      demand: Record<string, number[]>;
    };
    links: {
      flow: Record<string, number[]>;
      velocity: Record<string, number[]>;
      headloss: Record<string, number[]>;
    };
    time: number[];
  };
  error?: string;
  duration_ms: number;
}
```

## Integració de Visualització

### Visualització de Xarxa
```typescript
// Integració vis-network
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

### Visualització Geogràfica
```typescript
// Integració Mapbox
const addNetworkToMap = (map: mapboxgl.Map, networkData: WNTRNetworkData) => {
  // Afegir unions com a punts
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

## Gestió d'Errors

### Gestió d'Errors Python
```python
try:
    import wntr
    import numpy as np
    import pandas as pd
except ImportError as e:
    error_response = {
        "success": False,
        "error": f"Error d'importació: {str(e)}",
        "error_type": "ImportError"
    }
    print(json.dumps(error_response))
    sys.exit(1)
```

## Optimització de Rendiment

### Estratègia de Caché
```typescript
class WNTRCache {
  private networkCache = new Map<string, WNTRNetworkData>();
  private resultsCache = new Map<string, WNTRSimulationResult>();

  cacheNetwork(filePath: string, data: WNTRNetworkData) {
    this.networkCache.set(filePath, data);
  }

  getCachedNetwork(filePath: string): WNTRNetworkData | null {
    return this.networkCache.get(filePath) || null;
  }
}
```

## Solució de Problemes

### Problemes Comuns

1. **Problemes de l'Entorn Python**
   ```bash
   which python3
   python3 --version
   python3 -c "import wntr; print(wntr.__version__)"
   pip3 install --upgrade wntr
   ```

2. **Problemes de Rutes d'Arxiu**
   ```typescript
   const absolutePath = path.resolve(inputFilePath);
   const result = await window.electronAPI.wntr.loadNetwork(absolutePath);
   ```

3. **Problemes de Memòria amb Xarxes Grans**
   ```python
   import gc

   def process_large_network(inp_file):
       network = wntr.network.WaterNetworkModel(inp_file)
       gc.collect()
       return network
   ```

### Mode de Depuració

```env
NODE_ENV=development
WNTR_DEBUG=true
```

## Millors Pràctiques

### Gestió d'Arxius
- Usar sempre rutes d'arxiu absolutes
- Validar l'existència de l'arxiu abans de processar
- Gestionar errors de permisos d'arxiu correctament
- Netejar arxius temporals després del processament

### Rendiment
- Guardar en caché dades de xarxa per a operacions repetides
- Usar duracions de simulació adequades
- Monitoritzar l'ús de memòria per a xarxes grans
- Implementar seguiment de progrés per a operacions llargues

### Experiència d'Usuari
- Mostrar indicadors de progrés per a operacions llargues
- Proporcionar funcionalitat de cancel·lació per a simulacions
- Guardar en caché resultats per evitar càlculs repetits
- Implementar UI responsiva durant el processament

## Vegeu També

- [Documentació WNTR](https://wntr.readthedocs.io/)
- [Integració EPANET](Integracio-EPANET.md)
- [Visualització de Xarxes](Visualitzacio-Xarxes.md)
- [Eines Hidràuliques](Eines-Hidrauliques.md)
