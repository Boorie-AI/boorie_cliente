import { describe, it, expect } from 'vitest'
import { FormulaParameter } from '../../../src/types/hydraulic'
import {
  convertirUnidad,
  esAdimensional,
  rangoEnUnidad,
  unidadEstandarDe
} from './unidadesDeCalculo'

const param = (units: string[], range?: { min: number; max: number }): FormulaParameter => ({
  symbol: 'X',
  nameKey: 'x',
  descriptionKey: 'x',
  units,
  range
})

const diametro = param(['m', 'mm', 'in'], { min: 0.01, max: 10 })

describe('convertirUnidad', () => {
  it('convierte dentro de la misma magnitud', () => {
    expect(convertirUnidad(300, 'mm', 'm')).toBeCloseTo(0.3, 10)
    expect(convertirUnidad(12, 'in', 'm')).toBeCloseTo(0.3048, 10)
    expect(convertirUnidad(500, 'l/s', 'm³/s')).toBeCloseTo(0.5, 10)
  })

  it('devuelve el valor tal cual si la unidad no cambia', () => {
    expect(convertirUnidad(7, 'dimensionless', 'dimensionless')).toBe(7)
  })

  /**
   * Velocidad y área no estaban en la tabla, así que elegir `ft/s` o `cm²` en el
   * desplegable no convertía nada: el valor entraba al cálculo como si estuviera
   * ya en unidad estándar.
   */
  it('convierte velocidad y área, que antes se colaban sin convertir', () => {
    expect(convertirUnidad(1, 'ft/s', 'm/s')).toBeCloseTo(0.3048, 10)
    expect(convertirUnidad(10000, 'cm²', 'm²')).toBeCloseTo(1, 10)
    expect(convertirUnidad(1, 'in²', 'm²')).toBeCloseTo(0.00064516, 12)
  })
})

describe('unidadEstandarDe', () => {
  it('es la unidad en que está escrito el rango', () => {
    expect(unidadEstandarDe(diametro)).toBe('m')
    expect(unidadEstandarDe(param(['l/s', 'm³/s', 'gpm']))).toBe('m³/s')
    expect(unidadEstandarDe(param(['m/s', 'ft/s']))).toBe('m/s')
  })

  it('para una unidad sin equivalente SI, la única que hay', () => {
    expect(unidadEstandarDe(param(['dimensionless']))).toBe('dimensionless')
    expect(unidadEstandarDe(param(['m/s²']))).toBe('m/s²')
    expect(unidadEstandarDe(param(['h']))).toBe('h')
  })
})

describe('rangoEnUnidad', () => {
  /**
   * Es lo que arregla el #122 del lado de la pantalla: el rango del diámetro
   * está escrito en metros, y con mm elegidos se leía «0,01 – 10» junto a un
   * campo donde 300 es el valor normal.
   */
  it('dice el rango del diámetro en la unidad elegida', () => {
    expect(rangoEnUnidad(diametro, 'm')).toEqual({ min: 0.01, max: 10 })

    const mm = rangoEnUnidad(diametro, 'mm')!
    expect(mm.min).toBeCloseTo(10, 8)
    expect(mm.max).toBeCloseTo(10000, 8)

    const pulgadas = rangoEnUnidad(diametro, 'in')!
    expect(pulgadas.min).toBeCloseTo(0.3937, 4)
    expect(pulgadas.max).toBeCloseTo(393.7008, 4)
  })

  it('deja el rango quieto cuando el parámetro no tiene unidad que convertir', () => {
    expect(rangoEnUnidad(param(['dimensionless'], { min: 0.008, max: 0.1 }), 'dimensionless'))
      .toEqual({ min: 0.008, max: 0.1 })
  })

  it('no hay rango que enseñar si el parámetro no lo declara', () => {
    expect(rangoEnUnidad(param(['m', 'mm']), 'mm')).toBeNull()
  })

  it('dice el rango de la velocidad en pies por segundo', () => {
    const V = param(['m/s', 'ft/s'], { min: 0.1, max: 5 })
    const pies = rangoEnUnidad(V, 'ft/s')!
    expect(pies.min).toBeCloseTo(0.328084, 5)
    expect(pies.max).toBeCloseTo(16.4042, 4)
  })

  it('el 300 mm que la calculadora acepta cae dentro del rango que enseña', () => {
    const mm = rangoEnUnidad(diametro, 'mm')!
    expect(300).toBeGreaterThanOrEqual(mm.min)
    expect(300).toBeLessThanOrEqual(mm.max)
  })
})

describe('esAdimensional', () => {
  it('distingue las unidades que no se rotulan', () => {
    expect(esAdimensional('dimensionless')).toBe(true)
    expect(esAdimensional('decimal')).toBe(true)
    // La grafía del calculador de Python, que es quien sirve el panel.
    expect(esAdimensional('-')).toBe(true)
    expect(esAdimensional('mm')).toBe(false)
    expect(esAdimensional('kg/m³')).toBe(false)
  })
})
