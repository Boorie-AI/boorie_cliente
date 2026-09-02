/**
 * Visibilidad de la red por tipo de elemento (#37, rescate).
 *
 * La ofrecía `WNTRNetworkVisualization`, uno de los visores que se retiraron por
 * muertos, y se fue con él sin que nadie la portara: la auditoría clasificó los
 * componentes pero no inventarió sus capacidades una por una antes de borrar.
 * Con una red de miles de nudos es lo que permite mirar sólo las bombas, o el
 * trazado sin la nube de acometidas.
 *
 * Módulo puro: sabe de tipos de elemento, no de mapas ni de grafos.
 */

import type { DatosRed, NodoRed, TramoRed } from './topologia'

export type TipoNudo = 'junction' | 'tank' | 'reservoir'
export type TipoTramo = 'pipe' | 'pump' | 'valve'
export type TipoElemento = TipoNudo | TipoTramo

export type CapasVisibles = Record<TipoElemento, boolean>

export const CAPAS_TODAS: CapasVisibles = {
  junction: true,
  tank: true,
  reservoir: true,
  pipe: true,
  pump: true,
  valve: true,
}

export const CAPAS: Array<{ tipo: TipoElemento; de: 'nudos' | 'tramos' }> = [
  { tipo: 'junction', de: 'nudos' },
  { tipo: 'tank', de: 'nudos' },
  { tipo: 'reservoir', de: 'nudos' },
  { tipo: 'pipe', de: 'tramos' },
  { tipo: 'pump', de: 'tramos' },
  { tipo: 'valve', de: 'tramos' },
]

/**
 * Tipo normalizado de un elemento. Los `.inp` y los distintos servicios de WNTR
 * no coinciden en mayúsculas —`Pipe`, `pipe`, `PIPE`—, y un tipo que no se
 * reconoce se trata como el común de su familia en lugar de desaparecer: un
 * elemento invisible por no saber clasificarlo sería peor que uno mal agrupado.
 */
export function tipoNudo(n: NodoRed): TipoNudo {
  const t = String(n.type ?? '').toLowerCase()
  return t === 'tank' || t === 'reservoir' ? t : 'junction'
}

export function tipoTramo(l: TramoRed): TipoTramo {
  const t = String(l.type ?? '').toLowerCase()
  return t === 'pump' || t === 'valve' ? t : 'pipe'
}

export function nudoVisible(n: NodoRed, capas: CapasVisibles): boolean {
  return capas[tipoNudo(n)]
}

export function tramoVisible(l: TramoRed, capas: CapasVisibles): boolean {
  return capas[tipoTramo(l)]
}

/** Cuántos elementos hay de cada tipo, para que los interruptores digan algo. */
export function contarPorTipo(datos: DatosRed | null | undefined): Record<TipoElemento, number> {
  const cuenta: Record<TipoElemento, number> = {
    junction: 0, tank: 0, reservoir: 0, pipe: 0, pump: 0, valve: 0,
  }
  if (!datos) return cuenta

  for (const n of datos.nodes) cuenta[tipoNudo(n)]++
  for (const l of datos.links) cuenta[tipoTramo(l)]++
  return cuenta
}

/** `true` si algo está oculto, para poder avisar de que no se está viendo todo. */
export function hayCapasOcultas(capas: CapasVisibles): boolean {
  return CAPAS.some(c => !capas[c.tipo])
}
