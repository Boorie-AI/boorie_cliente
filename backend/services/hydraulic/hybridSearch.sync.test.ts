import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const insertar = vi.fn()

vi.mock('../milvus.service', () => ({
  MilvusService: {
    COLLECTIONS: { KNOWLEDGE: 'hydraulic_knowledge' },
    getInstance: () => ({
      ensureConnection: async () => {},
      necesitaReconstruir: () => false,
      insert: insertar,
      getClient: () => ({
        // Menos vectores que fragmentos: hay migración que hacer.
        getCollectionStatistics: async () => ({ stats: [{ key: 'row_count', value: '0' }] }),
      }),
    }),
  },
}))

import { HybridSearchService } from './hybridSearch'

const TOTAL = 6
const fragmentos = Array.from({ length: TOTAL }, (_, i) => ({
  id: `c${i}`,
  knowledgeId: 'd1',
  // Sin vector: el hueco que esta sincronización sí rellena.
  embedding: null as string | null,
  content: `contenido ${i}`,
  createdAt: new Date(),
  knowledge: { title: 'Un libro', category: 'hydraulics', projectId: null },
}))

/** Prisma que pagina por cursor, y que se atraganta con el fragmento indicado. */
function prismaFalso(idQueFalla: string, actualizados: string[]) {
  return {
    knowledgeChunk: {
      count: async () => TOTAL,
      // Sin vectores que traer de SQLite: la reconstrucción no entra en juego.
      findFirst: async () => null,
      findMany: async ({ take, cursor, skip }: any) => {
        const desde = cursor ? fragmentos.findIndex(f => f.id === cursor.id) + (skip ?? 0) : 0
        return fragmentos.slice(desde, desde + take)
      },
      update: vi.fn(async ({ where }: any) => {
        if (where.id === idQueFalla) {
          // Lo que devolvió Prisma en la base real: P1008, socket timeout.
          throw Object.assign(new Error('Socket timeout'), { code: 'P1008' })
        }
        actualizados.push(where.id)
        return {}
      }),
    },
  } as any
}

/**
 * La migración de arranque se llevaba por delante toda la base en cuanto un
 * solo fragmento fallaba al guardarse: el `update` estaba fuera del try, y el
 * P1008 salía del bucle. En una base de 102.062 fragmentos paró en 8.397 y el
 * resto se quedó con los vectores del modelo anterior —RAG mudo— sin avisar.
 */
describe('la migración de vectores al arrancar', () => {
  beforeEach(() => {
    insertar.mockReset()
    process.env.BOORIE_MODELO_EMBEDDINGS = 'bge-m3' // 1024
  })

  afterEach(() => { delete process.env.BOORIE_MODELO_EMBEDDINGS })

  /**
   * La migración la lanza el constructor, así que no se llama a mano —hacerlo
   * la ejecuta dos veces— sino que se espera a que deje de avanzar.
   */
  const migrar = async (idQueFalla: string) => {
    const actualizados: string[] = []
    const embeddingService = { generateEmbedding: async () => new Array(1024).fill(0.2) }
    new HybridSearchService(prismaFalso(idQueFalla, actualizados), embeddingService)

    let anterior = -1
    for (let espera = 0; espera < 30 && anterior !== actualizados.length; espera++) {
      anterior = actualizados.length
      await new Promise(r => setTimeout(r, 150))
    }
    return actualizados
  }

  it('sigue con los demás fragmentos cuando uno no se puede guardar', async () => {
    const actualizados = await migrar('c2')

    expect(actualizados).toEqual(['c0', 'c1', 'c3', 'c4', 'c5'])
  })

  it('el que falla no se da por indexado', async () => {
    await migrar('c2')

    const enviados = insertar.mock.calls.flatMap(([, lote]) => lote.map((f: any) => f.id))
    expect(enviados).not.toContain('c2')
    expect(enviados).toHaveLength(TOTAL - 1)
  })

  it('un fallo del almacén vectorial tampoco corta la migración', async () => {
    insertar.mockRejectedValueOnce(new Error('Milvus no responde'))

    const actualizados = await migrar('ninguno')

    expect(actualizados).toHaveLength(TOTAL)
  })
})


/**
 * Y no revectoriza por su cuenta lo que ya tiene vector de otro tamaño: eso son
 * horas de GPU en cada arranque, compiten con el reindexado que el usuario haya
 * pedido, y la interfaz promete justo lo contrario («No se hace solo»).
 */
describe('los vectores de otro modelo', () => {
  beforeEach(() => {
    insertar.mockReset()
    process.env.BOORIE_MODELO_EMBEDDINGS = 'bge-m3' // 1024
  })

  afterEach(() => { delete process.env.BOORIE_MODELO_EMBEDDINGS })

  it('no se regeneran al arrancar', async () => {
    const actualizados: string[] = []
    let vectorizados = 0
    const embeddingService = {
      generateEmbedding: async () => { vectorizados++; return new Array(1024).fill(0.2) },
    }
    const prisma = {
      knowledgeChunk: {
        count: async () => TOTAL,
        findFirst: async () => null,
        findMany: async ({ take, cursor, skip }: any) => {
          const desde = cursor ? fragmentos.findIndex(f => f.id === cursor.id) + (skip ?? 0) : 0
          // Todos con vector del modelo anterior.
          return fragmentos.slice(desde, desde + take).map(f => ({
            ...f, embedding: JSON.stringify(new Array(768).fill(0.1)),
          }))
        },
        update: vi.fn(async ({ where }: any) => { actualizados.push(where.id); return {} }),
      },
    } as any

    new HybridSearchService(prisma, embeddingService)
    let anterior = -1
    for (let espera = 0; espera < 20 && anterior !== vectorizados; espera++) {
      anterior = vectorizados
      await new Promise(r => setTimeout(r, 150))
    }

    expect(vectorizados).toBe(0)
    expect(actualizados).toEqual([])
    expect(insertar).not.toHaveBeenCalled()
  })
})
