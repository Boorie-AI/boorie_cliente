/**
 * El lector SSE por sí solo (#223): lo que llega troceado por la red tiene que
 * dar el mismo texto que si llegara de una vez, y un corte o un error a mitad
 * no puede pasar por una respuesta completa.
 */
import { describe, it, expect } from 'vitest'
import {
  FIN_POR_ERROR,
  FIN_POR_INACTIVIDAD,
  FIN_POR_TIEMPO,
  leerAnthropicEnStreaming,
  leerGoogleEnStreaming,
  leerRespuestaEnStreaming,
  unirContinuacion,
  unirContinuacionParcial,
} from './respuestaOpenAICompat'

/**
 * Un cuerpo que entrega estos bytes, en estos trozos y en este orden. «colgado»
 * deja la última lectura esperando, y como en un `fetch` real se rechaza al
 * abortar la señal.
 */
const cuerpo = (trozos: Array<string | Uint8Array>, alFinal: 'fin' | 'colgado' = 'fin', senal?: AbortSignal) => {
  const cola = trozos.map(t => (typeof t === 'string' ? new TextEncoder().encode(t) : t))
  let cancelado = false
  return {
    cancelado: () => cancelado,
    body: {
      getReader: () => ({
        read: () => (cola.length
          ? Promise.resolve({ done: false, value: cola.shift() })
          : alFinal === 'fin' ? Promise.resolve({ done: true, value: undefined })
            : new Promise((_, rechazar) => senal?.addEventListener('abort', () => rechazar(senal.reason)))),
        cancel: async () => { cancelado = true },
      }),
    },
  }
}

const delta = (texto: string) => `data: ${JSON.stringify({ model: 'm', choices: [{ delta: { content: texto } }] })}\n\n`
const fin = (motivo: string) => `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: motivo }], usage: { total_tokens: 7 } })}\n\n`
const texto = (r: { choices: Array<{ message: { content: string } }> }) => r.choices[0].message.content
const leer = (c: Parameters<typeof leerRespuestaEnStreaming>[0], ms = 1000, controlador = new AbortController()) => leerRespuestaEnStreaming(c, controlador, ms, 'Nvidia timed out: callado')

describe('leerRespuestaEnStreaming', () => {
  it('une los deltas y se queda con el finish_reason y el usage', async () => {
    const r = await leer(cuerpo([delta('Hola, '), delta('mundo'), fin('stop'), 'data: [DONE]\n\n']))
    expect(texto(r)).toBe('Hola, mundo')
    expect(r.choices[0].finish_reason).toBe('stop')
    expect(r.usage).toEqual({ total_tokens: 7 })
  })

  it('una línea JSON partida entre dos lecturas no se pierde', async () => {
    const linea = delta('pérdida en el pozo')
    const r = await leer(cuerpo([linea.slice(0, 17), linea.slice(17), fin('stop')]))
    expect(texto(r)).toBe('pérdida en el pozo')
  })

  it('un carácter de varios bytes partido entre dos lecturas llega entero', async () => {
    const bytes = new TextEncoder().encode(delta('s²/ft⁵ y ñ'))
    // Corta dentro de «²» (dos bytes en UTF-8).
    const corte = new TextEncoder().encode(delta('s').slice(0, -6)).length + 1
    const r = await leer(cuerpo([bytes.slice(0, corte), bytes.slice(corte), fin('stop')]))
    expect(texto(r)).toBe('s²/ft⁵ y ñ')
  })

  it('acepta \\r\\n, ignora comentarios y líneas que no son data, y sigue tras un [DONE] a mitad', async () => {
    const r = await leer(cuerpo([
      ': keep-alive\r\n\r\n',
      'event: message\r\n' + delta('uno').replace('\n\n', '\r\n\r\n'),
      'data: [DONE]\n\n',
      delta(' dos'),
    ]))
    expect(texto(r)).toBe('uno dos')
  })

  it('el último evento sin salto de línea final también cuenta', async () => {
    const r = await leer(cuerpo([delta('casi '), delta('entero').trimEnd()]))
    expect(texto(r)).toBe('casi entero')
  })

  it('un error del servidor a mitad conserva lo recibido y lo marca como cortado', async () => {
    const c = cuerpo([delta('Lo que llegó'), 'data: {"error":{"message":"upstream overloaded"}}\n\n', delta(' y esto no')], 'colgado')
    const r = await leer(c)
    expect(texto(r)).toBe('Lo que llegó')
    expect(r.choices[0].finish_reason).toBe(FIN_POR_ERROR)
    expect(c.cancelado()).toBe(true)
  })

  it('un error del servidor sin texto todavía se lanza, para que el chat reintente', async () => {
    await expect(leer(cuerpo(['data: {"error":{"message":"quota exceeded"}}\n\n']))).rejects.toThrow('quota exceeded')
  })

  it('el silencio con texto ya recibido se entrega como inactividad; sin texto, se lanza', async () => {
    const c1 = new AbortController()
    const r = await leer(cuerpo([delta('a medias')], 'colgado', c1.signal), 30, c1)
    expect(texto(r)).toBe('a medias')
    expect(r.choices[0].finish_reason).toBe(FIN_POR_INACTIVIDAD)
    const c2 = new AbortController()
    await expect(leer(cuerpo([], 'colgado', c2.signal), 30, c2)).rejects.toThrow('callado')
  })
})

