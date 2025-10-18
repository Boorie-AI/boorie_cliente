# WNTR Integration - Water Network Analysis

## Overview

Boorie integrates the Water Network Tool for Resilience (WNTR) to provide comprehensive water distribution system analysis capabilities. This integration allows hydraulic engineers to perform advanced network simulations, analyze system behavior, and optimize water infrastructure designs.

## What is WNTR?

WNTR is a Python package designed for analyzing the resilience of water distribution networks. It provides tools for:
- Hydraulic and water quality simulation
- Network connectivity analysis
- Resilience assessment
- Optimization studies
- Data visualization

## Features

### 🌊 Hydraulic Analysis
- **Steady-state simulations**: Analyze network behavior under normal conditions
- **Extended period simulations**: Model system performance over time
- **Pressure analysis**: Evaluate pressure distributions throughout the network
- **Flow analysis**: Analyze flow patterns and velocities

### 🧪 Water Quality Analysis
- **Chemical transport**: Model contaminant propagation
- **Age analysis**: Track water age throughout the system
- **Source tracing**: Identify water sources for any location
- **Mixing analysis**: Analyze water mixing at junctions

### 🔗 Network Connectivity
- **Topology analysis**: Evaluate network structure and connectivity
- **Centrality measures**: Identify critical network components
- **Shortest path analysis**: Find optimal paths through the network
- **Clustering analysis**: Identify network communities

### 📊 Resilience Assessment
- **Failure simulation**: Model component failures and their impacts
- **Redundancy analysis**: Evaluate system backup capabilities
- **Performance metrics**: Calculate resilience indicators
- **Scenario analysis**: Compare different operational scenarios

## Installation and Setup

### Python Environment Setup

WNTR requires a properly configured Python environment. On macOS, we use a virtual environment to avoid code signing issues with system Python:

```bash
# Automatic setup
./setup-python-wntr.sh

# Manual setup
python3 -m venv venv-wntr
source venv-wntr/bin/activate
pip install numpy>=1.20 scipy>=1.7 pandas>=1.3 networkx>=2.6 matplotlib>=3.4 wntr>=0.5.0
```

### Environment Configuration

Add the Python path to your `.env` file:

```env
PYTHON_PATH=/Users/your-username/repositorio/boorie_cliente/venv-wntr/bin/python3
```

### Verification

Verify the installation:

```bash
./check-python-wntr.js
# or
./run-with-wntr.sh python test-wntr-functionality.py
```

## Architecture

### Python Service Layer

#### WNTR Service (`wntrService.py`)
```python
class WNTRService:
    def __init__(self):
        self.network = None
        self.simulation_results = None
    
    def load_network(self, inp_file_path):
        """Load EPANET .inp file"""
        
    def run_hydraulic_simulation(self, duration=24*3600):
        """Run hydraulic simulation"""
        
    def run_water_quality_simulation(self, duration=24*3600):
        """Run water quality simulation"""
        
    def analyze_network_connectivity(self):
        """Analyze network topology"""
        
    def export_results_to_json(self):
        """Export results in JSON format"""
```

#### Key Methods
- `load_network()`: Load EPANET .inp files
- `run_hydraulic_simulation()`: Execute hydraulic analysis
- `run_water_quality_simulation()`: Execute quality analysis
- `analyze_network_connectivity()`: Perform topology analysis
- `get_network_summary()`: Generate network statistics
- `export_results_to_json()`: Export data for visualization

### TypeScript Interface Layer

#### WNTR Wrapper (`wntrWrapper.ts`)
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

### IPC Handler Layer

#### WNTR Handler (`electron/handlers/wntr.handler.ts`)
```typescript
export class WNTRHandler {
  private wntr: WNTRWrapper;
  
  async loadNetwork(inputFilePath: string): Promise<WNTRLoadResult>;
  async runSimulation(type: 'hydraulic' | 'quality', duration?: number);
  async analyzeNetwork(): Promise<WNTRConnectivityResult>;
  async exportResults(format: 'json' | 'csv'): Promise<string>;
}
```

