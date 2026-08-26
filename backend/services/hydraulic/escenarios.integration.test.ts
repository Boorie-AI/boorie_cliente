import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { WNTRResilienceService } from './resilienceService'
import { getPythonStatus } from './pythonDetector'

/**
 * Motor de escenarios contra el WNTR real y redes reales, sin mocks (#43).
 *
 * Se prueba con dos redes porque ninguna sola ejerce las cinco familias de
 * evento: Chamisero tiene bombas y una tubería troncal cuyo cierre sí deja gente
 * sin servicio, pero no tiene embalses ni controles; Net1 tiene embalse y una
 * bomba de la que depende toda la red, que es lo que permite ver la sequía y la
 * pérdida de control. Que una red no tenga controles no es un defecto de la
 * prueba: es el caso normal en los .inp que llegan, y el motor tiene que
 * decirlo en vez de simular a medias.
 *
 * Lo que se vigila aquí, más allá de que cada evento «funcione»:
 *
 *  - Que el impacto se mida contra una corrida de referencia. Parar la bomba
 *    6012 de Chamisero reporta 2009 habitantes afectados y la misma red sin
 *    evento también: el déficit es crónico y no lo causa la bomba.
 *  - Que un elemento inexistente o un tipo de evento inventado se rechacen
 *    diciendo cuál, en lugar de devolver un escenario vacío que parece inocuo.
 *  - Que la fuga descargue más agua que el simple cierre de la misma tubería.
 */
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..')
const CHAMISERO = path.join(REPO_ROOT, 'test-files', 'SoloChamiseroMedioConPatronComercial-07p1.inp')
const NET1 = path.join(REPO_ROOT, 'test-files', 'Net1v3.inp')
const canRun = getPythonStatus().wntrAvailable && fs.existsSync(CHAMISERO) && fs.existsSync(NET1)

/** Cada escenario corre dos simulaciones de periodo extendido. */
const SIM_TIMEOUT = 120_000

/** Tubería troncal cuyo cierre sí deja nudos sin servicio en Chamisero. */
const TRUNK_PIPE = '8062'
/** Bomba cuyo paro no cambia el servicio: sirve para comprobar la atribución. */
const NEUTRAL_PUMP = '6012'

const service = new WNTRResilienceService()

const escenario = (red: string, definicion: Record<string, unknown>) =>
  service.simulateScenario(red, {
    duration_hours: 24,
    persons_per_connection: 4,
    ...definicion,
  } as never)

/**
 * Los indicadores del escenario que no admiten signo (#77).
 *
 * Son magnitudes de impacto: habitantes, nudos, volumen sin servir, horas de
 * corte, caída de presión, disponibilidad. Ninguna significa nada por debajo de
 * cero. Se dejan fuera a propósito la presión (`min_pressure` puede ser negativa
 * y eso es un resultado hidráulico, no un error de cuenta) y el caudal, cuyo
 * signo dice el sentido de circulación.
 */
const SIN_SIGNO = new Set([
  'population_affected', 'affected_node_count', 'undelivered_volume_m3', 'undelivered_m3',
  'outage_hours', 'max_outage_hours', 'hours_below_threshold', 'max_deficit_hours',
  'pressure_drop', 'min_service_availability', 'total_m3', 'baseline_m3', 'attributable_m3',
  'total_population', 'population_nodes', 'affected_connections', 'total_connections',
])

/** `raw_difference` guarda la resta sin recortar: ahí el negativo es el dato. */
const buscarNegativos = (valor: unknown, ruta = ''): string[] => {
  if (typeof valor === 'number') return valor < 0 ? [`${ruta} = ${valor}`] : []
  if (Array.isArray(valor)) return valor.flatMap((v, i) => buscarNegativos(v, `${ruta}[${i}]`))
  if (valor && typeof valor === 'object') {
    return Object.entries(valor).flatMap(([k, v]) =>
      k === 'raw_difference' ? [] : buscarNegativos(v, ruta ? `${ruta}.${k}` : k)
    )
  }
  return []
}

