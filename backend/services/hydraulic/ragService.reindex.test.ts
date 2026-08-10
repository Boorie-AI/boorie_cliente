import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HydraulicRAGService } from './ragService'

// Milvus se importa dinámicamente dentro de reindexDocument; lo mockeamos para
// que el test sea rápido y determinista (el servicio real reintenta 7,5 s).
const milvusMock = {
  ensureConnection: vi.fn(),
  delete: vi.fn(),
  insert: vi.fn(),
}
vi.mock('../milvus.service', () => ({
  MilvusService: { getInstance: () => milvusMock },
}))

/**
 * El reindexado antiguo borraba los chunks y no recreaba nada: devolvía éxito y
 * el documento quedaba "Not Indexed" para siempre. Estos tests fijan las dos
 * propiedades que impiden que eso vuelva a pasar.
 */
function fakePrisma(doc: any, chunkIds: string[] = ['c1']) {
  return {
    hydraulicKnowledge: {
      findUnique: vi.fn().mockResolvedValue(
        doc ? { ...doc, chunks: chunkIds.map((id) => ({ id })) } : null
      ),
      update: vi.fn(),
    },
    knowledgeChunk: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi.fn().mockResolvedValue([]),
  } as any
}

const DOC = { id: 'doc-1', title: 'Redes de distribución', category: 'hydraulics', content: 'x '.repeat(400) }

describe('reindexDocument', () => {
  beforeEach(() => {
    milvusMock.ensureConnection.mockReset().mockResolvedValue(undefined)
    milvusMock.delete.mockReset().mockResolvedValue(undefined)
    milvusMock.insert.mockReset().mockResolvedValue(undefined)
  })

  it('genera los embeddings, sustituye los chunks e inserta en Milvus', async () => {
    const prisma = fakePrisma(DOC, ['viejo-1'])
    prisma.knowledgeChunk.findMany.mockResolvedValue([
      { id: 'nuevo-1', content: 'x', embedding: '[0.1,0.2,0.3]' },
    ])
    const embeddingService = { generateEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]) }
    const rag = new HydraulicRAGService(prisma, embeddingService)

    const result = await rag.reindexDocument('doc-1')

    expect(embeddingService.generateEmbedding).toHaveBeenCalled()
    expect(result.chunkCount).toBeGreaterThan(0)
    expect(result.failedCount).toBe(0)
    // Un solo $transaction con el borrado y la creación: nunca queda a medias
    expect(prisma.$transaction).toHaveBeenCalledOnce()
    // Los vectores viejos se retiran y los nuevos se insertan
    expect(milvusMock.delete).toHaveBeenCalledWith('hydraulic_knowledge', ['viejo-1'])
    expect(milvusMock.insert).toHaveBeenCalledOnce()
    expect(result.milvusSynced).toBe(true)
  })

  it('deja los chunks escritos aunque Milvus no esté disponible', async () => {
    milvusMock.ensureConnection.mockRejectedValue(new Error('Milvus unavailable'))
    const prisma = fakePrisma(DOC)
    const rag = new HydraulicRAGService(prisma, {
      generateEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    })

    const result = await rag.reindexDocument('doc-1')

    expect(prisma.$transaction).toHaveBeenCalledOnce()
    expect(result.chunkCount).toBeGreaterThan(0)
    expect(result.milvusSynced).toBe(false)
  })

  it('no toca los chunks existentes si el proveedor de embeddings falla', async () => {
    const prisma = fakePrisma(DOC)
    const embeddingService = {
      generateEmbedding: vi.fn().mockRejectedValue(new Error('Ollama unreachable')),
    }
    const rag = new HydraulicRAGService(prisma, embeddingService)

    await expect(rag.reindexDocument('doc-1')).rejects.toThrow(/embedding provider/i)

    // Lo esencial: nada se ha borrado. El documento sigue indexado como estaba.
    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(prisma.knowledgeChunk.deleteMany).not.toHaveBeenCalled()
  })

  it('rechaza reindexar un documento sin texto almacenado', async () => {
    const prisma = fakePrisma({ ...DOC, content: '   ' })
    const rag = new HydraulicRAGService(prisma, { generateEmbedding: vi.fn() })

    await expect(rag.reindexDocument('doc-1')).rejects.toThrow(/no conserva su texto/i)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('falla si el documento no existe', async () => {
    const prisma = fakePrisma(null)
    const rag = new HydraulicRAGService(prisma, { generateEmbedding: vi.fn() })

    await expect(rag.reindexDocument('nope')).rejects.toThrow(/not found/i)
  })
})
