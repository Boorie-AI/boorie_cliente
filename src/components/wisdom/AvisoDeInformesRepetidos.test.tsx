/**
 * El aviso de informes repetidos (#167). Lo que se fija, por orden: que no poda
 * por su cuenta, que aparece sólo cuando sobra algo, y que dice cuántos son
 * antes de ofrecer el botón.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AvisoDeInformesRepetidos } from './AvisoDeInformesRepetidos'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (clave: string, valores?: Record<string, unknown>) =>
      valores ? `${clave} ${JSON.stringify(valores)}` : clave,
  }),
}))

const informesRepetidos = vi.fn()
const podarInformes = vi.fn()

beforeEach(() => {
  informesRepetidos.mockReset()
  podarInformes.mockReset()
  ;(window as unknown as { electronAPI: unknown }).electronAPI = {
    simulacionRAG: { informesRepetidos, podarInformes },
  }
})

describe('el aviso de informes repetidos', () => {
  it('no poda solo: es un borrado en la base del usuario', async () => {
    informesRepetidos.mockResolvedValue({ success: true, data: { documentos: 295, versiones: 4 } })

    render(<AvisoDeInformesRepetidos />)

    await waitFor(() => expect(informesRepetidos).toHaveBeenCalled())
    expect(podarInformes).not.toHaveBeenCalled()
  })

  it('dice cuántos sobran y de cuántas redes antes de ofrecer el botón', async () => {
    informesRepetidos.mockResolvedValue({ success: true, data: { documentos: 295, versiones: 4 } })

    render(<AvisoDeInformesRepetidos />)

    const porque = await screen.findByText(/wisdom\.informesRepetidos\.porque/)
    expect(porque.textContent).toContain('295')
    expect(porque.textContent).toContain('4')
  })

  it('no enseña nada cuando no sobra ninguno', async () => {
    informesRepetidos.mockResolvedValue({ success: true, data: { documentos: 0, versiones: 0 } })

    const { container } = render(<AvisoDeInformesRepetidos />)

    await waitFor(() => expect(informesRepetidos).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('poda al pulsar, y luego vuelve a comprobar', async () => {
    informesRepetidos
      .mockResolvedValueOnce({ success: true, data: { documentos: 295, versiones: 4 } })
      .mockResolvedValue({ success: true, data: { documentos: 0, versiones: 0 } })
    podarInformes.mockResolvedValue({ success: true, data: { podados: 295 } })
    const alTerminar = vi.fn()

    render(<AvisoDeInformesRepetidos alTerminar={alTerminar} />)
    await userEvent.click(await screen.findByRole('button'))

    await waitFor(() => expect(podarInformes).toHaveBeenCalled())
    await waitFor(() => expect(alTerminar).toHaveBeenCalled())
    expect((await screen.findByText(/wisdom\.informesRepetidos\.hecho/)).textContent).toContain('295')
  })

  it('un fallo se cuenta, no se traga', async () => {
    informesRepetidos.mockResolvedValue({ success: true, data: { documentos: 295, versiones: 4 } })
    podarInformes.mockResolvedValue({ success: false, error: 'Milvus no responde' })

    render(<AvisoDeInformesRepetidos />)
    await userEvent.click(await screen.findByRole('button'))

    expect((await screen.findByText(/wisdom\.informesRepetidos\.fallo/)).textContent)
      .toContain('Milvus no responde')
  })

  it('sin la API no revienta, simplemente no enseña nada', async () => {
    const w = window as unknown as { electronAPI: unknown }
    w.electronAPI = { simulacionRAG: {} }

    const { container } = render(<AvisoDeInformesRepetidos />)

    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })
})
