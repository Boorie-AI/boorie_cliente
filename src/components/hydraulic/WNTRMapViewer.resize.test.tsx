import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { WNTRMapViewer } from './WNTRMapViewer'
import { AJUSTES_INICIALES, soloAjustesDelMapa } from './ajustesVisor'

/**
 * Al plegar un panel lateral el mapa tiene que ocupar el hueco (#279). En el
 * paquete el token de Mapbox llega tarde, de la base, y sin él el contenedor del
 * mapa no se pinta: si el observador se monta antes, no vigila nada.
 */

let token = ''
vi.mock('@/hooks/useMapboxToken', () => ({
  useMapboxToken: () => ({ token, loading: false }),
}))

vi.mock('mapbox-gl', () => ({ default: {} }))

const observados: Element[] = []

beforeEach(() => {
  observados.length = 0
  vi.stubGlobal('ResizeObserver', class {
    observe(el: Element) { observados.push(el) }
    disconnect() {}
  })
})

afterEach(() => { vi.unstubAllGlobals() })

const RED = {
  name: 'red',
  summary: { junctions: 0, tanks: 0, reservoirs: 0, pipes: 0, pumps: 0, valves: 0 },
  nodes: [],
  links: [],
  options: {},
}
const AJUSTES = soloAjustesDelMapa(AJUSTES_INICIALES)

describe('el mapa se reajusta al cambiar de tamaño su contenedor', () => {
  it('empieza a observarlo cuando llega el token', () => {
    token = ''
    const { rerender } = render(<WNTRMapViewer networkData={RED as never} mapSettings={AJUSTES} onMapSettingsChange={() => {}} />)
    expect(observados).toHaveLength(0)

    token = 'pk.prueba'
    rerender(<WNTRMapViewer networkData={{ ...RED } as never} mapSettings={AJUSTES} onMapSettingsChange={() => {}} />)

    expect(observados).toHaveLength(1)
    expect(observados[0].isConnected).toBe(true)
  })
})
