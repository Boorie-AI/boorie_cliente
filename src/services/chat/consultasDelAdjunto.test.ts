import { describe, it, expect, vi, afterEach } from 'vitest'
import { idiomaDelTexto, leerConsultas, consultasEnElIdiomaDelDocumento, escritorDeConsultas } from './consultasDelAdjunto'

const api = () => window.electronAPI as unknown as { agenticRAG: Record<string, unknown>; nube: Record<string, unknown> }
const agenticRAGOriginal = api().agenticRAG

afterEach(() => {
  vi.unstubAllGlobals()
  api().agenticRAG = agenticRAGOriginal
})

const INGLES = 'The well loss coefficient is calculated with the data of the step drawdown test, and the production well is stable.'
const CASTELLANO = 'Deseo planificar una prueba de bombeo a caudal variable para ver la eficiencia de un pozo con fines de abastecimiento.'
const CATALA = 'Vull planificar una prova de bombament amb cabal variable per veure l\'eficiència del pou i les pèrdues amb aquest cabal.'

describe('el idioma de un texto', () => {
  it('distingue inglés, castellano y catalán', () => {
    expect(idiomaDelTexto(INGLES)).toBe('en')
    expect(idiomaDelTexto(CASTELLANO)).toBe('es')
    expect(idiomaDelTexto(CATALA)).toBe('ca')
  })

  it('en un texto corto no se juega', () => {
    expect(idiomaDelTexto('¿P-120-15?')).toBeUndefined()
  })
})

describe('las consultas que devuelve el modelo', () => {
  it('una por línea, sin viñetas ni repetidas', () => {
    expect(leerConsultas('- step drawdown test\n2. well loss coefficient\n\nStep drawdown test\n"well efficiency"'))
      .toEqual(['step drawdown test', 'well loss coefficient', 'well efficiency'])
  })

  it('lo que escribe nemotron-mini en lugar de consultas no pasa', () => {
    const respuesta = ' Sure, I can help you with that. Here are some questions related to your request: \n'
      + '1. What is the procedure for calculating pumping test data?\n'
      + '   - The required pipe diameter would be approximately 24 inches, resulting in a head loss of around 3 meters.\n'
      + '    - Discharge rate (l/s) or flow rate (cfs).'
    expect(leerConsultas(respuesta)).toEqual([])
  })

  it('como mucho ocho', () => {
    expect(leerConsultas(Array.from({ length: 12 }, (_, i) => `consulta ${i}`).join('\n'))).toHaveLength(8)
  })
})

describe('cuándo se piden', () => {
  const pedir = (documento: string, pregunta: string) => consultasEnElIdiomaDelDocumento({
    documento, pregunta, idiomaDeLaApp: 'es', escribir: escritorDeConsultas('Ollama', 'qwen2.5:7b', 8192, 'http://ollama'),
  })

  it('con pregunta y documento en el mismo idioma, no se llama al modelo', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    expect(await pedir(CASTELLANO, '¿Qué caudal de diseño tiene el pozo?')).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('en otro idioma, con el mismo num_ctx que la respuesta para no recargar el modelo', async () => {
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ message: { content: 'step drawdown test\nwell loss coefficient' } }) }))
    vi.stubGlobal('fetch', fetch)
    const consultas = await pedir(INGLES, CASTELLANO)
    // Las del glosario primero, y las del modelo sin repetirlas.
    expect(consultas.slice(0, 2)).toEqual(['step drawdown test', 'well loss coefficient'])
    expect(consultas.filter(c => c === 'step drawdown test')).toHaveLength(1)
    expect(consultas).toContain('well loss coefficient')
    const cuerpo = JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    expect(cuerpo.options.num_ctx).toBe(8192)
    expect(cuerpo.messages[0].content).toContain('escrito en inglés')
  })

  it('si el modelo falla, quedan las del glosario', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('timeout') }))
    expect(await pedir(INGLES, CASTELLANO)).toEqual(['step drawdown test', 'well loss coefficient', 'pumping test', 'pumping test design'])
  })

  it('con un modelo de NVIDIA las escribe el proceso principal: por IPC, sin clave y sin llamar a fetch (#224)', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const consultas = vi.fn(async () => ({ success: true, consultas: ['well loss coefficient units', 'Walton well loss equation'] }))
    api().agenticRAG = { ...agenticRAGOriginal, consultas }

    const resultado = await consultasEnElIdiomaDelDocumento({
      documento: INGLES, pregunta: CASTELLANO, idiomaDeLaApp: 'es',
      escribir: escritorDeConsultas('nvidia', 'nvidia/nemotron-3-ultra-550b-a55b', 48000, 'http://ollama'),
    })

    expect(consultas).toHaveBeenCalledWith({
      pregunta: CASTELLANO, idioma: 'en', proveedor: 'nvidia', modelo: 'nvidia/nemotron-3-ultra-550b-a55b',
    })
    // Sólo la pregunta, el idioma y el modelo: ni el documento ni ninguna clave.
    expect(JSON.stringify((consultas.mock.calls as unknown[][])[0])).not.toContain('step drawdown test, and the production well')
    expect(resultado).toContain('well loss coefficient units')
    expect(resultado).toContain('Walton well loss equation')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('si la nube no contesta, quedan las del glosario', async () => {
    api().agenticRAG = { ...agenticRAGOriginal, consultas: vi.fn(async () => ({ success: false, error: 'caído' })) }
    expect(await consultasEnElIdiomaDelDocumento({
      documento: INGLES, pregunta: CASTELLANO, idiomaDeLaApp: 'es',
      escribir: escritorDeConsultas('NVIDIA', 'nvidia/x', 48000, 'http://ollama'),
    })).toEqual(['step drawdown test', 'well loss coefficient', 'pumping test', 'pumping test design'])
  })

  it('con un proveedor que no las escribe, sólo el glosario', async () => {
    expect(escritorDeConsultas('Anthropic', 'claude-x', 48000, 'http://ollama')).toBeUndefined()
    expect(await consultasEnElIdiomaDelDocumento({ documento: INGLES, pregunta: CASTELLANO, idiomaDeLaApp: 'es' }))
      .toEqual(['step drawdown test', 'well loss coefficient', 'pumping test', 'pumping test design'])
  })

  it('si el glosario ya da seis, no se espera al modelo', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const pregunta = CASTELLANO + ' Dame la tabla de tiempos, el diámetro del pozo y los equipos de bombeo.'
    expect(await pedir(INGLES, pregunta)).toHaveLength(6)
    expect(fetch).not.toHaveBeenCalled()
  })
})
