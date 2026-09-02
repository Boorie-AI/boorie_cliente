import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { WNTRResilienceService } from './resilienceService'
import { getPythonStatus } from './pythonDetector'

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
 * Se omiten si la máquina no tiene un Python con WNTR. El gateo pregunta por
 * el intérprete resuelto y no por la existencia de venv-wntr: en CI no hay venv
 * y WNTR está en el Python del sistema, así que atarlo al venv dejaba estos
 * ocho tests saltados y el check en verde sin haber probado nada.
 */
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..')
const NETWORK = path.join(REPO_ROOT, 'test-files', 'SoloChamiseroMedioConPatronComercial-07p1.inp')
const canRun = getPythonStatus().wntrAvailable && fs.existsSync(NETWORK)

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

/**
 * Reparto por diámetro de la curva de fragilidad (issue #94).
 *
 * El Dr. Mora corrigió la exigencia: en vez de una curva de longitud aparte
 * —que con un material único sería la misma curva a otra escala—, una tabla
 * con las tuberías y los kilómetros afectados de cada diámetro presente en la
 * red, para poder costear el daño. Agrupar por diámetro se puede porque el
 * `.inp` lo declara en `[PIPES]`; el material no viene y hay que preguntarlo.
 *
 * Lo que estos tests protegen es la consistencia: si el reparto por grupos
 * dejara de sumar el agregado, la tabla mentiría sin que nada más se rompiera.
 */
describe.skipIf(!canRun)('curva de fragilidad: reparto por diámetro', () => {
  const fragility = () => service.generateFragilityCurve(NETWORK, {
    material: 'CI',
    max_intensity: 100,
    steps: 11,
  })

  it('agrupa por los diámetros que existen en la red y no pierde ninguna tubería', async () => {
    const res = await fragility()
    expect(res.success).toBe(true)
    const d = res.data!

    expect(d.by_diameter.length).toBeGreaterThan(0)
    expect(d.by_diameter.reduce((s, g) => s + g.pipe_count, 0)).toBe(d.pipe_count)
    expect(d.by_diameter.reduce((s, g) => s + g.length_km, 0)).toBeCloseTo(d.total_length_km, 6)

    // Ordenados de menor a mayor: la tabla se lee por diámetro creciente.
    const mm = d.by_diameter.map(g => g.diameter_mm)
    expect([...mm].sort((a, b) => a - b)).toEqual(mm)
  }, SIM_TIMEOUT)

  it('el reparto suma exactamente el agregado en cada intensidad', async () => {
    const res = await fragility()
    const d = res.data!

    d.intensities.forEach((_, i) => {
      const tuberias = d.by_diameter.reduce((s, g) => s + g.affected_pipes[i], 0)
      const km = d.by_diameter.reduce((s, g) => s + g.affected_length_km[i], 0)
      expect(tuberias).toBeCloseTo(d.expected_failed_pipes[i], 6)
      expect(km).toBeCloseTo(d.pipe_failure_probability[i] * d.total_length_km, 6)
    })
  }, SIM_TIMEOUT)

  it('distingue dos grupos con el mismo recuento y longitudes distintas', async () => {
    const res = await fragility()
    const d = res.data!
    const i = d.intensities.length - 1

    // El caso que motiva la columna de longitud: mismo número de tuberías,
    // kilómetros muy distintos. Si no hay dos grupos así en esta red, el test
    // no tiene nada que comprobar y lo dice en vez de pasar en falso.
    const porRecuento = new Map<number, typeof d.by_diameter>()
    for (const g of d.by_diameter) {
      porRecuento.set(g.pipe_count, [...(porRecuento.get(g.pipe_count) ?? []), g])
    }
    const pareja = [...porRecuento.values()].find(gs => gs.length >= 2
      && Math.max(...gs.map(g => g.length_km)) > Math.min(...gs.map(g => g.length_km)) * 2)
    expect(pareja, 'la red no tiene dos diámetros con igual recuento y longitud dispar').toBeDefined()

    const cortos = pareja!.map(g => g.affected_pipes[i])
    expect(Math.max(...cortos)).toBeCloseTo(Math.min(...cortos), 6)
    const largos = pareja!.map(g => g.affected_length_km[i])
    expect(Math.max(...largos)).toBeGreaterThan(Math.min(...largos) * 2)
  }, SIM_TIMEOUT)
})

/**
 * Entrada en PGA (issue #94, anexo 1 del Dr. Mora).
 *
 * ALA está calibrada en PGV, así que la curva en PGA se obtiene llevando la
 * mediana al espacio de PGA con Newmark & Hall (1982): PGV[cm/s] = α·PGA[g].
 * Lo que estos tests protegen es que la mediana se mueva de verdad. Cambiar
 * solo el rótulo del eje dejaría una curva de PGV llamada PGA, que es
 * exactamente lo que se le dijo al Dr. Mora que no se haría.
 */
