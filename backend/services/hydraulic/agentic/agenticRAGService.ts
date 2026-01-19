import { PrismaClient } from '@prisma/client'
import {
  AgenticRAGConfig,
  AgenticRAGState,
  NodeName,
  RAGMetrics,
  NodeResult
} from './types'
import { StateManager, createStateManager } from './stateManager'
import { createRetrieveNode } from './nodes/retrieveNode'
import { createGradeNode } from './nodes/gradeNode'
import { createGenerateNode } from './nodes/generateNode'
import { createReformulateNode } from './nodes/reformulateNode'
import { createWebSearchNode } from './nodes/webSearchNode'

export class AgenticRAGService {
  private prisma: PrismaClient
  private config: AgenticRAGConfig
  private nodes: Record<string, any>
  private metrics: RAGMetrics

  constructor(prisma: PrismaClient, config?: Partial<AgenticRAGConfig>) {
    this.prisma = prisma
    this.config = this.buildConfig(config)
    this.nodes = this.initializeNodes()
    this.metrics = this.initializeMetrics()
  }

  private buildConfig(customConfig?: Partial<AgenticRAGConfig>): AgenticRAGConfig {
    const defaultConfig: AgenticRAGConfig = {
      retrieval: {
        topK: 10,
        minScore: 0.3,
        useParentChild: true,
        includeMetadata: true
      },
      grading: {
        relevanceThreshold: 0.5, // Lowered from 0.7 for broader retrieval
        requireTechnicalContent: true,
        checkStandardsAlignment: true,
        strictRegionMatch: false
      },
      generation: {
        temperature: 0.3,
        maxTokens: 2000,
        includeCitations: true,
        includeCalculations: true,
        responseLanguage: 'es',
        technicalLevel: 'intermediate'
      },
      webSearch: {
        enabled: process.env.WEB_SEARCH_ENABLED === 'true',
        provider: 'brave',
        maxResults: 5,
        technicalSitesOnly: true,
        excludeDomains: []
      },
      maxIterations: 3,
      confidenceThreshold: 0.85,
      enableCaching: true,
      debugMode: process.env.AGENTIC_DEBUG === 'true'
    }

    // Deep merge custom config
    return this.deepMerge(defaultConfig, customConfig || {})
  }

  private initializeNodes(): Record<string, any> {
    return {
      retrieve: createRetrieveNode(this.prisma, this.config.retrieval),
      grade: createGradeNode(this.config.grading),
      generate: createGenerateNode(this.config.generation),
      reformulate: createReformulateNode(),
      webSearch: createWebSearchNode(this.config.webSearch)
    }
  }

  private initializeMetrics(): RAGMetrics {
    return {
      totalQueries: 0,
      averageLatency: 0,
      nodeMetrics: {
        retrieve: { executions: 0, averageDuration: 0, errorRate: 0 },
        grade: { executions: 0, averageDuration: 0, errorRate: 0 },
        generate: { executions: 0, averageDuration: 0, errorRate: 0 },
        reformulate: { executions: 0, averageDuration: 0, errorRate: 0 },
        webSearch: { executions: 0, averageDuration: 0, errorRate: 0 },
        end: { executions: 0, averageDuration: 0, errorRate: 0 }
      },
      cacheHitRate: 0,
      webSearchRate: 0,
      confidenceDistribution: []
    }
  }

  async query(
    question: string,
    options?: {
      categories?: string[]
      regions?: string[]
      forceWebSearch?: boolean
      technicalLevel?: 'basic' | 'intermediate' | 'advanced'
    }
  ): Promise<{
    answer: string
    confidence: number
    sources: any[]
    metrics: any
  }> {
    const startTime = Date.now()
    const stateManager = createStateManager(question)

    // Apply query-specific options
    if (options) {
      if (options.categories) {
        this.config.retrieval.categories = options.categories
      }
      if (options.regions) {
        this.config.retrieval.regions = options.regions
      }
      if (options.forceWebSearch) {
        stateManager.updateState({ shouldWebSearch: true })
      }
      if (options.technicalLevel) {
        this.config.generation.technicalLevel = options.technicalLevel
      }
    }

    // Propagate config updates to nodes
    if (this.nodes.retrieve && typeof this.nodes.retrieve.setConfig === 'function') {
      this.nodes.retrieve.setConfig(this.config.retrieval)
    }
    // We can add similar propagation for generate/webSearch if we add setConfig to them later
    if (this.nodes.generate && typeof this.nodes.generate.setConfig === 'function') {
      this.nodes.generate.setConfig(this.config.generation)
    }
    if (this.nodes.grade && typeof this.nodes.grade.setConfig === 'function') {
      this.nodes.grade.setConfig(this.config.grading)
    }

    try {
      // Execute the agentic workflow
      await this.executeWorkflow(stateManager)

      // Get final state
      const finalState = stateManager.getState()

      // Update metrics
      this.updateMetrics(finalState, Date.now() - startTime)

      // Format response
      return {
        answer: finalState.generation || 'No se pudo generar una respuesta.',
        confidence: finalState.confidence,
        sources: this.formatSources(finalState),
        metrics: {
          processingTime: finalState.processingTime,
          iterations: finalState.iteration,
          nodesVisited: finalState.nodesVisited,
          documentsRetrieved: finalState.retrievedDocuments.length,
          webSearchUsed: finalState.webSearchResults.length > 0,
          reformulationUsed: finalState.reformulatedQueries.length > 0
        }
      }
    } catch (error) {
      console.error('[AgenticRAGService] Query error:', error)

      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'

      return {
        answer: 'Ocurrió un error al procesar tu consulta. Por favor, intenta reformular tu pregunta.',
        confidence: 0,
        sources: [],
        metrics: {
          processingTime: Date.now() - startTime,
          error: errorMessage
        }
      }
    }
  }

