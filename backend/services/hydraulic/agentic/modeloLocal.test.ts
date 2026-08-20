import { describe, it, expect, beforeEach, vi } from 'vitest'
import axios from 'axios'
import { modeloLocal, olvidarModeloLocal, _paraPruebas } from './modeloLocal'

vi.mock('axios')

const instalados = (...nombres: string[]) =>
  vi.mocked(axios.get).mockResolvedValue({ data: { models: nombres.map(name => ({ name })) } } as never)

describe('elección del modelo local', () => {
  beforeEach(() => {
    olvidarModeloLocal()
    delete process.env.OLLAMA_MODEL
    vi.clearAllMocks()
  })

  it('acepta la etiqueta distinta del mismo modelo', () => {
    // El caso que rompía: se pedía llama3.2:3b y lo instalado era llama3.2:latest.
    expect(_paraPruebas.elegir(['nomic-embed-text:latest', 'llama3.2:latest'])).toBe('llama3.2:latest')
  })

  it('prefiere el pequeño al grande, porque gradúa documento a documento', () => {
    expect(_paraPruebas.elegir(['llama3.1:8b', 'llama3.2:latest'])).toBe('llama3.2:latest')
  })

  it('coge el exacto si está', () => {
    expect(_paraPruebas.elegir(['llama3.2:latest', 'llama3.2:3b'])).toBe('llama3.2:3b')
  })

  it('nunca elige uno de embeddings ni de código', () => {
    expect(_paraPruebas.elegir(['nomic-embed-text:latest', 'codellama:latest', 'qwen2:latest'])).toBe('qwen2:latest')
  })

  it('sin nada que valga, se queda con el de siempre', () => {
    expect(_paraPruebas.elegir(['nomic-embed-text:latest'])).toBe(_paraPruebas.POR_DEFECTO)
    expect(_paraPruebas.elegir([])).toBe(_paraPruebas.POR_DEFECTO)
  })

  it('con Ollama caído no se inventa nada', async () => {
    vi.mocked(axios.get).mockRejectedValue(new Error('ECONNREFUSED'))
    expect(await modeloLocal()).toBe(_paraPruebas.POR_DEFECTO)
  })

  it('lo configurado a mano manda, aunque no esté descargado', async () => {
    process.env.OLLAMA_MODEL = 'un-modelo-mio'
    instalados('llama3.2:latest')
    expect(await modeloLocal()).toBe('un-modelo-mio')
    expect(axios.get).not.toHaveBeenCalled()
  })

  it('se pregunta una sola vez, no una por documento', async () => {
    instalados('llama3.2:latest')
    await Promise.all([modeloLocal(), modeloLocal(), modeloLocal()])
    expect(axios.get).toHaveBeenCalledTimes(1)
  })
})
