import { describe, it, expect, vi, beforeEach } from 'vitest'

const milvus = {
  ensureConnection: vi.fn(),
  necesitaReconstruir: vi.fn(() => true),
  prepararSiVacia: vi.fn(async () => false),
  reconstruir: vi.fn(async () => {}),
}

vi.mock('../milvus.service', () => ({
  MilvusService: {
    COLLECTIONS: { KNOWLEDGE: 'hydraulic_knowledge' },
    insistir: (leer: () => Promise<unknown>) => leer(),
    getInstance: () => milvus,
  },
}))

import { reconstruirSiHaceFalta } from './hybridSearch'

const prisma = { knowledgeChunk: { findFirst: async () => ({ id: 'c1' }) } } as any

describe('la reconstrucción del arranque', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('espera a que Milvus levante en vez de rendirse al primer intento', async () => {
    // Milvus Lite se lanza a la vez: los dos primeros intentos lo encuentran todavía arrancando.
    milvus.ensureConnection
      .mockRejectedValueOnce(new Error('Milvus unavailable'))
      .mockRejectedValueOnce(new Error('Milvus unavailable (cached)'))
      .mockResolvedValue(undefined)

    await reconstruirSiHaceFalta(prisma, { esperaMs: 0 })

    expect(milvus.ensureConnection).toHaveBeenCalledTimes(3)
    expect(milvus.reconstruir).toHaveBeenCalledTimes(1)
  })

  it('si Milvus no llega a levantar, se rinde tras los intentos y no reconstruye', async () => {
    milvus.ensureConnection.mockRejectedValue(new Error('Milvus unavailable'))

    await expect(reconstruirSiHaceFalta(prisma, { intentos: 3, esperaMs: 0 })).rejects.toThrow(/unavailable/)

    expect(milvus.ensureConnection).toHaveBeenCalledTimes(3)
    expect(milvus.reconstruir).not.toHaveBeenCalled()
  })
})
