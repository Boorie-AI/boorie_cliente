import { AgenticRAGState, NodeName, WorkflowConfig, NodeError } from './types'

export class StateManager {
  private state: AgenticRAGState
  private history: Array<Partial<AgenticRAGState>> = []
  private config: WorkflowConfig

  constructor(initialQuestion: string, config: WorkflowConfig) {
    this.config = config
    this.state = this.initializeState(initialQuestion)
  }

  private initializeState(question: string): AgenticRAGState {
    return {
      // Query state
      originalQuestion: question,
      currentQuery: question,
      reformulatedQueries: [],
      queryLanguage: this.detectLanguage(question),

      // Document state
      retrievedDocuments: [],
      gradedDocuments: [],
      webSearchResults: [],
      parentDocuments: [],

      // Generation state
      generation: '',
      confidence: 0,
      citations: [],

      // Control flow
      iteration: 0,
      maxIterations: this.config.nodes.end?.timeout || 3,
      shouldWebSearch: false,
      shouldReformulate: false,

      // Metrics
      relevanceScores: [],
      processingTime: 0,
      nodesVisited: [],
      errors: [],

      // Technical context
      engineeringDomain: this.detectDomain(question),
      calculationType: this.detectCalculationType(question),
      applicableStandards: this.detectStandards(question)
    }
  }

  updateState(updates: Partial<AgenticRAGState>): void {
    // Save current state to history
    this.history.push({ ...this.state })

    // Apply updates
    this.state = {
      ...this.state,
      ...updates,
      iteration: this.state.iteration + (updates.iteration === undefined ? 0 : 0),
      processingTime: Date.now() - this.getStartTime()
    }

    // Log state transition if debug mode
    if (process.env.AGENTIC_DEBUG === 'true') {
      console.log('[StateManager] State updated:', {
        iteration: this.state.iteration,
        nodesVisited: this.state.nodesVisited,
        confidence: this.state.confidence
      })
    }
  }

  getState(): Readonly<AgenticRAGState> {
    return { ...this.state }
  }

  addVisitedNode(nodeName: NodeName): void {
    this.state.nodesVisited.push(nodeName)
  }

  addError(nodeName: string, error: string, recoverable: boolean = true): void {
    this.state.errors.push({
      node: nodeName,
      error,
      timestamp: new Date(),
      recoverable
    })
  }

  incrementIteration(): boolean {
    this.state.iteration++
    return this.state.iteration < this.state.maxIterations
  }

  shouldContinue(): boolean {
    // Check stopping conditions
    if (this.state.iteration >= this.state.maxIterations) {
      return false
    }

    if (this.state.confidence >= parseFloat(process.env.AGENTIC_CONFIDENCE_THRESHOLD || '0.85')) {
      return false
    }

    if (this.state.errors.some(e => !e.recoverable)) {
      return false
    }

    return true
  }

  getNextNode(currentNode: NodeName): NodeName | null {
    const edges = this.config.edges.filter(edge => edge.from === currentNode)

    for (const edge of edges) {
      if (!edge.condition || edge.condition(this.state)) {
        return edge.to
      }
    }

    return null
  }

  // Utility methods for domain detection
  private detectLanguage(question: string): string {
    // Simple language detection based on common words
    const spanishIndicators = /\b(cómo|qué|cuál|calcular|tubería|bomba|tanque|pérdida)\b/i
    const englishIndicators = /\b(how|what|which|calculate|pipe|pump|tank|loss|water|cycle|groundwater|well|aquifer)\b/i

    if (spanishIndicators.test(question)) return 'es'
    if (englishIndicators.test(question)) return 'en'
    return 'es' // Default to Spanish
  }

  private detectDomain(question: string): 'water_distribution' | 'sewage' | 'hydraulics' | 'general' {
    const lowerQuestion = question.toLowerCase()

    if (/agua potable|distribución|acueducto|red de agua/i.test(lowerQuestion)) {
      return 'water_distribution'
    }
    if (/alcantarillado|aguas residuales|saneamiento|drenaje/i.test(lowerQuestion)) {
      return 'sewage'
    }
    if (/hidráulica|bernoulli|manning|hazen|darcy/i.test(lowerQuestion)) {
      return 'hydraulics'
    }

    return 'general'
  }

