import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { WNTREnergyService } from './energyService'
import { getPythonStatus } from './pythonDetector'
import { normalizarTarifa } from './tarifaElectrica'

/**
 * Análisis energético y verificación de ahorros contra WNTR real (#42).
 *
 * Se usan dos redes porque el caso interesante es justo el que WNTR no cubre:
 *
 *  - Net1 no declara curvas de eficiencia, así que se calcula con la global.
 *  - Chamisero sí las declara, y ahí `wntr.metrics.economic.pump_power` **lanza
 *    NotImplementedError**: son las redes mejor preparadas las que se quedaban
 *    sin análisis. La potencia se calcula con la fórmula de WNTR y la eficiencia
 *    interpolada de la curva, que es lo que su propio TODO deja escrito.
 *
 * Y se vigila la trampa de siempre: una ventana de 24 h con paso de 1 h reporta
 * 25 instantes, y sumar los 25 productos de potencia por paso cuenta un intervalo
 * de más —un 4%— que en una cifra de ahorro es la diferencia entre acertar y no.
 */
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..')
const NET1 = path.join(REPO_ROOT, 'test-files', 'Net1v3.inp')
const CHAMISERO = path.join(REPO_ROOT, 'test-files', 'SoloChamiseroMedioConPatronComercial-07p1.inp')
const SIN_BOMBAS = path.join(REPO_ROOT, 'test-files', 'simple-network.inp')
const canRun = getPythonStatus().wntrAvailable && fs.existsSync(NET1) && fs.existsSync(CHAMISERO)

const SIM_TIMEOUT = 120_000

const TARIFA = normalizarTarifa({
  moneda: 'USD',
  precio_kwh: 0.18,
  bloques: [
    { nombre: 'punta', desde_h: 18, hasta_h: 22, precio_kwh: 0.25 },
    { nombre: 'valle', desde_h: 0, hasta_h: 6, precio_kwh: 0.09 },
  ],
})

const service = new WNTREnergyService()

describe.skipIf(!canRun)('análisis energético con WNTR real', () => {
  it('reparte consumo y coste por bomba y por bloque horario', async () => {
    const r = await service.analizar(NET1, { duration_hours: 24, tarifa: TARIFA })

    expect(r.success).toBe(true)
    const d = r.data!
    expect(d.energia_total_kwh).toBeGreaterThan(0)
    expect(d.coste_total).toBeGreaterThan(0)
    expect(d.moneda).toBe('USD')
    expect(d.bombas.length).toBeGreaterThan(0)

    // El desglose por bloques tiene que sumar el total: es la comprobación de
    // que ningún intervalo se cuenta dos veces ni se pierde.
    const suma = Object.values(d.por_bloque_horario).reduce((a, b) => a + b.kwh, 0)
    expect(suma).toBeCloseTo(d.energia_total_kwh, 6)
    expect(Object.keys(d.por_bloque_horario)).toContain('valle')
  }, SIM_TIMEOUT)

  it('integra por intervalos y no por instantes', async () => {
    const r = await service.analizar(NET1, { duration_hours: 24, tarifa: TARIFA })

    // 24 intervalos en una ventana de 24 h, no los 25 instantes que reporta la
    // simulación.
    expect(r.data!.trazabilidad.intervalos).toBe(24)
    expect(r.data!.trazabilidad.paso_s).toBe(3600)
  }, SIM_TIMEOUT)

  it('declara de dónde sale la eficiencia con la que calculó', async () => {
    const r = await service.analizar(NET1, { duration_hours: 24, tarifa: TARIFA })

    const bomba = r.data!.bombas[0]
    expect(bomba.eficiencia?.origen).toContain('global')
    expect(r.data!.trazabilidad.origen_eficiencia).toBeTruthy()
    // Net1 no declara curva, así que no se inventa un punto óptimo.
    expect(bomba.punto_optimo).toBeNull()
  }, SIM_TIMEOUT)

  it('usa la curva de eficiencia donde la red la declara, que es donde WNTR se rinde', async () => {
    const r = await service.analizar(CHAMISERO, { duration_hours: 24, tarifa: TARIFA })

    expect(r.success).toBe(true)
    const bomba = r.data!.bombas[0]
    expect(bomba.eficiencia?.origen).toContain('curva de eficiencia')
    // La eficiencia varía con el caudal: si saliera constante, se estaría usando
    // la global y la curva no se habría interpolado.
    expect(bomba.eficiencia!.maxima_pct).toBeGreaterThan(bomba.eficiencia!.minima_pct)
  }, SIM_TIMEOUT)

  it('señala la bomba que trabaja lejos de su punto óptimo', async () => {
    const r = await service.analizar(CHAMISERO, { duration_hours: 24, tarifa: TARIFA })

    const po = r.data!.bombas[0].punto_optimo!
    expect(po.curva).toBeTruthy()
    expect(po.punto_optimo.eficiencia_pct).toBeGreaterThan(po.eficiencia_en_operacion_pct)
    // Las tres bombas de esta red trabajan muy por debajo de su caudal óptimo:
    // es la recomendación de redimensionamiento, con su cifra.
    expect(po.desviacion_caudal_pct!).toBeLessThan(-20)
  }, SIM_TIMEOUT)

  it('una red sin bombas se rechaza diciéndolo', async () => {
    if (!fs.existsSync(SIN_BOMBAS)) return
    const r = await service.analizar(SIN_BOMBAS, { duration_hours: 24, tarifa: TARIFA })

    expect(r.success).toBe(false)
    expect(r.error).toContain('no tiene bombas')
  }, SIM_TIMEOUT)
})

