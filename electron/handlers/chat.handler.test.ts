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

import { ChatHandler } from './chat.handler'

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

const respuesta = (cuerpo: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => cuerpo,
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
