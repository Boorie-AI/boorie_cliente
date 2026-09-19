/**
 * Cuándo arranca encendida la base de conocimiento (#159).
 *
 * Lo que se fija: que quien sube documentos no tenga que descubrir un
 * interruptor para que se usen, y que quien la apagó siga con ella apagada.
 */

import { describe, it, expect } from 'vitest'
import {
  CLAVE_ELECCION,
  configuracionInicialDeConocimiento,
  guardarEleccion,
  leerEleccion,
} from './baseDeConocimientoInicial'

describe('sin que el usuario haya elegido', () => {
  it('con documentos indexados arranca encendida', () => {
    // El caso del issue: el usuario sube sus documentos, pregunta por ellos y
    // la respuesta salía del conocimiento general del modelo.
    expect(configuracionInicialDeConocimiento(true).enabled).toBe(true)
  })

  it('sin documentos arranca apagada', () => {
    // Encenderla no serviría de nada y añadiría espera a cada pregunta.
    expect(configuracionInicialDeConocimiento(false).enabled).toBe(false)
  })

  it('y trae el resto de valores por defecto', () => {
    expect(configuracionInicialDeConocimiento(true)).toEqual({
      enabled: true, searchTopK: 3, searchMethod: 'agentic', categories: [],
    })
  })
})

describe('cuando el usuario ya eligió', () => {
  it('manda su elección, también si fue apagarla teniendo documentos', () => {
    expect(configuracionInicialDeConocimiento(true, false).enabled).toBe(false)
  })

  it('y si la encendió sin tener documentos, sigue encendida', () => {
    expect(configuracionInicialDeConocimiento(false, true).enabled).toBe(true)
  })
})

describe('recordar la elección', () => {
  const almacen = () => {
    const datos = new Map<string, string>()
    return {
      getItem: (k: string) => datos.get(k) ?? null,
      setItem: (k: string, v: string) => { datos.set(k, v) },
      datos,
    }
  }

  it('ida y vuelta', () => {
    const a = almacen()
    guardarEleccion(a, false)
    expect(a.datos.get(CLAVE_ELECCION)).toBe('false')
    expect(leerEleccion(a)).toBe(false)

    guardarEleccion(a, true)
    expect(leerEleccion(a)).toBe(true)
  })

  it('sin nada guardado no hay elección, que no es lo mismo que «apagada»', () => {
    expect(leerEleccion(almacen())).toBeNull()
  })

  it('un almacén que revienta no impide decidir', () => {
    const roto = {
      getItem: () => { throw new Error('bloqueado') },
      setItem: () => { throw new Error('bloqueado') },
    }
    expect(leerEleccion(roto)).toBeNull()
    expect(() => guardarEleccion(roto, true)).not.toThrow()
  })
})
