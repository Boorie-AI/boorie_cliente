import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { 
  Activity, 
  Droplets, 
  Gauge, 
  Play, 
  Pause, 
  Square,
  BarChart3,
  TrendingUp,
  Settings,
  Eye,
  EyeOff
} from 'lucide-react';

interface VisualizationSettings {
  showPressureMap: boolean;
  showFlowMap: boolean;
  pressureRange: [number, number];
  flowRange: [number, number];
  timeStep: number;
  isPlaying: boolean;
  playbackSpeed: number;
}

interface NetworkData {
  nodes: any[];
  links: any[];
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

interface WNTRAdvancedVisualizerPanelProps {
  networkData: NetworkData | null;
  simulationResults: SimulationResults | null;
  onSettingsChange: (settings: VisualizationSettings) => void;
  coordinates?: {
    lat: number;
    lon: number;
  };
}

export const WNTRAdvancedVisualizerPanel: React.FC<WNTRAdvancedVisualizerPanelProps> = ({
  networkData,
  simulationResults,
  onSettingsChange,
  coordinates
}) => {
  const [settings, setSettings] = useState<VisualizationSettings>({
    showPressureMap: true,
    showFlowMap: false,
    pressureRange: [0, 100],
    flowRange: [0, 10],
    timeStep: 0,
    isPlaying: false,
    playbackSpeed: 1
  });

  // Update settings when simulation results change
  useEffect(() => {
    if (simulationResults?.stats) {
      const pressureStats = simulationResults.stats.pressure;
      const flowStats = simulationResults.stats.flow;
      
      setSettings(prev => ({
        ...prev,
        pressureRange: pressureStats ? [pressureStats.minimum, pressureStats.maximum] : prev.pressureRange,
        flowRange: flowStats ? [flowStats.minimum, flowStats.maximum] : prev.flowRange
      }));
    }
  }, [simulationResults]);

  // Notify parent of settings changes
  useEffect(() => {
    onSettingsChange(settings);
  }, [settings, onSettingsChange]);

  const handleSettingChange = (key: keyof VisualizationSettings, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const togglePlayback = () => {
    handleSettingChange('isPlaying', !settings.isPlaying);
  };

  // Generate pressure color scale
  const generatePressureColors = () => {
    const colors = [
      { value: 0, color: 'rgb(138, 43, 226)' },     // Purple - Low
      { value: 10, color: 'rgb(75, 0, 130)' },      // Indigo
      { value: 20, color: 'rgb(0, 0, 255)' },       // Blue
      { value: 30, color: 'rgb(30, 144, 255)' },    // DodgerBlue
      { value: 40, color: 'rgb(0, 191, 255)' },     // DeepSkyBlue
      { value: 50, color: 'rgb(0, 255, 255)' },     // Cyan
      { value: 60, color: 'rgb(173, 255, 47)' },    // GreenYellow
    ];
    return colors;
  };

  // Generate flow histogram data
  const generateFlowHistogram = () => {
    if (!simulationResults?.link_results) return [];
    
    const flows = Object.values(simulationResults.link_results).map((link: any) => 
      Math.abs(link.flowrate || 0)
    );
    
    // Create histogram bins
    const bins = [
      { range: '0-0.1', count: 0, percentage: 0 },
      { range: '0.1-1', count: 0, percentage: 0 },
      { range: '1-10', count: 0, percentage: 0 },
      { range: '10-100', count: 0, percentage: 0 },
      { range: '100-1000', count: 0, percentage: 0 },
      { range: '1000+', count: 0, percentage: 0 }
    ];

    flows.forEach(flow => {
      if (flow <= 0.1) bins[0].count++;
      else if (flow <= 1) bins[1].count++;
      else if (flow <= 10) bins[2].count++;
      else if (flow <= 100) bins[3].count++;
      else if (flow <= 1000) bins[4].count++;
      else bins[5].count++;
    });

    const total = flows.length;
    bins.forEach(bin => {
      bin.percentage = total > 0 ? (bin.count / total) * 100 : 0;
    });

    return bins;
  };

  const flowHistogram = generateFlowHistogram();
  const pressureColors = generatePressureColors();
  const maxBinPercentage = Math.max(...flowHistogram.map(bin => bin.percentage), 1);

  return (
    <div className="w-80 h-full bg-slate-900 text-white p-4 space-y-4 overflow-y-auto">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-lg font-semibold">
          {networkData ? 'Magnetic Island, AU - Demo' : 'WNTR Visualizer'}
        </h2>
        <div className="text-sm text-gray-400 mt-1">
          Precisión del modelo: {simulationResults ? 'Alta' : 'N/A'}
        </div>
      </div>

      {/* Coordinates Info */}
      {coordinates && (
        <div className="text-xs text-gray-400 text-right">
          <div>Lat: {coordinates.lat.toFixed(5)} Lon: {coordinates.lon.toFixed(5)}</div>
          <div>Unidades: Sistema Internacional</div>
        </div>
      )}

      {/* Pressure Section */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-white text-base flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Gauge className="h-4 w-4" />
              Presiones
            </div>
            <Switch
              checked={settings.showPressureMap}
              onCheckedChange={(checked) => handleSettingChange('showPressureMap', checked)}
            />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* No selection message */}
          <div className="text-sm text-gray-400 text-center">
            No hay puntos de suministro seleccionados
          </div>

          {/* Color Scale */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              {pressureColors.map((color, index) => (
                <div
                  key={index}
                  className="w-6 h-4 flex-1"
                  style={{ backgroundColor: color.color }}
                />
              ))}
            </div>
            <div className="flex justify-between text-xs text-gray-400">
              <span>0</span>
              <span>10</span>
              <span>20</span>
              <span>30</span>
              <span>40</span>
              <span>50</span>
              <span>60</span>
            </div>
          </div>

          {/* Pressure Stats */}
          {simulationResults?.stats?.pressure && (
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-slate-700 p-2 rounded">
                <div className="text-xs text-gray-400">N/A mca</div>
                <div className="text-sm">Mínima</div>
              </div>
              <div className="bg-slate-700 p-2 rounded">
                <div className="text-xs text-gray-400">N/A mca</div>
                <div className="text-sm">Máxima</div>
              </div>
            </div>
          )}

          {/* Toggle for pressure map */}
          <div className="flex items-center justify-between">
            <span className="text-sm">Mostrar capa de presiones en el mapa</span>
            <Switch
              checked={settings.showPressureMap}
              onCheckedChange={(checked) => handleSettingChange('showPressureMap', checked)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Flow Section */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-white text-base flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Droplets className="h-4 w-4" />
              Caudal
            </div>
            <Switch
              checked={settings.showFlowMap}
              onCheckedChange={(checked) => handleSettingChange('showFlowMap', checked)}
            />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Flow info */}
          {simulationResults?.stats?.flow && (
            <div className="text-sm text-gray-400">
              {(simulationResults.stats.flow.total_demand || 0).toFixed(2)} km de red. Unidades en l/s.
            </div>
          )}

          {/* Flow Histogram */}
          <div className="space-y-2">
            <div className="bg-slate-700 p-3 rounded">
              <div className="text-lg font-bold text-white">
                {flowHistogram.length > 1 ? `${flowHistogram[1].percentage.toFixed(1)}%` : '0%'}
              </div>
              <div className="space-y-1 mt-2">
                {flowHistogram.map((bin, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <div 
                      className="h-2 bg-purple-400 rounded"
                      style={{ 
                        width: `${(bin.percentage / maxBinPercentage) * 100}%`,
                        minWidth: bin.percentage > 0 ? '2px' : '0px'
                      }}
                    />
                    <span className="text-xs text-gray-400 w-8">
                      {bin.percentage.toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-xs text-gray-400 mt-2">
                <span>0-0.1</span>
                <span>0.1-1</span>
                <span>1-10</span>
                <span>10-100</span>
                <span>100-1000</span>
                <span>1000+</span>
              </div>
            </div>
          </div>

          {/* Toggle for flow map */}
          <div className="flex items-center justify-between">
            <span className="text-sm">Muestra los caudales en el mapa</span>
            <Switch
              checked={settings.showFlowMap}
              onCheckedChange={(checked) => handleSettingChange('showFlowMap', checked)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Simulation Controls */}
      {simulationResults && (
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-white text-base flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Control Temporal
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Playback Controls */}
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={togglePlayback}
                className="bg-slate-700 border-slate-600 text-white hover:bg-slate-600"
              >
                {settings.isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleSettingChange('isPlaying', false)}
                className="bg-slate-700 border-slate-600 text-white hover:bg-slate-600"
              >
                <Square className="h-4 w-4" />
              </Button>
              <div className="text-sm text-gray-400">
                Paso: {settings.timeStep + 1} / {simulationResults.timestamps?.length || 1}
              </div>
            </div>

            {/* Time Slider */}
            <div className="space-y-2">
              <Slider
                value={[settings.timeStep]}
                onValueChange={([value]) => handleSettingChange('timeStep', value)}
                max={(simulationResults.timestamps?.length || 1) - 1}
                step={1}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-gray-400">
                <span>00:00</span>
                <span>12:00</span>
                <span>24:00</span>
              </div>
            </div>

            {/* Speed Control */}
            <div className="space-y-2">
              <div className="text-sm text-gray-400">Velocidad de reproducción</div>
              <Slider
                value={[settings.playbackSpeed]}
                onValueChange={([value]) => handleSettingChange('playbackSpeed', value)}
                min={0.1}
                max={5}
                step={0.1}
                className="w-full"
              />
              <div className="text-center text-xs text-gray-400">
                {settings.playbackSpeed}x
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Model Info */}
      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="pt-3">
          <div className="space-y-2 text-xs text-gray-400">
            <div className="flex justify-between">
              <span>Nodos:</span>
              <span>{networkData?.nodes?.length || 0}</span>
            </div>
            <div className="flex justify-between">
              <span>Enlaces:</span>
              <span>{networkData?.links?.length || 0}</span>
            </div>
            {simulationResults && (
              <div className="flex justify-between">
                <span>Estado:</span>
                <Badge variant="outline" className="text-green-400 border-green-400">
                  Simulado
                </Badge>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};