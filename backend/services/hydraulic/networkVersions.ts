/**
 * Historial inmutable de redes y simulaciones (#38).
 *
 * `HydraulicNetwork` sigue siendo el estado vigente —lo que se abre, se pinta y
 * se simula—. Este servicio guarda copias de ese estado que **no se modifican
 * nunca**: sólo se añaden, se marcan como hito o se podan según la política.
 *
 * El versionado es explícito (el ingeniero guarda una versión y le pone una
 * nota) más automático antes de cualquier operación que pisaría datos, que es
 * lo decidido para este issue: el automático en cada cambio genera un historial
 * de ruido que nadie consulta.
 */

import type { PrismaClient } from '@prisma/client'
import { esCalidadSintetica } from './calidadSintetica'
import {
  construirPaquete,
  describirPaquete,
  validarPaquete,
  type ContenidoPaquete,
  type RedExportada,
} from './intercambio'
import {
  RETENCION_POR_DEFECTO,
  compararSimulaciones,
  compararVersiones,
  resumirDiferencia,
  resumirDiferenciaSimulaciones,
  versionesAPodar,
  type DiferenciaRed,
  type DiferenciaSimulaciones,
  type PoliticaRetencion,
} from './versionado'

export type OrigenVersion = 'manual' | 'importacion' | 'escenario' | 'migracion'

export interface DatosVersion {
  id: string
  networkId: string
  versionNumber: number
  changeNote?: string
  author?: string
  origen: OrigenVersion
  marcada: boolean
  createdAt: Date
  /** Cuántas simulaciones se corrieron sobre esta versión. */
  simulaciones: number
}

export interface DatosSimulacion {
  id: string
  networkVersionId: string
  versionNumber: number
  tipo: string
  parameters: unknown
  engineVersion?: string
  marcada: boolean
  createdAt: Date
  /** Cómo va su indexación en el RAG (#41), para poder decirlo en la lista. */
  estadoIndexacion?: string
  errorIndexacion?: string | null
  /**
   * Las ejecuciones de «Calidad del Agua» anteriores a la v1.23.0, cuyas cifras
   * no salieron de ninguna simulación. Se marcan en la lista en vez de borrarlas:
   * son datos del usuario.
   */
  calidadSintetica?: boolean
}

const formatearVersion = (v: any, simulaciones = 0): DatosVersion => ({
  id: v.id,
  networkId: v.networkId,
  versionNumber: v.versionNumber,
  changeNote: v.changeNote ?? undefined,
  author: v.author ?? undefined,
  origen: (v.origen ?? 'manual') as OrigenVersion,
  marcada: !!v.marcada,
  createdAt: v.createdAt,
  simulaciones,
})

