import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { DataType } from '@zilliz/milvus2-sdk-node'
import { MilvusService, conCamposFiltrables, type FilaVectorial, type FuenteDeReconstruccion } from './milvus.service'

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

describe('los campos por los que se filtra salen del JSON', () => {
  it('se copian de la metainformación, y lo que falta queda como cadena vacía', () => {
    const fila = conCamposFiltrables({ id: 'c1', metadata: { category: 'simulations', projectId: '', title: 't' } })

    expect(fila).toMatchObject({ category: 'simulations', projectId: '', region: '', language: '' })
    expect(fila.metadata.title).toBe('t')
  })
})

describe.skipIf(!hayMilvus)('MilvusService: la colección con el esquema viejo se reconstruye', () => {
  let servicio: MilvusService
  const creadas: string[] = []
  const DIM = 8

  const fila = (i: number, projectId = '', dims = DIM): FilaVectorial => ({
    id: `c${String(i).padStart(4, '0')}`,
    vector: Array.from({ length: dims }, (_, j) => (j === i % dims ? 1 : 0.01)),
    content: `fragmento ${i}`,
    metadata: { docId: 'doc-1', category: i % 2 ? 'simulations' : 'manual', projectId },
    timestamp: Date.now(),
  })

  function fuente(filas: FilaVectorial[], cortarTras?: number): FuenteDeReconstruccion {
    let lotes = 0
    return {
      total: async () => filas.length,
      lote: async (despuesDe, cuantas) => {
        if (cortarTras !== undefined && lotes++ >= cortarTras) throw new Error('se cerró la app')
        return filas.filter(f => despuesDe === null || f.id > despuesDe).slice(0, cuantas)
      },
    }
  }

  /** Una colección como las de antes: `metadata` en JSON y ningún campo escalar. */
  async function coleccionVieja(filas: FilaVectorial[], dims = DIM): Promise<string> {
    const nombre = `test_rec_${Date.now()}_${creadas.length}`
    creadas.push(nombre, MilvusService.nombreReconstruccion(nombre))
    const cliente = servicio.getClient()
    await cliente.createCollection({
      collection_name: nombre,
      fields: [
        { name: 'id', data_type: DataType.VarChar, max_length: 64, is_primary_key: true },
        { name: 'vector', data_type: DataType.FloatVector, dim: dims },
        { name: 'content', data_type: DataType.VarChar, max_length: 8192 },
        { name: 'metadata', data_type: DataType.JSON },
        { name: 'timestamp', data_type: DataType.Int64 },
      ],
    })
    await cliente.createIndex({ collection_name: nombre, field_name: 'vector', index_type: 'FLAT', metric_type: 'COSINE' })
    if (filas.length) await cliente.insert({ collection_name: nombre, data: filas as any[] })
    return nombre
  }

  async function campos(nombre: string): Promise<string[]> {
    const desc: any = await servicio.describeCollection(nombre)
    return desc.schema.fields.map((f: any) => f.name)
  }

  const existe = async (nombre: string) =>
    Boolean((await servicio.getClient().hasCollection({ collection_name: nombre })).value)

  const dimensionConfigurada = process.env.EMBEDDING_DIMENSION
  const esperaFuente = (MilvusService as any).ESPERA_FUENTE_MS

  beforeAll(async () => {
    // Una fuente que lanza se reintenta; aquí sin esperar entre intentos.
    ;(MilvusService as any).ESPERA_FUENTE_MS = 0
    // La colección nueva toma la dimensión del modelo configurado.
    process.env.EMBEDDING_DIMENSION = String(DIM)
    servicio = MilvusService.getInstance()
    await servicio.ensureConnection()
    vi.spyOn(servicio as any, 'llevaCamposFiltrables').mockImplementation(
      (n: unknown) => typeof n === 'string' && n.startsWith('test_rec_')
    )
  })

  afterAll(async () => {
    vi.restoreAllMocks()
    ;(MilvusService as any).ESPERA_FUENTE_MS = esperaFuente
    if (dimensionConfigurada === undefined) delete process.env.EMBEDDING_DIMENSION
    else process.env.EMBEDDING_DIMENSION = dimensionConfigurada
    for (const nombre of creadas) {
      try {
        await servicio.getClient().dropCollection({ collection_name: nombre })
      } catch {
        // pudo no llegar a crearse
      }
    }
  })

  it('no la carga, y la búsqueda no la toca mientras se reconstruye', async () => {
    const filas = [0, 1, 2].map(i => fila(i))
    const nombre = await coleccionVieja(filas)

    await (servicio as any).ensureCollection(nombre, DIM)

    expect(servicio.necesitaReconstruir(nombre)).toBe(true)
    const res: any = await servicio.search(nombre, filas[0].vector, 3, 'category == "manual"')
    expect(res.results).toEqual([])
  }, 60_000)

  it('la reconstruida filtra por los campos escalares y deja la vieja en su sitio', async () => {
    const filas = Array.from({ length: 1200 }, (_, i) => fila(i, i < 600 ? '' : 'proyecto-A'))
    const nombre = await coleccionVieja(filas)
    await (servicio as any).ensureCollection(nombre, DIM)

    await servicio.reconstruir(nombre, fuente(filas))

    expect(servicio.necesitaReconstruir(nombre)).toBe(false)
    expect(await existe(MilvusService.nombreReconstruccion(nombre))).toBe(false)
    expect(await campos(nombre)).toEqual(expect.arrayContaining(['category', 'projectId', 'region', 'language']))

    const res: any = await servicio.search(nombre, filas[3].vector, 50, 'projectId == "" and category == "simulations"')
    expect(res.results.length).toBeGreaterThan(0)
    for (const r of res.results) {
      expect(r.metadata.projectId).toBe('')
      expect(r.metadata.category).toBe('simulations')
    }
  }, 120_000)

  it('un corte a medias sigue por donde iba, sin repetir filas', async () => {
    const filas = Array.from({ length: 1200 }, (_, i) => fila(i))
    const nombre = await coleccionVieja(filas)
    await (servicio as any).ensureCollection(nombre, DIM)

    await expect(servicio.reconstruir(nombre, fuente(filas, 1))).rejects.toThrow(/se cerró la app/)
    expect(servicio.estadoReconstruccion(nombre)).toMatchObject({ hechas: 500, total: 1200 })

    const pedidos: Array<string | null> = []
    const reanudada = fuente(filas)
    await servicio.reconstruir(nombre, {
      ...reanudada,
      lote: (despuesDe, cuantas) => { pedidos.push(despuesDe); return reanudada.lote(despuesDe, cuantas) },
    })

    expect(pedidos[0]).toBe(filas[499].id)
    expect(await (servicio as any).contar(nombre)).toBe(1200)
  }, 120_000)

  it('lo que se indexa durante la reconstrucción no se pierde', async () => {
    const filas = [0, 1].map(i => fila(i))
    const nombre = await coleccionVieja(filas)
    await (servicio as any).ensureCollection(nombre, DIM)

    await servicio.insert(nombre, [fila(7)])
    await servicio.reconstruir(nombre, fuente(filas))

    expect(await (servicio as any).contar(nombre)).toBe(3)
  }, 60_000)

  it('si se corta entre tirar la vieja y renombrar la nueva, el arranque siguiente lo termina', async () => {
    const filas = [0, 1, 2].map(i => fila(i))
    const nombre = await coleccionVieja(filas)
    await (servicio as any).ensureCollection(nombre, DIM)
    await servicio.reconstruir(nombre, { ...fuente(filas), total: async () => 3 })
    // Se vuelve a dejar como tras el corte: la nueva sin renombrar y el apunte de que estaba completa.
    await servicio.getClient().renameCollection({ collection_name: nombre, new_collection_name: MilvusService.nombreReconstruccion(nombre) })
    ;(servicio as any).escribirEstado(nombre, { ultimoId: filas[2].id, hechas: 3, completa: true })

    await (servicio as any).rematarCambio(nombre)

    expect(await existe(nombre)).toBe(true)
    expect(await existe(MilvusService.nombreReconstruccion(nombre))).toBe(false)
    expect(await campos(nombre)).toContain('projectId')
  }, 60_000)

  it('la nueva toma la dimensión del modelo configurado, no la de la vieja', async () => {
    // Una base traída de otro equipo: la colección vieja es de 4 y SQLite guarda vectores del modelo en uso.
    const nombre = await coleccionVieja([fila(9, '', 4)], 4)
    await (servicio as any).ensureCollection(nombre, DIM)

    const filas = [0, 1, 2].map(i => fila(i))
    await servicio.reconstruir(nombre, fuente(filas))

    expect(await (servicio as any).dimensionDe(nombre)).toBe(DIM)
    expect(await (servicio as any).contar(nombre)).toBe(3)
  }, 60_000)

  it('una colección vacía con vectores en SQLite se llena por la vía rápida', async () => {
    const nombre = `test_rec_vacia_${Date.now()}`
    creadas.push(nombre, MilvusService.nombreReconstruccion(nombre))
    await (servicio as any).ensureCollection(nombre, DIM)
    expect(servicio.necesitaReconstruir(nombre)).toBe(false)

    expect(await servicio.prepararSiVacia(nombre)).toBe(true)
    const filas = Array.from({ length: 700 }, (_, i) => fila(i))
    await servicio.reconstruir(nombre, fuente(filas))

    expect(servicio.necesitaReconstruir(nombre)).toBe(false)
    expect(await (servicio as any).contar(nombre)).toBe(700)
    const res: any = await servicio.search(nombre, filas[5].vector, 5, 'category == "simulations"')
    expect(res.results.length).toBeGreaterThan(0)
  }, 60_000)

  it('una colección con filas no se toca', async () => {
    const nombre = `test_rec_llena_${Date.now()}`
    creadas.push(nombre, MilvusService.nombreReconstruccion(nombre))
    await (servicio as any).ensureCollection(nombre, DIM)
    await servicio.insert(nombre, [fila(1)])

    expect(await servicio.prepararSiVacia(nombre)).toBe(false)
    expect(servicio.necesitaReconstruir(nombre)).toBe(false)
  }, 60_000)

  it('con vectores de otro modelo el aviso avanza, y la colección queda lista para reindexar', async () => {
    // Quien actualiza con la base en bge-m3 (1024) y el modelo por defecto ya en granite (768).
    const nombre = await coleccionVieja([])
    await (servicio as any).ensureCollection(nombre, DIM)
    const filas = Array.from({ length: 700 }, (_, i) => fila(i, '', 16))
    const avisos: number[] = []
    const base = fuente(filas)

    await servicio.reconstruir(nombre, {
      ...base,
      lote: async (despuesDe, cuantas) => {
        avisos.push(servicio.estadoReconstruccion(nombre)?.hechas ?? -1)
        return base.lote(despuesDe, cuantas)
      },
    })

    expect(avisos).toEqual([0, 500, 700])
    expect(servicio.necesitaReconstruir(nombre)).toBe(false)
    expect(await (servicio as any).contar(nombre)).toBe(0)
  }, 60_000)

  it('una colección con filas sin cargar no se toma por vacía', async () => {
    // Es como está la de conocimiento mientras Milvus la carga al arrancar: la consulta no lanza,
    // devuelve la lista vacía con el error en el estado, y la reconstrucción la rehacía entera.
    const nombre = `test_rec_sin_cargar_${Date.now()}`
    creadas.push(nombre, MilvusService.nombreReconstruccion(nombre))
    await (servicio as any).ensureCollection(nombre, DIM)
    await servicio.insert(nombre, [fila(1)])
    await servicio.getClient().releaseCollection({ collection_name: nombre })

    expect(await servicio.prepararSiVacia(nombre)).toBe(false)
    expect(servicio.necesitaReconstruir(nombre)).toBe(false)
  }, 60_000)

  it('un fallo pasajero al leer de SQLite no aborta la reconstrucción', async () => {
    // El diagnóstico del Wisdom Center deja Prisma ocupado minutos con una base grande, y la lectura
    // del lote vencía su plazo (P1008): la reconstrucción se abortaba y la búsqueda quedaba apagada.
    {
      const filas = Array.from({ length: 700 }, (_, i) => fila(i))
      const nombre = await coleccionVieja([])
      await (servicio as any).ensureCollection(nombre, DIM)
      const base = fuente(filas)
      let fallos = 2

      await servicio.reconstruir(nombre, {
        ...base,
        lote: async (despuesDe, cuantas) => {
          if (despuesDe !== null && fallos-- > 0) throw new Error('Socket timeout (the database failed to respond to a query within the configured timeout).')
          return base.lote(despuesDe, cuantas)
        },
      })

      expect(servicio.necesitaReconstruir(nombre)).toBe(false)
      expect(await (servicio as any).contar(nombre)).toBe(700)
    }
  }, 60_000)

  it('una reconstrucción a medias sobre una colección con filas se retira', async () => {
    // Lo que dejó la 1.38.1 al tomar por vacía una colección que se estaba cargando.
    const nombre = `test_rec_restos_${Date.now()}`
    const nueva = MilvusService.nombreReconstruccion(nombre)
    creadas.push(nombre, nueva)
    await (servicio as any).ensureCollection(nombre, DIM)
    await servicio.insert(nombre, [fila(1)])
    await (servicio as any).crearColeccion(nueva, DIM)
    ;(servicio as any).escribirEstado(nombre, { ultimoId: 'c0100', hechas: 100, leidas: 100 })

    expect(await servicio.prepararSiVacia(nombre)).toBe(false)

    expect(await existe(nueva)).toBe(false)
    expect((servicio as any).leerEstado(nombre)).toBeNull()
    expect(await (servicio as any).contar(nombre)).toBe(1)
  }, 60_000)
})
