import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WNTRAdvancedVisualizerPanel } from './WNTRAdvancedVisualizerPanel'
import { AJUSTES_INICIALES } from './ajustesVisor'

vi.mock('react-chartjs-2', () => ({ Line: () => null }))

const RED = {
  nodes: [
    { id: 'J1', type: 'junction' },
    { id: 'R1', type: 'reservoir' },
  ],
  links: [{ id: 'P1', type: 'pipe' }],
}

const panel = (onCambio = vi.fn()) => {
  render(
    <WNTRAdvancedVisualizerPanel networkData={RED as never} simulationResults={null}
      ajustes={AJUSTES_INICIALES} onCambio={onCambio} timeline={{} as never} escala={null} />
  )
  return onCambio
}

/**
 * Los interruptores del panel no tenían nombre: un lector de pantalla los leía
 * como «interruptor, activado» uno detrás de otro, y solo se podían pulsar en
 * sus 36×20 px, no en el texto de al lado.
 */
describe('los interruptores del panel de visualización', () => {
  it('cada capa nombra su interruptor, sin el número de elementos', () => {
    panel()

    expect(screen.getByRole('switch', { name: 'Nudos de consumo' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Tuberías' })).toBeInTheDocument()
  })

  it('pulsar el nombre de la capa la apaga', () => {
    const onCambio = panel()

    fireEvent.click(screen.getByText('Tuberías'))

    expect(onCambio).toHaveBeenCalledWith(expect.objectContaining({
      capas: expect.objectContaining({ pipe: false }),
    }))
  })

  it('las etiquetas de los nudos también tienen nombre', () => {
    panel()

    expect(screen.getByRole('switch', { name: 'Etiquetas de los nudos' })).toBeInTheDocument()
  })
})
