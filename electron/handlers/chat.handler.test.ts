import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * El bucle de herramientas es la pieza con mas formas de salir mal: emparejar
 * ids, devolver los resultados en la forma que cada proveedor exige, no
 * quedarse dando vueltas y saber degradar cuando el modelo no las soporta.
 * Nada de eso se ve en los modulos puros, asi que se prueba aqui contra un
 * fetch simulado, sin red.
 */

const handlersRegistrados: Record<string, (evento: unknown, params: any) => Promise<any>> = {}

vi.mock('electron', () => ({
  ipcMain: {
    handle: (canal: string, fn: any) => { handlersRegistrados[canal] = fn },
    removeAllListeners: () => {},
  },
}))

// El consentimiento tiene sus pruebas en chat.handler.consentimiento.test.ts; aquí se da por dado.
vi.mock('../../backend/services/security/consentimientoNube', async importOriginal => ({
  ...(await importOriginal<typeof import('../../backend/services/security/consentimientoNube')>()),
  hayConsentimiento: () => true,
}))

// Sin esto, la consulta a /api/show se llevaría la primera respuesta simulada.
vi.mock('../../backend/services/contextoDeOllama', () => ({ contextoDeOllama: async () => 8192 }))

import { ChatHandler, unirContinuacion, pedirContinuacion, leerRespuestaEnStreaming, FIN_POR_INACTIVIDAD } from './chat.handler'
import type { LlamadaOpenAI } from '../../backend/services/ai/respuestaOpenAICompat'

const RED = {
  nodes: [
    { id: 'J3', type: 'junction', elevation: 8, demand: 0.000115 },
    { id: 'J1', type: 'junction', elevation: 10, demand: 0.000231 },
  ],
  links: [
    { id: 'P2', type: 'pipe', from: 'J1', to: 'J3', length: 150, diameter: 0.05 },
  ],
}

const baseDeDatos = (conRed: boolean) => ({
  claveDeProveedor: async () => 'k',
  prisma: {
    appSetting: { findUnique: async () => null },
    aIProvider: { findMany: async () => [] },
    hydraulicNetwork: {
      findFirst: async () =>
        conRed ? { id: 'n1', name: 'villa.inp', summary: '{}', networkData: JSON.stringify(RED) } : null,
    },
  },
}) as any

type BloqueSimulado =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }

/** Un mensaje de los que se mandan al proveedor, para leerlo en las comprobaciones. */
type MensajeEnviado = { role: string; content: string; tool_call_id?: string; tool_calls?: LlamadaOpenAI[] }

/** Un texto en dos mitades, como llega troceado. */
const mitades = (texto: string) => {
  const mitad = Math.ceil(texto.length / 2)
  return [texto.slice(0, mitad), texto.slice(mitad)].filter(Boolean)
}

/**
 * Lo que manda el servidor en streaming: el mismo cuerpo, en eventos SSE. Las
 * vueltas con herramientas también van en streaming (#251), así que las
 * llamadas llegan troceadas como en la API: el id y el nombre en el primer
 * trozo, y los argumentos partidos.
 */
function eventos(cuerpo: any): string[] {
  const sse = (lista: unknown[]) => lista.map(e => `data: ${JSON.stringify(e)}\n\n`)
  if (Array.isArray(cuerpo?.content)) {
    const bloques = (cuerpo.content as BloqueSimulado[]).flatMap((b, index) => {
      const inicio = b.type === 'tool_use' ? { ...b, input: {} } : b.type === 'thinking' ? { type: 'thinking', thinking: '' } : { type: 'text', text: '' }
      const deltas = b.type === 'tool_use'
        ? mitades(JSON.stringify(b.input)).map(p => ({ type: 'input_json_delta', partial_json: p }))
        : b.type === 'thinking'
          ? [{ type: 'thinking_delta', thinking: b.thinking }]
          : mitades(b.text).map(t => ({ type: 'text_delta', text: t }))
      return [
        { type: 'content_block_start', index, content_block: inicio },
        ...deltas.map(delta => ({ type: 'content_block_delta', index, delta })),
        { type: 'content_block_stop', index },
      ]
    })
    return sse([
      { type: 'message_start', message: { model: cuerpo.model, usage: { input_tokens: cuerpo.usage?.input_tokens ?? 0 } } },
      ...bloques,
      { type: 'message_delta', delta: { stop_reason: cuerpo.stop_reason }, usage: { output_tokens: cuerpo.usage?.output_tokens ?? 0 } },
      { type: 'message_stop' },
    ])
  }
  const eleccion = cuerpo?.choices?.[0]
  const llamadas: LlamadaOpenAI[] = eleccion?.message?.tool_calls ?? []
  return sse([
    { model: cuerpo?.model, created: cuerpo?.created, choices: [{ delta: { reasoning_content: 'pienso' } }] },
    ...mitades(eleccion?.message?.content ?? '').map(c => ({ choices: [{ delta: { content: c } }] })),
    ...llamadas.flatMap((l, index) => [
      { choices: [{ delta: { tool_calls: [{ index, id: l.id, type: 'function', function: { name: l.function.name, arguments: '' } }] } }] },
      ...mitades(l.function.arguments).map(a => ({ choices: [{ delta: { tool_calls: [{ index, function: { arguments: a } }] } }] })),
    ]),
    { choices: [{ delta: {}, finish_reason: eleccion?.finish_reason }] },
    { choices: [], usage: cuerpo?.usage },
  ]).concat('data: [DONE]\n\n')
}

