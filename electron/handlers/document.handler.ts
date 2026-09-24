import { ipcMain, dialog } from 'electron'
import * as fs from 'fs/promises'
import * as path from 'path'
import pdf from 'pdf-parse'
import mammoth from 'mammoth'
import { HydraulicRAGService } from '../../backend/services/hydraulic/ragService'
import { duenoVectorial, duenosPermitidos, filtroPrisma, type Ambito } from '../../backend/services/hydraulic/ambitos'
import { Prisma, PrismaClient } from '@prisma/client'

import { EmbeddingService } from '../../backend/services/embedding.service'
import {
  claveDelProblema,
  condicionSinContenido,
  formatoNoSoportado,
  textoIlegible,
  textoLeido,
  type TextoDeDocumento,
} from '../../backend/services/textoDeDocumento'
import { dimensionDeModelo, dimensionEsperada, marcaDeFragmento, modeloEmbeddingsOllama, DIMENSION_DESCONOCIDA, CLAVE_MODELO_INDEXADO } from '../../backend/services/modeloEmbeddings'

/**
 * Extract plain text from a document on disk. Shared by wisdom:upload
 * (persistent RAG indexing) and chat:pickAttachment (one-off chat context).
 */
export async function extraerTextoDeFichero(filePath: string): Promise<TextoDeDocumento> {
  const fileName = path.basename(filePath)
  const fileExtension = path.extname(fileName).toLowerCase()

  if (fileExtension === '.pdf') {
    try {
      const pdfBuffer = await fs.readFile(filePath)
      const pdfData = await pdf(pdfBuffer)
      return textoLeido(pdfData.text.replace(/\n\s*\n/g, '\n\n'))
    } catch (error) {
      console.warn(`Could not process PDF ${fileName}:`, error)
      return textoIlegible(error)
    }
  }

  if (fileExtension === '.docx') {
    try {
      const buffer = await fs.readFile(filePath)
      const result = await mammoth.extractRawText({ buffer })
      return textoLeido(result.value)
    } catch (error) {
      console.warn(`Could not process DOCX ${fileName}:`, error)
      return textoIlegible(error)
    }
  }

  if (fileExtension === '.doc') {
    return formatoNoSoportado('.doc binario: hay que convertirlo a DOCX o PDF')
  }

  try {
    return textoLeido(await fs.readFile(filePath, 'utf-8'))
  } catch (error) {
    console.warn(`Could not read ${fileName}:`, error)
    return textoIlegible(error)
  }
}

/**
 * Open a native file picker and extract text from the chosen document,
 * without indexing it into the persistent RAG catalog — used to attach a
 * one-off document directly to a chat message (issue #20-B).
 */
export function registerChatAttachmentHandler() {
  ipcMain.handle('chat:pickAttachment', async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
          { name: 'Documents', extensions: ['pdf', 'txt', 'md', 'docx', 'doc'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      })

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, message: 'No file selected' }
      }

      const filePath = result.filePaths[0]
      const fileName = path.basename(filePath)
      const leido = await extraerTextoDeFichero(filePath)

      // Sin texto no hay adjunto: darle al modelo «Unable to extract text
      // content» como si fuera el documento es peor que no adjuntar nada,
      // porque responde sobre ese relleno sin saber que lo es (#157).
      if (leido.problema) {
        return { success: false, fileName, clave: claveDelProblema(leido.problema), detalle: leido.detalle }
      }

      return { success: true, fileName, content: leido.texto }
    } catch (error) {
      console.error('[Document Handler] chat:pickAttachment failed:', error)
      return { success: false, message: error instanceof Error ? error.message : 'Failed to read attachment' }
    }
  })
}

/**
 * Cuántos trozos tiene cada documento y cuántos están ya vectorizados. Es lo
 * único que la lista necesita saber de ellos, y se cuenta en SQL: traerse las
 * filas para contarlas cargaba el embedding de cada trozo —unos 15 KB— en el
 * proceso principal cada vez que se abría el panel o terminaba una subida. Con
 * cien documentos eran cientos de MB por listado (issue #139).
 */
async function recuentoDeIndexado(
  prismaClient: PrismaClient,
  /**
   * Documentos que interesan. Una página de veinte no tiene por qué pagar el
   * agregado de toda la tabla: con 9.900 fragmentos son 545 ms contra 91 ms, y
   * eso crece con la base. Por encima de este tamaño la lista de ids deja de
   * compensar —y roza el límite de parámetros de SQLite—, así que se agrega
   * entera, que es lo que hace falta cuando se piden todos igualmente.
   */
  ids: string[]
): Promise<Map<string, { total: number; conEmbedding: number }>> {
  if (ids.length === 0) return new Map()

  const CONTEO = Prisma.sql`
    COUNT(*) AS total,
    SUM(CASE WHEN "embedding" IS NOT NULL
              AND "embedding" NOT IN ('', '[]', 'null')
             THEN 1 ELSE 0 END) AS "conEmbedding"
  `
  const consulta =
    ids.length > 500
      ? Prisma.sql`SELECT "knowledgeId", ${CONTEO} FROM "knowledge_chunks" GROUP BY "knowledgeId"`
      : Prisma.sql`SELECT "knowledgeId", ${CONTEO} FROM "knowledge_chunks"
                    WHERE "knowledgeId" IN (${Prisma.join(ids)}) GROUP BY "knowledgeId"`

  const filas = await prismaClient.$queryRaw<
    { knowledgeId: string; total: number | bigint; conEmbedding: number | bigint | null }[]
  >(consulta)

  return new Map(
    filas.map((f) => [
      f.knowledgeId,
      { total: Number(f.total), conEmbedding: Number(f.conEmbedding ?? 0) },
    ])
  )
}

/**
 * ¿Hay una clave con la que OpenAI pueda generar embeddings? Sus modelos se
 * ofrecían en el desplegable hubiera clave o no, así que en un equipo recién
 * instalado se podía elegir uno y cada subida fallaba después en todos sus
 * trozos, sin que nada hubiera avisado de que esa opción no podía funcionar.
 */
async function hayClaveDeOpenAI(prismaClient: PrismaClient): Promise<boolean> {
  if (process.env.OPENAI_API_KEY) return true
  const proveedor = await prismaClient.aIProvider.findFirst({
    where: { name: { contains: 'OpenAI' }, isActive: true },
  })
  return Boolean(proveedor?.apiKey)
}

/** Un trozo indexado es el que tiene embedding; los demás no cuentan para el grafo. */
const TROZO_INDEXADO = { embedding: { notIn: ['', '[]', 'null'] } }

/**
 * Cuántos trozos indexados tiene cada documento y cuánto texto suman. Se agrega
 * en SQL en vez de traerse las filas: el grafo sólo necesita dos números por
 * documento, y las filas pesan porque cada una carga su embedding.
 */
async function resumenDeTrozos(
  prismaClient: PrismaClient
): Promise<Map<string, { total: number; caracteres: number }>> {
  const filas = await prismaClient.$queryRaw<
    { knowledgeId: string; total: number | bigint; caracteres: number | bigint | null }[]
  >`
    SELECT "knowledgeId",
           COUNT(*) AS total,
           SUM(LENGTH("content")) AS caracteres
      FROM "knowledge_chunks"
     WHERE "embedding" IS NOT NULL
       AND "embedding" NOT IN ('', '[]', 'null')
     GROUP BY "knowledgeId"
  `

  return new Map(
    filas.map((f) => [
      f.knowledgeId,
      { total: Number(f.total), caracteres: Number(f.caracteres ?? 0) },
    ])
  )
}

/** Los tres primeros trozos de cada documento, que son los que el grafo dibuja. */
async function muestrasDeTrozos(
  prismaClient: PrismaClient
): Promise<Map<string, { id: string; chunkIndex: number; content: string }[]>> {
  const trozos = await prismaClient.knowledgeChunk.findMany({
    where: { ...TROZO_INDEXADO, chunkIndex: { lt: 3 } },
    select: { id: true, knowledgeId: true, chunkIndex: true, content: true },
    orderBy: { chunkIndex: 'asc' },
  })

  const porDocumento = new Map<string, { id: string; chunkIndex: number; content: string }[]>()
  for (const trozo of trozos) {
    const lista = porDocumento.get(trozo.knowledgeId) ?? []
    lista.push({ id: trozo.id, chunkIndex: trozo.chunkIndex, content: trozo.content })
    porDocumento.set(trozo.knowledgeId, lista)
  }
  return porDocumento
}

