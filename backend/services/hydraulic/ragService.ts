import { PrismaClient } from '@prisma/client'
import { HydraulicDocument } from '../../../src/types/hydraulic'
import { EmbeddingService } from '../embedding.service'
import { duenoVectorial, duenosPermitidos, filtroPrisma, filtroVectorial, origenDe, type Ambito, type Origen } from './ambitos'
import { corpusDe, filtroDeCorpus, repartirPorCorpus, sinRepetidos, unirFiltros, type Corpus } from './repartoDeCorpus'
import { leerTolerando } from '../lecturaTolerante'
import { CLAVE_MODELO_INDEXADO, marcaDeFragmento, modeloEmbeddingsOllama } from '../modeloEmbeddings'

export interface RAGSearchOptions {
  category?: 'hydraulics' | 'regulations' | 'best-practices'
  region?: string
  language?: string
  limit?: number
  /** Puntuación mínima. Por defecto ninguna; ver `search` (#163). */
  minScore?: number
  /** Dónde buscar (#39). Por defecto, sólo lo general. */
  ambito?: Ambito
  /** Proyecto activo. Sin él no hay ámbito de proyecto posible. */
  projectId?: string | null
}

export interface RAGSearchResult {
  document: HydraulicDocument
  /** Si la cita viene de una norma general o de un documento interno del proyecto. */
  origen?: Origen
  score: number
  relevantChunks: string[]
  highlights: string[]
}

export class HydraulicRAGService {
  private prisma: PrismaClient
  private embeddingService: any

  constructor(prisma: PrismaClient, embeddingService?: any) {
    this.prisma = prisma
    this.embeddingService = embeddingService || new EmbeddingService(prisma)
  }

