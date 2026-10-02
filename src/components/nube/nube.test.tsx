import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DialogoConsentimientoNube } from './DialogoConsentimientoNube'
import { MarcaDeNube } from './MarcaDeNube'
import { consentirAlEnviar, pedirConsentimiento } from '@/services/consentimientoNube'
import { cargarModelosRAG, modeloElegido, modeloFijadoRAG, refrescarModelosRAG } from '@/config/modelosRAG'
import { MessageBubble } from '@/components/chat/MessageBubble'

let consentimientos: Record<string, { version: number; fecha: string }>

beforeEach(() => {
  consentimientos = {}
  const api = window.electronAPI as any
  api.nube = {
    estado: vi.fn(async () => ({ version: 1, consentimientos })),
    aceptar: vi.fn(async () => ({ success: true })),
    retirar: vi.fn(async () => ({ success: true })),
  }
  refrescarModelosRAG()
})

describe('el diálogo de consentimiento (#225, R5)', () => {
  it('cerrarlo con Escape es no aceptar, y no se guarda nada', async () => {
    render(<DialogoConsentimientoNube />)
    const respuesta = pedirConsentimiento('nvidia')
    await screen.findByRole('dialog')
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(await respuesta).toBe(false)
    expect((window.electronAPI as any).nube.aceptar).not.toHaveBeenCalled()
  })

  it('con el consentimiento ya guardado no pregunta', async () => {
    consentimientos.nvidia = { version: 1, fecha: '2026-10-02T00:00:00.000Z' }
    render(<DialogoConsentimientoNube />)
    expect(await pedirConsentimiento('NVIDIA')).toBe(true)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('si el texto cambió de versión, vuelve a preguntar', async () => {
    consentimientos.nvidia = { version: 1, fecha: '2026-10-02T00:00:00.000Z' }
    ;(window.electronAPI as any).nube.estado = vi.fn(async () => ({ version: 2, consentimientos }))
    render(<DialogoConsentimientoNube />)
    const respuesta = pedirConsentimiento('nvidia')
    expect(await screen.findByRole('dialog')).toHaveTextContent('versión 2')
    fireEvent.click(screen.getByRole('button', { name: 'Acepto enviar estos datos a nvidia' }))
    expect(await respuesta).toBe(true)
    expect((window.electronAPI as any).nube.aceptar).toHaveBeenCalledWith('nvidia')
  })

  it('lo local no pregunta nunca', async () => {
    expect(await pedirConsentimiento('Ollama')).toBe(true)
    expect((window.electronAPI as any).nube.estado).not.toHaveBeenCalled()
  })
})

describe('al enviar con un modelo de la nube elegido de antes', () => {
  const elegidoNvidia = JSON.stringify({ proveedorId: 'nvidia', proveedor: 'nvidia', modelo: 'm' })
  let setSetting: ReturnType<typeof vi.fn>

  const preparar = (selectorVisible = false) => {
    const api = window.electronAPI as any
    api.agenticRAG = { modelos: vi.fn().mockResolvedValue({ success: true, data: { backend: 'ollama', principal: 'x', auxiliar: 'x', modeloRespuesta: 'qwen', degradado: false, selectorVisible } }) }
    api.database.getSetting = vi.fn().mockResolvedValue(elegidoNvidia)
    setSetting = vi.fn().mockResolvedValue({ success: true })
    api.database.setSetting = setSetting
  }
  const queResponde = (deLaConversacion = 'Ollama') => async () => {
    await cargarModelosRAG()
    return modeloFijadoRAG()?.provider ?? deLaConversacion
  }
  const contestar = async (boton: string) => {
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: boton }))
  }

  it('pregunta al enviar y, si acepta, responde la nube', async () => {
    preparar()
    render(<DialogoConsentimientoNube />)
    const puede = consentirAlEnviar(queResponde())
    await contestar('Acepto enviar estos datos a nvidia')
    expect(await puede).toBe(true)
    expect((window.electronAPI as any).nube.aceptar).toHaveBeenCalledWith('nvidia')
    expect(modeloElegido()?.proveedor).toBe('nvidia')
  })

  it('si no acepta, vuelve al automático y responde el local', async () => {
    preparar()
    render(<DialogoConsentimientoNube />)
    const puede = consentirAlEnviar(queResponde())
    await contestar('No, seguir en local')
    expect(await puede).toBe(true)
    expect(setSetting).toHaveBeenCalledWith(expect.any(String), '', 'ai')
    expect(modeloElegido()).toBeNull()
    expect(modeloFijadoRAG()?.provider).toBe('Ollama')
    expect((window.electronAPI as any).nube.aceptar).not.toHaveBeenCalled()
  })

  it('con el selector de diagnóstico y la conversación en la nube, no se envía', async () => {
    preparar(true)
    render(<DialogoConsentimientoNube />)
    const puede = consentirAlEnviar(queResponde('nvidia'))
    await contestar('No, seguir en local')
    expect(await puede).toBe(false)
  })
})

describe('se ve en la conversación (R8)', () => {
  const modelos = (backend: 'ollama' | 'nvidia') => {
    const api = window.electronAPI as any
    api.agenticRAG = { modelos: vi.fn().mockResolvedValue({ success: true, data: { backend, principal: 'x', auxiliar: 'x', modeloRespuesta: 'x', degradado: false, selectorVisible: false } }) }
  }

  it('con un modelo externo, la marca del proveedor', async () => {
    modelos('ollama')
    ;(window.electronAPI as any).database.getSetting = vi.fn().mockResolvedValue(JSON.stringify({ proveedorId: 'nvidia', proveedor: 'nvidia', modelo: 'm' }))
    render(<MarcaDeNube proveedorDeLaConversacion="Ollama" />)
    expect(await screen.findByTestId('marca-nube')).toHaveTextContent('Nube: nvidia')
  })

  it('con el local, nada', async () => {
    modelos('ollama')
    ;(window.electronAPI as any).database.getSetting = vi.fn().mockResolvedValue(null)
    render(<MarcaDeNube proveedorDeLaConversacion="Ollama" />)
    await waitFor(() => expect((window.electronAPI as any).agenticRAG.modelos).toHaveBeenCalled())
    expect(screen.queryByTestId('marca-nube')).not.toBeInTheDocument()
  })

  it('cada respuesta dice si se envió fuera', () => {
    const mensaje = (provider: string) => ({ id: provider, role: 'assistant' as const, content: 'ok', timestamp: new Date(), metadata: { provider } })
    const { rerender } = render(<MessageBubble message={mensaje('nvidia')} />)
    expect(screen.getByText('enviado a nvidia')).toBeInTheDocument()
    rerender(<MessageBubble message={mensaje('Ollama')} />)
    expect(screen.queryByText(/enviado a/)).not.toBeInTheDocument()
  })
})
