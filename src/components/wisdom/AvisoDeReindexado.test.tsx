/**
 * El aviso de reindexar (#162). Lo que se fija aquí, por orden de importancia:
 * que no reindexa por su cuenta, que aparece cuando hace falta y que desaparece
 * cuando no.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AvisoDeReindexado } from './AvisoDeReindexado'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    // Se devuelve la clave con sus valores para poder afirmar sobre ellos sin
    // atarse a la redacción, que se cambia sin que cambie el comportamiento.
    t: (clave: string, valores?: Record<string, unknown>) =>
      valores ? `${clave} ${JSON.stringify(valores)}` : clave,
  }),
}))

const massiveReindex = vi.fn()
const getRAGHealth = vi.fn()

const salud = (embeddings: Record<string, unknown>) => ({
  success: true,
  health: { metrics: { embeddings } },
})

beforeEach(() => {
  massiveReindex.mockReset()
  getRAGHealth.mockReset()
  ;(window as unknown as { electronAPI: unknown }).electronAPI = {
    wisdom: {
      getRAGHealth,
      massiveReindex,
      onReindexProgress: () => () => {},
    },
  }
})

describe('el aviso de reindexar', () => {
  it('no reindexa solo: son decenas de minutos y la base del usuario', async () => {
    getRAGHealth.mockResolvedValue(salud({ descuadrada: true, dimensionGuardada: 768, dimensionEsperada: 1024, modelo: 'bge-m3', total: 817 }))

    render(<AvisoDeReindexado />)

    await waitFor(() => expect(getRAGHealth).toHaveBeenCalled())
    expect(massiveReindex).not.toHaveBeenCalled()
  })

  it('avisa cuando los vectores no son del modelo en uso, y dice los dos tamaños', async () => {
    getRAGHealth.mockResolvedValue(salud({ descuadrada: true, dimensionGuardada: 768, dimensionEsperada: 1024, modelo: 'bge-m3', total: 817 }))

    render(<AvisoDeReindexado />)

    const porque = await screen.findByText(/wisdom\.reindexado\.porque/)
    expect(porque.textContent).toContain('768')
    expect(porque.textContent).toContain('1024')
    expect(porque.textContent).toContain('bge-m3')
    // Y cuántos fragmentos va a tocar, que es lo que hace estimable la espera.
    expect(screen.getByText(/wisdom\.reindexado\.como/).textContent).toContain('817')
  })

  it('no enseña nada cuando los vectores cuadran', async () => {
    getRAGHealth.mockResolvedValue(salud({ descuadrada: false, ambitoSinCodificar: false, dimensionGuardada: 1024, dimensionEsperada: 1024, modelo: 'bge-m3', total: 817 }))

    const { container } = render(<AvisoDeReindexado />)

    await waitFor(() => expect(getRAGHealth).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('también avisa cuando los vectores no llevan el ámbito, con la dimensión bien', async () => {
    // El caso de quien ya reindexó por el cambio de modelo (#155): la dimensión
    // cuadra y la búsqueda general sigue muda, porque el filtro de ámbito no
    // alcanza los fragmentos guardados sin dueño (#158).
    getRAGHealth.mockResolvedValue(salud({
      descuadrada: false, ambitoSinCodificar: true,
      dimensionGuardada: 1024, dimensionEsperada: 1024, modelo: 'bge-m3', total: 817,
    }))

    render(<AvisoDeReindexado />)

    expect(await screen.findByText(/wisdom\.reindexado\.porqueAmbito/)).toBeTruthy()
    // Y no el motivo del otro caso, que hablaría de tamaños que aquí cuadran.
    expect(screen.queryByText(/wisdom\.reindexado\.porque\s/)).toBeNull()
    expect(screen.getByText(/wisdom\.reindexado\.como/).textContent).toContain('817')
  })

  it('lo lanza sólo al pulsar, y luego vuelve a comprobar', async () => {
    getRAGHealth
      .mockResolvedValueOnce(salud({ descuadrada: true, dimensionGuardada: 768, dimensionEsperada: 1024, modelo: 'bge-m3', total: 817 }))
      .mockResolvedValue(salud({ descuadrada: false, dimensionGuardada: 1024, dimensionEsperada: 1024, modelo: 'bge-m3', total: 817 }))
    massiveReindex.mockResolvedValue({
      success: true,
      results: { successful: 301, totalProcessed: 301, indexedChunks: 817 },
    })
    const alTerminar = vi.fn()

    render(<AvisoDeReindexado alTerminar={alTerminar} />)

    await userEvent.click(await screen.findByRole('button'))

    await waitFor(() => expect(massiveReindex).toHaveBeenCalledWith({ reindexAll: true }))
    await waitFor(() => expect(alTerminar).toHaveBeenCalled())
    // Y el aviso deja paso al resultado, en vez de seguir pidiendo lo ya hecho.
    expect(await screen.findByText(/wisdom\.reindexado\.hecho/)).toBeTruthy()
  })

  it('un fallo se cuenta, no se traga', async () => {
    getRAGHealth.mockResolvedValue(salud({ descuadrada: true, dimensionGuardada: 768, dimensionEsperada: 1024, modelo: 'bge-m3', total: 817 }))
    massiveReindex.mockResolvedValue({ success: false, message: 'Ollama no responde' })

    render(<AvisoDeReindexado />)
    await userEvent.click(await screen.findByRole('button'))

    expect((await screen.findByText(/wisdom\.reindexado\.fallo/)).textContent).toContain('Ollama no responde')
  })
})
