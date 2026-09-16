import { describe, it, expect } from 'vitest'
import {
  horasDelFichero, resolverHoras, formatearHoras,
  VENTANA_POR_DEFECTO, HORAS_DE_RESPALDO,
} from './ventanaSimulacion'

describe('ventana de simulación', () => {
  it('por defecto es la duración del fichero', () => {
    expect(VENTANA_POR_DEFECTO).toBe('fichero')
    // Net3 declara una semana: la ventana por defecto son sus 168 h, no 24.
    expect(resolverHoras(VENTANA_POR_DEFECTO, horasDelFichero({ duration: 604800 }))).toBe(168)
  })

  it('lee la duración del .inp en horas', () => {
    expect(horasDelFichero({ duration: 86400 })).toBe(24)
    expect(horasDelFichero({ duration: 604800 })).toBe(168)
  })

  it('devuelve null cuando el modelo no declara una duración utilizable', () => {
    // Un modelo estacionario trae duration 0, y de ahí no sale una ventana.
    expect(horasDelFichero({ duration: 0 })).toBeNull()
    expect(horasDelFichero({})).toBeNull()
    expect(horasDelFichero(null)).toBeNull()
    expect(horasDelFichero({ duration: Number.NaN })).toBeNull()
  })

  it('cae en el respaldo si se pide la del fichero y no la hay', () => {
    expect(resolverHoras('fichero', null)).toBe(HORAS_DE_RESPALDO)
  })

  it('las ventanas fijas no dependen del fichero', () => {
    for (const horasFichero of [null, 168]) {
      expect(resolverHoras('24', horasFichero)).toBe(24)
      expect(resolverHoras('72', horasFichero)).toBe(72)
      expect(resolverHoras('168', horasFichero)).toBe(168)
    }
  })

  it('formatea sin decimales las horas enteras', () => {
    expect(formatearHoras(168)).toBe('168')
    // Una duración que no cae en horas justas no debe imprimirse como entera.
    expect(formatearHoras(horasDelFichero({ duration: 91800 })!)).toBe('25.5')
    expect(formatearHoras(1.5)).toBe('1.5')
  })
})