describe.skipIf(!canRun)('verificación de ahorro por simulación', () => {
  it('el ahorro sale de dos corridas, no de una estimación', async () => {
    const r = await service.verificarMedida(NET1, {
      duration_hours: 24,
      tarifa: TARIFA,
      persons_per_connection: 4,
      medidas: [{ tipo: 'pump_outage', elementos: ['9'], desde_h: 18, hasta_h: 22 }],
    })

    expect(r.success).toBe(true)
    const d = r.data!
    expect(d.ahorro.origen).toBe('simulado')
    expect(d.ahorro.energia_kwh).toBeGreaterThan(0)
    expect(d.ahorro.coste).toBeGreaterThan(0)
    expect(d.antes.energia_total_kwh - d.despues.energia_total_kwh).toBeCloseTo(d.ahorro.energia_kwh, 6)
  }, SIM_TIMEOUT)

  it('apagar en hora punta ahorra más dinero que energía, que es el motivo de la medida', async () => {
    const r = await service.verificarMedida(NET1, {
      duration_hours: 24,
      tarifa: TARIFA,
      medidas: [{ tipo: 'pump_outage', elementos: ['9'], desde_h: 18, hasta_h: 22 }],
    })

    const d = r.data!
    const pctEnergia = d.ahorro.energia_kwh / d.antes.energia_total_kwh
    const pctCoste = d.ahorro.coste / d.antes.coste_total
    expect(pctCoste).toBeGreaterThan(pctEnergia)
  }, SIM_TIMEOUT)

  it('acompaña el ahorro con lo que le cuesta al servicio', async () => {
    const r = await service.verificarMedida(NET1, {
      duration_hours: 24,
      tarifa: TARIFA,
      persons_per_connection: 4,
      medidas: [{ tipo: 'pump_outage', elementos: ['9'], desde_h: 18, hasta_h: 22 }],
    })

    // Un ahorro sin su contrapartida no se puede reportar: apagar el bombeo doce
    // horas «ahorra» mucho y deja a la red sin agua.
    const s = r.data!.impacto_en_servicio
    expect(s).toBeDefined()
    expect(s.habitantes_afectados_atribuibles).toBeDefined()
    expect(s.metodo).toMatchObject({ demand_model: 'PDA' })
  }, SIM_TIMEOUT)

  it('una medida sobre un elemento que no existe se rechaza diciendo cuál', async () => {
    const r = await service.verificarMedida(NET1, {
      duration_hours: 24,
      tarifa: TARIFA,
      medidas: [{ tipo: 'pump_outage', elementos: ['bomba-fantasma'] }],
    })

    expect(r.success).toBe(false)
    expect(r.medidas?.[0].omitidos[0]).toMatchObject({ id: 'bomba-fantasma' })
  }, SIM_TIMEOUT)

  it('sin medidas no se simula nada', async () => {
    const r = await service.verificarMedida(NET1, { duration_hours: 24, tarifa: TARIFA, medidas: [] })

    expect(r.success).toBe(false)
    expect(r.error).toContain('ninguna medida')
  })
})
