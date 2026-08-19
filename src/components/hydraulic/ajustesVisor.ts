/**
 * Ajustes del visor canónico (#37).
 *
 * Un único objeto con un único dueño —`WNTRAdvancedMapViewer`— del que beben el
 * mapa, el esquema y el panel. Antes estaban repartidos: el estilo base, la
 * opacidad y los tamaños vivían en un diálogo dentro del mapa, y la simbología
 * en un estado propio del panel lateral que no llegaba al mapa.
 */

import type { MapSettings } from './WNTRMapViewer'

export type VistaVisor = 'mapa' | 'topologia'

export interface AjustesVisor extends MapSettings {
  vista: VistaVisor
  timeStep: number
  isPlaying: boolean
  playbackSpeed: number
}

/**
 * Claves que son del mapa. Al mapa se le entrega sólo este trozo, y sólo este
 * trozo se acepta de vuelta: si se le pasara el objeto entero, al corregirse a sí
 * mismo —el estilo satélite cayendo a calles— devolvería también `vista` y
 * `timeStep` con el valor que tuviera capturado, pisando lo que el usuario
 * acabara de elegir en el panel.
 */
export function soloAjustesDelMapa(ajustes: AjustesVisor): MapSettings {
  return {
    baseMap: ajustes.baseMap,
    showLabels: ajustes.showLabels,
    opacity: ajustes.opacity,
    nodeSize: ajustes.nodeSize,
    linkWidth: ajustes.linkWidth,
    simbologia: ajustes.simbologia,
  }
}

export const AJUSTES_INICIALES: AjustesVisor = {
  vista: 'mapa',
  baseMap: 'streets',
  showLabels: false,
  opacity: 0.9,
  nodeSize: 8,
  linkWidth: 2,
  simbologia: 'presion',
  timeStep: 0,
  isPlaying: false,
  playbackSpeed: 1,
}
