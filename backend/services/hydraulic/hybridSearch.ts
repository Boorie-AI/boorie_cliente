import type { PrismaClient } from '@prisma/client'
import { EmbeddingService } from '../embedding.service'

export interface SearchResult {
  id: string
  content: string
  score: number
  method: 'semantic' | 'bm25' | 'hybrid'
  metadata?: any
}

interface BM25Score {
  id: string
  score: number
  content: string
}

interface HybridSearchOptions {
  topK?: number
  alpha?: number // Weight for semantic vs BM25 (0.0 = only BM25, 1.0 = only semantic)
  minSemanticScore?: number
  minBM25Score?: number
  category?: string
  region?: string
  language?: string
  rerank?: boolean
}

export class HybridSearchService {
  private prisma: PrismaClient
  private embeddingService: any

  // BM25 parameters
  private k1: number = 1.2
  private b: number = 0.75

  constructor(prisma: PrismaClient, embeddingService?: any) {
    this.prisma = prisma
    this.embeddingService = embeddingService || new EmbeddingService(prisma) // Fix: Pass prisma to EmbeddingService
  }

  /**
   * Búsqueda híbrida que combina BM25 y búsqueda semántica
   */
  async hybridSearch(
    query: string,
    options: HybridSearchOptions = {}
  ): Promise<SearchResult[]> {
    const {
      topK = 10,
      alpha = 0.6, // Favor semantic search by default
      minSemanticScore = 0.3,
      minBM25Score = 0.1,
      category,
      region,
      language = 'es',
      rerank = true
    } = options

    try {
      // 1. Obtener documentos candidatos con filtros
      const candidates = await this.getCandidateDocuments({
        category,
        region,
        language
      })

      if (candidates.length === 0) {
        return []
      }

      // 2. Búsqueda semántica
      const semanticResults = await this.semanticSearch(query, candidates, topK * 2)

      // 3. Búsqueda BM25
      const bm25Results = await this.bm25Search(query, candidates, topK * 2)

      // 4. Combinar y normalizar scores
      const hybridResults = this.combineSearchResults(
        semanticResults,
        bm25Results,
        alpha
      )

      // 5. Re-ranking opcional
      let finalResults = hybridResults
      if (rerank && hybridResults.length > topK) {
        finalResults = await this.rerankResults(query, hybridResults, topK)
      }

      // 6. Filtrar por scores mínimos y limitar resultados
      return finalResults
        .filter(result =>
          (result.method === 'semantic' && result.score >= minSemanticScore) ||
          (result.method === 'bm25' && result.score >= minBM25Score) ||
          (result.method === 'hybrid')
        )
        .slice(0, topK)

    } catch (error) {
      console.error('Hybrid search error:', error)
      throw new Error('Failed to perform hybrid search')
    }
  }

  /**
   * Búsqueda semántica usando embeddings
   */
  private async semanticSearch(
    query: string,
    candidates: any[],
    limit: number
  ): Promise<SearchResult[]> {
    try {
      // Generar embedding para la consulta
      const queryEmbedding = await this.embeddingService.generateEmbedding(query)

      const results: SearchResult[] = []

      for (const doc of candidates) {
        // Calcular similitud con cada chunk
        const chunkScores: Array<{ chunk: any, score: number }> = []

        for (const chunk of doc.chunks) {
          if (!chunk.embedding) continue

          try {
            const chunkEmbedding = JSON.parse(chunk.embedding)
            const similarity = this.cosineSimilarity(queryEmbedding, chunkEmbedding)

            if (similarity > 0.1) { // Filtro mínimo
              chunkScores.push({
                chunk,
                score: similarity
              })
            }
          } catch (e) {
            console.warn(`Invalid embedding format for chunk ${chunk.id}`)
            continue
          }
        }

        if (chunkScores.length > 0) {
          // Usar el mejor chunk como score del documento
          chunkScores.sort((a, b) => b.score - a.score)
          const bestChunk = chunkScores[0]

          results.push({
            id: doc.id,
            content: bestChunk.chunk.content,
            score: bestChunk.score,
            method: 'semantic',
            metadata: {
              documentTitle: doc.title,
              chunkId: bestChunk.chunk.id,
              category: doc.category,
              subcategory: doc.subcategory
            }
          })
        }
      }

      // Ordenar por score y limitar
      results.sort((a, b) => b.score - a.score)
      return results.slice(0, limit)

    } catch (error) {
      console.error('Semantic search error:', error)
      return []
    }
  }