const lectorDe = (trozos: string[]) => {
  const cola = trozos.map(t => new TextEncoder().encode(t))
  return { read: async () => (cola.length ? { done: false, value: cola.shift() } : { done: true, value: undefined }) }
}

const respuesta = (cuerpo: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => cuerpo,
  body: { getReader: () => lectorDe(eventos(cuerpo)) },
})

const anthropicPideHerramienta = {
  stop_reason: 'tool_use',
  usage: { input_tokens: 100, output_tokens: 20 },
  content: [
    { type: 'text', text: 'Lo miro.' },
    { type: 'tool_use', id: 'toolu_01', name: 'consultar_elemento', input: { id: 'J3' } },
  ],
}

const anthropicResponde = {
  stop_reason: 'end_turn',
  usage: { input_tokens: 300, output_tokens: 40 },
  content: [{ type: 'text', text: 'J3 esta a 8 m de cota.' }],
}

const openaiPideHerramienta = {
  created: 1_700_000_000,
  usage: { total_tokens: 120 },
  choices: [{
    finish_reason: 'tool_calls',
    message: {
      role: 'assistant',
      content: null,
      tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'consultar_elemento', arguments: '{"id":"J3"}' } }],
    },
  }],
}

const openaiResponde = {
  created: 1_700_000_001,
  usage: { total_tokens: 340 },
  choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'J3 esta a 8 m de cota.' } }],
}

let fetchSimulado: ReturnType<typeof vi.fn>

const enviar = (params: Record<string, unknown>) =>
  handlersRegistrados['chat:send-message'](null, {
    model: 'un-modelo',
    messages: [{ role: 'user', content: '¿como mejoro el flujo en J3?' }],
    projectId: 'p1',
    ...params,
  })

const cuerpoDe = (llamada: number) => JSON.parse(fetchSimulado.mock.calls[llamada][1].body)

