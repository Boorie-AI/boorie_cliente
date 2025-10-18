import { spawn } from 'child_process'
import * as path from 'path'
import * as fs from 'fs/promises'

export interface WNTRNetworkInfo {
  name: string
  summary: {
    junctions: number
    tanks: number
    reservoirs: number
    pipes: number
    pumps: number
    valves: number
    patterns: number
    curves: number
  }
  nodes: WNTRNode[]
  links: WNTRLink[]
  options: WNTROptions
  patterns: Record<string, number[]>
  curves: Record<string, WNTRCurve>
}

export interface WNTRNode {
  id: string
  label: string
  type: 'junction' | 'tank' | 'reservoir'
  x: number
  y: number
  [key: string]: any
}

export interface WNTRLink {
  id: string
  label: string
  type: 'pipe' | 'pump' | 'valve'
  from: string
  to: string
  [key: string]: any
}

export interface WNTROptions {
  time: any
  hydraulic: any
  quality: any
  solver: any
}

export interface WNTRCurve {
  curve_type: string
  points: [number, number][]
}

export interface SimulationResults {
  node_results: Record<string, Record<string, number>> | Record<number, Record<string, Record<string, number>>>
  link_results: Record<string, Record<string, number>> | Record<number, Record<string, Record<string, number>>>
  timestamps: number[]
}

export interface NetworkAnalysis {
  topology: {
    is_connected: boolean
    bridges: string[][]
    articulation_points: string[]
  }
  hydraulic_analysis: any
  demand_analysis: any
  energy_analysis: any
}

class WNTRWrapper {
  private pythonPath: string
  private scriptPath: string

  constructor() {
    // Determine the best Python path to avoid code signing issues
    this.pythonPath = this.findBestPythonPath()
    this.scriptPath = path.join(__dirname, 'wntrService.py')
  }

  private findBestPythonPath(): string {
    // Use environment variable if set
    if (process.env.PYTHON_PATH) {
      console.log(`Using Python from PYTHON_PATH: ${process.env.PYTHON_PATH}`)
      return process.env.PYTHON_PATH
    }

    // On macOS, prefer non-system Python to avoid code signing issues
    if (process.platform === 'darwin') {
      const possiblePaths = [
        // Check for venv in common locations first
        `${process.env.HOME}/repositorio/uruguay_wihisper/venv/bin/python3`,
        `${process.env.HOME}/venv/bin/python3`,
        `${process.env.HOME}/.venv/bin/python3`,
        './venv/bin/python3',
        '../venv/bin/python3',
        // Then check for system-wide installations
        '/opt/homebrew/bin/python3',              // Homebrew on Apple Silicon
        '/usr/local/bin/python3',                  // Homebrew on Intel
        `${process.env.HOME}/.pyenv/shims/python3`, // pyenv
        '/opt/miniconda3/bin/python3',            // Miniconda
        '/opt/anaconda3/bin/python3',             // Anaconda
        `${process.env.HOME}/miniconda3/bin/python3`,
        `${process.env.HOME}/anaconda3/bin/python3`
        // Explicitly avoid system Python to prevent code signing issues
      ]
      
      const fs = require('fs')
      for (const pythonPath of possiblePaths) {
        if (fs.existsSync(pythonPath)) {
          console.log(`Found Python at: ${pythonPath}`)
          // Check if this Python has the required packages
          try {
            const { execSync } = require('child_process')
            execSync(`${pythonPath} -c "import wntr; import numpy"`, { stdio: 'pipe' })
            console.log(`Using Python with WNTR installed: ${pythonPath}`)
            return pythonPath
          } catch (e) {
            console.log(`Python at ${pythonPath} doesn't have required packages, trying next...`)
          }
        }
      }
      
      // If no suitable Python found, warn the user
      console.error('WARNING: No Python installation with WNTR found. This may cause issues.')
      console.error('Please install WNTR in a virtual environment and set PYTHON_PATH environment variable.')
    }

    // Default fallback
    return process.platform === 'win32' ? 'python' : 'python3'
  }

