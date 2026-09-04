import { describe, it, expect } from 'vitest'
import { HydraulicCalculationEngine } from './calculationEngine'

/**
 * Los pasos intermedios de la calculadora (#89).
 *
 * Son lo que un ingeniero mira para comprobar un cálculo, y se pintaban como
 * «fórmula = 0.0017», sin decir de qué. La unidad no puede salir del resultado
 * final: en Darcy-Weisbach la altura de velocidad va en metros y la relación L/D
 * no tiene unidad, así que la trae cada paso.
 */
const motor = new HydraulicCalculationEngine()

const m = (value: number, unit: string) => ({ value, unit })

describe('cada paso intermedio dice en qué unidad está', () => {
  it('Darcy-Weisbach: metros donde son metros, y nada donde es una relación', () => {
    const r = motor.calculate('darcy-weisbach', {
      f: m(0.02, 'dimensionless'),
      L: m(1000, 'm'),
      D: m(0.3, 'm'),
      V: m(1.5, 'm/s'),
    })

    const pasos = r.intermediateSteps!
    expect(pasos.map(p => p.unit)).toEqual(['m', '', 'm'])
    expect(r.result.unit).toBe('m')
  })

  it('la potencia de bombeo pasa de vatios a kilovatios, y lo dice', () => {
    const r = motor.calculate('pump-power', {
      ρ: m(1000, 'kg/m³'),
      g: m(9.81, 'm/s²'),
      Q: m(0.05, 'm³/s'),
      H: m(30, 'm'),
      η: m(0.75, 'dimensionless'),
    })

    const pasos = r.intermediateSteps!
    expect(pasos.map(p => p.unit)).toEqual(['W', 'W', 'kW'])
    // Y la conversión es de verdad: el último paso es el primero entre mil.
    expect(pasos[2].result).toBeCloseTo(pasos[1].result / 1000, 6)
  })

  it('el golpe de ariete distingue los pascales de los kilopascales', () => {
    const r = motor.calculate('water-hammer', {
      ρ: m(1000, 'kg/m³'),
      c: m(1200, 'm/s'),
      ΔV: m(1.5, 'm/s'),
    })

    expect(r.intermediateSteps!.map(p => p.unit)).toEqual(['Pa', 'kPa'])
  })

  it('el caudal se ofrece primero en l/s, que es la unidad de la aplicación (#89)', () => {
    // No se le quita ninguna opción a quien calcula: sólo cambia cuál se ofrece
    // por defecto, que es la primera de la lista.
    const caudales = motor.getAvailableFormulas()
      .flatMap(f => f.parameters)
      .filter(p => p.units.includes('l/s'))

    expect(caudales.length).toBeGreaterThan(0)
    for (const p of caudales) {
      expect(p.units[0]).toBe('l/s')
    }
  })

  it('ningún paso se queda sin declarar su unidad, aunque sea vacía', () => {
    const r = motor.calculate('tank-volume', {
      Qmax: m(0.05, 'm³/s'),
      t: m(8, 'h'),   // el tiempo de regulación se pide en horas, entre 2 y 24
      Vfire: m(100, 'm³'),
      Vemergency: m(50, 'm³'),
    })

    for (const paso of r.intermediateSteps!) {
      expect(paso).toHaveProperty('unit')
      expect(typeof paso.unit).toBe('string')
    }
    expect(r.intermediateSteps!.map(p => p.unit)).toEqual(['m³', 'm³', 'm³'])
  })
})

describe('el rango se comprueba en la unidad del rango', () => {
  /**
   * El desplegable de diámetro ofrece m, mm y pulgadas, pero el rango del
   * parámetro está escrito en metros: [0,01, 10]. Comprobándolo sobre el valor
   * crudo, un diámetro perfectamente normal de 300 mm quedaba «fuera del rango
   * [0.01, 10]» y 12 in también. El aviso hablaba de un rango que el usuario no
   * había escrito, y no había forma de salir salvo cambiar de unidad.
   */
  it('acepta 300 mm y 12 in, que antes rechazaba', () => {
    const enMetros = motor.calculate('darcy-weisbach', {
      f: m(0.02, 'dimensionless'), L: m(500, 'm'), D: m(0.3, 'm'), V: m(0.5, 'm/s'),
    })
    const enMilimetros = motor.calculate('darcy-weisbach', {
      f: m(0.02, 'dimensionless'), L: m(500, 'm'), D: m(300, 'mm'), V: m(0.5, 'm/s'),
    })
    // La misma tubería descrita de dos maneras da el mismo número.
    expect(enMilimetros.result.value).toBeCloseTo(enMetros.result.value, 10)
    expect(enMetros.result.value).toBeCloseTo(0.42474, 5)

    expect(() => motor.calculate('darcy-weisbach', {
      f: m(0.02, 'dimensionless'), L: m(500, 'm'), D: m(12, 'in'), V: m(0.5, 'm/s'),
    })).not.toThrow()
  })

  it('sigue rechazando lo que de verdad está fuera, y lo dice en la unidad del rango', () => {
    // 20 m de diámetro no es una tubería, en ninguna unidad.
    expect(() => motor.calculate('darcy-weisbach', {
      f: m(0.02, 'dimensionless'), L: m(500, 'm'), D: m(20000, 'mm'), V: m(0.5, 'm/s'),
    })).toThrow(/D = 20 m is outside the valid range \[0.01, 10\]/)
  })

  it('sigue avisando de lo que falta antes de intentar convertirlo', () => {
    expect(() => motor.calculate('darcy-weisbach', { f: m(0.02, 'dimensionless') }))
      .toThrow(/Missing required parameter/)
  })
})