export function registerWisdomHandlers(prisma?: PrismaClient) {
  const prismaClient = prisma || new PrismaClient()
  const embeddingService = new EmbeddingService(prismaClient)
  const ragService = new HydraulicRAGService(prismaClient, embeddingService)

  // Upload document for RAG processing
  ipcMain.handle('wisdom:upload', async (event, options: {
    category: 'hydraulics' | 'regulations' | 'best-practices'
    subcategory?: string
    region?: string[]
    secondaryCategories?: string[]
    language?: string
    /**
     * Proyecto dueño del documento (#39). Sin él, el documento es general y lo
     * ven todos los proyectos.
     */
    projectId?: string | null
  }) => {
    try {
      // Open file dialog
      const result = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: 'Documents', extensions: ['pdf', 'txt', 'md', 'docx', 'doc'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      })

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, message: 'No files selected' }
      }

      const uploadedDocs = []

      for (const filePath of result.filePaths) {
        const fileName = path.basename(filePath)
        const fileExtension = path.extname(fileName).toLowerCase()


        /**
         * Una sola ruta de extracción para las tres formas de subir (#157).
         *
         * Había tres copias de esto —aquí, en el ayudante compartido y en la
         * subida de carpeta—, cada una con su propia frase inventada para
         * cuando fallaba. El aviso de «< 50 caracteres» que había aquí debajo
         * se limitaba a pegarle al contenido un texto en inglés y lo indexaba
         * igual, así que el documento entraba en la base con un fragmento que
         * no dice nada y compite en las búsquedas.
         */
        const leido = await extraerTextoDeFichero(filePath)
        if (leido.problema) {
          console.warn(`[Document Handler] ${fileName}: sin texto aprovechable (${leido.problema})`, leido.detalle ?? '')
          return {
            success: false,
            fileName,
            clave: claveDelProblema(leido.problema),
            detalle: leido.detalle,
          }
        }
        const fileContent = leido.texto
        console.log(`[Document Handler] Texto extraído de ${fileName}: ${fileContent.length} caracteres`)

        // Extract metadata from filename or content
        const metadata = {
          fileName,
          uploadDate: new Date().toISOString(),
          fileType: fileExtension.substring(1),
          formulas: [],
          tables: [],
          figures: [],
          examples: [],
          references: [],
          keywords: extractKeywords(fileContent),
          language: options.language || 'es'
        }

        // Add to RAG system
        const docId = await ragService.addDocument({
          category: options.category,
          subcategory: options.subcategory || 'general',
          region: options.region || [],
          secondaryCategories: options.secondaryCategories || [],
          title: fileName.replace(/\.[^/.]+$/, ''), // Remove extension
          content: fileContent,
          metadata,
          version: '1.0'
        }, (progress) => {
          // Send progress to renderer
          if (event.sender) {
            event.sender.send('wisdom:upload-progress', {
              current: progress.current,
              total: progress.total,
              message: progress.message,
              filename: fileName
            })
          }
        }, options.projectId ?? null)

        uploadedDocs.push({
          id: docId,
          fileName,
          title: fileName.replace(/\.[^/.]+$/, '')
        })
      }

      return {
        success: true,
        documents: uploadedDocs,
        message: `Successfully uploaded ${uploadedDocs.length} document(s)`
      }

    } catch (error: any) {
      console.error('Document upload error:', error)
      return {
        success: false,
        // El motivo viaja como código para que la interfaz lo diga en el idioma
        // de quien mira: «Failed to generate embeddings for any chunk» no le
        // decía a nadie que le faltaba instalar un modelo.
        codigo: error?.codigo,
        message: `Failed to add document to knowledge base: ${error.message || 'Unknown error'}. Check the developer console for more details.`
      }
    }
  })

  // Search documents
  ipcMain.handle('wisdom:search', async (event, query: string, options?: any) => {
    try {
      const results = await ragService.search(query, options)
      return {
        success: true,
        results
      }
    } catch (error: any) {
      console.error('Document search error:', error)
      return {
        success: false,
        message: error.message || 'Failed to search documents'
      }
    }
  })

  // Get all documents
  ipcMain.handle('wisdom:list', async (event, filters?: {
    category?: string
    region?: string
    language?: string
    ambito?: Ambito
    projectId?: string | null
  }) => {
    try {
      const where: any = { status: 'active' }

      // El listado obedece al mismo ámbito que la búsqueda: si un documento de
      // otro proyecto no puede salir en una consulta, tampoco puede salir en la
      // lista (#39).
      Object.assign(where, filtroPrisma(duenosPermitidos(filters?.ambito ?? 'general', filters?.projectId)))

      if (filters?.category) {
        where.category = filters.category
      }
      if (filters?.region) {
        where.region = { contains: filters.region }
      }
      if (filters?.language) {
        where.language = filters.language
      }

      const documents = await prismaClient.hydraulicKnowledge.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        // Sin `content`: la lista enseña títulos y estado, y el texto entero de
        // cada documento no llega ni a cruzar el IPC.
        select: {
          id: true,
          title: true,
          category: true,
          subcategory: true,
          region: true,
          language: true,
          updatedAt: true,
          version: true,
        }
      })

      const recuento = await recuentoDeIndexado(prismaClient, documents.map((d: any) => d.id))

      return {
        success: true,
        documents: documents.map((doc: any) => {
          const { total: totalChunks, conEmbedding: chunksWithEmbeddings } =
            recuento.get(doc.id) ?? { total: 0, conEmbedding: 0 }
          const isIndexed = totalChunks > 0
          const hasEmbeddings = chunksWithEmbeddings > 0
          const indexingComplete = totalChunks > 0 && chunksWithEmbeddings === totalChunks

          return {
            id: doc.id,
            title: doc.title,
            category: doc.category,
            subcategory: doc.subcategory,
            region: JSON.parse(doc.region),
            language: doc.language,
            updatedAt: doc.updatedAt,
            version: doc.version,
            // Indexing status information
            indexing: {
              isIndexed,
              hasEmbeddings,
              indexingComplete,
              totalChunks,
              chunksWithEmbeddings,
              status: indexingComplete ? 'completed' : (isIndexed ? 'partial' : 'not_indexed')
            }
          }
        })
      }
    } catch (error: any) {
      console.error('Document list error:', error)
      return {
        success: false,
        message: error.message || 'Failed to list documents'
      }
    }
  })

  // Delete document
  ipcMain.handle('wisdom:delete', async (event, documentId: string) => {
    try {
      // Delete from Milvus first
      try {
        const milvusService = (await import('../../backend/services/milvus.service')).MilvusService.getInstance()
        // We need to find chunks to get their IDs or delete by expression if supported
        // For now, simpler approach: get chunks, then delete from Milvus by ID
        const chunks = await prismaClient.knowledgeChunk.findMany({
          where: { knowledgeId: documentId },
          select: { id: true }
        })

        if (chunks.length > 0) {
          const chunkIds = chunks.map(c => c.id)
          await milvusService.delete(
            'hydraulic_knowledge', // Use constant in real code
            chunkIds
          )
          console.log(`[Document Handler] Deleted ${chunkIds.length} chunks from Milvus`)
        }
      } catch (milvusError) {
        console.error('[Document Handler] Failed to delete from Milvus (continuing with DB delete):', milvusError)
      }

      // Delete chunks from DB
      await prismaClient.knowledgeChunk.deleteMany({
        where: { knowledgeId: documentId }
      })

      // Delete document from DB
      await prismaClient.hydraulicKnowledge.delete({
        where: { id: documentId }
      })

      return {
        success: true,
        message: 'Document deleted successfully from Database and Vector Store'
      }
    } catch (error: any) {
      console.error('Document delete error:', error)
      return {
        success: false,
        message: error.message || 'Failed to delete document'
      }
    }
  })

  // Update document
  ipcMain.handle('wisdom:update', async (event, documentId: string, updates: any) => {
    try {
      await ragService.updateDocument(documentId, updates)

      return {
        success: true,
        message: 'Document updated successfully'
      }
    } catch (error: any) {
      console.error('Document update error:', error)
      return {
        success: false,
        message: error.message || 'Failed to update document'
      }
    }
  })

  // Force reindex document
  ipcMain.handle('wisdom:reindex', async (event, documentId: string) => {
    try {
      console.log(`[Document Handler] Force reindexing document: ${documentId}`)

      // Get the document first
      const document = await prismaClient.hydraulicKnowledge.findUnique({
        where: { id: documentId }
      })

      if (!document) {
        throw new Error('Document not found')
      }

      console.log(`[Document Handler] Reindexing document: "${document.title}"`)

      // Reindexado real: trocear, generar embeddings y sustituir los chunks.
      // Antes esto sólo borraba los chunks y devolvía éxito, así que el
      // documento quedaba "Not Indexed" de forma permanente.
      const result = await ragService.reindexDocument(documentId, (progress) => {
        event.sender.send('wisdom:reindex-progress', { documentId, ...progress })
      })

      console.log(
        `[Document Handler] Reindexed "${document.title}": ${result.chunkCount}/${result.totalChunks} chunks` +
        (result.milvusSynced ? '' : ' (sin sincronizar con Milvus)')
      )

      return {
        success: true,
        chunkCount: result.chunkCount,
        failedCount: result.failedCount,
        totalChunks: result.totalChunks,
        milvusSynced: result.milvusSynced,
        message: result.failedCount > 0
          ? `Reindexado con ${result.chunkCount} de ${result.totalChunks} fragmentos (${result.failedCount} fallaron al generar embedding).`
          : `Reindexado: ${result.chunkCount} fragmentos indexados.`
      }
    } catch (error: any) {
      console.error('Document reindex error:', error)
      return {
        success: false,
        message: error.message || 'Failed to reindex document'
      }
    }
  })

  // Validate indexing status across all documents
  ipcMain.handle('wisdom:validateIndexing', async () => {
    try {
      console.log('[Document Handler] Starting indexing validation...')

      // Get all documents with their chunks
      const documents = await prismaClient.hydraulicKnowledge.findMany({
        include: {
          chunks: true
        }
      })

      const validationReport = {
        totalDocuments: documents.length,
        fullyIndexed: 0,
        partiallyIndexed: 0,
        notIndexed: 0,
        corruptedEmbeddings: 0,
        documents: [] as any[]
      }

      for (const doc of documents) {
        const totalChunks = doc.chunks.length
        const chunksWithEmbeddings = doc.chunks.filter(chunk => {
          try {
            // Validate embedding format
            if (!chunk.embedding) return false
            const embedding = JSON.parse(chunk.embedding)
            return Array.isArray(embedding) && embedding.length > 0
          } catch {
            return false
          }
        }).length

        let status: 'fully_indexed' | 'partially_indexed' | 'not_indexed' | 'corrupted'

        if (totalChunks === 0) {
          status = 'not_indexed'
          validationReport.notIndexed++
        } else if (chunksWithEmbeddings === 0) {
          status = 'not_indexed'
          validationReport.notIndexed++
        } else if (chunksWithEmbeddings === totalChunks) {
          status = 'fully_indexed'
          validationReport.fullyIndexed++
        } else {
          status = 'partially_indexed'
          validationReport.partiallyIndexed++
        }

        // Check for corrupted embeddings
        const corruptedChunks = doc.chunks.filter(chunk => {
          if (!chunk.embedding) return false
          try {
            const embedding = JSON.parse(chunk.embedding)
            // Check if embedding has valid dimensions (should be consistent)
            return !Array.isArray(embedding) || embedding.length === 0 ||
              embedding.some(val => typeof val !== 'number' || isNaN(val))
          } catch {
            return true
          }
        }).length

        if (corruptedChunks > 0) {
          validationReport.corruptedEmbeddings++
        }

        validationReport.documents.push({
          id: doc.id,
          title: doc.title,
          category: doc.category,
          status,
          totalChunks,
          chunksWithEmbeddings,
          corruptedChunks,
          indexingPercentage: totalChunks > 0 ? Math.round((chunksWithEmbeddings / totalChunks) * 100) : 0
        })
      }

      console.log(`[Document Handler] Validation complete: ${validationReport.fullyIndexed}/${validationReport.totalDocuments} fully indexed`)

      return {
        success: true,
        report: validationReport
      }

    } catch (error: any) {
      console.error('Indexing validation error:', error)
      return {
        success: false,
        message: error.message || 'Failed to validate indexing'
      }
    }
  })

  // Massive reindexing with options
  ipcMain.handle('wisdom:massiveReindex', async (event, options: {
    clearAllEmbeddings?: boolean
    reindexAll?: boolean
    onlyCorrupted?: boolean
    onlyPartial?: boolean
    embeddingModel?: string
    categories?: string[]
  }) => {
    try {
      console.log('[Document Handler] Starting massive reindexing with options:', options)

      /**
       * La lista se pide con los identificadores, no con los documentos (#174).
       *
       * Traerse todo de golpe —`include: { chunks: true }`— hacía que un solo
       * documento ilegible matara el reindexado entero antes de empezar:
       *
       *     Invalid `prismaClient.hydraulicKnowledge.findMany()` invocation
       *     Failed to convert rust `String` into napi `string`
       *
       * Pasa cuando en la base hay una cadena que no es UTF-8 válido, cosa que
       * dejaban las extracciones de PDF de antes del #157. El motor de Prisma no
       * puede convertirla y aborta la consulta completa, así que el usuario se
       * queda sin poder reindexar **nada**, y el mensaje no dice ni cuál es el
       * documento culpable.
       *
       * Reproducido y medido sobre una base real con un sustituto suelto
       * metido a mano: `findMany` con `include` falla, pedir sólo `id` y
       * `title` funciona, y yendo documento a documento salen 18 legibles y 1
       * ilegible, identificado por su id. Eso es exactamente lo que hace ahora.
       */
      const listaDeDocumentos = await prismaClient.hydraulicKnowledge.findMany({
        select: { id: true, title: true },
        where: options.categories ? { category: { in: options.categories } } : undefined
      })

      /** Los que ni siquiera se pudieron leer, para decirlo al final. */
      const ilegibles: { id: string; title: string; motivo: string }[] = []

      /** Lee un documento sin que su fallo tumbe a los demás. */
      const leerDocumento = async (id: string, title: string) => {
        try {
          return await prismaClient.hydraulicKnowledge.findUnique({
            where: { id },
            include: { chunks: true },
          })
        } catch (error: any) {
          console.error(`[Document Handler] No se pudo leer "${title}" (${id}):`, error?.message ?? error)
          ilegibles.push({ id, title, motivo: error?.message ?? String(error) })
          return null
        }
      }

      let documentsToReindex: any[] = []

      if (options.reindexAll) {
        documentsToReindex = listaDeDocumentos
      } else {
        // Los criterios necesitan mirar los fragmentos, así que aquí sí hay que
        // traer cada documento; uno a uno, por lo mismo de arriba.
        const documents = (await Promise.all(
          listaDeDocumentos.map(d => leerDocumento(d.id, d.title))
        )).filter((d): d is NonNullable<typeof d> => d !== null)

        documentsToReindex = documents.filter(doc => {
          const totalChunks = doc.chunks.length
          const chunksWithEmbeddings = doc.chunks.filter(chunk => {
            try {
              if (!chunk.embedding) return false
              const embedding = JSON.parse(chunk.embedding)
              return Array.isArray(embedding) && embedding.length > 0 &&
                !embedding.some(val => typeof val !== 'number' || isNaN(val))
            } catch {
              return false
            }
          }).length

          if (options.onlyCorrupted) {
            // Include documents with corrupted embeddings
            return doc.chunks.some(chunk => {
              if (!chunk.embedding) return true
              try {
                const embedding = JSON.parse(chunk.embedding)
                return !Array.isArray(embedding) || embedding.length === 0 ||
                  embedding.some(val => typeof val !== 'number' || isNaN(val))
              } catch {
                return true
              }
            })
          }

          if (options.onlyPartial) {
            // Include partially indexed documents
            return totalChunks > 0 && chunksWithEmbeddings < totalChunks && chunksWithEmbeddings > 0
          }

          // Default: include not indexed or corrupted
          return totalChunks === 0 || chunksWithEmbeddings === 0
        })
      }

      console.log(`[Document Handler] Found ${documentsToReindex.length} documents to reindex`)

      if (options.clearAllEmbeddings) {
        console.log('[Document Handler] Clearing all existing embeddings...')
        await prismaClient.knowledgeChunk.updateMany({
          data: { embedding: '' }
        })
      }

      const results = {
        totalProcessed: 0,
        successful: 0,
        failed: 0,
        /** Fragmentos realmente indexados, para poder verificar el resultado. */
        indexedChunks: 0,
        /** Documentos reindexados en la BD pero no sincronizados con Milvus. */
        milvusFailures: 0,
        /** Si hubo que rehacer la colección por venir de otro modelo (#155). */
        coleccionRehecha: false,
        /** Documentos que ya estaban en el modelo actual y no se han tocado. */
        saltados: 0,
        errors: [] as string[]
      }

      /**
       * Si los vectores guardados son de otro tamaño —lo que pasa al cambiar de
       * modelo de embeddings—, hay que rehacer la colección antes de empezar
       * (#155). Sin esto, cada documento se reindexaba bien en la base
       * relacional y fallaba al llegar al almacén vectorial, que rechaza
       * mezclar tamaños: cuarenta minutos para terminar con la búsqueda tan
       * muda como antes. Va aquí y sólo con `reindexAll` porque es la única
       * operación que promete regenerarlos todos.
       */
      if (options.reindexAll) {
        try {
          const milvusService = (await import('../../backend/services/milvus.service')).MilvusService.getInstance()
          results.coleccionRehecha = await milvusService.prepararParaDimension(
            'hydraulic_knowledge',
            dimensionEsperada()
          )
        } catch (error: any) {
          console.error('[Document Handler] No se pudo preparar la colección vectorial:', error)
          results.errors.push(`Base vectorial: ${error.message}`)
        }
      }

      /**
       * Se salta lo que ya está entero en el modelo actual, para que un reindexado cortado
       * siga por donde iba en vez de empezar otra vez. Un documento cuenta como hecho si tiene
       * fragmentos y todos llevan la marca. Si se ha rehecho la colección, no se salta nada:
       * sus vectores ya no están en Milvus.
       */
      if (options.reindexAll && !results.coleccionRehecha) {
        const marca = marcaDeFragmento()
        const conFragmentos = await prismaClient.knowledgeChunk.findMany({
          select: { knowledgeId: true },
          distinct: ['knowledgeId'],
        })
        const pendientes = await prismaClient.knowledgeChunk.findMany({
          select: { knowledgeId: true },
          distinct: ['knowledgeId'],
          where: { OR: [{ metadata: null }, { NOT: { metadata: marca } }] },
        })
        const hechos = new Set(conFragmentos.map(c => c.knowledgeId))
        for (const p of pendientes) hechos.delete(p.knowledgeId)
        if (hechos.size > 0) {
          documentsToReindex = documentsToReindex.filter(d => !hechos.has(d.id))
          results.saltados = hechos.size
          console.log(`[Document Handler] ${hechos.size} documentos ya están en ${modeloEmbeddingsOllama()}: se saltan, quedan ${documentsToReindex.length}`)
        }
      }

      let docIndex = 0
      for (const entrada of documentsToReindex) {
        docIndex += 1

        // Con `reindexAll` la lista son sólo ids: el documento se lee aquí, y
        // si es ilegible se cuenta y se sigue con el siguiente (#174).
        const doc = entrada.chunks ? entrada : await leerDocumento(entrada.id, entrada.title)
        if (!doc) {
          results.failed++
          results.totalProcessed++
          continue
        }

        try {
          console.log(`[Document Handler] Reindexing: "${doc.title}"`)

          /*
           * Un aviso al empezar cada documento, antes de vectorizar nada. La
           * barra sólo se dibuja cuando llega el primer progreso, y los avisos
           * los manda el troceado: al pasar a lotes de 50 fragmentos, el
           * primero tarda 50 en llegar —y en un documento de menos de 50, uno
           * solo al final—, así que la barra no aparecía. Esto no depende del
           * tamaño del lote: es por documento, que es justo lo que la barra
           * mide.
           */
          event.sender.send('wisdom:reindex-progress', {
            documentId: doc.id,
            title: doc.title,
            document: docIndex,
            totalDocuments: documentsToReindex.length,
            current: 0,
            total: 0,
          })

          // Reindexado real por documento. Un fallo (por ejemplo, el proveedor
          // de embeddings caído) se cuenta como fallo con su motivo, en lugar
          // de reportar éxito habiendo borrado los chunks.
          const result = await ragService.reindexDocument(doc.id, (progress) => {
            event.sender.send('wisdom:reindex-progress', {
              documentId: doc.id,
              title: doc.title,
              document: docIndex,
              totalDocuments: documentsToReindex.length,
              ...progress
            })
          })

          results.successful++
          results.indexedChunks += result.chunkCount
          if (result.failedCount > 0) {
            results.errors.push(
              `${doc.title}: ${result.failedCount} de ${result.totalChunks} fragmentos sin embedding`
            )
          }
          if (!result.milvusSynced) results.milvusFailures++
        } catch (error: any) {
          console.error(`Failed to reindex document ${doc.id}:`, error)
          results.failed++
          results.errors.push(`${doc.title}: ${error.message}`)
        }

        results.totalProcessed++
      }

      /**
       * Los ilegibles se nombran (#174). Antes el reindexado moría entero con
       * un mensaje del motor de Prisma que no decía de qué documento hablaba,
       * así que no había forma de saber cuál quitar.
       */
      if (ilegibles.length > 0) {
        console.warn(`[Document Handler] ${ilegibles.length} documento(s) ilegibles:`, ilegibles.map(d => d.title).join(', '))
        results.errors.push(
          `${ilegibles.length} documento(s) no se pudieron leer de la base —su texto no es UTF-8 válido, ` +
          `probablemente de una extracción de PDF antigua—: ${ilegibles.map(d => d.title).join(', ')}. ` +
          `El resto se ha reindexado; bórrelos desde la lista para que dejen de estorbar.`
        )
      }

      /**
       * Queda anotado con qué modelo está indexada la base, y sólo si se ha
       * rehecho entera y sin fallos: una base a medias no puede decir que ya
       * está toda en el modelo nuevo, porque entonces el aviso desaparecería
       * con la mitad de los fragmentos todavía del anterior.
       */
      if (options.reindexAll && results.failed === 0 && ilegibles.length === 0) {
        await prismaClient.appSetting.upsert({
          where: { key: CLAVE_MODELO_INDEXADO },
          update: { value: modeloEmbeddingsOllama() },
          create: { key: CLAVE_MODELO_INDEXADO, value: modeloEmbeddingsOllama() },
        })
      }

      console.log(`[Document Handler] Massive reindexing complete: ${results.successful}/${results.totalProcessed} successful`)

      return {
        success: true,
        results: { ...results, ilegibles }
      }

    } catch (error: any) {
      console.error('Massive reindexing error:', error)
      return {
        success: false,
        message: error.message || 'Failed to perform massive reindexing'
      }
    }
  })

  // Clean orphaned embeddings and chunks
  ipcMain.handle('wisdom:cleanDatabase', async () => {
    try {
      console.log('[Document Handler] Starting database cleanup...')

      const cleanupResults = {
        orphanedChunks: 0,
        emptyEmbeddings: 0,
        corruptedEmbeddings: 0,
        duplicateChunks: 0
      }

      // Remove chunks with corrupted or empty embeddings
      const corruptedChunks = await prismaClient.knowledgeChunk.findMany({
        where: {
          OR: [
            { embedding: { equals: '' } },
            { embedding: { equals: '[]' } },
            { embedding: { equals: 'null' } }
          ]
        }
      })

      for (const chunk of corruptedChunks) {
        try {
          if (chunk.embedding && chunk.embedding !== '' && chunk.embedding !== 'null') {
            const embedding = JSON.parse(chunk.embedding)
            if (!Array.isArray(embedding) || embedding.length === 0 ||
              embedding.some(val => typeof val !== 'number' || isNaN(val))) {
              await prismaClient.knowledgeChunk.delete({ where: { id: chunk.id } })
              cleanupResults.corruptedEmbeddings++
            }
          } else {
            await prismaClient.knowledgeChunk.delete({ where: { id: chunk.id } })
            cleanupResults.emptyEmbeddings++
          }
        } catch {
          await prismaClient.knowledgeChunk.delete({ where: { id: chunk.id } })
          cleanupResults.corruptedEmbeddings++
        }
      }

      // Check for orphaned chunks using a more complex query
      const orphanedChunks = await prismaClient.$queryRaw<{ id: string }[]>`
        SELECT kc.id FROM "knowledge_chunks" kc 
        LEFT JOIN "hydraulic_knowledge" hk ON kc."knowledgeId" = hk.id 
        WHERE hk.id IS NULL
      `

      if (orphanedChunks.length > 0) {
        await prismaClient.knowledgeChunk.deleteMany({
          where: {
            id: { in: orphanedChunks.map(c => c.id) }
          }
        })
      }

      cleanupResults.orphanedChunks = orphanedChunks.length

      // Find and remove potential duplicate chunks
      // Fix: Use correct table name 'knowledge_chunks' instead of Model name 'KnowledgeChunk'
      const duplicates = await prismaClient.$queryRaw`
        SELECT "knowledgeId", content, COUNT(*) as count 
        FROM "knowledge_chunks" 
        GROUP BY "knowledgeId", content 
        HAVING COUNT(*) > 1
      ` as any[]

      for (const duplicate of duplicates) {
        const chunks = await prismaClient.knowledgeChunk.findMany({
          where: {
            knowledgeId: duplicate.knowledgeId,
            content: duplicate.content
          },
          orderBy: { createdAt: 'desc' }
        })

        // Keep the most recent chunk, delete the rest
        for (let i = 1; i < chunks.length; i++) {
          await prismaClient.knowledgeChunk.delete({
            where: { id: chunks[i].id }
          })
          cleanupResults.duplicateChunks++
        }
      }

      console.log('[Document Handler] Database cleanup complete:', cleanupResults)

      return {
        success: true,
        results: cleanupResults
      }

    } catch (error: any) {
      console.error('Database cleanup error:', error)
      return {
        success: false,
        message: error.message || 'Failed to clean database'
      }
    }
  })

  // Sync DB chunks to Milvus (Bug #9: recover from silent Milvus insert failures)
  ipcMain.handle('wisdom:syncMilvus', async (_event, documentId?: string) => {
    try {
      const milvusService = (await import('../../backend/services/milvus.service')).MilvusService.getInstance()
      await milvusService.ensureConnection()

      const where: any = documentId ? { id: documentId } : {}
      const documents = await prismaClient.hydraulicKnowledge.findMany({
        where,
        include: { chunks: true }
      })

      let totalSynced = 0
      let totalSkipped = 0
      const errors: string[] = []

      for (const doc of documents) {
        const validChunks = doc.chunks.filter(c => {
          if (!c.embedding || c.embedding === '' || c.embedding === '[]' || c.embedding === 'null') return false
          try {
            const v = JSON.parse(c.embedding)
            return Array.isArray(v) && v.length > 0 && v.every(n => typeof n === 'number' && !isNaN(n))
          } catch {
            return false
          }
        })

        if (validChunks.length === 0) {
          totalSkipped++
          continue
        }

        try {
          const milvusRows = validChunks.map(c => ({
            id: c.id,
            vector: JSON.parse(c.embedding!),
            content: c.content,
            metadata: {
              chunkId: c.id,
              docId: doc.id,
              title: doc.title,
              category: doc.category,
              // Sin esto, lo que repara este botón queda fuera de todas las
              // búsquedas: el filtro de ámbito exige el campo (#158).
              projectId: duenoVectorial(doc.projectId)
            },
            timestamp: doc.createdAt.getTime()
          }))

          // Delete existing entries for these IDs to avoid duplicates
          try {
            await milvusService.delete('hydraulic_knowledge', validChunks.map(c => c.id))
          } catch {
            // ignore - may not exist yet
          }

          // Se cuenta lo que Milvus aceptó, no lo que se le mandó: contar el
          // envío hacía que el botón de reparar informara «N sincronizados»
          // mientras el almacén se quedaba vacío.
          const res = await milvusService.insert('hydraulic_knowledge', milvusRows)
          if (res?.skipped) {
            throw new Error('Milvus no está disponible')
          }
          totalSynced += milvusRows.length
        } catch (e: any) {
          errors.push(`${doc.title}: ${e.message}`)
        }
      }

      return {
        success: true,
        totalSynced,
        totalSkipped,
        documentsProcessed: documents.length,
        errors
      }
    } catch (error: any) {
      console.error('Milvus sync error:', error)
      return {
        success: false,
        message: error.message || 'Failed to sync to Milvus'
      }
    }
  })

  // Get available embedding providers (static + dynamic Ollama)
  ipcMain.handle('wisdom:getEmbeddingProviders', async () => {
    try {
      console.log('[Document Handler] Getting embedding providers...')

      // Get static providers from service
      const conClaveDeOpenAI = await hayClaveDeOpenAI(prismaClient)
      const staticProviders = embeddingService.getProviders().map((p: any) => ({
        ...p,
        disponible: conClaveDeOpenAI,
        motivo: conClaveDeOpenAI ? undefined : 'sinClaveOpenAI',
      }))
      console.log(`[Document Handler] Static providers: ${staticProviders.length} (clave de OpenAI: ${conClaveDeOpenAI})`)

      // Get dynamic Ollama providers
      let dynamicProviders = []
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const axios = require('axios')
        const response = await axios.get('http://127.0.0.1:11434/api/tags', {
          timeout: 3000,
          headers: { 'Content-Type': 'application/json' }
        })

        if (response.status === 200 && response.data) {
          const models = response.data.models || []
          console.log(`[Document Handler] Found ${models.length} Ollama models`)

          // Filter for embedding models
          const embeddingModels = models.filter((model: any) => {
            const name = model.name.toLowerCase()
            return (
              name.includes('embed') ||
              name.includes('nomic') ||
              name.includes('mxbai') ||
              name.includes('minilm') ||
              name.includes('bge') ||
              name.includes('e5') ||
              name.includes('gemma') ||
              name.includes('llama') ||
              name.includes('mistral')
            )
          })

          console.log(`[Document Handler] Found ${embeddingModels.length} embedding models`)

          // Create provider objects
          dynamicProviders = embeddingModels.map((model: any) => {
            const dimension = dimensionDeModelo(model.name) ?? DIMENSION_DESCONOCIDA

            return {
              id: `ollama-${model.name}`,
              name: `Ollama: ${model.name}`,
              model: model.name,
              dimension,
              // Están porque Ollama acaba de decir que los tiene descargados.
              disponible: true,
            }
          })

          console.log(`[Document Handler] Created ${dynamicProviders.length} dynamic providers`)
        }
      } catch (ollamaError: any) {
        console.log('[Document Handler] Ollama not available for dynamic providers:', ollamaError.message)
      }

      // Combine providers
      const allProviders = [...staticProviders, ...dynamicProviders]
      console.log(`[Document Handler] Total providers: ${allProviders.length}`)

      // El elegido por defecto tiene que ser uno que pueda trabajar: dejar
      // seleccionado el primero de la lista ponía a OpenAI sin clave por delante
      // del modelo local que sí estaba instalado.
      const disponibles = allProviders.filter((p: any) => p.disponible)
      const actual = embeddingService.activeProvider
      const currentProviderId =
        (actual && disponibles.some((p: any) => p.id === actual.id) ? actual.id : disponibles[0]?.id) ?? ''

      return {
        success: true,
        providers: allProviders,
        currentProviderId,
        hayDisponible: disponibles.length > 0,
        dynamicCount: dynamicProviders.length,
        staticCount: staticProviders.length
      }
    } catch (error: any) {
      console.error('Get embedding providers error:', error)
      return {
        success: false,
        message: error.message || 'Failed to get embedding providers'
      }
    }
  })

  // Set embedding provider (handles both static and dynamic providers)
  ipcMain.handle('wisdom:setEmbeddingProvider', async (event, providerId: string) => {
    try {
      console.log(`[Document Handler] Setting embedding provider: ${providerId}`)

      // Get all available providers (static + dynamic)
      const staticProviders = embeddingService.getProviders()
      const staticProvider = staticProviders.find((p: any) => p.id === providerId)

      // Static providers (e.g. OpenAI) never need an Ollama round-trip - switch immediately
      if (staticProvider) {
        embeddingService.setProvider(providerId)
        return {
          success: true,
          message: `Switched to ${embeddingService.activeProvider.name}`
        }
      }

      let dynamicProviders = []

      // Get dynamic Ollama providers if available
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const axios = require('axios')
        const response = await axios.get('http://127.0.0.1:11434/api/tags', {
          timeout: 3000,
          headers: { 'Content-Type': 'application/json' }
        })

        if (response.status === 200 && response.data) {
          const models = response.data.models || []
          const embeddingModels = models.filter((model: any) => {
            const name = model.name.toLowerCase()
            return (
              name.includes('embed') ||
              name.includes('nomic') ||
              name.includes('mxbai') ||
              name.includes('minilm') ||
              name.includes('bge') ||
              name.includes('e5') ||
              name.includes('gemma') ||
              name.includes('llama') ||
              name.includes('mistral')
            )
          })

          dynamicProviders = embeddingModels.map((model: any) => {
            const dimension = dimensionDeModelo(model.name) ?? DIMENSION_DESCONOCIDA

            return {
              id: `ollama-${model.name}`,
              name: `Ollama: ${model.name}`,
              model: model.name,
              dimension
            }
          })
        }
      } catch (ollamaError: any) {
        console.log('[Document Handler] Could not get dynamic providers:', ollamaError.message)
      }

      const selectedProvider = dynamicProviders.find((p: any) => p.id === providerId)

      if (!selectedProvider) {
        const allProviders = [...staticProviders, ...dynamicProviders]
        throw new Error(`Provider ${providerId} not found. Available providers: ${allProviders.map(p => p.id).join(', ')}`)
      }

      // For dynamic (Ollama) providers, set manually
      embeddingService.activeProvider = selectedProvider
      console.log(`[Document Handler] Set dynamic provider: ${selectedProvider.name}`)
      return {
        success: true,
        message: `Switched to ${selectedProvider.name}`
      }

    } catch (error: any) {
      console.error('Set embedding provider error:', error)
      return {
        success: false,
        message: error.message || 'Failed to set embedding provider'
      }
    }
  })

  // Additional handlers for bulk upload and folder operations
  ipcMain.handle('wisdom:selectFolder', async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory']
      })

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, message: 'No folder selected' }
      }

      return {
        success: true,
        folderPath: result.filePaths[0]
      }
    } catch (error: any) {
      console.error('Select folder error:', error)
      return {
        success: false,
        message: error.message || 'Failed to select folder'
      }
    }
  })

  ipcMain.handle('wisdom:getFolderStructure', async (event, folderPath: string) => {
    try {
      console.log('[Folder Structure] Reading folder:', folderPath)

      // Recursive function to build folder tree structure
      const buildFolderTree = async (currentPath: string, relativePath: string = ''): Promise<any> => {
        const stats = await fs.stat(currentPath)
        const name = path.basename(currentPath)

        const node = {
          path: currentPath,
          name: name,
          children: [] as any[],
          files: [] as string[],
          selected: false,
          expanded: false
        }

        if (stats.isDirectory()) {
          try {
            const items = await fs.readdir(currentPath, { withFileTypes: true })

            for (const item of items) {
              const itemPath = path.join(currentPath, item.name)
              const itemRelativePath = path.join(relativePath, item.name)

              if (item.isDirectory()) {
                // Recursively process subdirectories
                const childNode = await buildFolderTree(itemPath, itemRelativePath)
                if (childNode.children.length > 0 || childNode.files.length > 0) {
                  node.children.push(childNode)
                }
              } else if (item.isFile()) {
                const ext = path.extname(item.name).toLowerCase()
                if (['.pdf', '.txt', '.md', '.docx', '.doc'].includes(ext)) {
                  node.files.push(itemPath)
                }
              }
            }
          } catch (dirError) {
            console.warn(`Could not read directory ${currentPath}:`, dirError)
          }
        }

        return node
      }

      const structure = await buildFolderTree(folderPath)

      console.log(`[Folder Structure] Found structure with ${structure.children.length} subfolders and ${structure.files.length} files`)

      return {
        success: true,
        data: structure
      }
    } catch (error: any) {
      console.error('Get folder structure error:', error)
      return {
        success: false,
        message: error.message || 'Failed to get folder structure'
      }
    }
  })

  ipcMain.handle('wisdom:bulkUploadDocuments', async (event, options: {
    files: string[]
    mode?: 'folder' | 'recursive'
    category?: string
    subcategory?: string
    region?: string[]
    secondaryCategories?: string[]
    language?: string
  }) => {
    try {
      // Contra los que se puede contar de verdad: los que no se van a indexar
      // engordaban el total y nunca llegaban a sumar en el numerador (#138).
      const indexables = options.files.filter((f) =>
        ['.pdf', '.txt', '.md', '.docx', '.doc'].includes(path.extname(f).toLowerCase())
      )
      const omitidos = options.files.length - indexables.length

      console.log(
        `[Bulk Upload] Processing ${indexables.length} files with mode: ${options.mode}` +
        (omitidos > 0 ? ` (${omitidos} omitidos por su extensión)` : '')
      )

      const uploadedDocs = []
      let errors = 0
      /**
       * Los ficheros de los que no se pudo sacar texto (#157). Van aparte del
       * recuento de errores porque al usuario le sirve de poco saber que «hubo
       * 2 errores»: lo que necesita es cuáles, para volver a pasarles el OCR.
       */
      const sinTexto: { fileName: string; clave: string }[] = []
      /**
       * Por qué documento va, no cuántos han salido bien. El contador mostraba
       * `uploadedDocs.length + 1`, así que en cuanto un documento fallaba se
       * quedaba atrás y repetía número: con una carpeta donde fallaban varios
       * —lo que pasa si no hay modelo de embeddings— la cuenta parecía aleatoria.
       */
      let posicion = 0

      for (const filePath of indexables) {
        posicion++
        try {
          const fileName = path.basename(filePath)
          const fileExtension = path.extname(fileName).toLowerCase()

          console.log(`[Bulk Upload] Processing file: ${fileName}`)

          // La misma extracción que las otras dos rutas (#157): un fichero
          // del que no se saca texto se cuenta como fallido y no se indexa,
          // en lugar de entrar en la base con una frase inventada dentro.
          const leido = await extraerTextoDeFichero(filePath)
          if (leido.problema) {
            console.warn(`[Bulk Upload] ${fileName}: sin texto aprovechable (${leido.problema})`, leido.detalle ?? '')
            sinTexto.push({ fileName, clave: claveDelProblema(leido.problema) })
            errors++
            continue
          }
          const fileContent: string = leido.texto

          // Extract folder-based category if not specified
          let categoryToUse = options.category || 'hydraulics'
          let subcategoryToUse = options.subcategory || 'general'

          // Try to determine category from folder path
          if (!options.category) {
            const folderPath = path.dirname(filePath)
            const folderName = path.basename(folderPath).toLowerCase()

            // Map folder names to categories
            const categoryMap: Record<string, string> = {
              'hidrologia': 'fuentes-hidrologia',
              'fuentes': 'fuentes-hidrologia',
              'toma': 'obras-toma',
              'obras': 'obras-toma',
              'aducciones': 'hidraulica-aducciones',
              'hidraulica': 'hidraulica-aducciones',
              'potabilizacion': 'potabilizacion',
              'tratamiento': 'potabilizacion',
              'almacenamiento': 'almacenamiento',
              'tanques': 'almacenamiento',
              'bombeo': 'bombeo',
              'bombas': 'bombeo',
              'redes': 'redes-distribucion',
              'distribucion': 'redes-distribucion',
              'servidas': 'aguas-servidas',
              'saneamiento': 'aguas-servidas',
              'cadena': 'cadena-valor',
              'valor': 'cadena-valor'
            }

            for (const [key, value] of Object.entries(categoryMap)) {
              if (folderName.includes(key)) {
                categoryToUse = value
                subcategoryToUse = folderName
                break
              }
            }
          }

          const metadata = {
            fileName,
            uploadDate: new Date().toISOString(),
            fileType: fileExtension.substring(1),
            folderPath: path.dirname(filePath),
            formulas: [],
            tables: [],
            figures: [],
            examples: [],
            references: [],
            keywords: extractKeywords(fileContent),
            language: options.language || 'es'
          }

          // Notify start of file processing
          if (event.sender) {
            event.sender.send('wisdom:upload-progress', {
              current: posicion,
              total: indexables.length,
              message: `Iniciando carga de ${fileName}...`,
              filename: fileName
            })
          }

          const docId = await ragService.addDocument({
            category: categoryToUse as any,
            subcategory: subcategoryToUse,
            region: options.region || [],
            secondaryCategories: options.secondaryCategories || [],
            title: fileName.replace(/\.[^/.]+$/, ''),
            content: fileContent,
            metadata,
            version: '1.0'
          }, (progress) => {
            // Forward chunk progress
            if (event.sender) {
              event.sender.send('wisdom:upload-progress', {
                current: posicion,
                total: indexables.length,
                message: `${fileName}: ${progress.message}`,
                filename: fileName
              })
            }
          })

          uploadedDocs.push({
            id: docId,
            fileName,
            title: fileName.replace(/\.[^/.]+$/, ''),
            category: categoryToUse,
            subcategory: subcategoryToUse
          })

          console.log(`[Bulk Upload] Successfully processed: ${fileName} -> ${categoryToUse}`)

        } catch (error) {
          console.error(`Error uploading file ${path.basename(filePath)}:`, error)
          errors++
        }
      }

      console.log(`[Bulk Upload] Complete: ${uploadedDocs.length} successful, ${errors} errors`)

      if (sinTexto.length > 0) {
        console.warn(`[Bulk Upload] ${sinTexto.length} ficheros sin texto aprovechable:`, sinTexto.map(f => f.fileName).join(', '))
      }

      return {
        success: true,
        documents: uploadedDocs,
        processed: uploadedDocs.length,
        errors,
        omitidos,
        sinTexto,
        stats: {
          total: uploadedDocs.length,
          errors,
          omitidos,
          sinTexto: sinTexto.length,
          successful: uploadedDocs.length
        },
        message: `Successfully uploaded ${uploadedDocs.length} documents${errors > 0 ? ` (${errors} errors)` : ''}`
      }
    } catch (error: any) {
      console.error('Bulk upload error:', error)
      return {
        success: false,
        message: error.message || 'Failed to bulk upload documents'
      }
    }
  })

  // Check Ollama connection from main process (bypasses CORS restrictions)
  ipcMain.handle('wisdom:checkOllamaConnection', async () => {
    try {
      console.log('[Document Handler] Checking Ollama connection from main process...')

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const axios = require('axios')

      const response = await axios.get('http://localhost:11434/api/tags', {
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json'
        }
      })

      if (response.status === 200 && response.data) {
        const models = response.data.models || []

        console.log(`[Document Handler] Ollama is available with ${models.length} models`)

        // Filter for embedding models
        const embeddingModels = models.filter((model: any) => {
          const name = model.name.toLowerCase()
          return (
            name.includes('embed') ||
            name.includes('nomic') ||
            name.includes('mxbai') ||
            name.includes('minilm') ||
            name.includes('bge') ||
            name.includes('e5') ||
            name.includes('gemma') ||
            name.includes('llama') ||
            name.includes('mistral') ||
            // El que la aplicación usa de verdad entra siempre, se llame como
            // se llame: la lista de nombres no puede decidir si aparece.
            name.split(':')[0] === modeloEmbeddingsOllama().split(':')[0]
          )
        }).map((model: any) => {
          const dimension = dimensionDeModelo(model.name) ?? DIMENSION_DESCONOCIDA

          return {
            name: model.name,
            size: model.size,
            modified_at: model.modified_at,
            dimension
          }
        })

        return {
          success: true,
          available: true,
          models: embeddingModels,
          totalModels: models.length,
          message: `Found ${embeddingModels.length} embedding models out of ${models.length} total models`
        }
      } else {
        throw new Error(`Ollama responded with status ${response.status}`)
      }

    } catch (error: any) {
      console.log('[Document Handler] Ollama connection failed:', error.message)

      let message = 'Ollama is not available'
      if (error.code === 'ECONNREFUSED') {
        message = 'Ollama service is not running. Start with: ollama serve'
      } else if (error.code === 'ETIMEDOUT') {
        message = 'Ollama connection timed out. Check if service is responsive.'
      } else {
        message = `Ollama error: ${error.message}`
      }

      return {
        success: true,
        available: false,
        models: [],
        totalModels: 0,
        message
      }
    }
  })
}

