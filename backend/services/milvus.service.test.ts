import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { DataType } from '@zilliz/milvus2-sdk-node'
import { MilvusService } from './milvus.service'

/**
 * Milvus no lanza cuando rechaza una escritura: devuelve el motivo dentro de la
 * respuesta. Indexar con OpenAI (1536 dims) contra la colección que se creaba
 * fija a 768 devolvía «FieldData 'vector' float_vector data has 1536 elements,
 * expected num_rows(1) * dim(768) = 768», nadie miraba ese estado, y la búsqueda
 * con el mismo vector contestaba «Success» con cero resultados: el documento
 * quedaba listado y sin un solo vector, sin error a la vista.
 *
 * Necesita un Milvus Lite en marcha; sin él se salta.
 */
function direccionMilvus(): string | null {
  const base = process.env.BOORIE_DATA_DIR ?? path.join(process.cwd(), 'data')
  const fichero = path.join(base, 'boorie-milvus', 'port')
  if (!fs.existsSync(fichero)) return null
  const puerto = fs.readFileSync(fichero, 'utf-8').trim()
  return /^\d+$/.test(puerto) ? `127.0.0.1:${puerto}` : null
}

const hayMilvus = direccionMilvus() !== null

describe.skipIf(!hayMilvus)('MilvusService: la dimensión la ponen los vectores', () => {
  let servicio: MilvusService
  const creadas: string[] = []

  const vector = (n: number) => Array.from({ length: n }, () => Math.random())
  const fila = (id: string, dims: number) => ({
    id,
    vector: vector(dims),
    content: 'texto de prueba',
    metadata: { docId: 'doc-1' },
    timestamp: Date.now(),
  })

  /** Crea una colección a la dimensión dada, como hace el arranque. */
  async function coleccionA(dims: number): Promise<string> {
    const nombre = `test_dim_${dims}_${Date.now()}_${creadas.length}`
    creadas.push(nombre)
    await servicio.getClient().createCollection({
      collection_name: nombre,
      fields: [
        { name: 'id', data_type: DataType.VarChar, max_length: 64, is_primary_key: true },
        { name: 'vector', data_type: DataType.FloatVector, dim: dims },
        { name: 'content', data_type: DataType.VarChar, max_length: 8192 },
        { name: 'metadata', data_type: DataType.JSON },
        { name: 'timestamp', data_type: DataType.Int64 },
      ],
    })
    await servicio.getClient().createIndex({
      collection_name: nombre,
      field_name: 'vector',
      index_type: 'FLAT',
      metric_type: 'COSINE',
      params: { nlist: 1024 },
    })
    await servicio.getClient().loadCollection({ collection_name: nombre })
    return nombre
  }

  async function dimensionDe(nombre: string): Promise<number> {
    const desc: any = await servicio.describeCollection(nombre)
    const campo = desc.schema.fields.find((f: any) => f.name === 'vector')
    return Number(campo?.type_params?.find((p: any) => p.key === 'dim')?.value)
  }

  beforeAll(async () => {
    servicio = MilvusService.getInstance()
    await servicio.ensureConnection()
  })

  afterAll(async () => {
    for (const nombre of creadas) {
      try {
        await servicio.getClient().dropCollection({ collection_name: nombre })
      } catch {
        // pudo no llegar a crearse
      }
    }
  })

  it('rehace una colección vacía a la dimensión del modelo que se esté usando', async () => {
    // La instalación nueva: al arrancar se supuso 768 y se indexa con OpenAI.
    const nombre = await coleccionA(768)

    await expect(servicio.insert(nombre, [fila('c1', 1536)])).resolves.toBeDefined()
    expect(await dimensionDe(nombre)).toBe(1536)
  }, 60_000)

  it('no destruye una colección con documentos dentro al cambiar de modelo', async () => {
    const nombre = await coleccionA(768)
    await servicio.insert(nombre, [fila('c1', 768)])

    await expect(servicio.insert(nombre, [fila('c2', 1536)])).rejects.toThrow(/reindexar/)

    // Lo que ya estaba indexado sigue ahí.
    expect(await dimensionDe(nombre)).toBe(768)
  }, 60_000)

  it('un rechazo de Milvus deja de ser mudo', async () => {
    const nombre = await coleccionA(768)
    // `content` está declarado VarChar(8192): pasarse lo rechaza el servidor
    // con un estado de error, sin lanzar.
    const desbordado = { ...fila('c1', 768), content: 'x'.repeat(9000) }

    await expect(servicio.insert(nombre, [desbordado])).rejects.toThrow(/Milvus rechazó/)
  }, 60_000)
  it('una colección sin cargar se carga al buscar, en vez de devolver cero fuentes', async () => {
    // Es como queda tras reiniciar Milvus Lite: no recuerda que estaba cargada.
    const nombre = await coleccionA(768)
    const f = fila('c1', 768)
    await servicio.insert(nombre, [f])
    await servicio.getClient().releaseCollection({ collection_name: nombre })

    const res: any = await servicio.search(nombre, f.vector, 1)

    expect(res.results).toHaveLength(1)
  }, 60_000)

  it('un plazo vencido al describir la colección no la tira', async () => {
    const nombre = await coleccionA(768)
    await servicio.insert(nombre, [fila('c1', 768)])
    const cliente = servicio.getClient()
    const espia = vi.spyOn(cliente, 'describeCollection')
      .mockRejectedValueOnce(new Error('4 DEADLINE_EXCEEDED: Deadline exceeded after 15.000s'))

    await expect((servicio as any).ensureCollection(nombre, 768)).rejects.toThrow(/DEADLINE_EXCEEDED/)
    espia.mockRestore()

    expect((await cliente.hasCollection({ collection_name: nombre })).value).toBe(true)
    expect(await dimensionDe(nombre)).toBe(768)
  }, 60_000)
})
