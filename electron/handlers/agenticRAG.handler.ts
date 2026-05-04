import { ipcMain } from 'electron'
import { PrismaClient } from '@prisma/client'
import { createAgenticRAGService } from '../../backend/services/hydraulic/agentic/agenticRAGService'
import { guardrailsWrapper } from '../../backend/services/guardrails/guardrailsWrapper'

let ragService: any = null

async function auditViolation(
  prismaClient: PrismaClient,
  rail: 'input' | 'retrieval' | 'output',
  verdict: { allow: boolean; reason: string; severity: string; judge_model: string; judge_provider: string },
  payload: any,
) {
  if (verdict.allow && !verdict.reason.startsWith('[advisory]')) return
  try {
    await prismaClient.guardrailViolation.create({
      data: {
        rail,
        severity: verdict.severity,
        reason: verdict.reason,
        blocked: !verdict.allow,
        judgeModel: verdict.judge_model,
        judgeProvider: verdict.judge_provider,
        payload: payload ? JSON.stringify(payload).slice(0, 4000) : null,
      },
    })
  } catch { /* ignore audit errors */ }
}

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

      // Guardrail: input rail
      const inputVerdict = await guardrailsWrapper.validateInput(question)
      await auditViolation(prismaClient, 'input', inputVerdict, { text: question })
      if (!inputVerdict.allow) {
        return {
          success: false,
          blockedBy: 'guardrail:input',
          severity: inputVerdict.severity,
          error: `Pregunta rechazada por guardrail (input): ${inputVerdict.reason}`,
        }
      }

      const result = await ragService.query(question, options)

      // Guardrail: retrieval rail (only if we have RAG sources)
      const sourceTexts: string[] = (result?.sources ?? [])
        .map((s: any) => s?.content ?? s?.text ?? '')
        .filter(Boolean)
      if (sourceTexts.length > 0) {
        const retrievalVerdict = await guardrailsWrapper.validateRetrieval(question, sourceTexts.slice(0, 8))
        await auditViolation(prismaClient, 'retrieval', retrievalVerdict, { query: question, chunkCount: sourceTexts.length })
        if (!retrievalVerdict.allow) {
          // For retrieval we don't block the whole answer; we attach a flag
          ;(result as any).retrievalBlocked = true
          ;(result as any).retrievalReason = retrievalVerdict.reason
        }
      }

      // Guardrail: output rail (fact-check vs RAG context)
      const answerText = String((result as any)?.answer ?? (result as any)?.response ?? '')
      if (answerText) {
        const contextText = sourceTexts.join('\n---\n').slice(0, 4000)
        const outputVerdict = await guardrailsWrapper.validateOutput(question, answerText, contextText)
        await auditViolation(prismaClient, 'output', outputVerdict, { user: question, answer: answerText.slice(0, 1500) })
        if (!outputVerdict.allow) {
          return {
            success: false,
            blockedBy: 'guardrail:output',
            severity: outputVerdict.severity,
            error: `Respuesta rechazada por guardrail (output): ${outputVerdict.reason}`,
            // include the unredacted answer so frontend can show it as
            // "flagged but available on request" if desired
            redactedAnswer: answerText.slice(0, 200),
          }
        }
      }

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