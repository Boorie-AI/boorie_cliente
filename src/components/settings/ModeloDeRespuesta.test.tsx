import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useAIConfigStore } from '@/stores/aiConfigStore'
import { ModeloDeRespuesta } from './ModeloDeRespuesta'

const proveedor = (o: object) => ({
  description: '', isActive: true, isConnected: true, testStatus: 'idle', testMessage: '', color: '', order: 0, availableModels: [], apiKey: '', ...o,
})

describe('elegir el modelo que redacta', () => {
  beforeEach(() => {
    const api = window.electronAPI as any
    api.agenticRAG = { modelos: vi.fn().mockResolvedValue({ success: true, data: { backend: 'ollama', principal: 'nemotron-mini', auxiliar: 'nemotron-mini', modeloRespuesta: 'nemotron-mini', degradado: false, selectorVisible: false } }) }
    api.database.getSetting = vi.fn().mockResolvedValue(null)
    api.database.setSetting = vi.fn().mockResolvedValue({})
    useAIConfigStore.setState({
      providers: [
        proveedor({ id: 'p-ollama', name: 'ollama', type: 'local' }),
        proveedor({ id: 'p-anthropic', name: 'Anthropic', type: 'api', apiKey: 'sk-x', availableModels: [{ modelId: 'claude-sonnet-5', modelName: 'Claude Sonnet 5', description: '', isSelected: true }] }),
        // Sin clave: no se puede elegir, porque el mensaje saldría sin autenticar.
        proveedor({ id: 'p-openai', name: 'OpenAI', type: 'api', availableModels: [{ modelId: 'gpt-x', modelName: 'GPT X', description: '', isSelected: true }] }),
      ] as any,
    })
  })

  it('ofrece los locales de chat y los externos con clave, no los de embeddings ni los sin clave', async () => {
    render(<ModeloDeRespuesta modelosOllama={['qwen2.5:7b', 'granite-embedding:278m', 'bge-m3:latest', 'nomic-embed-text:latest', 'llama3.2:latest']} />)
    await waitFor(() => expect(screen.getByRole('option', { name: /Automático.*nemotron-mini/ })).toBeInTheDocument())

    const opciones = screen.getAllByRole('option').map(o => o.textContent)
    expect(opciones).toEqual(['Automático (recomendado): nemotron-mini', 'qwen2.5:7b', 'llama3.2:latest', 'Claude Sonnet 5'])
  })

  it('con uno externo avisa de que los documentos salen del equipo, y lo guarda', async () => {
    render(<ModeloDeRespuesta modelosOllama={['qwen2.5:7b']} />)
    await waitFor(() => expect(screen.getByRole('option', { name: /Automático.*nemotron-mini/ })).toBeInTheDocument())

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'p-anthropic::claude-sonnet-5' } })

    expect(await screen.findByText(/salen de este equipo hacia Anthropic/)).toBeInTheDocument()
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
})