beforeEach(() => {
  fetchSimulado = vi.fn()
  vi.stubGlobal('fetch', fetchSimulado)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('bucle de herramientas con Anthropic', () => {
  it('ejecuta la herramienta y devuelve la respuesta de la segunda vuelta', async () => {
    new ChatHandler(baseDeDatos(true))
    fetchSimulado
      .mockResolvedValueOnce(respuesta(anthropicPideHerramienta))
      .mockResolvedValueOnce(respuesta(anthropicResponde))

    const r = await enviar({ provider: 'anthropic' })

    expect(r.success).toBe(true)
    expect(r.data.response).toBe('J3 esta a 8 m de cota.')
    expect(fetchSimulado).toHaveBeenCalledTimes(2)
  })

  it('declara las herramientas y devuelve el resultado con el tool_use_id que le dieron', async () => {
    new ChatHandler(baseDeDatos(true))
    fetchSimulado
      .mockResolvedValueOnce(respuesta(anthropicPideHerramienta))
      .mockResolvedValueOnce(respuesta(anthropicResponde))

    await enviar({ provider: 'anthropic' })

    // Van todas en la misma lista a propósito, las que consultan y las que
    // proponen (#44, #119): proponer un escenario o un análisis es otra forma
    // de responder, y el agente decide cuál usar con la misma información. La
    // lista va escrita y no derivada de HERRAMIENTAS: lo que se comprueba es
    // que el catálogo llega entero al proveedor, y una lista que se genera sola
    // no puede detectar que se ha quedado una por el camino.
    expect(cuerpoDe(0).tools.map((t: any) => t.name)).toEqual([
      'consultar_elemento',
      'listar_elementos',
      'curva_fragilidad',
      'calcular',
      'proponer_analisis',
      'proponer_escenario',
    ])

    // Anthropic exige que el turno del asistente se reenvie intacto y que el
    // resultado venga en un mensaje de usuario con el id que el asigno.
    const segundo = cuerpoDe(1)
    expect(segundo.messages).toHaveLength(3)
    expect(segundo.messages[1]).toMatchObject({ role: 'assistant' })
    const bloque = segundo.messages[2].content[0]
    expect(bloque).toMatchObject({ type: 'tool_result', tool_use_id: 'toolu_01' })
    expect(JSON.parse(bloque.content).elemento).toMatchObject({ id: 'J3', cota_m: 8 })
  })

  it('el texto sale de los bloques de texto, no de content[0]', async () => {
    // Con herramientas, content[0] deja de ser texto: puede ser un tool_use o
    // un bloque de razonamiento. Leerlo a pelo devolvia «No response from
    // Anthropic» teniendo la respuesta delante.
    new ChatHandler(baseDeDatos(true))
    fetchSimulado.mockResolvedValueOnce(respuesta({
      stop_reason: 'end_turn',
      content: [
        { type: 'thinking', thinking: 'Ya tengo la cota.' },
        { type: 'text', text: 'La respuesta.' },
      ],
    }))

    const r = await enviar({ provider: 'anthropic' })
    expect(r.data.response).toBe('La respuesta.')
    expect(fetchSimulado).toHaveBeenCalledTimes(1)
  })

  it('suma los tokens de todas las vueltas, no solo los de la ultima', async () => {
    new ChatHandler(baseDeDatos(true))
    fetchSimulado
      .mockResolvedValueOnce(respuesta(anthropicPideHerramienta))
      .mockResolvedValueOnce(respuesta(anthropicResponde))

    const r = await enviar({ provider: 'anthropic' })
    expect(r.data.metadata.tokens).toBe(100 + 20 + 300 + 40)
  })
})

describe('bucle de herramientas con los compatibles con OpenAI', () => {
  it('devuelve un mensaje role tool por cada llamada', async () => {
    new ChatHandler(baseDeDatos(true))
    fetchSimulado
      .mockResolvedValueOnce(respuesta(openaiPideHerramienta))
      .mockResolvedValueOnce(respuesta(openaiResponde))

    const r = await enviar({ provider: 'openai' })

    expect(r.data.response).toBe('J3 esta a 8 m de cota.')
    const segundo = cuerpoDe(1)
    // Por papel y no por posición: en los compatibles con OpenAI el sistema va
    // dentro de `messages`, así que fijar índices los rompe cada vez que cambia
    // lo que se antepone (#119, fase 3).
    const herramienta = segundo.messages.find((m: any) => m.role === 'tool')
    expect(segundo.messages.some((m: any) => m.role === 'assistant')).toBe(true)
    expect(herramienta).toMatchObject({ role: 'tool', tool_call_id: 'call_1' })
    expect(JSON.parse(herramienta.content).elemento).toMatchObject({ id: 'J3' })
  })

  it('el sistema va siempre, aunque no haya nada guardado', async () => {
    // `appSetting.findUnique` devuelve null aquí, que es lo que pasa en una
    // instalación recién hecha: antes se enviaba el mensaje **sin ningún
    // sistema**, así que las reglas dependían de que alguien hubiera entrado en
    // Ajustes y le hubiera dado a guardar (#119, fase 3).
    new ChatHandler(baseDeDatos(true))
    fetchSimulado.mockResolvedValueOnce(respuesta(openaiResponde))

    await enviar({ provider: 'openai' })

    const sistema = cuerpoDe(0).messages.find((m: any) => m.role === 'system')
    expect(sistema).toBeTruthy()
    expect(sistema.content).toMatch(/lleva su unidad, siempre/)
    expect(sistema.content).toMatch(/No des cifras de impacto/)
    // Y sin personalización no se cuela el encabezado de la parte del usuario.
    expect(sistema.content).not.toMatch(/Indicaciones de quien usa Boorie/)
  })

  it('las herramientas van envueltas en function', async () => {
    new ChatHandler(baseDeDatos(true))
    fetchSimulado.mockResolvedValueOnce(respuesta(openaiResponde))

    await enviar({ provider: 'openai' })
    expect(cuerpoDe(0).tools[0]).toMatchObject({ type: 'function', function: { name: 'consultar_elemento' } })
  })

  it('OpenRouter y NVIDIA pasan por el mismo bucle', async () => {
    for (const provider of ['openrouter', 'nvidia']) {
      fetchSimulado.mockReset()
      fetchSimulado
        .mockResolvedValueOnce(respuesta(openaiPideHerramienta))
        .mockResolvedValueOnce(respuesta(openaiResponde))
      new ChatHandler(baseDeDatos(true))

      const r = await enviar({ provider })
      expect(r.data.response, provider).toBe('J3 esta a 8 m de cota.')
      expect(fetchSimulado, provider).toHaveBeenCalledTimes(2)
    }
  })
})

describe('respuesta cortada por longitud', () => {
  const cortada = (texto: string) => ({
    created: 1_700_000_002,
    usage: { total_tokens: 4096 },
    choices: [{ finish_reason: 'length', message: { role: 'assistant', content: texto } }],
  })
  const termina = (texto: string) => ({
    created: 1_700_000_003,
    usage: { total_tokens: 500 },
    choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: texto } }],
  })

  it('pide que siga y une los trozos', async () => {
    new ChatHandler(baseDeDatos(false))
    fetchSimulado
      .mockResolvedValueOnce(respuesta(cortada('El coeficiente C se obtiene')))
      .mockResolvedValueOnce(respuesta(termina(' de la ecuación de Jacob.')))

    const r = await enviar({ provider: 'nvidia' })

    expect(r.data.response).toBe('El coeficiente C se obtiene de la ecuación de Jacob.')
    expect(r.data.metadata).toMatchObject({ continuaciones: 1, finish_reason: 'stop', tokens: 4596 })
    const segundo = cuerpoDe(1).messages
    expect(segundo.at(-2)).toEqual({ role: 'assistant', content: 'El coeficiente C se obtiene' })
    expect(segundo.at(-1).role).toBe('user')
  })

  it('sin razonar, NVIDIA recibe el interruptor de su plantilla', async () => {
    new ChatHandler(baseDeDatos(false))
    fetchSimulado.mockResolvedValue(respuesta(termina('{"problemas":[]}')))

    await enviar({ provider: 'nvidia', sinRazonar: true })
    expect(cuerpoDe(0).chat_template_kwargs).toEqual({ enable_thinking: false })

    await enviar({ provider: 'nvidia' })
    expect(cuerpoDe(1).chat_template_kwargs).toBeUndefined()
  })

  it('quita lo que el modelo repite al retomar', () => {
    expect(unirContinuacion(
      'Si no se dispone de medidor de potencia,',
      '…medidor de potencia, se puede estimar con V·I.'
    )).toBe('Si no se dispone de medidor de potencia, se puede estimar con V·I.')
    expect(unirContinuacion('Se obtiene de la ecua', 'ción de Jacob.')).toBe('Se obtiene de la ecuación de Jacob.')
    expect(unirContinuacion('El resultado es', '... 2,0 sec²/ft⁵.')).toBe('El resultado es 2,0 sec²/ft⁵.')
  })

  it('quita el título de «Continuación» con el que el modelo vuelve a empezar', () => {
    expect(unirContinuacion(
      'Un *Sₖ* positivo indica daño',
      '**Continuación del procedimiento de cálculo y fórmulas**\n\n en la pantalla del pozo.'
    )).toBe('Un *Sₖ* positivo indica daño en la pantalla del pozo.')
    expect(unirContinuacion('Fin de la parte', '## Continuación\n\n y sigue')).toBe('Fin de la parte y sigue')
  })

  it('la petición de continuar cita el final exacto', async () => {
    new ChatHandler(baseDeDatos(false))
    fetchSimulado
      .mockResolvedValueOnce(respuesta(cortada('Un Sk positivo indica daño')))
      .mockResolvedValueOnce(respuesta(termina(' en la pantalla.')))

    await enviar({ provider: 'nvidia' })

    expect(cuerpoDe(1).messages.at(-1).content).toBe(pedirContinuacion('Un Sk positivo indica daño'))
    expect(pedirContinuacion('Un Sk positivo indica daño')).toContain('«…Un Sk positivo indica daño»')
  })

  it('no pide más de dos continuaciones', async () => {
    new ChatHandler(baseDeDatos(false))
    fetchSimulado.mockResolvedValue(respuesta(cortada('a')))

    const r = await enviar({ provider: 'openai' })

    expect(fetchSimulado).toHaveBeenCalledTimes(3)
    expect(r.data.response).toBe('aaa')
    expect(r.data.metadata.finish_reason).toBe('length')
  })

  it('si falla la continuación entrega lo que ya tenía', async () => {
    new ChatHandler(baseDeDatos(false))
    fetchSimulado
      .mockResolvedValueOnce(respuesta(cortada('Primera parte')))
      .mockResolvedValueOnce(respuesta({ detail: 'Too many requests' }, 429))

    const r = await enviar({ provider: 'nvidia' })

    expect(r.data.response).toBe('Primera parte')
  })

  it('la continuación va sin herramientas', async () => {
    new ChatHandler(baseDeDatos(true))
    fetchSimulado
      .mockResolvedValueOnce(respuesta(cortada('Parte')))
      .mockResolvedValueOnce(respuesta(termina(' final')))

    await enviar({ provider: 'openrouter' })

    expect(cuerpoDe(0).tools).toBeDefined()
    expect(cuerpoDe(1).tools).toBeUndefined()
  })
})

