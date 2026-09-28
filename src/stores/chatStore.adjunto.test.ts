/**
 * El adjunto antes que el RAG (#201), por el camino entero de `sendMessage`:
 * lo que llega a Ollama, y lo que queda anotado en la respuesta.
 *
 * Con nemotron-mini, tres fuentes RAG largas dejaban sitio para 1 de los 41
 * fragmentos de un escaneado. Ahora el documento reserva primero y las fuentes
 * ocupan lo que quede, quitando desde la menos relevante.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { estimarTokens } from '@/services/chat/adjunto'

vi.mock('@/config/modelosRAG', () => ({
  cargarModelosRAG: async () => null,
  modeloFijadoRAG: () => ({ model: 'nemotron-mini', provider: 'Ollama' }),
  modeloElegido: () => null,
  modelosRAGEnCache: () => null,
}))

import { useChatStore } from './chatStore'

/** Una fuente de unos 530 tokens: las tres caben juntas con un adjunto pequeño, no con uno grande. */
const fuente = (n: number) => ({
  title: `Manual ${n}`,
  relevance: 0.3 - n * 0.01,
  content: `Capítulo ${n}. ` + 'La pérdida de carga en tuberías de fundición depende de la rugosidad y del caudal. '.repeat(25),
})
const FUENTES = [fuente(1), fuente(2), fuente(3)]

/** Una memoria de cálculo de 120 tramos: no cabe entera en 4096 tokens. */
const MEMORIA = Array.from({ length: 120 }, (_, s) =>
  [`${s + 1}. Tramo T-${String(s + 1).padStart(3, '0')}`,
   ...Array.from({ length: 15 }, (_, p) => `  Tubería P-${String(s + 1).padStart(3, '0')}-${String(p + 1).padStart(2, '0')}  DN 110 mm  Q=${p}.5 l/s`)].join('\n'),
).join('\n\n')

let peticion: any
let guardados: any[]

const respuesta = () => new ReadableStream({
  start(c) {
    c.enqueue(new TextEncoder().encode(
      JSON.stringify({ message: { content: 'La tubería es DN 110.' }, done: false }) + '\n' +
      JSON.stringify({ message: { content: '' }, done: true, eval_count: 5 }) + '\n'))
    c.close()
  },
})

beforeEach(() => {
  peticion = null
  guardados = []
  Object.defineProperty(window, 'electronAPI', {
    writable: true,
    value: {
      database: {
        getSetting: async () => null,
        addMessageToConversation: async (_id: string, m: any) => { guardados.push(m); return { success: true } },
      },
      agenticRAG: { query: async () => ({ success: true, data: { sources: FUENTES } }) },
      networkRepository: { context: async () => ({ success: false }) },
    },
  })
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: any) => {
    peticion = JSON.parse(init.body)
    return { ok: true, body: respuesta() } as any
  }))
  useChatStore.setState({
    conversations: [{ id: 'c1', title: 'Nueva', messages: [], model: 'nemotron-mini', provider: 'Ollama', createdAt: new Date(), updatedAt: new Date() }],
    activeConversationId: 'c1',
    isLoading: false,
    wisdomConfig: { enabled: true, categories: [], searchTopK: 3 } as any,
  })
})

afterEach(() => vi.unstubAllGlobals())

const promptDelUsuario = () => peticion.messages.filter((m: any) => m.role === 'user').pop().content as string
const metadataDeLaRespuesta = () => guardados.filter(m => m.role === 'assistant').pop().metadata

describe('el adjunto antes que el RAG (#201)', () => {
  it('un documento grande se queda el sitio y las fuentes que no caben se anotan', async () => {
    await useChatStore.getState().sendMessage('¿Qué diámetro tiene la tubería P-120-15?', { nombre: 'memoria.pdf', texto: MEMORIA })

    const uso = metadataDeLaRespuesta().adjuntoUsado
    expect(uso.fuentesOmitidas).toBeGreaterThan(0)
    // El documento se lleva la mayor parte: con las fuentes delante apenas le quedaba un fragmento.
    expect(uso.incluidos).toBeGreaterThan(5)
    expect(promptDelUsuario()).toContain('P-120-15')
    // Lo que se anota como fuentes es lo que de verdad llegó al modelo.
    expect(metadataDeLaRespuesta().sources).toHaveLength(FUENTES.length - uso.fuentesOmitidas)
  })

  it('lo que llega a Ollama cabe en su contexto', async () => {
    await useChatStore.getState().sendMessage('¿Qué diámetro tiene la tubería P-120-15?', { nombre: 'memoria.pdf', texto: MEMORIA })

    const tokens = peticion.messages.reduce((n: number, m: any) => n + estimarTokens(m.content), 0)
    expect(tokens).toBeLessThan(4096)
  })

  it('si no queda sitio para ninguna fuente, no se le dice al modelo que no se encontró nada', async () => {
    await useChatStore.getState().sendMessage('¿Qué diámetro tiene la tubería P-120-15?', { nombre: 'memoria.pdf', texto: MEMORIA })

    // Con esta memoria el documento ocupa todo lo que hay: las tres fuentes se quedan fuera.
    expect(metadataDeLaRespuesta().adjuntoUsado.fuentesOmitidas).toBe(FUENTES.length)
    expect(promptDelUsuario()).not.toContain('=== CONOCIMIENTO CONSULTADO ===')
    expect(promptDelUsuario()).not.toMatch(/No se encontró nada relevante/)
  })

  it('un documento pequeño deja entrar todas las fuentes', async () => {
    await useChatStore.getState().sendMessage('¿Resultado?', { nombre: 'acta.pdf', texto: 'Acta de prueba de presión. Resultado: APTO.' })

    expect(metadataDeLaRespuesta().adjuntoUsado.fuentesOmitidas).toBeUndefined()
    expect(metadataDeLaRespuesta().sources).toHaveLength(FUENTES.length)
    expect(promptDelUsuario()).toContain('Capítulo 3.')
  })

  it('sin adjunto, las fuentes no se tocan', async () => {
    await useChatStore.getState().sendMessage('¿Cómo se calcula la pérdida de carga?')

    expect(metadataDeLaRespuesta().sources).toHaveLength(FUENTES.length)
    expect(metadataDeLaRespuesta().adjuntoUsado).toBeUndefined()
  })
})
