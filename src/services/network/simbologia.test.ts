import { describe, it, expect } from 'vitest'
import { construirEscala } from './simbologia'

const RED = {
  nodes: [{ id: 'J1' }, { id: 'J2' }, { id: 'J3' }],
  links: [
    { id: 'P1', from: 'J1', to: 'J2' },
    { id: 'P2', from: 'J2', to: 'J3' },
  ],
}

describe('la escala sale de los datos, no de un máximo escrito a mano', () => {
  it('una red de caudales pequeños reparte todos sus colores', () => {
    // Con el máximo fijo de 200 L/s que usaba el visor retirado, una red que va
    // de 1 a 5 L/s caía entera en el primer color y no se distinguía nada.
    const escala = construirEscala('caudal', RED, {
      link_results: { P1: { flowrate: 1 }, P2: { flowrate: 5 } },
    })!

    expect(escala.min).toBe(1)
    expect(escala.max).toBe(5)
    expect(escala.color(1)).not.toBe(escala.color(5))
  })

  it('una red de caudales enormes tampoco satura', () => {
    const escala = construirEscala('caudal', RED, {
      link_results: { P1: { flowrate: 500 }, P2: { flowrate: 4000 } },
    })!

    expect(escala.max).toBe(4000)
    expect(escala.color(500)).not.toBe(escala.color(4000))
  })

  it('el caudal negativo se colorea por su magnitud, no por su signo', () => {
    const escala = construirEscala('caudal', RED, {
      link_results: { P1: { flowrate: -40 }, P2: { flowrate: 40 } },
    })!

    expect(escala.min).toBe(40)
    expect(escala.color(-40)).toBe(escala.color(40))
  })

  it('la leyenda declara los tramos reales de la red', () => {
    const escala = construirEscala('velocidad', RED, {
      link_results: { P1: { velocity: 0 }, P2: { velocity: 2 } },
    })!

    expect(escala.leyenda).toHaveLength(5)
    expect(escala.leyenda[0].etiqueta).toContain('m/s')
    expect(escala.absoluta).toBe(false)
  })
})

describe('la presión es la excepción, y a propósito', () => {
  it('usa cortes absolutos de servicio, no el rango de la red', () => {
    // Escalar la presión al máximo de cada modelo escondería justamente lo que
    // hay que ver: qué nudos quedan por debajo del mínimo de servicio.
    const escala = construirEscala('presion', RED, {
      node_results: { J1: { pressure: 5 }, J2: { pressure: 45 }, J3: { pressure: 90 } },
    })!

    expect(escala.absoluta).toBe(true)
    expect(escala.color(5)).toBe('#DC2626')
    expect(escala.color(45)).toBe('#3B82F6')
    expect(escala.color(90)).toBe('#F97316')
  })

  it('una red entera con presión buena no pinta ningún nudo en rojo', () => {
    const escala = construirEscala('presion', RED, {
      node_results: { J1: { pressure: 30 }, J2: { pressure: 40 }, J3: { pressure: 50 } },
    })!
    expect([30, 40, 50].map(escala.color)).toEqual(['#3B82F6', '#3B82F6', '#3B82F6'])
  })
})

describe('casos límite', () => {
  it('sin resultados no hay escala que construir', () => {
    expect(construirEscala('caudal', RED, null)).toBeNull()
    expect(construirEscala('ninguna', RED, { link_results: {} })).toBeNull()
  })

  it('un parámetro que la simulación no trae no inventa una escala', () => {
    expect(construirEscala('velocidad', RED, { node_results: { J1: { pressure: 10 } } })).toBeNull()
  })

  it('todos los valores iguales dan un color y una leyenda con ese valor', () => {
    const escala = construirEscala('demanda', RED, {
      node_results: { J1: { demand: 2 }, J2: { demand: 2 }, J3: { demand: 2 } },
    })!

    expect(escala.min).toBe(escala.max)
    expect(escala.leyenda).toHaveLength(1)
    expect(escala.leyenda[0].etiqueta).toContain('2.00 L/s')
    expect(escala.color(2)).toBeTruthy()
  })

  it('un elemento sin dato en ese paso se queda sin color, no con uno inventado', () => {
    const escala = construirEscala('caudal', RED, {
      link_results: { P1: { flowrate: 10 }, P2: { flowrate: 20 } },
    })!
    expect(escala.color(undefined)).toBeNull()
  })

  it('lee el paso pedido cuando los resultados vienen como serie', () => {
    const escala = construirEscala(
      'velocidad',
      RED,
      { link_results: { P1: { velocity: [0.1, 3] }, P2: { velocity: [0.2, 4] } } },
      1
    )!
    expect(escala.min).toBe(3)
    expect(escala.max).toBe(4)
  })
})