  /**
   * Búsqueda BM25 (Best Matching 25)
   */
  private async bm25Search(
    query: string,
    candidates: any[],
    limit: number
  ): Promise<SearchResult[]> {
    try {
      // Preparar términos de consulta
      const queryTerms = this.tokenizeQuery(query)
      if (queryTerms.length === 0) return []

      // Preparar corpus para BM25
      const corpus = this.prepareCorpus(candidates)
      const avgDocLength = this.calculateAverageDocumentLength(corpus)

      // Calcular IDF para cada término
      const idfScores = this.calculateIDF(queryTerms, corpus)

      const results: SearchResult[] = []

      for (const doc of candidates) {
        for (const chunk of doc.chunks) {
          const docTerms = this.tokenizeText(chunk.content)
          const docLength = docTerms.length

          if (docLength === 0) continue

          let bm25Score = 0

          for (const term of queryTerms) {
            const tf = this.calculateTermFrequency(term, docTerms)
            const idf = idfScores[term] || 0

            if (tf > 0) {
              const score = idf * (tf * (this.k1 + 1)) /
                (tf + this.k1 * (1 - this.b + this.b * (docLength / avgDocLength)))
              bm25Score += score
            }
          }

          if (bm25Score > 0) {
            results.push({
              id: `${doc.id}_${chunk.id}`,
              content: chunk.content,
              score: bm25Score,
              method: 'bm25',
              metadata: {
                documentTitle: doc.title,
                chunkId: chunk.id,
                category: doc.category,
                subcategory: doc.subcategory,
                docId: doc.id
              }
            })
          }
        }
      }

      // Ordenar por score y limitar
      results.sort((a, b) => b.score - a.score)
      return results.slice(0, limit)

    } catch (error) {
      console.error('BM25 search error:', error)
      return []
    }
  }

  /**
   * Combina resultados de búsqueda semántica y BM25
   */
  private combineSearchResults(
    semanticResults: SearchResult[],
    bm25Results: SearchResult[],
    alpha: number
  ): SearchResult[] {
    // Normalizar scores
    const normalizedSemantic = this.normalizeScores(semanticResults)
    const normalizedBM25 = this.normalizeScores(bm25Results)

    // Crear mapa para combinar resultados
    const combinedMap = new Map<string, SearchResult>()

    // Agregar resultados semánticos
    for (const result of normalizedSemantic) {
      combinedMap.set(result.id, {
        ...result,
        score: alpha * result.score,
        method: 'hybrid' as const
      })
    }

    // Agregar/combinar resultados BM25
    for (const result of normalizedBM25) {
      const existing = combinedMap.get(result.id)
      if (existing) {
        // Combinar scores
        existing.score = existing.score + (1 - alpha) * result.score
      } else {
        combinedMap.set(result.id, {
          ...result,
          score: (1 - alpha) * result.score,
          method: 'hybrid' as const
        })
      }
    }

    // Convertir a array y ordenar
    const combinedResults = Array.from(combinedMap.values())
    combinedResults.sort((a, b) => b.score - a.score)

    return combinedResults
  }

  /**
   * Re-ranking usando modelo más sofisticado
   */
  private async rerankResults(
    query: string,
    results: SearchResult[],
    topK: number
  ): Promise<SearchResult[]> {
    try {
      // Implementar re-ranking simple basado en:
      // 1. Presencia de términos exactos
      // 2. Densidad técnica del contenido
      // 3. Longitud apropiada del chunk

      const queryTermsLower = this.tokenizeQuery(query.toLowerCase())

      for (const result of results) {
        const contentLower = result.content.toLowerCase()
        let rerankBonus = 0

        // Bonus por términos exactos
        const exactMatches = queryTermsLower.filter(term =>
          contentLower.includes(term.toLowerCase())
        ).length
        rerankBonus += (exactMatches / queryTermsLower.length) * 0.2

        // Bonus por densidad técnica
        const technicalDensity = this.calculateTechnicalDensity(result.content)
        rerankBonus += technicalDensity * 0.1

        // Bonus por longitud apropiada (ni muy corto ni muy largo)
        const length = result.content.length
        if (length >= 200 && length <= 1500) {
          rerankBonus += 0.1
        }

        // Aplicar bonus
        result.score = result.score * (1 + rerankBonus)
      }

      // Re-ordenar y limitar
      results.sort((a, b) => b.score - a.score)
      return results.slice(0, topK)

    } catch (error) {
      console.error('Re-ranking error:', error)
      return results.slice(0, topK)
    }
  }

