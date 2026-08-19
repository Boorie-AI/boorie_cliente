import { describe, it, expect } from 'vitest'
import {
  CAPAS_TODAS,
  contarPorTipo,
  hayCapasOcultas,
  nudoVisible,
  tipoNudo,
  tipoTramo,
  tramoVisible,
} from './capas'

const RED = {
  nodes: [
    { id: 'J1', type: 'junction' },
    { id: 'J2', type: 'Junction' },
    { id: 'T1', type: 'tank' },
    { id: 'R1', type: 'RESERVOIR' },
  ],
  links: [
    { id: 'P1', from: 'J1', to: 'J2', type: 'pipe' },
    { id: 'P2', from: 'J2', to: 'T1', type: 'Pipe' },
    { id: 'B1', from: 'R1', to: 'J1', type: 'PUMP' },
    { id: 'V1', from: 'T1', to: 'J2', type: 'valve' },
  ],
}

describe('clasificación por tipo', () => {
  it('no depende de las mayúsculas, que cada servicio escribe a su manera', () => {
    expect(tipoNudo({ id: 'a', type: 'Junction' })).toBe('junction')
    expect(tipoNudo({ id: 'b', type: 'RESERVOIR' })).toBe('reservoir')
    expect(tipoTramo({ id: 'c', from: 'a', to: 'b', type: 'Pipe' })).toBe('pipe')
    expect(tipoTramo({ id: 'd', from: 'a', to: 'b', type: 'PUMP' })).toBe('pump')
  })

  it('un tipo desconocido se agrupa con el común, no desaparece', () => {
    // Un elemento invisible por no saber clasificarlo sería peor que uno mal
    // agrupado: el ingeniero no tendría forma de notar que le falta.
    expect(tipoNudo({ id: 'x', type: 'no-existe' })).toBe('junction')
    expect(tipoNudo({ id: 'y' })).toBe('junction')
    expect(tipoTramo({ id: 'z', from: 'a', to: 'b' })).toBe('pipe')
  })
})

describe('filtrado', () => {
  it('con todas las capas encendidas no se oculta nada', () => {
    expect(RED.nodes.every(n => nudoVisible(n, CAPAS_TODAS))).toBe(true)
    expect(RED.links.every(l => tramoVisible(l, CAPAS_TODAS))).toBe(true)
    expect(hayCapasOcultas(CAPAS_TODAS)).toBe(false)
  })

  it('apagar los nudos de consumo deja los depósitos y los embalses', () => {
    const capas = { ...CAPAS_TODAS, junction: false }
    const visibles = RED.nodes.filter(n => nudoVisible(n, capas)).map(n => n.id)
    expect(visibles).toEqual(['T1', 'R1'])
    expect(hayCapasOcultas(capas)).toBe(true)
  })

  it('dejar sólo bombas y válvulas es el caso que motivó rescatar esto', () => {
    const capas = { ...CAPAS_TODAS, pipe: false }
    const visibles = RED.links.filter(l => tramoVisible(l, capas)).map(l => l.id)
    expect(visibles).toEqual(['B1', 'V1'])
  })

  it('apagarlo todo no revienta: deja la red vacía', () => {
    const nada = { junction: false, tank: false, reservoir: false, pipe: false, pump: false, valve: false }
    expect(RED.nodes.filter(n => nudoVisible(n, nada))).toHaveLength(0)
    expect(RED.links.filter(l => tramoVisible(l, nada))).toHaveLength(0)
  })
})

describe('contadores', () => {
  it('cuenta cada tipo, respetando las mayúsculas dispares', () => {
    expect(contarPorTipo(RED)).toEqual({
      junction: 2, tank: 1, reservoir: 1, pipe: 2, pump: 1, valve: 1,
    })
  })

  it('sin red, todo a cero en vez de fallar', () => {
    expect(contarPorTipo(null).pump).toBe(0)
  })
})
