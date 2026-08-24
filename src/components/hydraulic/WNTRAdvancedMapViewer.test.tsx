import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { WNTRAdvancedMapViewer } from './WNTRAdvancedMapViewer'

/**
 * Simular desde el visor tiene que llegar al armazón.
 *
 * `onSimulationCompleted` se declaraba como prop y se descartaba —destructurada
 * como `_onSimulationCompleted`—, y el mapa no tenía por dónde devolver nada, así
 * que el botón «Simulate» de su cabecera calculaba de verdad pero ni la barra de
 * tiempo ni la simbología ni el panel de resultados se enteraban: parecía roto.
 */

// El mapa de verdad necesita Mapbox y WebGL. Aquí sólo interesa el cable: qué
// recibe del armazón y qué le devuelve.
let propsDelMapa: Record<string, unknown> = {}

vi.mock('./WNTRMapViewer', () => ({
  WNTRMapViewer: (props: Record<string, unknown>) => {
    propsDelMapa = props
    return <div data-testid="mapa" />
  },
}))

vi.mock('./WNTRAdvancedVisualizerPanel', () => ({
  WNTRAdvancedVisualizerPanel: () => <div data-testid="panel" />,
}))

const RED = {
  name: 'red',
  nodes: [
    { id: 'J1', label: 'J1', type: 'junction', x: 0, y: 0 },
    { id: 'J2', label: 'J2', type: 'junction', x: 100, y: 50 },
  ],
  links: [{ id: 'P1', label: 'P1', type: 'pipe', from: 'J1', to: 'J2' }],
  options: {},
}

const RESULTADOS = {
  node_results: { J1: { pressure: [30, 45, 12] }, J2: { pressure: [28, 41, 10] } },
  link_results: { P1: { flowrate: [0.1, 0.5, -0.2], velocity: [0.4, 1.8, 0.7] } },
  timestamps: [0, 3600, 7200],
}

describe('los resultados de simular desde el mapa suben al armazón', () => {
  beforeEach(() => { propsDelMapa = {} })

  it('avisa a quien contiene el visor', () => {
    const avisado = vi.fn()
    render(<WNTRAdvancedMapViewer networkData={RED as never} onSimulationCompleted={avisado} />)

    const devolver = propsDelMapa.onSimulationResults as (r: unknown) => void
    expect(devolver).toBeTypeOf('function')

    act(() => devolver(RESULTADOS))

    expect(avisado).toHaveBeenCalledWith(RESULTADOS)
  })

  it('los resultados vuelven al mapa y traen la barra de tiempo', () => {
    render(<WNTRAdvancedMapViewer networkData={RED as never} />)

    // Sin resultados no hay nada que recorrer: el reproductor no está.
    expect(screen.queryByText(/paso 1 de/)).not.toBeInTheDocument()
    expect(propsDelMapa.simulationResults).toBeNull()

    act(() => (propsDelMapa.onSimulationResults as (r: unknown) => void)(RESULTADOS))

    expect(propsDelMapa.simulationResults).toEqual(RESULTADOS)
    expect(screen.getByText(/paso 1 de 3/)).toBeInTheDocument()
  })

  it('no exige que el contenedor pase el callback', () => {
    render(<WNTRAdvancedMapViewer networkData={RED as never} />)

    expect(() =>
      act(() => (propsDelMapa.onSimulationResults as (r: unknown) => void)(RESULTADOS))
    ).not.toThrow()
  })
})
