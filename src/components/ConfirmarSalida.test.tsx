import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { ConfirmarSalida } from './ConfirmarSalida'
import { useAppStore } from '@/stores/appStore'

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
    useAppStore.setState({ redAbierta: true })
    render(<ConfirmarSalida />)
    pedirCierre()
    const dialogo = await screen.findByRole('dialog')
    expect(dialogo).toHaveTextContent('¿Salir de Boorie?')
    expect(dialogo).toHaveTextContent('Se cerrará la red abierta y se detendrá cualquier simulación o respuesta en curso. Tus redes guardadas en el proyecto no se pierden.')
    expect(api.confirmarCierre).not.toHaveBeenCalled()
  })

  // Decía «se cerrará la red abierta» también desde el chat o la calculadora,
  // sin ninguna red abierta.
  it('sin red abierta no habla de cerrarla', async () => {
    useAppStore.setState({ redAbierta: false })
    render(<ConfirmarSalida />)
    pedirCierre()
    const dialogo = await screen.findByRole('dialog')
    expect(dialogo).toHaveTextContent('Se detendrá cualquier simulación o respuesta en curso. Tus redes guardadas en el proyecto no se pierden.')
    expect(dialogo).not.toHaveTextContent('red abierta')
  })

  it('R3: «Salir» confirma el cierre', async () => {
    render(<ConfirmarSalida />)
    pedirCierre()
    fireEvent.click(await screen.findByRole('button', { name: 'Salir' }))
    await vi.waitFor(() => expect(api.confirmarCierre).toHaveBeenCalledTimes(1))
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

describe('encuesta de uso obligatoria al salir (#13)', () => {
  let encuesta: { pendiente: ReturnType<typeof vi.fn>; abrirGithub: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    encuesta = {
      pendiente: vi.fn(async () => ({ decision: 'pedir', noPublicada: false })),
      abrirGithub: vi.fn(async () => ({ success: true, recortado: false })),
    }
    ;(window.electronAPI as unknown as Record<string, unknown>).encuesta = encuesta
  })

  afterEach(() => {
    delete (window.electronAPI as unknown as Record<string, unknown>).encuesta
  })

  async function salirHastaLaEncuesta() {
    render(<ConfirmarSalida />)
    pedirCierre()
    fireEvent.click(await screen.findByRole('button', { name: 'Salir' }))
    return screen.findByRole('dialog', { name: /encuesta de uso/i })
  }

  it('tras «Salir» enseña la encuesta obligatoria con el descargo y aún no cierra', async () => {
    const dialogo = await salirHastaLaEncuesta()
    expect(dialogo).toHaveTextContent('Boorie no usa tus respuestas')
    expect(dialogo).toHaveTextContent('conocer a las personas que descargan la aplicación')
    expect(dialogo).toHaveTextContent('Es obligatoria')
    expect(dialogo).not.toHaveTextContent('opcional')
    expect(screen.queryByRole('button', { name: /omitir/i })).not.toBeInTheDocument()
    expect(api.confirmarCierre).not.toHaveBeenCalled()
  })

  it('si se abrió GitHub pero no se publicó, la vuelve a pedir avisando', async () => {
    encuesta.pendiente.mockResolvedValueOnce({ decision: 'pedir', noPublicada: true })
    const dialogo = await salirHastaLaEncuesta()
    expect(dialogo).toHaveTextContent('no encontramos tu encuesta publicada')
  })

  it('sin conexión para comprobarlo, sale sin pedirla', async () => {
    encuesta.pendiente.mockResolvedValueOnce({ decision: 'aplazar' })
    render(<ConfirmarSalida />)
    pedirCierre()
    fireEvent.click(await screen.findByRole('button', { name: 'Salir' }))
    await vi.waitFor(() => expect(api.confirmarCierre).toHaveBeenCalledTimes(1))
  })

  it('si ya está publicada, «Salir» cierra sin encuesta', async () => {
    encuesta.pendiente.mockResolvedValueOnce({ decision: 'completada', issue: 402 })
    render(<ConfirmarSalida />)
    pedirCierre()
    fireEvent.click(await screen.findByRole('button', { name: 'Salir' }))
    await vi.waitFor(() => expect(api.confirmarCierre).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('«Salir sin enviar» cierra sin enviar nada', async () => {
    await salirHastaLaEncuesta()
    fireEvent.click(screen.getByRole('button', { name: 'Salir sin enviar' }))
    expect(api.confirmarCierre).toHaveBeenCalledTimes(1)
    expect(encuesta.abrirGithub).not.toHaveBeenCalled()
  })

  it('Escape no la descarta: hay que elegir', async () => {
    const dialogo = await salirHastaLaEncuesta()
    fireEvent.keyDown(dialogo, { key: 'Escape' })
    expect(screen.getByRole('dialog', { name: /encuesta de uso/i })).toBeInTheDocument()
    expect(api.confirmarCierre).not.toHaveBeenCalled()
  })

  it('no se puede enviar hasta responder las obligatorias', async () => {
    await salirHastaLaEncuesta()
    expect(screen.getByRole('button', { name: 'Enviar en GitHub y salir' })).toBeDisabled()
    expect(screen.getByText(/Faltan \d+ respuestas obligatorias/)).toBeInTheDocument()
  })

  it('volver a cerrar la ventana con la encuesta delante sale sin enviarla', async () => {
    await salirHastaLaEncuesta()
    pedirCierre()
    expect(api.confirmarCierre).toHaveBeenCalledTimes(1)
  })
})
