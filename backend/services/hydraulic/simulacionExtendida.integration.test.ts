import { describe, it, expect } from 'vitest'
import { spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { getPythonStatus } from './pythonDetector'

/**
 * La simulación extendida de `wntrService.py`, que es lo que pide el canal
 * `wntr:run-simulation`.
 *
 * El tipo de simulación viajaba desde la interfaz hasta el CLI de Python y se
 * perdía en la última línea —`run_simulation()` sin argumentos—, así que pedir
 * la serie temporal devolvía siempre el instante t=0. Y cuando por fin llegaba,
 * la rama extendida moría al inicializar las pérdidas: WNTRSimulator no reporta
 * `headloss` y el código le pedía `.columns` a un diccionario vacío.
 *
 * Los dos fallos eran invisibles desde el resultado —`success: true` con un solo
 * paso, o un `'dict' object has no attribute 'columns'` sin más señas—, de ahí
 * que se comprueben contra WNTR de verdad y no con un doble. Se invoca el CLI
 * directamente porque `wntrWrapper` resuelve su script con un `require` que no
 * carga bajo vitest.
 */
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..')
const SCRIPT = path.join(__dirname, 'wntrService.py')
const NET1 = path.join(REPO_ROOT, 'test-files', 'Net1v3.inp')

const estado = getPythonStatus()
const canRun = estado.wntrAvailable && fs.existsSync(NET1) && fs.existsSync(SCRIPT)

const SIM_TIMEOUT = 180_000

interface Resultado {
  success: boolean
  error?: string
  data?: {
    timestamps: number[]
    node_results: Record<string, { pressure: number | number[] }>
    link_results: Record<string, { flowrate: number | number[]; velocity: number | number[] }>
  }
}

function simular(tipo: 'single' | 'extended'): Promise<Resultado> {
  return new Promise((resolve, reject) => {
    const proceso = spawn(estado.pythonPath, [SCRIPT, 'simulate', NET1, tipo], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let salida = ''
    let error = ''
    proceso.stdout.on('data', d => { salida += d })
    proceso.stderr.on('data', d => { error += d })
    proceso.on('error', reject)
    proceso.on('close', code => {
      if (code !== 0) return reject(new Error(`python salió con ${code}: ${error}`))
      try { resolve(JSON.parse(salida)) } catch { reject(new Error(`salida no es JSON: ${salida.slice(0, 300)}`)) }
    })
  })
}

describe.skipIf(!canRun)('simulación extendida', () => {
  it('devuelve la serie temporal completa, no sólo el instante inicial', async () => {
    const res = await simular('extended')

    expect(res.error).toBeUndefined()
    expect(res.success).toBe(true)

    const { timestamps, node_results, link_results } = res.data!
    expect(timestamps.length).toBeGreaterThan(1)

    // Cada magnitud es una serie alineada con los instantes: si volviera a caer
    // en `single`, esto serían escalares.
    const nudo = Object.values(node_results)[0]
    expect(Array.isArray(nudo.pressure)).toBe(true)
    expect(nudo.pressure).toHaveLength(timestamps.length)

    const tramo = Object.values(link_results)[0]
    expect(tramo.velocity).toHaveLength(timestamps.length)
    expect(tramo.flowrate).toHaveLength(timestamps.length)
  }, SIM_TIMEOUT)

  it('la presión se mueve a lo largo de la simulación', async () => {
    const res = await simular('extended')
    const series = Object.values(res.data!.node_results).map(n => n.pressure as number[])

    // En una red con demanda variable, que ningún nudo se moviera significaría
    // que se está repitiendo el mismo instante en todos los pasos.
    const alguienVaria = series.some(s => new Set(s.map(v => v.toFixed(4))).size > 1)
    expect(alguienVaria).toBe(true)
  }, SIM_TIMEOUT)

  it('`single` sigue dando sólo el instante inicial', async () => {
    const res = await simular('single')

    expect(res.success).toBe(true)
    expect(res.data!.timestamps).toEqual([0])
  }, SIM_TIMEOUT)
})
