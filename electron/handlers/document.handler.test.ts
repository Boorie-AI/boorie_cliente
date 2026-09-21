import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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
// Sin esto, wisdom:getRAGHealth intenta conectar con Milvus de verdad y se va a
// los cinco segundos de reintentos contra un puerto cerrado.
vi.mock('../../backend/services/milvus.service', () => ({
  MilvusService: {
    getInstance: () => ({
      ensureConnection: async () => {},
      isAvailable: () => true,
    }),
  },
}))
vi.mock('pdf-parse', () => ({ default: vi.fn() }))
vi.mock('mammoth', () => ({ default: { extractRawText: vi.fn() } }))

// El segundo documento falla, que es lo que descolocaba el contador.
const addDocument = vi.fn(async (doc: any) => {
  if (doc.title === 'b') throw new Error('sin modelo de embeddings')
  return `id-${doc.title}`
})
vi.mock('../../backend/services/hydraulic/ragService', () => ({
  HydraulicRAGService: class {
    addDocument = (...args: any[]) => addDocument(...args)
  },
}))

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { registerVectorGraphHandlers, registerWisdomHandlers } from './document.handler'

const DOCS = [
  { id: 'd1', title: 'Norma de redes', category: 'regulations', secondaryCategories: null, region: '["MX"]', content: 'NO DEBERÍA PEDIRSE' },
  { id: 'd2', title: 'Bombeo', category: 'hydraulics', secondaryCategories: null, region: '[]', content: 'NO DEBERÍA PEDIRSE' },
]