  private async runPythonScript(command: string, args: string[]): Promise<any> {
    return new Promise((resolve, reject) => {
      // Set environment to avoid macOS code signing issues
      const env = {
        ...process.env,
        PYTHONPATH: path.dirname(this.scriptPath),
        // Disable macOS library validation that causes code signing issues
        DYLD_LIBRARY_PATH: '',
        // Use spawn mode to avoid forking issues
        PYTHONUNBUFFERED: '1'
      }
      
      // For macOS with system Python, use a workaround
      const isSystemPython = this.pythonPath.includes('/usr/bin/') || this.pythonPath.includes('/Library/Developer');
      const spawnOptions: any = {
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false
      };
      
      // Use Python directly
      const pythonCommand = this.pythonPath;
      const pythonArgs = [this.scriptPath, command, ...args];
      
      if (isSystemPython && process.platform === 'darwin') {
        console.warn('Using system Python on macOS - WNTR operations may fail due to code signing issues');
        console.warn('For best results, install Python via Homebrew: brew install python@3.11');
      }
      
      const pythonProcess = spawn(pythonCommand, pythonArgs, spawnOptions)
      
      let stdout = ''
      let stderr = ''
      
      // Handle EPIPE on stdin
      pythonProcess.stdin.on('error', (error: any) => {
        if (error.code === 'EPIPE') {
          console.warn('WNTR stdin EPIPE error - Python process closed input stream')
        } else {
          console.error('WNTR stdin error:', error)
        }
      })

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString()
      })
      
      pythonProcess.stdout.on('error', (error: any) => {
        if (error.code === 'EPIPE') {
          console.warn('WNTR stdout EPIPE error - Python process may have closed unexpectedly')
        } else {
          console.error('WNTR stdout error:', error)
        }
      })

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString()
        // Log Python errors for debugging
        if (stderr.includes('Error') || stderr.includes('Warning')) {
          console.error('Python stderr:', data.toString())
        }
      })
      
      pythonProcess.stderr.on('error', (error: any) => {
        if (error.code === 'EPIPE') {
          console.warn('WNTR stderr EPIPE error - Python process may have closed unexpectedly')
        } else {
          console.error('WNTR stderr error:', error)
        }
      })

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(stdout)
            resolve(result)
          } catch (error) {
            console.error('Failed to parse output:', stdout)
            reject(new Error(`Failed to parse Python output: ${stdout}`))
          }
        } else if (code === -9) {
          reject(new Error('Python process was killed (SIGKILL). This is likely due to macOS code signing issues with system Python. Please use a virtual environment.'))
        } else {
          console.error(`Python process exited with code ${code}`)
          console.error('stderr:', stderr)
          reject(new Error(`Python script error (code ${code}): ${stderr}`))
        }
      })

      pythonProcess.on('error', (error: any) => {
        console.error('Failed to spawn Python process:', error)
        console.error('Python path:', pythonCommand)
        console.error('Script path:', this.scriptPath)
        console.error('Working directory:', process.cwd())
        
        if (error.code === 'ENOENT') {
          reject(new Error(`Python executable not found at: ${pythonCommand}. Please install Python or check your PYTHON_PATH environment variable.`))
        } else if (error.code === 'EACCES') {
          reject(new Error(`Permission denied accessing Python at: ${pythonCommand}`))
        } else {
          reject(new Error(`Failed to run Python script: ${error.message || error}`))
        }
      })
    })
  }

  async loadINPFile(filePath: string): Promise<{ success: boolean; data?: WNTRNetworkInfo; error?: string }> {
    try {
      // Check if file exists
      await fs.access(filePath)
      
      const result = await this.runPythonScript('load', [filePath])
      return result
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  async runSimulation(filePath: string, simulationType: 'single' | 'extended' = 'single'): Promise<{ success: boolean; data?: SimulationResults; error?: string }> {
    try {
      // For now, we'll load and simulate in one call
      // In the future, we might want to maintain state in the Python process
      const loadResult = await this.runPythonScript('load', [filePath])
      if (!loadResult.success) {
        return loadResult
      }

      const result = await this.runPythonScript('simulate', [filePath, simulationType])
      return result
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  async analyzeNetwork(filePath: string): Promise<{ success: boolean; data?: NetworkAnalysis; error?: string }> {
    try {
      const result = await this.runPythonScript('analyze', [filePath])
      return result
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  async exportToJSON(filePath: string, outputPath: string): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const result = await this.runPythonScript('export', [filePath, outputPath])
      return result
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }
}

export const wntrWrapper = new WNTRWrapper()