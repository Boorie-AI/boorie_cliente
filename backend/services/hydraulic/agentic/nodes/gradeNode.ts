import { AgenticRAGState, GradedDocument, GradingResult, GradingConfig, Document } from '../types'
import { StateManager } from '../stateManager'
import axios from 'axios'
import { modeloLocal } from '../modeloLocal'

export class GradeNode {
  private config: GradingConfig
  private ollamaUrl: string

  constructor(config: GradingConfig) {
    this.config = config
    this.ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434'
  }

  public setConfig(config: GradingConfig) {
    this.config = config
  }

  async execute(state: AgenticRAGState, stateManager: StateManager): Promise<GradingResult> {
    const startTime = Date.now()

    try {
      /**
       * En tandas, no de uno en uno.
       *
       * Cada documento es una llamada al modelo local, y la fase se recorría en
       * serie: con diez documentos recuperados y hasta tres vueltas del ciclo,
       * una pregunta tardaba minutos y la respuesta buena llegaba después de que
       * el usuario se hubiera ido. El límite no es caprichoso: Ollama atiende
       * unas pocas peticiones a la vez y el resto las encola, así que pedir las
       * diez de golpe no acelera y sí compite con la generación por la CPU.
       */
      const gradedDocuments = await this.gradeInBatches(state.retrievedDocuments, state)

      // Calculate metrics
      let relevantDocs = gradedDocuments.filter(doc => doc.relevant)

      /**
       * Que el juez descarte todo no puede dejar la respuesta sin contexto.
       *
       * El graduado es un modelo pequeño corriendo en local y se equivoca de una
       * forma concreta: cuando falla, falla en bloque, y entonces el agente
       * contesta «No se pudo generar una respuesta» sobre un corpus que sí
       * contenía la respuesta. Los documentos que llegan hasta aquí ya pasaron
       * el umbral de similitud y el filtro de ámbito, así que se conservan los
       * mejores y se deja que la respuesta salga con la confianza baja que le
       * corresponde, en lugar de no salir.
       */
      if (relevantDocs.length === 0 && gradedDocuments.length > 0) {
        relevantDocs = [...gradedDocuments]
          .sort((a, b) => b.relevanceScore - a.relevanceScore)
          .slice(0, 3)
        relevantDocs.forEach(doc => {
          doc.relevant = true
          doc.reason = `Ninguno pasó el filtro; se conserva por similitud (${doc.reason})`
        })
        console.log(`[GradeNode] El juez descartó los ${gradedDocuments.length} documentos; se conservan los ${relevantDocs.length} mejores por similitud.`)
      }
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

  /** Cuántas peticiones de graduado van a la vez contra el modelo local. */
  private static readonly EN_PARALELO = 4

  private async gradeInBatches(docs: Document[], state: AgenticRAGState): Promise<GradedDocument[]> {
    const graduados: GradedDocument[] = []

    for (let i = 0; i < docs.length; i += GradeNode.EN_PARALELO) {
      const tanda = docs.slice(i, i + GradeNode.EN_PARALELO)
      graduados.push(...await Promise.all(tanda.map(doc => this.gradeDocument(doc, state))))
    }

    return graduados
  }

  private async gradeDocument(doc: Document, state: AgenticRAGState): Promise<GradedDocument> {
    try {
      const prompt = this.buildGradingPrompt(doc, state)

      const response = await axios.post(`${this.ollamaUrl}/api/generate`, {
        model: await modeloLocal(),
        prompt,
        stream: false,
        options: {
          temperature: 0.1, // Low temperature for consistent grading
          top_p: 0.9,
          // `max_tokens` no existe en Ollama —su opción se llama `num_predict`—
          // así que el tope nunca se aplicaba y el juez seguía escribiendo
          // después del JSON que se le pedía. Medido sobre un documento real:
          // 20.3 s sin tope contra 2.2 s con él, y esto se llama una vez por
          // fragmento recuperado. La respuesta útil son dos líneas de JSON.
          num_predict: 200
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

      /**
       * Sin juez manda el buscador, no el silencio.
       *
       * Antes un fallo aquí marcaba el documento como no relevante, y como el
       * fallo típico es que el modelo no esté —Ollama parado, una etiqueta que
       * no existe— le pasaba a todos los documentos a la vez: el agente se
       * quedaba sin contexto y contestaba que no podía responder, sin que nada
       * dijera que el juez estaba caído. Lo que llega hasta aquí ya pasó el
       * umbral de la búsqueda y el filtro de ámbito, así que se conserva.
       */
      return {
        ...doc,
        relevanceScore: this.evaluateTechnicalRelevance(doc, state),
        relevant: true,
        reason: 'Juez no disponible: se conserva lo que encontró la búsqueda'
      }
    }
  }

  /**
   * El documento primero y la pregunta después.
   *
   * El orden no es cosmético. El prompt anterior abría con el rol, el contexto
   * del dominio y una lista de criterios sobre normativa, fórmulas y región, y
   * enterraba el documento en medio; con el modelo pequeño que corre en local
   * eso bastaba para que contestara que «no contiene información» sobre un
   * informe que empieza con «PROBLEMAS DETECTADOS» y enumera los nudos fuera de
   * umbral. Medido sobre documentos reales de la base: el prompt anterior
   * rechazaba 3 de 3 veces ese informe —y también un capítulo de hidrología ante
   * una pregunta de hidrología—, y quitarle sólo la línea de contexto o sólo el
   * ejemplo final le daba la vuelta al veredicto. Un criterio que se mueve al
   * borrar un adorno no es un criterio.
   *
   * Con el documento delante y una sola instrucción al final acierta los tres
   * casos que importan: acepta el informe cuando se pregunta por la simulación,
   * y lo rechaza cuando se pregunta por normativa.
   */
  private buildGradingPrompt(doc: Document, state: AgenticRAGState): string {
    const domainContext = this.getDomainContext(state.engineeringDomain)
    const seccion = doc.metadata.section ? `Sección: ${doc.metadata.section}\n` : ''
    const estandar = doc.metadata.standard ? `Estándar: ${doc.metadata.standard}\n` : ''
    const calculo = state.calculationType
      ? ` Ten en cuenta que la pregunta trata sobre ${this.getCalculationTypeSpanish(state.calculationType)}.`
      : ''

    return `Documento a evaluar
Fuente: ${doc.metadata.source}
${seccion}${estandar}${doc.content.substring(0, 1500)}

Pregunta del usuario: "${state.originalQuestion}"

${domainContext}
Decide si el documento sirve para responder esa pregunta. Sirve si contiene datos, procedimientos, normativa o resultados que respondan directamente a lo que se pregunta.${calculo}

Responde ÚNICAMENTE con JSON: {"relevant": boolean, "score": number entre 0.0 y 1.0, "reason": "breve"}`
  }

  private parseGradingResponse(response: string): { relevant: boolean; score: number; reason: string } {
    console.log('[GradeNode] Parsing raw response:', response)
    try {
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