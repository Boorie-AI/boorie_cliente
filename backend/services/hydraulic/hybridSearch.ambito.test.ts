import { describe, it, expect, vi, beforeEach } from 'vitest'

const buscar = vi.fn()

vi.mock('../milvus.service', () => ({
  MilvusService: {
    COLLECTIONS: { KNOWLEDGE: 'hydraulic_knowledge' },
    getInstance: () => ({
      ensureConnection: async () => {},
      search: buscar,
      // El constructor arranca una sincronización; se le contesta que no hay
      // nada que sincronizar para que no interfiera con lo que se prueba.
      getClient: () => ({ getCollectionStatistics: async () => ({ stats: [{ key: 'row_count', value: '0' }] }) }),
    }),
  },
}))

import { HybridSearchService } from './hybridSearch'

const A = 'proyecto-A'
const B = 'proyecto-B'

/** Un fragmento del documento indicado, tal como lo devuelve el almacén. */
function hit(docId: string, id = `chunk-${docId}`) {
  return { id, content: `contenido de ${docId}`, score: 0.9, metadata: { docId } }
}

/**
 * Prisma que sabe de quién es cada documento. `dela` simula la consulta con el
 * filtro de ámbito: sólo devuelve los documentos cuyo dueño está permitido.
 */
function prismaFalso(duenos: Record<string, string | null>) {
  return {
    knowledgeChunk: { count: async () => 0, findMany: async () => [] },
    hydraulicKnowledge: {
      findMany: vi.fn(async ({ where }: any) => {
        const ids: string[] = where.id.in
        const permitidos = (id: string) => {
          const dueno = duenos[id] ?? null
          if (where.projectId === null) return dueno === null
          if (where.projectId?.in) return dueno !== null && where.projectId.in.includes(dueno)
          if (where.OR) {
            return where.OR.some((c: any) =>
              c.projectId === null ? dueno === null : dueno !== null && c.projectId.in.includes(dueno)
            )
          }
          return false
        }
        return ids.filter(permitidos).map(id => ({ id }))
      }),
    },
  } as any
}

describe('la ruta del agente respeta el ámbito (#39)', () => {
  beforeEach(() => buscar.mockReset())

  it('no deja pasar un documento del proyecto A a una búsqueda del proyecto B', () => {
    // Es la fuga que quedaba abierta: el Wisdom Center filtraba, pero el chat
    // usa esta ruta y no filtraba por nada.
    buscar.mockResolvedValue({ results: [hit('doc-A'), hit('doc-general')] })
    const servicio = new HybridSearchService(prismaFalso({ 'doc-A': A, 'doc-general': null }), {
      generateEmbedding: async () => [0.1, 0.2],
    })

    return servicio.hybridSearch('presiones', { ambito: 'ambos', projectId: B }).then(res => {
      expect(res.map(r => r.metadata.docId)).toEqual(['doc-general'])
    })
  })

  it('sí deja pasar lo del proyecto propio junto a lo general', async () => {
    buscar.mockResolvedValue({ results: [hit('doc-A'), hit('doc-general')] })
    const servicio = new HybridSearchService(prismaFalso({ 'doc-A': A, 'doc-general': null }), {
      generateEmbedding: async () => [0.1, 0.2],
    })

    const res = await servicio.hybridSearch('presiones', { ambito: 'ambos', projectId: A })
    expect(res.map(r => r.metadata.docId).sort()).toEqual(['doc-A', 'doc-general'])
  })

  it('sin proyecto sólo se ve lo general', async () => {
    buscar.mockResolvedValue({ results: [hit('doc-A'), hit('doc-general')] })
    const servicio = new HybridSearchService(prismaFalso({ 'doc-A': A, 'doc-general': null }), {
      generateEmbedding: async () => [0.1, 0.2],
    })

    const res = await servicio.hybridSearch('presiones')
    expect(res.map(r => r.metadata.docId)).toEqual(['doc-general'])
  })

  it('descarta el fragmento cuyo documento no se puede identificar', async () => {
    // Sin docId no hay forma de saber de quién es. Ante la duda, se ve de menos.
    buscar.mockResolvedValue({ results: [{ id: 'x', content: 'suelto', score: 0.9, metadata: {} }] })
    const servicio = new HybridSearchService(prismaFalso({}), {
      generateEmbedding: async () => [0.1, 0.2],
    })

    expect(await servicio.hybridSearch('presiones')).toEqual([])
  })
})
