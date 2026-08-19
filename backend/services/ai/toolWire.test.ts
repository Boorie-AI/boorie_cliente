import { describe, it, expect } from 'vitest'
import { HERRAMIENTAS } from '../hydraulic/agentTools'
import {
  esErrorDeHerramientas,
  proveedorSoportaHerramientas,
  herramientasAnthropic,
  herramientasOpenAI,
  llamadasDesdeAnthropic,
  llamadasDesdeOpenAI,
  llamadasDesdeOllama,
  mensajeResultadosAnthropic,
  mensajesResultadosOpenAI,
  textoDesdeAnthropic,
} from './toolWire'

describe('declaracion de herramientas por dialecto', () => {
  it('Anthropic las quiere con input_schema', () => {
    const [primera] = herramientasAnthropic(HERRAMIENTAS)
    expect(primera.name).toBe('consultar_elemento')
    expect(primera.input_schema.type).toBe('object')
    expect(primera.description.length).toBeGreaterThan(0)
  })

  it('OpenAI las quiere envueltas en function.parameters', () => {
    const [primera] = herramientasOpenAI(HERRAMIENTAS)
    expect(primera.type).toBe('function')
    expect(primera.function.name).toBe('consultar_elemento')
    expect(primera.function.parameters.type).toBe('object')
  })

  it('el esquema es el mismo objeto en los dos: no se duplica ni se desfasa', () => {
    expect(herramientasAnthropic(HERRAMIENTAS)[0].input_schema)
      .toEqual(herramientasOpenAI(HERRAMIENTAS)[0].function.parameters)
  })
})

describe('lectura de las llamadas que pide el modelo', () => {
  it('Anthropic: bloques tool_use dentro de content', () => {
    const llamadas = llamadasDesdeAnthropic({
      stop_reason: 'tool_use',
      content: [
        { type: 'text', text: 'Voy a mirarlo.' },
        { type: 'tool_use', id: 'toolu_01', name: 'consultar_elemento', input: { id: 'J3' } },
      ],
    })
    expect(llamadas).toEqual([{ id: 'toolu_01', nombre: 'consultar_elemento', argumentos: { id: 'J3' } }])
  })

  it('OpenAI: tool_calls con los argumentos como cadena JSON', () => {
    // La diferencia que mas facil es pasar por alto: aqui arguments es texto.
    const llamadas = llamadasDesdeOpenAI({
      choices: [{ message: { tool_calls: [
        { id: 'call_1', type: 'function', function: { name: 'listar_elementos', arguments: '{"tipo":"pipe"}' } },
      ] } }],
    })
    expect(llamadas).toEqual([{ id: 'call_1', nombre: 'listar_elementos', argumentos: { tipo: 'pipe' } }])
  })

  it('Ollama: cuelga de message y trae los argumentos ya como objeto', () => {
    // Comprobado contra un Ollama real con nemotron-mini: ni choices[] ni
    // arguments como cadena, que son las dos suposiciones faciles de arrastrar
    // desde OpenAI.
    const llamadas = llamadasDesdeOllama({
      message: {
        role: 'assistant',
        content: ' ',
        tool_calls: [
          { id: 'call_gr5yrl3m', function: { index: 0, name: 'consultar_elemento', arguments: { id: 'J3' } } },
        ],
      },
    })
    expect(llamadas).toEqual([{ id: 'call_gr5yrl3m', nombre: 'consultar_elemento', argumentos: { id: 'J3' } }])
  })

  it('Ollama sin id de llamada: se fabrica uno en vez de mandar vacio', () => {
    const llamadas = llamadasDesdeOllama({
      message: { tool_calls: [{ function: { name: 'listar_elementos', arguments: { tipo: 'pipe' } } }] },
    })
    expect(llamadas[0].id).toBe('call_0')
  })

  it('desenvuelve los argumentos que el modelo mete en otro sobre', () => {
    // nemotron-mini emite esto de forma consistente en vez de {"id":"121"}.
    // Sin deshacerlo, la herramienta responde «falta el argumento id» con el
    // modelo convencido de que lo mando.
    const llamadas = llamadasDesdeOllama({
      message: { tool_calls: [{ id: 'c', function: {
        name: 'consultar_elemento',
        arguments: { type: 'consultar_elemento', arguments: { id: '121' } },
      } }] },
    })
    expect(llamadas[0].argumentos).toEqual({ id: '121' })
  })

  it('no desenvuelve cuando «arguments» es un argumento de verdad', () => {
    // Si al lado hay datos con sustancia, el sobre no es un sobre.
    const llamadas = llamadasDesdeOllama({
      message: { tool_calls: [{ id: 'c', function: {
        name: 'x',
        arguments: { id: '121', arguments: { algo: 1 } },
      } }] },
    })
    expect(llamadas[0].argumentos).toEqual({ id: '121', arguments: { algo: 1 } })
  })

  it('una respuesta sin herramientas no produce llamadas', () => {
    expect(llamadasDesdeAnthropic({ content: [{ type: 'text', text: 'hola' }] })).toEqual([])
    expect(llamadasDesdeOpenAI({ choices: [{ message: { content: 'hola' } }] })).toEqual([])
    expect(llamadasDesdeOllama({ message: { content: 'hola' } })).toEqual([])
  })

  it('unos argumentos con JSON roto no tumban la conversacion', () => {
    // Pasa con modelos pequenos. Se entrega objeto vacio: la herramienta
    // respondera que falta el argumento y el modelo puede rectificar.
    const llamadas = llamadasDesdeOpenAI({
      choices: [{ message: { tool_calls: [
        { id: 'call_1', type: 'function', function: { name: 'consultar_elemento', arguments: '{"id": ' } },
      ] } }],
    })
    expect(llamadas[0].argumentos).toEqual({})
  })

  it('sin argumentos tampoco falla', () => {
    const llamadas = llamadasDesdeOpenAI({
      choices: [{ message: { tool_calls: [{ id: 'c', function: { name: 'x' } }] } }],
    })
    expect(llamadas[0].argumentos).toEqual({})
  })
})