## Usage Examples

### Loading a Network

```typescript
// Frontend component
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

### Running Hydraulic Simulation

```typescript
const runHydraulicAnalysis = async () => {
  try {
    setAnalysisLoading(true);
    
    // Track analysis start
    trackWNTRAnalysis('hydraulic_simulation_start', true, networkData?.name);
    
    const result = await window.electronAPI.wntr.runSimulation('hydraulic', 86400);
    
    if (result.success) {
      setSimulationResults(result.results);
      trackWNTRAnalysis('hydraulic_simulation', true, networkData?.name);
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    console.error('Simulation failed:', error);
    trackWNTRAnalysis('hydraulic_simulation', false, networkData?.name, error.message);
  } finally {
    setAnalysisLoading(false);
  }
};
```

### Network Connectivity Analysis

```typescript
const analyzeConnectivity = async () => {
  try {
    const connectivityResult = await window.electronAPI.wntr.analyzeConnectivity();
    
    if (connectivityResult.success) {
      setConnectivityData(connectivityResult.data);
      
      // Display connectivity metrics
      const metrics = {
        nodes: connectivityResult.data.node_count,
        pipes: connectivityResult.data.pipe_count,
        connected_components: connectivityResult.data.connected_components,
        diameter_range: connectivityResult.data.diameter_range
      };
      
      trackWNTRAnalysis('connectivity_analysis', true, networkData?.name);
    }
  } catch (error) {
    trackWNTRAnalysis('connectivity_analysis', false, networkData?.name, error.message);
  }
};
```

## Data Structures

### Network Data Structure
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

interface WNTRJunction {
  id: string;
  coordinates: [number, number];
  elevation: number;
  demand: number;
  pressure?: number;
}

interface WNTRPipe {
  id: string;
  start_node: string;
  end_node: string;
  length: number;
  diameter: number;
  roughness: number;
  flow?: number;
  velocity?: number;
}
```

### Simulation Results
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

## Visualization Integration

### Network Visualization
```typescript
// vis-network integration
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

### Geographic Visualization
```typescript
// Mapbox integration
const addNetworkToMap = (map: mapboxgl.Map, networkData: WNTRNetworkData) => {
  // Add junctions as points
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
  
  // Add pipes as lines
  map.addSource('pipes', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: networkData.links.pipes.map(pipe => ({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            getNodeCoordinates(pipe.start_node),
            getNodeCoordinates(pipe.end_node)
          ]
        },
        properties: {
          id: pipe.id,
          diameter: pipe.diameter,
          flow: pipe.flow
        }
      }))
    }
  });
};
```

## Error Handling

### Python Error Management
```python
# wntrService.py
try:
    import wntr
    import numpy as np
    import pandas as pd
    import json
    import sys
    import traceback
except ImportError as e:
    error_response = {
        "success": False,
        "error": f"Import error: {str(e)}",
        "error_type": "ImportError"
    }
    print(json.dumps(error_response))
    sys.exit(1)

def safe_execute(func):
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "error_type": type(e).__name__,
                "traceback": traceback.format_exc()
            }
    return wrapper
```

### TypeScript Error Handling
```typescript
// wntrWrapper.ts
private async executeCommand(command: string[]): Promise<any> {
  return new Promise((resolve, reject) => {
    const process = spawn(this.pythonPath, command);
    let output = '';
    let errorOutput = '';
    
    process.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    process.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    process.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`WNTR process failed: ${errorOutput}`));
        return;
      }
      
      try {
        const result = JSON.parse(output);
        resolve(result);
      } catch (parseError) {
        reject(new Error(`Failed to parse WNTR output: ${parseError.message}`));
      }
    });
    
    process.on('error', (error) => {
      reject(new Error(`Failed to start WNTR process: ${error.message}`));
    });
  });
}
```

## Performance Optimization

### Caching Strategy
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
  
  cacheResults(key: string, results: WNTRSimulationResult) {
    this.resultsCache.set(key, results);
  }
}
```

