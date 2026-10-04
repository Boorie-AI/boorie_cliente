import { describe, it, expect } from 'vitest'
import {
  limitesDe,
  limitesDeLaNube,
  limitesDelListado,
  limitesGuardados,
  metadataParaGuardar,
  CONTEXTO_UTIL_NUBE,
} from './limitesDeModelo'
import { PAREJAS, limitesDe as reexportado } from './modelosRAG'

describe('por patrón', () => {
  it.each([
    ['nvidia', PAREJAS.nvidia.principal, 131072, 16384],
    ['nvidia', PAREJAS.nvidia.auxiliar, 131072, 8192],
    ['anthropic', 'claude-3-haiku-20240307', 200000, 4096],
    ['anthropic', 'claude-3-opus-20240229', 200000, 4096],
    ['anthropic', 'claude-3-5-sonnet-20241022', 200000, 8192],
    ['anthropic', 'claude-sonnet-4-5', 200000, 8192],
    ['openai', 'gpt-5', 400000, 100000],
    ['openai', 'gpt-5-mini', 400000, 100000],
    ['openai', 'gpt-4.1', 1047576, 32768],
    ['openai', 'gpt-4o', 128000, 16384],
    ['openai', 'gpt-4o-mini', 128000, 16384],
    ['openai', 'gpt-4o-2024-05-13', 128000, 4096],
    ['openai', 'gpt-4-turbo', 128000, 4096],
    ['openai', 'gpt-4-0125-preview', 128000, 4096],
    ['openai', 'gpt-4', 8192, 2048],
    ['openai', 'gpt-4-0613', 8192, 2048],
    ['openai', 'gpt-3.5-turbo', 16385, 4096],
    ['openrouter', 'openai/gpt-4o:free', 128000, 16384],
    ['openrouter', 'anthropic/claude-3-haiku', 200000, 4096],
    ['google', 'gemini-2.5-pro', 1048576, 8192],
  ])('%s %s: ventana %i, salida %i', (proveedor, modelo, contexto, salida) => {
    const l = limitesDe(proveedor, modelo)
    expect(l).toMatchObject({ contexto, salida, fuente: 'tabla' })
  })

  it('gpt-4.1 no cae en gpt-4, que tiene una ventana de 8192', () => {
    expect(limitesDe('openai', 'gpt-4.1-mini').contexto).toBe(1047576)
  })

  it('se reexporta desde modelosRAG', () => {
    expect(reexportado).toBe(limitesDe)
  })
})

describe('el contexto útil y las esperas en la nube', () => {
  it('no pasa de 48 000 aunque la ventana sea mayor', () => {
    expect(limitesDe('nvidia', PAREJAS.nvidia.principal).contextoUtil).toBe(CONTEXTO_UTIL_NUBE)
    expect(CONTEXTO_UTIL_NUBE).toBe(48000)
  })

  it('con una ventana menor, la ventana', () => {
    expect(limitesDe('openai', 'gpt-3.5-turbo').contextoUtil).toBe(16385)
  })

  it('90 s sin recibir nada, 600 s en total y 180 s una vuelta con herramientas', () => {
    expect(limitesDe('anthropic', 'claude-3-haiku-20240307')).toMatchObject({
      inactividadMs: 90000, totalMs: 600000, totalConHerramientasMs: 180000,
    })
  })
})

describe('lo que dice la API manda', () => {
  it('sobre la tabla', () => {
    expect(limitesDe('anthropic', 'claude-3-haiku-20240307', { contexto: 200000, salida: 8192 }))
      .toMatchObject({ contexto: 200000, salida: 8192, fuente: 'api' })
  })

  it('sólo en lo que da: lo que falta sale de la tabla', () => {
    expect(limitesDe('openrouter', 'openai/gpt-4o', { contexto: 64000 }))
      .toMatchObject({ contexto: 64000, salida: 16000, fuente: 'api' })
  })

  it('un cero o un null de la API no cuenta', () => {
    expect(limitesDe('anthropic', 'claude-3-haiku-20240307', { contexto: 0, salida: Number.NaN }))
      .toMatchObject({ contexto: 200000, salida: 4096, fuente: 'tabla' })
  })
})

describe('por defecto', () => {
  it('un modelo en la nube que no se conoce pide lo de antes: 8192 de salida', () => {
    expect(limitesDe('openai', 'modelo-inventado-9000')).toMatchObject({ salida: 8192, fuente: 'defecto' })
    expect(limitesDeLaNube('nvidia/otro-modelo')).toMatchObject({ contexto: 32768, contextoUtil: 32768, salida: 8192 })
  })

  it('Ollama: la ventana de /api/show, sin tope de salida ni streaming en el proceso principal', () => {
    expect(limitesDe('Ollama', 'qwen2.5:7b', { contexto: 8192 })).toEqual({
      contexto: 8192, contextoUtil: 8192, salida: null,
      inactividadMs: null, totalMs: 120000, totalConHerramientasMs: 300000, fuente: 'api',
    })
    expect(limitesDe('ollama', 'nemotron-mini')).toMatchObject({ contexto: 4096, fuente: 'defecto' })
  })
})

describe('la salida nunca pasa de la cuarta parte de la ventana', () => {
  it('ni aunque la API diga más', () => {
    expect(limitesDe('openrouter', 'x/y', { contexto: 16000, salida: 16000 }).salida).toBe(4000)
  })
})

describe('lo que se guarda con el modelo', () => {
  it('limitesDelListado no inventa nada para OpenAI', () => {
    expect(limitesDelListado('openai', { context_window: 1 })).toBeUndefined()
  })

  it('limitesGuardados lee la metadata aunque venga serializada dos veces', () => {
    const una = JSON.stringify({ limites: { contexto: 1000, salida: 100 } })
    expect(limitesGuardados(una)).toEqual({ contexto: 1000, salida: 100 })
    expect(limitesGuardados(JSON.stringify(una))).toEqual({ contexto: 1000, salida: 100 })
    expect(limitesGuardados({ limites: { contexto: 1000 } })).toEqual({ contexto: 1000 })
    expect(limitesGuardados('no es json')).toBeUndefined()
    expect(limitesGuardados(null)).toBeUndefined()
    expect(limitesGuardados(JSON.stringify({ description: 'x' }))).toBeUndefined()
  })

  it('metadataParaGuardar serializa una sola vez y conserva los límites si quien guarda no los trae', () => {
    const anterior = JSON.stringify({ limites: { contexto: 1000, salida: 100 } })
    expect(JSON.parse(metadataParaGuardar(JSON.stringify({ description: 'x' }), anterior)!))
      .toEqual({ description: 'x', limites: { contexto: 1000, salida: 100 } })
    expect(JSON.parse(metadataParaGuardar(null, anterior)!)).toEqual({ limites: { contexto: 1000, salida: 100 } })
    expect(JSON.parse(metadataParaGuardar({ limites: { salida: 5 } }, anterior)!)).toEqual({ limites: { salida: 5 } })
    expect(metadataParaGuardar(null, null)).toBeNull()
    expect(metadataParaGuardar({ a: 1 }, null)).toBe('{"a":1}')
  })
})
