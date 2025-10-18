import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  BarChart3, 
  Download, 
  FileText, 
  Activity, 
  Droplets, 
  AlertTriangle,
  TrendingUp,
  MapPin
} from 'lucide-react';

interface WNTRResultsViewerProps {
  results: any;
  simulationType: 'hydraulic' | 'water_quality' | 'scenario' | 'analysis';
  networkFile: string;
  onExport?: (format: 'json' | 'csv' | 'pdf') => void;
}

interface TimeSeriesData {
  time: number[];
  values: number[];
  label: string;
}

interface NodeData {
  id: string;
  pressure?: number;
  demand?: number;
  head?: number;
  quality?: number;
  x?: number;
  y?: number;
}

interface PipeData {
  id: string;
  flow?: number;
  velocity?: number;
  headloss?: number;
  status?: string;
}

export const WNTRResultsViewer: React.FC<WNTRResultsViewerProps> = ({
  results,
  simulationType,
  networkFile,
  onExport
}) => {
  const [activeTab, setActiveTab] = useState('summary');
  const [selectedNode, setSelectedNode] = useState<string>('');
  const [selectedPipe, setSelectedPipe] = useState<string>('');
  const [timeStep, setTimeStep] = useState(0);

  const formatValue = (value: number, decimals: number = 2): string => {
    if (typeof value !== 'number' || isNaN(value)) return 'N/A';
    return value.toFixed(decimals);
  };

  const getStatusColor = (status: string): string => {
    switch (status?.toLowerCase()) {
      case 'open': return 'text-green-600';
      case 'closed': return 'text-red-600';
      case 'active': return 'text-blue-600';
      case 'inactive': return 'text-gray-600';
      default: return 'text-gray-600';
    }
  };

  const renderSummary = () => {
    if (!results?.summary) return <div>No hay datos de resumen disponibles</div>;

    const { summary } = results;

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Estado
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Badge variant={summary.status === 'success' ? 'default' : 'destructive'}>
                {summary.status === 'success' ? 'Exitoso' : 'Error'}
              </Badge>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Tiempo de ejecución</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-semibold">
                {formatValue(summary.execution_time)}s
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Pasos de tiempo</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-semibold">
                {summary.time_steps || 'N/A'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Componentes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-semibold">
                {summary.total_components || 'N/A'}
              </p>
            </CardContent>
          </Card>
        </div>

        {summary.warnings && summary.warnings.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
                Advertencias
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {summary.warnings.map((warning: string, index: number) => (
                  <div key={index} className="text-sm text-yellow-700 bg-yellow-50 p-2 rounded">
                    {warning}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {summary.statistics && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Estadísticas Generales</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                {Object.entries(summary.statistics).map(([key, value]) => (
                  <div key={key} className="flex justify-between">
                    <span className="font-medium">{key}:</span>
                    <span className="font-mono">{formatValue(value as number)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  const renderNodesResults = () => {
    if (!results?.nodes) return <div>No hay datos de nodos disponibles</div>;

    const { nodes } = results;
    const nodeList = Object.keys(nodes.pressure || nodes.demand || {});

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <select 
            className="border rounded p-2"
            value={selectedNode}
            onChange={(e) => setSelectedNode(e.target.value)}
          >
            <option value="">Seleccionar nodo</option>
            {nodeList.map(nodeId => (
              <option key={nodeId} value={nodeId}>{nodeId}</option>
            ))}
          </select>
          
          {nodes.pressure && timeStep !== undefined && (
            <div className="flex items-center gap-2">
              <span className="text-sm">Paso de tiempo:</span>
              <input
                type="range"
                min="0"
                max={Math.max(0, Object.values(nodes.pressure)[0]?.length - 1 || 0)}
                value={timeStep}
                onChange={(e) => setTimeStep(parseInt(e.target.value))}
                className="w-32"
              />
              <span className="text-sm font-mono">{timeStep}</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {nodes.pressure && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Presión (m)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {Object.entries(nodes.pressure).map(([nodeId, values]) => {
                    const currentValue = Array.isArray(values) ? values[timeStep] : values;
                    return (
                      <div key={nodeId} className="flex justify-between text-sm">
                        <span>{nodeId}</span>
                        <span className="font-mono">{formatValue(currentValue as number)}</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {nodes.demand && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Droplets className="h-4 w-4" />
                  Demanda (L/s)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {Object.entries(nodes.demand).map(([nodeId, values]) => {
                    const currentValue = Array.isArray(values) ? values[timeStep] : values;
                    return (
                      <div key={nodeId} className="flex justify-between text-sm">
                        <span>{nodeId}</span>
                        <span className="font-mono">{formatValue(currentValue as number)}</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {nodes.quality && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  Calidad
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {Object.entries(nodes.quality).map(([nodeId, values]) => {
                    const currentValue = Array.isArray(values) ? values[timeStep] : values;
                    return (
                      <div key={nodeId} className="flex justify-between text-sm">
                        <span>{nodeId}</span>
                        <span className="font-mono">{formatValue(currentValue as number)}</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {selectedNode && nodes.pressure?.[selectedNode] && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Serie temporal - {selectedNode}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="font-medium">Presión promedio:</span>
                    <p className="font-mono">
                      {formatValue(
                        (nodes.pressure[selectedNode] as number[]).reduce((a, b) => a + b, 0) / 
                        (nodes.pressure[selectedNode] as number[]).length
                      )} m
                    </p>
                  </div>
                  <div>
                    <span className="font-medium">Presión mínima:</span>
                    <p className="font-mono">
                      {formatValue(Math.min(...(nodes.pressure[selectedNode] as number[])))} m
                    </p>
                  </div>
                  <div>
                    <span className="font-medium">Presión máxima:</span>
                    <p className="font-mono">
                      {formatValue(Math.max(...(nodes.pressure[selectedNode] as number[])))} m
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  const renderPipesResults = () => {
    if (!results?.pipes) return <div>No hay datos de tuberías disponibles</div>;

    const { pipes } = results;
    const pipeList = Object.keys(pipes.flow || pipes.velocity || {});

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <select 
            className="border rounded p-2"
            value={selectedPipe}
            onChange={(e) => setSelectedPipe(e.target.value)}
          >
            <option value="">Seleccionar tubería</option>
            {pipeList.map(pipeId => (
              <option key={pipeId} value={pipeId}>{pipeId}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {pipes.flow && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Caudal (L/s)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {Object.entries(pipes.flow).map(([pipeId, values]) => {
                    const currentValue = Array.isArray(values) ? values[timeStep] : values;
                    return (
                      <div key={pipeId} className="flex justify-between text-sm">
                        <span>{pipeId}</span>
                        <span className="font-mono">{formatValue(currentValue as number)}</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {pipes.velocity && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  Velocidad (m/s)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {Object.entries(pipes.velocity).map(([pipeId, values]) => {
                    const currentValue = Array.isArray(values) ? values[timeStep] : values;
                    return (
                      <div key={pipeId} className="flex justify-between text-sm">
                        <span>{pipeId}</span>
                        <span className="font-mono">{formatValue(currentValue as number)}</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {pipes.headloss && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Pérdida de carga (m)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {Object.entries(pipes.headloss).map(([pipeId, values]) => {
                    const currentValue = Array.isArray(values) ? values[timeStep] : values;
                    return (
                      <div key={pipeId} className="flex justify-between text-sm">
                        <span>{pipeId}</span>
                        <span className="font-mono">{formatValue(currentValue as number)}</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {selectedPipe && pipes.flow?.[selectedPipe] && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Serie temporal - {selectedPipe}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="font-medium">Caudal promedio:</span>
                    <p className="font-mono">
                      {formatValue(
                        (pipes.flow[selectedPipe] as number[]).reduce((a, b) => a + b, 0) / 
                        (pipes.flow[selectedPipe] as number[]).length
                      )} L/s
                    </p>
                  </div>
                  <div>
                    <span className="font-medium">Caudal mínimo:</span>
                    <p className="font-mono">
                      {formatValue(Math.min(...(pipes.flow[selectedPipe] as number[])))} L/s
                    </p>
                  </div>
                  <div>
                    <span className="font-medium">Caudal máximo:</span>
                    <p className="font-mono">
                      {formatValue(Math.max(...(pipes.flow[selectedPipe] as number[])))} L/s
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  const renderAnalysisResults = () => {
    if (simulationType !== 'analysis' || !results) {
      return <div>No hay datos de análisis disponibles</div>;
    }

    return (
      <div className="space-y-4">
        {results.topology && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Análisis de Topología</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="font-medium">Nodos:</span>
                  <p className="text-lg font-semibold">{results.topology.nodes}</p>
                </div>
                <div>
                  <span className="font-medium">Tuberías:</span>
                  <p className="text-lg font-semibold">{results.topology.pipes}</p>
                </div>
                <div>
                  <span className="font-medium">Bombas:</span>
                  <p className="text-lg font-semibold">{results.topology.pumps}</p>
                </div>
                <div>
                  <span className="font-medium">Tanques:</span>
                  <p className="text-lg font-semibold">{results.topology.tanks}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {results.resilience && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Métricas de Resiliencia</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="font-medium">Topológica:</span>
                  <p className="text-lg font-semibold">
                    {formatValue(results.resilience.topological_resilience)}
                  </p>
                </div>
                <div>
                  <span className="font-medium">Hidráulica:</span>
                  <p className="text-lg font-semibold">
                    {formatValue(results.resilience.hydraulic_resilience)}
                  </p>
                </div>
                <div>
                  <span className="font-medium">Económica:</span>
                  <p className="text-lg font-semibold">
                    {formatValue(results.resilience.economic_resilience)}
                  </p>
                </div>
                <div>
                  <span className="font-medium">Serviciabilidad:</span>
                  <p className="text-lg font-semibold">
                    {formatValue(results.resilience.system_serviceability)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Resultados de Simulación WNTR</h3>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => onExport?.('json')}
          >
            <Download className="mr-2 h-4 w-4" />
            JSON
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => onExport?.('csv')}
          >
            <FileText className="mr-2 h-4 w-4" />
            CSV
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="summary">Resumen</TabsTrigger>
          <TabsTrigger value="nodes">Nodos</TabsTrigger>
          <TabsTrigger value="pipes">Tuberías</TabsTrigger>
          <TabsTrigger value="analysis">Análisis</TabsTrigger>
        </TabsList>

        <TabsContent value="summary">
          {renderSummary()}
        </TabsContent>

        <TabsContent value="nodes">
          {renderNodesResults()}
        </TabsContent>

        <TabsContent value="pipes">
          {renderPipesResults()}
        </TabsContent>

        <TabsContent value="analysis">
          {renderAnalysisResults()}
        </TabsContent>
      </Tabs>
    </div>
  );
};