  private async executeWorkflow(stateManager: StateManager): Promise<void> {
    let currentNode: NodeName = 'retrieve'

    while (currentNode !== 'end' && stateManager.shouldContinue()) {
      if (this.config.debugMode) {
        console.log(`[AgenticRAG] Executing node: ${currentNode}`)
      }

      // Track node visit
      stateManager.addVisitedNode(currentNode)

      // Execute current node
      const result = await this.executeNode(currentNode, stateManager)

      if (!result.success && !result.nextNode) {
        break
      }

      // Determine next node
      currentNode = (result.nextNode || stateManager.getNextNode(currentNode) || 'end') as NodeName

      // Increment iteration
      if (!stateManager.incrementIteration()) {
        break
      }
    }
  }

  private async executeNode(
    nodeName: NodeName,
    stateManager: StateManager
  ): Promise<NodeResult> {
    const node = this.nodes[nodeName]

    if (!node) {
      console.error(`[AgenticRAG] Node ${nodeName} not found`)
      return { success: false, error: `Node ${nodeName} not found` }
    }

    const nodeStartTime = Date.now()
    let result: NodeResult

    try {
      result = await node.execute(stateManager.getState(), stateManager)

      // Update node metrics
      const duration = Date.now() - nodeStartTime
      this.updateNodeMetrics(nodeName, duration, !result.success)

    } catch (error) {
      console.error(`[AgenticRAG] Node ${nodeName} execution error:`, error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      result = {
        success: false,
        error: errorMessage,
        nextNode: 'end'
      }

      this.updateNodeMetrics(nodeName, Date.now() - nodeStartTime, true)
    }

    return result
  }

  private updateNodeMetrics(
    nodeName: string,
    duration: number,
    isError: boolean
  ): void {
    const metrics = this.metrics.nodeMetrics[nodeName as NodeName]
    if (!metrics) return

    metrics.executions++
    metrics.averageDuration =
      (metrics.averageDuration * (metrics.executions - 1) + duration) / metrics.executions

    if (isError) {
      metrics.errorRate =
        (metrics.errorRate * (metrics.executions - 1) + 1) / metrics.executions
    } else {
      metrics.errorRate =
        (metrics.errorRate * (metrics.executions - 1)) / metrics.executions
    }
  }

  private updateMetrics(state: AgenticRAGState, totalDuration: number): void {
    this.metrics.totalQueries++

    // Update average latency
    this.metrics.averageLatency =
      (this.metrics.averageLatency * (this.metrics.totalQueries - 1) + totalDuration) /
      this.metrics.totalQueries

    // Update web search rate
    if (state.webSearchResults.length > 0) {
      this.metrics.webSearchRate =
        (this.metrics.webSearchRate * (this.metrics.totalQueries - 1) + 1) /
        this.metrics.totalQueries
    } else {
      this.metrics.webSearchRate =
        (this.metrics.webSearchRate * (this.metrics.totalQueries - 1)) /
        this.metrics.totalQueries
    }

    // Update confidence distribution
    this.metrics.confidenceDistribution.push(state.confidence)
  }

  private formatSources(state: AgenticRAGState): any[] {
    // Format and deduplicate sources

    const uniqueSources = new Map<string, any>()

    state.gradedDocuments
      .filter(doc => doc.relevant)
      .forEach(doc => {
        // Use title as key to deduplicate effectively for the UI
        const key = doc.metadata.source || doc.metadata.title || 'Unknown'

        if (!uniqueSources.has(key) || (doc.relevanceScore > uniqueSources.get(key).relevance)) {
          uniqueSources.set(key, {
            id: doc.id,
            type: 'document',
            title: key,
            relevance: doc.relevanceScore,
            page: doc.metadata.page,
            section: doc.metadata.section,
            category: doc.metadata.category,
            content: doc.content // CRITICAL: Include content for chatStore to use
          })
        }
      })

    const sources = Array.from(uniqueSources.values())

    console.log(`[AgenticRAG] FormatSources: ${sources.length} unique sources qualified (from ${state.gradedDocuments.length} graded candidates).`)

    // Add web sources
    state.webSearchResults.forEach(doc => {
      sources.push({
        id: doc.id,
        type: 'web',
        title: doc.metadata.section || 'Web result',
        url: doc.metadata.source,
        relevance: 0.7
      })
    })

    // Add citations
    state.citations.forEach(citation => {
      const existingSource = sources.find(s => s.id === citation.documentId)
      if (existingSource) {
        existingSource.cited = true
        existingSource.citationConfidence = citation.confidence
      }
    })

    // Sort by relevance and citation
    return sources.sort((a, b) => {
      if (a.cited && !b.cited) return -1
      if (!a.cited && b.cited) return 1
      return (b.relevance || 0) - (a.relevance || 0)
    })
  }

  getMetrics(): RAGMetrics {
    return { ...this.metrics }
  }

  resetMetrics(): void {
    this.metrics = this.initializeMetrics()
  }

  private deepMerge(target: any, source: any): any {
    const result = { ...target }

    for (const key in source) {
      if (source[key] instanceof Object && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(target[key] || {}, source[key])
      } else {
        result[key] = source[key]
      }
    }

    return result
  }
}

// Factory function
export function createAgenticRAGService(
  prisma: PrismaClient,
  config?: Partial<AgenticRAGConfig>
): AgenticRAGService {
  return new AgenticRAGService(prisma, config)
}