function prismaFalso() {
  const registro = {
    documentos: null as any,
    trozos: null as any,
    rawLanzado: false,
    proveedorOpenAI: null as any,
    /** Cuántos números tiene cada vector ya guardado, para wisdom:getRAGHealth. */
    dimensionGuardada: 768 as number | null,
    /** La distribución de tamaños que devuelve SQLite, cuando el test la fija. */
    distribucion: null as { dim: number | null; n: number | bigint }[] | null,
    /** Lo que devuelve la consulta SQL de documentos sin contenido (#174). */
    sinContenido: [] as { id: string; title: string }[],
    sqlSinContenido: '' as string,
  }

  return {
    registro,
    prisma: {
      hydraulicKnowledge: {
        count: vi.fn(async () => DOCS.length),
        groupBy: vi.fn(async () => DOCS.map(d => ({ category: d.category, _count: { category: 1 } }))),
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
        count: vi.fn(async () => 40),
        findFirst: vi.fn(async () => (registro.dimensionGuardada === null
          ? null
          : { embedding: JSON.stringify(new Array(registro.dimensionGuardada).fill(0.1)) })),
      },
      aIProvider: {
        findFirst: vi.fn(async () => registro.proveedorOpenAI),
      },
      /**
       * La detección de documentos indexados sin texto se hace en SQL (#174):
       * traerse el contenido para medirlo costaba 935 MB en una base real.
       */
      $queryRawUnsafe: vi.fn(async (sql: string) => {
        // Los tamaños de los vectores se cuentan agrupando en SQL (#162); el
        // resto de consultas crudas siguen siendo la de documentos sin texto.
        if (sql.includes('json_array_length')) {
          if (registro.distribucion) return registro.distribucion
          return registro.dimensionGuardada === null
            ? []
            : [{ dim: registro.dimensionGuardada, n: 40n }]
        }
        registro.sqlSinContenido = sql
        return registro.sinContenido
      }),
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

describe('wisdom:getEmbeddingProviders', () => {
  /**
   * El desplegable ofrecía los modelos de OpenAI hubiera clave o no, y si la
   * consulta al backend fallaba la interfaz se inventaba dos de Ollama. En un
   * equipo recién instalado se podía elegir cualquiera de los cuatro y ninguno
   * podía indexar: cada subida fallaba luego en todos sus trozos (#139).
   *
   * Los modelos de Ollama dependen de lo que haya en la máquina que corre el
   * test, así que las afirmaciones se hacen sobre los de OpenAI y sobre la
   * propiedad que importa: nunca se deja elegido uno que no pueda trabajar.
   */
  const deOpenAI = (res: any) => res.providers.filter((p: any) => p.id.startsWith('openai-'))

  it('marca OpenAI como no disponible cuando no hay clave', async () => {
    delete process.env.OPENAI_API_KEY
    const falso = prismaFalso()
    registerWisdomHandlers(falso.prisma)

    const res = await handlersRegistrados['wisdom:getEmbeddingProviders']({})

    expect(res.success).toBe(true)
    expect(deOpenAI(res).length).toBeGreaterThan(0)
    expect(deOpenAI(res).every((p: any) => p.disponible === false)).toBe(true)
    expect(deOpenAI(res).every((p: any) => p.motivo === 'sinClaveOpenAI')).toBe(true)

    // Sin Ollama tampoco hay con qué indexar, y entonces no se elige nada.
    if (res.dynamicCount === 0) {
      expect(res.hayDisponible).toBe(false)
      expect(res.currentProviderId).toBe('')
    }
  })

  it('los da por disponibles cuando la clave está en la base', async () => {
    delete process.env.OPENAI_API_KEY
    const falso = prismaFalso()
    falso.registro.proveedorOpenAI = { id: 'p1', name: 'OpenAI', apiKey: 'sk-loquesea', isActive: true }
    registerWisdomHandlers(falso.prisma)

    const res = await handlersRegistrados['wisdom:getEmbeddingProviders']({})

    expect(deOpenAI(res).every((p: any) => p.disponible === true)).toBe(true)
    expect(res.hayDisponible).toBe(true)
  })

  it('nunca deja elegido un modelo que no puede indexar', async () => {
    delete process.env.OPENAI_API_KEY
    const falso = prismaFalso()
    registerWisdomHandlers(falso.prisma)

    const res = await handlersRegistrados['wisdom:getEmbeddingProviders']({})

    if (res.currentProviderId) {
      const elegido = res.providers.find((p: any) => p.id === res.currentProviderId)
      expect(elegido.disponible).toBe(true)
    }
  })
})

describe('wisdom:bulkUploadDocuments', () => {
  /**
   * El contador enseñaba `uploadedDocs.length + 1` —cuántos habían salido bien—
   * contra el total de ficheros de la carpeta. En cuanto uno fallaba se quedaba
   * atrás y repetía número, y los que no se pueden indexar engordaban el total
   * sin sumar nunca: de ahí los números que no correspondían (#138).
   */
  it('cuenta por qué documento va, aunque alguno falle', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'boorie-bulk-'))
    const ficheros = ['a.txt', 'b.txt', 'c.txt'].map((n) => {
      const ruta = path.join(dir, n)
      fs.writeFileSync(ruta, 'contenido hidráulico de prueba '.repeat(10))
      return ruta
    })
    const noIndexable = path.join(dir, 'foto.jpg')
    fs.writeFileSync(noIndexable, 'x')

    const progreso: { current: number; total: number; filename: string }[] = []
    const evento = { sender: { send: (_canal: string, datos: any) => progreso.push(datos) } }

    registerWisdomHandlers(prismaFalso().prisma)
    const res = await handlersRegistrados['wisdom:bulkUploadDocuments'](evento, {
      files: [...ficheros, noIndexable],
      mode: 'folder',
    })

    expect(res.success).toBe(true)
    expect(res.processed).toBe(2) // a y c; b falló
    expect(res.errors).toBe(1)
    expect(res.omitidos).toBe(1) // el .jpg

    // Un aviso de inicio por documento indexable, en orden y sin repetirse.
    const inicios = progreso.filter((p) => p.filename && p.current !== undefined)
    expect(inicios.map((p) => p.current)).toEqual([1, 2, 3])
    // Y el total no cuenta el fichero que nunca se iba a indexar.
    expect(inicios.every((p) => p.total === 3)).toBe(true)

    fs.rmSync(dir, { recursive: true, force: true })
  })
})

