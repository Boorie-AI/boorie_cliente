/**
 * Las candidatas a medida de eficiencia energética (#42).
 *
 * Lo que se vigila: que sólo se propongan medidas **verificables** —una
 * recomendación cualitativa no se puede respaldar con una cifra, y este issue
 * existe para que las cifras estén respaldadas—, que se propongan por una señal
 * del análisis y no por costumbre, y que una medida de equipo no se presente
 * como si fuera un cambio de horario.
 */

import { describe, it, expect } from 'vitest'
import { generarCandidatas, type AnalisisParaRecomendar } from './recomendacionesEnergia'

const analisis = (parcial: Partial<AnalisisParaRecomendar> = {}): AnalisisParaRecomendar => ({
  energia_total_kwh: 336.9,
  coste_total: 56.98,
  moneda: 'USD',
  tarifa_aplicada: {
    moneda: 'USD',
    precio_kwh: 0.18,
    bloques: [
      { nombre: 'punta', desde_h: 18, hasta_h: 22, precio_kwh: 0.25 },
      { nombre: 'valle', desde_h: 0, hasta_h: 6, precio_kwh: 0.09 },
    ],
  },
  bombas: [
    {
      nombre: '6012',
      energia_kwh: 112.3,
      coste: 18.99,
      horas_en_marcha: 24,
      potencia_media_kw: 4.7,
      caudal_medio_m3s: 0.002,
      por_bloque_horario: {
        punta: { kwh: 18.3, coste: 4.58, precio_kwh: 0.25, desde_h: 18, hasta_h: 22 },
        valle: { kwh: 27.8, coste: 2.5, precio_kwh: 0.09, desde_h: 0, hasta_h: 6 },
        base: { kwh: 66.2, coste: 11.91, precio_kwh: 0.18, desde_h: null, hasta_h: null },
      },
      eficiencia: { origen: 'curva de eficiencia "AA" del .inp, interpolada al caudal', media_pct: 37.5, minima_pct: 15.7, maxima_pct: 57.5 },
      punto_optimo: {
        curva: 'AA',
        eficiencia_en_operacion_pct: 37.9,
        punto_optimo: { caudal_m3s: 0.006, eficiencia_pct: 70 },
        desviacion_caudal_pct: -66.7,
      },
    },
  ],
  ...parcial,
})

describe('candidatas de eficiencia energética', () => {
  it('propone sacar la bomba del bloque caro, con la ventana de la tarifa', () => {
    const c = generarCandidatas(analisis()).find(x => x.clase === 'traslado_horario')!

    expect(c.medida).toMatchObject({ tipo: 'pump_outage', elementos: ['6012'], desde_h: 18, hasta_h: 22 })
    expect(c.naturaleza).toBe('operativa')
    // El motivo trae las cifras del análisis, no un ahorro: todavía no se ha
    // simulado nada.
    expect(c.motivo).toContain('18,3 kWh')
    expect(c.motivo).toContain('0,250')
  })

  it('no propone tocar los bloques que no son más caros que el precio base', () => {
    const ids = generarCandidatas(analisis()).map(c => c.id)
    expect(ids.some(id => id.includes('valle'))).toBe(false)
    expect(ids.some(id => id.includes('base'))).toBe(false)
  })

  it('propone el punto óptimo cuando hay brecha, y lo marca como medida de equipo', () => {
    const c = generarCandidatas(analisis()).find(x => x.clase === 'punto_optimo')!

    expect(c.medida).toMatchObject({ tipo: 'pump_bep', elementos: ['6012'] })
    expect(c.naturaleza).toBe('equipo')
    expect(c.motivo).toContain('70,0%')
    expect(c.motivo).toContain('brecha')
  })

  it('no propone el punto óptimo si la bomba ya trabaja cerca de él', () => {
    const cerca = analisis()
    cerca.bombas[0].punto_optimo = {
      curva: 'AA',
      eficiencia_en_operacion_pct: 68,
      punto_optimo: { caudal_m3s: 0.0058, eficiencia_pct: 70 },
      desviacion_caudal_pct: -5,
    }
    expect(generarCandidatas(cerca).some(c => c.clase === 'punto_optimo')).toBe(false)
  })

  it('sin curva de eficiencia no se inventa un punto óptimo que alcanzar', () => {
    const sinCurva = analisis()
    sinCurva.bombas[0].punto_optimo = null
    expect(generarCandidatas(sinCurva).some(c => c.clase === 'punto_optimo')).toBe(false)
  })

  it('agrupa las bombas desviadas en una sola candidata: cada verificación son dos simulaciones', () => {
    const dos = analisis()
    dos.bombas.push({ ...dos.bombas[0], nombre: '6013' })
    const optimo = generarCandidatas(dos, 5).filter(c => c.clase === 'punto_optimo')

    expect(optimo).toHaveLength(1)
    expect(optimo[0].medida.elementos).toEqual(['6012', '6013'])
    expect(optimo[0].titulo).toContain('2 bombas')
  })

  it('ordena por el dinero en juego y respeta el tope', () => {
    const varias = analisis()
    varias.bombas.push({ ...varias.bombas[0], nombre: '6013' }, { ...varias.bombas[0], nombre: '6014' })
    const c = generarCandidatas(varias, 2)

    expect(c).toHaveLength(2)
    expect(c[0].costeEnJuego).toBeGreaterThanOrEqual(c[1].costeEnJuego)
  })

  it('una red sin bloques caros ni desviación no da candidatas', () => {
    const plana = analisis()
    plana.tarifa_aplicada.bloques = []
    plana.bombas[0].por_bloque_horario = { base: { kwh: 112.3, coste: 20.2, precio_kwh: 0.18, desde_h: null, hasta_h: null } }
    plana.bombas[0].punto_optimo = null

    expect(generarCandidatas(plana)).toEqual([])
  })
})
