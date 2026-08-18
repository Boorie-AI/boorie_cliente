import { logger } from '@/utils/logger'

/**
 * Migración del overlay heredado de localStorage a la base de datos (#31).
 *
 * Hasta la v1.5.1 las redes y los cálculos de cada proyecto vivían en la clave
 * `wntr_project_assets` del navegador, no en las tablas HydraulicNetwork y
 * HydraulicCalculation. Este módulo los vuelca una sola vez.
 *
 * Tres reglas que no se negocian, porque aquí un error se ve como «he perdido mis
 * redes»:
 *
 * 1. **La clave original no se borra nunca.** El control de si ya se migró vive en
 *    una clave marcadora aparte. Si algo sale mal, los datos siguen donde estaban.
 * 2. **Una red sin su .inp no se descarta.** El overlay guarda la ruta del fichero,
 *    no su contenido; si el usuario lo movió o lo borró, la red se guarda con sus
 *    datos parseados y queda marcada como incompleta: se ve en el mapa pero no se
 *    puede simular. Perder la red sería peor que no poder simularla.
 * 3. **El resultado se informa.** Migrar en silencio impide saber qué quedó a medias.
 */

export const CLAVE_OVERLAY = 'wntr_project_assets'
export const CLAVE_MARCADOR = 'wntr_project_assets_migrated'

interface RedHeredada {
  id: string
  name: string
  filePath?: string
  uploadDate: string
  nodeCount: number
  linkCount: number
  data: any
}

interface CalculoHeredado {
  id: string
  name: string
  date: string
  status: string
  networkId: string
  results?: any
}

type Overlay = Record<string, { networks?: RedHeredada[]; calculations?: CalculoHeredado[] }>

export interface InformeMigracion {
  ejecutada: boolean
  /** Motivo por el que no se ejecutó, si aplica. */
  motivo?: 'sin-datos' | 'ya-migrada'
  redesMigradas: number
  redesIncompletas: { proyecto: string; red: string; ruta?: string }[]
  redesFallidas: { proyecto: string; red: string; error: string }[]
  calculosMigrados: number
  calculosFallidos: number
}

const informeVacio = (motivo: InformeMigracion['motivo']): InformeMigracion => ({
  ejecutada: false,
  motivo,
  redesMigradas: 0,
  redesIncompletas: [],
  redesFallidas: [],
  calculosMigrados: 0,
  calculosFallidos: 0
})

/** Un proyecto que ya no existe no puede recibir sus redes: la FK lo rechazaría. */
async function proyectosExistentes(ids: string[]): Promise<Set<string>> {
  const vivos = new Set<string>()
  for (const id of ids) {
    try {
      const r = await window.electronAPI.hydraulic.getProject(id)
      if (r?.success && r.data) vivos.add(id)
    } catch {
      // Se trata como inexistente: mejor dejarlo en el respaldo que fallar.
    }
  }
  return vivos
}

export async function migrateProjectAssets(): Promise<InformeMigracion> {
  if (localStorage.getItem(CLAVE_MARCADOR)) return informeVacio('ya-migrada')

  const bruto = localStorage.getItem(CLAVE_OVERLAY)
  if (!bruto) return informeVacio('sin-datos')

  let overlay: Overlay
  try {
    overlay = JSON.parse(bruto)
  } catch (error) {
    logger.error('El overlay heredado no es JSON válido; no se migra nada:', error)
    return informeVacio('sin-datos')
  }

  const proyectos = Object.keys(overlay)
  const tieneAlgo = proyectos.some(
    p => (overlay[p].networks?.length ?? 0) > 0 || (overlay[p].calculations?.length ?? 0) > 0
  )
  if (!tieneAlgo) {
    // Nada que mover, pero se marca para no volver a comprobarlo en cada arranque.
    localStorage.setItem(CLAVE_MARCADOR, JSON.stringify({ at: new Date().toISOString(), vacio: true }))
    return informeVacio('sin-datos')
  }

  const informe: InformeMigracion = { ...informeVacio(undefined), ejecutada: true, motivo: undefined }
  const vivos = await proyectosExistentes(proyectos)

  for (const projectId of proyectos) {
    if (!vivos.has(projectId)) {
      logger.warn('Proyecto inexistente, sus datos se quedan en el respaldo:', projectId)
      continue
    }

    for (const red of overlay[projectId].networks ?? []) {
      try {
        const res = await window.electronAPI.networkRepository.save({
          projectId,
          networkData: red.data,
          filePath: red.filePath,
          filename: red.filePath?.split(/[\\/]/).pop() || `${red.name}.inp`,
          description: 'Migrada desde el almacenamiento local de una versión anterior',
          allowMissingFile: true
        })

        if (!res?.success) {
          informe.redesFallidas.push({ proyecto: projectId, red: red.name, error: res?.error || 'desconocido' })
          continue
        }

        informe.redesMigradas++
        // `hasFileContent` viene del servidor: es la verdad sobre si el .inp llegó.
        if (res.data && res.data.hasFileContent === false) {
          informe.redesIncompletas.push({ proyecto: projectId, red: red.name, ruta: red.filePath })
        }
      } catch (error) {
        informe.redesFallidas.push({
          proyecto: projectId,
          red: red.name,
          error: error instanceof Error ? error.message : 'desconocido'
        })
      }
    }

    for (const calc of overlay[projectId].calculations ?? []) {
      try {
        const res = await window.electronAPI.hydraulic.saveCalculation(projectId, {
          type: 'migrated',
          name: calc.name,
          inputs: {},
          results: calc.results ?? {},
          formulas: [],
          notes: `Migrado del almacenamiento local (${calc.date}, estado ${calc.status})`
        })
        if (res?.success) informe.calculosMigrados++
        else informe.calculosFallidos++
      } catch {
        informe.calculosFallidos++
      }
    }
  }

  // El marcador se escribe aunque haya fallos: reintentar en cada arranque
  // duplicaría lo ya migrado. Lo que falló queda listado en el informe, y el
  // overlay original sigue intacto para recuperarlo a mano.
  localStorage.setItem(
    CLAVE_MARCADOR,
    JSON.stringify({ at: new Date().toISOString(), informe })
  )

  logger.info('Migración del overlay heredado terminada:', informe)
  return informe
}
