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
import {
  RETENCION_POR_DEFECTO,
  compararVersiones,
  resumirDiferencia,
  versionesAPodar,
  type DiferenciaRed,
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
      select: { id: true, versionNumber: true, marcada: true },
    })

    const sobran = versionesAPodar(versiones, politica)
    if (sobran.length === 0) return 0

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
