import React, { useState, useCallback, useEffect } from 'react';
import { useClarity } from '@/components/ClarityProvider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { WNTRMapViewer } from './WNTRMapViewer';
import { WNTRAdvancedMapViewer } from './WNTRAdvancedMapViewer';
import { WNTRNetworkVisualization } from './WNTRNetworkVisualization';
import { 
  FileUp, Play, Stop, Pause, BarChart3, Download, Map, Network, 
  Settings, Layers, Eye, EyeOff, RefreshCw, AlertCircle, 
  Activity, Droplets, Gauge, TrendingUp, Database, FileText,
  ChevronRight, Zap, Target, Shield, Construction
} from 'lucide-react';

interface WNTRMainInterfaceProps {
  projectId?: string;
  networkData?: NetworkData | null;
  simulationResults?: any;
  onDataLoaded?: (data: NetworkData) => void;
  onSimulationCompleted?: (results: any) => void;
  onAnalysisComplete?: (results: any) => void;
  onSimulationComplete?: (results: any) => void;
}

interface NetworkData {
  name: string;
  summary: {
    junctions: number;
    tanks: number;
    reservoirs: number;
    pipes: number;
    pumps: number;
    valves: number;
  };
  nodes: any[];
  links: any[];
  options: any;
  coordinate_system?: any;
}

interface AnalysisResults {
  topology?: any;
  criticality?: any;
  resilience?: any;
}

interface SimulationResults {
  status: string;
  execution_time: number;
  summary: Record<string, any>;
  node_results: any;
  link_results: any;
  timestamps: number[];
}

interface WNTRViewSettings {
  showMap: boolean;
  showNetwork: boolean;
  showAnalysis: boolean;
  showSimulation: boolean;
  activeVisualization: 'map' | 'advanced' | 'network' | 'results' | 'analysis';
}

