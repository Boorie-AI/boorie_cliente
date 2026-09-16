import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { WNTRAnalysisService } from './analysisService'
import { WNTRResilienceService } from './resilienceService'
import { getPythonStatus } from './pythonDetector'

/**
 * Tests contra el servicio Python real y una red real, en la línea de
 * resilienceService.integration.test.ts. Cubren los dos fallos que vio un
 * usuario en la pestaña de análisis con Net3 (#143 y #144):
 *
 *  - La criticidad recorría todos los nudos, así que los embalses River y Lake
 *    encabezaban la lista de críticos: su presión es 0 por definición y el
 *    déficit contra el umbral salía máximo.
 *  - La tarjeta de resiliencia pedía `serviceability` y el cálculo no lo
 *    devolvía, así que el nivel de servicio salía N/A con cualquier red.
 *
 * El contraste con WNTRResilienceService es la parte que importa: las dos
 * pantallas deben dar la misma cifra sobre la misma red con el mismo umbral, y
 * antes no había nada que lo sujetara.
 */
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..')
const NETWORK = path.join(REPO_ROOT, 'test-files', 'Net3-con-controles.inp')
const canRun = getPythonStatus().wntrAvailable && fs.existsSync(NETWORK)

const SIM_TIMEOUT = 120_000
const MIN_PRESSURE = 10.0
/** La duración escrita en el .inp, que es la que usa calculate_resilience. */
const INP_DURATION_HOURS = 168
/** Los dos embalses de Net3: el síntoma exacto que se reportó. */
const RESERVOIRS = ['River', 'Lake']

const analysis = new WNTRAnalysisService()
const resilience = new WNTRResilienceService()

describe.skipIf(!canRun)('análisis de criticidad con WNTR real', () => {
  it('no marca embalses ni depósitos como nudos críticos', async () => {
    const res: any = await analysis.analyzeComponentCriticality(NETWORK, { min_pressure: MIN_PRESSURE })

    expect(res.success).toBe(true)
    const nodes: Array<[string, any]> = res.data.criticality_analysis.top_critical_nodes
    const ids = nodes.map(([id]) => id)

    for (const reservoir of RESERVOIRS) {
      expect(ids).not.toContain(reservoir)
    }
    // Y sigue encontrando los nudos de consumo que sí tienen déficit real.
    expect(ids.length).toBeGreaterThan(0)
    for (const [, info] of nodes) {
      expect(info.min_pressure).toBeLessThan(MIN_PRESSURE)
      expect(info.overall_score).toBeGreaterThan(0)
      expect(info.overall_score).toBeLessThanOrEqual(1)
    }
  }, SIM_TIMEOUT)

  it('normaliza la puntuación contra el umbral que recibe', async () => {
    // Con el divisor fijo de 10 que había antes, un umbral de 40 m dejaba la
    // escala sin sentido: casi cualquier nudo saturaba en 1,0.
    const res: any = await analysis.analyzeComponentCriticality(NETWORK, { min_pressure: 40.0 })

    expect(res.success).toBe(true)
    const nodes: Array<[string, any]> = res.data.criticality_analysis.top_critical_nodes
    const saturados = nodes.filter(([, info]) => info.overall_score >= 1).length

    expect(nodes.length).toBeGreaterThan(saturados)
  }, SIM_TIMEOUT)
})

describe.skipIf(!canRun)('métricas de resiliencia con WNTR real', () => {
  it('devuelve el nivel de servicio que la tarjeta pide', async () => {
    const res: any = await analysis.calculateResilienceMetrics(NETWORK, { min_pressure: MIN_PRESSURE })

    expect(res.success).toBe(true)
    const sv = res.data.resilience_metrics.serviceability
    expect(sv).toBeDefined()
    expect(typeof sv.pressure_serviceability).toBe('number')
    expect(sv.pressure_serviceability).toBeGreaterThanOrEqual(0)
    expect(sv.pressure_serviceability).toBeLessThanOrEqual(1)
    expect(sv.junctions_meeting_pressure).toBeLessThanOrEqual(sv.total_junctions)
    expect(sv.min_pressure_threshold).toBe(MIN_PRESSURE)
  }, SIM_TIMEOUT)

  it('coincide con el panel de indicadores sobre la misma ventana y umbral', async () => {
    const [tarjeta, panel] = await Promise.all([
      analysis.calculateResilienceMetrics(NETWORK, { min_pressure: MIN_PRESSURE }) as Promise<any>,
      resilience.calculateResilienceIndicators(NETWORK, {
        duration_hours: INP_DURATION_HOURS,
        min_pressure_threshold: MIN_PRESSURE
      }) as Promise<any>
    ])

    expect(tarjeta.success).toBe(true)
    expect(panel.success).toBe(true)

    const a = tarjeta.data.resilience_metrics
    const b = panel.data.before

    expect(a.hydraulic.todini_index).toBeCloseTo(b.todini_index, 6)
    expect(a.serviceability.pressure_serviceability)
      .toBeCloseTo(b.serviceability.pressure_serviceability, 6)
    expect(a.serviceability.total_junctions).toBe(b.serviceability.total_junctions)
  }, SIM_TIMEOUT * 2)
})