// Helper function to extract keywords from text
function extractKeywords(text: string): string[] {
  // Common hydraulic engineering terms
  const hydraulicTerms = [
    'presión', 'caudal', 'tubería', 'válvula', 'bomba', 'tanque',
    'pressure', 'flow', 'pipe', 'valve', 'pump', 'tank',
    'diámetro', 'velocidad', 'pérdida', 'fricción', 'reynolds',
    'diameter', 'velocity', 'loss', 'friction', 'hazen-williams',
    'darcy-weisbach', 'bernoulli', 'continuidad', 'momentum'
  ]

  const words = text.toLowerCase().split(/\s+/)
  const keywords = new Set<string>()

  // Find hydraulic terms in text
  for (const term of hydraulicTerms) {
    if (words.some(word => word.includes(term))) {
      keywords.add(term)
    }
  }

  // Add other relevant words (4+ characters, not common)
  const commonWords = new Set(['para', 'este', 'esta', 'como', 'with', 'from', 'that', 'this'])

  for (const word of words) {
    const cleaned = word.replace(/[^a-záéíóúñ]/gi, '')
    if (cleaned.length >= 4 && !commonWords.has(cleaned)) {
      keywords.add(cleaned)
      if (keywords.size >= 20) break
    }
  }

  return Array.from(keywords)
}

