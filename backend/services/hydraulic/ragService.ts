import { PrismaClient } from '@prisma/client'
import { HydraulicDocument } from '../../../src/types/hydraulic'
const EmbeddingService = require('../embeddingService')

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
  
  constructor(prisma: PrismaClient) {
    this.prisma = prisma
    this.embeddingService = new EmbeddingService()
  }
  
  // Search hydraulic knowledge base
  async search(
    query: string,
    options: RAGSearchOptions = {}
  ): Promise<RAGSearchResult[]> {
    const {
      category,
      region,
      language = 'es',
      limit = 5,
      minScore = 0.7
    } = options
    
    try {
      // Generate embedding for query
      const queryEmbedding = await this.embeddingService.generateEmbedding(query)
      
      // Build search filters
      const filters: any = {
        status: 'active',
        language
      }
      
      if (category) {
        filters.category = category
      }
      
      if (region) {
        filters.region = {
          contains: region
        }
      }
      
      // Search knowledge base
      const documents = await this.prisma.hydraulicKnowledge.findMany({
        where: filters,
        include: {
          chunks: true
        }
      })
      
      // Calculate relevance scores and find relevant chunks
      const results: RAGSearchResult[] = []
      
      for (const doc of documents) {
        const chunks = doc.chunks
        const chunkScores: Array<{ chunk: any; score: number }> = []
        
        // Score each chunk
        for (const chunk of chunks) {
          const chunkEmbedding = JSON.parse(chunk.embedding)
          const score = this.cosineSimilarity(queryEmbedding, chunkEmbedding)
          
          if (score >= minScore) {
            chunkScores.push({ chunk, score })
          }
        }
        
        if (chunkScores.length > 0) {
          // Sort chunks by score
          chunkScores.sort((a, b) => b.score - a.score)
          
          // Calculate document score (average of top 3 chunks)
          const topScores = chunkScores.slice(0, 3).map(cs => cs.score)
          const docScore = topScores.reduce((a, b) => a + b, 0) / topScores.length
          
          // Extract relevant content
          const relevantChunks = chunkScores
            .slice(0, 3)
            .map(cs => cs.chunk.content)
          
          // Generate highlights
          const highlights = this.generateHighlights(query, relevantChunks)
          
          // Parse metadata
          const metadata = JSON.parse(doc.metadata)
          
          results.push({
            document: {
              id: doc.id,
              category: doc.category as any,
              subcategory: doc.subcategory,
              region: JSON.parse(doc.region),
              title: doc.title,
              content: doc.content,
              metadata: {
                ...metadata,
                keywords: JSON.parse(doc.keywords),
                language: doc.language
              },
              lastUpdated: doc.updatedAt,
              version: doc.version
            },
            score: docScore,
            relevantChunks,
            highlights
          })
        }
      }
      
      // Sort by score and limit results
      results.sort((a, b) => b.score - a.score)
      return results.slice(0, limit)
      
    } catch (error) {
      console.error('RAG search error:', error)
      throw new Error('Failed to search hydraulic knowledge base')
    }
  }
  
  // Add new document to knowledge base
  async addDocument(document: Omit<HydraulicDocument, 'id' | 'lastUpdated'>): Promise<string> {
    try {
      // Generate chunks from content
      const chunks = this.chunkDocument(document.content, {
        maxChunkSize: 1000,
        overlap: 200
      })
      
      // Generate embeddings for each chunk
      const chunkEmbeddings = await Promise.all(
        chunks.map(chunk => this.embeddingService.generateEmbedding(chunk))
      )
      
      // Create document in database
      const created = await this.prisma.hydraulicKnowledge.create({
        data: {
          category: document.category,
          subcategory: document.subcategory,
          region: JSON.stringify(document.region),
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
            create: chunks.map((chunk, index) => ({
              content: chunk,
              embedding: JSON.stringify(chunkEmbeddings[index]),
              chunkIndex: index
            }))
          }
        }
      })
      
      return created.id
      
    } catch (error) {
      console.error('Add document error:', error)
      throw new Error('Failed to add document to knowledge base')
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
          overlap: 200
        })
        
        const chunkEmbeddings = await Promise.all(
          chunks.map(chunk => this.embeddingService.generateEmbedding(chunk))
        )
        
        // Delete old chunks
        await this.prisma.knowledgeChunk.deleteMany({
          where: { knowledgeId: id }
        })
        
        // Create new chunks
        await this.prisma.knowledgeChunk.createMany({
          data: chunks.map((chunk, index) => ({
            knowledgeId: id,
            content: chunk,
            embedding: JSON.stringify(chunkEmbeddings[index]),
            chunkIndex: index
          }))
        })
        
        updateData.content = updates.content
      }
      
      if (updates.title) updateData.title = updates.title
      if (updates.category) updateData.category = updates.category
      if (updates.subcategory) updateData.subcategory = updates.subcategory
      if (updates.region) updateData.region = JSON.stringify(updates.region)
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
            if (tempChunk.length + word.length > maxChunkSize) {
              chunks.push(tempChunk.trim())
              tempChunk = word
            } else {
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
      chunks.push(currentChunk.trim())
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

