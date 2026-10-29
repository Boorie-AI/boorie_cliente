import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { AvisoVersionNueva } from './AvisoVersionNueva'

const NUEVA = { version: '1.52.0', url: 'https://github.com/Boorie-AI/boorie_cliente/releases/tag/v1.52.0' }

let avisar: ((nueva: typeof NUEVA) => void) | null
let original: Record<string, unknown>

function conApi(pendiente: typeof NUEVA | null) {
  const electronAPI = window.electronAPI as unknown as Record<string, unknown>
  original = { versionPendiente: electronAPI.versionPendiente, onVersionNueva: electronAPI.onVersionNueva }
  Object.assign(electronAPI, {
    versionPendiente: vi.fn(async () => pendiente),
    onVersionNueva: vi.fn((cb: (nueva: typeof NUEVA) => void) => {
      avisar = cb
      return () => { avisar = null }
    }),
  })
}

beforeEach(() => { avisar = null })
afterEach(() => { Object.assign(window.electronAPI as unknown as Record<string, unknown>, original) })

describe('aviso de versión nueva (#310)', () => {
  it('sin versión nueva no enseña nada', async () => {
    conApi(null)
    render(<AvisoVersionNueva />)
    await act(async () => {})
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('la que el main encontró antes de montarse también se enseña', async () => {
    conApi(NUEVA)
    render(<AvisoVersionNueva />)
    expect(await screen.findByRole('status')).toHaveTextContent('1.52.0')
  })

  it('la que llega después abre la release fuera, y cerrar lo oculta', async () => {
    conApi(null)
    const abrir = vi.spyOn(window, 'open').mockImplementation(() => null)
    render(<AvisoVersionNueva />)
    act(() => { avisar?.(NUEVA) })

    const aviso = screen.getByRole('status')
    const botones = aviso.querySelectorAll('button')
    fireEvent.click(botones[botones.length - 1])
    expect(abrir).toHaveBeenCalledWith(NUEVA.url, '_blank')

    fireEvent.click(botones[0])
    expect(screen.queryByRole('status')).toBeNull()
    abrir.mockRestore()
  })
})
