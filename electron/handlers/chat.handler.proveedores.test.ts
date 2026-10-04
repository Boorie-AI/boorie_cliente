import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Anthropic, OpenAI, OpenRouter y Google se comportan como NVIDIA (#246):
 * responden en streaming, una respuesta larga sigue entera y un servidor que
 * se calla deja lo recibido. Contra un fetch simulado que habla el SSE de cada
 * uno, sin red.
 */

const handlers: Record<string, (evento: unknown, params: any) => Promise<any>> = {}

vi.mock('electron', () => ({
  ipcMain: {
    handle: (canal: string, fn: any) => { handlers[canal] = fn },
    removeAllListeners: () => {},
  },
}))
vi.mock('../../backend/services/security/consentimientoNube', async importOriginal => ({
  ...(await importOriginal<typeof import('../../backend/services/security/consentimientoNube')>()),
  hayConsentimiento: () => true,
}))
vi.mock('../../backend/services/contextoDeOllama', () => ({ contextoDeOllama: async () => 8192 }))

import { ChatHandler, FIN_POR_INACTIVIDAD } from './chat.handler'

const codificar = (e: unknown) => new TextEncoder().encode(`data: ${JSON.stringify(e)}\n\n`)

/** Una respuesta SSE que manda los eventos y, con `callarse`, se queda muda hasta que la aborten. */
function sse(eventos: unknown[], callarse = false) {
  return async (_url: string, init: any) => {
    const cola = eventos.map(codificar)
    return {
      ok: true,
      status: 200,
      json: async () => ({}),
      body: {
        getReader: () => ({
          read: () => cola.length
            ? Promise.resolve({ done: false, value: cola.shift() })
            : callarse
              ? new Promise((_, rechazar) => init.signal.addEventListener('abort', () => rechazar(new Error('aborted'))))
              : Promise.resolve({ done: true, value: undefined }),
        }),
      },
    }
  }
}

const error = (status: number, cuerpo: unknown) => async () => ({ ok: false, status, json: async () => cuerpo })

/** Lo que manda cada proveedor para un texto y un motivo de fin. */
const dialecto: Record<string, (texto: string, fin: 'fin' | 'longitud' | null) => unknown[]> = {
  anthropic: (texto, fin) => [
    { type: 'message_start', message: { model: 'claude-x', usage: { input_tokens: 10, output_tokens: 1 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    ...[texto.slice(0, 5), texto.slice(5)].filter(Boolean).map(t => ({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } })),
    ...(fin ? [
      { type: 'message_delta', delta: { stop_reason: fin === 'fin' ? 'end_turn' : 'max_tokens' }, usage: { output_tokens: 20 } },
      { type: 'message_stop' },
    ] : []),
  ],
  google: (texto, fin) => [
    ...[texto.slice(0, 5), texto.slice(5)].filter(Boolean).map(t => ({ candidates: [{ content: { role: 'model', parts: [{ text: t }] } }] })),
    ...(fin ? [{
      candidates: [{ content: { role: 'model', parts: [{ text: '' }] }, finishReason: fin === 'fin' ? 'STOP' : 'MAX_TOKENS' }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30 },
    }] : []),
  ],
  openai: (texto, fin) => [
    ...[texto.slice(0, 5), texto.slice(5)].filter(Boolean).map(t => ({ choices: [{ delta: { content: t } }] })),
    ...(fin ? [{ choices: [{ delta: {}, finish_reason: fin === 'fin' ? 'stop' : 'length' }] }, { choices: [], usage: { total_tokens: 30 } }] : []),
  ],
}
dialecto.openrouter = dialecto.openai

const URLS: Record<string, RegExp> = {
  anthropic: /^https:\/\/api\.anthropic\.com\/v1\/messages$/,
  openai: /^https:\/\/api\.openai\.com\/v1\/chat\/completions$/,
  openrouter: /^https:\/\/openrouter\.ai\/api\/v1\/chat\/completions$/,
  google: /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/un-modelo:streamGenerateContent\?alt=sse$/,
}

let fetchSimulado: ReturnType<typeof vi.fn>
const cuerpoDe = (i: number) => JSON.parse(fetchSimulado.mock.calls[i][1].body)

const enviar = (provider: string) => handlers['chat:send-message'](null, {
  provider,
  model: 'un-modelo',
  messages: [{ role: 'user', content: '¿Cómo se calcula el golpe de ariete?' }],
})

beforeEach(() => {
  fetchSimulado = vi.fn()
  vi.stubGlobal('fetch', fetchSimulado)
  new ChatHandler({
    claveDeProveedor: async () => 'clave-FAKE-0123456789',
    prisma: {
      appSetting: { findUnique: async () => null },
      aIProvider: { findMany: async () => [] },
      hydraulicNetwork: { findFirst: async () => null },
    },
  } as never)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe.each(['anthropic', 'openai', 'openrouter', 'google'])('%s como NVIDIA', proveedor => {
  it('responde en streaming contra su API', async () => {
    fetchSimulado.mockImplementationOnce(sse(dialecto[proveedor]('La fórmula de Joukowsky.', 'fin')))

    const r = await enviar(proveedor)

    expect(r.success).toBe(true)
    expect(r.data.response).toBe('La fórmula de Joukowsky.')
    expect(fetchSimulado.mock.calls[0][0]).toMatch(URLS[proveedor])
    if (proveedor !== 'google') expect(cuerpoDe(0).stream).toBe(true)
  })

  it('si corta por longitud, le pide que siga y une los trozos', async () => {
    fetchSimulado
      .mockImplementationOnce(sse(dialecto[proveedor]('Primera parte del informe', 'longitud')))
      .mockImplementationOnce(sse(dialecto[proveedor](' y el final.', 'fin')))

    const r = await enviar(proveedor)

    expect(r.data.response).toBe('Primera parte del informe y el final.')
    expect(r.data.metadata.continuaciones).toBe(1)
    expect(fetchSimulado).toHaveBeenCalledTimes(2)
    expect(JSON.stringify(cuerpoDe(1))).toContain('Te has quedado a medias')
  })

  it('no pide más de dos continuaciones', async () => {
    for (let i = 0; i < 4; i++) fetchSimulado.mockImplementationOnce(sse(dialecto[proveedor](`trozo ${i} `, 'longitud')))
    await enviar(proveedor)
    expect(fetchSimulado).toHaveBeenCalledTimes(3)
  })

  it('si el servidor se calla con texto recibido, entrega lo parcial marcado', async () => {
    vi.useFakeTimers()
    fetchSimulado.mockImplementationOnce(sse(dialecto[proveedor]('Primera mitad del informe', null), true))

    const promesa = enviar(proveedor)
    await vi.advanceTimersByTimeAsync(91_000)
    const r = await promesa

    expect(r.success).toBe(true)
    expect(r.data.response).toBe('Primera mitad del informe')
    expect(r.data.metadata.finish_reason).toBe(FIN_POR_INACTIVIDAD)
    expect(fetchSimulado).toHaveBeenCalledTimes(1)
  })

  it('si se calla sin haber mandado texto, es un error de tiempo que el chat reintenta', async () => {
    vi.useFakeTimers()
    fetchSimulado.mockImplementationOnce(sse([], true))

    const promesa = enviar(proveedor)
    await vi.advanceTimersByTimeAsync(91_000)
    const r = await promesa

    expect(r.success).toBe(false)
    expect(r.error).toMatch(/timed out: 90 s sin enviar nada/)
  })

  it('si la continuación se queda muda, entrega lo que ya tenía', async () => {
    vi.useFakeTimers()
    fetchSimulado
      .mockImplementationOnce(sse(dialecto[proveedor]('Primera parte', 'longitud')))
      .mockImplementationOnce(sse([], true))

    const promesa = enviar(proveedor)
    await vi.advanceTimersByTimeAsync(91_000)
    const r = await promesa

    expect(r.success).toBe(true)
    expect(r.data.response).toBe('Primera parte')
  })
})

describe('Anthropic', () => {
  it('el sistema va en su campo, no pegado a la pregunta', async () => {
    fetchSimulado.mockImplementationOnce(sse(dialecto.anthropic('ok', 'fin')))
    await enviar('anthropic')
    const cuerpo = cuerpoDe(0)
    expect(typeof cuerpo.system).toBe('string')
    expect(cuerpo.system.length).toBeGreaterThan(0)
    expect(cuerpo.messages).toEqual([{ role: 'user', content: '¿Cómo se calcula el golpe de ariete?' }])
    expect(cuerpo.max_tokens).toBe(8192)
    expect(fetchSimulado.mock.calls[0][1].headers).toMatchObject({ 'x-api-key': 'clave-FAKE-0123456789', 'anthropic-version': '2023-06-01' })
  })

  it('suma los tokens del streaming', async () => {
    fetchSimulado.mockImplementationOnce(sse(dialecto.anthropic('ok', 'fin')))
    const r = await enviar('anthropic')
    expect(r.data.metadata).toMatchObject({ model: 'claude-x', tokens: 30, finish_reason: 'end_turn' })
  })

  it('un error a mitad del streaming no se toma por respuesta', async () => {
    fetchSimulado.mockImplementationOnce(sse([{ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }]))
    const r = await enviar('anthropic')
    expect(r).toMatchObject({ success: false, error: expect.stringContaining('Overloaded') })
  })

  it.each([
    [401, 'API key'],
    [402, 'credits'],
    [529, 'temporarily unavailable'],
  ])('un %i da un error que el chat sabe explicar', async (status, texto) => {
    fetchSimulado.mockImplementationOnce(error(status, { type: 'error', error: { message: 'x' } }))
    const r = await enviar('anthropic')
    expect(r.error).toContain(texto)
  })
})

describe('Google', () => {
  it('una clave mala es un 400 y se dice que es la clave', async () => {
    fetchSimulado.mockImplementationOnce(error(400, { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }] } }))
    const r = await enviar('google')
    expect(r.error).toContain('Invalid Google AI API key')
  })

  it('la clave va en cabecera, no en la URL', async () => {
    fetchSimulado.mockImplementationOnce(sse(dialecto.google('ok', 'fin')))
    await enviar('google')
    expect(fetchSimulado.mock.calls[0][0]).not.toContain('key=')
    expect(fetchSimulado.mock.calls[0][1].headers['x-goog-api-key']).toBe('clave-FAKE-0123456789')
  })

  it('ignora las partes de razonamiento', async () => {
    fetchSimulado.mockImplementationOnce(sse([
      { candidates: [{ content: { parts: [{ text: 'pienso…', thought: true }] } }] },
      { candidates: [{ content: { parts: [{ text: 'Respuesta' }] }, finishReason: 'STOP' }] },
    ]))
    const r = await enviar('google')
    expect(r.data.response).toBe('Respuesta')
  })
})

describe('OpenAI', () => {
  it('un modelo que no se puede servir en streaming se vuelve a pedir sin él', async () => {
    fetchSimulado
      .mockImplementationOnce(error(400, { error: { message: 'Your organization must be verified to stream this model.' } }))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ usage: { total_tokens: 5 }, choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'Sin streaming' } }] }),
      })

    const r = await enviar('openai')

    expect(r.data.response).toBe('Sin streaming')
    expect(cuerpoDe(0).stream).toBe(true)
    expect(cuerpoDe(1).stream).toBe(false)
  })
})

