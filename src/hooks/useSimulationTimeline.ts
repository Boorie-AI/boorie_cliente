/**
 * Eje temporal y reproducción de una simulación (#45).
 *
 * Un único sitio donde vive el tiempo: la barra de transporte, el panel y sus
 * gráficas leen de aquí. El issue pedía extraer este hook porque la lógica
 * temporal estaba repetida en cinco componentes; con el #37 tres de ellos ya
 * desaparecieron —eran visores muertos—, así que quedan la barra y el panel.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  construirLineaTiempo,
  duracionTotal,
  etiquetaCorta,
  etiquetaPaso,
  marcasEje,
  type LineaTiempo,
  type OpcionesTiempo,
} from '@/services/network/lineaTiempo'

/** Milisegundos de reloj real por paso de reporte a velocidad 1x. */
const MS_POR_PASO = 1000

interface Parametros {
  timestamps?: number[] | null
  opcionesTiempo?: OpcionesTiempo | null
  paso: number
  reproduciendo: boolean
  velocidad: number
  onPaso: (paso: number) => void
}

export interface Timeline {
  linea: LineaTiempo
  /** Etiqueta completa del paso actual. */
  etiqueta: string
  /** Duración total de la simulación, en formato HH:MM:SS. */
  duracion: string
  marcas: Array<{ paso: number; texto: string }>
  etiquetaDe: (paso: number) => string
}

export function useSimulationTimeline({
  timestamps,
  opcionesTiempo,
  paso,
  reproduciendo,
  velocidad,
  onPaso,
}: Parametros): Timeline {
  const linea = useMemo(
    () => construirLineaTiempo(timestamps, opcionesTiempo),
    [timestamps, opcionesTiempo]
  )

  const pasoRef = useRef(paso)
  useEffect(() => { pasoRef.current = paso }, [paso])

  /**
   * Último paso que emitió la reproducción. Sirve para distinguir un avance
   * propio de un salto del usuario: si el paso vigente no es el que emitimos, es
   * que alguien ha arrastrado la barra y hay que recolocar el origen del reloj.
   */
  const emitidoRef = useRef(paso)

  useEffect(() => {
    if (!reproduciendo || linea.estacionaria) return

    let animacion = 0
    let origen = performance.now()
    let pasoOrigen = pasoRef.current

    /**
     * El avance se calcula con el reloj real, no sumando uno por tick. Con un
     * `setInterval` fijo —lo que había— cada repintado lento se comía tiempo y la
     * reproducción se retrasaba de forma acumulativa: la velocidad dependía de lo
     * cargada que estuviera la red, no de lo que pidiera el usuario.
     */
    const avanzar = (ahora: number) => {
      if (pasoRef.current !== emitidoRef.current) {
        origen = ahora
        pasoOrigen = pasoRef.current
      }

      const transcurridos = Math.floor(((ahora - origen) * velocidad) / MS_POR_PASO)
      const siguiente = (pasoOrigen + transcurridos) % linea.pasos

      if (siguiente !== pasoRef.current) {
        emitidoRef.current = siguiente
        onPaso(siguiente)
      }

      animacion = requestAnimationFrame(avanzar)
    }

    animacion = requestAnimationFrame(avanzar)
    return () => cancelAnimationFrame(animacion)
  }, [reproduciendo, velocidad, linea.pasos, linea.estacionaria, onPaso])

  const etiquetaDe = useCallback(
    (n: number) => etiquetaPaso(linea, n, opcionesTiempo),
    [linea, opcionesTiempo]
  )

  return {
    linea,
    etiqueta: etiquetaDe(paso),
    duracion: duracionTotal(linea),
    marcas: useMemo(() => marcasEje(linea, 9, opcionesTiempo), [linea, opcionesTiempo]),
    etiquetaDe,
  }
}

export { etiquetaCorta }
