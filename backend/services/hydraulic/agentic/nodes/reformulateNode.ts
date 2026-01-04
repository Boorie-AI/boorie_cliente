import { AgenticRAGState, ReformulationResult } from '../types'
import { StateManager } from '../stateManager'
import axios from 'axios'

export class ReformulateNode {
  private ollamaUrl: string
  private model: string
  private technicalTerms: Record<string, string[]>

  constructor() {
    this.ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
    this.model = process.env.OLLAMA_MODEL || 'nemotron-3-nano'
    this.technicalTerms = this.loadTechnicalTerms()
  }

  async execute(state: AgenticRAGState, stateManager: StateManager): Promise<ReformulationResult> {
    const startTime = Date.now()

    try {
      // Generate reformulations
      const reformulations = await this.generateReformulations(state)

      // Expand technical terms
      const expansions = this.expandTechnicalTerms(state.originalQuestion)

      // Apply expansions to reformulations
      const expandedReformulations = this.applyExpansions(reformulations, expansions)

      // Update state
      stateManager.updateState({
        reformulatedQueries: [
          ...state.reformulatedQueries,
          ...expandedReformulations
        ]
      })

      return {
        success: true,
        data: {
          reformulatedQueries: expandedReformulations,
          expansions
        },
        nextNode: 'retrieve',
        metrics: {
          duration: Date.now() - startTime,
          apiCalls: 1
        }
      }
    } catch (error) {
      console.error('[ReformulateNode] Error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      stateManager.addError('reformulate', errorMessage)

      // Fallback to simple reformulations
      const simpleReformulations = this.generateSimpleReformulations(state)
      stateManager.updateState({
        reformulatedQueries: [...state.reformulatedQueries, ...simpleReformulations]
      })

      return {
        success: false,
        error: errorMessage,
        data: {
          reformulatedQueries: simpleReformulations,
          expansions: {}
        },
        nextNode: 'retrieve'
      }
    }
  }

  private async generateReformulations(state: AgenticRAGState): Promise<string[]> {
    const prompt = this.buildReformulationPrompt(state)

    try {
      const response = await axios.post(`${this.ollamaUrl}/api/generate`, {
        model: this.model,
        prompt,
        stream: false,
        options: {
          temperature: 0.7, // Higher temperature for diversity
          top_p: 0.9,
          max_tokens: 500
        }
      })

      return this.parseReformulations(response.data.response)
    } catch (error) {
      console.error('[ReformulateNode] LLM generation error:', error)
      throw error
    }
  }

  private buildReformulationPrompt(state: AgenticRAGState): string {
    const previousAttempts = state.reformulatedQueries.length > 0
      ? `\n\nReformulaciones anteriores que NO funcionaron:\n${state.reformulatedQueries.map((q, i) => `${i + 1}. ${q}`).join('\n')}`
      : ''

    const context = this.getContextFromFailedRetrieval(state)

    return `Eres un experto en ingeniería hidráulica ayudando a reformular preguntas para mejorar la búsqueda en una base de conocimientos técnica.

Pregunta original: "${state.originalQuestion}"

${context}
${previousAttempts}

Tu tarea es generar 3-4 reformulaciones diferentes de la pregunta que:
1. Mantengan el mismo significado técnico
2. Usen terminología alternativa común en ingeniería hidráulica
3. Sean más específicas o generales según corresponda
4. Incluyan palabras clave técnicas relevantes
5. Consideren diferentes formas de expresar el mismo concepto

Para el dominio ${this.getDomainSpanish(state.engineeringDomain)}, considera:
${this.getDomainHints(state.engineeringDomain)}

Genera EXACTAMENTE 3-4 reformulaciones, una por línea, sin numeración ni viñetas.

Reformulaciones:`
  }

  private parseReformulations(response: string): string[] {
    // Split by newlines and clean up
    const lines = response
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 10) // Filter out short lines
      .filter(line => !line.match(/^\d+[\.\)]\s*/)) // Remove numbered items
      .map(line => line.replace(/^[-•*]\s*/, '')) // Remove bullets
      .filter(line => !line.toLowerCase().includes('reformulación')) // Remove meta text