export function registerVectorGraphHandlers(prisma?: PrismaClient) {
  console.log('[Vector Graph Handler] Registering handlers...')
  const prismaClient = prisma || new PrismaClient()

  // Get Vector Graph data for visualization
  ipcMain.handle('wisdom:getVectorGraph', async (_event, _options?: any) => {
    try {
      // Sólo los campos que el grafo dibuja. Traer el documento entero incluía
      // `content` —el texto completo del PDF— y, con `include: { chunks: ... }`,
      // el embedding de cada trozo: unos 15 KB por trozo que este handler no
      // mira. Con más de cien documentos eran cientos de MB materializados en el
      // proceso principal para pintar unos círculos, y el proceso se caía
      // llevándose la ventana (issue #139).
      const documents = await prismaClient.hydraulicKnowledge.findMany({
        where: { status: 'active' },
        select: {
          id: true,
          title: true,
          category: true,
          secondaryCategories: true,
          region: true,
        }
      })

      const resumen = await resumenDeTrozos(prismaClient)
      const muestras = await muestrasDeTrozos(prismaClient)

      const nodes = []
      const edges = []
      const categoryNodes = new Map<string, any>()

      // Create nodes for documents
      for (const doc of documents) {
        const nodeId = `doc-${doc.id}`
        const categories = [doc.category]

        // Parse secondary categories
        if ((doc as any).secondaryCategories) {
          try {
            const secondary = JSON.parse((doc as any).secondaryCategories)
            if (Array.isArray(secondary)) {
              categories.push(...secondary)
            }
          } catch {
            // Ignore parse errors
          }
        }

        const trozos = resumen.get(doc.id) ?? { total: 0, caracteres: 0 }

        nodes.push({
          id: nodeId,
          label: doc.title,
          type: 'document',
          category: doc.category,
          allCategories: categories, // Pass all categories to frontend
          region: JSON.parse(doc.region),
          chunks: trozos.total,
          color: getColorForCategory(doc.category),
          size: Math.max(15, Math.min(35, trozos.total * 2))
        })

        // Process categories for graph nodes and links
        categories.forEach(cat => {
          if (!cat) return
          if (!categoryNodes.has(cat)) {
            categoryNodes.set(cat, {
              id: `cat-${cat}`,
              label: cat,
              type: 'category',
              color: getColorForCategory(cat),
              size: 25,
              title: `Category: ${cat}`
            })
          }

          // Link document to category
          edges.push({
            id: `${nodeId}-cat-${cat}`,
            from: nodeId,
            to: `cat-${cat}`,
            type: 'category_link',
            color: { color: '#e2e8f0', opacity: 0.3 }
          })
        })

        // Create nodes for chunks
        for (const chunk of muestras.get(doc.id) ?? []) { // Limit to first 3 chunks per doc
          const chunkId = `chunk-${chunk.id}`
          nodes.push({
            id: chunkId,
            label: `Chunk ${chunk.chunkIndex + 1}`,
            type: 'chunk',
            parentDoc: doc.title,
            content: chunk.content.substring(0, 100) + '...',
            color: '#94a3b8',
            size: 8
          })

          // Connect chunk to document only, document connects to categories
          edges.push({
            id: `${nodeId}-${chunkId}`,
            from: nodeId,
            to: chunkId,
            type: 'contains'
          })
        }
      }

      // Add category nodes to graph
      categoryNodes.forEach(node => nodes.push(node))

      // Calculate category statistics (considering primary category only for grouping stats, or primary + secondary?)
      // Standard practice: Stats by Primary Category for simplicity, or we can expand.
      // Let's stick to Primary Category for the stats object to avoid double counting size/chunks.
      const categoryStats: Record<string, { count: number, totalChunks: number, totalSize: number, avgChunkSize: number }> = {}
      const uniqueCategories = new Set<string>()

      for (const doc of documents) {
        if (!doc.category) continue
        uniqueCategories.add(doc.category)

        if (!categoryStats[doc.category]) {
          categoryStats[doc.category] = { count: 0, totalChunks: 0, totalSize: 0, avgChunkSize: 0 }
        }

        const trozos = resumen.get(doc.id) ?? { total: 0, caracteres: 0 }
        const stats = categoryStats[doc.category]
        stats.count++
        stats.totalChunks += trozos.total
        stats.totalSize += trozos.caracteres
      }

      // Finalize averages
      Object.keys(categoryStats).forEach(cat => {
        const stats = categoryStats[cat]
        stats.avgChunkSize = stats.totalChunks > 0 ? Math.round(stats.totalSize / stats.totalChunks) : 0
      })

      return {
        success: true,
        graph: {
          nodes,
          edges,
          statistics: {
            totalNodes: nodes.length,
            totalEdges: edges.length,
            totalDocuments: documents.length,
            totalChunks: documents.reduce((sum, doc) => sum + (resumen.get(doc.id)?.total ?? 0), 0),
            categories: categoryNodes.size, // Use size of all unique categories found
            categoryStats
          }
        }
      }
    } catch (error: any) {
      console.error('Get vector graph error:', error)
      return {
        success: false,
        message: error.message || 'Failed to get vector graph'
      }
    }
  })

  // Get RAG system health metrics
  ipcMain.handle('wisdom:getRAGHealth', async () => {
    try {
      const totalDocs = await prismaClient.hydraulicKnowledge.count({
        where: { status: 'active' }
      })

      const totalChunks = await prismaClient.knowledgeChunk.count()
      const chunksWithEmbeddings = await prismaClient.knowledgeChunk.count({
        where: { embedding: { notIn: ['', '[]', 'null'] } }
      })

      const categories = await prismaClient.hydraulicKnowledge.groupBy({
        by: ['category'],
        where: { status: 'active' },
        _count: { category: true }
      })

      // Calculate derived metrics
      const embeddingCoverage = totalChunks > 0 ? (chunksWithEmbeddings / totalChunks) * 100 : 0

      // Calculate how many docs are properly indexed (have at least one chunk)
      const indexedPercentage = totalDocs > 0 ? (await prismaClient.hydraulicKnowledge.count({
        where: {
          status: 'active',
          chunks: { some: {} }
        }
      }) / totalDocs) * 100 : 0

      const avgChunksPerDoc = totalDocs > 0 ? Math.round(totalChunks / totalDocs) : 0

      // Identify issues
      const issues = []
      if (embeddingCoverage < 100 && totalChunks > 0) issues.push(`${totalChunks - chunksWithEmbeddings} chunks missing embeddings`)
      if (indexedPercentage < 100 && totalDocs > 0) issues.push(`${Math.round(100 - indexedPercentage)}% documents not indexed`)
      if (totalDocs === 0) issues.push('No documents in knowledge base')

      /**
       * Los vectores guardados tienen que ser del tamaño que produce el modelo
       * de ahora (#155). Si no lo son, buscar no da error: Milvus contesta
       * «Success» con la lista vacía y el RAG se queda mudo con toda la base
       * indexada delante. Es lo que pasa al cambiar de modelo sin reindexar, y
       * sin esta comprobación el panel seguía diciendo que todo estaba bien.
       */
      /**
       * Documentos indexados de los que nunca se sacó texto (#157).
       *
       * El arreglo impide crear nuevos, pero los que ya entraron siguen ahí:
       * un fragmento de sesenta y nueve caracteres con su vector, compitiendo
       * en cada búsqueda y contando como documento indexado en la lista. Se
       * detectan y se dicen; borrarlos lo decide el usuario, que para eso
       * tiene el botón de cada ficha.
       */
      /**
       * Se pregunta en SQL en vez de traerse los documentos (#174).
       *
       * Filtrarlo en JavaScript obligaba a pedir el contenido de todos: en la
       * base de un usuario real, 241 MB y **935 MB de memoria** en cada
       * comprobación de estado, que se hace al abrir el panel. Ahora viajan
       * identificadores y títulos, y la condición la resuelve SQLite.
       */
      const sinTextoUtil = await prismaClient.$queryRawUnsafe<{ id: string; title: string }[]>(
        `SELECT id, title FROM hydraulic_knowledge
         WHERE status = 'active' AND ${condicionSinContenido()}`
      )

      const dimensionActual = dimensionEsperada()
      /**
       * La distribución de tamaños, no un fragmento suelto.
       *
       * Esto se resolvía con un `findFirst`, y una migración a medias lo deja
       * mintiendo: en la base de un usuario con 102.062 fragmentos, el
       * reindexado automático del arranque murió tras pasar 8.397 a 1024 y el
       * muestreo cayó justo en uno de ésos. Resultado: `descuadrada` a false,
       * salud «correcta», aviso de reindexado invisible, y los 93.650
       * fragmentos de 768 que quedaban —el 92 % de la base— mudos en cada
       * búsqueda, sin que nada lo dijera.
       */
      let dimensiones: { dim: number; n: number }[] = []
      try {
        const filas = await prismaClient.$queryRawUnsafe<{ dim: number | null; n: number | bigint }[]>(
          `SELECT json_array_length(embedding) AS dim, COUNT(*) AS n
           FROM knowledge_chunks
           WHERE embedding IS NOT NULL AND embedding NOT IN ('', '[]', 'null')
             AND json_valid(embedding)
           GROUP BY dim`
        )
        dimensiones = filas
          .filter(f => f.dim !== null && Number(f.dim) > 0)
          .map(f => ({ dim: Number(f.dim), n: Number(f.n) }))
      } catch (error) {
        // Sin json_array_length se vuelve al muestreo: peor, pero mejor que
        // dejar la comprobación sin responder.
        console.warn('No se pudo contar los tamaños de los vectores; se mira sólo uno:', error)
        const muestra = await prismaClient.knowledgeChunk.findFirst({
          where: { embedding: { notIn: ['', '[]', 'null'] } },
          select: { embedding: true }
        })
        if (muestra?.embedding) {
          try {
            const v = JSON.parse(muestra.embedding)
            if (Array.isArray(v) && v.length > 0) dimensiones = [{ dim: v.length, n: 1 }]
          } catch {
            // Un embedding ilegible ya lo cuenta la cobertura de arriba.
          }
        }
      }

      /**
       * Con qué modelo se indexó, que no es lo mismo que de qué tamaño son los
       * vectores: `granite-embedding:278m` da 768 y `nomic-embed-text` también.
       * Una base indexada con el viejo pasaría la comprobación de tamaño y la
       * búsqueda devolvería documentos al azar —peor que devolver vacío, porque
       * nada lo delata—. Sin marca y con fragmentos indexados se asume que
       * vienen de antes, que es lo conservador: sobra un aviso, no falta.
       */
      /**
       * Y si el modelo que se va a usar está siquiera instalado. Sin él no se
       * puede vectorizar nada: ni indexar, ni buscar, ni reindexar —y el
       * reindexado tardaría horas en fallar documento a documento—. `null` es
       * «no se pudo preguntar», que no es lo mismo que «no está».
       */
      let modeloInstalado: boolean | null = null
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const axios = require('axios')
        const r = await axios.get(`${process.env.OLLAMA_BASE_URL || 'http://localhost:11434'}/api/tags`, { timeout: 5000 })
        const instalados: string[] = (r.data?.models ?? []).map((m: { name: string }) => m.name)
        const pedido = modeloEmbeddingsOllama()
        // `granite-embedding:278m` y `granite-embedding:278m` con otra etiqueta
        // son el mismo modelo a estos efectos, igual que en `modelosRAG`.
        modeloInstalado = instalados.some(n => n === pedido || n.split(':')[0] === pedido.split(':')[0])
      } catch {
        // Ollama apagado o inalcanzable: ya se avisa por otra vía.
      }

      const marca = await prismaClient.appSetting.findUnique({ where: { key: CLAVE_MODELO_INDEXADO } })
      const modeloGuardado = marca?.value ?? null
      const modeloDistinto = chunksWithEmbeddings > 0 && modeloGuardado !== modeloEmbeddingsOllama()

      const porTamano = dimensiones
        .filter(d => d.dim !== dimensionActual)
        .reduce((total, d) => total + d.n, 0)
      // Si el modelo no es el mismo, no vale ninguno aunque el tamaño cuadre.
      const descuadrados = modeloDistinto ? chunksWithEmbeddings : porTamano
      const dimensionDescuadrada = porTamano > 0
      /**
       * El tamaño que se le enseña al usuario es el del grupo que hay que
       * reindexar, no el del primer fragmento que salga: con la base a medio
       * migrar conviven los dos y el que importa es el que no sirve.
       */
      const mayoritaria = (grupos: { dim: number; n: number }[]) =>
        grupos.sort((a, b) => b.n - a.n)[0]?.dim
      const dimensionGuardada = dimensionDescuadrada
        ? mayoritaria(dimensiones.filter(d => d.dim !== dimensionActual))
        : mayoritaria(dimensiones)

      /**
       * Y los vectores tienen que llevar el dueño escrito como lo espera el
       * filtro de ámbito (#158).
       *
       * Desde que la búsqueda general filtra en el almacén, un fragmento
       * indexado con `projectId: null` —como se guardaba antes— es
       * inseleccionable: Milvus no alcanza los campos JSON a null ni
       * afirmándolos ni negándolos. El efecto es el mismo que el de la
       * dimensión descuadrada, la búsqueda muda, y no lo detecta la
       * comprobación de arriba: quien ya reindexó para el modelo nuevo tiene la
       * dimensión bien y el dueño mal.
       *
       * Se mira un fragmento general cualquiera, que es donde se nota: los de
       * proyecto siempre trajeron su identificador.
       */
      let ambitoSinCodificar = false
      const fragmentoGeneral = await prismaClient.knowledgeChunk.findFirst({
        where: { knowledge: { projectId: null }, embedding: { notIn: ['', '[]', 'null'] } },
        select: { id: true }
      })
      if (fragmentoGeneral) {
        try {
          const milvusService = (await import('../../backend/services/milvus.service')).MilvusService.getInstance()
          const filas = await milvusService.query(
            'hydraulic_knowledge',
            `id == "${fragmentoGeneral.id}"`,
            ['metadata'],
            1
          )
          const guardado = filas?.data?.[0]?.metadata
          if (guardado) ambitoSinCodificar = typeof guardado.projectId !== 'string'
        } catch {
          // Sin almacén vectorial no hay nada que comprobar: la falta de Milvus
          // ya se avisa más abajo.
        }
      }

      // Determine overall status
      let status = 'excellent'
      if (issues.length > 0) status = 'healthy'
      if (embeddingCoverage < 80 || indexedPercentage < 80) status = 'degraded'
      if (embeddingCoverage < 50 || totalDocs === 0) status = 'critical'

      // Estado real de Milvus. Antes se devolvía 'connected' escrito a mano, así
      // que el panel decía "Database: connected" con el servidor vectorial caído
      // y 0% indexado, que es lo que despistó al diagnosticar un caso real.
      let vectorStatus = 'disconnected'
      let reconstruccion: { hechas: number; total: number } | null = null
      try {
        const { MilvusService } = await import('../../backend/services/milvus.service')
        const milvusService = MilvusService.getInstance()
        await milvusService.ensureConnection()
        vectorStatus = milvusService.isAvailable() ? 'connected' : 'disconnected'
        reconstruccion = milvusService.estadoReconstruccion(MilvusService.COLLECTIONS.KNOWLEDGE)
      } catch {
        vectorStatus = 'disconnected'
      }
      if (vectorStatus !== 'connected') {
        issues.push('Milvus (base vectorial) no está disponible: no se puede indexar ni buscar por similitud')
        status = 'critical'
      }
      if (reconstruccion) {
        issues.push(
          `Se está reconstruyendo la base vectorial (${reconstruccion.hechas.toLocaleString('es')} de ` +
          `${reconstruccion.total.toLocaleString('es')} fragmentos): hasta que termine, la búsqueda por ` +
          `similitud no devuelve nada. Se hace una sola vez y sigue por donde iba si se cierra la app.`
        )
        status = 'critical'
      }
      if (dimensionDescuadrada) {
        issues.push(
          `Los vectores guardados son de ${dimensionGuardada} números y el modelo de embeddings actual ` +
          `(${modeloEmbeddingsOllama()}) produce ${dimensionActual}: la búsqueda no devuelve nada. ` +
          `Hay que reindexar la base de conocimiento.`
        )
        status = 'critical'
      }
      if (sinTextoUtil.length > 0) {
        issues.push(
          `${sinTextoUtil.length} documento(s) están indexados sin texto aprovechable —probablemente PDF escaneados ` +
          `sin OCR—: ${sinTextoUtil.slice(0, 3).map(d => d.title).join(', ')}` +
          `${sinTextoUtil.length > 3 ? '…' : ''}. Ocupan sitio en las búsquedas y no pueden responder nada.`
        )
      }
      if (modeloInstalado === false) {
        issues.push(
          `El modelo de embeddings «${modeloEmbeddingsOllama()}» no está instalado en Ollama. Sin él no se ` +
          `puede indexar ni buscar nada: instálalo con «ollama pull ${modeloEmbeddingsOllama()}» o desde el ` +
          `aviso de la Base de Conocimiento.`
        )
        status = 'critical'
      }
      if (modeloDistinto && !dimensionDescuadrada) {
        issues.push(
          `La base se indexó con ${modeloGuardado ? `«${modeloGuardado}»` : 'otro modelo de embeddings'} ` +
          `y ahora se busca con «${modeloEmbeddingsOllama()}». Coincida o no el tamaño de los vectores, ` +
          `son espacios distintos: la búsqueda devuelve resultados sin sentido. Hay que reindexar la ` +
          `base de conocimiento.`
        )
        status = 'critical'
      }
      if (ambitoSinCodificar) {
        issues.push(
          'Los vectores guardados no llevan el ámbito con el que se filtra ahora: la búsqueda general ' +
          'no devuelve nada. Hay que reindexar la base de conocimiento.'
        )
        status = 'critical'
      }

      const health = {
        status,
        timestamp: new Date().toISOString(),
        issues,
        metrics: {
          databaseStatus: vectorStatus,
          documents: {
            total: totalDocs,
            indexedPercentage: Math.round(indexedPercentage)
          },
          embeddings: {
            coverage: Math.round(embeddingCoverage),
            total: chunksWithEmbeddings,
            /**
             * Los dos tamaños, para que la interfaz pueda avisar sin tener que
             * leer el texto de `issues` (#162). `descuadrada` es lo que decide
             * si al usuario le hace falta reindexar.
             */
            dimensionGuardada,
            dimensionEsperada: dimensionActual,
            descuadrada: dimensionDescuadrada,
            /** Cuántos fragmentos hay que rehacer, no cuántos hay (#162). */
            descuadrados,
            /** Indexado con otro modelo, aunque el tamaño cuadre. */
            modeloDistinto,
            modeloGuardado,
            /** Si el modelo configurado está instalado en Ollama; null si no se pudo preguntar. */
            modeloInstalado,
            /** El otro motivo por el que hay que reindexar (#158). */
            ambitoSinCodificar,
            modelo: modeloEmbeddingsOllama()
          },
          /** Los que se indexaron sin texto que valga (#157). */
          sinTextoUtil: sinTextoUtil.map(d => ({ id: d.id, title: d.title })),
          chunks: {
            total: totalChunks,
            avgPerDocument: avgChunksPerDoc
          },
          categories: categories.map(cat => ({
            category: cat.category,
            count: cat._count.category
          })),
          performance: {
            recentSearches: 0,
            avgProcessingTime: 0,
            avgResponseQuality: 5.0
          }
        }
      }

      return {
        success: true,
        health
      }
    } catch (error: any) {
      console.error('Get RAG health error:', error)
      return {
        success: false,
        message: error.message || 'Failed to get RAG health'
      }
    }
  })

  // Get vector clusters analysis
  ipcMain.handle('wisdom:getVectorClusters', async (_event, _options?: any) => {
    try {
      // Clustering based on categories and similarity. Aquí ya no se traía el
      // embedding, pero sí el texto entero de cada documento y el de todos sus
      // trozos para acabar sumando longitudes: eso lo cuenta SQL (issue #139).
      const documents = await prismaClient.hydraulicKnowledge.findMany({
        where: { status: 'active' },
        select: { id: true, title: true, category: true, region: true }
      })

      const resumen = await resumenDeTrozos(prismaClient)

      const clusters = new Map()
      let totalChunksInSystem = 0

      for (const doc of documents) {
        if (!doc.category) continue

        const category = doc.category
        if (!clusters.has(category)) {
          clusters.set(category, {
            docs: [],
            totalChunks: 0,
            totalContentLength: 0
          })
        }

        const cluster = clusters.get(category)
        cluster.docs.push({
          id: doc.id,
          title: doc.title,
          region: JSON.parse(doc.region)
        })

        const trozos = resumen.get(doc.id) ?? { total: 0, caracteres: 0 }
        const docChunks = trozos.total
        const docContentLength = trozos.caracteres

        cluster.totalChunks += docChunks
        cluster.totalContentLength += docContentLength
        totalChunksInSystem += docChunks
      }

      const clustersArray = Array.from(clusters.entries()).map(([category, data]) => {
        const chunkCount = data.totalChunks
        const avgChunkSize = chunkCount > 0 ? Math.round(data.totalContentLength / chunkCount) : 0

        // Calculate a pseudo-density score based on average chunk size and document count
        // Ideally this would come from vector density, but for now we approximate
        // Higher density = more chunks per document + consistent chunk sizes
        const avgChunksPerDoc = data.docs.length > 0 ? chunkCount / data.docs.length : 0
        const density = Math.min(Math.max(avgChunksPerDoc / 20, 0.1), 1.0)

        return {
          id: category,
          label: category,
          chunkCount: chunkCount,
          avgChunkSize: avgChunkSize,
          density: density,
          size: data.docs.length
        }
      })

      return {
        success: true,
        totalClusters: clustersArray.length,
        totalChunks: totalChunksInSystem,
        clusters: clustersArray
      }
    } catch (error: any) {
      console.error('Get vector clusters error:', error)
      return {
        success: false,
        message: error.message || 'Failed to get vector clusters'
      }
    }
  })
}

