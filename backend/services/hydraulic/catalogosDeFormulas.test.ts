import { describe, it, expect } from 'vitest'
import { execFileSync } from 'child_process'
import * as path from 'path'
import { HydraulicCalculationEngine } from './calculationEngine'
import { getPythonStatus } from './pythonDetector'
import { EQUIVALENTE_EN_JS, SIN_EQUIVALENTE, idParaElMotorJS } from './idsDeFormula'

/**
 * Que los dos catálogos de la calculadora no se separen (#128).
 *
 * El panel lo sirve el calculador de Python y `calculationEngine.ts` es el
 * respaldo, así que son dos listas de fórmulas escritas a mano que hay que
 * acordarse de tocar a la vez. Ya habían divergido: el diámetro tenía rango en
 * una y ninguno en la otra, la velocidad admitía 0,1–5 m/s en una y 0–10 en la
 * otra, y la C de Hazen-Williams 80–150 frente a 50–150. El mismo dato daba
 * dos comportamientos según qué hubiera instalado en la máquina.
 */

interface ParametroPy { symbol: string; units: string[]; range?: { min: number; max: number } }
interface FormulaPy { id: string; parameters: ParametroPy[] }

const GUION = path.resolve(__dirname, 'hydraulicCalculator.py')
const estado = getPythonStatus()

const catalogoDePython = (): FormulaPy[] => {
  const salida = execFileSync(estado.pythonPath!, [GUION, 'formulas'], { encoding: 'utf8' })
  return JSON.parse(salida).data as FormulaPy[]
}

describe('el puente entre los dos catálogos', () => {
  it('traduce el id de Python al del motor de JavaScript', () => {
    expect(idParaElMotorJS('darcy_weisbach')).toBe('darcy-weisbach')
    // Y acepta ya el del motor, para que da igual de qué lado venga.
    expect(idParaElMotorJS('darcy-weisbach')).toBe('darcy-weisbach')
  })

  it('no traduce las que no tienen respaldo', () => {
    for (const id of Object.keys(SIN_EQUIVALENTE)) expect(idParaElMotorJS(id)).toBeNull()
  })

  it('cada equivalencia declarada existe de verdad en el motor de JavaScript', () => {
    const motor = new HydraulicCalculationEngine()
    const suyas = new Set(motor.getAvailableFormulas().map(f => f.id))
    for (const [py, js] of Object.entries(EQUIVALENTE_EN_JS)) {
      expect(suyas.has(js), `${py} → ${js}`).toBe(true)
    }
  })

  /**
   * Es lo que impide que vuelva el fallo de fondo: `tank_volume` se llama igual
   * en los dos catálogos y **no es la misma fórmula** —uno recibe las
   * dimensiones del depósito y el otro lo dimensiona por demanda—, así que una
   * equivalencia por parecido de nombre daría una cifra equivocada.
   */
  it('una equivalencia exige los mismos parámetros, no un nombre parecido', () => {
    const motor = new HydraulicCalculationEngine()
    const tanquePy = ['D', 'H']
    const tanqueJS = motor.getAvailableFormulas()
      .find(f => f.id === 'tank-volume')!.parameters.map(p => p.symbol)

    expect(tanqueJS).not.toEqual(tanquePy)
    expect(idParaElMotorJS('tank_volume')).toBeNull()
    expect(SIN_EQUIVALENTE.tank_volume).toMatch(/dos fórmulas distintas/)
  })
})

// Sin Python no se puede leer el catálogo de Python, así que se salta en vez de
// medir a medias: es la misma regla que sigue la batería del agente.
describe.skipIf(!estado.wntrAvailable)('los rangos de los dos catálogos', () => {
  it('no se contradicen donde la fórmula es la misma', () => {
    const motor = new HydraulicCalculationEngine()
    const porId = new Map(motor.getAvailableFormulas().map(f => [f.id, f]))
    const choques: string[] = []

    for (const formula of catalogoDePython()) {
      const js = porId.get(idParaElMotorJS(formula.id) ?? '')
      if (!js) continue

      for (const py of formula.parameters) {
        const suyo = js.parameters.find(p => p.symbol === py.symbol)
        if (!suyo?.range || !py.range) continue
        if (suyo.range.min !== py.range.min || suyo.range.max !== py.range.max) {
          choques.push(
            `${formula.id}.${py.symbol}: Python [${py.range.min}, ${py.range.max}] `
            + `frente a [${suyo.range.min}, ${suyo.range.max}]`
          )
        }
      }
    }

    expect(choques, choques.join(' · ')).toEqual([])
  })

  /**
   * El rango del panel sale del catálogo de Python, así que un parámetro sin
   * rango ahí no se comprueba aunque el motor de JavaScript sí lo acote. Es
   * como el panel aceptaba un diámetro de 20 m.
   */
  it('lo que el motor de JavaScript acota, Python también', () => {
    const motor = new HydraulicCalculationEngine()
    const porId = new Map(motor.getAvailableFormulas().map(f => [f.id, f]))
    const sinAcotar: string[] = []

    for (const formula of catalogoDePython()) {
      const js = porId.get(idParaElMotorJS(formula.id) ?? '')
      if (!js) continue

      for (const py of formula.parameters) {
        const suyo = js.parameters.find(p => p.symbol === py.symbol)
        if (suyo?.range && !py.range) sinAcotar.push(`${formula.id}.${py.symbol}`)
      }
    }

    expect(sinAcotar, sinAcotar.join(', ')).toEqual([])
  })
})