describe.skipIf(!canRun)('curva de fragilidad: entrada en PGA', () => {
  /** Newmark & Hall (1982), cm/s por g. */
  const ALFA = { rock: 66, stiff_soil: 97, soft_soil: 122 } as const

  it('en PGV no hay conversión y la mediana sigue en cm/s', async () => {
    const res = await service.generateFragilityCurve(NETWORK, { material: 'CI', steps: 4 })
    const d = res.data!
    expect(d.intensity_unit).toBe('cm/s')
    expect(d.alpha_cm_s_per_g).toBeNull()
    expect(d.soil_class).toBeNull()
    expect(d.median).toBe(d.median_pgv)
  }, SIM_TIMEOUT)

  it('en PGA lleva la mediana a g dividiendo por el alfa del suelo', async () => {
    // La referencia de beta es la corrida en PGV del mismo modelo de daño, no
    // un literal: cada modelo publica su propia dispersión y cambiar el modelo
    // por defecto no debe romper este test, que va de la conversión.
    const enPgv = (await service.generateFragilityCurve(NETWORK, { material: 'CI', steps: 4 })).data!

    for (const suelo of ['rock', 'stiff_soil', 'soft_soil'] as const) {
      const res = await service.generateFragilityCurve(NETWORK, {
        material: 'CI', hazard_type: 'seismic_pga', soil_class: suelo, steps: 4,
      })
      const d = res.data!
      expect(d.intensity_unit).toBe('g')
      expect(d.alpha_cm_s_per_g).toBe(ALFA[suelo])
      expect(d.median).toBeCloseTo(d.median_pgv / ALFA[suelo], 9)
      // El eje va en g: con el tope por defecto, hasta 1.
      expect(Math.max(...d.intensities)).toBeCloseTo(1, 9)
      // La dispersión no se toca: la incertidumbre de la conversión va
      // declarada en la metodología, no metida a mano en beta.
      expect(d.beta).toBe(enPgv.beta)
      // El motor ya no escribe la frase: dice qué párrafos tocan (fase 4 del
      // #96). Que la conversión se declara al usuario es lo que se comprueba.
      expect(d.methodology_keys).toContain('methodPga')
    }
  }, SIM_TIMEOUT)

  it('el suelo blando falla antes para la misma aceleración', async () => {
    const pedir = (soil_class: 'rock' | 'soft_soil') => service.generateFragilityCurve(
      NETWORK, { material: 'CI', hazard_type: 'seismic_pga', soil_class, steps: 11 })

    const roca = (await pedir('rock')).data!
    const blando = (await pedir('soft_soil')).data!
    const i = 2  // 0,2 g, donde la curva todavía discrimina

    // Para un mismo PGA, el suelo blando da más PGV, así que más daño.
    expect(blando.pipe_failure_probability[i])
      .toBeGreaterThan(roca.pipe_failure_probability[i])
  }, SIM_TIMEOUT)

  it('rechaza una clase de suelo que no existe en vez de asumir una', async () => {
    const res = await service.generateFragilityCurve(NETWORK, {
      hazard_type: 'seismic_pga',
      soil_class: 'barro' as unknown as 'rock',
    })
    expect(res.success).toBe(false)
    expect(res.error).toContain('soil_class')
  }, SIM_TIMEOUT)
})

/**
 * Modelo de daño y componentes puntuales (issue #94, segunda respuesta del
 * Dr. Mora).
 *
 * Dos decisiones suyas que estos tests fijan:
 *
 *  - Empezar por HAZUS-MH. Las medianas dejan de ser valores genéricos sin
 *    fuente y pasan a ser las dos tablas citadas de su anexo 1.
 *  - Tanques y bombas van por PGA, y sus coeficientes los pone el usuario
 *    avanzado. No hay tabla por defecto y no debe haberla: un valor inventado
 *    se lee en pantalla igual que un dato medido.
 */
