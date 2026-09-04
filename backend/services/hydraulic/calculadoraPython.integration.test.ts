import { describe, it, expect } from 'vitest'
import { execFileSync } from 'child_process'
import * as path from 'path'
import { getPythonStatus } from './pythonDetector'

/**
 * El calculador de Python, que es **el que sirve el panel** (#128).
 *
 * `calculationEngine.ts` es sólo el respaldo, así que sus pruebas no dicen nada
 * de lo que le pasa a quien usa la calculadora. Y este calculador no
 * comprobaba ningún rango: aceptaba un diámetro de 20 m y devolvía una cifra
 * con su descargo de responsabilidad y su aspecto de resultado bueno.
 */

const GUION = path.resolve(__dirname, 'hydraulicCalculator.py')
const estado = getPythonStatus()

type Entrada = Record<string, { value: number; unit: string }>

const calcular = (formula: string, entradas: Entrada) => {
  const salida = execFileSync(
    estado.pythonPath!,
    [GUION, 'calculate', formula, JSON.stringify(entradas)],
    { encoding: 'utf8' }
  )
  return JSON.parse(salida) as { success: boolean; error?: string; data?: { result: { value: number; unit: string } } }
}

const darcy = (D: { value: number; unit: string }): Entrada => ({
  f: { value: 0.02, unit: '-' },
  L: { value: 500, unit: 'm' },
  D,
  V: { value: 0.5, unit: 'm/s' },
})

describe.skipIf(!estado.wntrAvailable)('la calculadora de Python comprueba el rango', () => {
  it('rechaza un diámetro de 20 m, que antes calculaba', () => {
    const r = calcular('darcy_weisbach', darcy({ value: 20, unit: 'm' }))
    expect(r.success).toBe(false)
    // Y lo dice en la unidad del rango, igual que el motor de JavaScript: si no,
    // el mensaje enfrenta dos números que no se comparan (#122).
    expect(r.error).toMatch(/D = 20 m is outside the valid range \[0\.01, 10\]/)
  })

  /**
   * La otra mitad, que es la que no se puede romper arreglando la primera: el
   * #122 era justo que se rechazaba un diámetro válido por comprobar el rango
   * antes de convertir la unidad.
   */
  it('acepta 300 mm y 12 in, y dan lo mismo que en metros', () => {
    const enMetros = calcular('darcy_weisbach', darcy({ value: 0.3048, unit: 'm' }))
    expect(enMetros.success).toBe(true)

    for (const D of [{ value: 12, unit: 'in' }, { value: 304.8, unit: 'mm' }]) {
      const r = calcular('darcy_weisbach', darcy(D))
      expect(r.success, `${D.value} ${D.unit}`).toBe(true)
      expect(r.data!.result.value).toBeCloseTo(enMetros.data!.result.value, 10)
    }

    // La cifra de este caso no está calculada aquí: es la que dio el panel de la
    // aplicación al comprobar el #127 a mano, con estas mismas entradas.
    const delPanel = calcular('darcy_weisbach', {
      f: { value: 0.02, unit: '-' },
      L: { value: 100, unit: 'm' },
      D: { value: 300, unit: 'mm' },
      V: { value: 1, unit: 'm/s' },
    })
    expect(delPanel.success).toBe(true)
    expect(delPanel.data!.result.value).toBeCloseTo(0.339789, 5)
  })

  it('sigue rechazando 20.000 mm, que sí está fuera', () => {
    const r = calcular('darcy_weisbach', darcy({ value: 20000, unit: 'mm' }))
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/D = 20 m is outside/)
  })

  /**
   * Una velocidad de 0,05 m/s es mala práctica y buena física: el calculador ya
   * avisa de sedimentación. Rechazarla sería repetir el #122 —dejar fuera un
   * dato válido— así que el rango es el límite duro y la banda de diseño se
   * queda en los avisos.
   */
  it('no rechaza lo que sólo es mala práctica, que para eso están los avisos', () => {
    const lento = calcular('darcy_weisbach', {
      ...darcy({ value: 300, unit: 'mm' }), V: { value: 0.05, unit: 'm/s' },
    })
    expect(lento.success).toBe(true)

    const rapido = calcular('darcy_weisbach', {
      ...darcy({ value: 300, unit: 'mm' }), V: { value: 20, unit: 'm/s' },
    })
    expect(rapido.success).toBe(false)
    expect(rapido.error).toMatch(/V = 20 m\/s is outside the valid range \[0, 10\]/)
  })

  it('el rango se comprueba en la unidad convertida, también en pies por segundo', () => {
    // 40 ft/s son 12,19 m/s: fuera. Y el aviso lo dice en m/s.
    const r = calcular('darcy_weisbach', {
      ...darcy({ value: 300, unit: 'mm' }), V: { value: 40, unit: 'ft/s' },
    })
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/V = 12\.192 m\/s is outside the valid range \[0, 10\]/)
  })
})
