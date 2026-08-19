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