  // Search hydraulic knowledge base
  async search(
    query: string,
    options: RAGSearchOptions = {}
  ): Promise<RAGSearchResult[]> {
    /**
     * Sin puntuación mínima (#163).
     *
     * El 0,6 de antes venía de `nomic-embed-text`. Con `bge-m3` no lo alcanza
     * ningún acierto bueno: los fragmentos que responden de verdad a «¿cómo se
     * estima la evapotranspiración potencial?» —métodos de PET, páginas 71 y
     * 78— puntúan entre 0,385 y 0,426, así que el filtro dejaba la búsqueda
     * muda con la documentación indexada delante.
     *
     * Y no se sustituye por otro número: el valor absoluto no ordena por
     * pertinencia. Medido sobre esta misma base, «receta de tortilla de
     * patatas» saca 0,64 contra el libro y «hipótesis del hidrograma unitario»
     * —cuya mejor respuesta es literalmente «List the assumptions involved in
     * the unit hydrograph theory»— saca 0,361. Lo que sí ordena es el puesto
     * dentro de una misma consulta, que es con lo que nos quedamos. El umbral
     * sigue disponible para quien lo pida a sabiendas.
     */
    const {
      limit = 5,
      minScore = 0,
      ambito = 'general',
      projectId = null,
    } = options

    const permitidos = duenosPermitidos(ambito, projectId)

    try {
      const milvusService = (await import('../milvus.service')).MilvusService.getInstance()

      // Generate embedding for query
      const queryEmbedding = await this.embeddingService.generateEmbedding(query)

      /**
       * Se pregunta a cada corpus por separado y luego se reparten las plazas
       * (#158). Con una sola búsqueda, los informes de simulación —362 de 817
       * fragmentos, y en castellano— se llevaban todos los candidatos de una
       * pregunta en castellano y la documentación no llegaba a aparecer.
       *
       * El ámbito sigue filtrándose aquí, y sigue sin ser la garantía: la
       * última palabra la tiene la consulta a la base, más abajo.
       */
      const ambitoVectorial = filtroVectorial(permitidos)
      const porCorpus = await Promise.all(
        (['documental', 'simulacion'] as Corpus[]).map(corpus =>
          milvusService.search(
            'hydraulic_knowledge',
            queryEmbedding,
            limit * 3,
            unirFiltros(ambitoVectorial, filtroDeCorpus(corpus))
          )
        )
      )

      const candidatos = sinRepetidos(
        porCorpus.flatMap(res => res?.results ?? [])
      ).sort((a: any, b: any) => b.score - a.score)

      if (candidatos.length === 0) {
        return []
      }

      const searchRes = { results: candidatos }

      // Group chunks by Document ID
      const docMap = new Map<string, { docId: string, chunks: any[], maxScore: number }>()

      for (const hit of searchRes.results) {
        if (hit.score < minScore) continue;

        const docId = hit.metadata?.docId
        if (!docId) continue

        if (!docMap.has(docId)) {
          docMap.set(docId, { docId, chunks: [], maxScore: 0 })
        }

        const entry = docMap.get(docId)!
        entry.chunks.push(hit)
        if (hit.score > entry.maxScore) entry.maxScore = hit.score
      }

      // Fetch full documents from Prisma
      const docIds = Array.from(docMap.keys())
      if (docIds.length === 0) return []

      /**
       * Aquí se garantiza la confidencialidad, y no en el filtro del almacén
       * vectorial (#39).
       *
       * El almacén puede ignorar el filtro, devolver de más o quedarse mudo, y
       * su modo de fallo es silencioso. La base de datos es la autoridad sobre
       * de quién es cada documento: si un fragmento ajeno se cuela en la
       * búsqueda, su documento no llega a materializarse y no hay nada que
       * enseñar.
       */
      /**
       * Tolerante a un documento ilegible (#174). Sin esto, un solo documento
       * con texto que no es UTF-8 válido tumba la búsqueda entera: el usuario
       * no recibe ningún resultado, ni siquiera de los documentos sanos que sí
       * habían salido del almacén vectorial.
       */
      const { documentos: documents, ilegibles } = await leerTolerando<any>(
        () => this.prisma.hydraulicKnowledge.findMany({
          where: { id: { in: docIds }, ...filtroPrisma(permitidos) }
        }),
        () => this.prisma.hydraulicKnowledge.findMany({
          where: { id: { in: docIds }, ...filtroPrisma(permitidos) },
          select: { id: true, title: true },
        }),
        (id) => this.prisma.hydraulicKnowledge.findUnique({ where: { id } }),
      )
      if (ilegibles.length > 0) {
        console.warn(`[RAG Service] ${ilegibles.length} documento(s) ilegibles quedaron fuera de la búsqueda:`,
          ilegibles.map(d => d.title).join(', '))
      }

      const results: RAGSearchResult[] = []

      for (const doc of documents) {
        const entry = docMap.get(doc.id)
        if (!entry) continue

        const relevantChunks = entry.chunks.map(c => c.content)
        const highlights = this.generateHighlights(query, relevantChunks)

        // Parse metadata
        let metadata: any = {}
        try {
          metadata = JSON.parse(doc.metadata)
        } catch {
          // metadata stays empty
        }

        results.push({
          origen: origenDe(doc.projectId),
          document: {
            id: doc.id,
            category: doc.category as any,
            subcategory: doc.subcategory,
            region: doc.region ? JSON.parse(doc.region) : [],
            title: doc.title,
            content: doc.content,
            metadata: {
              ...metadata,
              keywords: doc.keywords ? JSON.parse(doc.keywords) : [],
              language: doc.language
            },
            lastUpdated: doc.updatedAt,
            version: doc.version
          },
          score: entry.maxScore,
          relevantChunks,
          highlights
        })
      }

      // Sort
      results.sort((a, b) => b.score - a.score)

      /**
       * El reparto se hace aquí, sobre documentos y con el límite de verdad
       * (#158): es lo que se devuelve, y hacerlo antes sobre los candidatos no
       * servía de nada porque caben todos y la cuota no llegaba a aplicarse.
       *
       * Sin esto, una pregunta documental dentro de un proyecto se llevaba seis
       * informes de simulación y cero documentación: los informes puntúan más
       * alto —0,576 frente a 0,361 del manual para «hipótesis del hidrograma
       * unitario»— porque están escritos en el idioma de la pregunta.
       */
      return repartirPorCorpus(results, limit, r => corpusDe(r.document.category))

    } catch (error) {
      console.error('RAG search error:', error)
      throw new Error('Failed to search hydraulic knowledge base')
    }
  }

