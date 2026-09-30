import { describe, it, expect, vi, afterEach } from 'vitest'
import { contextoParaModelo, contextoDeOllama } from './contextoDeOllama'

afterEach(() => vi.unstubAllGlobals())

describe('el contexto que se le pide a Ollama', () => {
  it('lo que admite el modelo, hasta 8192', () => {
    expect(contextoParaModelo(32768)).toBe(8192)
    expect(contextoParaModelo(4096)).toBe(4096)
  })

  it('sin saberlo, los 4096 que Ollama usaría de todas formas', () => {
    expect(contextoParaModelo(undefined)).toBe(4096)
  })

  it('lo lee de /api/show, una vez por modelo', async () => {
    const pedir = vi.fn(async () => ({ ok: true, json: async () => ({ model_info: { 'qwen2.context_length': 32768 } }) }))
    vi.stubGlobal('fetch', pedir)
    expect(await contextoDeOllama('http://ollama-a', 'qwen2.5:7b')).toBe(8192)
    expect(await contextoDeOllama('http://ollama-a', 'qwen2.5:7b')).toBe(8192)
    expect(pedir).toHaveBeenCalledTimes(1)
  })

  it('si Ollama no contesta, 4096, y se vuelve a preguntar la próxima vez', async () => {
    const pedir = vi.fn(async () => { throw new Error('ECONNREFUSED') })
    vi.stubGlobal('fetch', pedir)
    expect(await contextoDeOllama('http://ollama-b', 'qwen2.5:7b')).toBe(4096)
    expect(await contextoDeOllama('http://ollama-b', 'qwen2.5:7b')).toBe(4096)
    expect(pedir).toHaveBeenCalledTimes(2)
  })
})