describe('bucle de herramientas con Ollama', () => {
  const ollamaPide = {
    prompt_eval_count: 90,
    eval_count: 15,
    message: {
      role: 'assistant',
      content: ' ',
      tool_calls: [{ id: 'call_x', function: { name: 'consultar_elemento', arguments: { id: 'J3' } } }],
    },
  }
  const ollamaResponde = {
    prompt_eval_count: 200,
    eval_count: 30,
    message: { role: 'assistant', content: ' La cota de J3 es 8 m.' },
  }

  it('resuelve la llamada y contesta con el dato', async () => {
    new ChatHandler(baseDeDatos(true))
    fetchSimulado
      .mockResolvedValueOnce(respuesta(ollamaPide))
      .mockResolvedValueOnce(respuesta(ollamaResponde))

    const r = await enviar({ provider: 'ollama' })

    // El trim importa: pidiendo herramientas, nemotron devuelve content=' ' y
    // sin recortarlo el chat ensena un mensaje en blanco.
    expect(r.data.response).toBe('La cota de J3 es 8 m.')
    const segundo = cuerpoDe(1)
    const resultado = segundo.messages.find((m: any) => m.role === 'tool')
    expect(resultado).toMatchObject({ role: 'tool', tool_call_id: 'call_x' })
    expect(JSON.parse(resultado.content).elemento).toMatchObject({ id: 'J3', cota_m: 8 })
    // El mismo num_ctx en cada vuelta: con otro, Ollama recargaría el modelo.
    expect([cuerpoDe(0).options.num_ctx, segundo.options.num_ctx]).toEqual([8192, 8192])
  })

  it('un modelo local sin plantilla de herramientas no rompe el chat', async () => {
    new ChatHandler(baseDeDatos(true))
    fetchSimulado
      .mockResolvedValueOnce({ ok: false, status: 400, text: async () => 'registry.ollama.ai does not support tools' })
      .mockResolvedValueOnce(respuesta(ollamaResponde))

    const r = await enviar({ provider: 'ollama' })

    expect(r.success).toBe(true)
    expect(cuerpoDe(1).tools).toBeUndefined()
  })
})

