import { PrismaClient } from '@prisma/client'
import { AgenticRAGState, Document, RetrievalResult, RetrievalConfig } from '../types'
import { StateManager } from '../stateManager'

import { EmbeddingService } from '../../../embedding.service'
// VectorService needs to be located or mocked if it doesn't exist yet, but assuming it exists somewhere or needs to be replaced.
// For now, let's fix EmbeddingService. 
// Note: VectorService was require('../../../vectorService'). I need to find where VectorService is.
// If it refers to 'hydraulic/hybridSearch', I should import that.
import { HybridSearchService } from '../../hybridSearch'

export class RetrieveNode {
  private prisma: PrismaClient
  private embeddingService: any
  private vectorService: any
  private config: RetrievalConfig

  constructor(prisma: PrismaClient, config: RetrievalConfig) {
    this.prisma = prisma
    this.embeddingService = new EmbeddingService(prisma)
    this.vectorService = new HybridSearchService(prisma, this.embeddingService)
    this.config = config
  }

  async execute(state: AgenticRAGState, stateManager: StateManager): Promise<RetrievalResult> {
    const startTime = Date.now()

    try {
      // Determine which query to use
      const query = this.selectQuery(state)

      // Multi-query retrieval if we have reformulations
      const documents = state.reformulatedQueries.length > 0
        ? await this.multiQueryRetrieval(state)
        : await this.singleQueryRetrieval(query, state)

      // Retrieve parent documents if enabled
      if (this.config.useParentChild && documents.length > 0) {
        const parentDocs = await this.retrieveParentDocuments(documents)
        stateManager.updateState({ parentDocuments: parentDocs })
      }

      // Update state with retrieved documents
      stateManager.updateState({
        retrievedDocuments: documents,
        currentQuery: query
      })

      return {
        success: true,
        data: {
          documents,
          queryEmbedding: await this.embeddingService.generateEmbedding(query),
          searchMethod: state.reformulatedQueries.length > 0 ? 'multiQuery' : 'hybrid'
        },
        nextNode: 'grade',
        metrics: {
          duration: Date.now() - startTime,
          apiCalls: state.reformulatedQueries.length || 1
        }
      }
    } catch (error) {
      console.error('[RetrieveNode] Error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      stateManager.addError('retrieve', errorMessage)

      return {
        success: false,
        error: errorMessage,
        data: {
          documents: [],
          queryEmbedding: [],
          searchMethod: 'hybrid'
        },
        nextNode: 'end'
      }
    }
  }

  private selectQuery(state: AgenticRAGState): string {
    // Use the most recent reformulation if available
    if (state.reformulatedQueries.length > 0) {
      return state.reformulatedQueries[state.reformulatedQueries.length - 1]
    }
    return state.currentQuery
  }

  private async singleQueryRetrieval(query: string, state: AgenticRAGState): Promise<Document[]> {
    try {
      // Generate embedding
      // const queryEmbedding = await this.embeddingService.generateEmbedding(query) // Not used directly here, handled inside hybridSearch

      // Attempt 1: Strict search with explicit filters
      let searchResults = await this.vectorService.hybridSearch(query, {
        topK: this.config.topK * 2, // Get more for filtering
        minSemanticScore: this.config.minScore,
        category: state.engineeringDomain === 'general' ? undefined : state.engineeringDomain,
        region: this.config.regions?.[0],
        language: state.queryLanguage
        // includeMetadata: this.config.includeMetadata
      })

      // Attempt 2: Fallback - Relaxed search if no/few results found
      // This handles cases where the domain might be misclassified or documents are uncategorized
      if (searchResults.length < 3) {
        console.log('[RetrieveNode] Strict search yielded few results. Retrying with relaxed filters.')

        const relaxedResults = await this.vectorService.hybridSearch(query, {
          topK: this.config.topK * 2,
          minSemanticScore: this.config.minScore * 0.8, // Slightly lower threshold
          // No category or region restriction
          // No language restriction in fallback to find documents even if language detection failed
        })

        // Merge results, preferring strict matches, deduping by ID
        const seenIds = new Set(searchResults.map((r: any) => r.id))
        for (const res of relaxedResults) {
          if (!seenIds.has(res.id)) {
            searchResults.push(res)
            seenIds.add(res.id)
          }
        }
      }

      // Convert and filter results
      return this.processSearchResults(searchResults, state)
    } catch (error) {
      console.error('[RetrieveNode] Single query retrieval error:', error)
      throw error // Re-throw to be caught by execute()
    }
  }

  private async multiQueryRetrieval(state: AgenticRAGState): Promise<Document[]> {
    try {
      const allQueries = [state.originalQuestion, ...state.reformulatedQueries]
      const allResults: Map<string, Document & { scores: number[] }> = new Map()

      // Execute searches in parallel
      const searchPromises = allQueries.map(query => this.singleQueryRetrieval(query, state))
      const searchResults = await Promise.all(searchPromises)

      // Combine results using Reciprocal Rank Fusion (RRF)
      searchResults.forEach((results, queryIndex) => {
        results.forEach((doc, rank) => {
          const docKey = doc.id

          if (!allResults.has(docKey)) {
            allResults.set(docKey, {
              ...doc,
              scores: new Array(allQueries.length).fill(0)
            })
          }

          // RRF score: 1 / (rank + k), where k = 60 is a constant
          const rrfScore = 1 / (rank + 60)
          allResults.get(docKey)!.scores[queryIndex] = rrfScore
        })
      })

      // Calculate final scores and sort
      const fusedResults = Array.from(allResults.values())
        .map(doc => ({
          ...doc,
          finalScore: doc.scores.reduce((sum, score) => sum + score, 0) / allQueries.length
        }))
        .sort((a, b) => b.finalScore - a.finalScore)
        .slice(0, this.config.topK)

      // Remove temporary scoring fields
      return fusedResults.map(({ scores, finalScore, ...doc }) => doc as Document)
    } catch (error) {
      console.error('[RetrieveNode] Multi-query retrieval error:', error)
      throw error
    }
  }

  private async retrieveParentDocuments(childDocs: Document[]): Promise<Document[]> {
    try {
      const parentIds = childDocs
        .map(doc => (doc.metadata as any).parentId)
        .filter(id => id != null) as string[]

      if (parentIds.length === 0) return []

      // Fetch parent documents from database
      const parents = await this.prisma.hydraulicKnowledge.findMany({
        where: {
          id: { in: [...new Set(parentIds)] }
        },
        select: {
          id: true,
          content: true,
          title: true,
          category: true,
          subcategory: true,
          region: true,
          language: true,
          metadata: true
        }
      })

      return parents.map(parent => ({
        id: parent.id,
        content: parent.content,
        metadata: {
          category: parent.category || undefined,
          region: parent.region || undefined,
          language: parent.language,
          ...(JSON.parse(parent.metadata || '{}'))
        }
      }))
    } catch (error) {
      console.error('[RetrieveNode] Parent retrieval error:', error)
      return []
    }
  }

  private processSearchResults(results: any[], state: AgenticRAGState): Document[] {
    return results
      .filter(result => {
        // Apply category filter
        if (this.config.categories && this.config.categories.length > 0) {
          const docCategory = result.metadata?.category || result.category
          if (!this.config.categories.includes(docCategory)) {
            return false
          }
        }

        // Apply region filter
        if (this.config.regions && this.config.regions.length > 0) {
          const docRegion = result.metadata?.region || result.region
          if (!this.config.regions.includes(docRegion)) {
            return false
          }
        }

        // Apply standards filter if applicable
        if (state.applicableStandards.length > 0) {
          const docStandards = result.metadata?.standards || []
          const hasMatchingStandard = state.applicableStandards.some(
            standard => docStandards.includes(standard)
          )
          if (!hasMatchingStandard && result.score < 0.8) {
            return false // Only strict filter if similarity is not very high
          }
        }

        return true
      })
      .slice(0, this.config.topK)
      .map(result => ({
        id: result.id,
        content: result.content,
        metadata: {
          source: result.metadata?.documentTitle || result.metadata?.source || (result as any).source || (result as any).title || 'Unknown',
          page: result.metadata?.page || (result as any).page,
          section: result.metadata?.section || (result as any).section,
          category: result.metadata?.category || (result as any).category,
          region: result.metadata?.region || (result as any).region,
          language: result.metadata?.language || (result as any).language || state.queryLanguage,
          standard: result.metadata?.standard,
          lastUpdated: result.metadata?.lastUpdated || (result as any).updated_at
        },
        embedding: [] // Embedding not returned by hybrid search
      }))
  }
}

// Factory function
export function createRetrieveNode(
  prisma: PrismaClient,
  customConfig?: Partial<RetrievalConfig>
): RetrieveNode {
  const defaultConfig: RetrievalConfig = {
    topK: parseInt(process.env.RETRIEVAL_TOP_K || '10'),
    minScore: parseFloat(process.env.RETRIEVAL_MIN_SCORE || '0.3'),
    useParentChild: process.env.USE_PARENT_CHILD === 'true',
    includeMetadata: true
  }

  const config = { ...defaultConfig, ...customConfig }
  return new RetrieveNode(prisma, config)
}