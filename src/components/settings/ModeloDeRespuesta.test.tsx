import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useAIConfigStore } from '@/stores/aiConfigStore'
import { ModeloDeRespuesta } from './ModeloDeRespuesta'
import { DialogoConsentimientoNube } from '@/components/nube/DialogoConsentimientoNube'
import { refrescarModelosRAG } from '@/config/modelosRAG'

const proveedor = (o: object) => ({
  description: '', isActive: true, isConnected: true, testStatus: 'idle', testMessage: '', color: '', order: 0, availableModels: [], tieneClave: false, estadoClave: null, finClave: null, ...o,
})

let consentimientos: Record<string, { version: number; fecha: string }> = {}

const conDialogo = (ui: JSX.Element) => render(<>{ui}<DialogoConsentimientoNube /></>)

describe('elegir el modelo que redacta', () => {
  beforeEach(() => {
    const api = window.electronAPI as any
    api.agenticRAG = { modelos: vi.fn().mockResolvedValue({ success: true, data: { backend: 'ollama', principal: 'nemotron-mini', auxiliar: 'nemotron-mini', modeloRespuesta: 'nemotron-mini', degradado: false, selectorVisible: false } }) }
    api.database.getSetting = vi.fn().mockResolvedValue(null)
    api.database.setSetting = vi.fn().mockResolvedValue({})
    consentimientos = {}
    api.nube = {
      estado: vi.fn(async () => ({ version: 1, consentimientos })),
      aceptar: vi.fn(async (p: string) => { consentimientos[p.toLowerCase()] = { version: 1, fecha: '2026-10-02T10:00:00.000Z' }; return { success: true } }),
      retirar: vi.fn(async (p: string) => { delete consentimientos[p.toLowerCase()]; return { success: true } }),
    }
    refrescarModelosRAG()
    useAIConfigStore.setState({
      providers: [
        proveedor({ id: 'p-ollama', name: 'ollama', type: 'local' }),
        proveedor({ id: 'p-anthropic', name: 'Anthropic', type: 'api', tieneClave: true, estadoClave: 'ok', finClave: 'abcd', availableModels: [{ modelId: 'claude-sonnet-5', modelName: 'Claude Sonnet 5', description: '', isSelected: true }] }),
        // Sin clave: no se puede elegir, porque el mensaje saldría sin autenticar.
        proveedor({ id: 'p-openai', name: 'OpenAI', type: 'api', availableModels: [{ modelId: 'gpt-x', modelName: 'GPT X', description: '', isSelected: true }] }),
        // Con una clave de otro equipo tampoco: no se puede usar (#225).
        proveedor({ id: 'p-nvidia', name: 'nvidia', type: 'api', tieneClave: false, estadoClave: 'ilegible', availableModels: [{ modelId: 'nv-x', modelName: 'NV X', description: '', isSelected: true }] }),
      ] as any,
    })
  })

  it('ofrece los locales de chat y los externos con clave, no los de embeddings ni los sin clave', async () => {
    render(<ModeloDeRespuesta modelosOllama={['qwen2.5:7b', 'granite-embedding:278m', 'bge-m3:latest', 'nomic-embed-text:latest', 'llama3.2:latest']} />)
    await waitFor(() => expect(screen.getByRole('option', { name: /Automático.*nemotron-mini/ })).toBeInTheDocument())

    const opciones = screen.getAllByRole('option').map(o => o.textContent)
    // El nombre de un externo puede ser genérico («Nemotron (principal)»): va con su id.
    expect(opciones).toEqual(['Automático (recomendado): nemotron-mini', 'qwen2.5:7b', 'llama3.2:latest', 'Claude Sonnet 5 — claude-sonnet-5'])
  })

  it('con uno externo pide el consentimiento, avisa de que los documentos salen del equipo, y lo guarda', async () => {
    conDialogo(<ModeloDeRespuesta modelosOllama={['qwen2.5:7b']} />)
    await waitFor(() => expect(screen.getByRole('option', { name: /Automático.*nemotron-mini/ })).toBeInTheDocument())

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'p-anthropic::claude-sonnet-5' } })

    const dialogo = await screen.findByRole('dialog')
    expect(dialogo).toHaveTextContent('¿Enviar tus datos a Anthropic?')
    expect(dialogo).toHaveTextContent('el documento que adjuntes')
    expect(dialogo).toHaveTextContent('los fragmentos de tu base de conocimiento')
    expect(dialogo).toHaveTextContent('el contexto de la red y del proyecto')
    expect(dialogo).toHaveTextContent('Puedes retirar este consentimiento')
    expect(dialogo).toHaveTextContent('versión 1')
    fireEvent.click(screen.getByRole('button', { name: 'Acepto enviar estos datos a Anthropic' }))

    expect(await screen.findByText(/salen de este equipo hacia Anthropic/)).toBeInTheDocument()
    expect((window.electronAPI as any).nube.aceptar).toHaveBeenCalledWith('Anthropic')
    expect((window.electronAPI as any).database.setSetting).toHaveBeenCalledWith(
      'chat.modeloRespuesta', JSON.stringify({ proveedorId: 'p-anthropic', proveedor: 'Anthropic', modelo: 'claude-sonnet-5' }), 'ai'
    )
  })

  it('uno local se guarda como Ollama y no avisa de nada que salga', async () => {
    render(<ModeloDeRespuesta modelosOllama={['qwen2.5:7b']} />)
    await waitFor(() => expect(screen.getByRole('option', { name: 'qwen2.5:7b' })).toBeInTheDocument())

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'p-ollama::qwen2.5:7b' } })

    await waitFor(() => expect((window.electronAPI as any).database.setSetting).toHaveBeenCalledWith(
      'chat.modeloRespuesta', JSON.stringify({ proveedorId: 'p-ollama', proveedor: 'Ollama', modelo: 'qwen2.5:7b' }), 'ai'
    ))
    expect(screen.queryByText(/salen de este equipo/)).not.toBeInTheDocument()
  })

  it('si no se acepta, no se guarda nada y sigue el modelo local (#225, R6)', async () => {
    conDialogo(<ModeloDeRespuesta modelosOllama={['qwen2.5:7b']} />)
    await waitFor(() => expect(screen.getByRole('option', { name: /Automático.*nemotron-mini/ })).toBeInTheDocument())

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'p-anthropic::claude-sonnet-5' } })
    fireEvent.click(await screen.findByRole('button', { name: 'No, seguir en local' }))

    expect(await screen.findByText(/sin tu consentimiento no se envía nada a Anthropic/)).toBeInTheDocument()
    expect((window.electronAPI as any).nube.aceptar).not.toHaveBeenCalled()
    expect((window.electronAPI as any).database.setSetting).not.toHaveBeenCalled()
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('auto')
  })

  it('con el consentimiento ya dado no vuelve a preguntar, y se puede retirar (R7)', async () => {
    consentimientos.anthropic = { version: 1, fecha: '2026-10-01T09:00:00.000Z' }
    ;(window.electronAPI as any).database.getSetting = vi.fn().mockResolvedValue(
      JSON.stringify({ proveedorId: 'p-anthropic', proveedor: 'Anthropic', modelo: 'claude-sonnet-5' }))
    conDialogo(<ModeloDeRespuesta modelosOllama={['qwen2.5:7b']} />)

    const retirar = await screen.findByRole('button', { name: 'Retirar' })
    expect(screen.getByText(/anthropic · autorizado el/)).toBeInTheDocument()
    fireEvent.click(retirar)

    await waitFor(() => expect((window.electronAPI as any).nube.retirar).toHaveBeenCalledWith('anthropic'))
    // Vuelve al automático: desde la siguiente pregunta responde el local.
    await waitFor(() => expect((window.electronAPI as any).database.setSetting).toHaveBeenCalledWith('chat.modeloRespuesta', '', 'ai'))
    expect(await screen.findByText(/No has autorizado a ningún proveedor externo/)).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