const indicadoresNegativos = (data: Record<string, unknown>): string[] =>
  buscarNegativos(data).filter(linea => SIN_SIGNO.has(linea.split(' = ')[0].split('.').pop()!.replace(/\[\d+\]$/, '')))

describe.skipIf(!canRun)('motor de escenarios con WNTR real', () => {
  it('el escenario del criterio de aceptación devuelve demanda no satisfecha y clientes', async () => {
    const r = await escenario(CHAMISERO, {
      nombre: 'Bomba 6012 fuera de servicio de 08:00 a 12:00',
      eventos: [{ tipo: 'pump_outage', elementos: [NEUTRAL_PUMP], desde_h: 8, hasta_h: 12 }],
    })

    expect(r.success).toBe(true)
    const d = r.data!
    expect(d.scenario.events[0].aplicado).toBe(true)
    expect(d.scenario.events[0].metodo).toBeTruthy()
    expect(d.unmet_demand.total_m3).toBeGreaterThan(0)
    expect(d.unmet_demand.by_node.length).toBeGreaterThan(0)
    // El método de la estimación de clientes va declarado, no implícito.
    expect(d.population.connections?.method).toBe('derived_from_population')
    expect(d.population.traceability.demand_model).toBe('PDA')
  }, SIM_TIMEOUT)

  it('no atribuye al escenario el déficit que la red ya tenía', async () => {
    const r = await escenario(CHAMISERO, {
      eventos: [{ tipo: 'pump_outage', elementos: [NEUTRAL_PUMP], desde_h: 8, hasta_h: 12 }],
    })

    const p = r.data!.population
    expect(p.event.population_affected).toBeGreaterThan(0)
    expect(p.baseline.population_affected).toBe(p.event.population_affected)
    expect(p.attributable_to_event.population_affected).toBe(0)
  }, SIM_TIMEOUT)

  it('el cierre de la troncal sí deja gente sin servicio', async () => {
    const r = await escenario(CHAMISERO, {
      eventos: [{ tipo: 'pipe_break', elementos: [TRUNK_PIPE], desde_h: 2 }],
    })

    const d = r.data!
    expect(d.population.attributable_to_event.population_affected).toBeGreaterThan(0)
    expect(d.unmet_demand.attributable_m3).toBeGreaterThan(0)
    expect(d.nodes_below_minimum_pressure.length).toBeGreaterThan(0)
  }, SIM_TIMEOUT)

  it('la rotura con fuga descarga más agua que el mismo cierre', async () => {
    const cierre = await escenario(CHAMISERO, {
      eventos: [{ tipo: 'pipe_break', elementos: [TRUNK_PIPE], desde_h: 2 }],
    })
    const fuga = await escenario(CHAMISERO, {
      eventos: [{ tipo: 'pipe_break', elementos: [TRUNK_PIPE], modo: 'fuga', area_m2: 0.05, desde_h: 2 }],
    })

    expect(fuga.data!.scenario.events[0].metodo).toContain('fuga')
    expect(fuga.data!.unmet_demand.total_m3).toBeGreaterThan(cierre.data!.unmet_demand.total_m3)
  }, SIM_TIMEOUT * 2)

  it('la sobredemanda crea déficit donde no lo había', async () => {
    const r = await escenario(CHAMISERO, {
      eventos: [{ tipo: 'demand_surge', multiplicador: 3, desde_h: 8, hasta_h: 12 }],
    })

    expect(r.data!.scenario.events[0].metodo).toContain('aditiva')
    expect(r.data!.unmet_demand.attributable_m3).toBeGreaterThan(0)
  }, SIM_TIMEOUT)

  it('la sequía se aplica sobre el embalse y su impacto crece al bajar el nivel', async () => {
    const medio = await escenario(NET1, {
      eventos: [{ tipo: 'source_reduction', elementos: ['9'], factor: 0.5 }],
    })
    const bajo = await escenario(NET1, {
      eventos: [{ tipo: 'source_reduction', elementos: ['9'], nivel_m: 30 }],
    })

    expect(medio.data!.unmet_demand.attributable_m3).toBeGreaterThan(0)
    expect(bajo.data!.unmet_demand.attributable_m3).toBeGreaterThan(medio.data!.unmet_demand.attributable_m3)
  }, SIM_TIMEOUT * 2)

  it('la pérdida de control congela el activo y se nota', async () => {
    const r = await escenario(NET1, {
      eventos: [{
        tipo: 'control_loss', alcance: 'todos',
        congelar: ['9'], congelar_en: 'cerrado', desde_h: 2,
      }],
    })

    expect(r.data!.scenario.events[0].aplicado).toBe(true)
    expect(r.data!.unmet_demand.attributable_m3).toBeGreaterThan(0)
  }, SIM_TIMEOUT)

  it('un escenario compuesto aplica todos sus eventos', async () => {
    const r = await escenario(CHAMISERO, {
      nombre: 'Terremoto: rotura de troncal y bomba fuera de servicio',
      eventos: [
        { tipo: 'pipe_break', elementos: [TRUNK_PIPE], desde_h: 1 },
        { tipo: 'pump_outage', elementos: [NEUTRAL_PUMP], desde_h: 1 },
      ],
    })

    expect(r.data!.scenario.events).toHaveLength(2)
    expect(r.data!.scenario.events.every(e => e.aplicado)).toBe(true)
  }, SIM_TIMEOUT)

  it('dice qué elemento no existe en vez de simular un escenario vacío', async () => {
    const r = await escenario(CHAMISERO, {
      eventos: [{ tipo: 'pump_outage', elementos: ['bomba-que-no-existe'] }],
    })

    expect(r.success).toBe(false)
    expect(r.eventos?.[0].omitidos[0]).toMatchObject({ id: 'bomba-que-no-existe', motivo: 'no existe en la red' })
  }, SIM_TIMEOUT)

  it('rechaza un tipo de evento desconocido enumerando los admitidos', async () => {
    const r = await escenario(CHAMISERO, {
      eventos: [{ tipo: 'meteorito', elementos: ['8062'] } as never],
    })

    expect(r.success).toBe(false)
    expect(r.eventos?.[0].omitidos[0].motivo).toContain('pipe_break')
  }, SIM_TIMEOUT)

  it('ningún indicador de impacto sale en negativo (#77)', async () => {
    // El cliente lo vio en la pantalla del escenario: la resta contra la corrida
    // de referencia puede salir por debajo de cero —un corte redistribuye
    // presiones y hay nudos que quedan mejor que antes— y el panel enseñaba
    // habitantes y volúmenes negativos como si fueran impacto.
    const r = await escenario(CHAMISERO, {
      nombre: 'Terremoto: rotura de troncal y bomba fuera de servicio',
      eventos: [
        { tipo: 'pipe_break', elementos: [TRUNK_PIPE], desde_h: 1 },
        { tipo: 'pump_outage', elementos: [NEUTRAL_PUMP], desde_h: 1 },
      ],
    })

    expect(indicadoresNegativos(r.data as unknown as Record<string, unknown>)).toEqual([])
  }, SIM_TIMEOUT)

  it('el recorte no borra la resta con la que se calculó', async () => {
    const r = await escenario(CHAMISERO, {
      eventos: [{ tipo: 'pipe_break', elementos: [TRUNK_PIPE], desde_h: 2 }],
    })

    const a = r.data!.population.attributable_to_event
    expect(a.population_affected).toBe(Math.max(0, a.raw_difference.population_affected))
    expect(a.affected_node_count).toBe(Math.max(0, a.raw_difference.affected_node_count))
    expect(a.undelivered_volume_m3).toBe(Math.max(0, a.raw_difference.undelivered_volume_m3))
    expect(a.clipped_to_zero).toEqual(
      Object.entries(a.raw_difference).filter(([, v]) => v < 0).map(([k]) => k).sort()
    )
  }, SIM_TIMEOUT)

  it('un escenario sin eventos no llega a simularse', async () => {
    const r = await escenario(CHAMISERO, { eventos: [] })

    expect(r.success).toBe(false)
    expect(r.error).toContain('ningún evento')
  })
})
