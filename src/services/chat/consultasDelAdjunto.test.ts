import { describe, it, expect, vi, afterEach } from 'vitest'
import { idiomaDelTexto, leerConsultas, consultasEnElIdiomaDelDocumento } from './consultasDelAdjunto'

afterEach(() => vi.unstubAllGlobals())

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
    documento, pregunta, idiomaDeLaApp: 'es', baseUrl: 'http://ollama', modelo: 'qwen2.5:7b', numCtx: 8192,
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

  it('si el glosario ya da seis, no se espera al modelo', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const pregunta = CASTELLANO + ' Dame la tabla de tiempos, el diámetro del pozo y los equipos de bombeo.'
    expect(await pedir(INGLES, pregunta)).toHaveLength(6)
    expect(fetch).not.toHaveBeenCalled()
  })
})
