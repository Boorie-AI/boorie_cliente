import { FormulaParameter } from '../../../src/types/hydraulic'

/**
 * Las unidades de la calculadora, en un sitio al que llegan los dos lados.
 *
 * El motor las necesita para convertir a unidad estándar antes de calcular, y
 * la pantalla para decir el rango válido en la unidad que el usuario tiene
 * elegida en el desplegable. Teniéndolas sólo en el motor, la pantalla
 * enseñaba el rango crudo —«0,01 – 10» con mm elegidos, para un diámetro de
 * 300 mm que sí se acepta— y el aviso hablaba de una unidad que no estaba a la
 * vista (#122).
 */

const FACTORES: Record<string, Record<string, number>> = {
  // A metros
  length: {
    'm': 1,
    'mm': 0.001,
    'cm': 0.01,
    'km': 1000,
    'ft': 0.3048,
    'in': 0.0254,
    'mi': 1609.344
  },
  // A m³/s
  flow: {
    'm³/s': 1,
    'm3/s': 1,
    'l/s': 0.001,
    // La grafía anterior sigue reconociéndose: hay cálculos guardados con ella.
    'L/s': 0.001,
    'm³/h': 1 / 3600,
    'm3/h': 1 / 3600,
    'gpm': 0.0000630902,
    'cfs': 0.0283168466
  },
  // A pascales
  pressure: {
    'Pa': 1,
    'kPa': 1000,
    'bar': 100000,
    'psi': 6894.757,
    'mH2O': 9806.65,
    'mca': 9806.65,
    'm.c.a.': 9806.65
  },
  // A m/s
  velocity: {
    'm/s': 1,
    'ft/s': 0.3048
  },
  // A m²
  area: {
    'm²': 1,
    'cm²': 0.0001,
    'ft²': 0.092903,
    'in²': 0.00064516
  },
  // A segundos
  time: {
    's': 1,
    'min': 60,
    'h': 3600,
    'day': 86400
  }
}

export function convertirUnidad(valor: number, de: string, a: string): number {
  if (de === a) return valor

  for (const factores of Object.values(FACTORES)) {
    if (factores[de] !== undefined && factores[a] !== undefined) {
      return valor * factores[de] / factores[a]
    }
  }

  console.warn(`No conversion found from ${de} to ${a}`)
  return valor
}

/**
 * La unidad en la que están escritos el rango y la fórmula del parámetro, que
 * es la primera de las que ofrece su desplegable con equivalente en el SI.
 */
export function unidadEstandarDe(param: FormulaParameter): string {
  if (param.units.includes('m') || param.units.includes('ft')) return 'm'
  if (param.units.includes('m³/s') || param.units.includes('l/s')) return 'm³/s'
  if (param.units.includes('m/s') || param.units.includes('ft/s')) return 'm/s'
  if (param.units.includes('Pa') || param.units.includes('kPa')) return 'Pa'
  if (param.units.includes('kg/m³')) return 'kg/m³'

  return param.units[0]
}

/** El rango del parámetro dicho en `unidad`, para poder enseñarlo al lado del campo. */
export function rangoEnUnidad(
  param: FormulaParameter,
  unidad: string
): { min: number; max: number } | null {
  if (!param.range) return null

  const estandar = unidadEstandarDe(param)
  return {
    min: convertirUnidad(param.range.min, estandar, unidad),
    max: convertirUnidad(param.range.max, estandar, unidad)
  }
}

/**
 * Una unidad de las que no se rotulan: el número va solo.
 *
 * Las tres grafías conviven porque las fórmulas vienen de dos sitios: el
 * calculador de Python —que es el que sirve el panel— escribe `-`, y el motor
 * de JavaScript, `dimensionless` o `decimal`.
 */
export function esAdimensional(unidad: string): boolean {
  return unidad === '-' || unidad === 'dimensionless' || unidad === 'decimal'
}
