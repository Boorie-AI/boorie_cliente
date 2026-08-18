import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { WNTRResilienceService } from './resilienceService'

/**
 * Tests contra el servicio Python real y una red real (sin mocks), en la línea
 * de pythonDetector.integration.test.ts. Cubren la simulación de interrupción
 * unificada (#22 + #32): una sola ejecución devuelve el impacto en presiones y
 * el impacto en habitantes, desde las mismas dos corridas PDA.
 *
 * Los tres fallos que aparecieron al construirla:
 *
 *  - `population()` de WNTR convierte la demanda base negativa de un nudo-fuente
 *    en población negativa: en esta red daba -4601 hab y dejaba el total en 0.
 *  - Contar instantes en vez de intervalos daba 25 h de déficit en una ventana
 *    de 24 h y sobreestimaba el volumen no entregado en un paso completo.
 *  - Sin corrida de referencia, el déficit crónico de la red se atribuía entero
 *    al evento: la bomba 6012 "afectaba" a 2009 hab que ya estaban afectados.
 *
 * Se omiten si el repo no tiene venv-wntr preparado (./setup-python-wntr.sh).
 */
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..')
const VENV_PYTHON = path.join(
  REPO_ROOT, 'venv-wntr',
  process.platform === 'win32' ? 'Scripts' : 'bin',
  process.platform === 'win32' ? 'python.exe' : 'python'
)
const NETWORK = path.join(REPO_ROOT, 'test-files', 'SoloChamiseroMedioConPatronComercial-07p1.inp')
const canRun = fs.existsSync(VENV_PYTHON) && fs.existsSync(NETWORK)

/** Cada llamada corre dos simulaciones de periodo extendido. */
const SIM_TIMEOUT = 120_000

const DURATION_HOURS = 24
/** Tubería troncal cuyo cierre sí deja nudos sin servicio en esta red. */
const TRUNK_PIPE = '8062'
/** Bomba cuyo paro no cambia el servicio: sirve para comprobar la atribución. */
const NEUTRAL_PUMP = '6012'

const service = new WNTRResilienceService()

const run = (options: Record<string, unknown>) =>
  service.simulateComponentFailure(NETWORK, {
    duration_hours: DURATION_HOURS,
    failure_start_hours: 2,
    ...options
  } as never)

describe.skipIf(!canRun)('interrupción del servicio con WNTR real', () => {
  it('devuelve presiones y habitantes en una sola ejecución', async () => {
    const res = await run({ components: [{ id: TRUNK_PIPE }] })

    expect(res.success).toBe(true)
    const d = res.data!

    // El impacto en presiones sigue siendo lo de #22...
    expect(d.affected_node_count).toBeGreaterThan(0)
    expect(d.total_junction_count).toBeGreaterThan(0)
    expect(d.failed_components).toEqual([TRUNK_PIPE])

    // ...y viene acompañado del impacto en habitantes, sin simular otra vez.
    const p = d.population
    expect(p.attributable_to_event.population_affected).toBeGreaterThan(0)
    expect(p.attributable_to_event.affected_node_count).toBeGreaterThan(0)
    expect(p.attributable_to_event.undelivered_volume_m3).toBeGreaterThan(0)
  }, SIM_TIMEOUT)

  it('simula en PDA, no en modo dirigido por demanda', async () => {
    const res = await run({ components: [{ id: TRUNK_PIPE }] })

    // En DDA un nudo con 10 m de presión recibiría el 100% de su demanda y el
    // impacto en habitantes saldría cero.
    expect(res.data!.population.traceability.demand_model).toBe('PDA')
    expect(res.data!.population.traceability.impact_metric).toContain('population_impacted')
  }, SIM_TIMEOUT)

  it('excluye los nudos de demanda negativa en vez de restarlos de la población', async () => {
    const p = (await run({ components: [{ id: TRUNK_PIPE }] })).data!.population

    // Sin el recorte, este nudo-fuente cancelaba a toda la población de la red.
    expect(p.excluded_negative_demand_nodes.length).toBeGreaterThan(0)
    expect(p.total_population).toBeGreaterThan(0)
    expect(p.population_nodes).toBeGreaterThan(0)

    for (const node of p.event.affected_nodes) {
      expect(node.population_affected).toBeGreaterThan(0)
    }
  }, SIM_TIMEOUT)

  it('no reporta más horas de déficit ni de corte que la ventana simulada', async () => {
    const d = (await run({ components: [{ id: TRUNK_PIPE }] })).data!

    expect(d.population.event.max_outage_hours).toBeLessThanOrEqual(DURATION_HOURS)
    for (const node of d.population.event.affected_nodes) {
      expect(node.outage_hours).toBeLessThanOrEqual(DURATION_HOURS)
    }
    for (const node of d.affected_nodes) {
      expect(node.outage_hours).toBeLessThanOrEqual(DURATION_HOURS)
    }
  }, SIM_TIMEOUT)

  it('no atribuye al evento el déficit que la red ya tenía', async () => {
    const p = (await run({ components: [{ id: NEUTRAL_PUMP }] })).data!.population

    // La red deja nudos sin servicio incluso sin evento; parar esta bomba no
    // cambia el resultado, así que lo atribuible tiene que ser cero.
    expect(p.baseline.population_affected).toBeGreaterThan(0)
    expect(p.event.population_affected).toBe(p.baseline.population_affected)
    expect(p.attributable_to_event.population_affected).toBe(0)
  }, SIM_TIMEOUT)

  it('recalcula la población al cambiar el módulo de demanda', async () => {
    // pop = demanda_media / R, con R proporcional al módulo: al doblarlo la
    // población se reduce a la mitad. Es el criterio de aceptación del issue.
    const base = await run({ components: [{ id: TRUNK_PIPE }], demand_module_lphd: 200 })
    const doubled = await run({ components: [{ id: TRUNK_PIPE }], demand_module_lphd: 400 })

    expect(base.data!.population.traceability.demand_module_lphd).toBe(200)
    expect(doubled.data!.population.traceability.demand_module_lphd).toBe(400)
    expect(doubled.data!.population.total_population)
      .toBeCloseTo(base.data!.population.total_population / 2, -1)
  }, SIM_TIMEOUT)

  it('deriva clientes solo cuando se da el factor de acometidas', async () => {
    const sin = await run({ components: [{ id: TRUNK_PIPE }] })
    expect(sin.data!.population.connections).toBeNull()

    const con = await run({ components: [{ id: TRUNK_PIPE }], persons_per_connection: 4 })
    const c = con.data!.population.connections!
    expect(c.method).toBe('derived_from_population')
    expect(c.total_connections).toBe(Math.round(con.data!.population.total_population / 4))
  }, SIM_TIMEOUT)

  it('falla de forma explícita si el componente no existe en la red', async () => {
    const res = await run({ components: [{ id: 'NO_EXISTE_9999' }] })
    expect(res.success).toBe(false)
  }, SIM_TIMEOUT)
})
