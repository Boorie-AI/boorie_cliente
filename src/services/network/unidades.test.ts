import { describe, it, expect } from 'vitest'
import {
  cifrasSignificativas,
  enUnidadDePresentacion,
  etiquetaMagnitud,
  formatearMagnitud,
  unidadDe,
} from './unidades'

describe('cifras significativas', () => {
  it('recorta la basura de coma flotante que llega del motor', () => {
    expect(cifrasSignificativas(1.743182126532, 6)).toBe('1,74318')
  })

  it('cuenta cifras significativas, no decimales', () => {
    expect(cifrasSignificativas(0.001743182126532, 6)).toBe('0,00174318')
    expect(cifrasSignificativas(1234567, 6)).toBe('1.234.570')
  })

  it('no rellena con ceros lo que no aporta precisión', () => {
    expect(cifrasSignificativas(0.5, 6)).toBe('0,5')
    expect(cifrasSignificativas(120, 6)).toBe('120')
  })

  it('el cero es cero y no «0,00000»', () => {
    expect(cifrasSignificativas(0, 6)).toBe('0')
  })

  it('separa los miles con punto y decide con coma', () => {
    expect(cifrasSignificativas(12345.6, 6)).toBe('12.345,6')
  })

  it('un valor negativo conserva el signo', () => {
    expect(cifrasSignificativas(-0.0421, 6)).toBe('−0,0421')
  })

  it('un valor que no es un número no inventa una cifra', () => {
    expect(cifrasSignificativas(NaN, 6)).toBe('—')
    expect(cifrasSignificativas(Infinity, 6)).toBe('—')
  })

  it('un residuo numérico diminuto se lee en decimal, no en notación exponencial', () => {
    expect(cifrasSignificativas(1e-9, 6)).toBe('0,000000001')
  })
})

describe('unidades de presentación', () => {
  it('la demanda del motor está en m³/s y se enseña en l/s', () => {
    expect(formatearMagnitud(0.001743182126532, 'demanda')).toBe('1,74318 l/s')
    expect(unidadDe('demanda')).toBe('l/s')
    expect(enUnidadDePresentacion(0.05, 'caudal')).toBeCloseTo(50)
  })

  it('el diámetro del motor está en metros y se enseña en milímetros', () => {
    expect(formatearMagnitud(0.4064, 'diametro')).toBe('406,4 mm')
  })

  it('las magnitudes que ya vienen en su unidad sólo ganan el símbolo', () => {
    expect(formatearMagnitud(0.3048, 'cota')).toBe('0,3048 m')
    expect(formatearMagnitud(120, 'longitud')).toBe('120 m')
    expect(formatearMagnitud(31.245678, 'presion')).toBe('31,25 m')
    expect(formatearMagnitud(1.23456, 'velocidad')).toBe('1,23 m/s')
  })

  it('un caudal negativo se enseña con signo: circula al revés, no es un error', () => {
    expect(formatearMagnitud(-0.0032, 'caudal')).toBe('−3,2 l/s')
  })

  it('sin dato no hay etiqueta, en vez de una etiqueta con un hueco', () => {
    expect(formatearMagnitud(undefined, 'cota')).toBeNull()
    expect(formatearMagnitud(null, 'cota')).toBeNull()
    expect(etiquetaMagnitud('Cota', undefined, 'cota')).toBeNull()
  })

  it('la etiqueta lleva rótulo, cifra y unidad', () => {
    expect(etiquetaMagnitud('Cota', 0.3048, 'cota')).toBe('Cota: 0,3048 m')
  })
})
