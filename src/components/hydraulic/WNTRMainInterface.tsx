import { logger } from '@/utils/logger'
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useClarity } from '@/components/ClarityProvider';
import { useProjectStore } from '@/stores/projectStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { WNTRAdvancedMapViewer } from './WNTRAdvancedMapViewer';
import { ProjectDashboard } from './ProjectDashboard';
import { Project, NetworkAsset, CalculationAsset } from '../../types/project';
import { hydraulicService } from '@/services/hydraulic/hydraulicService';
import {
  FileUp, Play, Map, Network,
  RefreshCw, AlertCircle,
  Activity, Database,
  Target, FolderOpen, ChevronDown,
  Scissors, Zap, ShieldAlert, AlertTriangle, Download, Clock
} from 'lucide-react';
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
import { Line } from 'react-chartjs-2';

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


/** Las rutinas de resiliencia lanzan una simulación WNTR completa: en una red de
 *  ~90 nudos rondan el minuto, y sin avisar parece que la aplicación se colgó. */
const AvisoDuracion: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
    <Clock className="h-3 w-3 mt-px shrink-0" />
    <span>{children}</span>
  </p>
);

export const WNTRMainInterface: React.FC<WNTRMainInterfaceProps> = ({
  projectId: _projectId,
  onAnalysisComplete,
  onSimulationComplete
}) => {
  // Clarity tracking
  const { trackEvent, isReady: clarityReady } = useClarity();

  // PROJECT MANAGEMENT STATE
  //
  // The project catalog (id/name/description/chatCount) is backed by the real
  // HydraulicProject table via hydraulicService — the same catalog Chat's
  // "Select a project" reads — so a project created in "Mis Proyectos" shows
  // up in Chat and vice versa, and the CHATS counter reflects real
  // conversations instead of always reading 0 (issue #17).
  //
  // `networks`/`calculations` remain a lightweight session overlay persisted
  // to localStorage per project id — loading a .inp file or running a
  // simulation while a project is open doesn't yet write into the dedicated
  // HydraulicNetwork/HydraulicCalculation tables (that's a separate, larger
  // feature — see network-repo IPC channels), so this keeps existing
  // behavior working without regressing it.
  const [projects, setProjects] = useState<Project[]>([]);
  // El proyecto activo vive en useProjectStore (issue #31): así el chat, el
  // Wisdom Center y esta vista comparten contexto, y sobrevive a desmontar la
  // vista o a cerrar la aplicación. Aquí sólo se guarda el id; el view-model se
  // deriva más abajo del catálogo y del overlay.
  const activeProjectId = useProjectStore(s => s.currentProjectId);
  const selectProjectGlobal = useProjectStore(s => s.selectProject);
  const clearProjectGlobal = useProjectStore(s => s.clearProject);
  // Lazy-initialized from localStorage so there's no load/save race on mount
  // (a load-then-save effect pair would briefly overwrite storage with the
  // initial empty state before the async load's setState landed).
  // Las redes del proyecto activo salen de HydraulicNetwork. Antes vivian en la
  // clave wntr_project_assets de localStorage, invisibles para el resto de la
  // aplicacion y perdidas al cambiar de equipo (#31).
  const [activeNetworks, setActiveNetworks] = useState<NetworkAsset[]>([]);
  const storeCalculations = useProjectStore(s => s.currentProject?.calculations);

  const toViewModel = useCallback((p: any): Project => {
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      createdAt: p.createdAt ? new Date(p.createdAt).toISOString() : new Date().toISOString(),
      lastModified: p.updatedAt ? new Date(p.updatedAt).toISOString() : new Date().toISOString(),
      networks: [],
      calculations: [],
      networkCount: p.networkCount ?? 0,
      calculationCount: p.calculationCount ?? 0,
      chatCount: p.chatCount ?? 0
    };
  }, []);

  // Derivado, no duplicado: el catálogo aporta la identidad y el overlay las
  // redes y cálculos. Antes se mantenía una copia en estado local que había que
  // sincronizar a mano en cada cambio del overlay, y esa copia se perdía al
  // desmontar la vista.
  const currentProject = useMemo<Project | null>(() => {
    if (!activeProjectId) return null;
    const base = projects.find(p => p.id === activeProjectId);
    if (!base) return null;
    const calculations: CalculationAsset[] = (storeCalculations ?? []).map((c: any) => ({
      id: c.id,
      name: c.name,
      date: c.createdAt ? new Date(c.createdAt).toISOString() : new Date().toISOString(),
      status: 'completed',
      networkId: '',
      results: c.results
    }));
    return { ...base, networks: activeNetworks, calculations };
  }, [activeProjectId, projects, activeNetworks, storeCalculations]);

  const refreshCurrentProject = useCallback(() => {
    if (activeProjectId) selectProjectGlobal(activeProjectId);
  }, [activeProjectId, selectProjectGlobal]);

  const refreshActiveNetworks = useCallback(async () => {
    if (!activeProjectId) { setActiveNetworks([]); return; }
    try {
      const res = await window.electronAPI.networkRepository.getProjectNetworks(activeProjectId);
      if (!res?.success) { logger.error('No se pudieron leer las redes del proyecto:', res?.error); return; }
      setActiveNetworks((res.data ?? []).map((n: any): NetworkAsset => ({
        id: n.id,
        name: n.name,
        uploadDate: n.createdAt ? new Date(n.createdAt).toISOString() : new Date().toISOString(),
        nodeCount: (n.summary?.junctions ?? 0) + (n.summary?.tanks ?? 0) + (n.summary?.reservoirs ?? 0),
        linkCount: n.summary?.pipes ?? 0,
        // Sin `data`: se pide al abrirla, para no traer todas las redes a memoria.
        incomplete: n.hasFileContent === false
      })));
    } catch (e) {
      logger.error('Error leyendo las redes del proyecto:', e);
    }
  }, [activeProjectId]);

  useEffect(() => { refreshActiveNetworks(); }, [refreshActiveNetworks]);

  const refreshProjects = useCallback(async () => {
    try {
      const list = await hydraulicService.listProjects();
      setProjects(list.map(toViewModel));
    } catch (e) {
      logger.error('Failed to load projects:', e);
    }
  }, [toViewModel]);

  // Load the project catalog from the DB on mount.
  useEffect(() => {
    refreshProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Project Management Functions
  const handleCreateProject = useCallback(async (name: string, description: string) => {
    try {
      const created = await hydraulicService.createProject({
        name,
        description,
        type: 'analysis' as any,
        location: { country: '', region: '' }
      });
      const newProject = toViewModel(created);
      setProjects(prev => [newProject, ...prev]);
      await selectProjectGlobal(created.id);
    } catch (e) {
      logger.error('Failed to create project:', e);
    }
  }, [toViewModel, selectProjectGlobal]);

  const handleSelectProject = useCallback((project: Project) => {
    selectProjectGlobal(project.id);
  }, [selectProjectGlobal]);

  const handleDeleteProject = useCallback(async (projectId: string) => {
    try {
      await hydraulicService.deleteProject(projectId);
      // Las redes y calculos del proyecto los borra la cascada de la base de
      // datos (onDelete: Cascade), ya no hay que limpiar nada en local.
      setProjects(prev => prev.filter(p => p.id !== projectId));
      if (activeProjectId === projectId) {
        clearProjectGlobal();
      }
    } catch (e) {
      logger.error('Failed to delete project:', e);
    }
  }, [activeProjectId, clearProjectGlobal]);

  const handleSaveNetworkToProject = useCallback(async (data: NetworkData, filePath?: string) => {
    if (!activeProjectId) return;
    try {
      // El proceso principal lee el .inp de `filePath`: el renderer no tiene
      // acceso a disco, y el contenido hace falta para poder simular mas tarde
      // aunque el usuario mueva el fichero original.
      const res = await window.electronAPI.networkRepository.save({
        projectId: activeProjectId,
        networkData: data,
        filePath,
        filename: filePath?.split(/[\\/]/).pop() || `${data.name}.inp`
      });
      if (!res?.success) {
        // Guardar dos veces la misma red no es un error que deba interrumpir:
        // el repositorio rechaza nombres duplicados por proyecto.
        logger.warn('No se guardo la red en el proyecto:', res?.error);
        return;
      }
      await refreshActiveNetworks();
      await refreshProjects();
    } catch (e) {
      logger.error('Error guardando la red en el proyecto:', e);
    }
  }, [activeProjectId, refreshActiveNetworks, refreshProjects]);

  const handleSaveCalculationToProject = useCallback((name: string, networkId: string, results: any) => {
    if (!activeProjectId) return;

    const calculation: CalculationAsset = {
      id: `calc_${Date.now()}`,
      name,
      date: new Date().toISOString(),
      status: 'completed',
      networkId,
      results
    };

    window.electronAPI.hydraulic
      .saveCalculation(activeProjectId, {
        type: 'wntr_simulation',
        name: calculation.name,
        inputs: { networkId },
        results,
        formulas: []
      })
      .then((res: any) => {
        if (!res?.success) logger.warn('No se guardo el calculo en el proyecto:', res?.error);
        // Recargar el proyecto trae la lista de calculos al dia, que es de donde
        // la vista los lee ahora.
        else refreshCurrentProject();
      })
      .catch((e: unknown) => logger.error('Error guardando el calculo:', e));
  }, [activeProjectId, refreshCurrentProject]);

  // Core state
  const [networkData, setNetworkData] = useState<NetworkData | null>(null);
  /**
   * Ruta del .inp que el backend de WNTR tiene cargado. Antes se buscaba la red
   * guardada por nombre para recuperarla, lo que falla con dos redes homonimas o
   * con una red aun sin guardar. Recordar lo que se cargo es directo y no depende
   * del catalogo.
   */
  const [loadedNetworkPath, setLoadedNetworkPath] = useState<string | null>(null);
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

  // Current active operations
  const [highlightedComponents, setHighlightedComponents] = useState<string[]>([]);
  const [simulationDuration, setSimulationDuration] = useState<number>(24);
  const [simulationTimestep, setSimulationTimestep] = useState<number>(60); // minutes
  const [isLeftSidebarCollapsed, setIsLeftSidebarCollapsed] = useState(false);

  // --- Resilience routines (epic #26): skeletonization, service interruption,
  // resilience indicators, fragility curve ---
  const [skeletonizeThresholdMm, setSkeletonizeThresholdMm] = useState<number>(100);
  const [isSkeletonizing, setIsSkeletonizing] = useState(false);
  const [skeletonizePreview, setSkeletonizePreview] = useState<any>(null);
  const [skeletonizeError, setSkeletonizeError] = useState<string | null>(null);

  const [failureComponentIds, setFailureComponentIds] = useState('');
  const [failureDurationHours, setFailureDurationHours] = useState<number>(24);
  const [failureStartHours, setFailureStartHours] = useState<number>(0);
  const [failureRestoreHours, setFailureRestoreHours] = useState<string>('');
  const [minPressureThreshold, setMinPressureThreshold] = useState<number>(10);
  const [isSimulatingFailure, setIsSimulatingFailure] = useState(false);
  const [failureResult, setFailureResult] = useState<any>(null);
  const [failureError, setFailureError] = useState<string | null>(null);

  const [compareWithFailure, setCompareWithFailure] = useState(false);
  const [isCalculatingIndicators, setIsCalculatingIndicators] = useState(false);
  const [resilienceIndicatorsResult, setResilienceIndicatorsResult] = useState<any>(null);
  const [resilienceIndicatorsError, setResilienceIndicatorsError] = useState<string | null>(null);

  const [fragilityMaterial, setFragilityMaterial] = useState('PVC');
  const [fragilityMaxIntensity, setFragilityMaxIntensity] = useState<number>(100);
  const [isGeneratingFragility, setIsGeneratingFragility] = useState(false);
  const [fragilityResult, setFragilityResult] = useState<any>(null);
  const [fragilityError, setFragilityError] = useState<string | null>(null);

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
        setLoadedNetworkPath(result.filePath ?? null);

        // Save to current project (include filePath for later re-loading)
        handleSaveNetworkToProject(result.data, result.filePath);

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

      // Se reasegura que el backend tenga cargado el .inp de la red que se ve.
      if (loadedNetworkPath) {
        logger.debug('Loading INP file before analysis:', loadedNetworkPath);
        const loadResult = await window.electronAPI.wntr.loadINPFromPath(loadedNetworkPath);
        if (!loadResult.success) {
          throw new Error(`Failed to load INP file: ${loadResult.error}`);
        }
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
  }, [networkData, loadedNetworkPath, onAnalysisComplete]);



  // Run ALL simulations sequentially
  const handleRunAllSimulations = useCallback(async () => {
    if (!networkData) return;

    try {
      setIsSimulating(true);
      setSimulationProgress(0);
      setError(null);

      // Reset current results
      setSimulationResults({ hydraulic: null, quality: null, scenario: null });

      // Se reasegura que el backend tenga cargado el .inp de la red que se ve.
      if (loadedNetworkPath) {
        logger.debug('Loading INP file before simulation:', loadedNetworkPath);
        const loadResult = await window.electronAPI.wntr.loadINPFromPath(loadedNetworkPath);
        if (!loadResult.success) {
          throw new Error(`Failed to load INP file: ${loadResult.error}`);
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
  }, [networkData, loadedNetworkPath, onSimulationComplete, simulationDuration, simulationTimestep, currentProject, handleSaveCalculationToProject]);

  // --- Resilience routines handlers (epic #26) ---

  // #24: Esqueletización de redes
  const handlePreviewSkeletonize = useCallback(async () => {
    if (!networkData) return;
    setIsSkeletonizing(true);
    setSkeletonizeError(null);
    setSkeletonizePreview(null);
    try {
      const res = await window.electronAPI.wntr.skeletonizeNetwork({
        pipe_diameter_threshold_mm: skeletonizeThresholdMm
      });
      if (res.success) {
        setSkeletonizePreview(res.data);
      } else {
        setSkeletonizeError(res.error || 'No se pudo esqueletizar la red');
      }
    } catch (err) {
      setSkeletonizeError(err instanceof Error ? err.message : 'Error al esqueletizar la red');
    } finally {
      setIsSkeletonizing(false);
    }
  }, [networkData, skeletonizeThresholdMm]);

  const handleSaveSkeletonizedNetwork = useCallback(async () => {
    if (!skeletonizePreview || !currentProject || !networkData) return;
    try {
      const saveRes = await window.electronAPI.wntr.saveINPFile(
        skeletonizePreview.inp_content,
        `${networkData.name}_skeletonized.inp`
      );
      if (!saveRes.success || !saveRes.filePath) {
        setSkeletonizeError(saveRes.error || 'Guardado cancelado');
        return;
      }

      const newProject = await hydraulicService.createProject({
        name: `${currentProject.name} (esqueletizada)`,
        description: `Red esqueletizada a partir de "${currentProject.name}" (umbral ${skeletonizeThresholdMm}mm, reducción ${skeletonizePreview.reduction.pipes_pct}% tuberías / ${skeletonizePreview.reduction.junctions_pct}% nudos). Red original trazable: proyecto "${currentProject.name}" (${currentProject.id}).`,
        type: 'analysis' as any,
        location: { country: '', region: '' }
      });

      const loadRes = await window.electronAPI.wntr.loadINPFromPath(saveRes.filePath);
      if (loadRes.success && loadRes.data) {
        setLoadedNetworkPath(saveRes.filePath);
        await window.electronAPI.networkRepository.save({
          projectId: newProject.id,
          networkData: loadRes.data,
          filePath: saveRes.filePath,
          filename: saveRes.filePath.split(/[\\/]/).pop() || `${loadRes.data.name}.inp`,
          description: `Esqueletizada desde "${currentProject.name}"`
        });
      }

      await refreshProjects();
      setSkeletonizePreview(null);
    } catch (err) {
      setSkeletonizeError(err instanceof Error ? err.message : 'Error al guardar la red esqueletizada');
    }
  }, [skeletonizePreview, currentProject, networkData, skeletonizeThresholdMm, refreshProjects]);

  // #22: Simulación de interrupción del servicio
  const handleSimulateFailure = useCallback(async () => {
    if (!networkData) return;
    const components = failureComponentIds
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .map(id => ({ id }));

    if (components.length === 0) {
      setFailureError('Especifica al menos un componente (ID de tubería, bomba o válvula)');
      return;
    }

    setIsSimulatingFailure(true);
    setFailureError(null);
    try {
      const res = await window.electronAPI.wntr.simulateComponentFailure({
        components,
        duration_hours: failureDurationHours,
        failure_start_hours: failureStartHours,
        restore_hours: failureRestoreHours ? Number(failureRestoreHours) : undefined,
        min_pressure_threshold: minPressureThreshold
      });

      if (res.success) {
        setFailureResult(res.data);
        // Todos los afectados se resaltan de una vez: son el resultado de la
        // simulación, no algo que el usuario deba ir marcando nudo a nudo.
        setHighlightedComponents((res.data.affected_nodes ?? []).map((n: any) => n.id));
        if (currentProject) {
          const currentNetwork = currentProject.networks.find(n => n.name === networkData.name);
          const networkId = currentNetwork?.id || 'unknown';
          handleSaveCalculationToProject(
            `Interrupción de Servicio: ${res.data.failed_components.join(', ')}`,
            networkId,
            res.data
          );
        }
      } else {
        setFailureError(res.error || 'No se pudo simular la interrupción del servicio');
      }
    } catch (err) {
      setFailureError(err instanceof Error ? err.message : 'Error al simular la interrupción');
    } finally {
      setIsSimulatingFailure(false);
    }
  }, [networkData, failureComponentIds, failureDurationHours, failureStartHours, failureRestoreHours, minPressureThreshold, currentProject, handleSaveCalculationToProject]);

  // #23: Indicadores de resiliencia
  const handleCalculateResilienceIndicators = useCallback(async () => {
    if (!networkData) return;
    setIsCalculatingIndicators(true);
    setResilienceIndicatorsError(null);
    try {
      const options: any = {
        duration_hours: failureDurationHours,
        min_pressure_threshold: minPressureThreshold
      };
      if (compareWithFailure && failureResult?.failed_components?.length) {
        options.failed_components = failureResult.failed_components.map((id: string) => ({ id }));
        options.failure_start_hours = failureStartHours;
      }

      const res = await window.electronAPI.wntr.calculateResilienceIndicators(options);
      if (res.success) {
        setResilienceIndicatorsResult(res.data);
        if (currentProject) {
          const currentNetwork = currentProject.networks.find(n => n.name === networkData.name);
          const networkId = currentNetwork?.id || 'unknown';
          handleSaveCalculationToProject('Indicadores de Resiliencia', networkId, res.data);
        }
      } else {
        setResilienceIndicatorsError(res.error || 'No se pudieron calcular los indicadores de resiliencia');
      }
    } catch (err) {
      setResilienceIndicatorsError(err instanceof Error ? err.message : 'Error al calcular los indicadores');
    } finally {
      setIsCalculatingIndicators(false);
    }
  }, [networkData, failureDurationHours, minPressureThreshold, compareWithFailure, failureResult, failureStartHours, currentProject, handleSaveCalculationToProject]);

  const handleExportResilienceCSV = useCallback(() => {
    if (!resilienceIndicatorsResult) return;
    const b = resilienceIndicatorsResult.before;
    const a = resilienceIndicatorsResult.after;
    const d = resilienceIndicatorsResult.delta;
    const rows = [
      ['Métrica', 'Antes', 'Después', 'Delta'],
      ['Índice de Todini', b.todini_index.toFixed(4), a ? a.todini_index.toFixed(4) : '', d ? d.todini_index.toFixed(4) : ''],
      ['Entropía de red', b.network_entropy.toFixed(4), a ? a.network_entropy.toFixed(4) : '', d ? d.network_entropy.toFixed(4) : ''],
      ['Redundancia hidráulica', b.hydraulic_redundancy.toFixed(4), a ? a.hydraulic_redundancy.toFixed(4) : '', d ? d.hydraulic_redundancy.toFixed(4) : ''],
      ['Nivel de servicio por presión', b.serviceability.pressure_serviceability.toFixed(4), a ? a.serviceability.pressure_serviceability.toFixed(4) : '', d ? d.pressure_serviceability.toFixed(4) : '']
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `indicadores_resiliencia_${networkData?.name || 'red'}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [resilienceIndicatorsResult, networkData]);

  // #25: Curva de fragilidad
  const handleGenerateFragilityCurve = useCallback(async () => {
    if (!networkData) return;
    setIsGeneratingFragility(true);
    setFragilityError(null);
    try {
      const res = await window.electronAPI.wntr.generateFragilityCurve({
        hazard_type: 'seismic_pgv',
        material: fragilityMaterial,
        max_intensity: fragilityMaxIntensity
      });
      if (res.success) {
        setFragilityResult(res.data);
      } else {
        setFragilityError(res.error || 'No se pudo generar la curva de fragilidad');
      }
    } catch (err) {
      setFragilityError(err instanceof Error ? err.message : 'Error al generar la curva de fragilidad');
    } finally {
      setIsGeneratingFragility(false);
    }
  }, [networkData, fragilityMaterial, fragilityMaxIntensity]);

  const handleExportFragilityCSV = useCallback(() => {
    if (!fragilityResult) return;
    const rows = [
      ['PGV (cm/s)', 'Prob. falla de tubería', 'Tuberías afectadas esperadas'],
      ...fragilityResult.intensities.map((pgv: number, i: number) => [
        pgv.toFixed(2),
        fragilityResult.pipe_failure_probability[i]?.toFixed(6) ?? '',
        fragilityResult.expected_failed_pipes[i]?.toFixed(2) ?? ''
      ])
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `curva_fragilidad_${fragilityMaterial}_${networkData?.name || 'red'}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [fragilityResult, fragilityMaterial, networkData]);


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
                onClick={() => clearProjectGlobal()}
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
                          onClick={async () => {
                            // Datos y .inp desde la base de datos: la red se abre
                            // aunque el fichero original ya no este en disco.
                            const res = await window.electronAPI.networkRepository.load(net.id);
                            if (!res?.success) {
                              setError(res?.error || 'No se pudo abrir la red guardada');
                              return;
                            }
                            setNetworkData(res.data);
                            setLoadedNetworkPath(res.filePath ?? null);
                            // El backend debe quedarse con la misma red que se
                            // muestra, o las simulaciones correrian sobre otra.
                            if (res.filePath) {
                              try {
                                await window.electronAPI.wntr.loadINPFromPath(res.filePath);
                              } catch (err) {
                                logger.warn('Could not reload INP file:', err);
                              }
                            }
                          }}
                        >
                          <Database className="h-3 w-3 mr-2" />
                          {net.name}
                          {net.incomplete && (
                            <span
                              className="ml-2 rounded bg-yellow-500/15 px-1.5 py-0.5 text-[10px] font-medium text-yellow-600 dark:text-yellow-500"
                              title="Falta el fichero .inp original: la red se puede ver, pero no simular. Vuelve a importarla para recuperarla."
                            >
                              sin .inp
                            </span>
                          )}
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
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="simulate" title="Simulation">
                  <Play className="h-4 w-4" />
                </TabsTrigger>
                <TabsTrigger value="analyze" title="Analysis">
                  <Target className="h-4 w-4" />
                </TabsTrigger>
                <TabsTrigger value="resilience" title="Resilience">
                  <ShieldAlert className="h-4 w-4" />
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

              {/* RESILIENCE TAB (epic #26) */}
              <TabsContent value="resilience" className="mt-0 space-y-4">
                <div className="space-y-6">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-amber-500" />
                    Rutinas de Resiliencia
                  </h3>

                  {/* Skeletonization (#24) */}
                  <div className="space-y-2 p-3 bg-muted/20 rounded-lg">
                    <h4 className="text-xs font-semibold flex items-center gap-2 text-foreground">
                      <Scissors className="h-3.5 w-3.5" /> Esqueletización de Red
                    </h4>
                    <p className="text-[11px] text-muted-foreground">
                      Simplifica la red fusionando/eliminando tuberías bajo un diámetro umbral. Se guarda como un proyecto nuevo, sin modificar el original.
                    </p>
                    <AvisoDuracion>En redes grandes el proceso puede tardar cerca de un minuto.</AvisoDuracion>
                    <div className="bg-background p-2 rounded border">
                      <div className="text-[10px] text-muted-foreground mb-1">Umbral de diámetro (mm)</div>
                      <input
                        type="number"
                        value={skeletonizeThresholdMm}
                        onChange={(e) => setSkeletonizeThresholdMm(Number(e.target.value))}
                        className="w-full bg-transparent font-mono text-sm border-b border-border focus:outline-none focus:border-primary"
                      />
                    </div>
                    <Button size="sm" className="w-full" onClick={handlePreviewSkeletonize} disabled={isSkeletonizing}>
                      {isSkeletonizing ? (
                        <><RefreshCw className="h-3.5 w-3.5 mr-2 animate-spin" /> Esqueletizando...</>
                      ) : (
                        <><Scissors className="h-3.5 w-3.5 mr-2" /> Ejecutar Esqueletización / Vista Previa</>
                      )}
                    </Button>

                    {skeletonizeError && (
                      <Alert variant="destructive" className="text-xs">
                        <AlertCircle className="h-3 w-3 inline mr-1" /> {skeletonizeError}
                      </Alert>
                    )}

                    {skeletonizePreview && (
                      <Card>
                        <CardContent className="p-3 text-xs space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <div className="text-[10px] text-muted-foreground">Tuberías</div>
                              <div className="font-mono">
                                {skeletonizePreview.before.pipes} → {skeletonizePreview.after.pipes}{' '}
                                <span className="text-green-600">(-{skeletonizePreview.reduction.pipes_pct}%)</span>
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] text-muted-foreground">Nudos</div>
                              <div className="font-mono">
                                {skeletonizePreview.before.junctions} → {skeletonizePreview.after.junctions}{' '}
                                <span className="text-green-600">(-{skeletonizePreview.reduction.junctions_pct}%)</span>
                              </div>
                            </div>
                          </div>
                          <Button size="sm" variant="outline" className="w-full" onClick={handleSaveSkeletonizedNetwork}>
                            Guardar como nuevo proyecto
                          </Button>
                        </CardContent>
                      </Card>
                    )}
                  </div>

                  {/* Service interruption simulation (#22) */}
                  <div className="space-y-2 p-3 bg-muted/20 rounded-lg border-t pt-4">
                    <h4 className="text-xs font-semibold flex items-center gap-2 text-foreground">
                      <Zap className="h-3.5 w-3.5" /> Simulación de Interrupción del Servicio
                    </h4>
                    <p className="text-[11px] text-muted-foreground">
                      Simula la falla de uno o más componentes (tubería, bomba, válvula) y estima el impacto sobre el servicio.
                    </p>
                    <AvisoDuracion>
                      Ejecuta una simulación hidráulica completa: en redes grandes puede tardar un minuto o más.
                    </AvisoDuracion>
                    <div className="bg-background p-2 rounded border">
                      <div className="text-[10px] text-muted-foreground mb-1">IDs de componentes (separados por coma)</div>
                      <input
                        type="text"
                        value={failureComponentIds}
                        onChange={(e) => setFailureComponentIds(e.target.value)}
                        placeholder="ej. P-12, PUMP-1"
                        className="w-full bg-transparent font-mono text-sm border-b border-border focus:outline-none focus:border-primary"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-background p-2 rounded border">
                        <div className="text-[10px] text-muted-foreground mb-1">Inicio falla (h)</div>
                        <input
                          type="number"
                          value={failureStartHours}
                          onChange={(e) => setFailureStartHours(Number(e.target.value))}
                          className="w-full bg-transparent font-mono text-sm border-b border-border focus:outline-none focus:border-primary"
                        />
                      </div>
                      <div className="bg-background p-2 rounded border">
                        <div className="text-[10px] text-muted-foreground mb-1">Restaurar en (h, opcional)</div>
                        <input
                          type="number"
                          value={failureRestoreHours}
                          onChange={(e) => setFailureRestoreHours(e.target.value)}
                          placeholder="permanente"
                          className="w-full bg-transparent font-mono text-sm border-b border-border focus:outline-none focus:border-primary"
                        />
                      </div>
                      <div className="bg-background p-2 rounded border">
                        <div className="text-[10px] text-muted-foreground mb-1">Duración simulación (h)</div>
                        <input
                          type="number"
                          value={failureDurationHours}
                          onChange={(e) => setFailureDurationHours(Number(e.target.value))}
                          className="w-full bg-transparent font-mono text-sm border-b border-border focus:outline-none focus:border-primary"
                        />
                      </div>
                      <div className="bg-background p-2 rounded border">
                        <div className="text-[10px] text-muted-foreground mb-1">Presión mínima (m)</div>
                        <input
                          type="number"
                          value={minPressureThreshold}
                          onChange={(e) => setMinPressureThreshold(Number(e.target.value))}
                          className="w-full bg-transparent font-mono text-sm border-b border-border focus:outline-none focus:border-primary"
                        />
                      </div>
                    </div>
                    <Button size="sm" className="w-full" onClick={handleSimulateFailure} disabled={isSimulatingFailure}>
                      {isSimulatingFailure ? (
                        <><RefreshCw className="h-3.5 w-3.5 mr-2 animate-spin" /> Simulando...</>
                      ) : (
                        <><Zap className="h-3.5 w-3.5 mr-2" /> Simular Interrupción</>
                      )}
                    </Button>

                    {failureError && (
                      <Alert variant="destructive" className="text-xs">
                        <AlertCircle className="h-3 w-3 inline mr-1" /> {failureError}
                      </Alert>
                    )}

                    {failureResult && (
                      <Card>
                        <CardContent className="p-3 text-xs space-y-2">
                          <div className="flex justify-between">
                            <span>Nudos afectados:</span>
                            <span className="font-mono">{failureResult.affected_node_count} / {failureResult.total_junction_count}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] text-muted-foreground">
                              Resaltados en el mapa. Click en un nudo para quitarlo o volver a ponerlo.
                            </span>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-[10px] shrink-0"
                              onClick={() => {
                                const all = failureResult.affected_nodes.map((n: any) => n.id);
                                const todosPuestos = all.every((id: string) => highlightedComponents.includes(id));
                                setHighlightedComponents(todosPuestos ? [] : all);
                              }}
                            >
                              {failureResult.affected_nodes.every((n: any) => highlightedComponents.includes(n.id))
                                ? 'Quitar resaltado'
                                : 'Resaltar todos'}
                            </Button>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {failureResult.affected_nodes.slice(0, 8).map((n: any) => (
                              <Badge
                                key={n.id}
                                variant={highlightedComponents.includes(n.id) ? "default" : "outline"}
                                className="text-[10px] h-5 cursor-pointer hover:bg-primary/20"
                                onClick={() => setHighlightedComponents(prev => prev.includes(n.id) ? prev.filter(x => x !== n.id) : [...prev, n.id])}
                                title={`Presión residual: ${n.min_pressure.toFixed(2)}m · ${n.outage_hours.toFixed(1)}h fuera de servicio`}
                              >
                                {n.id}
                              </Badge>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>

                  {/* Resilience indicators (#23) */}
                  <div className="space-y-2 p-3 bg-muted/20 rounded-lg border-t pt-4">
                    <h4 className="text-xs font-semibold flex items-center gap-2 text-foreground">
                      <Target className="h-3.5 w-3.5" /> Indicadores de Resiliencia
                    </h4>
                    <p className="text-[11px] text-muted-foreground">
                      Índice de Todini, entropía de red y redundancia hidráulica. Compara antes/después del escenario de interrupción simulado arriba.
                    </p>
                    <AvisoDuracion>
                      Con la comparación activada se simula dos veces la red, así que tarda aproximadamente el doble.
                    </AvisoDuracion>
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={compareWithFailure}
                        onChange={(e) => setCompareWithFailure(e.target.checked)}
                        disabled={!failureResult}
                      />
                      Comparar con la interrupción simulada {!failureResult && '(simula una interrupción primero)'}
                    </label>
                    <Button size="sm" className="w-full" onClick={handleCalculateResilienceIndicators} disabled={isCalculatingIndicators}>
                      {isCalculatingIndicators ? (
                        <><RefreshCw className="h-3.5 w-3.5 mr-2 animate-spin" /> Calculando...</>
                      ) : (
                        <><Target className="h-3.5 w-3.5 mr-2" /> Calcular Indicadores</>
                      )}
                    </Button>

                    {resilienceIndicatorsError && (
                      <Alert variant="destructive" className="text-xs">
                        <AlertCircle className="h-3 w-3 inline mr-1" /> {resilienceIndicatorsError}
                      </Alert>
                    )}

                    {resilienceIndicatorsResult && (
                      <Card>
                        <CardContent className="p-3 text-xs space-y-2">
                          <table className="w-full">
                            <thead>
                              <tr className="text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border">
                                <th className="text-left font-medium pb-1">Indicador</th>
                                {resilienceIndicatorsResult.after ? (
                                  <>
                                    <th className="text-right font-medium pb-1">Antes</th>
                                    <th className="text-right font-medium pb-1">Después</th>
                                  </>
                                ) : (
                                  <th className="text-right font-medium pb-1">Valor Actual</th>
                                )}
                              </tr>
                            </thead>
                            <tbody>
                              {[
                                {
                                  label: 'Índice de Todini',
                                  delta: resilienceIndicatorsResult.delta?.todini_index,
                                  before: resilienceIndicatorsResult.before.todini_index?.toFixed(4),
                                  after: resilienceIndicatorsResult.after?.todini_index?.toFixed(4),
                                },
                                {
                                  label: 'Entropía de red',
                                  delta: resilienceIndicatorsResult.delta?.network_entropy,
                                  before: resilienceIndicatorsResult.before.network_entropy?.toFixed(4),
                                  after: resilienceIndicatorsResult.after?.network_entropy?.toFixed(4),
                                },
                                {
                                  label: 'Redundancia hidráulica',
                                  delta: resilienceIndicatorsResult.delta?.hydraulic_redundancy,
                                  before: resilienceIndicatorsResult.before.hydraulic_redundancy?.toFixed(4),
                                  after: resilienceIndicatorsResult.after?.hydraulic_redundancy?.toFixed(4),
                                },
                                {
                                  label: 'Nivel de servicio por presión',
                                  delta: resilienceIndicatorsResult.delta?.pressure_serviceability,
                                  before: `${(resilienceIndicatorsResult.before.serviceability.pressure_serviceability * 100).toFixed(1)}%`,
                                  after: resilienceIndicatorsResult.after
                                    ? `${(resilienceIndicatorsResult.after.serviceability.pressure_serviceability * 100).toFixed(1)}%`
                                    : undefined,
                                },
                              ].map(({ label, before, after, delta }) => (
                                <tr key={label} className="border-b border-border/40 last:border-0">
                                  <td className="py-1 pr-2">{label}</td>
                                  <td className="py-1 text-right font-mono">{before}</td>
                                  {resilienceIndicatorsResult.after && (
                                    <td className={`py-1 pl-2 text-right font-mono ${delta < 0 ? 'text-red-500' : 'text-green-600'}`}>
                                      {after}
                                    </td>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <Button size="sm" className="w-full mt-2" onClick={handleExportResilienceCSV}>
                            <Download className="h-3 w-3 mr-2" /> Exportar CSV
                          </Button>
                        </CardContent>
                      </Card>
                    )}
                  </div>

                  {/* Fragility curve (#25) */}
                  <div className="space-y-2 p-3 bg-muted/20 rounded-lg border-t pt-4">
                    <h4 className="text-xs font-semibold flex items-center gap-2 text-foreground">
                      <AlertTriangle className="h-3.5 w-3.5" /> Curva de Fragilidad (Sismo)
                    </h4>
                    <p className="text-[11px] text-muted-foreground">
                      Probabilidad de falla de tubería vs. intensidad sísmica (PGV). Modelo genérico ALA (2001) por material —{' '}
                      <strong>requiere validación de un experto APyS antes de usarse en decisiones reales.</strong>
                    </p>
                    <AvisoDuracion>
                      Evalúa la curva sobre todas las tuberías: en redes grandes puede tardar cerca de un minuto.
                    </AvisoDuracion>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-background p-2 rounded border">
                        <div className="text-[10px] text-muted-foreground mb-1">Material predominante</div>
                        <select
                          value={fragilityMaterial}
                          onChange={(e) => setFragilityMaterial(e.target.value)}
                          className="w-full bg-transparent font-mono text-sm border-b border-border focus:outline-none focus:border-primary"
                        >
                          <option value="PVC">PVC</option>
                          <option value="HDPE">PEAD/HDPE</option>
                          <option value="DI">Hierro Dúctil</option>
                          <option value="CI">Hierro Fundido</option>
                          <option value="AC">Asbesto-Cemento</option>
                          <option value="STEEL">Acero</option>
                          <option value="CONCRETE">Concreto</option>
                          <option value="DEFAULT">Genérico</option>
                        </select>
                      </div>
                      <div className="bg-background p-2 rounded border">
                        <div className="text-[10px] text-muted-foreground mb-1">PGV máximo (cm/s)</div>
                        <input
                          type="number"
                          value={fragilityMaxIntensity}
                          onChange={(e) => setFragilityMaxIntensity(Number(e.target.value))}
                          className="w-full bg-transparent font-mono text-sm border-b border-border focus:outline-none focus:border-primary"
                        />
                      </div>
                    </div>
                    <Button size="sm" className="w-full" onClick={handleGenerateFragilityCurve} disabled={isGeneratingFragility}>
                      {isGeneratingFragility ? (
                        <><RefreshCw className="h-3.5 w-3.5 mr-2 animate-spin" /> Generando...</>
                      ) : (
                        <><AlertTriangle className="h-3.5 w-3.5 mr-2" /> Generar Curva</>
                      )}
                    </Button>

                    {fragilityError && (
                      <Alert variant="destructive" className="text-xs">
                        <AlertCircle className="h-3 w-3 inline mr-1" /> {fragilityError}
                      </Alert>
                    )}

                    {fragilityResult && (
                      <Card>
                        <CardContent className="p-3 text-xs space-y-2">
                          <div className="h-40">
                            <Line
                              data={{
                                labels: fragilityResult.intensities.map((v: number) => v.toFixed(0)),
                                datasets: [{
                                  label: 'Prob. falla de tubería',
                                  data: fragilityResult.pipe_failure_probability,
                                  borderColor: 'rgb(234, 88, 12)',
                                  backgroundColor: 'rgba(234, 88, 12, 0.3)',
                                  borderWidth: 2,
                                  pointRadius: 0,
                                  tension: 0.3
                                }]
                              }}
                              options={{
                                responsive: true,
                                maintainAspectRatio: false,
                                animation: { duration: 0 },
                                plugins: { legend: { display: false } },
                                scales: {
                                  x: { title: { display: true, text: 'PGV (cm/s)', font: { size: 9 } }, ticks: { maxTicksLimit: 6, font: { size: 9 } } },
                                  y: { min: 0, max: 1, ticks: { font: { size: 9 } } }
                                }
                              }}
                            />
                          </div>
                          <div className="flex justify-between">
                            <span>Tuberías afectadas esperadas (PGV máx.):</span>
                            <span className="font-mono">
                              {fragilityResult.expected_failed_pipes[fragilityResult.expected_failed_pipes.length - 1]?.toFixed(1)} / {fragilityResult.pipe_count}
                            </span>
                          </div>
                          <div className="text-[10px] text-muted-foreground italic">{fragilityResult.methodology}</div>
                          <Button size="sm" className="w-full mt-2" onClick={handleExportFragilityCSV}>
                            <Download className="h-3 w-3 mr-2" /> Exportar CSV
                          </Button>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </div>
              </TabsContent>

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
            highlightedNodes={highlightedComponents}
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