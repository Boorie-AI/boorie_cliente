import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Pintar el grafo del RAG se llevaba por delante la ventana con más de cien
 * documentos (issue #139): la consulta traía el texto completo de cada documento
 * y, con él, el embedding de cada trozo —unos 15 KB por trozo— para después usar
 * sólo dos números y el texto de los tres primeros. Estos tests fijan que lo que
 * se pide a la base sea lo que se dibuja.
 */

const handlersRegistrados: Record<string, (evento: unknown, params?: any) => Promise<any>> = {}

vi.mock('electron', () => ({
  ipcMain: {
    handle: (canal: string, fn: any) => { handlersRegistrados[canal] = fn },
    removeAllListeners: () => {},
  },
  dialog: { showOpenDialog: vi.fn() },
  app: { getPath: () => '/tmp' },
  BrowserWindow: class {},
}))
vi.mock('pdf-parse', () => ({ default: vi.fn() }))
vi.mock('mammoth', () => ({ default: { extractRawText: vi.fn() } }))

import { registerVectorGraphHandlers, registerWisdomHandlers } from './document.handler'

const DOCS = [
  { id: 'd1', title: 'Norma de redes', category: 'regulations', secondaryCategories: null, region: '["MX"]', content: 'NO DEBERÍA PEDIRSE' },
  { id: 'd2', title: 'Bombeo', category: 'hydraulics', secondaryCategories: null, region: '[]', content: 'NO DEBERÍA PEDIRSE' },
]

function prismaFalso() {
  const registro = { documentos: null as any, trozos: null as any, rawLanzado: false }

  return {
    registro,
    prisma: {
      hydraulicKnowledge: {
        findMany: vi.fn(async (args: any) => {
          registro.documentos = args
          return DOCS.map((d) => {
            const fila: any = {}
            for (const campo of Object.keys(args.select ?? {})) fila[campo] = (d as any)[campo]
            return fila
          })
        }),
      },
      knowledgeChunk: {
        findMany: vi.fn(async (args: any) => {
          registro.trozos = args
          return [
            { id: 'c1', knowledgeId: 'd1', chunkIndex: 0, content: 'uno' },
            { id: 'c2', knowledgeId: 'd1', chunkIndex: 1, content: 'dos' },
          ]
        }),
      },
      $queryRaw: vi.fn(async () => {
        registro.rawLanzado = true
        // COUNT/SUM llegan como BigInt desde SQLite.
        return [{ knowledgeId: 'd1', total: 40n, caracteres: 4000n, conEmbedding: 30n }]
      }),
    } as any,
  }
}

describe('wisdom:getVectorGraph', () => {
  let falso: ReturnType<typeof prismaFalso>

  beforeEach(() => {
    falso = prismaFalso()
    registerVectorGraphHandlers(falso.prisma)
  })

  it('no pide ni el texto del documento ni el embedding de los trozos', async () => {
    const res = await handlersRegistrados['wisdom:getVectorGraph']({})
    expect(res.success).toBe(true)

    const pedidoDocs = falso.registro.documentos
    expect(pedidoDocs.select).toBeDefined()
    expect(pedidoDocs.select.content).toBeUndefined()
    expect(pedidoDocs.include).toBeUndefined()

    const pedidoTrozos = falso.registro.trozos
    expect(pedidoTrozos.select.embedding).toBeUndefined()
    expect(pedidoTrozos.select.content).toBe(true)

    // Los recuentos salen de un agregado en SQL, no de contar filas traídas.
    expect(falso.registro.rawLanzado).toBe(true)
  })

  it('cuenta trozos y tamaños con el agregado, no con las filas', async () => {
    const { graph } = await handlersRegistrados['wisdom:getVectorGraph']({})

    const d1 = graph.nodes.find((n: any) => n.id === 'doc-d1')
    expect(d1.chunks).toBe(40)

    const d2 = graph.nodes.find((n: any) => n.id === 'doc-d2')
    expect(d2.chunks).toBe(0)

    expect(graph.statistics.totalChunks).toBe(40)
    expect(graph.statistics.categoryStats.regulations.totalChunks).toBe(40)
    // 4000 caracteres entre 40 trozos.
    expect(graph.statistics.categoryStats.regulations.avgChunkSize).toBe(100)

    // Sólo se dibujan los trozos de muestra que devolvió la consulta.
    expect(graph.nodes.filter((n: any) => n.type === 'chunk')).toHaveLength(2)
  })
})

describe('wisdom:getVectorClusters', () => {
  it('tampoco trae el texto de los documentos', async () => {
    const falso = prismaFalso()
    registerVectorGraphHandlers(falso.prisma)

    const res = await handlersRegistrados['wisdom:getVectorClusters']({})
    expect(res.success).toBe(true)
    expect(falso.registro.documentos.select.content).toBeUndefined()
    expect(falso.registro.documentos.include).toBeUndefined()

    const regulations = res.clusters.find((c: any) => c.id === 'regulations')
    expect(regulations.chunkCount).toBe(40)
    expect(regulations.avgChunkSize).toBe(100)
  })
})

describe('wisdom:list', () => {
  it('no carga el embedding de cada trozo para contarlos', async () => {
    const falso = prismaFalso()
    registerWisdomHandlers(falso.prisma)

    const res = await handlersRegistrados['wisdom:list']({}, {})
    expect(res.success).toBe(true)

    // Ni los trozos ni el texto del documento: la lista enseña título y estado.
    expect(falso.registro.documentos.include).toBeUndefined()
    expect(falso.registro.documentos.select.content).toBeUndefined()
    expect(falso.registro.rawLanzado).toBe(true)

    const d1 = res.documents.find((d: any) => d.id === 'd1')
    expect(d1.indexing).toMatchObject({
      totalChunks: 40,
      chunksWithEmbeddings: 30,
      isIndexed: true,
      indexingComplete: false,
      status: 'partial',
    })

    const d2 = res.documents.find((d: any) => d.id === 'd2')
    expect(d2.indexing).toMatchObject({ totalChunks: 0, isIndexed: false, status: 'not_indexed' })
  })
})