/**
 * Antes se pedían 8192 tokens de salida a todos (#223), y la API rechaza la
 * petición entera de un modelo que admite menos: claude-3-haiku y gpt-4-turbo
 * admiten 4096.
 */
describe('el tope de salida es el del modelo (#223)', () => {
  const conModelos = (filas: Array<{ modelId: string; proveedor: string; metadata: string | null }>) => new ChatHandler({
    claveDeProveedor: async () => 'clave-FAKE-0123456789',
    prisma: {
      appSetting: { findUnique: async () => null },
      aIProvider: { findMany: async () => [] },
      hydraulicNetwork: { findFirst: async () => null },
      aIModel: {
        findMany: async ({ where }: { where: { modelId: string } }) => filas
          .filter(f => f.modelId === where.modelId)
          .map(f => ({ metadata: f.metadata, provider: { name: f.proveedor } })),
      },
    },
  } as never)

  const pedir = (provider: string, model: string) => handlers['chat:send-message'](null, {
    provider, model, messages: [{ role: 'user', content: 'Hola' }],
  })

  it.each([
    ['anthropic', 'claude-3-haiku-20240307', 'max_tokens', 4096],
    ['anthropic', 'claude-3-opus-20240229', 'max_tokens', 4096],
    ['anthropic', 'claude-3-5-sonnet-20241022', 'max_tokens', 8192],
    ['openai', 'gpt-4o', 'max_completion_tokens', 16384],
    ['openai', 'gpt-4-turbo', 'max_completion_tokens', 4096],
    ['openai', 'gpt-4', 'max_completion_tokens', 2048],
    ['openrouter', 'anthropic/claude-3-haiku', 'max_tokens', 4096],
    ['nvidia', 'nvidia/nemotron-3-ultra-550b-a55b', 'max_tokens', 16384],
    ['nvidia', 'nvidia/nemotron-3.5-lightning-30b-a3b', 'max_tokens', 8192],
    ['openai', 'modelo-inventado-9000', 'max_completion_tokens', 8192],
  ])('%s %s recibe %s = %i', async (proveedor, modelo, campo, tope) => {
    fetchSimulado.mockImplementationOnce(sse((dialecto[proveedor] ?? dialecto.openai)('ok', 'fin')))
    const r = await pedir(proveedor, modelo)
    expect(r.success).toBe(true)
    expect(cuerpoDe(0)[campo]).toBe(tope)
  })

  it('Google lo lleva en generationConfig', async () => {
    fetchSimulado.mockImplementationOnce(sse(dialecto.google('ok', 'fin')))
    await pedir('google', 'gemini-2.5-pro')
    expect(cuerpoDe(0).generationConfig.maxOutputTokens).toBe(8192)
  })

  it('lo que dio la API al probar la clave manda sobre la tabla', async () => {
    conModelos([
      { modelId: 'claude-sonnet-4-5', proveedor: 'Anthropic', metadata: JSON.stringify({ limites: { contexto: 200000, salida: 32000 } }) },
      // Mismo id en otro proveedor: no cuenta.
      { modelId: 'claude-sonnet-4-5', proveedor: 'openrouter', metadata: JSON.stringify({ limites: { salida: 1000 } }) },
    ])
    fetchSimulado.mockImplementationOnce(sse(dialecto.anthropic('ok', 'fin')))
    await pedir('anthropic', 'claude-sonnet-4-5')
    expect(cuerpoDe(0).max_tokens).toBe(32000)
  })

  it('sin poder leer la base, la tabla', async () => {
    // El `beforeEach` monta un prisma sin `aIModel`.
    fetchSimulado.mockImplementationOnce(sse(dialecto.anthropic('ok', 'fin')))
    const r = await pedir('anthropic', 'claude-3-haiku-20240307')
    expect(r.success).toBe(true)
    expect(cuerpoDe(0).max_tokens).toBe(4096)
  })
})
