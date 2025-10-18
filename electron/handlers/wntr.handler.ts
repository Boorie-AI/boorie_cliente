import { ipcMain, dialog } from 'electron'
import * as path from 'path'
import * as fs from 'fs/promises'
import { wntrWrapper } from '../../backend/services/hydraulic/wntrWrapper'
import { WNTRSimulationService } from '../../backend/services/hydraulic/simulationService'
import { WNTRAnalysisService } from '../../backend/services/hydraulic/analysisService'
import { WNTRReportService } from '../../backend/services/hydraulic/reportService'

// Create service instances
const simulationService = new WNTRSimulationService()
const analysisService = new WNTRAnalysisService()
const reportService = new WNTRReportService()

export function setupWNTRHandlers() {
  // Load EPANET file
  ipcMain.handle('wntr:load-inp-file', async () => {
    try {
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
      const loadResult = await wntrWrapper.loadINPFile(filePath)
      
      if (loadResult.success) {
        // Store the file path for future operations
        global.currentWNTRFile = filePath
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
  ipcMain.handle('wntr:analyze-network-topology', async (event, options: any) => {
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
      console.log('wntr:analyze-component-criticality called with options:', options);
      console.log('Current WNTR file:', global.currentWNTRFile);
      
      if (!global.currentWNTRFile) {
        return { success: false, error: 'No EPANET file loaded' }
      }

      const result = await analysisService.analyzeComponentCriticality(global.currentWNTRFile, options)
      console.log('Criticality analysis result:', result);
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
      console.log('wntr:calculate-resilience-metrics called with options:', options);
      console.log('Current WNTR file:', global.currentWNTRFile);
      
      if (!global.currentWNTRFile) {
        return { success: false, error: 'No EPANET file loaded' }
      }

      const result = await analysisService.calculateResilienceMetrics(global.currentWNTRFile, options)
      console.log('Resilience metrics result:', result);
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
}

// Type declaration for global
declare global {
  var currentWNTRFile: string | undefined
}