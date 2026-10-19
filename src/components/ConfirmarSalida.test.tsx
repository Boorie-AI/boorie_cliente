import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { ConfirmarSalida } from './ConfirmarSalida'

let solicitar: (() => void) | null
let api: { onSolicitudCierre: ReturnType<typeof vi.fn>; confirmarCierre: ReturnType<typeof vi.fn> }
let original: Partial<Window['electronAPI']>

beforeEach(() => {
  solicitar = null
  const electronAPI = window.electronAPI as unknown as Record<string, unknown>
  original = { onSolicitudCierre: electronAPI.onSolicitudCierre, confirmarCierre: electronAPI.confirmarCierre } as Partial<Window['electronAPI']>
  api = {
    onSolicitudCierre: vi.fn((cb: () => void) => {
      solicitar = cb
      return () => { solicitar = null }
    }),
    confirmarCierre: vi.fn(async () => undefined)
  }
  Object.assign(electronAPI, api)
})

afterEach(() => {
  Object.assign(window.electronAPI as unknown as Record<string, unknown>, original)
})

function pedirCierre() {
  act(() => { solicitar?.() })
}

describe('ConfirmarSalida (#278)', () => {
  it('no enseña nada hasta que el main pide cerrar', () => {
    render(<ConfirmarSalida />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(api.onSolicitudCierre).toHaveBeenCalledTimes(1)
  })

  it('R1: al intentar cerrar aparece el aviso con el texto acordado', async () => {
    render(<ConfirmarSalida />)
    pedirCierre()
    const dialogo = await screen.findByRole('dialog')
    expect(dialogo).toHaveTextContent('¿Salir de Boorie?')
    expect(dialogo).toHaveTextContent('Se cerrará la red abierta y se detendrá cualquier simulación o respuesta en curso. Tus redes guardadas en el proyecto no se pierden.')
    expect(api.confirmarCierre).not.toHaveBeenCalled()
  })

  it('R3: «Salir» confirma el cierre', async () => {
    render(<ConfirmarSalida />)
    pedirCierre()
    fireEvent.click(await screen.findByRole('button', { name: 'Salir' }))
    expect(api.confirmarCierre).toHaveBeenCalledTimes(1)
  })

  it('R4: «Cancelar» cierra el aviso sin salir', async () => {
    render(<ConfirmarSalida />)
    pedirCierre()
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(api.confirmarCierre).not.toHaveBeenCalled()
  })

  it('R4: Escape cierra el aviso sin salir', async () => {
    render(<ConfirmarSalida />)
    pedirCierre()
    fireEvent.keyDown(await screen.findByRole('dialog'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(api.confirmarCierre).not.toHaveBeenCalled()
  })

  it('tras cancelar, un nuevo intento vuelve a preguntar', async () => {
    render(<ConfirmarSalida />)
    pedirCierre()
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }))
    pedirCierre()
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('se da de baja del canal al desmontarse', () => {
    const { unmount } = render(<ConfirmarSalida />)
    unmount()
    expect(solicitar).toBeNull()
  })
})
