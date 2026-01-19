import { AgenticRAGState, GradedDocument, GradingResult, GradingConfig, Document } from '../types'
import { StateManager } from '../stateManager'
import axios from 'axios'

export class GradeNode {
  private config: GradingConfig
  private ollamaUrl: string
  private model: string

  constructor(config: GradingConfig) {
    this.config = config
    this.ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434'
    // Force using the available model
    this.model = 'llama3.2:3b'; // Was: process.env.OLLAMA_MODEL || 'nemotron-3-nano'
  }

  public setConfig(config: GradingConfig) {
    this.config = config
  }

  async execute(state: AgenticRAGState, stateManager: StateManager): Promise<GradingResult> {
    const startTime = Date.now()

    try {
      // Grade each document for relevance
      const gradedDocuments: GradedDocument[] = []

      for (const doc of state.retrievedDocuments) {
        const graded = await this.gradeDocument(doc, state)
        gradedDocuments.push(graded)
      }

      // Calculate metrics
      const relevantDocs = gradedDocuments.filter(doc => doc.relevant)
      const averageRelevance = gradedDocuments.length > 0
        ? gradedDocuments.reduce((sum, doc) => sum + doc.relevanceScore, 0) / gradedDocuments.length
        : 0

      // Determine next action
      const shouldWebSearch = this.shouldSearchWeb(relevantDocs, averageRelevance, state)
      const shouldReformulate = this.shouldReformulateQuery(relevantDocs, averageRelevance, state)

      // Update state
      stateManager.updateState({
        gradedDocuments,
        relevanceScores: gradedDocuments.map(doc => doc.relevanceScore),
        shouldWebSearch,
        shouldReformulate
      })

      // Determine next node
      let nextNode = 'generate' // Default if we have relevant docs
      if (relevantDocs.length === 0) {
        nextNode = shouldWebSearch ? 'webSearch' : 'reformulate'
      }

      return {
        success: true,
        data: {
          gradedDocuments,
          averageRelevance,
          shouldWebSearch,
          shouldReformulate
        },
        nextNode,
        metrics: {
          duration: Date.now() - startTime,
          apiCalls: state.retrievedDocuments.length
        }
      }
    } catch (error) {
      console.error('[GradeNode] Error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      stateManager.addError('grade', errorMessage)

      return {
        success: false,
        error: errorMessage,
        data: {
          gradedDocuments: [],
          averageRelevance: 0,
          shouldWebSearch: false,
          shouldReformulate: true
        },
        nextNode: 'reformulate' // Try reformulating on error
      }
    }
  }

  private async gradeDocument(doc: Document, state: AgenticRAGState): Promise<GradedDocument> {
    try {
      const prompt = this.buildGradingPrompt(doc, state)

      const response = await axios.post(`${this.ollamaUrl}/api/generate`, {
        model: this.model,
        prompt,
        stream: false,
        options: {
          temperature: 0.1, // Low temperature for consistent grading
          top_p: 0.9,
          max_tokens: 200
        }
      }, { timeout: 30000 })

      // Parse LLM response
      const result = this.parseGradingResponse(response.data.response)

      // Apply additional technical checks
      const technicalScore = this.evaluateTechnicalRelevance(doc, state)

      // Combine LLM and technical scores
      const finalScore = (result.score * 0.7) + (technicalScore * 0.3)
      const isRelevant = finalScore >= this.config.relevanceThreshold

      return {
        ...doc,
        relevanceScore: finalScore,
        relevant: isRelevant,
        reason: result.reason || 'Technical evaluation'
      }
    } catch (error) {
      console.error('[GradeNode] Document grading error:', error)

      // Fallback to simple scoring
      return {
        ...doc,
        relevanceScore: 0.5,
        relevant: false,
        reason: 'Grading error - defaulted to not relevant'
      }
    }
  }

  private buildGradingPrompt(doc: Document, state: AgenticRAGState): string {
    const domainContext = this.getDomainContext(state.engineeringDomain)

    return `Eres un experto evaluador de documentos técnicos de ingeniería hidráulica.
Tu tarea es evaluar si el siguiente documento es relevante para responder la pregunta del usuario.

${domainContext}

Pregunta del usuario: "${state.originalQuestion}"

Documento a evaluar:
Fuente: ${doc.metadata.source}
${doc.metadata.section ? `Sección: ${doc.metadata.section}` : ''}
${doc.metadata.standard ? `Estándar: ${doc.metadata.standard}` : ''}
Contenido: ${doc.content.substring(0, 1500)}...

Criterios de evaluación:
1. ¿Contiene información técnica directamente relacionada con la pregunta?
2. ¿Los cálculos, fórmulas o procedimientos son aplicables?
3. ¿La normativa o estándares mencionados son relevantes?
4. ¿La región o contexto geográfico es apropiado?
${state.calculationType ? `5. ¿Incluye información sobre ${this.getCalculationTypeSpanish(state.calculationType)}?` : ''}

Responde ÚNICAMENTE con JSON válido. NO escribas texto antes ni después.
Formato JSON requerido:
{
  "relevant": boolean,
  "score": number (0.0 a 1.0),
  "reason": "breve explicación"
}

Ejemplo:
{"relevant": true, "score": 0.9, "reason": "Contiene datos de presión."}`
  }

  private parseGradingResponse(response: string): { relevant: boolean; score: number; reason: string } {
    console.log('[GradeNode] Parsing raw response:', response)
    try {
      // Extract JSON from response
      // Handle potential markdown code blocks
      const cleanedResponse = response.replace(/```json\s*|\s*```/g, '').trim()

      // Extract JSON from response robustly
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      let parsed;

      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        // Fallback: Check for keywords if JSON is missing
        console.warn('[GradeNode] No JSON found, attempting heuristic backup');
        const lower = response.toLowerCase();
        if (lower.includes('"relevant": true') || lower.includes("'relevant': true") || lower.includes('relevant: true')) {
          parsed = { relevant: true, score: 0.7, reason: 'Heuristic Match' };
        } else if (lower.includes('grade: relevant') || lower.includes('is relevant')) {
          parsed = { relevant: true, score: 0.6, reason: 'Heuristic text match' };
        } else {
          throw new Error('No JSON found');
        }
      }

      return {
        relevant: Boolean(parsed.relevant),
        score: Math.max(0, Math.min(1, parseFloat(parsed.score) || 0)),
        reason: parsed.reason || 'No reason provided'
      }
    } catch (error) {
      console.error('[GradeNode] Failed to parse grading response:', error)

      // Fallback heuristic based on response content
      const lowerResponse = response.toLowerCase()
      const relevant = lowerResponse.includes('relevant') && !lowerResponse.includes('no relevant')

      return {
        relevant,
        score: relevant ? 0.6 : 0.3,
        reason: 'Parsed heuristically'
      }
    }
  }

