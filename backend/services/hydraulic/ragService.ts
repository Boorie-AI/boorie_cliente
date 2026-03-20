import { PrismaClient } from '@prisma/client'
import { HydraulicDocument } from '../../../src/types/hydraulic'
import { EmbeddingService } from '../embedding.service'

export interface RAGSearchOptions {
  category?: 'hydraulics' | 'regulations' | 'best-practices'
  region?: string
  language?: string
  limit?: number
  minScore?: number
}

export interface RAGSearchResult {
  document: HydraulicDocument
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
    const {
      limit = 5,
      minScore = 0.6
    } = options

    try {
      const milvusService = (await import('../milvus.service')).MilvusService.getInstance()

      // Generate embedding for query
      const queryEmbedding = await this.embeddingService.generateEmbedding(query)

      // Perform Milvus Search
      const searchRes = await milvusService.search(
        'hydraulic_knowledge', // Hardcoded for now or use MilvusService.COLLECTIONS.KNOWLEDGE
        queryEmbedding,
        limit * 3 // Fetch more chunks to aggregate
      )

      if (!searchRes.results || searchRes.results.length === 0) {
        return []
      }

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

      const documents = await this.prisma.hydraulicKnowledge.findMany({
        where: { id: { in: docIds } }
      })

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
        } catch (e) { }

        results.push({
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
      return results.slice(0, limit)

    } catch (error) {
      console.error('RAG search error:', error)
      throw new Error('Failed to search hydraulic knowledge base')
    }
  }

  // Add new document to knowledge base
  async addDocument(
    document: Omit<HydraulicDocument, 'id' | 'lastUpdated'>,
    onProgress?: (progress: { current: number; total: number; message: string }) => void
  ): Promise<string> {
    try {
      // Generate chunks from content
      const chunks = this.chunkDocument(document.content, {
        maxChunkSize: 1000, // Larger chunks = fewer embeddings = faster indexing
        overlap: 150
      })

      console.log(`[RAG Service] Chunked document into ${chunks.length} parts`)

      // Helper for timeout
      const generateWithTimeout = async (text: string, timeoutMs: number = 60000) => {
        return Promise.race([
          this.embeddingService.generateEmbedding(text),
          new Promise<number[]>((_, reject) =>
            setTimeout(() => reject(new Error('Embedding generation timed out')), timeoutMs)
          )
        ])
      }

      // Process embeddings in concurrent batches for much faster indexing
      const CONCURRENCY = 3 // Process 3 chunks at a time
      const chunkEmbeddings: (number[] | null)[] = new Array(chunks.length).fill(null)
      const chunkTimings: number[] = []
      let completedCount = 0

      for (let batchStart = 0; batchStart < chunks.length; batchStart += CONCURRENCY) {
        const batchEnd = Math.min(batchStart + CONCURRENCY, chunks.length)
        const batchIndices = Array.from({ length: batchEnd - batchStart }, (_, k) => batchStart + k)

        const batchPromises = batchIndices.map(async (i) => {
          const chunk = chunks[i]
          const chunkStart = Date.now()

          try {
            const embedding = await generateWithTimeout(chunk, 60000)
            chunkEmbeddings[i] = embedding

            const duration = Date.now() - chunkStart
            chunkTimings.push(duration)

            if (duration > 5000) {
              console.warn(`[RAG Service] Slow embedding for chunk ${i + 1}: ${duration}ms`)
            }
          } catch (err: any) {
            console.error(`[RAG Service] Failed embedding for chunk ${i + 1}:`, err.message)
            chunkEmbeddings[i] = null
          }
        })

        await Promise.all(batchPromises)
        completedCount = batchEnd

        // Report progress with ETA
        if (onProgress) {
          const avgTime = chunkTimings.length > 0
            ? chunkTimings.reduce((a, b) => a + b, 0) / chunkTimings.length
            : 0
          const remainingChunks = chunks.length - completedCount
          const etaSeconds = Math.round((avgTime * remainingChunks / CONCURRENCY) / 1000)
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

      // Filter out chunks with failed embeddings
      const successfulChunks = chunks
        .map((chunk, index) => ({ content: chunk, embedding: chunkEmbeddings[index], chunkIndex: index }))
        .filter(item => item.embedding !== null)

      const failedCount = chunks.length - successfulChunks.length
      if (failedCount > 0) {
        console.warn(`[RAG Service] ${failedCount}/${chunks.length} chunks failed embedding generation`)
      }

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
          chunks: {
            create: successfulChunks.map(item => ({
              content: item.content,
              embedding: JSON.stringify(item.embedding),
              chunkIndex: item.chunkIndex
            }))
          }
        },
        include: {
          chunks: true
        }
      })

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
            category: created.category
          },
          timestamp: created.createdAt.getTime()
        }))

        if (milvusRows.length > 0) {
          await milvusService.insert('hydraulic_knowledge', milvusRows)
          console.log(`[RAG Service] Inserted ${milvusRows.length} chunks into Milvus for doc ${created.title}`)
        }
      } catch (milvusErr) {
        console.error('[RAG Service] Failed to insert into Milvus immediately:', milvusErr)
      }

      return created.id

    } catch (error: any) {
      console.error('Add document error:', error)
      throw new Error(`Failed to add document to knowledge base: ${error.message || error}`)
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
  private chunkDocument(
    content: string,
    options: { maxChunkSize: number; overlap: number }
  ): string[] {
    const { maxChunkSize, overlap } = options
    const chunks: string[] = []

    // Split by paragraphs first
    const paragraphs = content.split(/\n\n+/)

    let currentChunk = ''

    for (const paragraph of paragraphs) {
      if (currentChunk.length + paragraph.length > maxChunkSize) {
        if (currentChunk) {
          chunks.push(currentChunk.trim())

          // Add overlap from end of current chunk
          const overlapText = currentChunk
            .split(' ')
            .slice(-Math.floor(overlap / 10))
            .join(' ')

          currentChunk = overlapText + ' ' + paragraph
        } else {
          // Paragraph is too long, split it
          const words = paragraph.split(' ')
          let tempChunk = ''

          for (const word of words) {
            // Handle words that are longer than maxChunkSize themselves
            if (word.length > maxChunkSize) {
              // Write out anything currently in tempChunk
              if (tempChunk) {
                chunks.push(tempChunk.trim())
                tempChunk = ''
              }

              // Split the long word into chunks
              let remainingWord = word
              while (remainingWord.length > 0) {
                const subChunk = remainingWord.slice(0, maxChunkSize)
                remainingWord = remainingWord.slice(maxChunkSize)

                if (remainingWord.length > 0) {
                  // If we still have more, push this chunk
                  chunks.push(subChunk)
                } else {
                  // If this is the last piece, it becomes the new tempChunk
                  tempChunk = subChunk
                }
              }
            } else if (tempChunk.length + word.length + 1 > maxChunkSize) {
              // Word doesn't fit in current chunk
              chunks.push(tempChunk.trim())
              tempChunk = word
            } else {
              // Word fits
              tempChunk += (tempChunk ? ' ' : '') + word
            }
          }

          currentChunk = tempChunk
        }
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + paragraph
      }
    }

    if (currentChunk) {
      if (currentChunk.length > maxChunkSize) {
        // Hard chop if still too long (e.g. single massive word case not caught above)
        let remaining = currentChunk
        while (remaining.length > 0) {
          chunks.push(remaining.slice(0, maxChunkSize).trim())
          remaining = remaining.slice(maxChunkSize)
        }
      } else {
        chunks.push(currentChunk.trim())
      }
    }

    return chunks
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