  /**
   * Trocea un texto y genera los embeddings de cada trozo. Es la única ruta
   * que produce chunks indexados, y la comparten la subida de documentos y el
   * reindexado: antes el reindexado sólo borraba chunks y nadie los recreaba,
   * así que un documento reindexado se quedaba "Not Indexed" para siempre.
   */
  private async buildIndexedChunks(
    content: string,
    onProgress?: (progress: { current: number; total: number; message: string }) => void
  ): Promise<{
    chunks: { content: string; embedding: number[]; chunkIndex: number }[]
    failedCount: number
    totalChunks: number
  }> {
    const chunks = this.chunkDocument(content, {
      maxChunkSize: 1000, // Larger chunks = fewer embeddings = faster indexing
      overlap: 150
    })

    console.log(`[RAG Service] Chunked document into ${chunks.length} parts`)

    /**
     * Un lote por petición, no un fragmento por petición.
     *
     * Aquí había tres llamadas en paralelo, que con Ollama sirviendo de una en
     * una son tres llamadas seguidas. Agrupar los textos en una sola petición
     * da el doble de velocidad medido sobre fragmentos reales con bge-m3 en una
     * GTX 960M —96 fragmentos/min contra 199—, y en una base grande eso son
     * horas. Si el lote falla se rehace fragmento a fragmento, que es la forma
     * de seguir distinguiendo cuál de ellos no se pudo vectorizar.
     */
    /**
     * Vectoriza un lote, y si falla lo parte en dos en vez de rehacerlo entero
     * de uno en uno.
     *
     * Basta un fragmento indigesto para tumbar la petición de los cincuenta, y
     * los hay: una tabla de cifras que en caracteres cabe de sobra pasa de la
     * ventana del modelo en tokens, porque cada número es varios. Rehaciendo
     * los cincuenta uno a uno se pierde justo lo que se ganaba agrupando —
     * medido en una base real, el ritmo bajó de 551 a 235 fragmentos/min—;
     * partiendo por la mitad, el culpable se aísla en seis peticiones y el
     * resto sigue yendo en lote.
     *
     * Y al culpable se le recorta en vez de tirarlo: media página indexada vale
     * más que un fragmento que no existe para ninguna búsqueda.
     */
    const vectorizarLote = async (textos: string[]): Promise<(number[] | null)[]> => {
      try {
        return await this.embeddingService.generateEmbeddings(textos, true)
      } catch (err: any) {
        if (textos.length > 1) {
          const mitad = Math.floor(textos.length / 2)
          return [
            ...await vectorizarLote(textos.slice(0, mitad)),
            ...await vectorizarLote(textos.slice(mitad)),
          ]
        }

        /*
         * El recorte va por la misma puerta directa, no por `generateEmbedding`:
         * ésa recorre la cadena de autodetección de proveedor con 60 s de espera
         * por intento, y encima LangChain reintenta por dentro. Un solo
         * fragmento denso dejaba el reindexado parado minutos —medido: seis
         * documentos en media hora y el contador sin moverse—.
         *
         * Y el recorte es a un número fijo de caracteres, no a un porcentaje: lo
         * que desborda la ventana es texto donde cada cifra son varios tokens,
         * así que la mitad de 1.000 puede seguir sin caber. 400 caracteres de
         * dígitos entran de sobra en 512 tokens.
         */
        for (const tope of [400, 150]) {
          try {
            const [vector] = await this.embeddingService.generateEmbeddings(
              [textos[0].slice(0, tope)], true
            )
            return [vector]
          } catch {
            // Se prueba con menos.
          }
        }
        console.error('[RAG Service] Failed embedding for chunk:', err.message)
        return [null]
      }
    }

    const TAMANO_LOTE = 50
    const chunkEmbeddings: (number[] | null)[] = new Array(chunks.length).fill(null)
    const chunkTimings: number[] = []
    let completedCount = 0

    for (let batchStart = 0; batchStart < chunks.length; batchStart += TAMANO_LOTE) {
      const batchEnd = Math.min(batchStart + TAMANO_LOTE, chunks.length)
      const lote = chunks.slice(batchStart, batchEnd)
      const inicioLote = Date.now()

      // Y otro al empezar el lote, no sólo al acabarlo: con lotes de 50 el
      // primer aviso tardaba 50 fragmentos en salir.
      onProgress?.({
        current: batchStart,
        total: chunks.length,
        message: `Chunk ${batchStart + 1}/${chunks.length}: Generando embeddings...`
      })

      const vectores = await vectorizarLote(lote)

      vectores.forEach((v, k) => { chunkEmbeddings[batchStart + k] = v ?? null })
      chunkTimings.push((Date.now() - inicioLote) / lote.length)

      completedCount = batchEnd

      if (onProgress) {
        const avgTime = chunkTimings.length > 0
          ? chunkTimings.reduce((a, b) => a + b, 0) / chunkTimings.length
          : 0
        const remainingChunks = chunks.length - completedCount
        const etaSeconds = Math.round((avgTime * remainingChunks) / 1000)
        const etaText = etaSeconds > 0 ? ` (~${etaSeconds}s restantes)` : ''

        onProgress({
          current: completedCount,
          total: chunks.length,
          message: `Chunk ${completedCount}/${chunks.length}: Generando embeddings...${etaText}`
        })
      }

      if (batchStart === 0 || completedCount % 10 === 0 || completedCount === chunks.length) {
        console.log(`[RAG Service] Progress: ${completedCount}/${chunks.length} chunks processed`)
      }
    }

    const successfulChunks = chunks
      .map((chunk, index) => ({ content: chunk, embedding: chunkEmbeddings[index], chunkIndex: index }))
      .filter((item): item is { content: string; embedding: number[]; chunkIndex: number } => item.embedding !== null)

    const failedCount = chunks.length - successfulChunks.length
    if (failedCount > 0) {
      console.warn(`[RAG Service] ${failedCount}/${chunks.length} chunks failed embedding generation`)
    }

    if (successfulChunks.length === 0 && chunks.length > 0) {
      // El código viaja con el error para que la interfaz pueda explicarlo en el
      // idioma de quien mira y decir qué instalar, en vez de enseñar esta frase.
      const error: Error & { codigo?: string } = new Error(
        'Failed to generate embeddings for any chunk. The embedding provider (Ollama/OpenAI) may be unreachable or misconfigured.'
      )
      error.codigo = 'sinProveedorDeEmbeddings'
      throw error
    }

    return { chunks: successfulChunks, failedCount, totalChunks: chunks.length }
  }

