import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawn, spawnSync } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { getPythonStatus } from './pythonDetector'

/**
 * Redes que el WNTRSimulator de WNTR 1.5 no resuelve (#274): válvulas PBV o
 * GPV y la fórmula de Darcy-Weisbach.
 *
 * Con una PBV ninguna simulación arrancaba; las GPV se cambiaban en silencio
 * por una tubería de 1 m y D-W se pasaba a Hazen-Williams, así que la cifra
 * salía con `success: true` y no era la de la red. Esas redes van ahora por
 * EPANET, y se comprueba contra la física de cada válvula —la PBV impone su
 * pérdida, la GPV sigue su curva—, que es lo que el sustituto no cumplía.
 */
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..')
const NET1 = path.join(REPO_ROOT, 'test-files', 'Net1v3.inp')

const estado = getPythonStatus()
const canRun = estado.wntrAvailable && fs.existsSync(NET1)

const SIM_TIMEOUT = 180_000
const PERDIDA_PBV_M = 5
const CURVA_GPV: [number, number][] = [[0, 0], [0.02, 3], [0.05, 15]]

let carpeta: string
const red = (tipo: string) => path.join(carpeta, `net1-${tipo}.inp`)

// La tubería 12 de Net1 (nudos 12 → 13) pasa a ser la válvula V12.
const CREAR_REDES = `
import sys, wntr
src, out, perdida, curva = sys.argv[1], sys.argv[2], float(sys.argv[3]), eval(sys.argv[4])
for tipo in ('pbv', 'gpv'):
    wn = wntr.network.WaterNetworkModel(src)
    tubo = wn.get_link('12')
    wn.remove_link('12')
    if tipo == 'gpv':
        wn.add_curve('HL1', 'HEADLOSS', curva)
        wn.add_valve('V12', '12', '13', diameter=tubo.diameter, valve_type='GPV', initial_setting='HL1')
    else:
        wn.add_valve('V12', '12', '13', diameter=tubo.diameter, valve_type='PBV', initial_setting=perdida)
    wntr.network.write_inpfile(wn, f'{out}/net1-{tipo}.inp')

# Como la red de riego de Luis: Darcy-Weisbach y guardada por EPANET en
# Windows, en cp1252, con acentos en un comentario y en un identificador.
wn = wntr.network.WaterNetworkModel(src)
wn.options.hydraulic.headloss = 'D-W'
for _, tubo in wn.pipes():
    tubo.roughness = 0.1
wn.add_junction('Añil', elevation=wn.get_node('22').elevation)
wn.add_pipe('P-Añil', '22', 'Añil', length=50, diameter=0.1, roughness=0.1)
wntr.network.write_inpfile(wn, f'{out}/dw.inp')
texto = open(f'{out}/dw.inp', encoding='utf-8').read()
texto = texto.replace('[PATTERNS]\\n', '[PATTERNS]\\n;Patron de Inyección K cada 5 minutos\\n', 1)
open(f'{out}/net1-dw-cp1252.inp', 'w', encoding='cp1252').write(texto)
`

function correr(script: string, args: string[]): Promise<any> {
  return new Promise((resolve, reject) => {
    const proceso = spawn(estado.pythonPath, [path.join(__dirname, script), ...args], {
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

function interpolar(curva: [number, number][], x: number): number {
  for (let i = 1; i < curva.length; i++) {
    const [x0, y0] = curva[i - 1]
    const [x1, y1] = curva[i]
    if (x <= x1) return y0 + (y1 - y0) * (x - x0) / (x1 - x0)
  }
  throw new Error(`caudal ${x} fuera de la curva`)
}

describe.skipIf(!canRun)('válvulas que sólo resuelve EPANET', () => {
  beforeAll(() => {
    carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'boorie-valvulas-'))
    const r = spawnSync(estado.pythonPath, ['-c', CREAR_REDES, NET1, carpeta, String(PERDIDA_PBV_M), JSON.stringify(CURVA_GPV)])
    if (r.status !== 0) throw new Error(String(r.stderr))
  })

  afterAll(() => fs.rmSync(carpeta, { recursive: true, force: true }))

  it('una red con PBV se simula y la válvula impone su pérdida', async () => {
    const res = await correr('wntrService.py', ['simulate', red('pbv'), 'single'])

    expect(res.error).toBeUndefined()
    expect(res.success).toBe(true)
    const { node_results } = res.data
    expect(Math.abs(node_results['12'].head - node_results['13'].head)).toBeCloseTo(PERDIDA_PBV_M, 2)
  }, SIM_TIMEOUT)

  it('una red con GPV sigue la curva de la válvula, no una tubería sustituta', async () => {
    const res = await correr('wntr_simulation_service.py', ['run_hydraulic', red('gpv'), '{"duration": 0}'])

    expect(res.success).toBe(true)
    const { node_results, link_results } = res.data
    const caudal = link_results.V12.flowrate[0]
    expect(caudal).toBeGreaterThan(0)
    const perdida = node_results['12'].head[0] - node_results['13'].head[0]
    expect(perdida).toBeCloseTo(interpolar(CURVA_GPV, caudal), 2)
  }, SIM_TIMEOUT)

  it('la trazabilidad dice qué simulador resolvió la red', async () => {
    const res = await correr('wntr_energy_service.py', ['analizar', red('pbv'), '{}'])

    expect(res.success).toBe(true)
    expect(res.data.trazabilidad.simulador).toBe('EpanetSimulator')
  }, SIM_TIMEOUT)

  it('una red D-W guardada en cp1252 carga con sus identificadores intactos y se simula con D-W', async () => {
    const carga = await correr('wntrService.py', ['load', red('dw-cp1252')])
    expect(carga.error).toBeUndefined()
    expect(carga.success).toBe(true)
    expect(carga.data.nodes.map((n: { id: string }) => n.id)).toContain('Añil')

    const res = await correr('wntr_energy_service.py', ['analizar', red('dw-cp1252'), '{}'])
    expect(res.success).toBe(true)
    expect(res.data.trazabilidad.simulador).toBe('EpanetSimulator')
  }, SIM_TIMEOUT)

  it('un escenario con fuga sobre una red con PBV se rechaza en lugar de inventar la cifra', async () => {
    const opciones = { eventos: [{ tipo: 'pipe_break', modo: 'fuga', elementos: ['110'], desde_h: 2 }], duration_hours: 6 }
    const res = await correr('wntr_resilience_service.py', ['scenario', red('pbv'), JSON.stringify(opciones)])

    expect(res.success).toBe(false)
    expect(res.error).toMatch(/fugas/)
  }, SIM_TIMEOUT)
})
