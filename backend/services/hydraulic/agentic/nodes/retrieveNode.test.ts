/**
 * Una búsqueda caída y una documentación que no trata la pregunta dejan lo mismo
 * en la lista: nada. El chat decía «no se encontró información relevante» cuando
 * Milvus se había cortado por tiempo, y parecía que ni se consultaba. Aquí se
 * prueba que la recuperación distingue los dos casos.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

const buscar = vi.fn()

vi.mock('../../hybridSearch', () => ({
  HybridSearchService: class {
    hybridSearch = buscar
  },
}))

vi.mock('../../../embedding.service', () => ({
  EmbeddingService: class {
    async generateEmbedding() { return [] }
  },
}))

import { RetrieveNode } from './retrieveNode'

const config = { topK: 3, minScore: 0.3, useParentChild: false } as any

const estado = () => ({
  originalQuestion: '¿qué es el índice de Todini?',
  currentQuery: '¿qué es el índice de Todini?',
  reformulatedQueries: [],
  applicableStandards: [],
  queryLanguage: 'es',
}) as any

const gestor = () => ({ updateState: vi.fn(), addError: vi.fn() }) as any

const documento = (id: string) => ({
  id,
  content: 'El índice de resiliencia de Todini mide el exceso de potencia disponible en los nudos.',
  score: 0.8,
  metadata: { title: `Resiliencia ${id}`, category: 'redes' },
})

/** Lo que hace `hybridSearch` cuando Milvus lanza: avisa y devuelve una lista vacía. */
const falla = async (_q: string, opciones: any) => {
  opciones?.alFallar?.(new Error('4 DEADLINE_EXCEEDED: Deadline exceeded after 15.001s'))
  return []
}

const estadoFinal = (g: any) => Object.assign({}, ...g.updateState.mock.calls.map((c: any[]) => c[0]))

describe('recuperación: vacío o caída', () => {
  beforeEach(() => buscar.mockReset())

  it('si las búsquedas se caen y no queda nada, lo marca como búsqueda fallida', async () => {
    buscar.mockImplementation(falla)
    const g = gestor()

    await new RetrieveNode({} as any, config).execute(estado(), g)

    expect(estadoFinal(g)).toMatchObject({ retrievedDocuments: [], busquedaFallida: true })
  })

  it('si no hay nada sin que nada falle, es un vacío de verdad', async () => {
    buscar.mockResolvedValue([])
    const g = gestor()

    await new RetrieveNode({} as any, config).execute(estado(), g)

    expect(estadoFinal(g)).toMatchObject({ retrievedDocuments: [], busquedaFallida: false })
  })

  it('si la estricta se cae no lanza la relajada ni sigue buscando', async () => {
    // La estricta ya agotó los reintentos de Milvus: la relajada se encontraría
    // el mismo Milvus y reformular sería volver a buscar en él.
    buscar.mockImplementation(falla)
    const g = gestor()

    const resultado = await new RetrieveNode({} as any, config).execute(estado(), g)

    expect(buscar).toHaveBeenCalledTimes(1)
    expect(resultado.nextNode).toBe('end')
  })

  it('con pocos resultados y sin caída, sí prueba la relajada', async () => {
    buscar.mockResolvedValueOnce([]).mockResolvedValueOnce([documento('a')])
    const g = gestor()

    const resultado = await new RetrieveNode({} as any, config).execute(estado(), g)

    expect(buscar).toHaveBeenCalledTimes(2)
    expect(estadoFinal(g).retrievedDocuments.map((d: any) => d.id)).toEqual(['a'])
    expect(resultado.nextNode).toBe('grade')
  })
})