  /**
   * Reindexa un documento que ya está en la base de datos, a partir del texto
   * que guarda en `content`. Los embeddings se generan ANTES de tocar los
   * chunks existentes: si el proveedor de embeddings no responde, el documento
   * se queda como estaba en lugar de perder su indexado.
   */
  async reindexDocument(
    documentId: string,
    onProgress?: (progress: { current: number; total: number; message: string }) => void
  ): Promise<{ chunkCount: number; failedCount: number; totalChunks: number; milvusSynced: boolean }> {
    const doc = await this.prisma.hydraulicKnowledge.findUnique({
      where: { id: documentId },
      include: { chunks: { select: { id: true } } }
    })

    if (!doc) throw new Error('Document not found')
    if (!doc.content || doc.content.trim().length === 0) {
      throw new Error(
        'El documento no conserva su texto en la base de datos, así que no se puede reindexar. Vuelve a subirlo.'
      )
    }

    const { chunks: newChunks, failedCount, totalChunks } = await this.buildIndexedChunks(doc.content, onProgress)
    const staleChunkIds = doc.chunks.map((c) => c.id)

    // Sustitución atómica: si algo falla, no queda a medias
    await this.prisma.$transaction([
      this.prisma.knowledgeChunk.deleteMany({ where: { knowledgeId: documentId } }),
      this.prisma.knowledgeChunk.createMany({
        data: newChunks.map((item) => ({
          knowledgeId: documentId,
          content: item.content,
          embedding: JSON.stringify(item.embedding),
          metadata: marcaDeFragmento(),
          chunkIndex: item.chunkIndex
        }))
      }),
      this.prisma.hydraulicKnowledge.update({
        where: { id: documentId },
        data: { updatedAt: new Date() }
      })
    ])

    // Milvus: quitar los vectores viejos e insertar los nuevos
    let milvusSynced = false
    try {
      const milvusService = (await import('../milvus.service')).MilvusService.getInstance()
      await milvusService.ensureConnection()

      if (staleChunkIds.length > 0) {
        await milvusService.delete('hydraulic_knowledge', staleChunkIds)
      }

      const persisted = await this.prisma.knowledgeChunk.findMany({ where: { knowledgeId: documentId } })
      const rows = persisted
        .filter((c) => c.embedding)
        .map((c) => ({
          id: c.id,
          vector: JSON.parse(c.embedding as string),
          content: c.content,
          // `projectId` viaja en la metainformación para que el almacén pueda
          // filtrar por ámbito sin ir a la base (#39). Hoy es una optimización:
          // la garantía la da la consulta a Prisma.
          metadata: {
            chunkId: c.id,
            docId: doc.id,
            title: doc.title,
            category: doc.category,
            projectId: duenoVectorial(doc.projectId),
          },
          timestamp: Date.now()
        }))

      if (rows.length > 0) {
        const res = await milvusService.insert('hydraulic_knowledge', rows)
        if (res?.skipped) {
          throw new Error('Milvus no estaba disponible: los vectores no se han guardado')
        }
        console.log(`[RAG Service] Reindexed ${rows.length} chunks into Milvus for "${doc.title}"`)
      }
      milvusSynced = true
    } catch (milvusErr) {
      // Los chunks y sus embeddings ya están en la base relacional: la búsqueda
      // por texto sigue funcionando y `wisdom:syncMilvus` puede reintentarlo.
      console.error('[RAG Service] Reindex: failed to sync Milvus:', milvusErr)
    }

    return { chunkCount: newChunks.length, failedCount, totalChunks, milvusSynced }
  }

