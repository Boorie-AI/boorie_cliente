/**
 * Indexación de los resultados de cada simulación en el RAG del proyecto (#41).
 *
 * Antes no había ninguna conexión entre simular y preguntar: los resultados se
 * guardaban en la base y ahí se quedaban, así que «¿qué problemas encontró la
 * última simulación?» sólo podía contestarse abriendo la corrida a mano. Aquí se
 * cierra ese circuito, apoyándose en dos piezas que ya existen: el versionado
 * (#38), que da la ejecución a la que atar cada documento, y los ámbitos (#39),
 * que garantizan que lo indexado de un proyecto no se vea desde otro.
 *
 * La indexación **no bloquea la simulación**. Una corrida terminada con su
 * indexación fallida es una corrida terminada; el estado se guarda en la propia
 * ejecución para poder decirlo y para poder reintentarlo.
 */

import { PrismaClient } from '@prisma/client'
import { HydraulicRAGService } from './ragService'
import {
  documentosDeSimulacion,
  UMBRALES_URBANOS,
  type EjecucionIndexable,
  type EjecucionPrevia,
  type ResultadosWNTR,
  type UmbralesAnomalia,
} from './resumenSimulacion'

export type EstadoIndexacion = 'pendiente' | 'indexando' | 'indexada' | 'fallida' | 'omitida'

/**
 * Ajustes de indexación, por proyecto (etiqueta AVANZADO).
 *
 * `incluirCrudos` existe por una petición explícita de Luis Mora al validar el
 * issue: en Cliente hace falta poder indexar los resultados crudos para etapas
 * de ajuste fino, aunque para responder preguntas no sirvan y salgan caros. Por
 * eso está, y por eso está apagado por defecto.
 */
export interface AjustesIndexacion {
  automatica: boolean
  incluirCrudos: boolean
  umbrales: UmbralesAnomalia
}

export const AJUSTES_POR_DEFECTO: AjustesIndexacion = {
  automatica: true,
  incluirCrudos: false,
  umbrales: UMBRALES_URBANOS,
}

/** Categoría con la que viven en el Wisdom Center los derivados de simulación. */
export const CATEGORIA_SIMULACION = 'simulations' as const

const CLAVE_AJUSTES = 'indexacion.simulaciones'

function claveDe(projectId?: string | null): string {
  return projectId ? `${CLAVE_AJUSTES}.${projectId}` : CLAVE_AJUSTES
}

/** Mezcla lo guardado con los valores por defecto, tolerando ajustes viejos o a medias. */
export function normalizarAjustes(crudo: unknown): AjustesIndexacion {
  if (!crudo || typeof crudo !== 'object') return AJUSTES_POR_DEFECTO
  const a = crudo as Partial<AjustesIndexacion>
  return {
    automatica: typeof a.automatica === 'boolean' ? a.automatica : AJUSTES_POR_DEFECTO.automatica,
    incluirCrudos: typeof a.incluirCrudos === 'boolean' ? a.incluirCrudos : AJUSTES_POR_DEFECTO.incluirCrudos,
    umbrales: { ...AJUSTES_POR_DEFECTO.umbrales, ...(a.umbrales ?? {}) },
  }
}

/**
 * Nudos de consumo de una red, para no juzgar la presión de embalses y
 * depósitos, que por definición no la tienen (ver `detectarAnomalias`).
 */
function nudosDeConsumo(networkData: string): string[] | null {
  try {
    const nodos = JSON.parse(networkData)?.nodes
    if (!Array.isArray(nodos)) return null
    const junctions = nodos.filter((n: any) => n?.type === 'junction').map((n: any) => String(n.id))
    return junctions.length > 0 ? junctions : null
  } catch {
    // Sin topología legible se juzgan todos: mejor de más que callar anomalías.
    return null
  }
}

export class IndexacionSimulacionesService {
  private prisma: PrismaClient
  private rag: HydraulicRAGService

  /** Ejecuciones que se están indexando ahora, para no arrancar dos veces la misma. */
  private enCurso = new Set<string>()

  constructor(prisma: PrismaClient, rag?: HydraulicRAGService) {
    this.prisma = prisma
    this.rag = rag ?? new HydraulicRAGService(prisma)
  }

  /**
   * Ajustes vigentes para un proyecto: los suyos si los tiene, y si no los
   * generales. Un fallo leyendo ajustes no puede impedir indexar.
   */
  async ajustesDe(projectId?: string | null): Promise<AjustesIndexacion> {
    try {
      const claves = projectId ? [claveDe(projectId), CLAVE_AJUSTES] : [CLAVE_AJUSTES]
      for (const key of claves) {
        const fila = await this.prisma.appSetting.findUnique({ where: { key } })
        if (fila?.value) return normalizarAjustes(JSON.parse(fila.value))
      }
    } catch {
      // Ajuste ausente o ilegible: rigen los valores por defecto.
    }
    return AJUSTES_POR_DEFECTO
  }

