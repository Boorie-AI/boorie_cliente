import { describe, it, expect } from 'vitest'
import { esCalidadSintetica } from './calidadSintetica'

/** Tal como lo escribía el servicio hasta la v1.23.0. */
const ANTIGUO = {
  status: 'Completed (Simulated)',
  summary: {
    nodes: 97,
    parameter: 'AGE',
    note: 'Using Hydraulic Simulator + Synthetic WQ due to macOS EpanetSimulator instability.',
  },
}

/** Y como lo escribe ahora, con EPANET de verdad. */
const NUEVO = {
  status: 'Completed',
  summary: { nodes: 97, parameter: 'AGE', unit: 'h', simulator: 'EpanetSimulator' },
}

describe('reconocer la calidad que nunca se simuló', () => {
  it('marca los resultados que fabricaba la versión anterior', () => {
    expect(esCalidadSintetica(ANTIGUO)).toBe(true)
  })

  it('no marca los que sí salen de una simulación', () => {
    expect(esCalidadSintetica(NUEVO)).toBe(false)
  })

  it('basta con cualquiera de las dos marcas, porque las escribía el mismo código', () => {
    expect(esCalidadSintetica({ status: 'Completed', summary: { note: 'Synthetic WQ' } })).toBe(true)
    expect(esCalidadSintetica({ status: 'Completed (Simulated)', summary: null })).toBe(true)
  })

  it('un resultado de otro tipo, o vacío, no se marca', () => {
    expect(esCalidadSintetica(null)).toBe(false)
    expect(esCalidadSintetica(undefined)).toBe(false)
    expect(esCalidadSintetica({})).toBe(false)
    expect(esCalidadSintetica({ status: 'Completed', summary: { note: 'otra cosa' } })).toBe(false)
  })

  it('una nota que no es texto no se confunde con la marca', () => {
    expect(esCalidadSintetica({ summary: { note: 42 } })).toBe(false)
  })

  it('reconoce también el JSON sin parsear, que es como llega en el historial', () => {
    expect(esCalidadSintetica(JSON.stringify(ANTIGUO))).toBe(true)
    expect(esCalidadSintetica(JSON.stringify(NUEVO))).toBe(false)
    expect(esCalidadSintetica('')).toBe(false)
  })
})