  // Add new document to knowledge base
  async addDocument(
    document: Omit<HydraulicDocument, 'id' | 'lastUpdated'>,
    onProgress?: (progress: { current: number; total: number; message: string }) => void,
    /**
     * Dueño del documento (#39). Sin él el documento es general y lo ven todos
     * los proyectos; con él es interno de ese cliente. Se pide explícito para
     * que subir algo al ámbito equivocado tenga que ser una decisión, no un
     * descuido del valor por defecto.
     */
    projectId?: string | null,
    /**
     * De dónde sale el documento cuando no lo sube una persona (#41). Ata el
     * derivado a la ejecución que lo generó: la cascada de la base lo borra con
     * ella, y la metainformación permite citar la simulación de origen.
     */
    origen?: { simulationRunId?: string | null; networkVersionId?: string | null }
  ): Promise<string> {
    try {
      const { chunks: successfulChunks } = await this.buildIndexedChunks(document.content, onProgress)

      console.log(`[RAG Service] Creating document with ${successfulChunks.length} indexed chunks`)

      // Create document in database
      const created = await this.prisma.hydraulicKnowledge.create({
        data: {
          category: document.category,
          subcategory: document.subcategory,
          region: JSON.stringify(document.region),
          secondaryCategories: document.secondaryCategories ? JSON.stringify(document.secondaryCategories) : null,
          title: document.title,
          content: document.content,
          metadata: JSON.stringify({
            formulas: document.metadata.formulas || [],
            tables: document.metadata.tables || [],
            figures: document.metadata.figures || [],
            examples: document.metadata.examples || [],
            references: document.metadata.references
          }),
          keywords: JSON.stringify(document.metadata.keywords),
          language: document.metadata.language,
          version: document.version,
          projectId: projectId ?? null,
          simulationRunId: origen?.simulationRunId ?? null,
          chunks: {
            create: successfulChunks.map(item => ({
              content: item.content,
              embedding: JSON.stringify(item.embedding),
              metadata: marcaDeFragmento(),
              chunkIndex: item.chunkIndex
            }))
          }
        },
        include: {
          chunks: true
        }
      })

      /**
       * El primer documento de una base vacía deja anotado con qué modelo se
       * está indexando. Sólo el primero: en una base que ya tiene fragmentos de
       * otro modelo, subir uno nuevo no convierte a los viejos, y decir lo
       * contrario apagaría el aviso que pide reindexar.
       */
      try {
        const habia = await this.prisma.knowledgeChunk.count()
        if (habia === created.chunks.length) {
          await this.prisma.appSetting.upsert({
            where: { key: CLAVE_MODELO_INDEXADO },
            update: { value: modeloEmbeddingsOllama() },
            create: { key: CLAVE_MODELO_INDEXADO, value: modeloEmbeddingsOllama() },
          })
        }
      } catch (e) {
        console.warn('[RAG Service] No se pudo anotar el modelo de indexado:', (e as Error).message)
      }

      // Sync to Milvus immediately
      try {
        const milvusService = (await import('../milvus.service')).MilvusService.getInstance()
        await milvusService.ensureConnection()

        const milvusRows = created.chunks.map(chunk => ({
          id: chunk.id,
          vector: JSON.parse(chunk.embedding as string),
          content: chunk.content,
          metadata: {
            chunkId: chunk.id,
            docId: created.id,
            title: created.title,
            category: created.category,
            // El ámbito viaja con el fragmento (#39): el filtro vectorial no es
            // la garantía —esa la da la base— pero sin el dato no se puede ni
            // intentar, y era lo único que faltaba para poder aplicarlo.
            projectId: duenoVectorial(created.projectId),
            simulationRunId: origen?.simulationRunId ?? null,
            networkVersionId: origen?.networkVersionId ?? null
          },
          timestamp: created.createdAt.getTime()
        }))

        if (milvusRows.length > 0) {
          const res = await milvusService.insert('hydraulic_knowledge', milvusRows)
          if (res?.skipped) {
            throw new Error('Milvus no estaba disponible: los vectores no se han guardado')
          }
          console.log(`[RAG Service] Inserted ${milvusRows.length} chunks into Milvus for doc ${created.title}`)
        }
      } catch (milvusErr) {
        console.error('[RAG Service] Failed to insert into Milvus immediately:', milvusErr)
      }

      return created.id

    } catch (error: any) {
      console.error('Add document error:', error)
      const envuelto: Error & { codigo?: string } = new Error(
        `Failed to add document to knowledge base: ${error.message || error}`
      )
      envuelto.codigo = error?.codigo
      throw envuelto
    }
  }

