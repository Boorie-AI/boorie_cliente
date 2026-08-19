import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { WNTRMapViewer } from './WNTRMapViewer';
import { NetworkTopologyView } from './NetworkTopologyView';
import { WNTRAdvancedVisualizerPanel } from './WNTRAdvancedVisualizerPanel';
import { AJUSTES_INICIALES, soloAjustesDelMapa, type AjustesVisor } from './ajustesVisor';
import type { MapSettings } from './WNTRMapViewer';
import { tieneCoordenadasUtiles } from '@/services/network/topologia';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import {
  Play,
  Pause,
  Square,
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight,
  Calendar
} from 'lucide-react';

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

interface SimulationResults {
  node_results: any;
  link_results: any;
  timestamps: number[];
  stats?: {
    pressure?: {
      minimum: number;
      maximum: number;
      average: number;
      unit: string;
    };
    flow?: {
      minimum: number;
      maximum: number;
      average: number;
      total_demand: number;
      unit: string;
    };
  };
}

interface WNTRAdvancedMapViewerProps {
  networkData?: NetworkData | null;
  simulationResults?: SimulationResults | null;
  onDataLoaded?: (data: NetworkData) => void;
  onSimulationCompleted?: (results: SimulationResults) => void;
  highlightedNodes?: string[];
  /** Red guardada que se muestra; el visor persiste ahí el EPSG declarado (#36). */
  networkId?: string | null;
}

