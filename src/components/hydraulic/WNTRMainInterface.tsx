import React, { useState, useCallback, useEffect } from 'react';
import { useClarity } from '@/components/ClarityProvider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { WNTRAdvancedMapViewer } from './WNTRAdvancedMapViewer';
import { ProjectDashboard } from './ProjectDashboard';
import { Project, NetworkAsset, CalculationAsset } from '../../types/project';
import {
  FileUp, Play, BarChart3, Map, Network,
  Eye, RefreshCw, AlertCircle,
  Activity, Gauge, TrendingUp, Database, FileText,
  Zap, Target, FolderOpen, ChevronDown
} from 'lucide-react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

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
  success: boolean;
  error?: string;
  data: {
    status: string;
    execution_time: number;
    summary: Record<string, any>;
    node_results: any;
    link_results: any;
    timestamps: number[];
    stats?: any;
    error?: string;
  }
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

  // PROJECT MANAGEMENT STATE
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);

  // Load projects from localStorage on mount
  useEffect(() => {
    const savedProjects = localStorage.getItem('wntr_projects');
    if (savedProjects) {
      try {
        const parsed = JSON.parse(savedProjects);
        setProjects(parsed);
      } catch (e) {
        console.error('Failed to load projects:', e);
      }
    }
  }, []);

  // Save projects to localStorage whenever they change
  useEffect(() => {
    if (projects.length > 0) {
      localStorage.setItem('wntr_projects', JSON.stringify(projects));
    }
  }, [projects]);

  // Project Management Functions
  const handleCreateProject = useCallback((name: string, description: string) => {
    const newProject: Project = {
      id: `proj_${Date.now()}`,
      name,
      description,
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      networks: [],
      calculations: [],
      chats: []
    };
    setProjects(prev => [...prev, newProject]);
    setCurrentProject(newProject);
  }, []);

  const handleSelectProject = useCallback((project: Project) => {
    setCurrentProject(project);
  }, []);

  const handleDeleteProject = useCallback((projectId: string) => {
    setProjects(prev => prev.filter(p => p.id !== projectId));
    if (currentProject?.id === projectId) {
      setCurrentProject(null);
    }
  }, [currentProject]);

  const handleSaveNetworkToProject = useCallback((data: NetworkData) => {
    if (!currentProject) return;

    const networkAsset: NetworkAsset = {
      id: `net_${Date.now()}`,
      name: data.name,
      uploadDate: new Date().toISOString(),
      nodeCount: data.summary?.junctions || 0,
      linkCount: data.summary?.pipes || 0,
      data: data
    };

    setProjects(prev => prev.map(p =>
      p.id === currentProject.id
        ? { ...p, networks: [...p.networks, networkAsset], lastModified: new Date().toISOString() }
        : p
    ));

    setCurrentProject(prev => prev ? {
      ...prev,
      networks: [...prev.networks, networkAsset],
      lastModified: new Date().toISOString()
    } : null);
  }, [currentProject]);

  const handleSaveCalculationToProject = useCallback((name: string, networkId: string, results: any) => {
    if (!currentProject) return;

    const calculation: CalculationAsset = {
      id: `calc_${Date.now()}`,
      name,
      date: new Date().toISOString(),
      status: 'completed',
      networkId,
      results
    };

    setProjects(prev => prev.map(p =>
      p.id === currentProject.id
        ? { ...p, calculations: [...p.calculations, calculation], lastModified: new Date().toISOString() }
        : p
    ));

    setCurrentProject(prev => prev ? {
      ...prev,
      calculations: [...prev.calculations, calculation],
      lastModified: new Date().toISOString()
    } : null);
  }, [currentProject]);

  // Core state
  const [networkData, setNetworkData] = useState<NetworkData | null>(null);
  const [analysisResults, setAnalysisResults] = useState<AnalysisResults>({});
  // Core state - Updated to hold multiple simulation results
  interface ProjectSimulationResults {
    hydraulic: SimulationResults | null;
    quality: SimulationResults | null;
    scenario: SimulationResults | null;
  }

  const [simulationResults, setSimulationResults] = useState<ProjectSimulationResults>({
    hydraulic: null,
    quality: null,
    scenario: null
  });

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
  const [highlightedComponents, setHighlightedComponents] = useState<string[]>([]);
  const [simulationDuration, setSimulationDuration] = useState<number>(24);
  const [simulationTimestep, setSimulationTimestep] = useState<number>(60); // minutes
  const [isLeftSidebarCollapsed, setIsLeftSidebarCollapsed] = useState(false);

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

        // Save to current project
        handleSaveNetworkToProject(result.data);

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
  }, [clarityReady, trackEvent, handleSaveNetworkToProject]);

  // Run ALL analyses sequentially
  const handleRunAllAnalyses = useCallback(async () => {
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

      // 1. Topology
      setAnalysisProgress(10);
      const topologyRes = await window.electronAPI.wntr.analyzeNetworkTopology({
        network_file: networkData.name,
        include_centrality: true, include_connectivity: true
      });
      setAnalysisResults(prev => ({ ...prev, topology: topologyRes }));
      setAnalysisProgress(40);

      // 2. Criticality
      const criticalityRes = await window.electronAPI.wntr.analyzeComponentCriticality({
        network_file: networkData.name,
        analysis_type: 'comprehensive', include_pipes: true, include_pumps: true, include_nodes: true
      });
      setAnalysisResults(prev => ({ ...prev, criticality: criticalityRes }));
      setAnalysisProgress(70);

      // 3. Resilience
      const resilienceRes = await window.electronAPI.wntr.calculateResilienceMetrics({
        network_file: networkData.name,
        include_topological: true, include_hydraulic: true, include_economic: true, include_serviceability: true
      });
      setAnalysisResults(prev => ({ ...prev, resilience: resilienceRes }));
      setAnalysisProgress(100);

      if (onAnalysisComplete) {
        onAnalysisComplete({ topology: topologyRes, criticality: criticalityRes, resilience: resilienceRes });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Analysis failed';
      setError(errorMessage);
    } finally {
      setIsAnalyzing(false);
      // setAnalysisProgress(0); // Leave at 100 for visual confirmation
    }
  }, [networkData, onAnalysisComplete]);



  // Run ALL simulations sequentially
  const handleRunAllSimulations = useCallback(async () => {
    if (!networkData) return;

    try {
      setIsSimulating(true);
      setSimulationProgress(0);
      setError(null);

      // Reset current results
      setSimulationResults({ hydraulic: null, quality: null, scenario: null });

      // First ensure the INP file is loaded in the backend
      console.log('Loading INP file before simulation:', networkData.name);
      const loadResult = await window.electronAPI.wntr.loadINPFromPath(`data/${networkData.name}`);

      if (!loadResult.success) {
        // Attempt to load without path prefix if data/ fails (fallback)
        console.warn('Failed to load from data/, trying direct name:', loadResult.error);
        // This is a safety check/fallback if needed, but for now we'll stick to the pattern
        if (loadResult.error?.includes('No such file')) {
          throw new Error(`INP file not found in data/ directory: ${networkData.name}`);
        }
      }

      // 1. Hydraulic
      setSimulationProgress(10);
      const hydraulicRes = await window.electronAPI.wntr.runHydraulicSimulation({
        network_file: networkData.name,
        duration: simulationDuration,      // Python script expects Hours
        timestep: simulationTimestep / 60, // Python script expects Hours (from minutes)
        demand_multiplier: 1.0,
        pattern_start: '00:00:00'
      });
      setSimulationResults(prev => ({ ...prev, hydraulic: hydraulicRes }));
      setSimulationProgress(40);

      // 2. Water Quality
      const qualityRes = await window.electronAPI.wntr.runWaterQualitySimulation({
        network_file: networkData.name,
        parameter: 'age', duration: 24, timestep: 1
      });
      setSimulationResults(prev => ({ ...prev, quality: qualityRes }));
      setSimulationProgress(70);

      // 3. Scenario (Pipe Closure - standard test)
      const scenarioRes = await window.electronAPI.wntr.runScenarioSimulation({
        network_file: networkData.name,
        scenario_type: 'pipe_closure', start_time: 0, duration: 24, components: []
      });
      setSimulationResults(prev => ({ ...prev, scenario: scenarioRes }));
      setSimulationProgress(100);

      // Save simulations to project
      if (currentProject && networkData) {
        const currentNetwork = currentProject.networks.find(n => n.name === networkData.name);
        const networkId = currentNetwork?.id || 'unknown';

        // Save each simulation type
        if (hydraulicRes.success) {
          handleSaveCalculationToProject('Simulación Hidráulica', networkId, hydraulicRes.data);
        }
        if (qualityRes.success) {
          handleSaveCalculationToProject('Calidad del Agua', networkId, qualityRes.data);
        }
        if (scenarioRes.success) {
          handleSaveCalculationToProject('Simulación de Escenario', networkId, scenarioRes.data);
        }
      }

      // Notify completion (using hydraulic as primary for legacy handlers if any)
      if (onSimulationComplete) {
        onSimulationComplete(hydraulicRes);
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Simulation suite failed');
    } finally {
      setIsSimulating(false);
      // setSimulationProgress(0); // Leave at 100 to show success
    }
  }, [networkData, onSimulationComplete, simulationDuration, simulationTimestep, currentProject, handleSaveCalculationToProject]);





  // Dashboard Layout Render
  const renderDashboard = () => {
    // 1. NO PROJECT SELECTED: Show Project Dashboard
    if (!currentProject) {
      return (
        <ProjectDashboard
          projects={projects}
          onSelectProject={handleSelectProject}
          onCreateProject={handleCreateProject}
          onDeleteProject={handleDeleteProject}
        />
      );
    }

    // 2. PROJECT SELECTED BUT NO NETWORK: Show Welcome with project context
    if (!networkData) {
      return (
        <>
          {/* Project Header Bar */}
          <div className="bg-slate-800 border-b border-slate-700 px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCurrentProject(null)}
                className="text-slate-400 hover:text-white"
              >
                <ChevronDown className="h-4 w-4 mr-2 rotate-90" />
                Proyectos
              </Button>
              <div className="h-4 w-px bg-slate-700" />
              <div className="flex items-center gap-2">
                <FolderOpen className="h-4 w-4 text-blue-400" />
                <span className="font-semibold text-white">{currentProject.name}</span>
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-400">
              <div className="flex items-center gap-1">
                <Database className="h-3 w-3" />
                <span>{currentProject.networks.length} redes</span>
              </div>
              <div className="flex items-center gap-1">
                <Activity className="h-3 w-3" />
                <span>{currentProject.calculations.length} simulaciones</span>
              </div>
            </div>
          </div>

          {/* Welcome Screen */}
          <div className="flex flex-col items-center justify-center h-[calc(100%-60px)] p-6">
            <Card className="w-full max-w-md">
              <CardHeader className="text-center">
                <div className="mx-auto bg-primary/10 p-4 rounded-full w-fit mb-4">
                  <Network className="h-10 w-10 text-primary" />
                </div>
                <CardTitle>Proyecto: {currentProject.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {currentProject.description && (
                  <p className="text-center text-muted-foreground text-sm">
                    {currentProject.description}
                  </p>
                )}

                <div
                  className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${isLoading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-muted/50 cursor-pointer border-primary/50'
                    }`}
                  onClick={!isLoading ? handleLoadNetwork : undefined}
                >
                  <FileUp className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
                  <h3 className="font-semibold mb-1">Cargar Red Hidráulica</h3>
                  <p className="text-xs text-muted-foreground">Click para buscar archivos .inp</p>
                </div>

                {error && (
                  <Alert className="border-red-500/50 text-red-600 bg-red-50 dark:bg-red-900/10">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {currentProject.networks.length > 0 && (
                  <div className="pt-4 border-t">
                    <h4 className="text-sm font-medium mb-2">Redes Guardadas</h4>
                    <div className="space-y-2">
                      {currentProject.networks.map((net) => (
                        <Button
                          key={net.id}
                          variant="outline"
                          size="sm"
                          className="w-full justify-start text-xs"
                          onClick={() => setNetworkData(net.data)}
                        >
                          <Database className="h-3 w-3 mr-2" />
                          {net.name}
                          <span className="ml-auto text-muted-foreground">
                            {net.nodeCount} nudos
                          </span>
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      );
    }

    // 3. PROJECT + NETWORK LOADED: Show main interface

    return (
      <div className="flex h-[calc(100vh-65px)] overflow-hidden bg-background">
        {/* Left Sidebar - Controls & Results */}
        <div className={`flex-shrink-0 border-r bg-card flex flex-col h-full shadow-lg z-10 transition-all duration-300 ${isLeftSidebarCollapsed ? 'w-0 overflow-hidden' : 'w-[400px]'}`}>
          <div className="p-4 border-b flex items-center justify-between bg-muted/30">
            <div className="flex items-center gap-2 overflow-hidden">
              <Database className="h-4 w-4 flex-shrink-0 text-primary" />
              <span className="font-semibold truncate" title={networkData.name}>{networkData.name}</span>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setNetworkData(null)} title="Close Network">
              <FileUp className="h-4 w-4" />
            </Button>
          </div>

          <Tabs defaultValue="simulate" className="flex-1 flex flex-col min-h-0">
            <div className="px-4 pt-2 border-b bg-muted/10">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="simulate" title="Simulation">
                  <Play className="h-4 w-4" />
                </TabsTrigger>
                <TabsTrigger value="analyze" title="Analysis">
                  <Target className="h-4 w-4" />
                </TabsTrigger>

                <TabsTrigger value="layers" title="Layers">
                  <Map className="h-4 w-4" />
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
              {/* SIMULATION TAB */}
              <TabsContent value="simulate" className="mt-0 space-y-4">
                <div className="space-y-4">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    <Activity className="h-4 w-4 text-blue-500" />
                    Hydraulic Simulation
                  </h3>

                  <div className="p-3 bg-muted/20 rounded-lg text-sm space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Run comprehensive analysis including Hydraulic, Water Quality, and Scenario simulations sequentially.
                    </p>

                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <div className="bg-background p-2 rounded border">
                        <div className="text-[10px] text-muted-foreground mb-1">Duration (hours)</div>
                        <input
                          type="number"
                          value={simulationDuration}
                          onChange={(e) => setSimulationDuration(Number(e.target.value))}
                          className="w-full bg-transparent font-mono text-sm border-b border-border focus:outline-none focus:border-primary"
                        />
                      </div>
                      <div className="bg-background p-2 rounded border">
                        <div className="text-[10px] text-muted-foreground mb-1">Timestep (mins)</div>
                        <input
                          type="number"
                          value={simulationTimestep}
                          onChange={(e) => setSimulationTimestep(Number(e.target.value))}
                          className="w-full bg-transparent font-mono text-sm border-b border-border focus:outline-none focus:border-primary"
                        />
                      </div>
                    </div>
                  </div>

                  <Button
                    className="w-full"
                    onClick={handleRunAllSimulations}
                    disabled={isSimulating}
                  >
                    {isSimulating ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Running Simulations...
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-2" />
                        Run All Simulations
                      </>
                    )}
                  </Button>

                  {isSimulating && <Progress value={simulationProgress} className="h-2" />}

                  {isSimulating && <Progress value={simulationProgress} className="h-2" />}

                  {/* Simulation Results (Hydraulic, Quality, Scenario) */}
                  <div className="space-y-4 pt-4 border-t">
                    {/* Hydraulic Simulation */}
                    {simulationResults?.hydraulic?.data ? (
                      <Card>
                        <CardHeader className="p-3 pb-0">
                          <CardTitle className="text-xs font-bold uppercase text-muted-foreground">Hydraulic</CardTitle>
                        </CardHeader>
                        <CardContent className="p-3 text-sm space-y-2">
                          <div className="flex justify-between">
                            <span>Status:</span>
                            <span className="font-medium text-green-600">Completed</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Duration:</span>
                            <span className="font-mono">{simulationResults.hydraulic.data.execution_time?.toFixed(2)}s</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Nodes/Links:</span>
                            <span className="font-mono">{Object.keys(simulationResults.hydraulic.data.node_results || {}).length}/{Object.keys(simulationResults.hydraulic.data.link_results || {}).length}</span>
                          </div>
                          {/* Detailed Stats */}
                          {simulationResults.hydraulic.data.stats && (
                            <div className="pt-2 border-t space-y-2">
                              <div className="text-[10px] text-muted-foreground font-semibold">PRESSURE (m)</div>
                              <div className="grid grid-cols-3 gap-1 text-xs">
                                <div>
                                  <div className="text-[9px] text-muted-foreground">Min</div>
                                  <div className="font-mono">{simulationResults.hydraulic.data.stats.pressure?.min?.toFixed(2)}</div>
                                </div>
                                <div>
                                  <div className="text-[9px] text-muted-foreground">Avg</div>
                                  <div className="font-mono">{simulationResults.hydraulic.data.stats.pressure?.mean?.toFixed(2)}</div>
                                </div>
                                <div>
                                  <div className="text-[9px] text-muted-foreground">Max</div>
                                  <div className="font-mono">{simulationResults.hydraulic.data.stats.pressure?.max?.toFixed(2)}</div>
                                </div>
                              </div>
                              <div className="text-[10px] text-muted-foreground font-semibold mt-2">FLOW (LPS) / VEL (m/s)</div>
                              <div className="grid grid-cols-2 gap-1 text-xs">
                                <div>
                                  <div className="text-[9px] text-muted-foreground">Max Flow</div>
                                  <div className="font-mono">{simulationResults.hydraulic.data.stats.flow?.max?.toFixed(2)}</div>
                                </div>
                                <div>
                                  <div className="text-[9px] text-muted-foreground">Max Vel</div>
                                  <div className="font-mono">{simulationResults.hydraulic.data.stats.velocity?.max?.toFixed(2)}</div>
                                </div>
                              </div>
                              <div className="flex justify-between text-xs mt-1">
                                <div className="text-[10px] text-muted-foreground">Total Length</div>
                                <div className="font-mono">{simulationResults.hydraulic.data.stats.flow?.total_demand?.toFixed(2)} km</div>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ) : (
                      simulationResults?.hydraulic?.success === false ? (
                        <Alert variant="destructive" className="mt-2 text-xs">
                          <AlertCircle className="h-3 w-3 inline mr-1" />
                          <span className="font-semibold">Error:</span> {simulationResults.hydraulic.error || "Unknown error"}
                        </Alert>
                      ) : (
                        !isSimulating && (
                          <div className="text-xs text-muted-foreground text-center p-4 border border-dashed rounded bg-muted/20">
                            Results will appear here.
                          </div>
                        )
                      )
                    )}

                    {/* Water Quality Results */}
                    {simulationResults?.quality?.data && (
                      <Card>
                        <CardHeader className="p-3 pb-0">
                          <CardTitle className="text-xs font-bold uppercase text-muted-foreground">Water Quality</CardTitle>
                        </CardHeader>
                        <CardContent className="p-3 text-sm space-y-2">
                          <div className="flex justify-between">
                            <span>Status:</span>
                            <span className="font-medium text-green-600">Completed</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Duration:</span>
                            <span className="font-mono">{simulationResults.quality.data.execution_time?.toFixed(2)}s</span>
                          </div>
                          {/* WQ Stats */}
                          {simulationResults.quality.data.stats?.quality && (
                            <div className="pt-2 border-t space-y-2">
                              <div className="text-[10px] text-muted-foreground font-semibold">PARAMETER: {simulationResults.quality.data.stats.quality.parameter}</div>
                              <div className="grid grid-cols-3 gap-1 text-xs">
                                <div>
                                  <div className="text-[9px] text-muted-foreground">Min</div>
                                  <div className="font-mono">{simulationResults.quality.data.stats.quality.min?.toFixed(2)}</div>
                                </div>
                                <div>
                                  <div className="text-[9px] text-muted-foreground">Avg</div>
                                  <div className="font-mono">{simulationResults.quality.data.stats.quality.mean?.toFixed(2)}</div>
                                </div>
                                <div>
                                  <div className="text-[9px] text-muted-foreground">Max</div>
                                  <div className="font-mono">{simulationResults.quality.data.stats.quality.max?.toFixed(2)}</div>
                                </div>
                              </div>
                            </div>
                          )}
                          <div className="text-xs text-muted-foreground font-mono mt-1 opacity-75">
                            {simulationResults.quality.data.summary?.note}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Scenario Results */}
                    {simulationResults?.scenario?.data && (
                      <Card>
                        <CardHeader className="p-3 pb-0">
                          <CardTitle className="text-xs font-bold uppercase text-muted-foreground">Scenario</CardTitle>
                        </CardHeader>
                        <CardContent className="p-3 text-sm space-y-2">
                          <div className="flex justify-between">
                            <span>Status:</span>
                            <span className="font-medium text-green-600">Completed</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Duration:</span>
                            <span className="font-mono">{simulationResults.scenario.data.execution_time?.toFixed(2)}s</span>
                          </div>
                          {/* Scenario Stats */}
                          {simulationResults.scenario.data.stats && (
                            <div className="pt-2 border-t space-y-2">
                              <div className="text-[10px] text-muted-foreground font-semibold">PRESSURE (m)</div>
                              <div className="grid grid-cols-3 gap-1 text-xs">
                                <div>
                                  <div className="text-[9px] text-muted-foreground">Min</div>
                                  <div className="font-mono">{simulationResults.scenario.data.stats.pressure?.min?.toFixed(2)}</div>
                                </div>
                                <div>
                                  <div className="text-[9px] text-muted-foreground">Mean</div>
                                  <div className="font-mono">{simulationResults.scenario.data.stats.pressure?.mean?.toFixed(2)}</div>
                                </div>
                                <div>
                                  <div className="text-[9px] text-muted-foreground">Max</div>
                                  <div className="font-mono">{simulationResults.scenario.data.stats.pressure?.max?.toFixed(2)}</div>
                                </div>
                              </div>
                              <div className="text-[10px] text-muted-foreground font-semibold mt-2">LINK STATS</div>
                              <div className="grid grid-cols-2 gap-1 text-xs">
                                <div>
                                  <div className="text-[9px] text-muted-foreground">Max Flow</div>
                                  <div className="font-mono">{simulationResults.scenario.data.stats.flow?.max?.toFixed(2)}</div>
                                </div>
                                <div>
                                  <div className="text-[9px] text-muted-foreground">Max Vel</div>
                                  <div className="font-mono">{simulationResults.scenario.data.stats.velocity?.max?.toFixed(2)}</div>
                                </div>
                              </div>
                            </div>
                          )}
                          <div className="text-xs text-muted-foreground">
                            {simulationResults.scenario.data.summary?.note}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </div>


              </TabsContent>

              {/* ANALYSIS TAB */}
              <TabsContent value="analyze" className="mt-0 space-y-4">
                <div className="space-y-4">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    <Target className="h-4 w-4 text-purple-500" />
                    Network Analysis
                  </h3>

                  <Button
                    className="w-full"
                    onClick={handleRunAllAnalyses}
                    disabled={isAnalyzing}
                  >
                    {isAnalyzing ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Target className="h-4 w-4 mr-2" />
                        Run All Analyses
                      </>
                    )}
                  </Button>
                  {isAnalyzing && <Progress value={analysisProgress} className="h-2" />}

                  {/* Analysis Results */}
                  <div className="space-y-4 pt-4 border-t">
                    {analysisResults.topology?.data && (
                      <Card>
                        <CardHeader className="p-3 pb-0">
                          <CardTitle className="text-xs font-bold uppercase text-muted-foreground">Topology</CardTitle>
                        </CardHeader>
                        <CardContent className="p-3 text-sm space-y-1">
                          <div className="flex justify-between"><span>Density:</span> <span className="font-mono">{analysisResults.topology.data.topology_metrics.basic_metrics?.density?.toFixed(4)}</span></div>
                          <div className="flex justify-between"><span>Avg Degree:</span> <span className="font-mono">{analysisResults.topology.data.topology_metrics.basic_metrics?.average_degree?.toFixed(2)}</span></div>
                          <div className="flex justify-between"><span>Diameter:</span> <span className="font-mono">{analysisResults.topology.data.topology_metrics.basic_metrics?.diameter}</span></div>
                        </CardContent>
                      </Card>
                    )}

                    {analysisResults.criticality?.data && (
                      <Card>
                        <CardHeader className="p-3 pb-0">
                          <CardTitle className="text-xs font-bold uppercase text-muted-foreground">Criticality</CardTitle>
                        </CardHeader>
                        <CardContent className="p-3 text-sm space-y-1">
                          <div className="text-xs text-muted-foreground mb-1">Top Critical Nodes:</div>
                          <div className="flex flex-wrap gap-1">
                            {analysisResults.criticality.data.criticality_analysis?.top_critical_nodes?.slice(0, 3).map((n: any) => (
                              <Badge
                                key={n[0]}
                                variant={highlightedComponents.includes(n[0]) ? "default" : "outline"}
                                className="text-[10px] h-5 cursor-pointer hover:bg-primary/20"
                                onClick={() => setHighlightedComponents(prev => prev.includes(n[0]) ? prev.filter(x => x !== n[0]) : [...prev, n[0]])}
                              >
                                {n[0]}
                              </Badge>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {analysisResults.resilience?.data && (
                      <Card>
                        <CardHeader className="p-3 pb-0">
                          <CardTitle className="text-xs font-bold uppercase text-muted-foreground">Resilience</CardTitle>
                        </CardHeader>
                        <CardContent className="p-3 text-sm space-y-1">
                          {/* Accessing proper nested data based on known structure */}
                          <div className="flex justify-between">
                            <span>Hydraulic:</span>
                            <span className="font-mono">{analysisResults.resilience.data.resilience_metrics?.hydraulic?.todini_index?.toFixed(4) || 'N/A'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Service:</span>
                            <span className="font-mono">{analysisResults.resilience.data.resilience_metrics?.serviceability?.pressure_serviceability?.toFixed(4) || 'N/A'}</span>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </div>
              </TabsContent>

              {/* RESULTS TAB - Aggregating Analysis/Sim Results */}


              {/* LAYERS / VIEW SETTINGS TAB */}
              <TabsContent value="layers" className="mt-0 space-y-4">
                <h3 className="font-semibold text-sm">Map Layers & Visualization</h3>
                <p className="text-xs text-muted-foreground">
                  Detailed layer control is available directly on the Advanced Map Viewer.
                </p>
                {/* We could duplicate controls here or just rely on the map's own UI */}
                <Button variant="outline" size="sm" className="w-full" onClick={handleLoadNetwork}>
                  <RefreshCw className="h-3 w-3 mr-2" /> Reset View
                </Button>
              </TabsContent>

            </div>
          </Tabs>
        </div >

        {/* Main Content - The Map */}
        < div className="flex-1 h-full relative font-sans" >
          {/* Sidebar Toggle Button */}
          < button
            onClick={() => setIsLeftSidebarCollapsed(!isLeftSidebarCollapsed)}
            className="absolute left-0 top-4 z-20 bg-card text-foreground p-1 rounded-r-md border-r border-y border-border hover:bg-muted shadow-md flex items-center justify-center w-6 h-8"
            title={isLeftSidebarCollapsed ? "Show Sidebar" : "Hide Sidebar"}
          >
            {isLeftSidebarCollapsed ? ">>" : "<<"}
          </button >
          <WNTRAdvancedMapViewer
            networkData={networkData}
            simulationResults={simulationResults?.hydraulic?.data}
            onDataLoaded={setNetworkData}
            onSimulationCompleted={(res: any) => setSimulationResults(prev => ({ ...prev, hydraulic: { success: true, data: res } }))}
          />
        </div >
      </div >
    );
  };

  return (
    <div className="w-full h-full bg-background text-foreground overflow-hidden">
      {renderDashboard()}
    </div>
  );
};