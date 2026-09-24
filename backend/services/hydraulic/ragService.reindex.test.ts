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
    const embeddingService = {
      generateEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
      generateEmbeddings: vi.fn(async (t: string[]) => t.map(() => [0.1, 0.2, 0.3])),
    }
    const rag = new HydraulicRAGService(prisma, embeddingService)

    const result = await rag.reindexDocument('doc-1')

    expect(embeddingService.generateEmbeddings).toHaveBeenCalled()
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
      generateEmbeddings: vi.fn(async (t: string[]) => t.map(() => [0.1, 0.2, 0.3])),
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


/**
 * La barra de progreso sólo se dibuja cuando llega el primer aviso. Al pasar a
 * lotes de 50 fragmentos, ese primero tardaba 50 en salir —y en un documento
 * corto, uno solo al final—, así que la barra desaparecía de la interfaz.
 */
describe('los avisos de progreso', () => {
  it('el primero sale antes de vectorizar nada', async () => {
    const prisma = fakePrisma(DOC, ['viejo-1'])
    prisma.knowledgeChunk.findMany.mockResolvedValue([])
    const avisos: { current: number; total: number }[] = []
    const embeddingService = {
      generateEmbedding: vi.fn().mockResolvedValue([0.1]),
      generateEmbeddings: vi.fn(async (t: string[]) => t.map(() => [0.1])),
      generateEmbeddings: vi.fn(async (t: string[]) => {
        // Para cuando se llame, ya tiene que haber salido el primer aviso.
        expect(avisos.length).toBeGreaterThan(0)
        return t.map(() => [0.1])
      }),
    }
    const rag = new HydraulicRAGService(prisma, embeddingService)

    await rag.reindexDocument('doc-1', (p) => avisos.push({ current: p.current, total: p.total }))

    expect(avisos[0].current).toBe(0)
    expect(avisos[0].total).toBeGreaterThan(0)
  })
})


/**
 * El troceador tiene que respetar su tope siempre. No lo hacía: un párrafo
 * largo que llegaba con algo ya acumulado se asignaba entero. En la base de un
 * usuario real eso dejó fragmentos de hasta 12.106 caracteres, que al
 * vectorizar se truncaban a 1.000 —el 85 % del corpus indexado por su primer
 * cuarto— y que con un modelo de ventana corta hacen fallar el indexado entero:
 * «the input length exceeds the context length».
 */
describe('el troceado', () => {
  const trocear = (texto: string, maxChunkSize = 1000) =>
    (new HydraulicRAGService(fakePrisma(DOC), { generateEmbedding: vi.fn() }) as any)
      .chunkDocument(texto, { maxChunkSize, overlap: 150 }) as string[]

  it('ninguna pieza pasa del tope, aunque el párrafo sea enorme', () => {
    const corto = 'Una frase corta de arranque.'
    const enorme = 'palabra '.repeat(3000) // ~24.000 caracteres en un solo párrafo

    const piezas = trocear(`${corto}\n\n${enorme}`)

    expect(piezas.length).toBeGreaterThan(20)
    expect(Math.max(...piezas.map(p => p.length))).toBeLessThanOrEqual(1000)
  })

  it('un texto corto sigue saliendo de una pieza', () => {
    expect(trocear('Dos frases. Nada más.')).toEqual(['Dos frases. Nada más.'])
  })

  it('una tabla pegada sin espacios tampoco se cuela', () => {
    const sinEspacios = '1234567890'.repeat(500) // 5.000 caracteres sin un solo espacio

    const piezas = trocear(sinEspacios)

    expect(Math.max(...piezas.map(p => p.length))).toBeLessThanOrEqual(1000)
    expect(piezas.join('')).toContain('1234567890')
  })

  it('no pierde el texto por el camino', () => {
    const original = Array.from({ length: 40 }, (_, i) => `Párrafo número ${i} con su contenido.`).join('\n\n')

    const piezas = trocear(original, 200)

    for (let i = 0; i < 40; i++) {
      expect(piezas.some(p => p.includes(`Párrafo número ${i} `))).toBe(true)
    }
  })
})


/**
 * Basta un fragmento indigesto para tumbar la petición de los cincuenta —una
 * tabla de cifras cabe en caracteres y no en tokens—, y rehacerlos uno a uno
 * devuelve el ritmo a lo que era antes de agrupar: medido en una base real, de
 * 551 a 235 fragmentos/min.
 */
describe('un fragmento indigesto dentro del lote', () => {
  // Un documento que dé de sobra para más de un lote: con uno de una sola pieza
  // no hay nada que partir y la prueba no probaría nada.
  const GRANDE = {
    ...DOC,
    content: Array.from({ length: 20000 }, (_, i) => `palabra${i}`).join(' '),
  }
  const prismaConChunks = () => {
    const p = fakePrisma(GRANDE, ['viejo-1'])
    p.knowledgeChunk.findMany.mockResolvedValue([])
    return p
  }

  it('se aísla partiendo el lote, no rehaciéndolo entero', async () => {
    let indigesto = ''
    const tamanos: number[] = []
    const embeddingService = {
      generateEmbedding: vi.fn(async () => [0.1]),
      generateEmbeddings: vi.fn(async (textos: string[]) => {
        tamanos.push(textos.length)
        if (textos.some(t => t === indigesto)) throw new Error('the input length exceeds the context length')
        return textos.map(() => [0.1])
      }),
    }
    const rag = new HydraulicRAGService(prismaConChunks(), embeddingService)
    const piezas: string[] = (rag as any).chunkDocument(GRANDE.content, { maxChunkSize: 1000, overlap: 150 })
    indigesto = piezas[0]

    await rag.reindexDocument('doc-1')

    // Si se hubiera rehecho uno a uno habría tantas llamadas de tamaño 1 como
    // fragmentos del lote; partiendo por la mitad son un puñado.
    const deUnoEnUno = tamanos.filter(n => n === 1).length
    expect(deUnoEnUno).toBeLessThan(5)
    expect(tamanos.some(n => n > 1)).toBe(true)
  })

  it('al culpable se le recorta en vez de tirarlo, sin pasar por la autodetección', async () => {
    const porLaPuertaLenta = vi.fn(async () => [0.1])
    const embeddingService = {
      // Si el reintento pasara por aquí, recorrería la cadena de proveedores con
      // 60 s por intento: es lo que dejaba el reindexado parado minutos.
      generateEmbedding: porLaPuertaLenta,
      generateEmbeddings: vi.fn(async (textos: string[]) => {
        // Sólo lo acepta recortado, que es como se comporta la ventana real.
        if (textos.some(t => t.length > 400)) {
          throw new Error('the input length exceeds the context length')
        }
        return textos.map(() => [0.1])
      }),
    }
    const prisma = prismaConChunks()
    const rag = new HydraulicRAGService(prisma, embeddingService)

    const res = await rag.reindexDocument('doc-1')

    expect(res.failedCount).toBe(0)
    expect(res.chunkCount).toBeGreaterThan(0)
    expect(porLaPuertaLenta).not.toHaveBeenCalled()
  })
})
