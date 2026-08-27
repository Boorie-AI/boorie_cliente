import { describe, it, expect } from 'vitest'
import { demandaDelSistema } from './demandaSistema'

/**
 * La red de Net3 en pequeño: dos nudos que consumen y un embalse que aporta
 * exactamente lo mismo. Es la situación normal de cualquier red simulada, y la
 * que dejaba la curva en cero.
 */
const RED = {
  nodes: [
    { id: 'J1', type: 'junction' },
    { id: 'J2', type: 'junction' },
    { id: 'R1', type: 'reservoir' },
    { id: 'T1', type: 'tank' },
  ],
  links: [],
}

const RESULTADOS = {
  node_results: {
    J1: { demand: [0.4, 0.5] },
    J2: { demand: [0.28, 0.3] },
    R1: { demand: [-0.6, -0.7] },
    T1: { demand: [-0.08, -0.1] },
  },
}

describe('demanda del sistema (#79)', () => {
  it('no cuenta lo que aportan depósitos y embalses, que cancelaría el consumo', () => {
    expect(demandaDelSistema(RED, RESULTADOS, 2)).toEqual([0.68, 0.8])
  })

  it('sumar todos los nudos —lo que se hacía— deja la curva en cero', () => {
    // La comprobación que da sentido a la anterior: los datos de la prueba están
    // en equilibrio, como los de una simulación de verdad.
    const todos = Object.values(RESULTADOS.node_results).reduce((s, n) => s + n.demand[0], 0)
    expect(todos).toBeCloseTo(0, 10)
  })

  it('da un valor por paso, en el orden de la simulación', () => {
    expect(demandaDelSistema(RED, RESULTADOS, 2)).toHaveLength(2)
    expect(demandaDelSistema(RED, RESULTADOS, 1)).toEqual([0.68])
  })

  it('un resultado escalar vale para cualquier paso', () => {
    const escalar = { node_results: { J1: { demand: 0.25 }, R1: { demand: -0.25 } } }
    expect(demandaDelSistema(RED, escalar, 3)).toEqual([0.25, 0.25, 0.25])
  })

  it('un nudo sin dato no rompe la serie ni la ensucia', () => {
    const parcial = { node_results: { J1: { demand: [0.4] }, J2: {} } }
    expect(demandaDelSistema(RED, parcial, 1)).toEqual([0.4])
  })

  it('sin red o sin resultados la serie es de ceros, no de huecos', () => {
    expect(demandaDelSistema(null, RESULTADOS, 2)).toEqual([0, 0])
    expect(demandaDelSistema(RED, null, 2)).toEqual([0, 0])
  })

  it('el tipo del nudo se reconoce venga como venga escrito', () => {
    const mayusculas = { nodes: [{ id: 'J1', type: 'Junction' }, { id: 'R1', type: 'RESERVOIR' }], links: [] }
    expect(demandaDelSistema(mayusculas, RESULTADOS, 1)).toEqual([0.4])
  })
})