  private detectCalculationType(question: string): string | undefined {
    const calculationPatterns = {
      'head_loss': /pérdida de carga|head loss|hf/i,
      'pipe_sizing': /dimensionar|sizing|diámetro/i,
      'pump_selection': /selección.*bomba|pump selection|potencia/i,
      'flow_rate': /caudal|flow rate|gasto/i,
      'velocity': /velocidad|velocity/i,
      'pressure': /presión|pressure/i
    }

    for (const [type, pattern] of Object.entries(calculationPatterns)) {
      if (pattern.test(question)) {
        return type
      }
    }

    return undefined
  }

  private detectStandards(question: string): string[] {
    const standards = []
    const standardPatterns = {
      'AWWA': /AWWA|American Water Works/i,
      'ISO': /ISO \d+/i,
      'NFPA': /NFPA/i,
      'NOM': /NOM-\d+/i,
      'NSR': /NSR-\d+/i,
      'RAS': /RAS \d+/i
    }

    for (const [standard, pattern] of Object.entries(standardPatterns)) {
      if (pattern.test(question)) {
        standards.push(standard)
      }
    }

    return standards
  }

  private getStartTime(): number {
    return this.history.length > 0
      ? this.history[0].processingTime || Date.now()
      : Date.now()
  }

  // State validation
  validateState(): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    if (!this.state.originalQuestion) {
      errors.push('Original question is missing')
    }

    if (this.state.iteration < 0) {
      errors.push('Iteration count is negative')
    }

    if (this.state.confidence < 0 || this.state.confidence > 1) {
      errors.push('Confidence score out of range [0, 1]')
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }

  // Get execution summary
  getSummary(): Record<string, any> {
    return {
      question: this.state.originalQuestion,
      answer: this.state.generation,
      confidence: this.state.confidence,
      iterations: this.state.iteration,
      nodesVisited: this.state.nodesVisited,
      documentsRetrieved: this.state.retrievedDocuments.length,
      documentsGraded: this.state.gradedDocuments.length,
      webSearchUsed: this.state.webSearchResults.length > 0,
      reformulationUsed: this.state.reformulatedQueries.length > 0,
      processingTimeMs: this.state.processingTime,
      errors: this.state.errors.length,
      domain: this.state.engineeringDomain,
      standards: this.state.applicableStandards
    }
  }
}

// Factory function for creating state managers with different configs
export function createStateManager(
  question: string,
  customConfig?: Partial<WorkflowConfig>
): StateManager {
  const defaultConfig: WorkflowConfig = {
    startNode: 'retrieve',
    nodes: {
      retrieve: { name: 'retrieve', timeout: 5000, retries: 2 },
      grade: { name: 'grade', timeout: 3000, retries: 1 },
      generate: { name: 'generate', timeout: 10000, retries: 2 },
      reformulate: { name: 'reformulate', timeout: 3000, retries: 1 },
      webSearch: { name: 'webSearch', timeout: 8000, retries: 1 },
      end: { name: 'end' }
    },
    edges: [
      { from: 'retrieve', to: 'grade' },
      {
        from: 'grade',
        to: 'generate',
        condition: (state) => state.gradedDocuments.some(doc => doc.relevant)
      },
      {
        from: 'grade',
        to: 'reformulate',
        condition: (state) => state.shouldReformulate && !state.shouldWebSearch
      },
      {
        from: 'grade',
        to: 'webSearch',
        condition: (state) => state.shouldWebSearch
      },
      { from: 'reformulate', to: 'retrieve' },
      { from: 'webSearch', to: 'generate' },
      { from: 'generate', to: 'end' }
    ]
  }

  const config = { ...defaultConfig, ...customConfig }
  return new StateManager(question, config)
}