  private evaluateTechnicalRelevance(doc: Document, state: AgenticRAGState): number {
    let score = 0.5 // Base score

    // Check for calculation type match
    if (state.calculationType && doc.content.toLowerCase().includes(state.calculationType.toLowerCase())) {
      score += 0.2
    }

    // Check for standards match
    if (state.applicableStandards.length > 0) {
      const docContent = doc.content.toLowerCase()
      const matchingStandards = state.applicableStandards.filter(std =>
        docContent.includes(std.toLowerCase())
      )
      score += (matchingStandards.length / state.applicableStandards.length) * 0.15
    }

    // Check for technical formulas
    const formulaIndicators = /[A-Za-z]\s*=|∆|Δ|π|√|∑|∫|\d+\.\d+\s*[×x]\s*10/
    if (formulaIndicators.test(doc.content)) {
      score += 0.1
    }

    // Check for units (hydraulic context)
    const unitIndicators = /\b(m³\/s|l\/s|GPM|psi|bar|kPa|m\.c\.a\.|hp|kW)\b/i
    if (unitIndicators.test(doc.content)) {
      score += 0.05
    }

    return Math.min(1, score)
  }

  private shouldSearchWeb(relevantDocs: GradedDocument[], avgRelevance: number, state: AgenticRAGState): boolean {
    // Don't search web if disabled
    if (process.env.WEB_SEARCH_ENABLED !== 'true') {
      return false
    }

    // Search if no relevant documents found
    if (relevantDocs.length === 0) {
      return true
    }

    // Search if average relevance is too low
    if (avgRelevance < 0.5) {
      return true
    }

    // Search if we need very recent information
    const needsRecentInfo = /último|reciente|actual|2024|2025/i.test(state.originalQuestion)
    if (needsRecentInfo && !relevantDocs.some(doc => {
      const docDate = new Date(doc.metadata.lastUpdated || '2020-01-01')
      const monthsOld = (Date.now() - docDate.getTime()) / (1000 * 60 * 60 * 24 * 30)
      return monthsOld < 6
    })) {
      return true
    }

    return false
  }

  private shouldReformulateQuery(relevantDocs: GradedDocument[], avgRelevance: number, state: AgenticRAGState): boolean {
    // Don't reformulate if we've already tried multiple times
    if (state.reformulatedQueries.length >= 3) {
      return false
    }

    // Don't reformulate if we already have good documents
    if (relevantDocs.length >= 3 && avgRelevance >= 0.7) {
      return false
    }

    // Reformulate if we have few or poor quality results
    if (relevantDocs.length < 2 || avgRelevance < 0.5) {
      return true
    }

    // Reformulate if the query is very short or ambiguous
    const wordCount = state.originalQuestion.split(/\s+/).length
    if (wordCount < 5) {
      return true
    }

    return false
  }

  private getDomainContext(domain: string): string {
    const contexts: Record<string, string> = {
      water_distribution: 'Contexto: Sistemas de distribución de agua potable, redes de acueducto, diseño de tuberías.',
      sewage: 'Contexto: Sistemas de alcantarillado, aguas residuales, drenaje urbano.',
      hydraulics: 'Contexto: Mecánica de fluidos, hidráulica de canales y tuberías, máquinas hidráulicas.',
      general: 'Contexto: Ingeniería hidráulica general, recursos hídricos.'
    }

    return contexts[domain] || contexts.general
  }

  private getCalculationTypeSpanish(type: string): string {
    const translations: Record<string, string> = {
      'head_loss': 'pérdida de carga',
      'pipe_sizing': 'dimensionamiento de tuberías',
      'pump_selection': 'selección de bombas',
      'flow_rate': 'cálculo de caudal',
      'velocity': 'cálculo de velocidad',
      'pressure': 'cálculo de presión'
    }

    return translations[type] || type
  }
}

// Factory function
export function createGradeNode(customConfig?: Partial<GradingConfig>): GradeNode {
  const defaultConfig: GradingConfig = {
    relevanceThreshold: parseFloat(process.env.RELEVANCE_THRESHOLD || '0.7'),
    requireTechnicalContent: true,
    checkStandardsAlignment: true,
    strictRegionMatch: false
  }

  const config = { ...defaultConfig, ...customConfig }
  return new GradeNode(config)
}