export function registerWisdomExtendedHandlers(prisma?: PrismaClient) {
  const prismaClient = prisma || new PrismaClient()

  // ============================================================
  // TECH-3: Export masivo de documentos
  // ============================================================
  ipcMain.handle('wisdom:exportDocuments', async (_event, options: {
    documentIds?: string[]
    format?: 'json' | 'csv'
    includeContent?: boolean
  }) => {
    try {
      const { format = 'json', includeContent = false, documentIds } = options || {}

      // Query documents
      let documents: any[]
      if (documentIds && documentIds.length > 0) {
        documents = await prismaClient.hydraulicKnowledge.findMany({
          where: { id: { in: documentIds } },
          include: { chunks: includeContent },
        })
      } else {
        documents = await prismaClient.hydraulicKnowledge.findMany({
          include: { chunks: includeContent },
        })
      }

      // Ask user where to save
      const saveResult = await dialog.showSaveDialog({
        title: 'Export Documents',
        defaultPath: `boorie-wisdom-export-${Date.now()}.${format}`,
        filters: format === 'json'
          ? [{ name: 'JSON Files', extensions: ['json'] }]
          : [{ name: 'CSV Files', extensions: ['csv'] }],
      })

      if (saveResult.canceled || !saveResult.filePath) {
        return { success: false, message: 'Export cancelled' }
      }

      let fileContent: string

      if (format === 'csv') {
        // CSV export
        const headers = ['id', 'title', 'category', 'subcategory', 'region', 'language', 'version', 'status', 'keywords', 'createdAt']
        const rows = documents.map(doc => [
          doc.id,
          `"${(doc.title || '').replace(/"/g, '""')}"`,
          doc.category,
          doc.subcategory,
          doc.region,
          doc.language,
          doc.version,
          doc.status,
          doc.keywords,
          doc.createdAt?.toISOString() || '',
        ])
        fileContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
      } else {
        // JSON export
        const exportData = documents.map(doc => ({
          id: doc.id,
          title: doc.title,
          category: doc.category,
          subcategory: doc.subcategory,
          region: doc.region,
          secondaryCategories: doc.secondaryCategories,
          language: doc.language,
          version: doc.version,
          status: doc.status,
          keywords: doc.keywords,
          metadata: doc.metadata,
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
          ...(includeContent ? { content: doc.content, chunksCount: doc.chunks?.length || 0 } : {}),
        }))
        fileContent = JSON.stringify(exportData, null, 2)
      }

      await fs.writeFile(saveResult.filePath, fileContent, 'utf-8')

      return {
        success: true,
        message: `Exported ${documents.length} documents to ${saveResult.filePath}`,
        exportedCount: documents.length,
        filePath: saveResult.filePath,
      }
    } catch (error: any) {
      console.error('Export error:', error)
      return { success: false, message: error.message || 'Export failed' }
    }
  })

  // ============================================================
  // TECH-3: Historial de busquedas
  // ============================================================
  ipcMain.handle('wisdom:saveSearchHistory', async (_event, entry: {
    query: string
    resultsCount: number
    searchType: 'simple' | 'rag'
    filters?: any
  }) => {
    try {
      await prismaClient.appSetting.create({
        data: {
          key: `search_history_${Date.now()}`,
          value: JSON.stringify({
            query: entry.query,
            resultsCount: entry.resultsCount,
            searchType: entry.searchType,
            filters: entry.filters,
            timestamp: new Date().toISOString(),
          }),
          category: 'search_history',
        },
      })
      return { success: true }
    } catch (error: any) {
      console.error('Save search history error:', error)
      return { success: false, message: error.message }
    }
  })

  ipcMain.handle('wisdom:getSearchHistory', async (_event, options?: { limit?: number }) => {
    try {
      const limit = options?.limit || 20
      const entries = await prismaClient.appSetting.findMany({
        where: { category: 'search_history' },
        orderBy: { createdAt: 'desc' },
        take: limit,
      })

      const history = entries.map(entry => {
        try {
          return JSON.parse(entry.value)
        } catch {
          return null
        }
      }).filter(Boolean)

      return { success: true, history }
    } catch (error: any) {
      console.error('Get search history error:', error)
      return { success: false, history: [], message: error.message }
    }
  })

  ipcMain.handle('wisdom:clearSearchHistory', async () => {
    try {
      await prismaClient.appSetting.deleteMany({
        where: { category: 'search_history' },
      })
      return { success: true }
    } catch (error: any) {
      console.error('Clear search history error:', error)
      return { success: false, message: error.message }
    }
  })

  // ============================================================
  // TECH-3: Tags personalizados (usa secondaryCategories)
  // ============================================================
  ipcMain.handle('wisdom:updateTags', async (_event, documentId: string, tags: string[]) => {
    try {
      await prismaClient.hydraulicKnowledge.update({
        where: { id: documentId },
        data: { secondaryCategories: JSON.stringify(tags) },
      })
      return { success: true }
    } catch (error: any) {
      console.error('Update tags error:', error)
      return { success: false, message: error.message }
    }
  })

  ipcMain.handle('wisdom:getAllTags', async () => {
    try {
      const docs = await prismaClient.hydraulicKnowledge.findMany({
        select: { secondaryCategories: true },
      })

      const tagSet = new Set<string>()
      docs.forEach(doc => {
        if (doc.secondaryCategories) {
          try {
            const tags = JSON.parse(doc.secondaryCategories)
            if (Array.isArray(tags)) {
              tags.forEach((t: string) => tagSet.add(t))
            }
          } catch { /* ignore parse errors */ }
        }
      })

      return { success: true, tags: Array.from(tagSet).sort() }
    } catch (error: any) {
      console.error('Get all tags error:', error)
      return { success: false, tags: [], message: error.message }
    }
  })

  // ============================================================
  // TECH-3: Paginacion / Lazy loading
  // ============================================================
  ipcMain.handle('wisdom:listPaginated', async (_event, options: {
    offset?: number
    limit?: number
    category?: string
    region?: string
    search?: string
    sortBy?: 'title' | 'createdAt' | 'category'
    sortOrder?: 'asc' | 'desc'
  }) => {
    try {
      const { offset = 0, limit = 50, category, region, search, sortBy = 'createdAt', sortOrder = 'desc' } = options || {}

      const where: any = {}
      if (category && category !== 'all') {
        where.category = category
      }
      if (region) {
        where.region = { contains: region }
      }
      if (search) {
        where.OR = [
          { title: { contains: search } },
          { content: { contains: search } },
          { keywords: { contains: search } },
        ]
      }

      const [documents, totalCount] = await Promise.all([
        prismaClient.hydraulicKnowledge.findMany({
          where,
          orderBy: { [sortBy]: sortOrder },
          skip: offset,
          take: limit,
        }),
        prismaClient.hydraulicKnowledge.count({ where }),
      ])

      const recuento = await recuentoDeIndexado(prismaClient, documents.map((d: any) => d.id))

      const formattedDocs = documents.map((doc: any) => {
        const { total, conEmbedding } = recuento.get(doc.id) ?? { total: 0, conEmbedding: 0 }
        return {
        id: doc.id,
        title: doc.title,
        category: doc.category,
        subcategory: doc.subcategory,
        region: doc.region,
        language: doc.language,
        version: doc.version,
        status: doc.status,
        tags: doc.secondaryCategories ? (() => { try { return JSON.parse(doc.secondaryCategories) } catch { return [] } })() : [],
        updatedAt: doc.updatedAt?.toISOString(),
        createdAt: doc.createdAt?.toISOString(),
        type: 'uploaded' as const,
        indexing: {
          totalChunks: total,
          chunksWithEmbeddings: conEmbedding,
          isIndexed: total > 0,
          hasEmbeddings: conEmbedding > 0,
          indexingComplete: total > 0 && conEmbedding === total,
          status: total === 0 ? 'not_indexed' : conEmbedding === total ? 'completed' : 'partial',
        },
        }
      })

      return {
        success: true,
        documents: formattedDocs,
        pagination: {
          offset,
          limit,
          totalCount,
          hasMore: offset + limit < totalCount,
        },
      }
    } catch (error: any) {
      console.error('List paginated error:', error)
      return { success: false, documents: [], pagination: { offset: 0, limit: 50, totalCount: 0, hasMore: false }, message: error.message }
    }
  })
}

// Helper functions
function getColorForCategory(category: string): string {
  const colors = {
    'hydraulics': '#3b82f6',
    'regulations': '#ef4444',
    'best-practices': '#10b981',
    'fuentes-hidrologia': '#8b5cf6',
    'obras-toma': '#f59e0b',
    'hidraulica-aducciones': '#06b6d4',
    'potabilizacion': '#84cc16',
    'almacenamiento': '#f97316',
    'bombeo': '#ec4899',
    'redes-distribucion': '#6366f1',
    'aguas-servidas': '#14b8a6',
    'tratamiento': '#a855f7',
    'cadena-valor': '#64748b'
  }
  return colors[category as keyof typeof colors] || '#6b7280'
}

