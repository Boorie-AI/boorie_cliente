import { useProjectStore } from '@/stores/projectStore'
import {
  requisitosPendientes,
  vistaDisponible,
  claveMotivo,
  type EstadoPrecondiciones,
  type Vista,
} from '@/config/precondiciones'

/**
 * Estado que consultan las precondiciones de navegación (issue #33).
 *
 * `hayProyecto` sale de `currentProjectId`, que es lo único que el store
 * persiste y lo que ya usa la vista de red para saber dónde está.
 *
 * `hayRed` cuenta las redes **guardadas** en el proyecto, no la que el visor
 * tenga abierta: esa vive en el estado local de WNTRMainInterface y el menú no
 * puede verla. Ninguna vista se bloquea por este requisito —la de red es
 * justamente donde se importa el .inp—, pero sí el ítem «Simulaciones» del menú
 * (#35), que es lo que destapó que `hydraulic:get-project` no devolvía el
 * contador y lo dejaba siempre en 0.
 */
export function usePrecondiciones() {
  const currentProjectId = useProjectStore(s => s.currentProjectId)
  const networkCount = useProjectStore(s => s.currentProject?.networkCount)

  const estado: EstadoPrecondiciones = {
    hayProyecto: currentProjectId !== null,
    hayRed: (networkCount ?? 0) > 0,
  }

  return {
    estado,
    disponible: (vista: Vista) => vistaDisponible(vista, estado),
    pendientes: (vista: Vista) => requisitosPendientes(vista, estado),
    motivo: (vista: Vista) => claveMotivo(requisitosPendientes(vista, estado)),
  }
}
