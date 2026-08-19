import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { WNTRMapViewer } from './WNTRMapViewer';
import { NetworkTopologyView } from './NetworkTopologyView';
import { WNTRAdvancedVisualizerPanel } from './WNTRAdvancedVisualizerPanel';
import { AJUSTES_INICIALES, soloAjustesDelMapa, type AjustesVisor } from './ajustesVisor';
import type { MapSettings } from './WNTRMapViewer';
import { tieneCoordenadasUtiles } from '@/services/network/topologia';
import { construirEscala } from '@/services/network/simbologia';
import { useSimulationTimeline } from '@/hooks/useSimulationTimeline';
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
  Clock
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

  const irAPaso = useCallback((paso: number) => {
    setVisualizationSettings(prev => ({ ...prev, timeStep: paso }));
  }, []);

  /**
   * El eje temporal sale de los datos: los `timestamps` que devuelve WNTR —en
   * segundos— y la hora de arranque que declara el `.inp`. Antes salía de una
   * fecha base inventada y de una hora fija por paso, así que un modelo que
   * reporta cada 15 minutos veía correr su reloj cuatro veces más rápido (#45).
   */
  const timeline = useSimulationTimeline({
    timestamps: simulationResults?.timestamps,
    opcionesTiempo: networkData?.options?.time,
    paso: visualizationSettings.timeStep,
    reproduciendo: visualizationSettings.isPlaying,
    velocidad: visualizationSettings.playbackSpeed,
    onPaso: irAPaso,
  });

  // Un modelo de un solo paso no tiene nada que reproducir: la barra desaparece
  // en lugar de ofrecer un reproductor inútil.
  const hayLineaTiempo = !timeline.linea.estacionaria;

  // Un paso que ya no existe —cambio de red, o simulación más corta— se recorta
  // en lugar de dejar la barra apuntando fuera de los resultados.
  useEffect(() => {
    if (visualizationSettings.timeStep >= timeline.linea.pasos) {
      irAPaso(timeline.linea.pasos - 1);
    }
  }, [timeline.linea.pasos, visualizationSettings.timeStep, irAPaso]);

  useEffect(() => {
    if (!hayLineaTiempo && visualizationSettings.isPlaying) {
      setVisualizationSettings(prev => ({ ...prev, isPlaying: false }));
    }
  }, [hayLineaTiempo, visualizationSettings.isPlaying]);

  const handleSettingsChange = useCallback((settings: AjustesVisor) => {
    setVisualizationSettings(settings);
  }, []);

  // Sólo se aceptan de vuelta las claves del mapa: el resto de los ajustes no son
  // suyos y devolverlos pisaría la vista o el paso de tiempo vigentes.
  const handleMapSettingsChange = useCallback((mapSettings: MapSettings) => {
    setVisualizationSettings(prev => ({ ...prev, ...mapSettings }));
  }, []);

  /** Una sola escala para el mapa, el esquema y la leyenda del panel. */
  const escala = useMemo(
    () => construirEscala(
      visualizationSettings.simbologia,
      networkData,
      simulationResults,
      visualizationSettings.timeStep
    ),
    [visualizationSettings.simbologia, visualizationSettings.timeStep, networkData, simulationResults]
  );

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

  const skipToStart = () => irAPaso(0);

  const skipToEnd = () => irAPaso(timeline.linea.pasos - 1);

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
              escala={escala}
              capas={visualizationSettings.capas}
            />
          )}

          {/* Overlay info - Empty for now as requested */}

        </div>

        {/* Barra de transporte. Sólo aparece si la simulación tiene más de un
            paso: un estado estacionario no tiene nada que reproducir (#45). */}
        {hayLineaTiempo && (
        <Card className="m-0 rounded-none bg-slate-800 border-t border-slate-600 z-10">
          <CardContent className="p-4">
            <div className="space-y-3">
              {/* Momento de la simulación. Antes decía una fecha fija con zona
                  horaria australiana, que no salía de ningún dato. */}
              <div className="flex items-center justify-center gap-3 text-white">
                <Clock className="h-4 w-4" />
                <span className="text-sm font-medium tabular-nums">{timeline.etiqueta}</span>
                <span className="text-xs text-gray-400">
                  paso {visualizationSettings.timeStep + 1} de {timeline.linea.pasos}
                  {' · '}
                  {timeline.linea.intervalo > 0 && `cada ${Math.round(timeline.linea.intervalo / 60)} min · `}
                  duración {timeline.duracion}
                  {!timeline.linea.conReloj && ' · tiempo transcurrido'}
                </span>
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
                      onValueChange={([value]) => irAPaso(value)}
                      max={timeline.linea.pasos - 1}
                      step={1}
                      className="w-full"
                    />
                  </div>

                  {/* Marcas del eje, repartidas sobre los pasos que hay de
                      verdad. Antes eran 00:00 a 22:00 fijas, al margen de la
                      duración y del paso de reporte del modelo. */}
                  <div className="flex justify-between text-xs text-gray-400 px-1 tabular-nums">
                    {timeline.marcas.map(marca => (
                      <span key={marca.paso}>{marca.texto}</span>
                    ))}
                  </div>
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
        )}
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
            timeline={timeline}
            escala={escala}
          />
        </div>
      </div>
    </div>
  );
};