/**
 * La narración del escenario (#44).
 *
 * Dos criterios de aceptación viven aquí: que las cifras sean las de la
 * simulación —por eso el texto se escribe en código y no con el modelo— y que la
 * respuesta **cite la simulación de origen** en vez de presentar los números como
 * generalidades.
 */

import { describe, it, expect } from 'vitest'
import { narrarEscenario, type ResultadoEscenario } from './narrarEscenario'

const resultado = (parcial: Partial<ResultadoEscenario> = {}): ResultadoEscenario => ({
  scenario: {
    name: 'Bomba(s) 6012 fuera de servicio, de la hora 8 a la 12',
    duration_hours: 24,
    events: [{ tipo: 'pump_outage', aplicado: true, elementos: ['6012'], metodo: 'bomba cerrada por control en la ventana del evento', omitidos: [] }],
  },
  unmet_demand: {
    total_m3: 577.3,
    baseline_m3: 106.9,
    attributable_m3: 470.4,
    by_node: [
      { id: '7949', undelivered_m3: 120.5, outage_hours: 18.0, min_service_availability: 0.727 },
      { id: '7950', undelivered_m3: 60.25, outage_hours: 6.0, min_service_availability: 0.9 },
    ],
    max_deficit_hours: 18.0,
  },
  nodes_below_minimum_pressure: [
    { id: '7949', min_pressure: 4.2, hours_below_threshold: 18 },
  ],
  min_pressure_threshold: 10,
  total_junction_count: 130,
  population: {
    total_population: 4601,
    event: { population_affected: 4601, affected_node_count: 130, undelivered_volume_m3: 577.3 },
    baseline: { population_affected: 2009 },
    attributable_to_event: { population_affected: 2592, affected_node_count: 117, undelivered_volume_m3: 470.4 },
    connections: { affected_connections: 648, persons_per_connection: 4, method: 'derived_from_population' },
    traceability: { demand_model: 'PDA' },
  },
  convergence_warnings: { converged: true },
  ...parcial,
})

describe('narración de un escenario simulado', () => {
  it('cita la ejecución de origen, que es un criterio de aceptación', () => {
    const texto = narrarEscenario(resultado(), 'cmt1abc123')

    expect(texto).toContain('cmt1abc123')
    expect(texto).toContain('PDA')
    expect(texto).toContain('bomba cerrada por control')
  })

  it('sin registro lo dice, en vez de citar un identificador que no existe', () => {
    const texto = narrarEscenario(resultado(), null)

    expect(texto).toContain('no se pudo registrar')
    expect(texto).not.toContain('undefined')
    expect(texto).not.toContain('null')
  })

  it('un impacto negativo se cuenta como cero, no como habitantes en negativo (#77)', () => {
    // Pasa de verdad: el escenario redistribuye presiones y deja algún nudo
    // mejor que en la corrida de referencia, así que la resta sale por debajo de
    // cero. Los resultados guardados antes del arreglo siguen trayéndola así.
    const texto = narrarEscenario(resultado({
      unmet_demand: { ...resultado().unmet_demand, attributable_m3: -12.5 },
      population: {
        ...resultado().population,
        attributable_to_event: { population_affected: -118, affected_node_count: -3, undelivered_volume_m3: -12.5 },
      },
    }), 'run1')

    expect(texto).not.toContain('−118')
    expect(texto).not.toContain('−12,5')
    expect(texto).toContain('**No deja a nadie sin servicio**')
    expect(texto).toContain('0,0 m³')
  })

  it('da las cifras atribuibles al evento, no las totales de la red', () => {
    const texto = narrarEscenario(resultado(), 'run1')

    // 2592 es lo que causa el escenario; 4601 es la red entera, y presentarlo
    // como impacto del evento es la cifra alarmante y falsa que el #32 evitó.
    expect(texto).toContain('2.592')
    expect(texto).toContain('470,4')
    expect(texto).not.toMatch(/\*\*4\.601 habitantes\*\*/)
  })

  it('declara el déficit que la red ya arrastraba', () => {
    const texto = narrarEscenario(resultado(), 'run1')
    expect(texto).toContain('2.009')
    expect(texto).toContain('ya arrastraba')
  })

  it('cuando el escenario no afecta a nadie, lo dice sin rodeos', () => {
    const base = resultado()
    const texto = narrarEscenario({
      ...base,
      unmet_demand: { ...base.unmet_demand, attributable_m3: 0 },
      population: {
        ...base.population,
        attributable_to_event: { population_affected: 0, affected_node_count: 0, undelivered_volume_m3: 0 },
      },
    }, 'run1')

    expect(texto).toContain('No deja a nadie sin servicio')
  })

  it('enumera los nudos peor parados, con un tope', () => {
    const base = resultado()
    const muchos = Array.from({ length: 12 }, (_, i) => ({
      id: `N${i}`, undelivered_m3: 100 - i, outage_hours: 5, min_service_availability: 0.5,
    }))
    const texto = narrarEscenario({ ...base, unmet_demand: { ...base.unmet_demand, by_node: muchos } }, 'run1')

    expect(texto).toContain('**N0**')
    expect(texto).not.toContain('**N5**')
  })

  it('avisa de lo que no se pudo aplicar', () => {
    const base = resultado()
    const texto = narrarEscenario({
      ...base,
      scenario: {
        ...base.scenario,
        events: [{ tipo: 'pump_outage', aplicado: true, elementos: ['6012'], metodo: 'x', omitidos: [{ id: 'B9', motivo: { clave: 'omitido.noExiste' } }] }],
      },
    }, 'run1')

    expect(texto).toContain('B9')
    // La narración resuelve la clave contra el diccionario de verdad (#96).
    expect(texto).toContain('no existe en la red')
  })

  it('avisa cuando la simulación no convergió', () => {
    const texto = narrarEscenario({ ...resultado(), convergence_warnings: { converged: false } }, 'run1')
    expect(texto).toContain('no convergió')
  })

  it('incluye los clientes cuando se conoce el factor de acometidas', () => {
    const texto = narrarEscenario(resultado(), 'run1')
    expect(texto).toContain('648')
    expect(texto).toContain('acometidas')
  })
})
