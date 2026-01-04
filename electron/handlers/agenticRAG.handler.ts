import { ipcMain } from 'electron'
import { PrismaClient } from '@prisma/client'
import { createAgenticRAGService } from '../../backend/services/hydraulic/agentic/agenticRAGService'

let ragService: any = null

export function registerAgenticRAGHandlers(prismaClient: PrismaClient) {
  console.log('[AgenticRAG Handler] Starting registration...')

  // Initialize service
  if (!ragService) {
    ragService = createAgenticRAGService(prismaClient)
  }

  // Query handler - Main agentic RAG query
  ipcMain.handle('agentic-rag-query', async (event, {
    question,
    options = {}
  }: {
    question: string
    options?: {
      categories?: string[]
      regions?: string[]
      searchTopK?: number
      forceWebSearch?: boolean
      technicalLevel?: 'basic' | 'intermediate' | 'advanced'
    }
  }) => {
    try {
      if (!question || question.trim().length === 0) {
        throw new Error('Question is required')
      }

      console.log('[AgenticRAG Handler] Processing query:', question)
      console.log('[AgenticRAG Handler] Options received:', options)

      const result = await ragService.query(question, options)

      return {
        success: true,
        data: result
      }
    } catch (error) {
      console.error('[AgenticRAG Handler] Query error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to process query'
      return {
        success: false,
        error: errorMessage
      }
    }
  })

  // Get metrics handler
  ipcMain.handle('agentic-rag-metrics', async () => {
    try {
      const metrics = ragService.getMetrics()

      return {
        success: true,
        data: metrics
      }
    } catch (error) {
      console.error('[AgenticRAG Handler] Metrics error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to get metrics'
      return {
        success: false,
        error: errorMessage
      }
    }
  })

  // Reset metrics handler
  ipcMain.handle('agentic-rag-reset-metrics', async () => {
    try {
      ragService.resetMetrics()

      return {
        success: true
      }
    } catch (error) {
      console.error('[AgenticRAG Handler] Reset metrics error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to reset metrics'
      return {
        success: false,
        error: errorMessage
      }
    }
  })

  // Test configuration handler
  ipcMain.handle('agentic-rag-test-config', async () => {
    try {
      // Test basic connectivity
      const testQuery = 'Test: ¿Cómo calcular pérdida de carga?'
      const result = await ragService.query(testQuery, {
        technicalLevel: 'basic'
      })

      return {
        success: true,
        data: {
          configured: true,
          ollamaAvailable: result.confidence > 0,
          webSearchEnabled: process.env.WEB_SEARCH_ENABLED === 'true',
          braveApiConfigured: !!process.env.BRAVE_SEARCH_API_KEY,
          testResult: {
            confidence: result.confidence,
            sourcesFound: result.sources.length
          }
        }
      }
    } catch (error) {
      console.error('[AgenticRAG Handler] Test config error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Configuration test failed'
      return {
        success: false,
        error: errorMessage,
        data: {
          configured: false,
          ollamaAvailable: false,
          webSearchEnabled: false,
          braveApiConfigured: false
        }
      }
    }
  })

  // Document indexing status handler
  ipcMain.handle('agentic-rag-indexing-status', async () => {
    try {
      // Get document counts
      const [
        totalDocuments,
        indexedDocuments,
        totalChunks
      ] = await Promise.all([
        prismaClient.document.count(),
        prismaClient.document.count(),
        prismaClient.documentChunk.count()
      ])

      // Get knowledge base stats
      const knowledgeStats = await prismaClient.hydraulicKnowledge.groupBy({
        by: ['category'],
        _count: true
      })

      return {
        success: true,
        data: {
          documents: {
            total: totalDocuments,
            indexed: indexedDocuments,
            pending: totalDocuments - indexedDocuments
          },
          chunks: {
            total: totalChunks
          },
          knowledge: knowledgeStats.reduce((acc, stat) => {
            acc[stat.category || 'uncategorized'] = stat._count
            return acc
          }, {} as Record<string, number>)
        }
      }
    } catch (error) {
      console.error('[AgenticRAG Handler] Indexing status error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to get indexing status'
      return {
        success: false,
        error: errorMessage
      }
    }
  })

  console.log('[AgenticRAG Handler] Registration completed successfully')
}

// Export for use in main handler registry
export default registerAgenticRAGHandlers