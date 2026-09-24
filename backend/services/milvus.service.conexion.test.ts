import { describe, it, expect, vi } from 'vitest'

vi.mock('@zilliz/milvus2-sdk-node', () => ({
  MilvusClient: class {
    async listCollections() { return { data: [] } }
  },
  DataType: {},
  ConsistencyLevelEnum: { Strong: 'Strong', Eventually: 'Eventually' },
}))

import { MilvusService } from './milvus.service'

describe('la conexión con Milvus', () => {
  it('no se da por conectada hasta que las colecciones están cargadas', async () => {
    // Cargar la colección de conocimiento son segundos con una base grande. Quien llegaba en ese
    // intervalo veía «conectado», consultaba una colección sin cargar y la tomaba por vacía.
    const servicio = MilvusService.getInstance()
    let terminarCarga!: () => void
    vi.spyOn(servicio as any, 'initCollections').mockImplementation(
      () => new Promise<void>(resolve => { terminarCarga = resolve })
    )

    const primera = servicio.ensureConnection()
    await vi.waitFor(() => expect(terminarCarga).toBeDefined())

    expect(servicio.isAvailable()).toBe(false)
    await expect(servicio.ensureConnection()).rejects.toThrow(/unavailable/)

    terminarCarga()
    await primera

    expect(servicio.isAvailable()).toBe(true)
    await expect(servicio.ensureConnection()).resolves.toBeUndefined()
  })
})