describe('devolucion de resultados', () => {
  const resultados = [
    { llamada: { id: 'a', nombre: 'consultar_elemento', argumentos: {} }, salida: { encontrado: true } },
    { llamada: { id: 'b', nombre: 'listar_elementos', argumentos: {} }, salida: { total: 6 } },
  ]

  it('Anthropic: un solo mensaje de usuario con un bloque por llamada', () => {
    // Mandar un mensaje por resultado da 400.
    const mensaje = mensajeResultadosAnthropic(resultados)
    expect(mensaje.role).toBe('user')
    expect(mensaje.content).toHaveLength(2)
    expect(mensaje.content[0]).toMatchObject({ type: 'tool_result', tool_use_id: 'a' })
    expect(JSON.parse(mensaje.content[1].content)).toEqual({ total: 6 })
  })

  it('OpenAI: un mensaje role tool por llamada', () => {
    const mensajes = mensajesResultadosOpenAI(resultados)
    expect(mensajes).toHaveLength(2)
    expect(mensajes[0]).toMatchObject({ role: 'tool', tool_call_id: 'a' })
    expect(JSON.parse(mensajes[1].content)).toEqual({ total: 6 })
  })

  it('los ids vuelven tal cual: emparejarlos mal rompe la conversacion', () => {
    expect(mensajeResultadosAnthropic(resultados).content.map(b => b.tool_use_id)).toEqual(['a', 'b'])
    expect(mensajesResultadosOpenAI(resultados).map(m => m.tool_call_id)).toEqual(['a', 'b'])
  })
})

describe('texto final de Anthropic', () => {
  it('junta los bloques de texto y descarta los de herramienta', () => {
    // data.content[0].text no vale cuando el primer bloque es un tool_use.
    const texto = textoDesdeAnthropic({
      content: [
        { type: 'tool_use', id: 't', name: 'consultar_elemento', input: {} },
        { type: 'text', text: 'El nudo J3 ' },
        { type: 'text', text: 'tiene 8 m de cota.' },
      ],
    })
    expect(texto).toBe('El nudo J3 tiene 8 m de cota.')
  })

  it('sin bloques de texto devuelve cadena vacia', () => {
    expect(textoDesdeAnthropic({ content: [] })).toBe('')
    expect(textoDesdeAnthropic({})).toBe('')
  })
})

describe('deteccion del rechazo de herramientas', () => {
  it('reconoce el 400 que se queja de tools o functions', () => {
    expect(esErrorDeHerramientas(400, 'Tools are not supported for this model')).toBe(true)
    expect(esErrorDeHerramientas(404, 'No endpoints found that support tool use')).toBe(true)
    expect(esErrorDeHerramientas(422, 'function calling unavailable')).toBe(true)
  })

  it('no confunde un 400 cualquiera con uno de herramientas', () => {
    // Reintentar sin herramientas un error de credito o de clave solo gasta
    // otra llamada y devuelve el mismo fallo.
    expect(esErrorDeHerramientas(400, 'Your credit balance is too low')).toBe(false)
    expect(esErrorDeHerramientas(401, 'invalid api key')).toBe(false)
    expect(esErrorDeHerramientas(429, 'rate limited, too many tool calls')).toBe(false)
  })
})

describe('que proveedores saben usar herramientas', () => {
  it('los cinco cuyo dialecto esta implementado', () => {
    for (const p of ['anthropic', 'openai', 'openrouter', 'nvidia', 'ollama']) {
      expect(proveedorSoportaHerramientas(p), p).toBe(true)
    }
  })

  it('Google no, porque usa functionDeclarations', () => {
    // Si esto pasa a true sin implementar el dialecto, el prompt promete una
    // consulta que el modelo no puede hacer.
    expect(proveedorSoportaHerramientas('google')).toBe(false)
  })

  it('el nombre llega de la conversacion, asi que se normaliza', () => {
    expect(proveedorSoportaHerramientas('Ollama')).toBe(true)
    expect(proveedorSoportaHerramientas(' Anthropic ')).toBe(true)
  })

  it('sin proveedor no se presume soporte', () => {
    expect(proveedorSoportaHerramientas(undefined)).toBe(false)
    expect(proveedorSoportaHerramientas(null)).toBe(false)
    expect(proveedorSoportaHerramientas('')).toBe(false)
    expect(proveedorSoportaHerramientas('un-proveedor-nuevo')).toBe(false)
  })
})