export const WNTRMainInterface: React.FC<WNTRMainInterfaceProps> = ({
  projectId,
  onAnalysisComplete,
  onSimulationComplete
}) => {
  // Clarity tracking
  const { trackEvent, isReady: clarityReady } = useClarity();
  
  // Core state
  const [networkData, setNetworkData] = useState<NetworkData | null>(null);
  const [analysisResults, setAnalysisResults] = useState<AnalysisResults>({});
  const [simulationResults, setSimulationResults] = useState<SimulationResults | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Operation states
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [simulationProgress, setSimulationProgress] = useState(0);
  
  // View settings
  const [viewSettings, setViewSettings] = useState<WNTRViewSettings>({
    showMap: true,
    showNetwork: true,
    showAnalysis: true,
    showSimulation: true,
    activeVisualization: 'map'
  });
  
  // Current active operations
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedAnalysisType, setSelectedAnalysisType] = useState<'topology' | 'criticality' | 'resilience'>('topology');
  const [selectedSimulationType, setSelectedSimulationType] = useState<'hydraulic' | 'water_quality' | 'scenario'>('hydraulic');

  // Load network file
  const handleLoadNetwork = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Track file loading start
      if (clarityReady) {
        trackEvent('wntr_file_load_started');
      }
      
      const result = await window.electronAPI.wntr.loadINPFile();
      
      if (result.success && result.data) {
        setNetworkData(result.data);
        setActiveTab('network');
        
        // Track successful file load
        if (clarityReady) {
          trackEvent('wntr_file_loaded', {
            network_name: result.data.name,
            nodes_count: result.data.summary?.junctions || 0,
            links_count: result.data.summary?.pipes || 0
          });
        }
      } else {
        setError(result.error || 'Failed to load network file');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load network file';
      setError(errorMessage);
      
      // Track file loading error
      if (clarityReady) {
        trackEvent('wntr_file_load_error', {
          error_message: errorMessage
        });
      }
    } finally {
      setIsLoading(false);
    }
  }, [clarityReady, trackEvent]);

  // Run analysis
  const handleRunAnalysis = useCallback(async (analysisType: 'topology' | 'criticality' | 'resilience') => {
    if (!networkData) {
      setError('No network data loaded');
      return;
    }
    
    try {
      setIsAnalyzing(true);
      setAnalysisProgress(0);
      setError(null);
      
      // First ensure the INP file is loaded in the backend
      console.log('Loading INP file before analysis:', networkData.name);
      const loadResult = await window.electronAPI.wntr.loadINPFromPath(`data/${networkData.name}`);
      console.log('Load result:', loadResult);
      
      if (!loadResult.success) {
        throw new Error(`Failed to load INP file: ${loadResult.error}`);
      }
      
      const progressInterval = setInterval(() => {
        setAnalysisProgress(prev => Math.min(prev + 10, 90));
      }, 500);

      let result;
      console.log(`Running ${analysisType} analysis for network:`, networkData?.name);
      
      // Track analysis start
      if (clarityReady) {
        trackEvent('wntr_analysis_started', {
          analysis_type: analysisType,
          network_name: networkData?.name,
          has_network_data: !!networkData
        });
      }
      
      switch (analysisType) {
        case 'topology':
          result = await window.electronAPI.wntr.analyzeNetworkTopology({
            network_file: networkData.name,
            include_centrality: true,
            include_connectivity: true
          });
          break;
        case 'criticality':
          result = await window.electronAPI.wntr.analyzeComponentCriticality({
            network_file: networkData.name,
            analysis_type: 'comprehensive',
            include_pipes: true,
            include_pumps: true,
            include_nodes: true
          });
          break;
        case 'resilience':
          result = await window.electronAPI.wntr.calculateResilienceMetrics({
            network_file: networkData.name,
            include_topological: true,
            include_hydraulic: true,
            include_economic: true,
            include_serviceability: true
          });
          break;
      }

      console.log(`${analysisType} analysis result:`, result);

      clearInterval(progressInterval);
      setAnalysisProgress(100);
      
      // Track analysis completion
      if (clarityReady) {
        trackEvent('wntr_analysis_completed', {
          analysis_type: analysisType,
          success: result?.success || false,
          network_name: networkData?.name,
          result_has_data: !!(result && Object.keys(result).length > 0)
        });
      }
      
      setAnalysisResults(prev => ({ ...prev, [analysisType]: result }));
      
      if (onAnalysisComplete) {
        onAnalysisComplete({ [analysisType]: result });
      }
      
      setActiveTab('analysis');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Analysis failed';
      setError(errorMessage);
      
      // Track analysis error
      if (clarityReady) {
        trackEvent('wntr_analysis_error', {
          analysis_type: analysisType,
          error_message: errorMessage,
          network_name: networkData?.name
        });
      }
    } finally {
      setIsAnalyzing(false);
      setAnalysisProgress(0);
    }
  }, [networkData, onAnalysisComplete]);

  // Run simulation
  const handleRunSimulation = useCallback(async (simulationType: 'hydraulic' | 'water_quality' | 'scenario') => {
    if (!networkData) return;
    
    try {
      setIsSimulating(true);
      setSimulationProgress(0);
      setError(null);
      
      const progressInterval = setInterval(() => {
        setSimulationProgress(prev => Math.min(prev + 8, 90));
      }, 600);

      let result;
      switch (simulationType) {
        case 'hydraulic':
          result = await window.electronAPI.wntr.runHydraulicSimulation({
            network_file: networkData.name,
            duration: 24,
            timestep: 1,
            demand_multiplier: 1.0,
            pattern_start: '00:00:00'
          });
          break;
        case 'water_quality':
          result = await window.electronAPI.wntr.runWaterQualitySimulation({
            network_file: networkData.name,
            parameter: 'age',
            duration: 24,
            timestep: 1
          });
          break;
        case 'scenario':
          result = await window.electronAPI.wntr.runScenarioSimulation({
            network_file: networkData.name,
            scenario_type: 'pipe_closure',
            start_time: 0,
            duration: 24,
            components: []
          });
          break;
      }

      clearInterval(progressInterval);
      setSimulationProgress(100);
      
      setSimulationResults(result);
      
      if (onSimulationComplete) {
        onSimulationComplete(result);
      }
      
      setActiveTab('simulation');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Simulation failed');
    } finally {
      setIsSimulating(false);
      setSimulationProgress(0);
    }
  }, [networkData, onSimulationComplete]);

  // Generate comprehensive report
  const handleGenerateReport = useCallback(async () => {
    if (!networkData) return;

    try {
      const reportData = await window.electronAPI.wntr.generateComprehensiveReport({
        project_id: projectId || 'default',
        network_file: networkData.name,
        analysis_results: analysisResults,
        simulation_results: simulationResults,
        include_visualizations: true
      });

      const blob = new Blob([reportData.content], { type: 'text/markdown' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = reportData.filename;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Report generation failed');
    }
  }, [projectId, networkData, analysisResults, simulationResults]);

  const renderOverviewTab = () => (
    <div className="space-y-6">
      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Quick Actions
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Button
            onClick={handleLoadNetwork}
            disabled={isLoading}
            className="h-20 flex flex-col gap-2"
            variant="outline"
          >
            <FileUp className="h-6 w-6" />
            <span className="text-sm">Load Network</span>
          </Button>
          
          <Button
            onClick={() => handleRunAnalysis('topology')}
            disabled={!networkData || isAnalyzing}
            className="h-20 flex flex-col gap-2"
            variant="outline"
          >
            <Target className="h-6 w-6" />
            <span className="text-sm">Analyze</span>
          </Button>
          
          <Button
            onClick={() => handleRunSimulation('hydraulic')}
            disabled={!networkData || isSimulating}
            className="h-20 flex flex-col gap-2"
            variant="outline"
          >
            <Play className="h-6 w-6" />
            <span className="text-sm">Simulate</span>
          </Button>
          
          <Button
            onClick={() => setViewSettings(prev => ({ ...prev, activeVisualization: 'map' }))}
            disabled={!networkData}
            className="h-20 flex flex-col gap-2"
            variant="outline"
          >
            <Map className="h-6 w-6" />
            <span className="text-sm">Visualize</span>
          </Button>
        </CardContent>
      </Card>

      {/* Status Overview */}
      {networkData && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Network Status */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Network className="h-4 w-4" />
                Network Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                <Badge variant="outline" className="text-green-600">Loaded</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Nodes</span>
                <span className="font-mono">{networkData.summary.junctions + networkData.summary.tanks + networkData.summary.reservoirs}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Links</span>
                <span className="font-mono">{networkData.summary.pipes + networkData.summary.pumps + networkData.summary.valves}</span>
              </div>
            </CardContent>
          </Card>

          {/* Analysis Status */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Analysis Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Topology</span>
                <Badge variant={analysisResults.topology ? "default" : "secondary"}>
                  {analysisResults.topology ? "Complete" : "Pending"}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Criticality</span>
                <Badge variant={analysisResults.criticality ? "default" : "secondary"}>
                  {analysisResults.criticality ? "Complete" : "Pending"}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Resilience</span>
                <Badge variant={analysisResults.resilience ? "default" : "secondary"}>
                  {analysisResults.resilience ? "Complete" : "Pending"}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Simulation Status */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Simulation Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                <Badge variant={simulationResults ? "default" : "secondary"}>
                  {simulationResults ? "Complete" : "Not Run"}
                </Badge>
              </div>
              {simulationResults && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Duration</span>
                    <span className="font-mono">{simulationResults.execution_time?.toFixed(2)}s</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Results</span>
                    <Badge variant="outline" className="text-green-600">Available</Badge>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Progress Indicators */}
      {(isAnalyzing || isSimulating) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Operations in Progress</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isAnalyzing && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Analysis Progress</span>
                  <span className="text-sm text-muted-foreground">{analysisProgress}%</span>
                </div>
                <Progress value={analysisProgress} />
              </div>
            )}
            {isSimulating && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Simulation Progress</span>
                  <span className="text-sm text-muted-foreground">{simulationProgress}%</span>
                </div>
                <Progress value={simulationProgress} />
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );

  const renderNetworkTab = () => (
    <div className="space-y-6">
      {!networkData ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Database className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Network Loaded</h3>
            <p className="text-muted-foreground text-center mb-6 max-w-md">
              Load an EPANET .inp file to view network details and perform analysis
            </p>
            <Button onClick={handleLoadNetwork} disabled={isLoading}>
              <FileUp className="h-4 w-4 mr-2" />
              Load Network File
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Network Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Network className="h-5 w-5" />
                  Network Summary: {networkData.name}
                </div>
                <Button onClick={handleLoadNetwork} variant="outline" size="sm">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Reload
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{networkData.summary.junctions}</div>
                  <div className="text-sm text-muted-foreground">Junctions</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">{networkData.summary.tanks}</div>
                  <div className="text-sm text-muted-foreground">Tanks</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{networkData.summary.reservoirs}</div>
                  <div className="text-sm text-muted-foreground">Reservoirs</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-600">{networkData.summary.pipes}</div>
                  <div className="text-sm text-muted-foreground">Pipes</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">{networkData.summary.pumps}</div>
                  <div className="text-sm text-muted-foreground">Pumps</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">{networkData.summary.valves}</div>
                  <div className="text-sm text-muted-foreground">Valves</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Coordinate System Info */}
          {networkData.coordinate_system && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Coordinate System Information</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Type:</span>
                    <span className="font-mono">{networkData.coordinate_system.type}</span>
                  </div>
                  {networkData.coordinate_system.epsg && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">EPSG:</span>
                      <span className="font-mono">{networkData.coordinate_system.epsg}</span>
                    </div>
                  )}
                  {networkData.coordinate_system.units && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Units:</span>
                      <span className="font-mono">{networkData.coordinate_system.units}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );

  const renderAnalysisTab = () => (
    <div className="space-y-6">
      {/* Analysis Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Network Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Label>Analysis Type:</Label>
            <Select value={selectedAnalysisType} onValueChange={(value) => setSelectedAnalysisType(value as any)}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="topology">Topology Analysis</SelectItem>
                <SelectItem value="criticality">Criticality Analysis</SelectItem>
                <SelectItem value="resilience">Resilience Metrics</SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={() => handleRunAnalysis(selectedAnalysisType)}
              disabled={!networkData || isAnalyzing}
            >
              {isAnalyzing ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Target className="h-4 w-4 mr-2" />
                  Run Analysis
                </>
              )}
            </Button>
          </div>

          {isAnalyzing && (
            <div className="space-y-2">
              <Progress value={analysisProgress} />
              <p className="text-sm text-center text-muted-foreground">
                {selectedAnalysisType} analysis in progress... {analysisProgress}%
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Analysis Results */}
      {Object.keys(analysisResults).length > 0 && (
        <Tabs defaultValue="topology" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="topology">Topology</TabsTrigger>
            <TabsTrigger value="criticality">Criticality</TabsTrigger>
            <TabsTrigger value="resilience">Resilience</TabsTrigger>
          </TabsList>

          <TabsContent value="topology">
            {analysisResults.topology ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Topology Analysis Results</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div className="text-center p-3 bg-muted/20 rounded-lg">
                      <div className="text-lg font-bold">{analysisResults.topology.topology_metrics?.basic_metrics?.nodes || 0}</div>
                      <div className="text-sm text-muted-foreground">Total Nodes</div>
                    </div>
                    <div className="text-center p-3 bg-muted/20 rounded-lg">
                      <div className="text-lg font-bold">{analysisResults.topology.topology_metrics?.basic_metrics?.edges || 0}</div>
                      <div className="text-sm text-muted-foreground">Total Links</div>
                    </div>
                    <div className="text-center p-3 bg-muted/20 rounded-lg">
                      <div className="text-lg font-bold">{analysisResults.topology.topology_metrics?.basic_metrics?.density?.toFixed(4) || 'N/A'}</div>
                      <div className="text-sm text-muted-foreground">Density</div>
                    </div>
                    <div className="text-center p-3 bg-muted/20 rounded-lg">
                      <div className="text-lg font-bold">{analysisResults.topology.topology_metrics?.basic_metrics?.average_degree?.toFixed(2) || 'N/A'}</div>
                      <div className="text-sm text-muted-foreground">Avg Degree</div>
                    </div>
                  </div>

                  {/* Connectivity Information */}
                  <div className="mt-4 space-y-3">
                    <h4 className="text-sm font-medium mb-2">Connectivity Analysis</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div className="text-center p-3 bg-muted/10 rounded-lg">
                        <div className="text-sm font-medium">
                          {analysisResults.topology.topology_metrics?.connectivity?.is_connected ? 'Connected' : 'Disconnected'}
                        </div>
                        <div className="text-xs text-muted-foreground">Network Status</div>
                      </div>
                      <div className="text-center p-3 bg-muted/10 rounded-lg">
                        <div className="text-sm font-medium">
                          {analysisResults.topology.topology_metrics?.connectivity?.connected_components || 0}
                        </div>
                        <div className="text-xs text-muted-foreground">Components</div>
                      </div>
                      <div className="text-center p-3 bg-muted/10 rounded-lg">
                        <div className="text-sm font-medium">
                          {analysisResults.topology.topology_metrics?.connectivity?.average_clustering?.toFixed(3) || 'N/A'}
                        </div>
                        <div className="text-xs text-muted-foreground">Clustering</div>
                      </div>
                    </div>
                  </div>

                  {/* Centrality Information */}
                  {analysisResults.topology.topology_metrics?.centrality && (
                    <div className="mt-4">
                      <h4 className="text-sm font-medium mb-2">Most Critical Nodes</h4>
                      <div className="space-y-2">
                        {analysisResults.topology.topology_metrics.centrality.most_critical_betweenness && (
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-muted-foreground">Betweenness:</span>
                            <Badge variant="outline">{analysisResults.topology.topology_metrics.centrality.most_critical_betweenness}</Badge>
                          </div>
                        )}
                        {analysisResults.topology.topology_metrics.centrality.most_critical_closeness && (
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-muted-foreground">Closeness:</span>
                            <Badge variant="outline">{analysisResults.topology.topology_metrics.centrality.most_critical_closeness}</Badge>
                          </div>
                        )}
                        {analysisResults.topology.topology_metrics.centrality.most_critical_degree && (
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-muted-foreground">Degree:</span>
                            <Badge variant="outline">{analysisResults.topology.topology_metrics.centrality.most_critical_degree}</Badge>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="text-center py-8">
                  <p className="text-muted-foreground">Run topology analysis to see results</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="criticality">
            {analysisResults.criticality ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Criticality Analysis Results</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* Top Critical Nodes */}
                    {analysisResults.criticality.criticality_analysis?.top_critical_nodes && (
                      <div>
                        <h4 className="text-sm font-medium mb-2">Top Critical Nodes</h4>
                        <div className="space-y-2">
                          {analysisResults.criticality.criticality_analysis.top_critical_nodes
                            .slice(0, 5)
                            .map(([nodeId, nodeData]: [string, any]) => (
                              <div key={nodeId} className="flex justify-between items-center">
                                <span className="font-mono text-sm">{nodeId}</span>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-sm">{nodeData.overall_score.toFixed(3)}</span>
                                  <Badge variant={nodeData.classification === 'high' ? 'destructive' : nodeData.classification === 'medium' ? 'default' : 'secondary'} className="text-xs">
                                    {nodeData.classification}
                                  </Badge>
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}

                    {/* Top Critical Links */}
                    {analysisResults.criticality.criticality_analysis?.top_critical_links && (
                      <div>
                        <h4 className="text-sm font-medium mb-2">Top Critical Links</h4>
                        <div className="space-y-2">
                          {analysisResults.criticality.criticality_analysis.top_critical_links
                            .slice(0, 5)
                            .map(([linkId, linkData]: [string, any]) => (
                              <div key={linkId} className="flex justify-between items-center">
                                <span className="font-mono text-sm">{linkId}</span>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-sm">{linkData.overall_score.toFixed(3)}</span>
                                  <Badge variant={linkData.classification === 'high' ? 'destructive' : linkData.classification === 'medium' ? 'default' : 'secondary'} className="text-xs">
                                    {linkData.classification}
                                  </Badge>
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="text-center py-8">
                  <p className="text-muted-foreground">Run criticality analysis to see results</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="resilience">
            {analysisResults.resilience ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Resilience Metrics</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div className="text-center p-3 bg-muted/20 rounded-lg">
                      <div className="text-lg font-bold">
                        {analysisResults.resilience.resilience_metrics?.topographic?.score?.toFixed(3) || 'N/A'}
                      </div>
                      <div className="text-sm text-muted-foreground">Topographic</div>
                    </div>
                    <div className="text-center p-3 bg-muted/20 rounded-lg">
                      <div className="text-lg font-bold">
                        {analysisResults.resilience.resilience_metrics?.hydraulic?.score?.toFixed(3) || 'N/A'}
                      </div>
                      <div className="text-sm text-muted-foreground">Hydraulic</div>
                    </div>
                    <div className="text-center p-3 bg-muted/20 rounded-lg">
                      <div className="text-lg font-bold">
                        {analysisResults.resilience.resilience_metrics?.economic?.score?.toFixed(3) || 'N/A'}
                      </div>
                      <div className="text-sm text-muted-foreground">Economic</div>
                    </div>
                    <div className="text-center p-3 bg-muted/20 rounded-lg">
                      <div className="text-lg font-bold">
                        {analysisResults.resilience.resilience_metrics?.overall?.score?.toFixed(3) || 'N/A'}
                      </div>
                      <div className="text-sm text-muted-foreground">Overall Score</div>
                    </div>
                  </div>

                  {/* Overall Classification */}
                  {analysisResults.resilience.resilience_metrics?.overall && (
                    <div className="text-center p-4 bg-muted/10 rounded-lg">
                      <div className="text-lg font-bold mb-2">Network Resilience Classification</div>
                      <Badge 
                        variant={
                          analysisResults.resilience.resilience_metrics.overall.classification === 'excellent' ? 'default' :
                          analysisResults.resilience.resilience_metrics.overall.classification === 'good' ? 'secondary' :
                          analysisResults.resilience.resilience_metrics.overall.classification === 'fair' ? 'outline' :
                          'destructive'
                        }
                        className="text-base px-4 py-2"
                      >
                        {analysisResults.resilience.resilience_metrics.overall.classification.toUpperCase()}
                      </Badge>
                    </div>
                  )}

                  {/* Detailed Metrics */}
                  {analysisResults.resilience.resilience_metrics?.topographic && (
                    <div className="mt-4">
                      <h4 className="text-sm font-medium mb-2">Topographic Details</h4>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Algebraic Connectivity:</span>
                          <span className="font-mono">{analysisResults.resilience.resilience_metrics.topographic.algebraic_connectivity.toFixed(4)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Average Degree:</span>
                          <span className="font-mono">{analysisResults.resilience.resilience_metrics.topographic.average_degree.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Link Density:</span>
                          <span className="font-mono">{analysisResults.resilience.resilience_metrics.topographic.link_density.toFixed(4)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Meshedness:</span>
                          <span className="font-mono">{analysisResults.resilience.resilience_metrics.topographic.meshedness_coefficient.toFixed(4)}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Economic Details */}
                  {analysisResults.resilience.resilience_metrics?.economic && (
                    <div className="mt-4">
                      <h4 className="text-sm font-medium mb-2">Economic Assessment</h4>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Replacement Cost:</span>
                          <span className="font-mono">${(analysisResults.resilience.resilience_metrics.economic.estimated_replacement_cost / 1000).toFixed(0)}k</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Economic Efficiency:</span>
                          <span className="font-mono">{analysisResults.resilience.resilience_metrics.economic.economic_efficiency.toFixed(3)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="text-center py-8">
                  <p className="text-muted-foreground">Run resilience analysis to see results</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );

  const renderSimulationTab = () => (
    <div className="space-y-6">
      {/* Simulation Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Play className="h-5 w-5" />
            Hydraulic Simulation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Label>Simulation Type:</Label>
            <Select value={selectedSimulationType} onValueChange={(value) => setSelectedSimulationType(value as any)}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hydraulic">Hydraulic Analysis</SelectItem>
                <SelectItem value="water_quality">Water Quality</SelectItem>
                <SelectItem value="scenario">Scenario Analysis</SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={() => handleRunSimulation(selectedSimulationType)}
              disabled={!networkData || isSimulating}
            >
              {isSimulating ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Simulating...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Run Simulation
                </>
              )}
            </Button>
          </div>

          {isSimulating && (
            <div className="space-y-2">
              <Progress value={simulationProgress} />
              <p className="text-sm text-center text-muted-foreground">
                {selectedSimulationType} simulation in progress... {simulationProgress}%
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Simulation Results */}
      {simulationResults && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Simulation Results</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="text-center p-3 bg-muted/20 rounded-lg">
                <div className="text-lg font-bold text-green-600">{simulationResults.status}</div>
                <div className="text-sm text-muted-foreground">Status</div>
              </div>
              <div className="text-center p-3 bg-muted/20 rounded-lg">
                <div className="text-lg font-bold">{simulationResults.execution_time?.toFixed(2)}s</div>
                <div className="text-sm text-muted-foreground">Duration</div>
              </div>
              <div className="text-center p-3 bg-muted/20 rounded-lg">
                <div className="text-lg font-bold">{simulationResults.timestamps?.length || 0}</div>
                <div className="text-sm text-muted-foreground">Time Steps</div>
              </div>
              <div className="text-center p-3 bg-muted/20 rounded-lg">
                <div className="text-lg font-bold">
                  {Object.keys(simulationResults.node_results || {}).length}
                </div>
                <div className="text-sm text-muted-foreground">Nodes</div>
              </div>
            </div>

            {simulationResults.summary && (
              <div className="mt-4">
                <h4 className="text-sm font-medium mb-2">Summary</h4>
                <div className="space-y-2">
                  {Object.entries(simulationResults.summary).map(([key, value]) => (
                    <div key={key} className="flex justify-between">
                      <span className="text-sm text-muted-foreground">{key}:</span>
                      <span className="text-sm font-mono">{String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );

  const renderVisualizationTab = () => (
    <div className="space-y-6">
      {/* Visualization Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Visualization Options
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Button
              variant={viewSettings.activeVisualization === 'map' ? 'default' : 'outline'}
              onClick={() => setViewSettings(prev => ({ ...prev, activeVisualization: 'map' }))}
              className="h-20 flex flex-col gap-2"
            >
              <Map className="h-6 w-6" />
              <span className="text-sm">Map View</span>
            </Button>
            
            <Button
              variant={viewSettings.activeVisualization === 'advanced' ? 'default' : 'outline'}
              onClick={() => setViewSettings(prev => ({ ...prev, activeVisualization: 'advanced' }))}
              className="h-20 flex flex-col gap-2"
            >
              <Gauge className="h-6 w-6" />
              <span className="text-sm">Advanced</span>
            </Button>
            
            <Button
              variant={viewSettings.activeVisualization === 'network' ? 'default' : 'outline'}
              onClick={() => setViewSettings(prev => ({ ...prev, activeVisualization: 'network' }))}
              className="h-20 flex flex-col gap-2"
            >
              <Network className="h-6 w-6" />
              <span className="text-sm">Network Graph</span>
            </Button>
            
            <Button
              variant={viewSettings.activeVisualization === 'results' ? 'default' : 'outline'}
              onClick={() => setViewSettings(prev => ({ ...prev, activeVisualization: 'results' }))}
              className="h-20 flex flex-col gap-2"
            >
              <BarChart3 className="h-6 w-6" />
              <span className="text-sm">Results</span>
            </Button>
            
            <Button
              variant={viewSettings.activeVisualization === 'analysis' ? 'default' : 'outline'}
              onClick={() => setViewSettings(prev => ({ ...prev, activeVisualization: 'analysis' }))}
              className="h-20 flex flex-col gap-2"
            >
              <TrendingUp className="h-6 w-6" />
              <span className="text-sm">Analysis</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Visualization Content */}
      <div className="h-[600px] w-full">
        {viewSettings.activeVisualization === 'map' && (
          <div className="h-full w-full rounded-lg border border-border overflow-hidden">
            <WNTRMapViewer />
          </div>
        )}
        
        {viewSettings.activeVisualization === 'advanced' && (
          <div className="h-full w-full overflow-hidden">
            <WNTRAdvancedMapViewer 
              networkData={networkData}
              simulationResults={simulationResults}
              onDataLoaded={setNetworkData}
              onSimulationCompleted={setSimulationResults}
            />
          </div>
        )}
        
        {viewSettings.activeVisualization === 'network' && (
          <div className="h-full w-full rounded-lg border border-border overflow-hidden">
            <WNTRNetworkVisualization 
              networkData={networkData}
              simulationResults={simulationResults}
              analysisResults={analysisResults}
            />
          </div>
        )}
        
        {viewSettings.activeVisualization === 'results' && (
          <Card className="h-full">
            <CardContent className="text-center py-12">
              <div className="space-y-4">
                <BarChart3 className="h-16 w-16 text-muted-foreground mx-auto" />
                <h3 className="text-lg font-semibold">Simulation Results</h3>
                <p className="text-muted-foreground">
                  Time-series visualization of hydraulic parameters
                </p>
                {simulationResults && (
                  <div className="mt-6 text-left space-y-2">
                    <div className="text-sm">
                      <strong>Status:</strong> {simulationResults.status}
                    </div>
                    {simulationResults.node_results && (
                      <div className="text-sm">
                        <strong>Nodes analyzed:</strong> {Object.keys(simulationResults.node_results).length}
                      </div>
                    )}
                    {simulationResults.link_results && (
                      <div className="text-sm">
                        <strong>Links analyzed:</strong> {Object.keys(simulationResults.link_results).length}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
        
        {viewSettings.activeVisualization === 'analysis' && (
          <Card className="h-full">
            <CardContent className="text-center py-12">
              <div className="space-y-4">
                <TrendingUp className="h-16 w-16 text-muted-foreground mx-auto" />
                <h3 className="text-lg font-semibold">Analysis Visualization</h3>
                <p className="text-muted-foreground">
                  Network analysis results and critical component identification
                </p>
                {analysisResults && (
                  <div className="mt-6 text-left space-y-2">
                    {analysisResults.topology && (
                      <div className="text-sm">
                        <strong>Topology:</strong> Analysis completed
                      </div>
                    )}
                    {analysisResults.criticality && (
                      <div className="text-sm">
                        <strong>Criticality:</strong> Component analysis available
                      </div>
                    )}
                    {analysisResults.resilience && (
                      <div className="text-sm">
                        <strong>Resilience:</strong> Metrics calculated
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="border-b border-border p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">WNTR Analysis Suite</h1>
            <p className="text-muted-foreground mt-1">
              Comprehensive water network analysis and simulation platform
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            {networkData && (
              <Button onClick={handleGenerateReport} variant="outline">
                <FileText className="h-4 w-4 mr-2" />
                Generate Report
              </Button>
            )}
            <Button onClick={handleLoadNetwork} disabled={isLoading}>
              <FileUp className="h-4 w-4 mr-2" />
              Load Network
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <div className="border-b border-border px-6">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="network">Network</TabsTrigger>
              <TabsTrigger value="analysis">Analysis</TabsTrigger>
              <TabsTrigger value="simulation">Simulation</TabsTrigger>
              <TabsTrigger value="visualization">Visualization</TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-auto">
            <div className="p-6">
              <TabsContent value="overview" className="mt-0">
                {renderOverviewTab()}
              </TabsContent>
              
              <TabsContent value="network" className="mt-0">
                {renderNetworkTab()}
              </TabsContent>
              
              <TabsContent value="analysis" className="mt-0">
                {renderAnalysisTab()}
              </TabsContent>
              
              <TabsContent value="simulation" className="mt-0">
                {renderSimulationTab()}
              </TabsContent>
              
              <TabsContent value="visualization" className="mt-0">
                {renderVisualizationTab()}
              </TabsContent>
            </div>
          </div>
        </Tabs>
      </div>

      {/* Error Display */}
      {error && (
        <Alert className="m-6 border-destructive/50 text-destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>{error}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setError(null)}
              className="h-auto p-0 text-destructive hover:text-destructive/80"
            >
              Dismiss
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};