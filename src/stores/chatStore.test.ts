import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useChatStore } from './chatStore'
import { PAPEL, DISCIPLINA } from '@/../backend/services/hydraulic/promptDelAgente'

/**
 * Con Ollama y sin red cargada el chat no pasa por el handler IPC: llama a
 * Ollama desde el renderer para poder pintar la respuesta token a token. Esa
 * ruta se saltaba `addSystemPrompt`, así que el modelo local recibía la
 * pregunta sola —sin la disciplina y sin lo que el usuario escribe en Ajustes—
 * y respondía a su aire.
 */
const cuerpoDeUnaRespuesta = (texto: string) =>
  new ReadableStream({
    start(controller) {
      controller.enqueue(
        new TextEncoder().encode(
          JSON.stringify({ message: { content: texto }, done: false }) + '\n' +
          JSON.stringify({ message: { content: '' }, done: true, eval_count: 3 }) + '\n'
        )
      )
      controller.close()
    },
  })

const getSetting = vi.fn()
let peticion: any

describe('callOllamaAPI — el prompt de sistema', () => {
  beforeEach(() => {
    getSetting.mockReset().mockResolvedValue(null)
    peticion = null
    Object.defineProperty(window, 'electronAPI', {
      value: { database: { getSetting } },
      writable: true,
    })
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: any) => {
      peticion = JSON.parse(init.body)
      return { ok: true, body: cuerpoDeUnaRespuesta('vale') } as any
    }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('viaja también por la ruta de streaming', async () => {
    await useChatStore.getState().callOllamaAPI('nemotron-mini', '¿Qué es un golpe de ariete?', [])

    expect(peticion.messages[0].role).toBe('system')
    expect(peticion.messages[0].content).toContain(PAPEL)
    expect(peticion.messages[0].content).toContain(DISCIPLINA)
  })

  it('lleva lo que el usuario escribió en Ajustes', async () => {
    getSetting.mockResolvedValue('Responde siempre con el detalle de un informe técnico.')

    await useChatStore.getState().callOllamaAPI('nemotron-mini', 'hola', [])

    expect(getSetting).toHaveBeenCalledWith('system_prompt')
    expect(peticion.messages[0].content).toContain('informe técnico')
  })

  it('si no se puede leer el ajuste, va la disciplina sola', async () => {
    getSetting.mockRejectedValue(new Error('base caída'))

    await useChatStore.getState().callOllamaAPI('nemotron-mini', 'hola', [])

    expect(peticion.messages[0].content).toContain(DISCIPLINA)
  })

  it('dice con qué modelos se responde, en vez de dejar que el modelo lo suponga', async () => {
    await useChatStore.getState().callOllamaAPI('ollama-qwen2.5:7b', 'hola', [], 'granite-embedding:278m')

    expect(peticion.messages[0].content).toContain('qwen2.5:7b, a traves de Ollama')
    expect(peticion.messages[0].content).not.toContain('ollama-qwen2.5:7b')
    expect(peticion.messages[0].content).toContain('granite-embedding:278m')
  })

  it('el sistema va antes que la pregunta', async () => {
    await useChatStore.getState().callOllamaAPI('nemotron-mini', 'la pregunta', [])

    expect(peticion.messages.map((m: any) => m.role)).toEqual(['system', 'user'])
    expect(peticion.messages[1].content).toBe('la pregunta')
  })
})
