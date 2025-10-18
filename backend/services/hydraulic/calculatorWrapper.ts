import { spawn } from 'child_process'
import * as path from 'path'
import { HydraulicFormula, CalculationResult } from '../../../src/types/hydraulic'

export class HydraulicCalculatorWrapper {
  private pythonPath: string
  private scriptPath: string

  constructor() {
    // Use the same Python path detection as WNTR
    // First try the environment variable, then use system python3
    this.pythonPath = process.env.PYTHON_PATH || 'python3'
    this.scriptPath = path.join(__dirname, 'hydraulicCalculator.py')
    console.log('HydraulicCalculatorWrapper initialized with:', {
      pythonPath: this.pythonPath,
      scriptPath: this.scriptPath
    })
  }

  async getFormulas(): Promise<HydraulicFormula[]> {
    return this.runPythonScript('formulas', [])
  }

  async calculate(
    formulaId: string, 
    inputs: Record<string, { value: number; unit: string }>
  ): Promise<CalculationResult> {
    const result = await this.runPythonScript('calculate', [
      formulaId,
      JSON.stringify(inputs)
    ])
    
    return result
  }

  private async runPythonScript(command: string, args: string[]): Promise<any> {
    return new Promise((resolve, reject) => {
      console.log('Running Python script:', {
        pythonPath: this.pythonPath,
        scriptPath: this.scriptPath,
        command,
        args
      })
      
      const pythonProcess = spawn(this.pythonPath, [this.scriptPath, command, ...args], {
        env: {
          ...process.env,
          PYTHONPATH: path.dirname(this.scriptPath),
          PYTHONUNBUFFERED: '1'
        }
      })
      
      let stdout = ''
      let stderr = ''

      // Handle stdin EPIPE
      pythonProcess.stdin.on('error', (error: any) => {
        if (error.code === 'EPIPE') {
          console.warn('Calculator stdin EPIPE error - Python process closed input stream')
        } else {
          console.error('Calculator stdin error:', error)
        }
      })

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString()
      })
      
      pythonProcess.stdout.on('error', (error: any) => {
        if (error.code === 'EPIPE') {
          console.warn('Calculator stdout EPIPE error - Python process may have closed unexpectedly')
        } else {
          console.error('Calculator stdout error:', error)
        }
      })

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString()
        console.log('Python stderr:', data.toString())
      })
      
      pythonProcess.stderr.on('error', (error: any) => {
        if (error.code === 'EPIPE') {
          console.warn('Calculator stderr EPIPE error - Python process may have closed unexpectedly')
        } else {
          console.error('Calculator stderr error:', error)
        }
      })

      pythonProcess.on('close', (code) => {
        console.log('Python process closed:', { code, stdout, stderr })
        
        if (code === 0) {
          try {
            const result = JSON.parse(stdout)
            console.log('Parsed Python result:', result)
            if (result.success) {
              console.log('Returning data:', result.data)
              resolve(result.data)
            } else {
              reject(new Error(result.error))
            }
          } catch (error) {
            console.error('JSON parse error:', error)
            reject(new Error(`Failed to parse Python output: ${stdout}`))
          }
        } else {
          reject(new Error(`Python script error: ${stderr || 'Unknown error'}`))
        }
      })

      pythonProcess.on('error', (error) => {
        console.error('Python process error:', error)
        reject(new Error(`Failed to run Python script: ${error.message}`))
      })
    })
  }
}

export const calculatorWrapper = new HydraulicCalculatorWrapper()