describe.skipIf(!canRun)('curva de fragilidad: modelo de daño y componentes', () => {
  it('HAZUS es el de partida y da otra mediana y otra dispersión que ALA', async () => {
    const hazus = (await service.generateFragilityCurve(NETWORK, { material: 'PVC', steps: 4 })).data!
    expect(hazus.damage_model).toBe('HAZUS_MH')
    expect(hazus.median_pgv).toBe(35)
    expect(hazus.beta).toBe(0.6)

    const ala = (await service.generateFragilityCurve(NETWORK, {
      material: 'PVC', damage_model: 'ALA_2001', steps: 4,
    })).data!
    expect(ala.median_pgv).toBe(40)
    expect(ala.beta).toBe(0.5)
  }, SIM_TIMEOUT)

  it('rechaza un modelo de daño que no existe', async () => {
    const res = await service.generateFragilityCurve(NETWORK, {
      damage_model: 'INVENTADO' as unknown as 'HAZUS_MH',
    })
    expect(res.success).toBe(false)
    expect(res.error).toContain('damage_model')
  }, SIM_TIMEOUT)

  it('sin coeficientes no inventa curva de tanque ni de bomba', async () => {
    const res = await service.generateFragilityCurve(NETWORK, {
      hazard_type: 'seismic_pga', steps: 4,
    })
    const c = res.data!.components!
    expect(c.tank_ds1).toBeNull()
    expect(c.tank_ds2).toBeNull()
    expect(c.pump_ds).toBeNull()
    // El recuento sí se informa: es lo que dice si merece la pena pedirlos.
    expect(c.tank_count).toBeGreaterThan(0)
  }, SIM_TIMEOUT)

  it('en PGV no hay componentes, porque no se gobiernan por PGV', async () => {
    const res = await service.generateFragilityCurve(NETWORK, {
      hazard_type: 'seismic_pgv',
      tank_ds1: { median: 0.3 },
      steps: 4,
    })
    expect(res.data!.components).toBeNull()
  }, SIM_TIMEOUT)

  it('con coeficientes dibuja cada componente con su mediana', async () => {
    const res = await service.generateFragilityCurve(NETWORK, {
      hazard_type: 'seismic_pga',
      steps: 11,
      tank_ds1: { median: 0.3, beta: 0.6 },
      tank_ds2: { median: 0.7, beta: 0.6 },
      pump_ds: { median: 0.5, beta: 0.6 },
    })
    const c = res.data!.components!
    expect(c.tank_ds1!.median_pga).toBe(0.3)
    expect(c.tank_ds1!.expected_affected[10]).toBeCloseTo(c.tank_ds1!.probability[10] * c.tank_count, 9)

    // La fuga mayor siempre por debajo de la menor: si se cruzaran, los
    // estados de daño estarían invertidos y la lectura sería al revés.
    c.tank_ds1!.probability.forEach((p, i) => {
      expect(p).toBeGreaterThanOrEqual(c.tank_ds2!.probability[i])
    })
  }, SIM_TIMEOUT)

  it('falla explícitamente si el coeficiente no trae mediana o no es positiva', async () => {
    const sinMediana = await service.generateFragilityCurve(NETWORK, {
      hazard_type: 'seismic_pga',
      tank_ds1: { beta: 0.6 } as unknown as { median: number },
    })
    expect(sinMediana.success).toBe(false)
    expect(sinMediana.error).toContain('tank_ds1')

    const negativa = await service.generateFragilityCurve(NETWORK, {
      hazard_type: 'seismic_pga',
      pump_ds: { median: -1 },
    })
    expect(negativa.success).toBe(false)
    expect(negativa.error).toContain('positivos')
  }, SIM_TIMEOUT)
})

/**
 * La metodología dejó de ser prosa del motor (fase 4 del #96).
 *
 * Antes el servicio montaba la frase en castellano y salía igual en los tres
 * idiomas. Ahora devuelve qué párrafos tocan; los números ya viajan en el
 * resto de `data` y el nombre del modelo sale de `damage_model`, así que la
 * interfaz puede decirla en el idioma de quien mira.
 */
describe.skipIf(!canRun)('curva de fragilidad: metodología por claves', () => {
  it('en PGV solo el párrafo base; en PGA también el de la conversión', async () => {
    const pgv = (await service.generateFragilityCurve(NETWORK, { steps: 3 })).data!
    expect(pgv.methodology_keys).toEqual(['methodBase'])

    const pga = (await service.generateFragilityCurve(NETWORK, {
      hazard_type: 'seismic_pga', steps: 3,
    })).data!
    expect(pga.methodology_keys).toEqual(['methodBase', 'methodPga'])
  }, SIM_TIMEOUT)

  it('no devuelve prosa: todo lo que necesita el texto va como dato', async () => {
    const d = (await service.generateFragilityCurve(NETWORK, {
      hazard_type: 'seismic_pga', soil_class: 'soft_soil', steps: 3,
    })).data!

    expect((d as unknown as { methodology?: string }).methodology).toBeUndefined()
    // Los tres huecos del párrafo de PGA, y el modelo del párrafo base.
    expect(d.median_pgv).toBeGreaterThan(0)
    expect(d.median).toBeGreaterThan(0)
    expect(d.alpha_cm_s_per_g).toBe(122)
    expect(d.soil_class).toBe('soft_soil')
    expect(d.damage_model).toBe('HAZUS_MH')
  }, SIM_TIMEOUT)
})