  // Update existing document
  async updateDocument(
    id: string,
    updates: Partial<HydraulicDocument>
  ): Promise<void> {
    try {
      const updateData: any = {}

      if (updates.content) {
        // Regenerate chunks if content changed
        const chunks = this.chunkDocument(updates.content, {
          maxChunkSize: 1000,
          overlap: 150
        })

        // Helper for timeout
        const generateWithTimeout = async (text: string, timeoutMs: number = 60000) => {
          return Promise.race([
            this.embeddingService.generateEmbedding(text),
            new Promise<number[]>((_, reject) =>
              setTimeout(() => reject(new Error('Embedding generation timed out')), timeoutMs)
            )
          ])
        }

        // Process embeddings in concurrent batches (same pattern as addDocument)
        const CONCURRENCY = 3
        const chunkEmbeddings: (number[] | null)[] = new Array(chunks.length).fill(null)

        for (let batchStart = 0; batchStart < chunks.length; batchStart += CONCURRENCY) {
          const batchEnd = Math.min(batchStart + CONCURRENCY, chunks.length)
          const batchIndices = Array.from({ length: batchEnd - batchStart }, (_, k) => batchStart + k)

          const batchPromises = batchIndices.map(async (i) => {
            try {
              chunkEmbeddings[i] = await generateWithTimeout(chunks[i], 60000)
            } catch (err: any) {
              console.error(`[RAG Service] Failed embedding for chunk ${i + 1} during update:`, err.message)
              chunkEmbeddings[i] = null
            }
          })

          await Promise.all(batchPromises)

          if (batchStart === 0 || batchEnd % 10 === 0 || batchEnd === chunks.length) {
            console.log(`[RAG Service] Update progress: ${batchEnd}/${chunks.length} chunks processed`)
          }
        }

        // Filter successful embeddings
        const successfulChunks = chunks
          .map((chunk, index) => ({ content: chunk, embedding: chunkEmbeddings[index], chunkIndex: index }))
          .filter(item => item.embedding !== null)

        const failedCount = chunks.length - successfulChunks.length
        if (failedCount > 0) {
          console.warn(`[RAG Service] ${failedCount}/${chunks.length} chunks failed during update`)
        }

        // Delete old chunks
        await this.prisma.knowledgeChunk.deleteMany({
          where: { knowledgeId: id }
        })

        // Create new chunks
        await this.prisma.knowledgeChunk.createMany({
          data: successfulChunks.map(item => ({
            knowledgeId: id,
            content: item.content,
            embedding: JSON.stringify(item.embedding),
            chunkIndex: item.chunkIndex
          }))
        })

        updateData.content = updates.content
      }

      if (updates.title) updateData.title = updates.title
      if (updates.category) updateData.category = updates.category
      if (updates.subcategory) updateData.subcategory = updates.subcategory
      if (updates.region) updateData.region = JSON.stringify(updates.region)
      if (updates.secondaryCategories) updateData.secondaryCategories = JSON.stringify(updates.secondaryCategories)
      if (updates.metadata) {
        updateData.metadata = JSON.stringify(updates.metadata)
        updateData.keywords = JSON.stringify(updates.metadata.keywords)
        updateData.language = updates.metadata.language
      }
      if (updates.version) updateData.version = updates.version

      await this.prisma.hydraulicKnowledge.update({
        where: { id },
        data: updateData
      })

    } catch (error) {
      console.error('Update document error:', error)
      throw new Error('Failed to update document')
    }
  }

