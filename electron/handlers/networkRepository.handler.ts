import { ipcMain } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { NetworkRepositoryService } from '../../backend/services/hydraulic/networkRepository'
import { NetworkVersionService } from '../../backend/services/hydraulic/networkVersions'
import { construirResumenRed, formatearContextoRed } from '../../backend/services/hydraulic/networkContext'
import { leerRedActiva } from '../../backend/services/hydraulic/redActiva'
import { proveedorSoportaHerramientas } from '../../backend/services/ai/toolWire'
import type { PrismaClient } from '@prisma/client'
import { appLogger } from '../../backend/utils/logger'

export class NetworkRepositoryHandler {
  private networkRepo: NetworkRepositoryService
  private versiones: NetworkVersionService
  private prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this.prisma = prisma
    this.networkRepo = new NetworkRepositoryService(prisma)
    this.versiones = new NetworkVersionService(prisma)
    this.setupHandlers()
  }

  private setupHandlers() {
    // Save network to repository
    ipcMain.handle('network-repo:save', async (_, data: {
      projectId: string
      networkData: any
      /** Contenido del .inp. Si no se envía, se lee de `filePath`. */
      fileContent?: string
      /**
       * Ruta del .inp en disco. El renderer la tiene tras cargar la red, pero no
       * puede leer ficheros: la lectura se hace aquí a propósito, para no exponer
       * un lector genérico al proceso de renderizado.
       */
      filePath?: string
      filename: string
      description?: string
      /**
       * Permite guardar sin el .inp, dejando la red marcada como incompleta. Solo
       * lo usa la migracion del overlay heredado: si el fichero original ya no
       * esta en disco, conservar la red con sus datos parseados es mejor que
       * descartarla. Exigirlo de forma explicita evita que ocurra por descuido en
       * el flujo normal de guardado.
       */
      allowMissingFile?: boolean
      /** Si viene, la red se guarda como escenario colgando de `parentId`. */
      scenario?: { parentId?: string; scenarioLabel?: string; resultsPath?: string }
    }) => {
      try {
        appLogger.info('Saving network to repository', {
          projectId: data.projectId,
          networkName: data.networkData.name,
          filename: data.filename
        })

        let fileContent = data.fileContent
        if (!fileContent && data.filePath) {
          try {
            fileContent = await readFile(data.filePath, 'utf-8')
          } catch (error) {
            if (!data.allowMissingFile) throw error
            appLogger.warn('El .inp ya no esta en disco; la red se guarda incompleta', {
              filePath: data.filePath
            })
          }
        }
        if (!fileContent && !data.allowMissingFile) {
          throw new Error('Falta el contenido del .inp: envia fileContent o filePath')
        }

        /**
         * Reimportar un `.inp` con el mismo nombre ya no es un error (#38).
         *
         * Antes el repositorio lo rechazaba, porque la restricción única impedía
         * dos redes con el mismo nombre en un proyecto. Ahora la red es el
         * contenedor: se congela su estado como versión —automáticamente, que es
         * justo el caso de «operación que pisaría datos»— y se actualiza encima.
         */
        const existente = await this.prisma.hydraulicNetwork.findFirst({
          where: { projectId: data.projectId, name: data.networkData.name, isActive: true },
          select: { id: true },
        })

        if (existente) {
          const respaldo = await this.versiones.crearVersion(existente.id, {
            origen: 'importacion',
            changeNote: `Estado anterior a reimportar ${data.filename}`,
          })
          const actualizada = await this.networkRepo.updateNetwork(
            existente.id,
            data.networkData,
            fileContent ?? '',
            data.filename,
            data.description
          )
          await this.versiones.crearVersion(existente.id, {
            origen: 'importacion',
            changeNote: `Importado ${data.filename}`,
          })
          appLogger.success('Network re-imported as a new version', {
            networkId: existente.id,
            respaldo: respaldo.versionNumber,
          })
          return { success: true, data: actualizada, versionada: true }
        }

        const savedNetwork = await this.networkRepo.saveNetwork(
          data.projectId,
          data.networkData,
          fileContent ?? '',
          data.filename,
          data.description,
          data.scenario
        )

        // Toda red guardada arranca con su versión 1: sin ella no habría nada
        // sobre lo que registrar simulaciones ni a lo que volver.
        await this.versiones.crearVersion(savedNetwork.id, {
          origen: 'importacion',
          changeNote: `Importado ${data.filename}`,
        })

        appLogger.success('Network saved successfully', {
          networkId: savedNetwork.id,
          name: savedNetwork.name
        })

        return {
          success: true,
          data: savedNetwork
        }
      } catch (error) {
        // Una red ya guardada no es un error de verdad: la migracion del overlay
        // heredado encuentra duplicados a puñados (el codigo antiguo reañadia la
        // red en cada carga), y presentarlos como fallos alarma sin motivo. Se
        // marca aqui, con el codigo de Prisma o el mensaje del servicio, para no
        // tener que adivinarlo comparando cadenas en el renderer.
        const mensaje = (error as Error).message
        const duplicate =
          (error as { code?: string }).code === 'P2002' ||
          mensaje.includes('ya existe') ||
          mensaje.includes('Unique constraint failed')

        if (duplicate) appLogger.info('La red ya estaba guardada en el proyecto', { name: data.networkData?.name })
        else appLogger.error('Failed to save network', error as Error)

        return {
          success: false,
          duplicate,
          error: mensaje
        }
      }
    })

    // Update existing network
    ipcMain.handle('network-repo:update', async (_, data: {
      networkId: string
      networkData: any
      fileContent: string
      filename: string
      description?: string
    }) => {
      try {
        const updatedNetwork = await this.networkRepo.updateNetwork(
          data.networkId,
          data.networkData,
          data.fileContent,
          data.filename,
          data.description
        )

        appLogger.success('Network updated successfully', {
          networkId: updatedNetwork.id,
          name: updatedNetwork.name
        })

        return {
          success: true,
          data: updatedNetwork
        }
      } catch (error) {
        appLogger.error('Failed to update network', error as Error)
        return {
          success: false,
          error: (error as Error).message
        }
      }
    })

    // Get networks for a project
    ipcMain.handle('network-repo:get-project-networks', async (_, projectId: string) => {
      try {
        const networks = await this.networkRepo.getProjectNetworks(projectId)

        return {
          success: true,
          data: networks
        }
      } catch (error) {
        appLogger.error('Failed to get project networks', error as Error)
        return {
          success: false,
          error: (error as Error).message
        }
      }
    })

    // Load network from repository
    ipcMain.handle('network-repo:load', async (_, networkId: string) => {
      try {
        appLogger.info('Loading network from repository', { networkId })

        const result = await this.networkRepo.loadNetwork(networkId)

        // El .inp guardado se materializa en un temporal y se devuelve su ruta,
        // para que el llamante pueda cargarlo en el backend de WNTR con el canal
        // que ya existe. Así la red que se simula es la que se muestra, y la red
        // guardada sigue abriéndose aunque el fichero original se haya movido o
        // borrado: la fuente es la base de datos, no el disco del usuario.
        const filePath = join(tmpdir(), `boorie-net-${networkId}.inp`)
        await writeFile(filePath, result.fileContent, 'utf-8')

        appLogger.success('Network loaded successfully', { networkId, filePath })

        return {
          success: true,
          data: result.networkData,
          filePath
        }
      } catch (error) {
        appLogger.error('Failed to load network', error as Error)
        return {
          success: false,
          error: (error as Error).message
        }
      }
    })

    /**
     * Declara el sistema de coordenadas de una red (#36). `epsg: null` la marca
     * como no georreferenciada, que es un estado legitimo: mejor decirlo que
     * pintarla en un sitio inventado.
     */
    ipcMain.handle('network-repo:declare-crs', async (_, data: {
      networkId: string
      epsg: string | null
    }) => {
      try {
        appLogger.info('Declaring network CRS', { networkId: data.networkId, epsg: data.epsg })

        const coordinateSystem = await this.networkRepo.declararCRS(data.networkId, data.epsg)

        return { success: true, data: coordinateSystem }
      } catch (error) {
        appLogger.error('Failed to declare network CRS', error as Error)
        return {
          success: false,
          error: (error as Error).message
        }
      }
    })

    // --- Historial inmutable de versiones (#38) ---

    ipcMain.handle('network-version:list', async (_, networkId: string) => {
      try {
        return { success: true, data: await this.versiones.listarVersiones(networkId) }
      } catch (error) {
        appLogger.error('Failed to list network versions', error as Error)
        return { success: false, error: (error as Error).message }
      }
    })

    ipcMain.handle('network-version:create', async (_, data: {
      networkId: string
      changeNote?: string
      marcada?: boolean
    }) => {
      try {
        const version = await this.versiones.crearVersion(data.networkId, {
          changeNote: data.changeNote,
          marcada: data.marcada,
          origen: 'manual',
        })
        // La retención se aplica al añadir, que es cuando el historial crece.
        const podadas = await this.versiones.podarSegunAjustes(data.networkId)
        appLogger.success('Network version created', {
          networkId: data.networkId,
          version: version.versionNumber,
          podadas,
        })
        return { success: true, data: version, podadas }
      } catch (error) {
        appLogger.error('Failed to create network version', error as Error)
        return { success: false, error: (error as Error).message }
      }
    })

    /**
     * Abre una versión: devuelve sus datos y materializa su `.inp` en un
     * temporal, igual que `network-repo:load`, para poder simular sobre ella.
     */
    ipcMain.handle('network-version:open', async (_, versionId: string) => {
      try {
        const v = await this.versiones.leerVersion(versionId)
        const filePath = join(tmpdir(), `boorie-version-${versionId}.inp`)
        await writeFile(filePath, v.fileContent, 'utf-8')
        return { success: true, data: v.networkData, version: v.version, filePath }
      } catch (error) {
        appLogger.error('Failed to open network version', error as Error)
        return { success: false, error: (error as Error).message }
      }
    })

    ipcMain.handle('network-version:restore', async (_, versionId: string) => {
      try {
        const r = await this.versiones.restaurarVersion(versionId)
        appLogger.success('Network version restored', { versionId, respaldo: r.respaldo.versionNumber })
        return { success: true, data: r }
      } catch (error) {
        appLogger.error('Failed to restore network version', error as Error)
        return { success: false, error: (error as Error).message }
      }
    })

    ipcMain.handle('network-version:mark', async (_, data: { versionId: string; marcada: boolean }) => {
      try {
        return { success: true, data: await this.versiones.marcarVersion(data.versionId, data.marcada) }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    })

    ipcMain.handle('network-version:compare', async (_, data: { versionA: string; versionB: string }) => {
      try {
        return { success: true, data: await this.versiones.compararVersiones(data.versionA, data.versionB) }
      } catch (error) {
        appLogger.error('Failed to compare network versions', error as Error)
        return { success: false, error: (error as Error).message }
      }
    })

    ipcMain.handle('network-version:simulations', async (_, networkId: string) => {
      try {
        return { success: true, data: await this.versiones.listarSimulaciones(networkId) }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    })

    ipcMain.handle('network-version:simulation-results', async (_, runId: string) => {
      try {
        return { success: true, data: await this.versiones.leerSimulacion(runId) }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    })

    /** Registra una ejecución contra la versión vigente de la red. */
    ipcMain.handle('network-version:record-simulation', async (_, data: {
      networkId: string
      tipo: string
      parameters: unknown
      results: unknown
      engineVersion?: string
    }) => {
      try {
        const versiones = await this.versiones.listarVersiones(data.networkId)
        if (versiones.length === 0) {
          return { success: false, error: 'La red no tiene ninguna versión sobre la que registrar la simulación' }
        }
        const run = await this.versiones.registrarSimulacion(versiones[0].id, {
          tipo: data.tipo,
          parameters: data.parameters,
          results: data.results,
          engineVersion: data.engineVersion,
        })
        return { success: true, data: run }
      } catch (error) {
        appLogger.error('Failed to record simulation run', error as Error)
        return { success: false, error: (error as Error).message }
      }
    })

    ipcMain.handle('network-version:compare-simulations', async (_, data: {
      runA: string
      runB: string
      paso?: number
    }) => {
      try {
        return { success: true, data: await this.versiones.compararSimulaciones(data.runA, data.runB, data.paso ?? 0) }
      } catch (error) {
        appLogger.error('Failed to compare simulation runs', error as Error)
        return { success: false, error: (error as Error).message }
      }
    })

    // --- Instantáneas de proyecto (#38) ---

    ipcMain.handle('project-snapshot:list', async (_, projectId: string) => {
      try {
        return { success: true, data: await this.versiones.listarSnapshots(projectId) }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    })

    ipcMain.handle('project-snapshot:create', async (_, data: {
      projectId: string
      label: string
      note?: string
    }) => {
      try {
        const s = await this.versiones.crearSnapshot(data.projectId, data)
        appLogger.success('Project snapshot created', { projectId: data.projectId, redes: s.redes })
        return { success: true, data: s }
      } catch (error) {
        appLogger.error('Failed to create project snapshot', error as Error)
        return { success: false, error: (error as Error).message }
      }
    })

    ipcMain.handle('project-snapshot:restore', async (_, snapshotId: string) => {
      try {
        const r = await this.versiones.restaurarSnapshot(snapshotId)
        appLogger.success('Project snapshot restored', { snapshotId, redes: r.restauradas })
        return { success: true, data: r }
      } catch (error) {
        appLogger.error('Failed to restore project snapshot', error as Error)
        return { success: false, error: (error as Error).message }
      }
    })

    ipcMain.handle('project-snapshot:delete', async (_, snapshotId: string) => {
      try {
        await this.versiones.borrarSnapshot(snapshotId)
        return { success: true }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    })

    // Get network details
    ipcMain.handle('network-repo:get', async (_, networkId: string) => {
      try {
        const result = await this.networkRepo.getNetwork(networkId)

        if (!result) {
          return {
            success: false,
            error: 'Red no encontrada'
          }
        }

        return {
          success: true,
          data: result
        }
      } catch (error) {
        appLogger.error('Failed to get network', error as Error)
        return {
          success: false,
          error: (error as Error).message
        }
      }
    })

    // Delete network
    ipcMain.handle('network-repo:delete', async (_, networkId: string) => {
      try {
        appLogger.info('Deleting network', { networkId })

        await this.networkRepo.deleteNetwork(networkId)

        appLogger.success('Network deleted successfully', { networkId })

        return {
          success: true
        }
      } catch (error) {
        appLogger.error('Failed to delete network', error as Error)
        return {
          success: false,
          error: (error as Error).message
        }
      }
    })

    // Save simulation results
    ipcMain.handle('network-repo:save-simulation', async (_, data: {
      networkId: string
      results: any
    }) => {
      try {
        await this.networkRepo.saveSimulationResults(data.networkId, data.results)

        return {
          success: true
        }
      } catch (error) {
        appLogger.error('Failed to save simulation results', error as Error)
        return {
          success: false,
          error: (error as Error).message
        }
      }
    })

    // Search networks
    ipcMain.handle('network-repo:search', async (_, data: {
      query: string
      projectId?: string
    }) => {
      try {
        const networks = await this.networkRepo.searchNetworks(data.query, data.projectId)

        return {
          success: true,
          data: networks
        }
      } catch (error) {
        appLogger.error('Failed to search networks', error as Error)
        return {
          success: false,
          error: (error as Error).message
        }
      }
    })

    // Get project network statistics
    ipcMain.handle('network-repo:stats', async (_, projectId: string) => {
      try {
        const stats = await this.networkRepo.getProjectNetworkStats(projectId)

        return {
          success: true,
          data: stats
        }
      } catch (error) {
        appLogger.error('Failed to get network stats', error as Error)
        return {
          success: false,
          error: (error as Error).message
        }
      }
    })

    // Resumen de la red activa para el agente del chat (#34).
    // El proveedor llega porque el texto cambia segun pueda o no consultar la
    // red con herramientas: prometer una consulta que no existe le pide al
    // modelo justo la invencion que el resto del bloque trata de evitar.
    ipcMain.handle('network-repo:context', async (_, projectId: string, proveedor?: string) => {
      const conHerramientas = proveedorSoportaHerramientas(proveedor)
      try {
        if (!projectId) {
          return { success: true, data: { resumen: null, texto: formatearContextoRed(null) } }
        }

        const red = await leerRedActiva(this.prisma, projectId)

        if (!red) {
          return { success: true, data: { resumen: null, texto: formatearContextoRed(null) } }
        }

        // La última simulación no sale de HydraulicNetwork.simulationResults:
        // esa columna está vacía en todas las redes porque el handler que la
        // escribe (network-repo:save-simulation) no lo llama nadie. Los datos
        // reales están en HydraulicCalculation, con el id de la red dentro del
        // JSON de `inputs`.
        const calculos = await this.prisma.hydraulicCalculation.findMany({
          where: { projectId },
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: { name: true, createdAt: true, inputs: true }
        })

        const ultima = calculos.find(c => {
          try {
            return JSON.parse(c.inputs ?? '{}')?.networkId === red.id
          } catch {
            return false
          }
        })

        const resumen = construirResumenRed({
          nombreRed: red.nombre,
          contadores: red.contadores,
          datos: red.datos,
          ultimaSimulacion: ultima ? { nombre: ultima.name, fecha: ultima.createdAt } : null
        })

        return { success: true, data: { resumen, texto: formatearContextoRed(resumen, conHerramientas) } }
      } catch (error) {
        appLogger.error('Failed to build network context', error as Error)
        // Sin contexto es mejor no decir nada que decir que hay una red y no
        // dar ni una cifra, que es justo lo que hacía antes.
        return { success: false, error: (error as Error).message }
      }
    })
  }

  cleanup() {
    const handlers = [
      'network-repo:save',
      'network-repo:update',
      'network-repo:get-project-networks',
      'network-repo:load',
      'network-repo:get',
      'network-repo:delete',
      'network-repo:save-simulation',
      'network-repo:search',
      'network-repo:stats'
    ]

    handlers.forEach(handler => {
      ipcMain.removeAllListeners(handler)
    })
  }
}