  /**
   * Los ajustes **propios** de un proyecto, o `null` si todavía hereda.
   *
   * La diferencia importa para poder decirla: un proyecto que hereda sigue los
   * cambios que se hagan en los generales, y uno con ajustes propios ya no. Sin
   * distinguirlas, la pantalla enseñaría los mismos números en los dos casos sin
   * avisar de que uno se ha desenganchado.
   */
  async ajustesPropiosDe(projectId: string): Promise<AjustesIndexacion | null> {
    try {
      const fila = await this.prisma.appSetting.findUnique({ where: { key: claveDe(projectId) } })
      return fila?.value ? normalizarAjustes(JSON.parse(fila.value)) : null
    } catch {
      return null
    }
  }

  /** Devuelve el proyecto a heredar de los ajustes generales. */
  async olvidarAjustes(projectId: string): Promise<void> {
    await this.prisma.appSetting.deleteMany({ where: { key: claveDe(projectId) } })
  }

  async guardarAjustes(projectId: string | null, ajustes: Partial<AjustesIndexacion>): Promise<AjustesIndexacion> {
    const key = claveDe(projectId)
    const fusionados = normalizarAjustes({ ...(await this.ajustesDe(projectId)), ...ajustes })
    const value = JSON.stringify(fusionados)

    await this.prisma.appSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value, category: 'indexacion' },
    })
    return fusionados
  }

  /**
   * Lanza la indexación sin esperarla.
   *
   * Es lo que llama el guardado de una simulación: la corrida se da por
   * terminada en cuanto está registrada, y esto ocurre por detrás. El fallo se
   * registra en la ejecución, nunca se propaga a quien simuló.
   */
  encolar(runId: string): void {
    void this.indexar(runId).catch(() => {
      // indexar() ya deja constancia en la ejecución; aquí sólo se evita que un
      // rechazo sin dueño tumbe el proceso principal.
    })
  }

  /**
   * Indexa una ejecución. Devuelve cuántos documentos derivados se crearon.
   *
   * Reindexar es rehacer: primero se borra lo que hubiera de esa ejecución, para
   * que un reintento no deje dos copias del mismo resumen compitiendo en las
   * búsquedas.
   */
  async indexar(runId: string, forzar = false): Promise<{ documentos: number; estado: EstadoIndexacion }> {
    if (this.enCurso.has(runId)) return { documentos: 0, estado: 'indexando' }
    this.enCurso.add(runId)

    try {
      const contexto = await this.reunirContexto(runId)
      if (!contexto) throw new Error('Simulación no encontrada')

      const { ejecucion, projectId, ajustes } = contexto

      if (!ajustes.automatica && !forzar) {
        await this.marcar(runId, 'omitida')
        return { documentos: 0, estado: 'omitida' }
      }

      await this.marcar(runId, 'indexando')
      await this.borrarDocumentosDe(runId)

      const documentos = documentosDeSimulacion(ejecucion)
      for (const doc of documentos) {
        await this.rag.addDocument(
          {
            category: CATEGORIA_SIMULACION,
            subcategory: doc.clase,
            region: [],
            title: doc.titulo,
            content: doc.contenido,
            version: '1.0',
            metadata: {
              keywords: doc.palabrasClave,
              language: 'es',
              references: [],
              formulas: [],
              tables: [],
              figures: [],
              examples: [],
            },
          },
          undefined,
          projectId,
          { simulationRunId: runId, networkVersionId: ejecucion.networkVersionId }
        )
      }

      await this.marcar(runId, 'indexada')
      return { documentos: documentos.length, estado: 'indexada' }
    } catch (error) {
      await this.marcar(runId, 'fallida', (error as Error).message)
      throw error
    } finally {
      this.enCurso.delete(runId)
    }
  }

  /** Reintento manual, que ignora el ajuste de indexación automática. */
  async reindexar(runId: string): Promise<{ documentos: number; estado: EstadoIndexacion }> {
    return this.indexar(runId, true)
  }

  async estado(runId: string): Promise<{ estado: EstadoIndexacion; error: string | null; documentos: number }> {
    const run = await this.prisma.simulationRun.findUnique({
      where: { id: runId },
      select: { estadoIndexacion: true, errorIndexacion: true, _count: { select: { documentos: true } } },
    })
    if (!run) throw new Error('Simulación no encontrada')

    return {
      estado: run.estadoIndexacion as EstadoIndexacion,
      error: run.errorIndexacion,
      documentos: (run as any)._count?.documentos ?? 0,
    }
  }

  private async marcar(runId: string, estado: EstadoIndexacion, error?: string): Promise<void> {
    try {
      await this.prisma.simulationRun.update({
        where: { id: runId },
        data: { estadoIndexacion: estado, errorIndexacion: error ?? null },
      })
    } catch {
      // Si la ejecución ya no existe —la podó la retención mientras se indexaba—
      // no hay nada que marcar y tampoco nada que arreglar.
    }
  }

  /**
   * Borra lo indexado de una ejecución, también en el almacén vectorial.
   *
   * La base se limpia sola por la cascada cuando se poda la versión de red, pero
   * Milvus no sabe nada de esa cascada: sus vectores hay que quitarlos a mano o
   * el índice sigue devolviendo fragmentos de simulaciones que ya no existen.
   */
  async borrarDocumentosDe(runId: string): Promise<number> {
    const borrados = await this.borrarVectoresDe({ simulationRunId: runId })
    await this.prisma.hydraulicKnowledge.deleteMany({ where: { simulationRunId: runId } })
    return borrados
  }

  /**
   * Quita del índice lo que se indexó de unas versiones de red que están a punto
   * de desaparecer (la poda de #38).
   *
   * Borra las filas además de los vectores, en vez de confiar en la cascada de
   * la base: la columna `simulationRunId` se añade en las instalaciones que
   * actualizan con un `ALTER TABLE ADD COLUMN`, que en SQLite no puede traer la
   * clave foránea consigo. Donde no la haya, la cascada no ocurriría y el índice
   * se quedaría contando problemas de redes que ya no existen. La cascada sigue
   * declarada y hace de red de seguridad; el criterio lo cumple esto.
   */
  async limpiarIndicePorVersiones(networkVersionIds: string[]): Promise<number> {
    if (networkVersionIds.length === 0) return 0

    const where = { simulationRun: { networkVersionId: { in: networkVersionIds } } }
    const borrados = await this.borrarVectoresDe(where)
    await this.prisma.hydraulicKnowledge.deleteMany({ where: where as any })
    return borrados
  }

  /** Quita de Milvus los vectores de los documentos que cumplan la condición. */
  private async borrarVectoresDe(where: Record<string, unknown>): Promise<number> {
    const documentos = await this.prisma.hydraulicKnowledge.findMany({
      where: where as any,
      select: { id: true, chunks: { select: { id: true } } },
    })
    if (documentos.length === 0) return 0

    const idsChunks = documentos.flatMap(d => d.chunks.map(c => c.id))
    if (idsChunks.length > 0) {
      try {
        const milvus = (await import('../milvus.service')).MilvusService.getInstance()
        await milvus.ensureConnection()
        await milvus.delete('hydraulic_knowledge', idsChunks)
      } catch (error) {
        console.warn('[Indexación #41] No se pudieron borrar los vectores:', (error as Error).message)
      }
    }

    return documentos.length
  }

  /**
   * Todo lo que hace falta para escribir los documentos: la ejecución, la red y
   * la versión con la que se corrió, y la ejecución anterior comparable.
   */
  private async reunirContexto(runId: string): Promise<{
    ejecucion: EjecucionIndexable
    projectId: string
    ajustes: AjustesIndexacion
  } | null> {
    const run = await this.prisma.simulationRun.findUnique({
      where: { id: runId },
      include: { networkVersion: { include: { network: true } } },
    })
    if (!run) return null

    const version = run.networkVersion
    const red = version.network
    const ajustes = await this.ajustesDe(red.projectId)

    return {
      projectId: red.projectId,
      ajustes,
      ejecucion: {
        simulationRunId: run.id,
        networkVersionId: version.id,
        versionNumber: version.versionNumber,
        nombreRed: red.name,
        tipo: run.tipo,
        fecha: run.createdAt,
        parametros: JSON.parse(run.parameters),
        resultados: JSON.parse(run.results) as ResultadosWNTR,
        previa: await this.ejecucionPrevia(run.id, red.id, run.tipo, run.createdAt),
        nudosDeConsumo: nudosDeConsumo(version.networkData),
        umbrales: ajustes.umbrales,
        incluirCrudos: ajustes.incluirCrudos,
      },
    }
  }

  /**
   * La corrida anterior con la que tiene sentido comparar: la misma red y el
   * mismo tipo de análisis. Comparar una simulación hidráulica con una de
   * calidad daría diferencias que no significan nada.
   */
  private async ejecucionPrevia(
    runId: string,
    networkId: string,
    tipo: string,
    antesDe: Date
  ): Promise<EjecucionPrevia | null> {
    const previa = await this.prisma.simulationRun.findFirst({
      where: {
        id: { not: runId },
        tipo,
        createdAt: { lt: antesDe },
        networkVersion: { networkId },
      },
      orderBy: { createdAt: 'desc' },
      include: { networkVersion: { select: { versionNumber: true } } },
    })
    if (!previa) return null

    return {
      simulationRunId: previa.id,
      fecha: previa.createdAt,
      versionNumber: (previa as any).networkVersion.versionNumber,
      resultados: JSON.parse(previa.results) as ResultadosWNTR,
    }
  }
}
