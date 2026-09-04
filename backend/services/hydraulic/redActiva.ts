/**
 * Lectura de la red activa de un proyecto.
 *
 * La necesitan dos sitios: `network-repo:context`, para el resumen que va en el
 * prompt, y `chat:send-message`, para responder a las herramientas del agente.
 * Vive aqui para que no acaben con dos consultas parecidas que se separen con
 * el tiempo y hagan que el resumen y las herramientas hablen de redes distintas.
 */

import type { PrismaClient } from '@prisma/client'
import type { ContadoresRed } from './networkContext'
import type { NodoRed, TramoRed } from './agentTools'

/**
 * `HydraulicNetwork.networkData` ya parseado. Es a la vez lo que consume el
 * resumen (`DatosRed`) y lo que consumen las herramientas (`RedCompleta`): se
 * describe una sola vez y ambos encajan estructuralmente.
 */
export interface DatosRedGuardados {
  nodes?: NodoRed[]
  links?: TramoRed[]
  coordinate_system?: { type?: string; units?: string; epsg?: number | null }
}

export interface RedActiva {
  id: string
  nombre: string
  /** `HydraulicNetwork.summary` ya parseado. */
  contadores: ContadoresRed
  datos: DatosRedGuardados
  /**
   * El `.inp` tal cual, que es lo que comen los motores de WNTR (#119).
   *
   * Sale de aqui y no del `global.currentWNTRFile` que usan los paneles: ese
   * fichero lo pone el visor al abrir una red, asi que puede no existir —el
   * chat responde sin que nadie haya abierto el visor— o, peor, ser **otra
   * red** distinta de la activa del proyecto. El agente responde sobre la red
   * de la que habla su propio resumen, o no responde.
   */
  inp: string
}

export async function leerRedActiva(
  prisma: PrismaClient,
  projectId?: string | null
): Promise<RedActiva | null> {
  if (!projectId) return null

  const red = await prisma.hydraulicNetwork.findFirst({
    where: { projectId, isActive: true },
    orderBy: { updatedAt: 'desc' },
  })
  if (!red) return null

  return {
    id: red.id,
    nombre: red.name,
    contadores: JSON.parse(red.summary || '{}'),
    datos: JSON.parse(red.networkData || '{}'),
    inp: red.fileContent || '',
  }
}
