import { describe, it, expect, vi, beforeEach } from 'vitest'

const automatico = { backend: 'ollama', principal: 'nemotron-mini', auxiliar: 'nemotron-mini', modeloRespuesta: 'nemotron-mini', degradado: false, selectorVisible: false }

async function cargar(ajuste: string | null, modelos: object = automatico) {
  vi.resetModules()
  const api = window.electronAPI as any
  api.agenticRAG = { modelos: vi.fn().mockResolvedValue({ success: true, data: modelos }) }
  api.database.getSetting = vi.fn().mockResolvedValue(ajuste)
  api.database.setSetting = vi.fn().mockResolvedValue({})
  const m = await import('./modelosRAG')
  await m.cargarModelosRAG()
  return m
}

describe('qué modelo redacta las respuestas del chat', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sin elección en Configuración, el automático de Boorie', async () => {
    const m = await cargar(null)
    expect(m.modeloFijadoRAG()).toEqual({ model: 'nemotron-mini', provider: 'Ollama' })
  })

  it('lo elegido en Configuración manda, sea local o de un proveedor externo', async () => {
    const m = await cargar(JSON.stringify({ proveedorId: 'p-anthropic', proveedor: 'Anthropic', modelo: 'claude-sonnet-5' }))
    expect(m.modeloFijadoRAG()).toEqual({ model: 'claude-sonnet-5', provider: 'Anthropic', providerId: 'p-anthropic' })
  })

  it('un ajuste ilegible o vacío vuelve al automático en vez de romper el chat', async () => {
    for (const malo of ['{no es json', '', JSON.stringify({ proveedor: 'Ollama' })]) {
      const m = await cargar(malo)
      expect(m.modeloFijadoRAG(), malo).toEqual({ model: 'nemotron-mini', provider: 'Ollama' })
    }
  })

  it('con el desplegable de diagnóstico a la vista, manda lo de cada conversación', async () => {
    const m = await cargar(JSON.stringify({ proveedorId: 'x', proveedor: 'Ollama', modelo: 'qwen2.5:7b' }), { ...automatico, selectorVisible: true })
    expect(m.modeloFijadoRAG()).toBeNull()
  })

  it('guardar la elección vale desde la siguiente pregunta, y null vuelve al automático', async () => {
    const m = await cargar(null)
    await m.guardarModeloElegido({ proveedorId: 'o', proveedor: 'Ollama', modelo: 'qwen2.5:7b' })
    expect((window.electronAPI as any).database.setSetting).toHaveBeenCalledWith(
      m.CLAVE_MODELO_RESPUESTA, JSON.stringify({ proveedorId: 'o', proveedor: 'Ollama', modelo: 'qwen2.5:7b' }), 'ai'
    )
    expect(m.modeloFijadoRAG()?.model).toBe('qwen2.5:7b')

    await m.guardarModeloElegido(null)
    expect((window.electronAPI as any).database.setSetting).toHaveBeenLastCalledWith(m.CLAVE_MODELO_RESPUESTA, '', 'ai')
    expect(m.modeloFijadoRAG()?.model).toBe('nemotron-mini')
  })
})