describe('wisdom:getRAGHealth', () => {
  /**
   * Buscar con un vector del tamaño equivocado no da error: Milvus contesta
   * «Success» y una lista vacía, así que cambiar de modelo de embeddings sin
   * reindexar deja el RAG mudo con toda la base indexada delante (#155). El
   * panel decía que todo estaba bien mientras no encontraba nada.
   */
  /** El registro del último doble, para poder mirar qué SQL se lanzó. */
  let ultimoRegistro: any

  const salud = async (
    dimensionGuardada: number | null,
    sinContenido: { id: string; title: string }[] = [],
    distribucion: { dim: number | null; n: number | bigint }[] | null = null,
  ) => {
    const falso = prismaFalso()
    falso.registro.dimensionGuardada = dimensionGuardada
    falso.registro.distribucion = distribucion
    falso.registro.sinContenido = sinContenido
    ultimoRegistro = falso.registro
    // getRAGHealth se registra aquí, no en registerWisdomHandlers: con el
    // registrador equivocado se llama al doble del test anterior y la prueba
    // pasa en verde sin haber ejercitado nada.
    registerVectorGraphHandlers(falso.prisma)
    return handlersRegistrados['wisdom:getRAGHealth']({})
  }

  const avisoDeDimension = (res: any) =>
    res.health.issues.find((p: string) => p.includes('reindexar'))

  afterEach(() => { delete process.env.BOORIE_MODELO_EMBEDDINGS })

  it('avisa, y en crítico, si los vectores guardados son de otro tamaño', async () => {
    process.env.BOORIE_MODELO_EMBEDDINGS = 'bge-m3' // 1024, contra los 768 guardados
    const res = await salud(768)

    expect(res.success).toBe(true)
    expect(avisoDeDimension(res)).toBeDefined()
    expect(avisoDeDimension(res)).toContain('768')
    expect(avisoDeDimension(res)).toContain('1024')
    expect(res.health.status).toBe('critical')
  })

  it('no avisa cuando el tamaño es el del modelo en uso', async () => {
    process.env.BOORIE_MODELO_EMBEDDINGS = 'nomic-embed-text' // 768, como lo guardado
    const res = await salud(768)

    expect(avisoDeDimension(res)).toBeUndefined()
  })

  it('una base sin un solo embedding no se acusa de descuadrada', async () => {
    process.env.BOORIE_MODELO_EMBEDDINGS = 'bge-m3'
    const res = await salud(null)

    expect(avisoDeDimension(res)).toBeUndefined()
  })

  /**
   * Una migración a medias es el caso que de verdad se dio: el reindexado del
   * arranque murió tras pasar 8.397 fragmentos de 102.062, y como el tamaño se
   * deducía de **un** fragmento —y el muestreado era de los ya migrados— la
   * salud salía correcta con el 92 % de la base sin poder buscarse.
   */
  it('avisa aunque el primer fragmento ya esté migrado, si quedan de los viejos', async () => {
    process.env.BOORIE_MODELO_EMBEDDINGS = 'bge-m3'
    const res = await salud(1024, [], [{ dim: 1024, n: 8412n }, { dim: 768, n: 93650n }])

    expect(avisoDeDimension(res)).toBeDefined()
    expect(res.health.metrics.embeddings.descuadrada).toBe(true)
    // El tamaño que se enseña es el del grupo que hay que rehacer, no el del
    // que ya está bien.
    expect(res.health.metrics.embeddings.dimensionGuardada).toBe(768)
    expect(res.health.status).toBe('critical')
  })

  it('cuenta cuántos fragmentos hay que rehacer, no cuántos hay', async () => {
    process.env.BOORIE_MODELO_EMBEDDINGS = 'bge-m3'
    const res = await salud(768, [], [{ dim: 1024, n: 8412n }, { dim: 768, n: 93650n }])

    expect(res.health.metrics.embeddings.descuadrados).toBe(93650)
  })

  it('con todo migrado no queda nada que avisar', async () => {
    process.env.BOORIE_MODELO_EMBEDDINGS = 'bge-m3'
    const res = await salud(1024, [], [{ dim: 1024, n: 102062n }])

    expect(avisoDeDimension(res)).toBeUndefined()
    expect(res.health.metrics.embeddings.descuadrados).toBe(0)
  })

  it('los documentos sin texto se preguntan en SQL, sin traerse el contenido', async () => {
    // Filtrarlo en JavaScript obligaba a pedir el contenido de todos: en una
    // base real, 241 MB y 935 MB de memoria en cada apertura del panel (#174).
    const res = await salud(1024, [{ id: 'd9', title: 'Escaneado sin OCR' }])

    expect(ultimoRegistro.sqlSinContenido).toContain('SELECT id, title FROM hydraulic_knowledge')
    expect(ultimoRegistro.sqlSinContenido).not.toContain('SELECT content')
    expect(res.health.metrics.sinTextoUtil).toEqual([{ id: 'd9', title: 'Escaneado sin OCR' }])
    expect(res.health.issues.join(' ')).toContain('Escaneado sin OCR')
  })

  it('sin documentos vacíos no se avisa de nada', async () => {
    const res = await salud(1024, [])

    expect(res.health.metrics.sinTextoUtil).toEqual([])
    expect(res.health.issues.join(' ')).not.toContain('sin texto aprovechable')
  })
})
