/**
 * La especificación pide dos Nemotron fijos, uno por papel, invisibles para el
 * usuario (#49). Aquí se prueba lo que puede desviarse de eso sin que nadie se
 * dé cuenta: que el papel elija el modelo equivocado, que la falta de un modelo
 * se convierta en un fallo mudo, y que el desplegable vuelva a aparecer solo.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import axios from 'axios'
import {
  PAREJAS,
  backendRAG,
  estadoModelosRAG,
  llamarModeloRAG,
  olvidarModelosRAG,
  resolverModeloRAG,
  selectorModeloVisible,
} from './modelosRAG'

vi.mock('axios')

const instalados = (...nombres: string[]) =>
  vi.mocked(axios.get).mockResolvedValue({ data: { models: nombres.map(name => ({ name })) } } as never)

const peticion = { prompt: 'hola', temperatura: 0.3, maxTokens: 100, timeoutMs: 1000 }

const localPorDefecto = { ...PAREJAS.ollama }

/**
 * La pareja local es hoy el mismo modelo en los dos papeles, porque el grande
 * no es servible por CPU. Para probar el reparto y la degradación hace falta una
 * pareja distinta: es la que habrá en cuanto haya hardware, y la lógica tiene
 * que seguir en pie cuando llegue.
 */
const conParejaDistinta = () => {
  PAREJAS.ollama.principal = 'nemotron-3-nano'
  PAREJAS.ollama.auxiliar = 'nemotron-mini'
}

describe('modelos de la ruta del RAG', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    olvidarModelosRAG()
    delete process.env.BOORIE_RAG_BACKEND
    delete process.env.BOORIE_RAG_MODELO_PRINCIPAL
    delete process.env.BOORIE_RAG_MODELO_AUXILIAR
    delete process.env.BOORIE_SELECTOR_MODELO
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    PAREJAS.ollama = { ...localPorDefecto }
  })

  it('los dos papeles los atiende un Nemotron', async () => {
    instalados('nemotron-mini:latest', 'llama3.2:latest')

    expect((await resolverModeloRAG('principal')).modelo).toBe('nemotron-mini:latest')
    expect((await resolverModeloRAG('auxiliar')).modelo).toBe('nemotron-mini:latest')
  })

  it('con pareja distinta, el grande redacta y el pequeño gradúa, no al revés', async () => {
    conParejaDistinta()
    instalados('nemotron-3-nano:latest', 'nemotron-mini:latest', 'llama3.2:latest')

    expect((await resolverModeloRAG('principal')).modelo).toBe('nemotron-3-nano:latest')
    expect((await resolverModeloRAG('auxiliar')).modelo).toBe('nemotron-mini:latest')
  })

  it('no se cuela nada que no sea Nemotron aunque esté instalado', async () => {
    // Antes se elegía por una lista que empezaba por llama3.2, phi3 y mistral.
    instalados('llama3.2:latest', 'phi3:latest', 'mistral:latest')

    const principal = await resolverModeloRAG('principal')
    expect(principal.modelo).toContain('nemotron')
    expect(principal.motivo).toMatch(/no está instalado/)
  })

  it('sin el principal responde el auxiliar, y se dice', async () => {
    conParejaDistinta()
    instalados('nemotron-mini:latest')

    const resuelto = await resolverModeloRAG('principal')
    expect(resuelto.modelo).toBe('nemotron-mini:latest')
    expect(resuelto.rolEfectivo).toBe('auxiliar')
    expect(resuelto.degradado).toBe(true)
    expect(resuelto.motivo).toBeTruthy()
  })

  it('la degradación no va en el otro sentido: graduar con el grande son minutos', async () => {
    conParejaDistinta()
    instalados('nemotron-3-nano:latest')

    const resuelto = await resolverModeloRAG('auxiliar')
    expect(resuelto.modelo).not.toBe('nemotron-3-nano:latest')
    expect(resuelto.degradado).toBe(false)
  })

  it('con Ollama caído no se degrada a un modelo que tampoco está', async () => {
    // Degradar aquí sólo duplicaría la espera de cada documento.
    vi.mocked(axios.get).mockRejectedValue(new Error('ECONNREFUSED'))

    const resuelto = await resolverModeloRAG('principal')
    expect(resuelto.modelo).toBe(PAREJAS.ollama.principal)
    expect(resuelto.degradado).toBe(false)
  })

  it('se pregunta el inventario una vez, no una por documento', async () => {
    instalados('nemotron-mini:latest')
    await Promise.all([
      resolverModeloRAG('auxiliar'),
      resolverModeloRAG('auxiliar'),
      resolverModeloRAG('principal'),
    ])

    expect(axios.get).toHaveBeenCalledTimes(1)
  })

  it('lo configurado a mano manda, aunque no esté descargado', async () => {
    process.env.BOORIE_RAG_MODELO_PRINCIPAL = 'un-nemotron-mio'
    instalados('nemotron-mini:latest')

    expect((await resolverModeloRAG('principal')).modelo).toBe('un-nemotron-mio')
    expect(axios.get).not.toHaveBeenCalled()
  })

  it('si el principal falla al responder, contesta el auxiliar en vez de nadie', async () => {
    conParejaDistinta()
    instalados('nemotron-3-nano:latest', 'nemotron-mini:latest')
    vi.mocked(axios.post)
      .mockRejectedValueOnce(new Error('500 Internal Server Error'))
      .mockResolvedValueOnce({ data: { response: 'respuesta del auxiliar' } } as never)

    expect(await llamarModeloRAG({ ...peticion, rol: 'principal' })).toBe('respuesta del auxiliar')

    const [, cuerpo] = vi.mocked(axios.post).mock.calls[1] as [string, any]
    expect(cuerpo.model).toBe('nemotron-mini:latest')
    expect((await estadoModelosRAG()).degradado).toBe(true)
  })

  it('el tope va con el nombre que Ollama entiende', async () => {
    instalados('nemotron-mini:latest')
    vi.mocked(axios.post).mockResolvedValue({ data: { response: '{}' } } as never)

    await llamarModeloRAG({ ...peticion, rol: 'auxiliar', maxTokens: 200 })

    const [url, cuerpo] = vi.mocked(axios.post).mock.calls[0] as [string, any]
    expect(url).toContain('/api/generate')
    expect(cuerpo.options.num_predict).toBe(200)
    expect(cuerpo.options.max_tokens).toBeUndefined()
  })

  it('con el backend de NVIDIA se habla su API y con su pareja', async () => {
    process.env.BOORIE_RAG_BACKEND = 'nvidia'
    vi.mocked(axios.post).mockResolvedValue(
      { data: { choices: [{ message: { content: 'respuesta' } }] } } as never,
    )

    expect(backendRAG()).toBe('nvidia')
    expect(await llamarModeloRAG({ ...peticion, rol: 'principal' })).toBe('respuesta')

    const [url, cuerpo] = vi.mocked(axios.post).mock.calls[0] as [string, any]
    expect(url).toContain('/chat/completions')
    expect(cuerpo.model).toBe('nvidia/llama-3.1-nemotron-ultra-253b-v1')
    // Y no se pregunta a Ollama por un inventario que no pinta nada aquí.
    expect(axios.get).not.toHaveBeenCalled()
  })

  it('el desplegable de modelos está oculto salvo que se pida a mano', () => {
    expect(selectorModeloVisible()).toBe(false)

    process.env.BOORIE_SELECTOR_MODELO = '1'
    expect(selectorModeloVisible()).toBe(true)
  })
})
