/**
 * Modelo de navegación, en un único sitio (issue #35).
 *
 * El menú era una lista plana de seis elementos declarada dentro del propio
 * componente, así que no había forma de saber qué pertenecía al proyecto y qué
 * era global: «Chat» y «Red WNTR» estaban al mismo nivel que «Configuración».
 * Aquí viven los tres bloques —proyecto, herramientas y sistema— y sus
 * requisitos, para que el menú los pinte y las pruebas los puedan leer sin
 * montar la interfaz.
 */

import type { Vista, Requisito, EstadoPrecondiciones } from './precondiciones'
import { REQUISITOS_VISTA, pendientesDe } from './precondiciones'

/** Pestaña de la vista de red a la que puede apuntar un ítem del menú. */
export type SeccionRed = 'simulate' | 'analyze' | 'resilience' | 'layers'

/**
 * Con qué conversaciones trabaja el chat. No es una vista distinta: es la misma
 * pantalla mirando a las conversaciones del proyecto activo o a las que no
 * tienen proyecto. Los dos chats deben existir (criterio del Ing. Luis Mora
 * recogido en el issue): el general para uso docente, el del proyecto para
 * interpretar la red y sus resultados.
 */
export type AmbitoChat = 'proyecto' | 'general'

export type Bloque = 'proyectos' | 'herramientas' | 'sistema'

export interface ItemNavegacion {
  id: string
  bloque: Bloque
  vista: Vista
  /** Clave i18n de la etiqueta visible. */
  etiqueta: string
  /** Cuelga del proyecto activo: sólo se pinta cuando hay uno. */
  hijoDelProyecto?: boolean
  /**
   * Requisitos propios, cuando el ítem pide más que la vista a la que lleva.
   * Sin esto, «Simulaciones» heredaría los requisitos de la vista de red, que
   * a propósito no exige red cargada porque es donde se importa el .inp.
   */
  requisitos?: Requisito[]
  seccion?: SeccionRed
  ambitoChat?: AmbitoChat
}

export const NAVEGACION: ItemNavegacion[] = [
  { id: 'projects', bloque: 'proyectos', vista: 'projects', etiqueta: 'sidebar.projects' },
  {
    id: 'red',
    bloque: 'proyectos',
    vista: 'wntr',
    etiqueta: 'sidebar.wntr',
    hijoDelProyecto: true,
  },
  {
    id: 'simulaciones',
    bloque: 'proyectos',
    vista: 'wntr',
    etiqueta: 'sidebar.simulaciones',
    hijoDelProyecto: true,
    seccion: 'simulate',
    requisitos: ['proyecto', 'red'],
  },
  {
    id: 'chatProyecto',
    bloque: 'proyectos',
    vista: 'chat',
    etiqueta: 'sidebar.chatProyecto',
    hijoDelProyecto: true,
    ambitoChat: 'proyecto',
    requisitos: ['proyecto'],
  },

  { id: 'calculator', bloque: 'herramientas', vista: 'calculator', etiqueta: 'sidebar.calculator' },
  {
    id: 'chatGeneral',
    bloque: 'herramientas',
    vista: 'chat',
    etiqueta: 'sidebar.chatGeneral',
    ambitoChat: 'general',
  },

  { id: 'wisdom', bloque: 'sistema', vista: 'wisdom', etiqueta: 'sidebar.wisdom' },
  { id: 'settings', bloque: 'sistema', vista: 'settings', etiqueta: 'sidebar.settings' },
]

export const BLOQUES: { id: Bloque; titulo: string }[] = [
  { id: 'proyectos', titulo: 'sidebar.bloqueProyectos' },
  { id: 'herramientas', titulo: 'sidebar.bloqueHerramientas' },
  { id: 'sistema', titulo: 'sidebar.bloqueSistema' },
]

export function itemsDelBloque(bloque: Bloque): ItemNavegacion[] {
  return NAVEGACION.filter(item => item.bloque === bloque)
}

export function requisitosItem(item: ItemNavegacion): Requisito[] {
  return item.requisitos ?? REQUISITOS_VISTA[item.vista]
}

/** Lo que le falta a este ítem para estar disponible. */
export function pendientesItem(item: ItemNavegacion, estado: EstadoPrecondiciones): Requisito[] {
  return pendientesDe(requisitosItem(item), estado)
}

export interface UbicacionActual {
  vista: Vista
  ambitoChat: AmbitoChat
  seccionRed: SeccionRed | null
}

/**
 * Qué ítem se marca como activo. Tres ítems comparten vista con otro —los dos
 * chats, y «Red hidráulica» con «Simulaciones»—, así que comparar sólo la vista
 * encendería dos a la vez.
 */
export function itemActivo(item: ItemNavegacion, donde: UbicacionActual): boolean {
  if (item.vista !== donde.vista) return false
  if (item.vista === 'chat') return (item.ambitoChat ?? 'general') === donde.ambitoChat
  if (item.vista === 'wntr') return (item.seccion ?? null) === donde.seccionRed
  return true
}
