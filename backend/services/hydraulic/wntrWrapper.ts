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
    // Use shared Python detection utility (supports macOS, Windows, Linux)
    const { findPythonPath } = require('./pythonDetector')
    this.pythonPath = findPythonPath()

    // Fix for packaged app: Use process.resourcesPath when packaged, __dirname in dev
    const { app } = require('electron')
    const isPackaged = app ? app.isPackaged : (!process.defaultApp && (process.resourcesPath && !process.resourcesPath.includes('node_modules')))

    if (isPackaged && process.resourcesPath) {
      // In packaged app, Python scripts are in resources directory
      this.scriptPath = path.join(process.resourcesPath, 'backend', 'services', 'hydraulic', 'wntrService.py')
    } else {
      // In development: try multiple possible locations
      const candidates = [
        path.join(__dirname, 'wntrService.py'),
        path.join(process.cwd(), 'backend', 'services', 'hydraulic', 'wntrService.py'),
        path.join(__dirname, '..', '..', '..', 'backend', 'services', 'hydraulic', 'wntrService.py'),
        path.join(app?.getAppPath?.() || process.cwd(), 'backend', 'services', 'hydraulic', 'wntrService.py'),
      ];
      // Use first path that looks valid (will be validated at runtime)
      this.scriptPath = candidates[0];
      // Try to find existing script
      const fs_sync = require('fs');
      for (const candidate of candidates) {
        if (fs_sync.existsSync(candidate)) {
          this.scriptPath = candidate;
          break;
        }
      }
    }
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
          reject(new Error(
            'Python was terminated by the system (macOS code signing issue).\n\n' +
            'Solution: Install Python via Homebrew:\n' +
            '  brew install python@3.11\n' +
            '  pip3 install wntr\n\n' +
            'Then set PYTHON_PATH in Settings or restart Boorie.'
          ))
        } else if (code === 9009) {
          // Windows-specific: MS Store alias redirect
          reject(new Error(
            'Python is not installed or is blocked by Windows.\n\n' +
            'To fix this:\n' +
            '1. Install Python from python.org/downloads\n' +
            '2. During installation, check "Add Python to PATH"\n' +
            '3. After installing, run: pip install wntr\n' +
            '4. Disable the Windows app alias: Settings > Apps > Advanced app settings > App execution aliases > turn off "python.exe"\n' +
            '5. Restart Boorie'
          ))
        } else {
          console.error(`Python process exited with code ${code}`)
          console.error('stderr:', stderr)
          // Extract the most relevant error line from stderr
          const stderrLines = stderr.trim().split('\n')
          const relevantError = stderrLines.find((l: string) => l.includes('Error') || l.includes('ModuleNotFoundError')) || stderrLines[stderrLines.length - 1]

          if (stderr.includes('ModuleNotFoundError') && stderr.includes('wntr')) {
            reject(new Error(
              'Python is installed but WNTR is not available.\n\n' +
              'To fix this, run in your terminal:\n' +
              '  pip install wntr\n\n' +
              'Then restart Boorie.'
            ))
          } else {
            reject(new Error(`Python error: ${relevantError || `Exit code ${code}`}`))
          }
        }
      })

      pythonProcess.on('error', (error: any) => {
        console.error('Failed to spawn Python process:', error)
        console.error('Python path:', pythonCommand)
        console.error('Script path:', this.scriptPath)
        console.error('Working directory:', process.cwd())

        if (error.code === 'ENOENT') {
          reject(new Error(
            'Python was not found on this computer.\n\n' +
            'To use hydraulic features, please install Python:\n' +
            (process.platform === 'win32'
              ? '  1. Download from python.org/downloads\n  2. Check "Add Python to PATH" during installation\n  3. Run: pip install wntr\n  4. Restart Boorie'
              : '  1. Install: brew install python@3.11 (macOS) or apt install python3 (Linux)\n  2. Run: pip3 install wntr\n  3. Restart Boorie')
          ))
        } else if (error.code === 'EACCES') {
          reject(new Error(`Permission denied running Python at: ${pythonCommand}. Try running: chmod +x ${pythonCommand}`))
        } else {
          reject(new Error(`Failed to run Python: ${error.message || error}`))
        }
      })
    })
  }

  async loadINPFile(filePath: string): Promise<{ success: boolean; data?: WNTRNetworkInfo; error?: string; filePath?: string }> {
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