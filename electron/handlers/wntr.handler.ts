import { ipcMain, dialog } from 'electron'
import * as fs from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { wntrWrapper } from '../../backend/services/hydraulic/wntrWrapper'
import { WNTRSimulationService } from '../../backend/services/hydraulic/simulationService'
import { WNTRAnalysisService } from '../../backend/services/hydraulic/analysisService'
import { WNTRReportService } from '../../backend/services/hydraulic/reportService'
import { WNTRResilienceService } from '../../backend/services/hydraulic/resilienceService'
import { WNTREnergyService } from '../../backend/services/hydraulic/energyService'
import { TarifaElectricaService, TARIFA_POR_DEFECTO, bloquesSolapados, type TarifaElectrica } from '../../backend/services/hydraulic/tarifaElectrica'
import { getPythonStatus } from '../../backend/services/hydraulic/pythonDetector'
import { guardrailsWrapper } from '../../backend/services/guardrails/guardrailsWrapper'

// Create service instances
const simulationService = new WNTRSimulationService()
const analysisService = new WNTRAnalysisService()
const reportService = new WNTRReportService()
const resilienceService = new WNTRResilienceService()
const energyService = new WNTREnergyService()

/**
 * La tarifa vive en la base, así que estos handlers la necesitan (#42). Es
 * opcional para no romper a quien llame sin ella: sin base se calcula con la
 * tarifa por defecto, que viaja declarada en cada resultado.
 */
