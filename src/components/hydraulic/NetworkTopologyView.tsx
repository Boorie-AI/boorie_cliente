/**
 * Vista topológica de la red (#37).
 *
 * El complemento del mapa, no un visor alternativo: es lo que se puede enseñar
 * cuando la red no se puede situar sobre la ortofoto —sin coordenadas, o con un
 * sistema que nadie ha declarado (#36)—. La conexión entre nudos no depende de
 * dónde esté la red, así que un esquema siempre se puede dibujar.
 */

import { useTranslation } from 'react-i18next'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Info } from 'lucide-react'
import VisNetworkGraph from '@/components/common/VisNetworkGraph'
import { construirGrafo, type DatosRed, type ResultadosSimulacion } from '@/services/network/topologia'

interface NetworkTopologyViewProps {
  networkData?: DatosRed | null
  simulationResults?: ResultadosSimulacion | null
  activeTimeStep?: number
  /** IDs de nudos a destacar (p. ej. los afectados por una interrupción). */
  highlightedNodes?: string[]
  showLabels?: boolean
  /** Escala de color vigente, para pintar la misma magnitud que el mapa. */
  escala?: Parameters<typeof construirGrafo>[3]
  capas?: Parameters<typeof construirGrafo>[4]
}

export function NetworkTopologyView({
  networkData,
  simulationResults,
  activeTimeStep = 0,
  highlightedNodes,
  showLabels = false,
  escala,
  capas,
}: NetworkTopologyViewProps) {
  const { t } = useTranslation()
  const visRef = useRef<{ fit: () => void } | null>(null)
  // El id, no el texto: las cifras del cuadro dependen del paso, y guardar la
  // cadena ya formateada las congelaba en el paso que hubiera al pinchar (#74).
  const [seleccion, setSeleccion] = useState<{ tipo: 'nudo' | 'tramo'; id: string } | null>(null)

  const grafo = useMemo(
    () => construirGrafo(networkData, simulationResults, activeTimeStep, escala, capas),
    [networkData, simulationResults, activeTimeStep, escala, capas]
  )

  const textoSeleccion = useMemo(() => {
    if (!seleccion) return null
    const elementos = seleccion.tipo === 'nudo' ? grafo.nodes : grafo.edges
    return elementos.find(x => x.id === seleccion.id)?.title ?? null
  }, [seleccion, grafo])

  const datosVis = useMemo(() => {
    const destacados = new Set(highlightedNodes ?? [])
    return {
      nodes: grafo.nodes.map(n =>
        destacados.has(n.id)
          ? { ...n, size: n.size * 2, borderWidth: 3, color: { background: n.color, border: '#FACC15' } }
          : n
      ),
      edges: grafo.edges,
    }
  }, [grafo, highlightedNodes])

  const opciones = useMemo(
    () => ({
      // Sin coordenadas hay que dejar que vis reparta los nudos; con ellas, la
      // física los movería y el esquema dejaría de parecerse a la red real.
      physics: grafo.usaFisica
        ? { enabled: true, stabilization: { iterations: 200 }, barnesHut: { springLength: 120 } }
        : { enabled: false },
      layout: { improvedLayout: grafo.nodes.length < 500 },
      nodes: { font: { color: '#94a3b8', size: showLabels ? 12 : 0 } },
      // Con miles de tramos, el suavizado de aristas cuesta mas que todo lo demas
      // junto y deja el lienzo en blanco mientras calcula. Una red de
      // abastecimiento son tramos rectos: no se pierde nada dibujandolos rectos.
      edges: { smooth: grafo.edges.length < 1000 ? { type: 'continuous' as const } : false },
      interaction: { hover: true, tooltipDelay: 200, navigationButtons: true, keyboard: false },
    }),
    [grafo.usaFisica, grafo.nodes.length, grafo.edges.length, showLabels]
  )

  /**
   * Encuadrar es cosa nuestra. vis-network ajusta la vista al terminar de
   * estabilizar, y con las coordenadas del fichero no hay estabilizacion que
   * esperar: la red se dibujaba fuera del encuadre inicial y el lienzo parecia
   * vacio.
   */
  useEffect(() => {
    if (!visRef.current || grafo.nodes.length === 0) return
    const id = setTimeout(() => visRef.current?.fit(), 0)
    return () => clearTimeout(id)
  }, [grafo])

  const eventos = useMemo(
    () => ({
      selectNode: ({ nodes }: { nodes: string[] }) => {
        setSeleccion(nodes[0] ? { tipo: 'nudo', id: nodes[0] } : null)
      },
      selectEdge: ({ edges, nodes }: { edges: string[]; nodes: string[] }) => {
        // vis emite selectEdge tambien al pinchar un nudo: sin esto, el panel
        // enseñaria un tramo cualquiera en lugar del nudo elegido.
        if (nodes.length > 0) return
        setSeleccion(edges[0] ? { tipo: 'tramo', id: edges[0] } : null)
      },
      deselectNode: () => setSeleccion(null),
    }),
    []
  )

  if (grafo.nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-muted/20">
        <p className="text-sm text-muted-foreground">{t('viewer.noNodes')}</p>
      </div>
    )
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-background">
      {/* `absolute inset-0`, no `h-full`: vis-network dimensiona su lienzo a partir
          del alto del contenedor, y si ese alto lo marca el contenido se
          realimentan. Con una red grande el lienzo crecía hasta decenas de miles
          de píxeles y no se veía nada. */}
      <div className="absolute inset-0">
        <VisNetworkGraph
          graph={datosVis}
          options={opciones}
          events={eventos}
          getNetwork={(red) => { visRef.current = red as unknown as { fit: () => void } }}
          style={{ width: '100%', height: '100%' }}
        />
      </div>

      <div className="pointer-events-none absolute left-3 top-3 flex items-start gap-2 rounded-md border border-border bg-background/90 px-3 py-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>{grafo.motivo}</span>
      </div>

      {textoSeleccion && (
        <div className="absolute right-3 top-3 max-w-xs whitespace-pre-line rounded-md border border-border bg-background/95 px-3 py-2 text-xs">
          {textoSeleccion}
        </div>
      )}
    </div>
  )
}