export const WNTRAdvancedMapViewer: React.FC<WNTRAdvancedMapViewerProps> = ({
  networkData: externalNetworkData,
  simulationResults: externalSimulationResults,
  onDataLoaded,
  onSimulationCompleted: _onSimulationCompleted,
  highlightedNodes,
  networkId
}) => {
  const [networkData, setNetworkData] = useState<NetworkData | null>(externalNetworkData || null);
  const [simulationResults, setSimulationResults] = useState<SimulationResults | null>(externalSimulationResults || null);
  // Dueño único de los ajustes del visor: el mapa, el esquema y el panel leen de
  // aquí. Antes cada uno tenía su copia y el panel no llegaba al mapa (#37).
  const [visualizationSettings, setVisualizationSettings] = useState<AjustesVisor>(AJUSTES_INICIALES);

  const [currentTime, setCurrentTime] = useState(new Date('2025-10-09T05:42:00'));
  const playbackIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Handle external data changes
  useEffect(() => {
    if (externalNetworkData) {
      setNetworkData(externalNetworkData);
    }
  }, [externalNetworkData]);

  useEffect(() => {
    if (externalSimulationResults) {
      setSimulationResults(externalSimulationResults);
    }
  }, [externalSimulationResults]);

  // Handle playback
  useEffect(() => {
    if (visualizationSettings.isPlaying && simulationResults) {
      const maxSteps = simulationResults.timestamps?.length || 1;
      const interval = 1000 / visualizationSettings.playbackSpeed;

      playbackIntervalRef.current = setInterval(() => {
        setVisualizationSettings(prev => {
          const nextStep = prev.timeStep + 1;
          if (nextStep >= maxSteps) {
            return { ...prev, timeStep: 0 }; // Loop back to start
          }
          return { ...prev, timeStep: nextStep };
        });
      }, interval);

      return () => {
        if (playbackIntervalRef.current) {
          clearInterval(playbackIntervalRef.current);
          playbackIntervalRef.current = null;
        }
      };
    } else {
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current);
        playbackIntervalRef.current = null;
      }
    }
  }, [visualizationSettings.isPlaying, visualizationSettings.playbackSpeed, simulationResults]);

  // Update time based on time step
  useEffect(() => {
    if (simulationResults?.timestamps) {
      const baseTime = new Date('2025-10-09T00:00:00');
      const hoursToAdd = visualizationSettings.timeStep;
      const newTime = new Date(baseTime.getTime() + hoursToAdd * 60 * 60 * 1000);
      setCurrentTime(newTime);
    }
  }, [visualizationSettings.timeStep, simulationResults]);

  const handleSettingsChange = useCallback((settings: AjustesVisor) => {
    setVisualizationSettings(settings);
  }, []);

  // Sólo se aceptan de vuelta las claves del mapa: el resto de los ajustes no son
  // suyos y devolverlos pisaría la vista o el paso de tiempo vigentes.
  const handleMapSettingsChange = useCallback((mapSettings: MapSettings) => {
    setVisualizationSettings(prev => ({ ...prev, ...mapSettings }));
  }, []);

  const ajustesDelMapa = useMemo(
    () => soloAjustesDelMapa(visualizationSettings),
    [visualizationSettings]
  );

  // Una red cargada desde el mapa es la red del visor y la de la pantalla que lo
  // contiene: se propaga en lugar de quedarse en el mapa.
  const handleNetworkLoaded = useCallback((datos: NetworkData) => {
    setNetworkData(datos);
    onDataLoaded?.(datos);
  }, [onDataLoaded]);

  const verTopologia = useCallback(() => {
    setVisualizationSettings(prev => ({ ...prev, vista: 'topologia' }));
  }, []);

  /**
   * Sin nudos con coordenadas no hay nada que situar sobre la ortofoto, así que
   * el mapa deja de ofrecerse y el esquema pasa a ser la vista por defecto. El
   * caso de coordenadas presentes pero con sistema sin declarar lo resuelve el
   * propio mapa, que avisa y ofrece la salida al esquema.
   */
  const mapaDisponible = !networkData || tieneCoordenadasUtiles(networkData.nodes);

  useEffect(() => {
    if (!mapaDisponible) {
      setVisualizationSettings(prev => (prev.vista === 'mapa' ? { ...prev, vista: 'topologia' } : prev));
    }
  }, [mapaDisponible]);

  const togglePlayback = () => {
    setVisualizationSettings(prev => ({ ...prev, isPlaying: !prev.isPlaying }));
  };

  const stopPlayback = () => {
    setVisualizationSettings(prev => ({ ...prev, isPlaying: false, timeStep: 0 }));
  };

  const skipToStart = () => {
    setVisualizationSettings(prev => ({ ...prev, timeStep: 0 }));
  };

  const skipToEnd = () => {
    const maxSteps = simulationResults?.timestamps?.length || 1;
    setVisualizationSettings(prev => ({ ...prev, timeStep: maxSteps - 1 }));
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('es-ES', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const generateTimeLabels = () => {
    const labels = [];
    for (let i = 0; i <= 22; i += 2) {
      labels.push(`${i.toString().padStart(2, '0')}:00`);
    }
    return labels;
  };

  const timeLabels = generateTimeLabels();
  const maxTimeSteps = simulationResults?.timestamps?.length || 24;

  const [isRightSidebarCollapsed, setIsRightSidebarCollapsed] = useState(false);

  return (
    // `h-full`, no `h-screen`: este visor vive dentro del hueco que deja la barra
    // superior de la aplicación, así que pedir 100 vh lo hace sobresalir por
    // arriba y se come la fila de botones (visible al maximizar la ventana).
    <div className="flex h-full bg-gray-900 overflow-hidden">
      {/* Main Map Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Map Container */}
        <div className="flex-1 relative">
          {visualizationSettings.vista === 'mapa' ? (
            <WNTRMapViewer
              networkData={networkData}
              simulationResults={simulationResults}
              activeTimeStep={visualizationSettings.timeStep}
              highlightedNodes={highlightedNodes}
              networkId={networkId}
              mapSettings={ajustesDelMapa}
              onMapSettingsChange={handleMapSettingsChange}
              onVerTopologia={verTopologia}
              onNetworkLoaded={handleNetworkLoaded}
            />
          ) : (
            <NetworkTopologyView
              networkData={networkData}
              simulationResults={simulationResults}
              activeTimeStep={visualizationSettings.timeStep}
              highlightedNodes={highlightedNodes}
              showLabels={visualizationSettings.showLabels}
            />
          )}

          {/* Overlay info - Empty for now as requested */}

        </div>

        {/* Timeline Control Bar */}
        <Card className="m-0 rounded-none bg-slate-800 border-t border-slate-600 z-10">
          <CardContent className="p-4">
            <div className="space-y-3">
              {/* Date and Time Display */}
              <div className="flex items-center justify-center gap-4 text-white">
                <div className="flex items-center gap-2">
                  <ChevronLeft className="h-4 w-4 cursor-pointer hover:text-blue-400" />
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    <span className="text-sm font-medium">
                      {formatDate(currentTime).charAt(0).toUpperCase() + formatDate(currentTime).slice(1)}, {formatTime(currentTime)} AEST
                    </span>
                  </div>
                  <ChevronRight className="h-4 w-4 cursor-pointer hover:text-blue-400" />
                </div>
              </div>

              {/* Controls and Timeline */}
              <div className="flex items-center gap-4">
                {/* Playback Controls */}
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={skipToStart}
                    className="text-white hover:bg-slate-700 p-2"
                  >
                    <SkipBack className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={togglePlayback}
                    className="text-white hover:bg-slate-700 p-2"
                  >
                    {visualizationSettings.isPlaying ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={stopPlayback}
                    className="text-white hover:bg-slate-700 p-2"
                  >
                    <Square className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={skipToEnd}
                    className="text-white hover:bg-slate-700 p-2"
                  >
                    <SkipForward className="h-4 w-4" />
                  </Button>
                </div>

                {/* Timeline Slider */}
                <div className="flex-1 space-y-2">
                  <div className="relative">
                    <Slider
                      value={[visualizationSettings.timeStep]}
                      onValueChange={([value]) =>
                        setVisualizationSettings(prev => ({ ...prev, timeStep: value }))
                      }
                      max={maxTimeSteps - 1}
                      step={1}
                      className="w-full"
                    />
                    {/* Time position indicator */}
                    <div
                      className="absolute top-0 w-2 h-6 bg-blue-500 rounded transform -translate-x-1/2 -translate-y-1"
                      style={{
                        left: `${(visualizationSettings.timeStep / (maxTimeSteps - 1)) * 100}%`
                      }}
                    />
                  </div>

                  {/* Time Labels */}
                  <div className="flex justify-between text-xs text-gray-400 px-1">
                    {timeLabels.map((label, index) => (
                      <span key={index}>{label}</span>
                    ))}
                  </div>
                </div>

                {/* Current Time Display */}
                <div className="text-white text-sm font-mono min-w-[60px] text-right">
                  {formatTime(currentTime)}
                </div>

                {/* Velocidad de reproducción: estaba sólo en la tarjeta que el
                    panel duplicaba, y al retirarla baja aquí, junto al resto de
                    controles de transporte. */}
                <select
                  value={visualizationSettings.playbackSpeed}
                  onChange={e =>
                    setVisualizationSettings(prev => ({ ...prev, playbackSpeed: Number(e.target.value) }))
                  }
                  className="rounded-md border border-slate-600 bg-slate-700 px-2 py-1 text-xs text-white"
                  title="Velocidad de reproducción"
                >
                  {[0.5, 1, 2, 4].map(v => (
                    <option key={v} value={v}>{v}x</option>
                  ))}
                </select>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right Sidebar Panel */}
      <div className={`relative flex-shrink-0 border-l border-slate-700 bg-slate-900 transition-all duration-300 ease-in-out ${isRightSidebarCollapsed ? 'w-0' : 'w-80'}`}>

        {/* Toggle Button */}
        <Button
          variant="outline"
          size="icon"
          onClick={() => setIsRightSidebarCollapsed(!isRightSidebarCollapsed)}
          className="absolute -left-3 top-4 z-50 h-6 w-6 rounded-full border border-slate-600 bg-slate-800 p-0 text-slate-400 hover:bg-slate-700 hover:text-white"
          title={isRightSidebarCollapsed ? "Show Sidebar" : "Hide Sidebar"}
        >
          {isRightSidebarCollapsed ? (
            <ChevronLeft className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
        </Button>

        <div className={`h-full w-80 overflow-hidden ${isRightSidebarCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'} transition-opacity duration-300`}>
          <WNTRAdvancedVisualizerPanel
            networkData={networkData}
            simulationResults={simulationResults}
            ajustes={visualizationSettings}
            onCambio={handleSettingsChange}
            mapaDisponible={mapaDisponible}
          />
        </div>
      </div>
    </div>
  );
};