describe('leerAnthropicEnStreaming', () => {
  const ev = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`

  it('un error a mitad ya no tira el texto recibido', async () => {
    const r = await leerAnthropicEnStreaming(cuerpo([
      ev({ type: 'message_start', message: { model: 'claude', usage: { input_tokens: 5 } } }),
      ev({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Parcial' } }),
      ev({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }),
    ], 'colgado'), new AbortController(), 1000, 'callado')
    expect(r.content[0].text).toBe('Parcial')
    expect(r.stop_reason).toBe(FIN_POR_ERROR)
  })

  it('sin texto, el error se lanza', async () => {
    await expect(leerAnthropicEnStreaming(cuerpo([ev({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } })]),
      new AbortController(), 1000, 'callado')).rejects.toThrow('Overloaded')
  })
})

describe('leerGoogleEnStreaming', () => {
  it('une las partes, sin las de razonamiento, aunque el último evento no acabe en salto de línea', async () => {
    const ev = (o: unknown) => `data: ${JSON.stringify(o)}`
    const r = await leerGoogleEnStreaming(cuerpo([
      ev({ candidates: [{ content: { parts: [{ text: 'pienso…', thought: true }, { text: 'Res' }] } }] }) + '\n\n',
      ev({ candidates: [{ content: { parts: [{ text: 'puesta' }] }, finishReason: 'STOP' }], usageMetadata: { totalTokenCount: 3 } }),
    ]), new AbortController(), 1000, 'callado')
    expect(r.candidates[0].content.parts[0].text).toBe('Respuesta')
    expect(r.candidates[0].finishReason).toBe('STOP')
    expect(r.usageMetadata).toEqual({ totalTokenCount: 3 })
  })
})

describe('el texto mientras llega (#223)', () => {
  const ev = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`

  it('cada lector avisa con el texto acumulado, sin el razonamiento', async () => {
    const vistos: string[] = []
    await leerRespuestaEnStreaming(cuerpo([
      'data: {"choices":[{"delta":{"reasoning_content":"pienso"}}]}\n\n',
      delta('Hola, '), delta('mundo'), fin('stop'),
    ]), new AbortController(), 1000, 'x', t => vistos.push(t))
    expect(vistos).toEqual(['Hola, ', 'Hola, mundo'])

    const deAnthropic: string[] = []
    await leerAnthropicEnStreaming(cuerpo([
      ev({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'A' } }),
      ev({ type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{' } }),
      ev({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'B' } }),
    ]), new AbortController(), 1000, 'x', t => deAnthropic.push(t))
    expect(deAnthropic).toEqual(['A', 'AB'])

    const deGoogle: string[] = []
    await leerGoogleEnStreaming(cuerpo([
      ev({ candidates: [{ content: { parts: [{ text: 'pienso', thought: true }] } }] }),
      ev({ candidates: [{ content: { parts: [{ text: 'Res' }] } }] }),
      ev({ candidates: [{ content: { parts: [{ text: 'puesta' }] } }] }),
    ]), new AbortController(), 1000, 'x', t => deGoogle.push(t))
    expect(deGoogle).toEqual(['Res', 'Respuesta'])
  })

  it('el tope total con texto ya recibido lo conserva y lo marca; sin texto, se lanza', async () => {
    const c1 = new AbortController()
    const leyendo = leer(cuerpo([delta('Mitad del informe')], 'colgado', c1.signal), 60_000, c1)
    await new Promise(r => setTimeout(r, 5))
    c1.abort(new Error('Nvidia timed out: no terminó en 600 s'))
    const r = await leyendo
    expect(texto(r)).toBe('Mitad del informe')
    expect(r.choices[0].finish_reason).toBe(FIN_POR_TIEMPO)

    const c2 = new AbortController()
    const sinTexto = leer(cuerpo([], 'colgado', c2.signal), 60_000, c2)
    c2.abort(new Error('Nvidia timed out: no terminó en 600 s'))
    await expect(sinTexto).rejects.toThrow('no terminó')
  })
})

describe('unirContinuacionParcial', () => {
  const previo = 'El ensayo escalonado mide la pérdida en el pozo con el medidor de potencia,'

  it('retiene el principio mientras puede ser el solape, y no lo repite al resolverse', () => {
    const final = '…medidor de potencia, que se lee cada minuto.'
    const vistas: string[] = []
    for (let i = 1; i <= final.length; i++) {
      const v = unirContinuacionParcial(previo, final.slice(0, i))
      if (v !== null) vistas.push(v)
    }
    expect(vistas.at(-1)).toBe(unirContinuacion(previo, final))
    for (const v of vistas) expect(v.split('medidor de potencia').length).toBe(2)
  })

  it('retiene un título de «Continuación» hasta que acaba la línea, y luego lo quita', () => {
    expect(unirContinuacionParcial(previo, '## Continuación del proced')).toBeNull()
    expect(unirContinuacionParcial(previo, '## Continuación del procedimiento\n\nY después')).toBe(`${previo}Y después`)
  })

  it('un texto que no puede ser solape ni título sale enseguida', () => {
    expect(unirContinuacionParcial(previo, ' y después se anota')).toBe(`${previo} y después se anota`)
  })
})