describe('degradacion cuando no hay herramientas que ofrecer', () => {
  it('sin proyecto no se declaran herramientas', async () => {
    new ChatHandler(baseDeDatos(true))
    fetchSimulado.mockResolvedValueOnce(respuesta(anthropicResponde))

    await enviar({ provider: 'anthropic', projectId: undefined })
    expect(cuerpoDe(0).tools).toBeUndefined()
  })

  it('con proyecto pero sin red tampoco', async () => {
    new ChatHandler(baseDeDatos(false))
    fetchSimulado.mockResolvedValueOnce(respuesta(anthropicResponde))

    await enviar({ provider: 'anthropic' })
    expect(cuerpoDe(0).tools).toBeUndefined()
  })

  it('Google no recibe herramientas: su dialecto no esta implementado', async () => {
    // El prompt de `network-repo:context` se redacta con la misma funcion que
    // decide esto, asi que si un dia divergen, este test cae antes de que el
    // texto empiece a prometer consultas que Google no puede hacer.
    new ChatHandler(baseDeDatos(true))
    fetchSimulado.mockResolvedValueOnce(respuesta({
      candidates: [{ content: { parts: [{ text: 'Respuesta de Google.' }] } }],
    }))

    const r = await enviar({ provider: 'google' })

    expect(r.success).toBe(true)
    expect(cuerpoDe(0).tools).toBeUndefined()
    expect(fetchSimulado.mock.calls[0][0]).toContain('generativelanguage')
  })

  it('si el modelo las rechaza, reintenta sin ellas en vez de dar error', async () => {
    new ChatHandler(baseDeDatos(true))
    fetchSimulado
      .mockResolvedValueOnce(respuesta({ error: { message: 'Tools are not supported by this model' } }, 400))
      .mockResolvedValueOnce(respuesta(anthropicResponde))

    const r = await enviar({ provider: 'anthropic' })

    expect(r.success).toBe(true)
    expect(cuerpoDe(0).tools).toBeDefined()
    expect(cuerpoDe(1).tools).toBeUndefined()
  })

  it('un 400 que no es de herramientas sigue siendo un error, sin reintento', async () => {
    // Reintentar un problema de credito solo gasta otra llamada.
    new ChatHandler(baseDeDatos(true))
    fetchSimulado.mockResolvedValueOnce(
      respuesta({ error: { message: 'Your credit balance is too low' } }, 400)
    )

    const r = await enviar({ provider: 'anthropic' })

    expect(r.success).toBe(false)
    expect(r.error).toContain('credits')
    expect(fetchSimulado).toHaveBeenCalledTimes(1)
  })
})

describe('tope de vueltas', () => {
  it('corta al modelo que no para de pedir herramientas y le exige respuesta', async () => {
    new ChatHandler(baseDeDatos(true))
    fetchSimulado.mockResolvedValue(respuesta(anthropicPideHerramienta))

    const r = await enviar({ provider: 'anthropic' })

    // Cuatro vueltas con herramientas y una quinta ya sin ellas, que es la que
    // obliga a contestar en texto en lugar de encadenar otra llamada.
    expect(fetchSimulado).toHaveBeenCalledTimes(5)
    expect(cuerpoDe(4).tools).toBeUndefined()
    expect(r.data.metadata.vueltas_herramientas).toBe(4)

    // Los tool_use pendientes quedan respondidos: dejarlos sin tool_result da 400.
    const ultimo = cuerpoDe(4)
    const asistentes = ultimo.messages.filter((m: any) => m.role === 'assistant').length
    const resultados = ultimo.messages.filter(
      (m: any) => Array.isArray(m.content) && m.content[0]?.type === 'tool_result'
    ).length
    expect(asistentes).toBe(resultados)
  })
})

