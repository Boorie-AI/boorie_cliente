import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/utils/cn';
import type { AjustesVisor, VistaVisor } from './ajustesVisor';
import { comprobarSoporteSatelite } from '@/utils/webgl';
import { etiquetaCorta, type Timeline } from '@/hooks/useSimulationTimeline';
import { ETIQUETAS_SIMBOLOGIA, type Escala } from '@/services/network/simbologia';
import { CAPAS, CAPAS_TODAS, contarPorTipo, hayCapasOcultas } from '@/services/network/capas';
import { enUnidadDePresentacion, formatearMagnitud, unidadDe } from '@/services/network/unidades';

// Función pura del entorno, no estado: se resuelve una vez al cargar el módulo.
const SOPORTE_SATELITE = comprobarSoporteSatelite();
import {
  Activity,
  Gauge,
  Layers,
  Map as MapIcon,
  Palette,
  Share2,
  TrendingUp
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
  afterDraw: (chart: any, _args: any, options: any) => {
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
  /**
   * Panel controlado: los ajustes son del armazón. Cuando tenía estado propio,
   * sus interruptores no llegaban al mapa y quedaban como controles inertes (#37).
   */
  ajustes: AjustesVisor;
  onCambio: (ajustes: AjustesVisor) => void;
  /** `false` cuando la red no se puede situar en el mapa: el esquema es la única vista posible. */
  mapaDisponible?: boolean;
  /**
   * Eje temporal de la simulación. Lo construye el armazón y se comparte: las
   * gráficas rotulaban sus etiquetas tratando los segundos de WNTR como horas,
   * así que un modelo de 24 h salía con marcas de «86400:00» (#45).
   */
  timeline: Timeline;
  /** Escala vigente; su leyenda sale de los datos, no de umbrales escritos a mano. */
  escala: Escala | null;
}

export const WNTRAdvancedVisualizerPanel: React.FC<WNTRAdvancedVisualizerPanelProps> = ({
  networkData,
  simulationResults,
  ajustes,
  onCambio,
  mapaDisponible = true,
  timeline,
  escala
}) => {
  const settings = ajustes;
  const cuentas = React.useMemo(() => contarPorTipo(networkData), [networkData]);

  const handleSettingChange = <K extends keyof AjustesVisor>(key: K, value: AjustesVisor[K]) => {
    onCambio({ ...ajustes, [key]: value });
  };


  return (
    <div className="w-80 h-full bg-slate-900 text-white p-4 space-y-4 overflow-y-auto">


      {/* Vista: mapa o esquema. La red sin sistema de coordenadas declarado no se
          puede situar sobre la ortofoto (#36), pero su esquema siempre se puede
          dibujar: por eso el esquema no es un visor aparte, es la otra vista de
          este (#37). */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-white text-base flex items-center gap-2">
            <Layers className="h-4 w-4" />
            Vista
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            {([
              { valor: 'mapa' as VistaVisor, etiqueta: 'Mapa', icono: <MapIcon className="h-3.5 w-3.5" /> },
              { valor: 'topologia' as VistaVisor, etiqueta: 'Esquema', icono: <Share2 className="h-3.5 w-3.5" /> },
            ]).map(op => (
              <Button
                key={op.valor}
                size="sm"
                variant="outline"
                disabled={op.valor === 'mapa' && !mapaDisponible}
                onClick={() => handleSettingChange('vista', op.valor)}
                className={cn(
                  'flex items-center gap-2 border-slate-600 bg-slate-700 text-white hover:bg-slate-600',
                  settings.vista === op.valor && 'border-blue-500 bg-blue-600 hover:bg-blue-600'
                )}
              >
                {op.icono}
                {op.etiqueta}
              </Button>
            ))}
          </div>
          {!mapaDisponible && (
            <p className="text-xs text-yellow-400">
              Esta red no se puede situar en el mapa hasta que declares su sistema de coordenadas.
              El esquema sí muestra su trazado.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Ajustes del dibujo. Vivían en un diálogo dentro del propio mapa, que
          competía con este panel; ahora hay un solo sitio donde tocarlos. */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-white text-base flex items-center gap-2">
            <Palette className="h-4 w-4" />
            Dibujo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {settings.vista === 'mapa' && (
            <div className="space-y-2">
              <div className="text-sm text-gray-400">Mapa base</div>
              <select
                value={settings.baseMap}
                onChange={e => handleSettingChange('baseMap', e.target.value as AjustesVisor['baseMap'])}
                // En Chromium, un <select> con el foco cambia de opción al girar
                // la rueda: quien creía estar haciendo zoom se encontraba con
                // otro mapa base, y con «Satélite» si giraba lo suficiente.
                onWheel={e => e.currentTarget.blur()}
                className="w-full rounded-md border border-slate-600 bg-slate-700 px-2 py-1.5 text-sm text-white"
              >
                <option value="streets">Calles</option>
                <option value="outdoors">Terreno</option>
                <option value="light">Claro</option>
                <option value="dark">Oscuro</option>
                {/* Deshabilitada, no escondida: si el equipo no puede con las
                    teselas satelitales, es mejor que se vea que existe y por qué
                    no está, que no ofrecerla y que parezca que Boorie no la tiene. */}
                <option value="satellite" disabled={!SOPORTE_SATELITE.disponible}>
                  Satélite{SOPORTE_SATELITE.disponible ? '' : ' (no disponible en este equipo)'}
                </option>
              </select>
              {!SOPORTE_SATELITE.disponible && (
                <p className="text-xs text-gray-500">{SOPORTE_SATELITE.motivo}</p>
              )}
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-sm">Etiquetas de los nudos</span>
            <Switch
              checked={settings.showLabels}
              onCheckedChange={checked => handleSettingChange('showLabels', checked)}
            />
          </div>

          {settings.vista === 'mapa' && (
            <div className="space-y-2">
              <div className="text-sm text-gray-400">Opacidad: {settings.opacity.toFixed(1)}</div>
              <Slider
                value={[settings.opacity]}
                onValueChange={([v]) => handleSettingChange('opacity', v)}
                min={0.1}
                max={1}
                step={0.1}
              />
            </div>
          )}

          <div className="space-y-2">
            <div className="text-sm text-gray-400">Tamaño de nudo: {settings.nodeSize}</div>
            <Slider
              value={[settings.nodeSize]}
              onValueChange={([v]) => handleSettingChange('nodeSize', v)}
              min={2}
              max={20}
              step={1}
            />
          </div>

          {settings.vista === 'mapa' && (
            <div className="space-y-2">
              <div className="text-sm text-gray-400">Grosor de tramo: {settings.linkWidth}</div>
              <Slider
                value={[settings.linkWidth]}
                onValueChange={([v]) => handleSettingChange('linkWidth', v)}
                min={1}
                max={10}
                step={1}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Capas. La ofrecía uno de los visores que retiró el #37 y se fue con él
          sin que nadie la portara; con miles de nudos es lo que permite mirar
          sólo las bombas, o el trazado sin la nube de acometidas. */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-white text-base flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Capas
            </div>
            {hayCapasOcultas(settings.capas) && (
              <Button
                size="sm"
                variant="ghost"
                className="h-auto px-2 py-0.5 text-xs text-blue-400 hover:text-blue-300"
                onClick={() => handleSettingChange('capas', CAPAS_TODAS)}
              >
                Ver todo
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {CAPAS.map(capa => (
            <div key={capa.tipo} className="flex items-center justify-between">
              <span
                className={cn(
                  'text-sm',
                  cuentas[capa.tipo] === 0 && 'text-gray-500'
                )}
              >
                {capa.etiqueta}
                <span className="ml-2 text-xs text-gray-500">{cuentas[capa.tipo]}</span>
              </span>
              <Switch
                // Un tipo que la red no tiene se deshabilita en vez de esconderse:
                // así se ve que existe y que esta red no lo usa.
                disabled={cuentas[capa.tipo] === 0}
                checked={settings.capas[capa.tipo]}
                onCheckedChange={checked =>
                  handleSettingChange('capas', { ...settings.capas, [capa.tipo]: checked })
                }
              />
            </div>
          ))}

          {hayCapasOcultas(settings.capas) && (
            <p className="pt-1 text-[11px] text-yellow-500/90">
              No estás viendo la red completa.
              {settings.vista === 'topologia' &&
                ' En el esquema, ocultar un tipo de nudo se lleva también los tramos que lo tocan: un tramo necesita sus dos extremos para dibujarse.'}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Simbología. Sustituye a los dos interruptores de «mapa de presiones»
          que cambiaban un estado que nadie leía: la red se coloreaba por presión
          estuvieran encendidos o apagados. */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-white text-base flex items-center gap-2">
            <Gauge className="h-4 w-4" />
            Simbología
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!simulationResults ? (
            <p className="text-sm text-gray-400">
              Sin resultados de simulación no hay nada que representar: la red se dibuja por tipo
              de elemento.
            </p>
          ) : (
            <>
              <div className="space-y-1">
                {ETIQUETAS_SIMBOLOGIA.map(op => (
                  <button
                    key={op.valor}
                    onClick={() => handleSettingChange('simbologia', op.valor)}
                    className={cn(
                      'w-full rounded-md px-3 py-1.5 text-left text-sm transition-colors',
                      settings.simbologia === op.valor
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                    )}
                  >
                    {op.texto}
                  </button>
                ))}
              </div>

              {/* La leyenda declara los tramos que hay en esta red y en este
                  paso. Los visores retirados los tenían escritos a mano —caudal
                  0-200 l/s, velocidad 0-2 m/s—, así que mentían en cuanto la red
                  se salía de ese rango. */}
              {escala && (
                <div className="space-y-1 text-xs text-gray-400">
                  {escala.leyenda.map(tramo => (
                    <div key={tramo.etiqueta} className="flex items-center gap-2">
                      <span
                        className="inline-block h-2 w-4 shrink-0 rounded"
                        style={{ background: tramo.color }}
                      />
                      {tramo.etiqueta}
                    </div>
                  ))}
                  <p className="pt-1 text-[11px] text-gray-500">
                    {escala.absoluta
                      ? 'Cortes de servicio, iguales en cualquier red.'
                      : `Escala de esta red en este paso: ${formatearMagnitud(escala.min, escala.magnitud, 3)} a ${formatearMagnitud(escala.max, escala.magnitud, 3)}.`}
                  </p>
                </div>
              )}

              {settings.simbologia !== 'ninguna' && !escala && (
                <p className="text-xs text-gray-400">
                  La simulación no trae esa magnitud, así que la red se dibuja por tipo de elemento.
                </p>
              )}
            </>
          )}
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
            {/* Tuberías, no «enlaces»: el rótulo es de teoría de grafos y quien
                lee esto proyecta redes. Y si dice tuberías, cuenta tuberías —el
                total de tramos incluía bombas y válvulas—; el desglose completo
                está arriba, en las capas. */}
            <div className="flex justify-between">
              <span>Tuberías:</span>
              <span>{cuentas.pipe}</span>
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
                  labels: timeline.linea.segundos.map((_, i) =>
                    etiquetaCorta(timeline.linea, i)
                  ),
                  datasets: [
                    {
                      label: `Demanda Total (${unidadDe('demanda')})`,
                      // La suma sale en m³/s, que es como la da el motor; la
                      // etiqueta prometía l/s sobre ese valor sin convertir (#77).
                      data: simulationResults.timestamps.map((_, i) => {
                        let sum = 0;
                        if (simulationResults.node_results) {
                          Object.values(simulationResults.node_results).forEach((node: any) => {
                            if (node.demand && node.demand[i]) sum += node.demand[i];
                          });
                        }
                        return enUnidadDePresentacion(sum, 'demanda');
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
                    // @ts-expect-error Custom plugin options
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
                    labels: timeline.linea.segundos.map((_, i) =>
                      etiquetaCorta(timeline.linea, i)
                    ),
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
                      // @ts-expect-error Custom plugin options
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
                <div className="text-xs font-semibold text-gray-400 mb-2">
                  Estado en {timeline.etiqueta}
                </div>
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