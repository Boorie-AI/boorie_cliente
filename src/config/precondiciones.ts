/**
 * Precondiciones de navegación, en un único sitio (issue #33).
 *
 * Antes vivían dispersas como guardas defensivas dentro de cada componente, así
 * que ni el menú ni ninguna otra vista podían saber qué faltaba: el usuario
 * pulsaba «WNTR Network» sin proyecto activo y la aplicación le sustituía la
 * pantalla por la lista de proyectos sin decir por qué.
 */

import type { AppState } from '@/stores/appStore'

export type Vista = AppState['currentView']

/** Lo que puede faltar para usar una vista. */
export type Requisito = 'proyecto' | 'red'

export interface EstadoPrecondiciones {
  hayProyecto: boolean
  hayRed: boolean
}

/**
 * Requisitos de cada vista **para entrar en ella**.
 *
 * El issue pide que la red WNTR exija «proyecto y red cargada». A nivel de
 * navegación sólo se exige el proyecto: la vista de red es justamente donde se
 * carga el .inp, así que pedir una red para entrar dejaría el módulo
 * inalcanzable. La red sigue siendo requisito de las acciones de dentro
 * (simular, analizar, esqueletizar), que ya tienen su propio estado vacío.
 *
 * La calculadora se queda sin requisitos a propósito: es útil de forma autónoma
 * y exigir proyecto añadiría fricción a un uso legítimo (criterio del Ing. Luis
 * Mora recogido en el issue).
 */
export const REQUISITOS_VISTA: Record<Vista, Requisito[]> = {
  chat: [],
  projects: [],
  calculator: [],
  wntr: ['proyecto'],
  rag: [],
  settings: [],
}

/** Requisitos que la vista declara y el estado actual no cumple. */
export function requisitosPendientes(vista: Vista, estado: EstadoPrecondiciones): Requisito[] {
  const cumple: Record<Requisito, boolean> = {
    proyecto: estado.hayProyecto,
    red: estado.hayRed,
  }
  return REQUISITOS_VISTA[vista].filter(r => !cumple[r])
}

export function vistaDisponible(vista: Vista, estado: EstadoPrecondiciones): boolean {
  return requisitosPendientes(vista, estado).length === 0
}

/**
 * Clave i18n que explica qué falta. Se prefiere el requisito más básico: sin
 * proyecto no tiene sentido hablar de la red que le falta.
 */
export function claveMotivo(pendientes: Requisito[]): string | null {
  if (pendientes.includes('proyecto')) return 'precondiciones.faltaProyecto'
  if (pendientes.includes('red')) return 'precondiciones.faltaRed'
  return null
}
