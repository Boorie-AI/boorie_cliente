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

// Custom plugin to draw vertical line at current time step
const verticalLinePlugin = {
  id: 'verticalLine',
  afterDraw: (chart: any, args: any, options: any) => {
    if (typeof options.index !== 'number') return;
    const { ctx, chartArea: { top, bottom }, scales: { x } } = chart;
    const xPos = x.getPixelForValue(options.index);

    if (xPos) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(xPos, top);
      ctx.lineTo(xPos, bottom);
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.stroke();
      ctx.restore();
    }
  }
};

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  verticalLinePlugin
);

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
                className="relative overflow-hidden bg-slate-700 border-slate-600 text-white hover:bg-slate-600"
              >
                {/* Progress Bar Background */}
                <div
                  className="absolute left-0 top-0 bottom-0 bg-blue-500/30 transition-all duration-300 ease-in-out"
                  style={{
                    width: `${((settings.timeStep) / ((simulationResults.timestamps?.length || 1) - 1)) * 100}%`
                  }}
                />

                <span className="relative z-10 flex items-center">
                  {settings.isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </span>
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
      {/* Charts Section - Moved here as per request */}
      {simulationResults && simulationResults.node_results && (
        <div className="space-y-4 pt-4 border-t border-slate-700">

          {/* Demand Curve */}
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-white text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-400" />
                Curva de Demanda
              </CardTitle>
            </CardHeader>
            <CardContent className="h-40">
              <Line
                data={{
                  labels: simulationResults.timestamps.map((t: number) => {
                    const hours = Math.floor(t);
                    return `${hours}:00`;
                  }),
                  datasets: [
                    {
                      label: 'Demanda Total (L/s)',
                      data: simulationResults.timestamps.map((_, i) => {
                        let sum = 0;
                        if (simulationResults.node_results) {
                          Object.values(simulationResults.node_results).forEach((node: any) => {
                            if (node.demand && node.demand[i]) sum += node.demand[i];
                          });
                        }
                        return sum;
                      }),
                      borderColor: 'rgb(59, 130, 246)',
                      backgroundColor: 'rgba(59, 130, 246, 0.5)',
                      borderWidth: 2,
                      pointRadius: 0,
                      tension: 0.4
                    }
                  ]
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  animation: { duration: 0 },
                  plugins: {
                    legend: { display: false },
                    // @ts-ignore - Custom plugin options
                    verticalLine: { index: settings.timeStep }
                  },
                  scales: {
                    x: { display: true, ticks: { maxTicksLimit: 6, color: '#888' }, grid: { display: false } },
                    y: { display: true, ticks: { color: '#888' }, grid: { color: 'rgba(255,255,255,0.05)' } }
                  }
                }}
              />
            </CardContent>
          </Card>

          {/* Pumps Flow Chart */}
          {networkData?.links?.some((l: any) => l.type?.toLowerCase() === 'pump') && (
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-white text-sm flex items-center gap-2">
                  <Activity className="h-4 w-4 text-blue-400" />
                  Caudal de Bombas
                </CardTitle>
              </CardHeader>
              <CardContent className="h-40">
                <Line
                  data={{
                    labels: simulationResults.timestamps.map((t: number) => {
                      const hours = Math.floor(t);
                      return `${hours}:00`;
                    }),
                    datasets: networkData.links
                      .filter((l: any) => l.type?.toLowerCase() === 'pump')
                      .map((pump: any, idx: number) => ({
                        label: pump.id,
                        data: simulationResults.link_results[pump.id]?.flowrate || [],
                        borderColor: `hsl(${(idx + 2) * 137.5 % 360}, 70%, 50%)`,
                        backgroundColor: 'transparent',
                        borderWidth: 2,
                        pointRadius: 0,
                        tension: 0.1,
                        borderDash: [5, 5]
                      }))
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: { duration: 0 },
                    plugins: {
                      legend: { position: 'top', labels: { boxWidth: 8, font: { size: 10 }, color: '#aaa' } },
                      // @ts-ignore - Custom plugin options
                      verticalLine: { index: settings.timeStep }
                    },
                    scales: {
                      x: { display: true, ticks: { maxTicksLimit: 6, color: '#888' }, grid: { display: false } },
                      y: { display: true, ticks: { color: '#888' }, grid: { color: 'rgba(255,255,255,0.05)' } }
                    }
                  }}
                />
              </CardContent>
              {/* Pump Status List */}
              <div className="px-4 pb-4 border-t border-slate-700 pt-3">
                <div className="text-xs font-semibold text-gray-400 mb-2">Estado Actual (Paso {settings.timeStep})</div>
                <div className="space-y-2">
                  {networkData.links
                    .filter((l: any) => l.type?.toLowerCase() === 'pump')
                    .map((pump: any) => {
                      const flow = simulationResults.link_results[pump.id]?.flowrate?.[settings.timeStep] || 0;
                      // Assume ON if flow > 0.001
                      const isOn = Math.abs(flow) > 0.001;

                      return (
                        <div key={pump.id} className="flex items-center justify-between text-xs">
                          <span className="text-gray-300 font-medium">{pump.id}</span>
                          <div className="flex items-center gap-3">

                            <Badge variant="outline" className={`${isOn ? 'text-green-400 border-green-400 bg-green-400/10' : 'text-red-400 border-red-400 bg-red-400/10'}`}>
                              {isOn ? 'ON' : 'OFF'}
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};