import { PrismaClient } from '@prisma/client'
import {
  AgenticRAGConfig,
  AgenticRAGState,
  NodeName,
  RAGMetrics,
  NodeResult
} from './types'
import { StateManager, createStateManager } from './stateManager'
import { idiomaDelTexto } from '../idiomaDelTexto'
import { corpusDe } from '../repartoDeCorpus'
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
        /**
         * Tres, no diez (#63).
         *
         * Graduar cuesta ~45 s por documento en una máquina sin GPU utilizable
         * —y ahí manda el proceso del prompt, no la generación—, así que diez
         * documentos son más de dos minutos de una fase que el chat espera 30 s.
         * Con tres cabe en una sola tanda de graduado. Quien tenga hardware o
         * quiera más contexto lo sube desde el selector, que ahora sí se
         * respeta, o con RETRIEVAL_TOP_K.
         */
        topK: parseInt(process.env.RETRIEVAL_TOP_K || '3'),
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
        /**
         * 500, bajando de 800 (#63).
         *
         * El tope decide cuánto espera el usuario: a los 5,4 tokens por segundo
         * que da el modelo local, 800 tokens son 148 s **sólo de escritura**,
         * más evaluar un prompt con los documentos dentro; el nodo cortaba a los
         * 180 s y la respuesta terminada se perdía, devolviendo el texto de «no
         * encontré nada» con las fuentes ya encontradas. 500 tokens son unas 375
         * palabras, que dan para una respuesta con sus citas.
         */
        maxTokens: parseInt(process.env.GENERATION_MAX_TOKENS || '500'),
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
      /** Proyecto desde el que se pregunta (#39, #41). */
      projectId?: string | null
      ambito?: 'general' | 'proyecto' | 'ambos'
      /** Cuántos documentos recuperar y graduar; es el «Max Results» del selector (#63). */
      searchTopK?: number
      /**
       * Devolver sólo las fuentes, sin redactar respuesta (#63).
       *
       * Es lo que necesita el chat: usa `sources` y tira `answer`, así que
       * generarla eran 180 s perdidos y CPU compitiendo con la respuesta que el
       * usuario sí está esperando.
       */
      soloRecuperacion?: boolean
    }
  ): Promise<{
    answer: string
    confidence: number
    sources: any[]
    metrics: any
    /** El modelo con el que se busco, para que el chat pueda decirselo al que redacta. */
    modeloEmbeddings: string | null
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
      // Llegaba desde el selector y nadie lo leía, así que «Max Results» no
      // hacía nada (#63).
      if (options.searchTopK && options.searchTopK > 0) {
        this.config.retrieval.topK = options.searchTopK
      }
    }

    // Fuera del `if`, y asignando también cuando no viene nada: el servicio es
    // de vida larga y quedarse con el proyecto de la consulta anterior sería
    // enseñar sus documentos en la siguiente (#39).
    this.config.retrieval.projectId = options?.projectId ?? null
    this.config.retrieval.ambito = options?.ambito ?? (options?.projectId ? 'ambos' : 'general')

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
      const generar = options?.soloRecuperacion !== true
      await this.executeWorkflow(stateManager, generar)

      // Get final state
      const finalState = stateManager.getState()

      // Update metrics
      this.updateMetrics(finalState, Date.now() - startTime)

      // Format response
      return {
        answer: generar ? (finalState.generation || 'No se pudo generar una respuesta.') : '',
        confidence: finalState.confidence,
        sources: this.formatSources(finalState),
        modeloEmbeddings: this.nodes.retrieve?.modeloDeEmbeddings?.() ?? null,
        metrics: {
          processingTime: finalState.processingTime,
          iterations: finalState.iteration,
          nodesVisited: finalState.nodesVisited,
          documentsRetrieved: finalState.retrievedDocuments.length,
          webSearchUsed: finalState.webSearchResults.length > 0,
          reformulationUsed: finalState.reformulatedQueries.length > 0,
          recuperacion: this.diagnosticoDeRecuperacion(finalState)
        }
      }
    } catch (error) {
      console.error('[AgenticRAGService] Query error:', error)

      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'

      return {
        answer: 'Ocurrió un error al procesar tu consulta. Por favor, intenta reformular tu pregunta.',
        confidence: 0,
        sources: [],
        modeloEmbeddings: null,
        metrics: {
          processingTime: Date.now() - startTime,
          error: errorMessage
        }
      }
    }
  }

  private async executeWorkflow(stateManager: StateManager, generar = true): Promise<void> {
    let currentNode: NodeName = 'retrieve'

    while (currentNode !== 'end' && stateManager.shouldContinue()) {
      // Quien sólo quiere las fuentes se baja antes de redactar (#63).
      if (!generar && currentNode === 'generate') break

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

  /**
   * Una entrada por fragmento, no por documento (#156).
   *
   * Esto deduplicaba por título, y todos los fragmentos de un documento comparten
   * título: al modelo le llegaba uno solo, así que un libro de 432 fragmentos
   * aportaba mil caracteres a la respuesta. Y con `topK` en tres, el caso normal
   * —los tres mejores fragmentos salen del documento que el usuario acaba de
   * subir— dejaba el contexto en un único trozo elegido por su parecido con la
   * pregunta, que no es lo mismo que el trozo que la responde.
   *
   * Medido con la misma pregunta, el mismo modelo y el mismo prompt: con un
   * fragmento el modelo se inventaba la respuesta; con tres del mismo libro daba
   * los criterios reales del texto. La lista de la interfaz numera lo que hay,
   * así que dos entradas del mismo documento se ven como [F1] y [F2] de ese
   * documento, que es lo que de verdad se le ha dado al modelo.
   *
   * Lo que sí se descarta es el contenido repetido carácter a carácter: la base
   * guarda informes de simulación duplicados, y gastar en ellos dos de los tres
   * huecos del contexto es tirarlos.
   */
  private formatSources(state: AgenticRAGState): any[] {
    const uniqueSources = new Map<string, any>()
    const contenidosVistos = new Set<string>()

    state.gradedDocuments
      .filter(doc => doc.relevant)
      .forEach(doc => {
        const titulo = doc.metadata.source || doc.metadata.title || 'Unknown'
        // Sin id no hay forma de distinguir un fragmento de otro, y meterlos
        // todos bajo la misma clave es justo el fallo que esto arregla.
        const key = doc.id || `${titulo}#${contenidosVistos.size}`

        const contenido = (doc.content ?? '').trim()
        if (contenido && contenidosVistos.has(contenido)) return
        if (contenido) contenidosVistos.add(contenido)

        if (!uniqueSources.has(key) || (doc.relevanceScore > uniqueSources.get(key).relevance)) {
          uniqueSources.set(key, {
            id: doc.id,
            type: 'document',
            title: titulo,
            relevance: doc.relevanceScore,
            page: doc.metadata.page,
            section: doc.metadata.section,
            category: doc.metadata.category,
            /**
             * El idioma del fragmento llega hasta el prompt: es lo que permite
             * pedirle al modelo que marque como traducida la cita que lo esté
             * (#160). Se recuperaba y se tiraba aquí.
             *
             * Y se mira el texto antes que la metainformación, porque la
             * metainformación miente: la subida guarda «es» sin comprobar nada
             * y el nodo de recuperación completa los huecos con el idioma de la
             * pregunta. Si el texto no da para decidir, se deja sin idioma y no
             * se marca nada.
             */
            language: idiomaDelTexto(doc.content) ?? doc.metadata.language,
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

  /**
   * Cuántos fragmentos sobreviven a cada etapa, y de qué corpus (#158, #161).
   *
   * Sin esto, que la documentación no llegue al modelo se ve sólo en la
   * respuesta —que habla de otra cosa— y hay que ir etapa por etapa a ciegas.
   * Y el veredicto del juez se guardaba en `doc.reason` sin salir a ningún
   * sitio, así que no había forma de saber si graduó de verdad o si entró por
   * una de las dos redes de seguridad, que es justo lo que decide si el
   * graduado aporta algo o sólo cuesta latencia.
   */
  private diagnosticoDeRecuperacion(state: AgenticRAGState) {
    const porCorpus = (docs: any[]) => ({
      documental: docs.filter(d => corpusDe(d?.metadata?.category) === 'documental').length,
      simulacion: docs.filter(d => corpusDe(d?.metadata?.category) === 'simulacion').length,
    })

    const graduados = state.gradedDocuments ?? []
    const relevantes = graduados.filter((d: any) => d.relevant)
    const motivo = (d: any) => String(d?.reason ?? '')

    return {
      recuperados: porCorpus(state.retrievedDocuments ?? []),
      graduados: porCorpus(graduados),
      relevantes: porCorpus(relevantes),
      /** Los que entraron sin que el juez llegara a opinar. */
      sinJuez: graduados.filter((d: any) => motivo(d).startsWith('Juez no disponible')).length,
      /** Y los que entraron porque el juez los descartó todos. */
      porRescate: graduados.filter((d: any) => motivo(d).startsWith('Ninguno pasó el filtro')).length,
    }
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