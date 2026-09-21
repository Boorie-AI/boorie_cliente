import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EmbeddingService } from './embedding.service'

/**
 * Indexar mandaba un fragmento por petición HTTP, y ahí se iba el tiempo de
 * reindexar: 96 fragmentos/min uno a uno contra 199 agrupando, medido con
 * bge-m3 sobre fragmentos reales. En una base de cien mil fragmentos son horas.
 */
const vector = (n = 4) => new Array(n).fill(0.1)

function servicio(): EmbeddingService {
  const s = new EmbeddingService({} as any)
  // Con proveedor ya resuelto no hace falta la autodetección, que consulta la
  // base y a los proveedores.
  s.activeProvider = { id: 'ollama-local', model: 'bge-m3', baseUrl: 'http://ollama:11434' }
  return s
}

describe('generateEmbeddings', () => {
  beforeEach(() => vi.restoreAllMocks())
  afterEach(() => vi.unstubAllGlobals())

  it('manda todo el lote en una sola petición', async () => {
    const fetchFalso = vi.fn(async () => ({
      ok: true,
      json: async () => ({ embeddings: [vector(), vector(), vector()] }),
    }))
    vi.stubGlobal('fetch', fetchFalso)

    const salida = await servicio().generateEmbeddings(['uno', 'dos', 'tres'])

    expect(fetchFalso).toHaveBeenCalledTimes(1)
    const [url, opciones] = fetchFalso.mock.calls[0] as any[]
    expect(url).toBe('http://ollama:11434/api/embed')
    expect(JSON.parse(opciones.body).input).toEqual(['uno', 'dos', 'tres'])
    expect(salida).toHaveLength(3)
  })

  it('un lote incompleto no desalinea: se rehace uno a uno', async () => {
    // Devolver menos vectores que textos emparejaría cada fragmento con el
    // vector de otro, que es peor que no agrupar.
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ embeddings: [vector()] }),
    })))
    const s = servicio()
    const uno = vi.spyOn(s, 'generateEmbedding').mockResolvedValue(vector())

    const salida = await s.generateEmbeddings(['uno', 'dos', 'tres'])

    expect(uno).toHaveBeenCalledTimes(3)
    expect(salida).toHaveLength(3)
  })

  it('si Ollama contesta con error, se sigue uno a uno', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })))
    const s = servicio()
    const uno = vi.spyOn(s, 'generateEmbedding').mockResolvedValue(vector())

    await s.generateEmbeddings(['uno', 'dos'])

    expect(uno).toHaveBeenCalledTimes(2)
  })

  it('sin textos no llama a nadie', async () => {
    const fetchFalso = vi.fn()
    vi.stubGlobal('fetch', fetchFalso)

    expect(await servicio().generateEmbeddings([])).toEqual([])
    expect(fetchFalso).not.toHaveBeenCalled()
  })
})