### Async Processing
```typescript
// Non-blocking simulation execution
const runSimulationAsync = async (
  type: 'hydraulic' | 'quality',
  duration: number,
  onProgress?: (progress: number) => void
) => {
  const simulationId = generateId();
  
  // Start simulation in background
  const promise = window.electronAPI.wntr.runSimulation(type, duration);
  
  // Poll for progress updates
  const progressInterval = setInterval(async () => {
    const status = await window.electronAPI.wntr.getSimulationStatus(simulationId);
    if (onProgress && status.progress) {
      onProgress(status.progress);
    }
    
    if (status.complete) {
      clearInterval(progressInterval);
    }
  }, 1000);
  
  return promise;
};
```

## Testing

### Unit Tests
```python
# test_wntr_functionality.py
import unittest
from wntrService import WNTRService

class TestWNTRService(unittest.TestCase):
    def setUp(self):
        self.service = WNTRService()
    
    def test_load_network(self):
        result = self.service.load_network('test-network.inp')
        self.assertTrue(result['success'])
        self.assertIn('network', result)
    
    def test_hydraulic_simulation(self):
        self.service.load_network('test-network.inp')
        result = self.service.run_hydraulic_simulation(3600)
        self.assertTrue(result['success'])
        self.assertIn('results', result)

if __name__ == '__main__':
    unittest.main()
```

### Integration Tests
```typescript
// test-wntr-ipc.js
const { WNTRHandler } = require('./electron/handlers/wntr.handler');

describe('WNTR IPC Handler', () => {
  let handler;
  
  beforeEach(() => {
    handler = new WNTRHandler();
  });
  
  test('should load network file', async () => {
    const result = await handler.loadNetwork('test-network.inp');
    expect(result.success).toBe(true);
    expect(result.network).toBeDefined();
  });
  
  test('should run hydraulic simulation', async () => {
    await handler.loadNetwork('test-network.inp');
    const result = await handler.runSimulation('hydraulic', 3600);
    expect(result.success).toBe(true);
    expect(result.results).toBeDefined();
  });
});
```

## Troubleshooting

### Common Issues

1. **Python Environment Issues**
   ```bash
   # Check Python installation
   which python3
   python3 --version
   
   # Check WNTR installation
   python3 -c "import wntr; print(wntr.__version__)"
   
   # Reinstall WNTR
   pip3 install --upgrade wntr
   ```

2. **File Path Issues**
   ```typescript
   // Ensure file paths are absolute
   const absolutePath = path.resolve(inputFilePath);
   const result = await window.electronAPI.wntr.loadNetwork(absolutePath);
   ```

3. **Memory Issues with Large Networks**
   ```python
   # Optimize memory usage
   import gc
   
   def process_large_network(inp_file):
       # Process in chunks
       network = wntr.network.WaterNetworkModel(inp_file)
       
       # Clear unnecessary data
       gc.collect()
       
       return network
   ```

### Debug Mode

Enable debug logging:

```env
NODE_ENV=development
WNTR_DEBUG=true
```

```python
# wntrService.py
import logging

if os.getenv('WNTR_DEBUG'):
    logging.basicConfig(level=logging.DEBUG)
    logger = logging.getLogger('wntr')
```

## Best Practices

### File Management
- Always use absolute file paths
- Validate file existence before processing
- Handle file permission errors gracefully
- Clean up temporary files after processing

### Performance
- Cache network data for repeated operations
- Use appropriate simulation durations
- Monitor memory usage for large networks
- Implement progress tracking for long operations

### Error Handling
- Provide meaningful error messages
- Log errors for debugging
- Implement retry mechanisms for transient failures
- Validate input parameters before processing

### User Experience
- Show progress indicators for long operations
- Provide cancel functionality for simulations
- Cache results to avoid repeated calculations
- Implement responsive UI during processing

## See Also

- [WNTR Documentation](https://wntr.readthedocs.io/)
- [EPANET Integration](EPANET-Integration.md)
- [Network Visualization](Network-Visualization.md)
- [Hydraulic Tools](Hydraulic-Tools.md)
- [Performance Optimization](Performance-Optimization.md)