describe('NVIDIA en streaming, con límite por inactividad', () => {
  const termina = (texto: string) => ({
    created: 1_700_000_003,
    usage: { total_tokens: 500 },
    choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: texto } }],
  })

  it('sin herramientas pide streaming y monta la respuesta de los trozos', async () => {
    new ChatHandler(baseDeDatos(false))
    fetchSimulado.mockResolvedValueOnce(respuesta(termina('La eficiencia es BQ/(BQ+CQ²).')))

    const r = await enviar({ provider: 'nvidia' })

    expect(cuerpoDe(0)).toMatchObject({ stream: true, stream_options: { include_usage: true } })
    expect(r.data.response).toBe('La eficiencia es BQ/(BQ+CQ²).')
    expect(r.data.metadata).toMatchObject({ finish_reason: 'stop', tokens: 500 })
  })

  it('con herramientas también va en streaming (#251)', async () => {
    new ChatHandler(baseDeDatos(true))
    fetchSimulado.mockResolvedValueOnce(respuesta(openaiResponde))

    await enviar({ provider: 'nvidia' })
    expect(cuerpoDe(0)).toMatchObject({ stream: true, stream_options: { include_usage: true } })
    expect(cuerpoDe(0).tools).toBeDefined()
  })

  it('OpenAI también, con el tope que aceptan sus modelos de razonamiento (#246)', async () => {
    new ChatHandler(baseDeDatos(false))
    fetchSimulado.mockResolvedValueOnce(respuesta(termina('ok')))

    const r = await enviar({ provider: 'openai' })
    expect(cuerpoDe(0)).toMatchObject({ stream: true, max_completion_tokens: 8192 })
    expect(cuerpoDe(0)).not.toHaveProperty('max_tokens')
    expect(cuerpoDe(0)).not.toHaveProperty('temperature')
    expect(r.data.response).toBe('ok')
  })

  it('se corta si el servidor deja de mandar datos, con un mensaje que se reintenta', async () => {
    vi.useFakeTimers()
    try {
      const controlador = new AbortController()
      // El servidor manda un trozo de razonamiento y se calla.
      let primera = true
      const lector = {
        read: () => primera
          ? (primera = false, Promise.resolve({ done: false, value: new TextEncoder().encode('data: {"choices":[{"delta":{"reasoning_content":"..."}}]}\n\n') }))
          : new Promise((_, rechazar) => controlador.signal.addEventListener('abort', () => rechazar(new Error('aborted')))),
      }
      const promesa = leerRespuestaEnStreaming({ body: { getReader: () => lector } }, controlador, 90_000, 'Nvidia timed out: 90 s sin enviar nada')
      const fallo = expect(promesa).rejects.toThrow('Nvidia timed out: 90 s sin enviar nada')
      await vi.advanceTimersByTimeAsync(89_000)
      expect(controlador.signal.aborted).toBe(false)
      await vi.advanceTimersByTimeAsync(2_000)
      await fallo
    } finally {
      vi.useRealTimers()
    }
  })

  it('cada trozo que llega reinicia la espera: tardar mucho no es estar parado', async () => {
    vi.useFakeTimers()
    try {
      const controlador = new AbortController()
      const trozos = Array.from({ length: 5 }, (_, i) => `data: {"choices":[{"delta":{"content":"${i}"}}]}\n\n`)
      trozos.push('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n')
      const lector = {
        read: () => new Promise(resolver => setTimeout(() => {
          const t = trozos.shift()
          resolver(t ? { done: false, value: new TextEncoder().encode(t) } : { done: true, value: undefined })
        }, 60_000)),
      }
      const promesa = leerRespuestaEnStreaming({ body: { getReader: () => lector } }, controlador, 90_000, 'parado')
      await vi.advanceTimersByTimeAsync(7 * 60_000)
      const r = await promesa
      expect(r.choices[0]).toMatchObject({ finish_reason: 'stop', message: { content: '01234' } })
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('un corte por inactividad conserva lo que ya había llegado (#237)', () => {
  const evento = (e: unknown) => new TextEncoder().encode(`data: ${JSON.stringify(e)}\n\n`)

  /** Manda los trozos y después se calla hasta que la señal lo aborta; con `fallo`, en vez de callarse, se rompe. */
  const lectorQueSeCalla = (trozos: Uint8Array[], signal: AbortSignal, fallo?: Error) => ({
    read: () => trozos.length
      ? Promise.resolve({ done: false, value: trozos.shift() })
      : fallo
        ? Promise.reject(fallo)
        : new Promise((_, rechazar) => signal.addEventListener('abort', () => rechazar(new Error('aborted')))),
  })

  const nvidiaQueSeCalla = (trozos: Uint8Array[]) => async (_url: string, init: any) => ({
    ok: true,
    status: 200,
    json: async () => ({}),
    body: { getReader: () => lectorQueSeCalla(trozos, init.signal) },
  })

  it('con texto recibido, entrega lo parcial marcado en vez de lanzar', async () => {
    vi.useFakeTimers()
    try {
      const controlador = new AbortController()
      const lector = lectorQueSeCalla([
        evento({ model: 'nemotron', created: 1, choices: [{ delta: { content: 'El golpe de ariete ' } }] }),
        evento({ choices: [{ delta: { content: 'se calcula con la fórmula de' } }] }),
      ], controlador.signal)
      const promesa = leerRespuestaEnStreaming({ body: { getReader: () => lector } }, controlador, 90_000, 'parado')
      await vi.advanceTimersByTimeAsync(91_000)
      const r = await promesa
      expect(r.model).toBe('nemotron')
      expect(r.choices[0]).toMatchObject({
        finish_reason: FIN_POR_INACTIVIDAD,
        message: { content: 'El golpe de ariete se calcula con la fórmula de' },
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('un fallo de red a mitad sigue lanzando aunque haya texto', async () => {
    const controlador = new AbortController()
    const lector = lectorQueSeCalla([evento({ choices: [{ delta: { content: 'Medio' } }] })], controlador.signal, new Error('socket hang up'))

    await expect(leerRespuestaEnStreaming({ body: { getReader: () => lector } }, controlador, 90_000, 'parado'))
      .rejects.toThrow('socket hang up')
  })

  it('NVIDIA devuelve lo parcial con éxito, sin pedir que siga', async () => {
    vi.useFakeTimers()
    try {
      new ChatHandler(baseDeDatos(false))
      fetchSimulado.mockImplementationOnce(nvidiaQueSeCalla([
        evento({ choices: [{ delta: { content: 'Primera mitad del informe' } }] }),
      ]))

      const promesa = enviar({ provider: 'nvidia' })
      await vi.advanceTimersByTimeAsync(91_000)
      const r = await promesa

      expect(r.success).toBe(true)
      expect(r.data.response).toBe('Primera mitad del informe')
      expect(r.data.metadata.finish_reason).toBe(FIN_POR_INACTIVIDAD)
      expect(fetchSimulado).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('sin texto recibido, NVIDIA sigue devolviendo el error que el chat reintenta', async () => {
    vi.useFakeTimers()
    try {
      new ChatHandler(baseDeDatos(false))
      fetchSimulado.mockImplementationOnce(nvidiaQueSeCalla([
        evento({ choices: [{ delta: { reasoning_content: 'pienso…' } }] }),
      ]))

      const promesa = enviar({ provider: 'nvidia' })
      await vi.advanceTimersByTimeAsync(91_000)
      const r = await promesa

      expect(r.success).toBe(false)
      expect(r.error).toBe('Nvidia timed out: 90 s sin enviar nada')
    } finally {
      vi.useRealTimers()
    }
  })

  it('si la continuación se queda muda, entrega lo que ya tenía', async () => {
    vi.useFakeTimers()
    try {
      new ChatHandler(baseDeDatos(false))
      fetchSimulado
        .mockResolvedValueOnce(respuesta({
          created: 1_700_000_002,
          usage: { total_tokens: 8192 },
          choices: [{ finish_reason: 'length', message: { role: 'assistant', content: 'Primera parte' } }],
        }))
        .mockImplementationOnce(nvidiaQueSeCalla([]))

      const promesa = enviar({ provider: 'nvidia' })
      await vi.advanceTimersByTimeAsync(91_000)
      const r = await promesa

      expect(r.success).toBe(true)
      expect(r.data.response).toBe('Primera parte')
      expect(fetchSimulado).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('con red cargada el texto también sale mientras llega (#251)', () => {
  const remitente = () => {
    const enviados: string[] = []
    const sender = { isDestroyed: () => false, send: (_canal: string, d: { texto: string }) => { enviados.push(d.texto) } }
    return { enviados, event: { sender } }
  }
  const enviarEnVivo = (event: unknown, params: Record<string, unknown>) =>
    handlersRegistrados['chat:send-message'](event, {
      model: 'un-modelo',
      messages: [{ role: 'user', content: '¿como mejoro el flujo en J3?' }],
      projectId: 'p1',
      idFlujo: 'f1',
      ...params,
    })

  /** Como `respuesta`, pero cada evento tarda más que el intervalo de envío: así sale cada texto intermedio. */
  const despacio = (cuerpo: unknown) => {
    const r = respuesta(cuerpo)
    return {
      ...r,
      body: {
        getReader: () => {
          const lector = r.body.getReader()
          return { read: () => new Promise(resolver => setTimeout(() => resolver(lector.read()), 150)) }
        },
      },
    }
  }
  const hastaTerminar = async <T,>(promesa: Promise<T>) => {
    await vi.advanceTimersByTimeAsync(30_000)
    return promesa
  }

  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('NVIDIA: las vueltas de herramientas no enseñan nada y la final se ve crecer hasta la respuesta', async () => {
    new ChatHandler(baseDeDatos(true))
    fetchSimulado
      .mockResolvedValueOnce(despacio(openaiPideHerramienta))
      .mockResolvedValueOnce(despacio(openaiPideHerramienta))
      .mockResolvedValueOnce(despacio(openaiResponde))
    const { enviados, event } = remitente()

    const r = await hastaTerminar(enviarEnVivo(event, { provider: 'nvidia' }))

    expect(r.data.response).toBe('J3 esta a 8 m de cota.')
    expect([0, 1, 2].map(i => cuerpoDe(i).stream)).toEqual([true, true, true])
    expect(cuerpoDe(2).tools).toBeDefined()
    expect(enviados.length).toBeGreaterThanOrEqual(2)
    enviados.slice(1).forEach((e, i) => expect(e.startsWith(enviados[i])).toBe(true))
    expect(enviados.every(e => r.data.response.startsWith(e))).toBe(true)
    expect(enviados.at(-1)).toBe(r.data.response)
  })

  const conTexto = {
    anthropic: anthropicPideHerramienta,
    nvidia: {
      ...openaiPideHerramienta,
      choices: [{ ...openaiPideHerramienta.choices[0], message: { ...openaiPideHerramienta.choices[0].message, content: 'Voy a mirar J3.' } }],
    },
  }
  const final = { anthropic: anthropicResponde, nvidia: openaiResponde }
  const previo = { anthropic: 'Lo miro.', nvidia: 'Voy a mirar J3.' }

  it.each(['anthropic', 'nvidia'] as const)('%s: una vuelta con texto y herramienta no deja el texto suelto en pantalla', async proveedor => {
    new ChatHandler(baseDeDatos(true))
    fetchSimulado
      .mockResolvedValueOnce(despacio(conTexto[proveedor]))
      .mockResolvedValueOnce(despacio(final[proveedor]))
    const { enviados, event } = remitente()

    const r = await hastaTerminar(enviarEnVivo(event, { provider: proveedor }))

    expect(r.data.response).toBe('J3 esta a 8 m de cota.')
    // Se vio mientras llegaba, se quitó al llegar la herramienta, y lo que sigue es sólo la respuesta.
    const retirada = enviados.indexOf('')
    expect(retirada).toBeGreaterThan(0)
    expect(enviados.slice(0, retirada).every(e => previo[proveedor].startsWith(e))).toBe(true)
    const despues = enviados.slice(retirada + 1)
    expect(despues.length).toBeGreaterThan(0)
    expect(despues.every(e => r.data.response.startsWith(e))).toBe(true)
    expect(enviados.at(-1)).toBe(r.data.response)
  })

  it('dos llamadas en paralelo llegan troceadas y se ejecutan las dos, cada una con su id', async () => {
    vi.useRealTimers()
    new ChatHandler(baseDeDatos(true))
    const llamadas = [
      { id: 'call_1', type: 'function', function: { name: 'consultar_elemento', arguments: '{"id":"J3"}' } },
      { id: 'call_2', type: 'function', function: { name: 'consultar_elemento', arguments: '{"id":"J1"}' } },
    ]
    const dos = {
      ...openaiPideHerramienta,
      choices: [{ finish_reason: 'tool_calls', message: { role: 'assistant', content: null, tool_calls: llamadas } }],
    }
    fetchSimulado.mockResolvedValueOnce(respuesta(dos)).mockResolvedValueOnce(respuesta(openaiResponde))

    const r = await enviar({ provider: 'nvidia' })

    expect(r.data.response).toBe('J3 esta a 8 m de cota.')
    const mensajes: MensajeEnviado[] = cuerpoDe(1).messages
    expect(mensajes.find(m => m.role === 'assistant')?.tool_calls).toEqual(llamadas)
    const resultados = mensajes.filter(m => m.role === 'tool')
    expect(resultados.map(m => [m.tool_call_id, JSON.parse(m.content).elemento.id])).toEqual([['call_1', 'J3'], ['call_2', 'J1']])
  })

  it('si el modelo no admite streaming con herramientas, se pide sin streaming y conservándolas', async () => {
    new ChatHandler(baseDeDatos(true))
    fetchSimulado
      .mockResolvedValueOnce(respuesta({ detail: 'Streaming is not supported with tools for this model' }, 400))
      .mockResolvedValueOnce(respuesta(openaiPideHerramienta))
      .mockResolvedValueOnce(respuesta(openaiResponde))
    const { enviados, event } = remitente()

    const r = await hastaTerminar(enviarEnVivo(event, { provider: 'nvidia' }))

    expect(r.data.response).toBe('J3 esta a 8 m de cota.')
    expect(cuerpoDe(0)).toMatchObject({ stream: true })
    expect(cuerpoDe(1)).toMatchObject({ stream: false })
    expect(cuerpoDe(1).tools).toBeDefined()
    expect(cuerpoDe(2)).toMatchObject({ stream: false })
    expect(enviados).toEqual([r.data.response])
  })

  it('si el modelo rechaza las herramientas, la petición sin ellas también sale en vivo', async () => {
    new ChatHandler(baseDeDatos(true))
    fetchSimulado
      .mockResolvedValueOnce(respuesta({ detail: 'Tools are not supported by this model' }, 400))
      .mockResolvedValueOnce(despacio(openaiResponde))
    const { enviados, event } = remitente()

    const r = await hastaTerminar(enviarEnVivo(event, { provider: 'nvidia' }))

    expect(cuerpoDe(1).tools).toBeUndefined()
    expect(enviados.length).toBeGreaterThan(1)
    expect(enviados.at(-1)).toBe(r.data.response)
  })

  it('una pregunta de energía, cuya respuesta sustituye Boorie, no enseña la del modelo mientras llega', async () => {
    new ChatHandler(baseDeDatos(true))
    fetchSimulado.mockResolvedValueOnce(despacio({
      ...openaiResponde,
      choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'Ahorrarás un 23 % moviendo el bombeo a valle.' } }],
    }))
    const { enviados, event } = remitente()

    const r = await hastaTerminar(enviarEnVivo(event, {
      provider: 'nvidia',
      preguntaOriginal: '¿Cómo reduzco el consumo de energía del bombeo?',
    }))

    expect(r.data.metadata.propuesta_energia).toBeDefined()
    expect(r.data.response).not.toContain('23 %')
    expect(enviados).toEqual([])
  })
})
