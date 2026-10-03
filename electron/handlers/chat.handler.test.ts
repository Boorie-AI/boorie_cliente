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

// Sin esto, la consulta a /api/show se llevaría la primera respuesta simulada.
vi.mock('../../backend/services/contextoDeOllama', () => ({ contextoDeOllama: async () => 8192 }))

import { ChatHandler, unirContinuacion, pedirContinuacion, leerRespuestaEnStreaming } from './chat.handler'

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
  prisma: {
    appSetting: { findUnique: async () => null },
    aIProvider: { findMany: async () => [] },
    hydraulicNetwork: {
      findFirst: async () =>
        conRed ? { id: 'n1', name: 'villa.inp', summary: '{}', networkData: JSON.stringify(RED) } : null,
    },
  },
}) as any

/** Lo que manda el servidor en streaming: el mismo cuerpo, en eventos SSE. */
function eventos(cuerpo: any): string[] {
  const eleccion = cuerpo?.choices?.[0]
  const contenido: string = eleccion?.message?.content ?? ''
  const mitad = Math.ceil(contenido.length / 2)
  return [
    { model: cuerpo?.model, created: cuerpo?.created, choices: [{ delta: { reasoning_content: 'pienso' } }] },
    ...[contenido.slice(0, mitad), contenido.slice(mitad)].filter(Boolean).map(c => ({ choices: [{ delta: { content: c } }] })),
    { choices: [{ delta: {}, finish_reason: eleccion?.finish_reason }] },
    { choices: [], usage: cuerpo?.usage },
  ].map(e => `data: ${JSON.stringify(e)}\n\n`).concat('data: [DONE]\n\n')
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
    apiKey: 'k',
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

  it('con herramientas sigue sin streaming', async () => {
    new ChatHandler(baseDeDatos(true))
    fetchSimulado.mockResolvedValueOnce(respuesta(openaiResponde))

    await enviar({ provider: 'nvidia' })
    expect(cuerpoDe(0).stream).toBe(false)
  })

  it('OpenAI no cambia: sin streaming', async () => {
    new ChatHandler(baseDeDatos(false))
    fetchSimulado.mockResolvedValueOnce(respuesta(termina('ok')))

    await enviar({ provider: 'openai' })
    expect(cuerpoDe(0).stream).toBe(false)
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