export function setupWNTRHandlers(prisma?: import('@prisma/client').PrismaClient) {
  const tarifas = prisma ? new TarifaElectricaService(prisma) : null

  const tarifaDe = async (projectId?: string | null): Promise<TarifaElectrica> =>
    tarifas ? tarifas.tarifaDe(projectId) : TARIFA_POR_DEFECTO

  // Check Python/WNTR availability
  ipcMain.handle('wntr:check-python', async () => {
    try {
      return { success: true, ...getPythonStatus() }
    } catch {
      return {
        success: false,
        pythonFound: false,
        wntrAvailable: false,
        pythonVersion: null,
        platform: process.platform,
        instructions: 'Could not check Python status. Please install Python and WNTR manually.',
      }
    }
  })

  // Load EPANET file
  ipcMain.handle('wntr:load-inp-file', async () => {
    try {
      // Pre-validate Python/WNTR before opening file dialog
      const pythonStatus = getPythonStatus()
      if (!pythonStatus.pythonFound) {
        const platformInstructions = process.platform === 'win32'
          ? '1. Descargue Python desde python.org/downloads\n2. Durante la instalación, marque "Add Python to PATH"\n3. Abra una terminal y ejecute: pip install wntr\n4. Reinicie Boorie'
          : process.platform === 'darwin'
          ? '1. Ejecute en terminal: ./setup-python-wntr.sh\n   (o manualmente: brew install python@3.11 && pip3 install wntr)\n2. Reinicie Boorie'
          : '1. Ejecute: sudo apt install python3 python3-pip && pip3 install wntr\n2. Reinicie Boorie'
        return {
          success: false,
          error: 'Python no está instalado en este equipo.\n\n' +
            'Python es necesario para cargar y analizar redes hidráulicas (archivos .inp).\n\n' +
            'Pasos para instalar:\n' + platformInstructions
        }
      }
      if (!pythonStatus.wntrAvailable) {
        return {
          success: false,
          error: 'WNTR no está instalado.\n\n' +
            'WNTR es la librería de Python necesaria para el análisis de redes hidráulicas.\n\n' +
            'Para instalarlo, ejecute en una terminal:\n' +
            (process.platform === 'darwin'
              ? './setup-python-wntr.sh\n(o manualmente: pip3 install wntr)'
              : 'pip install wntr') +
            '\n\nLuego reinicie Boorie.'
        }
      }

      // Show file dialog
      const result = await dialog.showOpenDialog({
        title: 'Select EPANET Input File',
        filters: [
          { name: 'EPANET Files', extensions: ['inp'] },
          { name: 'All Files', extensions: ['*'] }
        ],
        properties: ['openFile']
      })

      if (result.canceled || !result.filePaths.length) {
        return { success: false, error: 'No file selected' }
      }

      const filePath = result.filePaths[0]

      // Load the file using WNTR
      const loadResult = await wntrWrapper.loadINPFile(filePath)

      if (loadResult.success) {
        // Store the file path for future operations
        global.currentWNTRFile = filePath
        // Include filePath in the result so the frontend can store it
        loadResult.filePath = filePath
      }

      return loadResult
    } catch (error) {
      console.error('Error loading INP file:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  // Load EPANET file from path
  ipcMain.handle('wntr:load-inp-from-path', async (event, filePath: string) => {
    try {
      // Pre-validate Python/WNTR
      const pythonStatus = getPythonStatus()
      if (!pythonStatus.pythonFound) {
        const platformInstructions = process.platform === 'win32'
          ? '1. Descargue Python desde python.org/downloads\n2. Durante la instalación, marque "Add Python to PATH"\n3. Abra una terminal y ejecute: pip install wntr\n4. Reinicie Boorie'
          : process.platform === 'darwin'
          ? '1. Ejecute en terminal: ./setup-python-wntr.sh\n   (o manualmente: brew install python@3.11 && pip3 install wntr)\n2. Reinicie Boorie'
          : '1. Ejecute: sudo apt install python3 python3-pip && pip3 install wntr\n2. Reinicie Boorie'
        return {
          success: false,
          error: 'Python no está instalado en este equipo.\n\n' +
            'Python es necesario para cargar y analizar redes hidráulicas (archivos .inp).\n\n' +
            'Pasos para instalar:\n' + platformInstructions
        }
      }
      if (!pythonStatus.wntrAvailable) {
        return {
          success: false,
          error: 'WNTR no está instalado.\n\n' +
            'WNTR es la librería de Python necesaria para el análisis de redes hidráulicas.\n\n' +
            'Para instalarlo, ejecute en una terminal:\n' +
            (process.platform === 'darwin'
              ? './setup-python-wntr.sh\n(o manualmente: pip3 install wntr)'
              : 'pip install wntr') +
            '\n\nLuego reinicie Boorie.'
        }
      }

      const loadResult = await wntrWrapper.loadINPFile(filePath)

      if (loadResult.success) {
        // Store the file path for future operations
        global.currentWNTRFile = filePath
        loadResult.filePath = filePath
      }

      return loadResult
    } catch (error) {
      console.error('Error loading INP file:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  // Run hydraulic simulation
  ipcMain.handle('wntr:run-simulation', async (event, options?: { simulationType?: 'single' | 'extended' }) => {
    try {
      if (!global.currentWNTRFile) {
        return { success: false, error: 'No EPANET file loaded' }
      }

      const simulationType = options?.simulationType || 'single'

      // Guardrail: execution rail — sanity-check parameters before launching
      // a potentially long Python simulation.
      const verdict = await guardrailsWrapper.validateExecution('wntr.runSimulation', {
        file: global.currentWNTRFile,
        simulationType,
      })
      if (!verdict.allow) {
        return {
          success: false,
          blockedBy: 'guardrail:execution',
          error: `Simulación rechazada por guardrail: ${verdict.reason}`,
        }
      }

      const result = await wntrWrapper.runSimulation(global.currentWNTRFile, simulationType)

      return result
    } catch (error) {
      console.error('Error running simulation:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  // Analyze network
  ipcMain.handle('wntr:analyze-network', async () => {
    try {
      if (!global.currentWNTRFile) {
        return { success: false, error: 'No EPANET file loaded' }
      }

      const result = await wntrWrapper.analyzeNetwork(global.currentWNTRFile)
      
      return result
    } catch (error) {
      console.error('Error analyzing network:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  // Export network to JSON
  ipcMain.handle('wntr:export-json', async () => {
    try {
      if (!global.currentWNTRFile) {
        return { success: false, error: 'No EPANET file loaded' }
      }

      // Show save dialog
      const result = await dialog.showSaveDialog({
        title: 'Export Network as JSON',
        filters: [
          { name: 'JSON Files', extensions: ['json'] },
          { name: 'All Files', extensions: ['*'] }
        ],
        defaultPath: 'network_export.json'
      })

      if (result.canceled || !result.filePath) {
        return { success: false, error: 'Export canceled' }
      }

      const exportResult = await wntrWrapper.exportToJSON(global.currentWNTRFile, result.filePath)
      
      return exportResult
    } catch (error) {
      console.error('Error exporting network:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  // Save INP file from content
  ipcMain.handle('wntr:save-inp-file', async (event, content: string, fileName?: string) => {
    try {
      // Show save dialog
      const result = await dialog.showSaveDialog({
        title: 'Save EPANET Input File',
        filters: [
          { name: 'EPANET Files', extensions: ['inp'] },
          { name: 'All Files', extensions: ['*'] }
        ],
        defaultPath: fileName || 'network.inp'
      })

      if (result.canceled || !result.filePath) {
        return { success: false, error: 'Save canceled' }
      }

      // Write the file
      await fs.writeFile(result.filePath, content, 'utf8')
      
      return {
        success: true,
        filePath: result.filePath
      }
    } catch (error) {
      console.error('Error saving INP file:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  // Analyze network topology
  ipcMain.handle('wntr:analyze-network-topology', async (_event, _options: any) => {
    try {
      if (!global.currentWNTRFile) {
        return { success: false, error: 'No EPANET file loaded' }
      }

      const result = await analysisService.analyzeNetworkTopology(global.currentWNTRFile)
      return result // Return the result directly, it already has the correct structure
    } catch (error) {
      console.error('Error analyzing network topology:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  // Analyze component criticality
  ipcMain.handle('wntr:analyze-component-criticality', async (event, options: any) => {
    try {
      if (!global.currentWNTRFile) {
        return { success: false, error: 'No EPANET file loaded' }
      }

      const result = await analysisService.analyzeComponentCriticality(global.currentWNTRFile, options)
      return result // Return the result directly, it already has the correct structure
    } catch (error) {
      console.error('Error analyzing component criticality:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  // Calculate resilience metrics
  ipcMain.handle('wntr:calculate-resilience-metrics', async (event, options: any) => {
    try {
      if (!global.currentWNTRFile) {
        return { success: false, error: 'No EPANET file loaded' }
      }

      const result = await analysisService.calculateResilienceMetrics(global.currentWNTRFile, options)
      return result // Return the result directly, it already has the correct structure
    } catch (error) {
      console.error('Error calculating resilience metrics:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  // Run hydraulic simulation with specific parameters
  ipcMain.handle('wntr:run-hydraulic-simulation', async (event, options: any) => {
    try {
      if (!global.currentWNTRFile) {
        return { success: false, error: 'No EPANET file loaded' }
      }

      const result = await simulationService.runHydraulicSimulation(global.currentWNTRFile, options)
      return result // Return the result directly, it already has the correct structure
    } catch (error) {
      console.error('Error running hydraulic simulation:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  // Run water quality simulation
  ipcMain.handle('wntr:run-water-quality-simulation', async (event, options: any) => {
    try {
      if (!global.currentWNTRFile) {
        return { success: false, error: 'No EPANET file loaded' }
      }

      const result = await simulationService.runWaterQualitySimulation(global.currentWNTRFile, options)
      return result // Return the result directly, it already has the correct structure
    } catch (error) {
      console.error('Error running water quality simulation:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  // Run scenario simulation
  ipcMain.handle('wntr:run-scenario-simulation', async (event, options: any) => {
    try {
      if (!global.currentWNTRFile) {
        return { success: false, error: 'No EPANET file loaded' }
      }

      const result = await simulationService.runScenarioSimulation(global.currentWNTRFile, options)
      return result // Return the result directly, it already has the correct structure
    } catch (error) {
      console.error('Error running scenario simulation:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  // Generate comprehensive report
  ipcMain.handle('wntr:generate-comprehensive-report', async (event, options: any) => {
    try {
      if (!global.currentWNTRFile) {
        return { success: false, error: 'No EPANET file loaded' }
      }

      const result = await reportService.generateComprehensiveReport(options)
      return result // Return the result directly, it already has the correct structure
    } catch (error) {
      console.error('Error generating comprehensive report:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  // Generate analysis report
  ipcMain.handle('wntr:generate-analysis-report', async (event, options: any) => {
    try {
      if (!global.currentWNTRFile) {
        return { success: false, error: 'No EPANET file loaded' }
      }

      const { projectData, topologyAnalysis, criticalityAnalysis, customFileName } = options
      const result = await reportService.generateAnalysisReport(projectData, topologyAnalysis, criticalityAnalysis, customFileName)
      return result // Return the result directly, it already has the correct structure
    } catch (error) {
      console.error('Error generating analysis report:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  // Generate simulation report
  ipcMain.handle('wntr:generate-simulation-report', async (event, options: any) => {
    try {
      if (!global.currentWNTRFile) {
        return { success: false, error: 'No EPANET file loaded' }
      }

      const { projectData, simulationResults, customFileName } = options
      const result = await reportService.generateSimulationReport(projectData, simulationResults, customFileName)
      return result // Return the result directly, it already has the correct structure
    } catch (error) {
      console.error('Error generating simulation report:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  // --- Resilience routines epic (#26): skeletonization, service interruption,
  // resilience indicators, fragility curve ---

  // Skeletonize network (#24)
  ipcMain.handle('wntr:skeletonize-network', async (event, options: any) => {
    try {
      if (!global.currentWNTRFile) {
        return { success: false, error: 'No EPANET file loaded' }
      }

      const result = await resilienceService.skeletonizeNetwork(global.currentWNTRFile, options)
      return result
    } catch (error) {
      console.error('Error skeletonizing network:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  // Simulate service interruption / component failure (#22)
  ipcMain.handle('wntr:simulate-component-failure', async (event, options: any) => {
    try {
      if (!global.currentWNTRFile) {
        return { success: false, error: 'No EPANET file loaded' }
      }

      const verdict = await guardrailsWrapper.validateExecution('wntr.simulateComponentFailure', {
        file: global.currentWNTRFile,
        components: options?.components,
      })
      if (!verdict.allow) {
        return {
          success: false,
          blockedBy: 'guardrail:execution',
          error: `Simulación rechazada por guardrail: ${verdict.reason}`,
        }
      }

      const result = await resilienceService.simulateComponentFailure(global.currentWNTRFile, options)
      return result
    } catch (error) {
      console.error('Error simulating component failure:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  /**
   * Escenario declarativo de interrupción del servicio (#43).
   *
   * El guardrail de ejecución ve la definición entera y no sólo el fichero: un
   * escenario puede cerrar media red o multiplicar la demanda por cien, y eso es
   * justo lo que ese raíl existe para mirar.
   */
  ipcMain.handle('wntr:simulate-scenario', async (event, definicion: any) => {
    try {
      if (!definicion?.eventos?.length) {
        return { success: false, error: 'El escenario no declara ningún evento' }
      }

      /**
       * El escenario puede venir del chat, que no ha pasado por la vista de red
       * (#44). Depender de `currentWNTRFile` significaba que proponer un
       * escenario desde el chat acabase en «No EPANET file loaded» —medido, es
       * lo que pasó— aunque el agente sí supiera sobre qué red hablaba. Con el
       * id de la red se materializa su .inp desde la base, que es la misma
       * fuente que usa `network-repo:load`: así la red que se simula es la que
       * el agente tenía delante y no la que otra pantalla dejó cargada.
       */
      let fichero = global.currentWNTRFile
      if (definicion.red_id) {
        try {
          const red = await prisma?.hydraulicNetwork.findUnique({ where: { id: definicion.red_id } })
          if (red?.fileContent) {
            fichero = join(tmpdir(), `boorie-escenario-${red.id}.inp`)
            await fs.writeFile(fichero, red.fileContent, 'utf-8')
          }
        } catch (error) {
          console.warn('No se pudo materializar la red del escenario:', error)
        }
      }
      if (!fichero) {
        return { success: false, error: 'No hay ninguna red cargada sobre la que simular el escenario' }
      }

      const verdict = await guardrailsWrapper.validateExecution('wntr.simulateScenario', {
        file: fichero,
        eventos: definicion.eventos,
        duration_hours: definicion.duration_hours,
      })
      if (!verdict.allow) {
        return {
          success: false,
          blockedBy: 'guardrail:execution',
          error: `Escenario rechazado por guardrail: ${verdict.reason}`,
        }
      }

      return await resilienceService.simulateScenario(fichero, definicion)
    } catch (error) {
      console.error('Error simulating scenario:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  /**
   * Consumo y coste de bombeo, con la tarifa del proyecto (#42).
   *
   * La tarifa se resuelve aquí y no en el renderer porque es un dato del
   * proyecto y porque el resultado tiene que decir con qué precio se calculó:
   * un ahorro de 40 kWh no significa nada sin la tarifa que lo convierte en
   * dinero.
   */
  ipcMain.handle('wntr:energy-analyze', async (_e, options?: { projectId?: string | null; duration_hours?: number }) => {
    try {
      if (!global.currentWNTRFile) {
        return { success: false, error: 'No EPANET file loaded' }
      }
      const tarifa = await tarifaDe(options?.projectId)
      const resultado = await energyService.analizar(global.currentWNTRFile, {
        duration_hours: options?.duration_hours,
        tarifa,
        eficiencia_global: tarifa.eficienciaGlobal,
      })
      return { ...resultado, avisos: { bloques_solapados: bloquesSolapados(tarifa) } }
    } catch (error) {
      console.error('Error analyzing energy:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  /**
   * Ahorro medido de una medida operativa (#42).
   *
   * Pasa por el guardrail de ejecución igual que un escenario: una medida cierra
   * bombas, y apagar el bombeo doce horas «ahorra» mucha energía.
   */
  ipcMain.handle('wntr:energy-verify', async (_e, options: any) => {
    try {
      if (!global.currentWNTRFile) {
        return { success: false, error: 'No EPANET file loaded' }
      }
      if (!options?.medidas?.length) {
        return { success: false, error: 'No se declaró ninguna medida que verificar' }
      }

      const verdict = await guardrailsWrapper.validateExecution('wntr.energyVerify', {
        file: global.currentWNTRFile,
        medidas: options.medidas,
      })
      if (!verdict.allow) {
        return {
          success: false,
          blockedBy: 'guardrail:execution',
          error: `Medida rechazada por guardrail: ${verdict.reason}`,
        }
      }

      const tarifa = await tarifaDe(options.projectId)
      return await energyService.verificarMedida(global.currentWNTRFile, {
        ...options,
        tarifa,
        eficiencia_global: tarifa.eficienciaGlobal,
      })
    } catch (error) {
      console.error('Error verifying energy measure:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  // Tarifa eléctrica del proyecto (#42). Misma herencia que los ajustes de
  // indexación (#41): un proyecto sin tarifa propia sigue la general.
  ipcMain.handle('energia:tarifa', async (_e, projectId?: string | null) => {
    try {
      if (!tarifas) return { success: true, data: { tarifa: TARIFA_POR_DEFECTO, propia: false, solapados: [] } }
      const tarifa = await tarifas.tarifaDe(projectId)
      const propia = projectId ? (await tarifas.tarifaPropiaDe(projectId)) !== null : false
      return { success: true, data: { tarifa, propia, solapados: bloquesSolapados(tarifa) } }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  ipcMain.handle('energia:guardar-tarifa', async (_e, data: { projectId?: string | null; tarifa: Partial<TarifaElectrica> }) => {
    try {
      if (!tarifas) return { success: false, error: 'Sin base de datos no se puede guardar la tarifa' }
      const guardada = await tarifas.guardarTarifa(data?.projectId ?? null, data?.tarifa ?? {})
      return { success: true, data: { tarifa: guardada, solapados: bloquesSolapados(guardada) } }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  ipcMain.handle('energia:olvidar-tarifa', async (_e, projectId: string) => {
    try {
      if (!tarifas) return { success: false, error: 'Sin base de datos no hay tarifa que olvidar' }
      await tarifas.olvidarTarifa(projectId)
      return { success: true, data: { tarifa: await tarifas.tarifaDe(projectId), propia: false } }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  // Resilience indicators: Todini, entropy, hydraulic redundancy (#23)
  ipcMain.handle('wntr:calculate-resilience-indicators', async (event, options: any) => {
    try {
      if (!global.currentWNTRFile) {
        return { success: false, error: 'No EPANET file loaded' }
      }

      const result = await resilienceService.calculateResilienceIndicators(global.currentWNTRFile, options)
      return result
    } catch (error) {
      console.error('Error calculating resilience indicators:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  // Fragility curve (#25)
  ipcMain.handle('wntr:generate-fragility-curve', async (event, options: any) => {
    try {
      if (!global.currentWNTRFile) {
        return { success: false, error: 'No EPANET file loaded' }
      }

      const result = await resilienceService.generateFragilityCurve(global.currentWNTRFile, options)
      return result
    } catch (error) {
      console.error('Error generating fragility curve:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })
}

// Type declaration for global
declare global {
  // eslint-disable-next-line no-var
  var currentWNTRFile: string | undefined
}