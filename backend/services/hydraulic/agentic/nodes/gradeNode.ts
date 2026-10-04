/* eslint-disable no-console -- como el resto de ModelosRAG, a la consola del proceso principal: appLogger.info calla fuera de desarrollo, y esto es el registro de qué modelo atendió cada papel */
import { AgenticRAGState, GradedDocument, GradingResult, GradingConfig, Document } from '../types'
import { StateManager } from '../stateManager'
import { backendRAG, llamarModeloRAG, LimiteDePeticiones } from '../modelosRAG'

/** Un documento ya evaluado y, si no se pudo evaluar, por qué. */
interface Graduacion {
  doc: GradedDocument
  sinGraduar?: string
}

export class GradeNode {
  private config: GradingConfig

  constructor(config: GradingConfig) {
    this.config = config
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
      const { graduados: gradedDocuments, llamadas, sinGraduar } = await this.gradeInBatches(state.retrievedDocuments, state)
      if (sinGraduar.length > 0) {
        const motivos = [...new Set(sinGraduar)].join('; ')
        console.warn(`[GradeNode] ${sinGraduar.length} de ${gradedDocuments.length} fragmentos sin graduar (${motivos}); se conservan los que encontró la búsqueda.`)
      }

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
          apiCalls: llamadas
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

  /** Cuántas peticiones de graduado van a la vez. */
  private static readonly EN_PARALELO = 4

  /**
   * Fragmentos por llamada cuando gradúa NVIDIA (#224).
   *
   * Uno por llamada eran veinte llamadas por vuelta, y la API limita las
   * peticiones por minuto: medido con la clave del equipo, 20 a la vez dieron
   * 12 respuestas 429 de 40, y 4 a la vez no fallaban pero tardaban 75 s en
   * total (unos 5 s por llamada, casi todo cola del servidor). Con cinco por
   * llamada son cuatro llamadas, que van a la vez y quedan muy por debajo del
   * límite. En local se sigue de uno en uno: el prompt está medido para el
   * modelo pequeño, y a ese le cuesta igual leer cinco fragmentos juntos que
   * por separado.
   */
  private static readonly POR_LOTE_EN_LA_NUBE = 5

  private async gradeInBatches(
    docs: Document[],
    state: AgenticRAGState,
  ): Promise<{ graduados: GradedDocument[]; llamadas: number; sinGraduar: string[] }> {
    const enLote = docs.length > 0 && (await backendRAG()) === 'nvidia'
    const tamano = enLote ? GradeNode.POR_LOTE_EN_LA_NUBE : 1
    const grupos: Document[][] = []
    for (let i = 0; i < docs.length; i += tamano) grupos.push(docs.slice(i, i + tamano))

    const resultados: Graduacion[] = []
    for (let i = 0; i < grupos.length; i += GradeNode.EN_PARALELO) {
      const tanda = grupos.slice(i, i + GradeNode.EN_PARALELO)
      const hechos = await Promise.all(tanda.map(grupo =>
        enLote ? this.gradeBatch(grupo, state) : this.gradeDocument(grupo[0], state).then(r => [r])))
      resultados.push(...hechos.flat())
    }

    return {
      graduados: resultados.map(r => r.doc),
      llamadas: grupos.length,
      sinGraduar: resultados.flatMap(r => (r.sinGraduar ? [r.sinGraduar] : [])),
    }
  }

  private graduado(doc: Document, state: AgenticRAGState, result: { relevant: boolean; score: number; reason: string }): GradedDocument {
    /**
     * El juez decide si pasa; el orden lo pone el parecido (#161).
     *
     * Antes la puntuación era `0,7 × juez + 0,3 × técnica`, y con el modelo
     * local eso no ordena nada: medido sobre fragmentos reales, el juez da
     * **0,95 a todo lo que acepta** —incluida una tabla de cifras sueltas ante
     * una pregunta de normativa— y 0 a lo que rechaza. Su salida es binaria,
     * así que la fórmula colapsaba en dos valores y las tres fuentes salían
     * con la misma relevancia en la interfaz.
     *
     * Lo que sí sabe hacer es de portero, y para eso se usa. Para ordenar se
     * usa el parecido que devolvió la búsqueda, que es lo único del camino
     * que varía con el documento. Sin él —una búsqueda que no lo traiga— se
     * cae en la valoración técnica, como antes.
     */
    const isRelevant = result.relevant && result.score >= this.config.relevanceThreshold
    return {
      ...doc,
      relevanceScore: doc.score ?? this.evaluateTechnicalRelevance(doc, state),
      relevant: isRelevant,
      reason: result.reason || 'Technical evaluation'
    }
  }

  /**
   * Sin juez manda el buscador, no el silencio.
   *
   * Antes un fallo aquí marcaba el documento como no relevante, y como el
   * fallo típico es que el modelo no esté —Ollama parado, una etiqueta que
   * no existe— le pasaba a todos los documentos a la vez: el agente se
   * quedaba sin contexto y contestaba que no podía responder, sin que nada
   * dijera que el juez estaba caído. Lo que llega hasta aquí ya pasó el
   * umbral de la búsqueda y el filtro de ámbito, así que se conserva. Lo mismo
   * con el límite de peticiones de la API (#224): se conserva y se dice.
   */
  private sinJuez(doc: Document, state: AgenticRAGState, motivo: string): Graduacion {
    return {
      doc: {
        ...doc,
        relevanceScore: doc.score ?? this.evaluateTechnicalRelevance(doc, state),
        relevant: true,
        reason: `Sin graduar (${motivo}): se conserva lo que encontró la búsqueda`
      },
      sinGraduar: motivo,
    }
  }

  private motivoDelFallo(error: unknown): string {
    if (!(error instanceof LimiteDePeticiones)) return 'juez no disponible'
    return error.status === 429 ? 'límite de peticiones de la API' : 'servicio de NVIDIA saturado'
  }

  private async gradeDocument(doc: Document, state: AgenticRAGState): Promise<Graduacion> {
    try {
      const prompt = this.buildGradingPrompt(doc, state)

      // El juez es el modelo auxiliar (#49): esto se llama una vez por
      // fragmento recuperado, así que aquí manda la velocidad.
      const respuesta = await llamarModeloRAG({
        rol: 'auxiliar',
        tarea: 'graduar',
        prompt,
        temperatura: 0.1, // Low temperature for consistent grading
        // `max_tokens` no existe en Ollama —su opción se llama `num_predict`—
        // así que el tope nunca se aplicaba y el juez seguía escribiendo
        // después del JSON que se le pedía. Medido sobre un documento real:
        // 20.3 s sin tope contra 2.2 s con él. La respuesta útil son dos
        // líneas de JSON.
        maxTokens: 200,
        timeoutMs: 30000,
      })

      return { doc: this.graduado(doc, state, this.parseGradingResponse(respuesta)) }
    } catch (error) {
      console.error('[GradeNode] Document grading error:', error)
      return this.sinJuez(doc, state, this.motivoDelFallo(error))
    }
  }

  /** Varios fragmentos en una llamada; lo que el juez no conteste se conserva sin graduar, y se dice. */
  private async gradeBatch(docs: Document[], state: AgenticRAGState): Promise<Graduacion[]> {
    let respuesta: string
    try {
      respuesta = await llamarModeloRAG({
        rol: 'auxiliar',
        tarea: 'graduar',
        prompt: this.buildBatchGradingPrompt(docs, state),
        temperatura: 0.1,
        // Unos 60 tokens por veredicto con su motivo; el margen es para que un
        // motivo largo no corte el JSON del último.
        maxTokens: 120 * docs.length + 60,
        timeoutMs: 60000,
      })
    } catch (error) {
      console.error(`[GradeNode] Error al graduar un lote de ${docs.length}:`, error)
      const motivo = this.motivoDelFallo(error)
      return docs.map(doc => this.sinJuez(doc, state, motivo))
    }

    const veredictos = this.parseBatchGradingResponse(respuesta, docs.length)
    return docs.map((doc, i) => {
      const v = veredictos[i]
      if (!v) {
        console.warn(`[GradeNode] El juez no evaluó «${doc.metadata.source}» en el lote; se conserva sin graduar.`)
        return this.sinJuez(doc, state, 'el juez no lo evaluó')
      }
      return { doc: this.graduado(doc, state, v) }
    })
  }

  /** Un veredicto por posición, o `undefined` donde el juez no dijo nada legible. */
  private parseBatchGradingResponse(response: string, total: number): Array<{ relevant: boolean; score: number; reason: string } | undefined> {
    const veredictos: Array<{ relevant: boolean; score: number; reason: string } | undefined> = new Array(total).fill(undefined)
    const lista = response.match(/\[[\s\S]*\]/)
    if (!lista) {
      console.warn('[GradeNode] El juez no devolvió una lista JSON para el lote:', response.slice(0, 300))
      return veredictos
    }
    try {
      const datos: unknown = JSON.parse(lista[0])
      if (!Array.isArray(datos)) return veredictos
      datos.forEach((dato: unknown, posicion: number) => {
        if (!dato || typeof dato !== 'object') return
        const v = dato as { doc?: unknown; relevant?: unknown; score?: unknown; reason?: unknown }
        const numero = Number(v.doc)
        const i = Number.isInteger(numero) && numero >= 1 && numero <= total ? numero - 1 : posicion
        if (i >= total || typeof v.relevant !== 'boolean') return
        veredictos[i] = {
          relevant: v.relevant,
          score: Math.max(0, Math.min(1, parseFloat(String(v.score)) || 0)),
          reason: typeof v.reason === 'string' && v.reason ? v.reason : 'No reason provided',
        }
      })
    } catch (error) {
      console.warn('[GradeNode] La lista del lote no es JSON válido:', error)
    }
    return veredictos
  }

  /** El mismo criterio que `buildGradingPrompt`, con los documentos numerados delante de la pregunta. */
  private buildBatchGradingPrompt(docs: Document[], state: AgenticRAGState): string {
    const domainContext = this.getDomainContext(state.engineeringDomain)
    const calculo = state.calculationType
      ? ` Ten en cuenta que la pregunta trata sobre ${this.getCalculationTypeSpanish(state.calculationType)}.`
      : ''
    const documentos = docs.map((doc, i) => {
      const seccion = doc.metadata.section ? `Sección: ${doc.metadata.section}\n` : ''
      const estandar = doc.metadata.standard ? `Estándar: ${doc.metadata.standard}\n` : ''
      return `[${i + 1}] Fuente: ${doc.metadata.source}\n${seccion}${estandar}${doc.content.substring(0, 1500)}`
    }).join('\n\n')

    return `Documentos a evaluar

${documentos}

Pregunta del usuario: "${state.originalQuestion}"

${domainContext}
Decide, para cada documento por separado, si sirve para responder esa pregunta. Sirve si contiene datos, procedimientos, normativa o resultados que respondan directamente a lo que se pregunta.${calculo}

Responde ÚNICAMENTE con una lista JSON, un objeto por documento y en el mismo orden: [{"doc": 1, "relevant": boolean, "score": number entre 0.0 y 1.0, "reason": "breve"}]`
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