  // Get specific formulas by category
  async getFormulas(category?: string): Promise<any[]> {
    const filters: any = {
      status: 'active'
    }

    if (category) {
      filters.category = 'hydraulics'
      filters.subcategory = category
    }

    const documents = await this.prisma.hydraulicKnowledge.findMany({
      where: filters,
      select: {
        metadata: true
      }
    })

    const formulas: any[] = []
    for (const doc of documents) {
      const metadata = JSON.parse(doc.metadata)
      if (metadata.formulas) {
        formulas.push(...metadata.formulas)
      }
    }

    return formulas
  }

  // Get regulations by region
  async getRegulations(region: string): Promise<any[]> {
    const documents = await this.prisma.hydraulicKnowledge.findMany({
      where: {
        category: 'regulations',
        region: {
          contains: region
        },
        status: 'active'
      }
    })

    return documents.map(doc => {
      const metadata = JSON.parse(doc.metadata)
      return {
        id: doc.id,
        title: doc.title,
        region: JSON.parse(doc.region),
        references: metadata.references,
        content: doc.content
      }
    })
  }

  // Chunk document into smaller pieces
  /**
   * Trocea un documento en piezas que **nunca** pasan de `maxChunkSize`.
   *
   * El "nunca" es el arreglo: antes, un párrafo largo que llegaba con algo ya
   * acumulado se asignaba entero sin partirlo —sólo se partía si no había nada
   * acumulado—, así que un párrafo de 8.000 caracteres salía como un fragmento
   * de 8.000. En la base de un usuario real eso dejó fragmentos de 2.381
   * caracteres de media y hasta 12.106, con dos consecuencias: al vectorizar se
   * truncaban a 1.000, o sea que el 85 % del corpus estaba indexado sólo por su
   * primer cuarto; y con un modelo de ventana corta —`granite-embedding:278m`
   * son 512 tokens— el indexado directamente falla con «the input length
   * exceeds the context length».
   */
  private chunkDocument(
    content: string,
    options: { maxChunkSize: number; overlap: number }
  ): string[] {
    const { maxChunkSize, overlap } = options

    /** Las últimas palabras, para que el corte no parta una idea en dos. */
    const solapeDe = (texto: string) =>
      texto.split(' ').slice(-Math.floor(overlap / 10)).join(' ')

    /**
     * Parte un texto en piezas que caben, por palabras. La última se devuelve
     * igual que las demás: quien llama decide si la arrastra o la cierra.
     */
    const partir = (texto: string): string[] => {
      const piezas: string[] = []
      let pieza = ''

      for (const palabra of texto.split(' ')) {
        if (palabra.length > maxChunkSize) {
          // Una "palabra" más larga que el tope no existe en prosa; sí en los
          // PDF mal extraídos, con tablas pegadas sin espacios.
          if (pieza) { piezas.push(pieza.trim()); pieza = '' }
          let resto = palabra
          while (resto.length > maxChunkSize) {
            piezas.push(resto.slice(0, maxChunkSize))
            resto = resto.slice(maxChunkSize)
          }
          pieza = resto
        } else if (pieza.length + palabra.length + 1 > maxChunkSize) {
          piezas.push(pieza.trim())
          pieza = palabra
        } else {
          pieza += (pieza ? ' ' : '') + palabra
        }
      }

      if (pieza.trim()) piezas.push(pieza.trim())
      return piezas
    }

    const chunks: string[] = []
    let actual = ''

    for (const parrafo of content.split(/\n\n+/)) {
      if (actual.length + parrafo.length + 2 > maxChunkSize) {
        let arrastre = ''
        if (actual.trim()) {
          chunks.push(actual.trim())
          arrastre = solapeDe(actual)
        }
        // El párrafo se parte SIEMPRE que no quepa, hubiera o no algo acumulado.
        const piezas = partir((arrastre ? arrastre + ' ' : '') + parrafo)
        chunks.push(...piezas.slice(0, -1))
        actual = piezas[piezas.length - 1] ?? ''
      } else {
        actual += (actual ? '\n\n' : '') + parrafo
      }
    }

    if (actual.trim()) chunks.push(...partir(actual))

    return chunks.filter(c => c.length > 0)
  }

