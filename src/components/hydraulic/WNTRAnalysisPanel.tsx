import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AlertCircle, Network, BarChart3, FileText, Download } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface WNTRAnalysisPanelProps {
  projectId?: string;
  onAnalysisComplete?: (results: any) => void;
}

interface AnalysisResults {
  topology?: {
    nodes: number;
    pipes: number;
    pumps: number;
    tanks: number;
    reservoirs: number;
    betweenness_centrality: Record<string, number>;
    closeness_centrality: Record<string, number>;
    articulation_points: string[];
    bridges: string[];
  };
  criticality?: {
    node_criticality: Record<string, number>;
    pipe_criticality: Record<string, number>;
    pump_criticality: Record<string, number>;
    critical_components: string[];
  };
  resilience?: {
    topological_resilience: number;
    hydraulic_resilience: number;
    economic_resilience: number;
    system_serviceability: number;
    redundancy_metrics: Record<string, number>;
  };
}

export const WNTRAnalysisPanel: React.FC<WNTRAnalysisPanelProps> = ({
  projectId,
  onAnalysisComplete
}) => {
  const [networkFile, setNetworkFile] = useState<string>('');
  const [activeTab, setActiveTab] = useState('topology');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<AnalysisResults>({});
  const [analysisType, setAnalysisType] = useState<'basic' | 'advanced' | 'comprehensive'>('basic');

  const selectNetworkFile = async () => {
    try {
      const result = await window.electronAPI.dialog.showOpenDialog({
        filters: [{ name: 'EPANET Files', extensions: ['inp'] }],
        properties: ['openFile']
      });

      if (!result.canceled && result.filePaths.length > 0) {
        setNetworkFile(result.filePaths[0]);
      }
    } catch (error) {
      console.error('Error seleccionando archivo:', error);
    }
  };

  const runTopologyAnalysis = useCallback(async () => {
    if (!networkFile) {
      alert('Por favor seleccione un archivo de red');
      return;
    }

    setIsAnalyzing(true);
    setProgress(0);

    try {
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 15, 90));
      }, 500);

      const result = await window.electronAPI.wntr.analyzeNetworkTopology({
        network_file: networkFile,
        include_centrality: true,
        include_connectivity: true
      });

      clearInterval(progressInterval);
      setProgress(100);
      setResults(prev => ({ ...prev, topology: result }));
      
      if (onAnalysisComplete) {
        onAnalysisComplete({ topology: result });
      }
    } catch (error) {
      console.error('Error en análisis de topología:', error);
      alert('Error al ejecutar el análisis de topología');
    } finally {
      setIsAnalyzing(false);
      setProgress(0);
    }
  }, [networkFile, onAnalysisComplete]);

  const runCriticalityAnalysis = useCallback(async () => {
    if (!networkFile) {
      alert('Por favor seleccione un archivo de red');
      return;
    }

    setIsAnalyzing(true);
    setProgress(0);

    try {
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 12, 90));
      }, 600);

      const result = await window.electronAPI.wntr.analyzeComponentCriticality({
        network_file: networkFile,
        analysis_type: analysisType,
        include_pipes: true,
        include_pumps: true,
        include_nodes: true
      });

      clearInterval(progressInterval);
      setProgress(100);
      setResults(prev => ({ ...prev, criticality: result }));
      
      if (onAnalysisComplete) {
        onAnalysisComplete({ criticality: result });
      }
    } catch (error) {
      console.error('Error en análisis de criticidad:', error);
      alert('Error al ejecutar el análisis de criticidad');
    } finally {
      setIsAnalyzing(false);
      setProgress(0);
    }
  }, [networkFile, analysisType, onAnalysisComplete]);

  const runResilienceAnalysis = useCallback(async () => {
    if (!networkFile) {
      alert('Por favor seleccione un archivo de red');
      return;
    }

    setIsAnalyzing(true);
    setProgress(0);

    try {
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 10, 90));
      }, 800);

      const result = await window.electronAPI.wntr.calculateResilienceMetrics({
        network_file: networkFile,
        include_topological: true,
        include_hydraulic: true,
        include_economic: true,
        include_serviceability: true
      });

      clearInterval(progressInterval);
      setProgress(100);
      setResults(prev => ({ ...prev, resilience: result }));
      
      if (onAnalysisComplete) {
        onAnalysisComplete({ resilience: result });
      }
    } catch (error) {
      console.error('Error en análisis de resiliencia:', error);
      alert('Error al ejecutar el análisis de resiliencia');
    } finally {
      setIsAnalyzing(false);
      setProgress(0);
    }
  }, [networkFile, onAnalysisComplete]);

  const generateAnalysisReport = async () => {
    if (Object.keys(results).length === 0) {
      alert('No hay resultados de análisis disponibles');
      return;
    }

    try {
      const reportData = await window.electronAPI.wntr.generateAnalysisReport({
        project_id: projectId || 'default',
        network_file: networkFile,
        analysis_results: results,
        analysis_type: analysisType
      });

      const blob = new Blob([reportData.content], { type: 'text/markdown' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${reportData.filename}`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error generando reporte:', error);
      alert('Error al generar el reporte');
    }
  };

  const renderTopologyResults = () => {
    if (!results.topology) return null;

    const { topology } = results;
    
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Nodos</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{topology.nodes}</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Tuberías</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{topology.pipes}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Bombas</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{topology.pumps}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Tanques</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{topology.tanks}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Reservorios</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{topology.reservoirs}</p>
            </CardContent>
          </Card>
        </div>

        {topology.articulation_points && topology.articulation_points.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Puntos de Articulación</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {topology.articulation_points.map(point => (
                  <Badge key={point} variant="destructive">{point}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {topology.bridges && topology.bridges.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Puentes Críticos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {topology.bridges.map(bridge => (
                  <Badge key={bridge} variant="destructive">{bridge}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  const renderCriticalityResults = () => {
    if (!results.criticality) return null;

    const { criticality } = results;
    
    return (
      <div className="space-y-4">
        {criticality.critical_components && criticality.critical_components.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Componentes Críticos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {criticality.critical_components.map(component => (
                  <Badge key={component} variant="destructive">{component}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {criticality.node_criticality && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Criticidad de Nodos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {Object.entries(criticality.node_criticality)
                    .sort(([,a], [,b]) => (b as number) - (a as number))
                    .slice(0, 10)
                    .map(([node, value]) => (
                      <div key={node} className="flex justify-between text-sm">
                        <span>{node}</span>
                        <span className="font-mono">{(value as number).toFixed(3)}</span>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}

          {criticality.pipe_criticality && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Criticidad de Tuberías</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {Object.entries(criticality.pipe_criticality)
                    .sort(([,a], [,b]) => (b as number) - (a as number))
                    .slice(0, 10)
                    .map(([pipe, value]) => (
                      <div key={pipe} className="flex justify-between text-sm">
                        <span>{pipe}</span>
                        <span className="font-mono">{(value as number).toFixed(3)}</span>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}

          {criticality.pump_criticality && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Criticidad de Bombas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {Object.entries(criticality.pump_criticality)
                    .sort(([,a], [,b]) => (b as number) - (a as number))
                    .slice(0, 10)
                    .map(([pump, value]) => (
                      <div key={pump} className="flex justify-between text-sm">
                        <span>{pump}</span>
                        <span className="font-mono">{(value as number).toFixed(3)}</span>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    );
  };

  const renderResilienceResults = () => {
    if (!results.resilience) return null;

    const { resilience } = results;
    
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Resiliencia Topológica</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {resilience.topological_resilience?.toFixed(3) || 'N/A'}
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Resiliencia Hidráulica</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {resilience.hydraulic_resilience?.toFixed(3) || 'N/A'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Resiliencia Económica</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {resilience.economic_resilience?.toFixed(3) || 'N/A'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Capacidad de Servicio</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {resilience.system_serviceability?.toFixed(3) || 'N/A'}
              </p>
            </CardContent>
          </Card>
        </div>

        {resilience.redundancy_metrics && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Métricas de Redundancia</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                {Object.entries(resilience.redundancy_metrics).map(([metric, value]) => (
                  <div key={metric} className="flex justify-between">
                    <span className="text-sm font-medium">{metric}:</span>
                    <span className="text-sm font-mono">{(value as number).toFixed(3)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Network className="h-5 w-5" />
            Análisis WNTR de Red
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input 
              value={networkFile.split('/').pop() || ''} 
              placeholder="Seleccione archivo .inp"
              readOnly
              className="flex-1"
            />
            <Button onClick={selectNetworkFile} variant="outline">
              Seleccionar
            </Button>
          </div>

          <div className="flex items-center gap-4">
            <Label>Tipo de análisis:</Label>
            <Select value={analysisType} onValueChange={(value) => setAnalysisType(value as any)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="basic">Básico</SelectItem>
                <SelectItem value="advanced">Avanzado</SelectItem>
                <SelectItem value="comprehensive">Completo</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isAnalyzing && (
            <div className="space-y-2">
              <Progress value={progress} />
              <p className="text-sm text-center text-gray-500">
                Analizando red... {progress}%
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="topology">Topología</TabsTrigger>
          <TabsTrigger value="criticality">Criticidad</TabsTrigger>
          <TabsTrigger value="resilience">Resiliencia</TabsTrigger>
        </TabsList>

        <TabsContent value="topology" className="space-y-4">
          <div className="flex gap-2">
            <Button 
              onClick={runTopologyAnalysis} 
              disabled={!networkFile || isAnalyzing}
              className="flex-1"
            >
              <BarChart3 className="mr-2 h-4 w-4" />
              Analizar Topología
            </Button>
          </div>
          {renderTopologyResults()}
        </TabsContent>

        <TabsContent value="criticality" className="space-y-4">
          <div className="flex gap-2">
            <Button 
              onClick={runCriticalityAnalysis} 
              disabled={!networkFile || isAnalyzing}
              className="flex-1"
            >
              <AlertCircle className="mr-2 h-4 w-4" />
              Analizar Criticidad
            </Button>
          </div>
          {renderCriticalityResults()}
        </TabsContent>

        <TabsContent value="resilience" className="space-y-4">
          <div className="flex gap-2">
            <Button 
              onClick={runResilienceAnalysis} 
              disabled={!networkFile || isAnalyzing}
              className="flex-1"
            >
              <Network className="mr-2 h-4 w-4" />
              Analizar Resiliencia
            </Button>
          </div>
          {renderResilienceResults()}
        </TabsContent>
      </Tabs>

      {Object.keys(results).length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <Button onClick={generateAnalysisReport} className="w-full">
              <FileText className="mr-2 h-4 w-4" />
              Generar Reporte de Análisis
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};