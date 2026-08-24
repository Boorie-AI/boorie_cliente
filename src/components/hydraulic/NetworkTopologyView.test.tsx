import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { NetworkTopologyView } from './NetworkTopologyView'

// vis-network necesita un lienzo de verdad; aquí sólo interesa qué eventos
// registra el visor y qué pinta el cuadro cuando se disparan.
let eventos: Record<string, (params: unknown) => void> = {}

vi.mock('@/components/common/VisNetworkGraph', () => ({
  default: (props: { events?: Record<string, (params: unknown) => void> }) => {
    eventos = props.events ?? {}
    return <div data-testid="vis" />
  },
}))

const RED = {
  nodes: [
    { id: 'J1', label: 'J1', type: 'junction', x: 0, y: 0, demand: 5 },
    { id: 'J2', label: 'J2', type: 'junction', x: 100, y: 50 },
  ],
  links: [{ id: 'P1', label: 'P1', type: 'pipe', from: 'J1', to: 'J2', length: 120, diameter: 200 }],
}

const RESULTADOS = {
  node_results: { J1: { pressure: [30, 45, 12] } },
  link_results: { P1: { flowrate: [0.1, 0.5, -0.2], velocity: [0.4, 1.8, 0.7] } },
}

const elegir = (evento: string, params: unknown) => act(() => { eventos[evento](params) })

describe('el cuadro del elemento elegido (#74)', () => {
  beforeEach(() => { eventos = {} })

  it('la presión del nudo elegido cambia con el control temporal', async () => {
    const { rerender } = render(
      <NetworkTopologyView networkData={RED} simulationResults={RESULTADOS} activeTimeStep={0} />
    )

    await elegir('selectNode', { nodes: ['J1'] })
    expect(screen.getByText(/Presión: 30\.00 m/)).toBeInTheDocument()

    rerender(<NetworkTopologyView networkData={RED} simulationResults={RESULTADOS} activeTimeStep={1} />)

    expect(screen.getByText(/Presión: 45\.00 m/)).toBeInTheDocument()
    expect(screen.queryByText(/Presión: 30\.00 m/)).not.toBeInTheDocument()
  })

  it('el caudal y la velocidad del tramo elegido también', async () => {
    const { rerender } = render(
      <NetworkTopologyView networkData={RED} simulationResults={RESULTADOS} activeTimeStep={0} />
    )

    await elegir('selectEdge', { edges: ['P1'], nodes: [] })
    expect(screen.getByText(/Velocidad: 0\.40 m\/s/)).toBeInTheDocument()

    rerender(<NetworkTopologyView networkData={RED} simulationResults={RESULTADOS} activeTimeStep={2} />)

    const cuadro = screen.getByText(/Velocidad: 0\.70 m\/s/)
    expect(cuadro).toHaveTextContent(/Caudal: -0\.2000/)
    // Lo que no depende del paso se queda como estaba.
    expect(cuadro).toHaveTextContent(/Longitud: 120/)
  })

  it('pinchar un nudo no enseña un tramo cualquiera', async () => {
    render(<NetworkTopologyView networkData={RED} simulationResults={RESULTADOS} activeTimeStep={0} />)

    await elegir('selectNode', { nodes: ['J1'] })
    // vis emite los dos eventos en el mismo clic.
    await elegir('selectEdge', { edges: ['P1'], nodes: ['J1'] })

    expect(screen.getByText(/junction: J1/)).toBeInTheDocument()
    expect(screen.queryByText(/pipe: P1/)).not.toBeInTheDocument()
  })

  it('al deseleccionar se cierra el cuadro', async () => {
    render(<NetworkTopologyView networkData={RED} simulationResults={RESULTADOS} activeTimeStep={0} />)

    await elegir('selectNode', { nodes: ['J1'] })
    await elegir('deselectNode', {})

    expect(screen.queryByText(/Presión:/)).not.toBeInTheDocument()
  })
})