  /**
   * Obtiene documentos candidatos con filtros
   */
  private async getCandidateDocuments(filters: {
    category?: string
    region?: string
    language?: string
  }): Promise<any[]> {
    const whereClause: any = {
      status: 'active'
    }

    if (filters.category) {
      whereClause.category = filters.category
    }

    if (filters.language) {
      whereClause.language = filters.language
    }

    if (filters.region) {
      whereClause.region = {
        contains: filters.region
      }
    }

    const documents = await this.prisma.hydraulicKnowledge.findMany({
      where: whereClause,
      include: {
        chunks: true
      },
      take: 1000 // Increased limit to ensure better coverage
    })

    return documents
  }

  /**
   * Funciones auxiliares para BM25
   */
  private tokenizeQuery(query: string): string[] {
    return this.tokenizeText(query)
  }

  private tokenizeText(text: string): string[] {
    if (!text) return []

    // Normalizar y tokenizar
    return text
      .toLowerCase()
      .replace(/[^\w\sáéíóúñü]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length > 2) // Filtrar palabras muy cortas
      .filter(token => !this.isStopWord(token))
  }

  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      'el', 'la', 'de', 'que', 'y', 'a', 'en', 'un', 'es', 'se', 'no', 'te', 'lo', 'le',
      'da', 'su', 'por', 'son', 'con', 'para', 'al', 'del', 'los', 'las', 'una', 'como',
      'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from'
    ])
    return stopWords.has(word)
  }

  private prepareCorpus(documents: any[]): string[][] {
    const corpus: string[][] = []

    for (const doc of documents) {
      for (const chunk of doc.chunks) {
        const tokens = this.tokenizeText(chunk.content)
        if (tokens.length > 0) {
          corpus.push(tokens)
        }
      }
    }

    return corpus
  }

  private calculateAverageDocumentLength(corpus: string[][]): number {
    if (corpus.length === 0) return 0

    const totalLength = corpus.reduce((sum, doc) => sum + doc.length, 0)
    return totalLength / corpus.length
  }

  private calculateIDF(queryTerms: string[], corpus: string[][]): Record<string, number> {
    const idfScores: Record<string, number> = {}
    const docCount = corpus.length

    for (const term of queryTerms) {
      const docsWithTerm = corpus.filter(doc => doc.includes(term)).length
      if (docsWithTerm > 0) {
        idfScores[term] = Math.log((docCount - docsWithTerm + 0.5) / (docsWithTerm + 0.5))
      }
    }

    return idfScores
  }

  private calculateTermFrequency(term: string, docTerms: string[]): number {
    return docTerms.filter(t => t === term).length
  }

  private normalizeScores(results: SearchResult[]): SearchResult[] {
    if (results.length === 0) return results

    const maxScore = Math.max(...results.map(r => r.score))
    if (maxScore === 0) return results

    return results.map(result => ({
      ...result,
      score: result.score / maxScore
    }))
  }

  private calculateTechnicalDensity(text: string): number {
    const technicalTerms = [
      'presión', 'pressure', 'caudal', 'flow', 'diámetro', 'diameter',
      'tubería', 'pipe', 'bomba', 'pump', 'válvula', 'valve',
      'hidráulico', 'hydraulic', 'agua', 'water', 'red', 'network'
    ]

    const textLower = text.toLowerCase()
    const words = textLower.split(/\s+/)
    const technicalCount = words.filter(word =>
      technicalTerms.some(term => word.includes(term))
    ).length

    return words.length > 0 ? technicalCount / words.length : 0
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0

    let dotProduct = 0
    let normA = 0
    let normB = 0

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i]
      normA += a[i] * a[i]
      normB += b[i] * b[i]
    }

    const norm = Math.sqrt(normA) * Math.sqrt(normB)
    return norm === 0 ? 0 : dotProduct / norm
  }

  /**
   * Método público para búsqueda rápida
   */
  async quickSearch(query: string, options?: {
    category?: string
    topK?: number
  }): Promise<SearchResult[]> {
    return this.hybridSearch(query, {
      ...options,
      alpha: 0.7, // Favor semantic search for quick searches
      rerank: false // Skip re-ranking for speed
    })
  }

  /**
   * Método público para búsqueda avanzada
   */
  async advancedSearch(query: string, options?: HybridSearchOptions): Promise<SearchResult[]> {
    return this.hybridSearch(query, {
      alpha: 0.6,
      rerank: true,
      ...options
    })
  }
}