    // Return first 4 valid reformulations
    return lines.slice(0, 4)
  }

  private expandTechnicalTerms(query: string): Record<string, string[]> {
    const expansions: Record<string, string[]> = {}
    const lowerQuery = query.toLowerCase()

    for (const [term, synonyms] of Object.entries(this.technicalTerms)) {
      if (lowerQuery.includes(term.toLowerCase())) {
        expansions[term] = synonyms
      }
    }

    // Add calculation-specific expansions
    if (/pérdida de carga|head loss/i.test(query)) {
      expansions['pérdida de carga'] = ['hf', 'pérdidas por fricción', 'pérdidas hidráulicas', 'head loss']
    }

    if (/bomba|pump/i.test(query)) {
      expansions['bomba'] = ['equipo de bombeo', 'sistema de bombeo', 'estación de bombeo', 'pump']
    }

    if (/tubería|pipe/i.test(query)) {
      expansions['tubería'] = ['conducto', 'ducto', 'línea', 'pipe', 'conducción']
    }

    return expansions
  }

  private applyExpansions(
    reformulations: string[],
    expansions: Record<string, string[]>
  ): string[] {
    if (Object.keys(expansions).length === 0) {
      return reformulations
    }

    const expanded: string[] = []

    for (const reformulation of reformulations) {
      expanded.push(reformulation) // Keep original

      // Create one variant with term substitutions
      let variant = reformulation
      for (const [original, synonyms] of Object.entries(expansions)) {
        if (reformulation.toLowerCase().includes(original.toLowerCase()) && synonyms.length > 0) {
          // Use first synonym
          const regex = new RegExp(original, 'gi')
          variant = variant.replace(regex, synonyms[0])
        }
      }

      if (variant !== reformulation) {
        expanded.push(variant)
      }
    }

    // Remove duplicates and limit to 5
    return Array.from(new Set(expanded)).slice(0, 5)
  }

  private generateSimpleReformulations(state: AgenticRAGState): string[] {
    const reformulations: string[] = []
    const originalWords = state.originalQuestion.split(/\s+/)

    // Strategy 1: Add technical context
    if (state.engineeringDomain !== 'general') {
      reformulations.push(
        `${state.originalQuestion} en ${this.getDomainSpanish(state.engineeringDomain)}`
      )
    }

    // Strategy 2: Add calculation context
    if (state.calculationType) {
      reformulations.push(
        `Cálculo de ${this.getCalculationTypeSpanish(state.calculationType)} ${state.originalQuestion}`
      )
    }

    // Strategy 3: Rephrase as "how to"
    if (!state.originalQuestion.toLowerCase().startsWith('cómo')) {
      reformulations.push(`Cómo ${state.originalQuestion.toLowerCase()}`)
    }

    // Strategy 4: Add standards context
    if (state.applicableStandards.length > 0) {
      reformulations.push(
        `${state.originalQuestion} según ${state.applicableStandards[0]}`
      )
    }

    return reformulations.filter(r => r !== state.originalQuestion).slice(0, 3)
  }

  private getContextFromFailedRetrieval(state: AgenticRAGState): string {
    if (state.gradedDocuments.length === 0) {
      return 'Contexto: No se encontraron documentos en la búsqueda anterior.'
    }

    const avgScore = state.relevanceScores.reduce((a, b) => a + b, 0) / state.relevanceScores.length

    if (avgScore < 0.5) {
      return 'Contexto: Los documentos encontrados tuvieron baja relevancia. Necesitamos términos más específicos.'
    }

    return 'Contexto: Los documentos encontrados no respondieron completamente la pregunta.'
  }

  private getDomainSpanish(domain: string): string {
    const domains: Record<string, string> = {
      'water_distribution': 'sistemas de distribución de agua potable',
      'sewage': 'sistemas de alcantarillado',
      'hydraulics': 'hidráulica general',
      'general': 'ingeniería hidráulica'
    }

    return domains[domain] || domains.general
  }

  private getDomainHints(domain: string): string {
    const hints: Record<string, string> = {
      'water_distribution': `- Redes de distribución, acueductos
- Pérdidas de carga, dimensionamiento
- Bombeo, tanques de almacenamiento
- Calidad del agua, presiones`,

      'sewage': `- Colectores, emisarios
- Aguas residuales, pluviales
- Pendientes, velocidades mínimas
- Tratamiento, vertimientos`,

      'hydraulics': `- Ecuaciones fundamentales (Bernoulli, continuidad)
- Flujo en tuberías y canales
- Máquinas hidráulicas
- Análisis dimensional`,

      'general': `- Mecánica de fluidos
- Infraestructura hidráulica
- Normativa técnica
- Cálculos hidráulicos`
    }

    return hints[domain] || hints.general
  }

  private loadTechnicalTerms(): Record<string, string[]> {
    return {
      // Hydraulic terms
      'caudal': ['flujo', 'gasto', 'descarga', 'Q', 'flow rate'],
      'presión': ['carga', 'altura piezométrica', 'P', 'pressure'],
      'velocidad': ['V', 'rapidez', 'velocity'],
      'diámetro': ['D', 'calibre', 'DN', 'dimensión', 'diameter'],
      'rugosidad': ['aspereza', 'coeficiente C', 'factor n', 'roughness'],

      // Equipment terms  
      'válvula': ['llave', 'registro', 'compuerta', 'valve'],
      'tanque': ['reservorio', 'almacenamiento', 'depósito', 'tank'],
      'tubería': ['conducto', 'ducto', 'cañería', 'pipe'],

      // Calculation terms
      'pérdida': ['pérdida de carga', 'hf', 'pérdida de energía', 'loss'],
      'ecuación': ['fórmula', 'expresión', 'relación', 'equation'],
      'coeficiente': ['factor', 'constante', 'parámetro', 'coefficient'],

      // Standards
      'norma': ['estándar', 'normativa', 'reglamento', 'standard'],
      'especificación': ['requerimiento', 'criterio', 'specification']
    }
  }

  private getCalculationTypeSpanish(type: string): string {
    const types: Record<string, string> = {
      'head_loss': 'pérdida de carga',
      'pipe_sizing': 'dimensionamiento de tuberías',
      'pump_selection': 'selección de bombas',
      'flow_rate': 'caudal',
      'velocity': 'velocidad',
      'pressure': 'presión'
    }

    return types[type] || type
  }
}

// Factory function
export function createReformulateNode(): ReformulateNode {
  return new ReformulateNode()
}