  // Calculate cosine similarity between embeddings
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Embeddings must have the same dimension')
    }

    let dotProduct = 0
    let normA = 0
    let normB = 0

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i]
      normA += a[i] * a[i]
      normB += b[i] * b[i]
    }

    normA = Math.sqrt(normA)
    normB = Math.sqrt(normB)

    if (normA === 0 || normB === 0) {
      return 0
    }

    return dotProduct / (normA * normB)
  }

  // Generate highlights from query and chunks
  private generateHighlights(query: string, chunks: string[]): string[] {
    const highlights: string[] = []
    const queryWords = query.toLowerCase().split(/\s+/)

    for (const chunk of chunks) {
      const sentences = chunk.split(/[.!?]+/)

      for (const sentence of sentences) {
        const sentenceLower = sentence.toLowerCase()

        // Check if sentence contains query words
        const matchCount = queryWords.filter(word =>
          sentenceLower.includes(word)
        ).length

        if (matchCount >= Math.min(2, queryWords.length * 0.5)) {
          highlights.push(sentence.trim())
          if (highlights.length >= 3) return highlights
        }
      }
    }

    // If not enough highlights, take first sentences from chunks
    if (highlights.length < 3) {
      for (const chunk of chunks) {
        const firstSentence = chunk.split(/[.!?]+/)[0]
        if (firstSentence && !highlights.includes(firstSentence.trim())) {
          highlights.push(firstSentence.trim())
          if (highlights.length >= 3) break
        }
      }
    }

    return highlights
  }
}