export class NetworkVersionService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Congela el estado actual de la red como versión nueva.
   *
   * El número es correlativo por red y se calcula dentro de la transacción: dos
   * guardados a la vez sobre la misma red no pueden acabar con el mismo número,
   * que es lo que rompería la unicidad y, peor, la lectura del historial.
   */
  async crearVersion(
    networkId: string,
    opciones: { changeNote?: string; author?: string; origen?: OrigenVersion; marcada?: boolean } = {}
  ): Promise<DatosVersion> {
    return this.prisma.$transaction(async tx => {
      const red = await tx.hydraulicNetwork.findUnique({ where: { id: networkId } })
      if (!red) throw new Error('Red no encontrada')

      const ultima = await tx.networkVersion.findFirst({
        where: { networkId },
        orderBy: { versionNumber: 'desc' },
        select: { versionNumber: true },
      })

      const version = await tx.networkVersion.create({
        data: {
          networkId,
          versionNumber: (ultima?.versionNumber ?? 0) + 1,
          networkData: red.networkData,
          fileContent: red.fileContent,
          coordinateSystem: red.coordinateSystem,
          summary: red.summary,
          changeNote: opciones.changeNote ?? null,
          author: opciones.author ?? null,
          origen: opciones.origen ?? 'manual',
          marcada: opciones.marcada ?? false,
        },
      })

      return formatearVersion(version)
    })
  }

  async listarVersiones(networkId: string): Promise<DatosVersion[]> {
    const versiones = await this.prisma.networkVersion.findMany({
      where: { networkId },
      orderBy: { versionNumber: 'desc' },
      include: { _count: { select: { simulations: true } } },
    })
    return versiones.map(v => formatearVersion(v, (v as any)._count?.simulations ?? 0))
  }

  /**
   * Devuelve el estado guardado en una versión, para poder abrirlo o compararlo.
   * El `.inp` viaja con él: sin el fichero original la versión se podría mirar
   * pero no simular, que es media versión.
   */
  async leerVersion(versionId: string): Promise<{
    version: DatosVersion
    networkData: any
    fileContent: string
    coordinateSystem: any
  }> {
    const v = await this.prisma.networkVersion.findUnique({ where: { id: versionId } })
    if (!v) throw new Error('Versión no encontrada')

    return {
      version: formatearVersion(v),
      networkData: JSON.parse(v.networkData),
      fileContent: v.fileContent,
      coordinateSystem: v.coordinateSystem ? JSON.parse(v.coordinateSystem) : undefined,
    }
  }

  /**
   * Devuelve la red a un estado anterior.
   *
   * Antes de pisar nada se congela el estado vigente: restaurar es justamente
   * una operación destructiva, y sin esa copia el ingeniero que restaura por
   * error perdería aquello a lo que querría volver.
   */
  async restaurarVersion(versionId: string): Promise<{ version: DatosVersion; respaldo: DatosVersion }> {
    const v = await this.prisma.networkVersion.findUnique({ where: { id: versionId } })
    if (!v) throw new Error('Versión no encontrada')

    const respaldo = await this.crearVersion(v.networkId, {
      origen: 'manual',
      changeNote: `Estado anterior a restaurar la versión ${v.versionNumber}`,
    })

    await this.prisma.hydraulicNetwork.update({
      where: { id: v.networkId },
      data: {
        networkData: v.networkData,
        fileContent: v.fileContent,
        coordinateSystem: v.coordinateSystem,
        summary: v.summary,
        updatedAt: new Date(),
      },
    })

    return { version: formatearVersion(v), respaldo }
  }

  async marcarVersion(versionId: string, marcada: boolean): Promise<DatosVersion> {
    const v = await this.prisma.networkVersion.update({
      where: { id: versionId },
      data: { marcada },
    })
    return formatearVersion(v)
  }

  /** Diferencias entre dos versiones de la misma red. */
  async compararVersiones(
    versionA: string,
    versionB: string
  ): Promise<{ diferencia: DiferenciaRed; resumen: string }> {
    const [a, b] = await Promise.all([
      this.prisma.networkVersion.findUnique({ where: { id: versionA } }),
      this.prisma.networkVersion.findUnique({ where: { id: versionB } }),
    ])
    if (!a || !b) throw new Error('Versión no encontrada')

    const diferencia = compararVersiones(JSON.parse(a.networkData), JSON.parse(b.networkData))
    return { diferencia, resumen: resumirDiferencia(diferencia) }
  }

  /**
   * Registra una ejecución de simulación contra la versión con la que se corrió.
   * Sin esa atadura, un resultado no se puede interpretar: no se sabe sobre qué
   * red se calculó.
   */
  async registrarSimulacion(
    networkVersionId: string,
    datos: { tipo: string; parameters: unknown; results: unknown; engineVersion?: string }
  ): Promise<DatosSimulacion> {
    const version = await this.prisma.networkVersion.findUnique({ where: { id: networkVersionId } })
    if (!version) throw new Error('Versión no encontrada')

    const run = await this.prisma.simulationRun.create({
      data: {
        networkVersionId,
        tipo: datos.tipo,
        parameters: JSON.stringify(datos.parameters ?? {}),
        results: JSON.stringify(datos.results ?? {}),
        engineVersion: datos.engineVersion ?? null,
      },
    })

    return {
      id: run.id,
      networkVersionId,
      versionNumber: version.versionNumber,
      tipo: run.tipo,
      parameters: datos.parameters,
      engineVersion: run.engineVersion ?? undefined,
      marcada: run.marcada,
      createdAt: run.createdAt,
      estadoIndexacion: run.estadoIndexacion,
      errorIndexacion: run.errorIndexacion,
    }
  }

  async listarSimulaciones(networkId: string): Promise<DatosSimulacion[]> {
    const runs = await this.prisma.simulationRun.findMany({
      where: { networkVersion: { networkId } },
      orderBy: { createdAt: 'desc' },
      include: { networkVersion: { select: { versionNumber: true } } },
    })

    return runs.map(r => ({
      id: r.id,
      networkVersionId: r.networkVersionId,
      versionNumber: (r as any).networkVersion.versionNumber,
      tipo: r.tipo,
      parameters: JSON.parse(r.parameters),
      engineVersion: r.engineVersion ?? undefined,
      marcada: r.marcada,
      createdAt: r.createdAt,
      estadoIndexacion: r.estadoIndexacion,
      errorIndexacion: r.errorIndexacion,
      calidadSintetica: esCalidadSintetica(r.results),
    }))
  }

  async leerSimulacion(runId: string): Promise<{ resultados: unknown; parametros: unknown }> {
    const r = await this.prisma.simulationRun.findUnique({ where: { id: runId } })
    if (!r) throw new Error('Simulación no encontrada')
    return { resultados: JSON.parse(r.results), parametros: JSON.parse(r.parameters) }
  }

  /**
   * Aplica la política de retención a una red. Devuelve cuántas versiones se
   * podaron; las marcadas y la más reciente no se tocan nunca.
   */
  async podar(networkId: string, politica: PoliticaRetencion = RETENCION_POR_DEFECTO): Promise<number> {
    const versiones = await this.prisma.networkVersion.findMany({
      where: { networkId },
      select: {
        id: true,
        versionNumber: true,
        marcada: true,
        _count: { select: { enSnapshots: true } },
      },
    })

    const sobran = versionesAPodar(
      versiones.map(v => ({
        id: v.id,
        versionNumber: v.versionNumber,
        marcada: v.marcada,
        enSnapshot: ((v as any)._count?.enSnapshots ?? 0) > 0,
      })),
      politica
    )
    if (sobran.length === 0) return 0

    // Antes de borrar, no después: en cuanto las versiones se van, la cascada
    // se lleva sus ejecuciones y ya no hay forma de saber qué vectores
    // quitar del índice, que se quedaría respondiendo con resúmenes de
    // simulaciones inexistentes (#41).
    try {
      const { IndexacionSimulacionesService } = await import('./indexacionSimulaciones')
      await new IndexacionSimulacionesService(this.prisma).limpiarIndicePorVersiones(sobran)
    } catch (error) {
      console.warn('[Versionado] No se pudo limpiar el índice de las versiones podadas:', (error as Error).message)
    }

    await this.prisma.networkVersion.deleteMany({ where: { id: { in: sobran } } })
    return sobran.length
  }

  /**
   * Política vigente. Se guarda en `app_settings` para poder ajustarla sin tocar
   * código; si no está, rige el valor por defecto.
   */
  async politicaVigente(): Promise<PoliticaRetencion> {
    try {
      const ajuste = await this.prisma.appSetting.findUnique({
        where: { key: 'retencion.versionesSinMarcar' },
      })
      const n = Number(ajuste?.value)
      if (Number.isFinite(n) && n >= 0) return { conservarSinMarcar: n }
    } catch {
      // Sin ajuste guardado se usa el valor por defecto: la retención no debe
      // depender de que exista una tabla de configuración.
    }
    return RETENCION_POR_DEFECTO
  }

  /** Poda aplicando la política guardada. Devuelve cuántas versiones retiró. */
  async podarSegunAjustes(networkId: string): Promise<number> {
    return this.podar(networkId, await this.politicaVigente())
  }

  /**
   * Compara dos ejecuciones de simulación sobre el mismo paso.
   *
   * Tiene sentido entre versiones distintas de la red —«¿qué le hizo a las
   * presiones cambiar ese diámetro?»— y también entre dos ejecuciones de la
   * misma versión con parámetros distintos.
   */
  async compararSimulaciones(
    runA: string,
    runB: string,
    paso = 0
  ): Promise<{ diferencia: DiferenciaSimulaciones; resumen: string }> {
    const [a, b] = await Promise.all([
      this.prisma.simulationRun.findUnique({ where: { id: runA } }),
      this.prisma.simulationRun.findUnique({ where: { id: runB } }),
    ])
    if (!a || !b) throw new Error('Simulación no encontrada')

    const diferencia = compararSimulaciones(JSON.parse(a.results), JSON.parse(b.results), paso)
    return { diferencia, resumen: resumirDiferenciaSimulaciones(diferencia) }
  }

  // --- Instantáneas de proyecto ---------------------------------------

  /**
   * Congela el proyecto entero: qué versión de cada red estaba vigente.
   *
   * No copia datos, apunta a versiones que ya son inmutables. Las redes que aún
   * no tengan versión reciben una en el momento, porque una instantánea con
   * agujeros no serviría para responder «cómo estaba el proyecto».
   */
  async crearSnapshot(
    projectId: string,
    datos: { label: string; note?: string; author?: string }
  ): Promise<{ id: string; label: string; redes: number }> {
    const redes = await this.prisma.hydraulicNetwork.findMany({
      where: { projectId, isActive: true },
      select: { id: true },
    })

    const versionIds: string[] = []
    for (const red of redes) {
      const ultima = await this.prisma.networkVersion.findFirst({
        where: { networkId: red.id },
        orderBy: { versionNumber: 'desc' },
        select: { id: true },
      })
      versionIds.push(ultima ? ultima.id : (await this.crearVersion(red.id, {
        origen: 'manual',
        changeNote: `Estado incluido en «${datos.label}»`,
      })).id)
    }

    const snapshot = await this.prisma.projectSnapshot.create({
      data: {
        projectId,
        label: datos.label,
        note: datos.note ?? null,
        author: datos.author ?? null,
        entries: { create: versionIds.map(networkVersionId => ({ networkVersionId })) },
      },
    })

    return { id: snapshot.id, label: snapshot.label, redes: versionIds.length }
  }

  async listarSnapshots(projectId: string) {
    const snapshots = await this.prisma.projectSnapshot.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      include: {
        entries: {
          include: {
            networkVersion: {
              select: { id: true, versionNumber: true, networkId: true, network: { select: { name: true } } },
            },
          },
        },
      },
    })

    return snapshots.map(s => ({
      id: s.id,
      label: s.label,
      note: s.note ?? undefined,
      createdAt: s.createdAt,
      redes: s.entries.map(e => ({
        networkId: (e as any).networkVersion.networkId,
        nombre: (e as any).networkVersion.network?.name ?? '',
        versionId: (e as any).networkVersion.id,
        versionNumber: (e as any).networkVersion.versionNumber,
      })),
    }))
  }

  /**
   * Devuelve el proyecto entero al estado de una instantánea. Cada red se
   * restaura por separado, y cada restauración congela antes su estado vigente:
   * volver a marzo no puede costar perder lo de hoy.
   */
  async restaurarSnapshot(snapshotId: string): Promise<{ restauradas: number }> {
    const snapshot = await this.prisma.projectSnapshot.findUnique({
      where: { id: snapshotId },
      include: { entries: true },
    })
    if (!snapshot) throw new Error('Instantánea no encontrada')

    for (const entrada of snapshot.entries) {
      await this.restaurarVersion(entrada.networkVersionId)
    }

    return { restauradas: snapshot.entries.length }
  }

  async borrarSnapshot(snapshotId: string): Promise<void> {
    await this.prisma.projectSnapshot.delete({ where: { id: snapshotId } })
  }

  // --- Intercambio entre instalaciones ---------------------------------

  private async empaquetarVersiones(
    versionIds: string[],
    etiqueta: string | undefined,
    generadoPor: string
  ): Promise<string> {
    const versiones = await this.prisma.networkVersion.findMany({
      where: { id: { in: versionIds } },
      include: { network: { select: { name: true, filename: true, project: { select: { name: true } } } } },
    })

    const redes: RedExportada[] = versiones.map(v => ({
      nombre: (v as any).network.name,
      filename: (v as any).network.filename,
      versionNumber: v.versionNumber,
      changeNote: v.changeNote ?? undefined,
      creadaEl: v.createdAt.toISOString(),
      origen: {
        networkId: v.networkId,
        versionId: v.id,
        proyecto: (v as any).network.project?.name,
      },
      networkData: JSON.parse(v.networkData),
      fileContent: v.fileContent,
      coordinateSystem: v.coordinateSystem ? JSON.parse(v.coordinateSystem) : undefined,
      summary: JSON.parse(v.summary),
    }))

    const contenido: ContenidoPaquete = { etiqueta, redes }
    return JSON.stringify(
      construirPaquete(contenido, { generadoPor, generadoEl: new Date().toISOString() }),
      null,
      2
    )
  }

  /** Exporta una versión suelta. */
  async exportarVersion(versionId: string, generadoPor: string): Promise<string> {
    return this.empaquetarVersiones([versionId], undefined, generadoPor)
  }

  /** Exporta el conjunto que congeló una instantánea de proyecto. */
  async exportarSnapshot(snapshotId: string, generadoPor: string): Promise<string> {
    const snapshot = await this.prisma.projectSnapshot.findUnique({
      where: { id: snapshotId },
      include: { entries: true },
    })
    if (!snapshot) throw new Error('Instantánea no encontrada')

    return this.empaquetarVersiones(
      snapshot.entries.map(e => e.networkVersionId),
      snapshot.label,
      generadoPor
    )
  }

  /**
   * Importa un paquete en un proyecto.
   *
   * Los identificadores del paquete **no se reutilizan**: en la instalación de
   * destino podrían chocar con registros que no tienen nada que ver. Se guardan
   * como procedencia dentro de la nota de la versión, que es lo que sirve para
   * rastrearla, y todo lo demás nace con identificadores nuevos.
   *
   * Una red que ya existe con ese nombre recibe una versión más, en lugar de
   * duplicarse: es la misma semántica que reimportar un `.inp`.
   */
  async importarPaquete(
    projectId: string,
    texto: string
  ): Promise<{ resumen: string; creadas: string[]; versionadas: string[] }> {
    // Sin `strict` no hay estrechamiento de la unión, así que el motivo se saca
    // antes de comprobar: leerlo del tipo ancho es más claro que un cast.
    const validacion = validarPaquete(texto)
    if (!validacion.ok) {
      throw new Error((validacion as { error: string }).error)
    }

    const creadas: string[] = []
    const versionadas: string[] = []

    for (const red of validacion.paquete.contenido.redes) {
      const nota = [
        `Importada de ${validacion.paquete.generadoPor}`,
        red.origen.proyecto ? `proyecto «${red.origen.proyecto}»` : null,
        `versión ${red.versionNumber} de origen`,
        red.changeNote ? `«${red.changeNote}»` : null,
      ]
        .filter(Boolean)
        .join(' · ')

      const existente = await this.prisma.hydraulicNetwork.findFirst({
        where: { projectId, name: red.nombre, isActive: true },
        select: { id: true },
      })

      const datos = {
        networkData: JSON.stringify(red.networkData),
        fileContent: red.fileContent,
        coordinateSystem: red.coordinateSystem ? JSON.stringify(red.coordinateSystem) : null,
        summary: JSON.stringify(red.summary),
      }

      if (existente) {
        // El estado que había se congela antes de que la importación lo pise.
        await this.crearVersion(existente.id, {
          origen: 'importacion',
          changeNote: `Estado anterior a importar «${red.nombre}»`,
        })
        await this.prisma.hydraulicNetwork.update({
          where: { id: existente.id },
          data: { ...datos, updatedAt: new Date() },
        })
        await this.crearVersion(existente.id, { origen: 'importacion', changeNote: nota })
        versionadas.push(red.nombre)
      } else {
        const nueva = await this.prisma.hydraulicNetwork.create({
          data: {
            projectId,
            name: red.nombre,
            filename: red.filename,
            description: `Importada de otra instalación de Boorie`,
            ...datos,
            version: '1.0',
          },
        })
        await this.crearVersion(nueva.id, { origen: 'importacion', changeNote: nota })
        creadas.push(red.nombre)
      }
    }

    const partes = [
      creadas.length ? `${creadas.length} red${creadas.length === 1 ? '' : 'es'} nueva${creadas.length === 1 ? '' : 's'}` : null,
      versionadas.length ? `${versionadas.length} actualizada${versionadas.length === 1 ? '' : 's'} con una versión más` : null,
    ].filter(Boolean)

    return { resumen: `${describirPaquete(validacion.paquete)}. ${partes.join(' y ')}.`, creadas, versionadas }
  }

  /**
   * Da versión inicial a las redes que aún no tienen ninguna.
   *
   * Es idempotente: sólo mira las redes sin versiones, así que se puede llamar
   * en cada arranque sin duplicar nada. No toca `hydraulic_calculations`: los
   * resultados guardados antes de esto no registran con qué red se corrieron
   * —29 de los 40 de una base real no traían `networkId`—, así que atribuirles
   * una versión sería inventarse la trazabilidad que precisamente falta. Se
   * quedan donde están, intactos.
   */
  async migrarRedesSinVersion(): Promise<number> {
    const redes = await this.prisma.hydraulicNetwork.findMany({
      where: { versions: { none: {} } },
      select: { id: true },
    })

    for (const red of redes) {
      await this.crearVersion(red.id, {
        origen: 'migracion',
        changeNote: 'Estado inicial, anterior al historial de versiones',
      })
    }

    return redes.length
  }
}
