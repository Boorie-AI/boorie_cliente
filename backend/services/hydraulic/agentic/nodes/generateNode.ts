import { AgenticRAGState, GenerationResult, GenerationConfig, Citation, GradedDocument } from '../types'
import { StateManager } from '../stateManager'
import { llamarModeloRAG } from '../modelosRAG'

export class GenerateNode {
  /** Cuánto de cada documento entra en el prompt de generación (#63). */
  private static readonly MAX_CARACTERES_POR_DOCUMENTO = 1500

  private config: GenerationConfig

  constructor(config: GenerationConfig) {
    this.config = config
  }

  public setConfig(config: GenerationConfig) {
    this.config = config
  }

  async execute(state: AgenticRAGState, stateManager: StateManager): Promise<GenerationResult> {
    const startTime = Date.now()

    try {
      // Combine relevant documents (graded + web search if any)
      const relevantDocs = this.combineRelevantDocuments(state)

      if (relevantDocs.length === 0) {
        throw new Error('No relevant documents found for generation')
      }

      // Build the generation prompt
      const prompt = this.buildGenerationPrompt(state, relevantDocs)

      // La respuesta la escribe el modelo principal de la ruta del RAG (#49):
      // es la única llamada por pregunta, así que aquí sí cabe el grande.
      const generation = await llamarModeloRAG({
        rol: 'principal',
        prompt,
        temperatura: this.config.temperature,
        maxTokens: this.config.maxTokens,
        // El margen es para la máquina lenta, no para el caso normal: aquí la
        // inferencia va por CPU y la primera llamada carga además el modelo.
        timeoutMs: 240000,
        penalizacionRepeticion: 1.1,
      })

      // Extract answer and citations
      const citations = this.extractCitations(generation, relevantDocs)

      // Calculate confidence
      const confidence = this.calculateConfidence(state, relevantDocs, generation)

      // Check if calculations were included
      const calculationsIncluded = this.detectCalculations(generation)

      // Update state
      stateManager.updateState({
        generation,
        confidence,
        citations
      })

      return {
        success: true,
        data: {
          generation,
          confidence,
          citations,
          calculationsIncluded
        },
        nextNode: 'end',
        metrics: {
          duration: Date.now() - startTime,
          tokensUsed: generation.length / 4 // Rough estimate
        }
      }
    } catch (error) {
      console.error('[GenerateNode] Error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      stateManager.addError('generate', errorMessage)

      // Try to provide a basic response
      const fallbackResponse = this.generateFallbackResponse(state)
      stateManager.updateState({
        generation: fallbackResponse,
        confidence: 0.3
      })

      return {
        success: false,
        error: errorMessage,
        data: {
          generation: fallbackResponse,
          confidence: 0.3,
          citations: [],
          calculationsIncluded: false
        },
        nextNode: 'end'
      }
    }
  }

  private combineRelevantDocuments(state: AgenticRAGState): Array<GradedDocument | Document> {
    // Get relevant graded documents
    const relevantGraded = state.gradedDocuments.filter(doc => doc.relevant)

    // Add parent documents if available
    const parentDocs = state.parentDocuments.map(doc => ({
      ...doc,
      relevanceScore: 0.8, // Assume parents are relevant
      relevant: true,
      reason: 'Parent document'
    }))

    // Add web search results
    const webDocs = state.webSearchResults.map(doc => ({
      ...doc,
      relevanceScore: 0.7, // Web results have moderate relevance
      relevant: true,
      reason: 'Web search result'
    }))

    // Combine and sort by relevance
    return [...relevantGraded, ...parentDocs, ...webDocs]
      .sort((a, b) => {
        const scoreA = 'relevanceScore' in a ? a.relevanceScore : 0.5
        const scoreB = 'relevanceScore' in b ? b.relevanceScore : 0.5
        return scoreB - scoreA
      })
      // Cinco y no diez: cada documento entra entero en el prompt y evaluarlo
      // es lo que se llevaba la espera de la generación (#63).
      .slice(0, 5)
  }

  private buildGenerationPrompt(state: AgenticRAGState, documents: any[]): string {
    const languageInstructions = this.getLanguageInstructions(state.queryLanguage)
    const technicalContext = this.getTechnicalContext(state)
    const documentsContext = this.formatDocuments(documents)

    let prompt = `${this.getSystemPrompt(state)}

${technicalContext}

${languageInstructions}

Documentos verificados y relevantes:
${documentsContext}

Pregunta del usuario: "${state.originalQuestion}"

Instrucciones específicas:
1. Basa tu respuesta ÚNICAMENTE en los documentos proporcionados
2. ${this.config.includeCitations ? 'Cita las fuentes usando [Fuente: nombre, página X]' : ''}
3. ${this.config.includeCalculations ? 'Muestra todos los cálculos paso a paso' : ''}
4. ${state.calculationType ? `Incluye específicamente ${this.getCalculationInstructions(state.calculationType)}` : ''}
5. Indica claramente cualquier suposición que hagas
6. Si falta información crítica, especifica qué se necesita

Respuesta técnica:`

    // Add technical level adjustments
    if (this.config.technicalLevel === 'basic') {
      prompt += '\n\nNota: Explica de forma simple, evitando jerga técnica excesiva.'
    } else if (this.config.technicalLevel === 'advanced') {
      prompt += '\n\nNota: Proporciona detalles técnicos completos y considera casos especiales.'
    }

    return prompt
  }

  private getSystemPrompt(state: AgenticRAGState): string {
    const domainPrompts = {
      water_distribution: `Eres un ingeniero especialista en sistemas de distribución de agua potable con experiencia en:
- Diseño de redes de acueducto urbanas y rurales
- Cálculo de pérdidas de carga (Hazen-Williams, Darcy-Weisbach)
- Selección y dimensionamiento de bombas
- Estándares AWWA, ISO, NOM para agua potable
- Optimización de presiones y caudales en la red`,

      sewage: `Eres un ingeniero especialista en sistemas de alcantarillado y saneamiento con experiencia en:
- Diseño de redes de alcantarillado sanitario y pluvial
- Cálculo hidráulico en canales abiertos (Manning)
- Dimensionamiento de colectores y emisarios
- Tratamiento de aguas residuales
- Normativa ambiental y de vertimientos`,

      hydraulics: `Eres un ingeniero hidráulico con amplia experiencia en:
- Mecánica de fluidos aplicada
- Hidráulica de canales abiertos y tuberías a presión
- Máquinas hidráulicas (bombas, turbinas)
- Estructuras hidráulicas (vertederos, compuertas)
- Modelación hidráulica y análisis dimensional`,

      general: `Eres un ingeniero hidráulico senior con conocimiento integral en:
- Sistemas de agua potable y saneamiento
- Hidráulica aplicada
- Gestión de recursos hídricos
- Normativa técnica internacional
- Software de modelación hidráulica`
    }

    return domainPrompts[state.engineeringDomain] || domainPrompts.general
  }

  private formatDocuments(documents: any[]): string {
    return documents
      .map((doc, index) => {
        const source = doc.metadata.source || 'Fuente desconocida'
        const page = doc.metadata.page ? `, página ${doc.metadata.page}` : ''
        const section = doc.metadata.section ? `, sección: ${doc.metadata.section}` : ''
        const standard = doc.metadata.standard ? ` [${doc.metadata.standard}]` : ''

        // Truncado: los documentos de simulación pasan de 4 kB y cinco enteros
        // convertían el proceso del prompt en la mitad de la espera (#63).
        const contenido = doc.content.length > GenerateNode.MAX_CARACTERES_POR_DOCUMENTO
          ? `${doc.content.slice(0, GenerateNode.MAX_CARACTERES_POR_DOCUMENTO)}…`
          : doc.content

        return `
[Documento ${index + 1}] ${source}${page}${section}${standard}
Contenido: ${contenido}
---`
      })
      .join('\n')
  }

  private extractCitations(generation: string, documents: any[]): Citation[] {
    const citations: Citation[] = []

    // Pattern to match citations like [Fuente: name, página X]
    const citationPattern = /\[Fuente:\s*([^,\]]+)(?:,\s*página\s*(\d+))?\]/g

    let match
    while ((match = citationPattern.exec(generation)) !== null) {
      const sourceName = match[1].trim()
      const page = match[2] ? parseInt(match[2]) : undefined

      // Find matching document
      const matchingDoc = documents.find(doc =>
        doc.metadata.source.toLowerCase().includes(sourceName.toLowerCase())
      )

      if (matchingDoc) {
        citations.push({
          documentId: matchingDoc.id,
          page: page || matchingDoc.metadata.page,
          section: matchingDoc.metadata.section,
          quote: match[0],
          confidence: 0.9
        })
      }
    }

    // Also extract implicit citations (formulas, standards mentioned)
    const standardPattern = /\b(AWWA|ISO|NFPA|NOM|NSR|RAS)\s*[\w-]+/g
    while ((match = standardPattern.exec(generation)) !== null) {
      const standard = match[0]
      const matchingDoc = documents.find(doc =>
        doc.content.includes(standard) || doc.metadata.standard === standard
      )

      if (matchingDoc && !citations.some(c => c.documentId === matchingDoc.id)) {
        citations.push({
          documentId: matchingDoc.id,
          quote: standard,
          confidence: 0.7
        })
      }
    }

    return citations
  }

  private calculateConfidence(state: AgenticRAGState, documents: any[], generation: string): number {
    let confidence = 0.5 // Base confidence

    // Factor 1: Document relevance scores (30%)
    const avgRelevance = documents.reduce((sum, doc) => {
      const score = 'relevanceScore' in doc ? doc.relevanceScore : 0.7
      return sum + score
    }, 0) / documents.length
    confidence += avgRelevance * 0.3

    // Factor 2: Number of citations (20%)
    const citationCount = (generation.match(/\[Fuente:/g) || []).length
    const citationScore = Math.min(citationCount / 3, 1) // Max out at 3 citations
    confidence += citationScore * 0.2

    // Factor 3: Technical content (20%)
    const hasTechnicalContent =
      /\d+\.?\d*\s*(m³\/s|l\/s|GPM|psi|bar|kPa|m\.c\.a\.|hp|kW)/.test(generation) ||
      /[A-Za-z]\s*=\s*[\d\w\s+\-*/^()]+/.test(generation)
    confidence += hasTechnicalContent ? 0.2 : 0

    // Factor 4: Answer completeness (20%)
    const wordCount = generation.split(/\s+/).length
    const completenessScore = Math.min(wordCount / 200, 1) // Expect ~200 words
    confidence += completenessScore * 0.2

    // Factor 5: Standards mentioned (10%)
    const standardsMentioned = (generation.match(/\b(AWWA|ISO|NFPA|NOM|NSR|RAS)\b/g) || []).length
    if (standardsMentioned > 0 && state.applicableStandards.length > 0) {
      confidence += 0.1
    }

    // Penalties
    if (generation.includes('no tengo información') || generation.includes('no puedo')) {
      confidence *= 0.7
    }

    if (!hasTechnicalContent && state.calculationType) {
      confidence *= 0.8
    }

    return Math.min(Math.max(confidence, 0), 1)
  }

  private detectCalculations(generation: string): boolean {
    // Look for calculation indicators
    const calculationPatterns = [
      /\d+\.?\d*\s*[+\-×x*/÷]\s*\d+\.?\d*/,  // Basic arithmetic
      /[A-Za-z]\s*=\s*[\d\w\s+\-*/^()]+/, // Equations
      /√\d+/,                                     // Square roots
      /\d+\s*\^\s*\d+/,                          // Exponents
      /∑|∫|∆|Δ|π/,                               // Mathematical symbols
      /Paso\s+\d+:/i,                            // Step-by-step
      /Resultado:?\s*\d+/i                       // Results
    ]

    return calculationPatterns.some(pattern => pattern.test(generation))
  }

  /**
   * Lo que se dice cuando la generación falla.
   *
   * Distinguir los dos casos no es cosmético: durante meses este texto dijo «no
   * encontré información» en consultas que **sí** habían encontrado fuentes y en
   * las que lo que falló fue la redacción, al pasarse de su espera. Con el mismo
   * mensaje para las dos cosas, el fallo de rendimiento era indistinguible de
   * una base de conocimientos vacía, y así se quedó (#63).
   */
  private generateFallbackResponse(state: AgenticRAGState): string {
    const relevantes = state.gradedDocuments.filter(doc => doc.relevant)

    if (relevantes.length > 0) {
      const fuentes = Array.from(new Set(
        relevantes.map(doc => doc.metadata.source || doc.metadata.title).filter(Boolean)
      )).slice(0, 5)

      return `Encontré ${relevantes.length} ${relevantes.length === 1 ? 'documento relevante' : 'documentos relevantes'} para tu pregunta, pero no pude terminar de redactar la respuesta en el tiempo límite.

${fuentes.length > 0 ? `Fuentes localizadas:\n${fuentes.map(f => `- ${f}`).join('\n')}\n\n` : ''}Puedes volver a preguntar, acotar más la pregunta, o consultar esas fuentes directamente en el Wisdom Center. Si esto se repite, el modelo local está tardando más de lo que el sistema espera.`
    }

    return `No pude encontrar información específica en la base de conocimientos para responder completamente a tu pregunta sobre "${state.originalQuestion}".

Para proporcionarte una respuesta precisa, necesitaría:
1. Documentación técnica actualizada sobre ${state.engineeringDomain === 'water_distribution' ? 'sistemas de distribución de agua' : 'el tema consultado'}
2. ${state.applicableStandards.length > 0 ? `Estándares específicos: ${state.applicableStandards.join(', ')}` : 'Normativa aplicable a tu región'}
3. ${state.calculationType ? `Parámetros específicos para ${this.getCalculationTypeSpanish(state.calculationType)}` : 'Datos técnicos del sistema'}

Te sugiero:
- Proporcionar más detalles sobre tu caso específico
- Indicar la región o normativa que aplica
- Especificar los parámetros conocidos del sistema

¿Podrías reformular tu pregunta con más información?`
  }

  private getLanguageInstructions(language: string): string {
    const instructions: Record<string, string> = {
      es: 'Responde en español, usando terminología técnica estándar de ingeniería hidráulica.',
      en: 'Respond in English, using standard hydraulic engineering terminology.',
      ca: 'Respon en català, utilitzant terminologia tècnica estàndard d\'enginyeria hidràulica.'
    }

    return instructions[language] || instructions.es
  }

  private getTechnicalContext(state: AgenticRAGState): string {
    let context = ''

    if (state.applicableStandards.length > 0) {
      context += `Estándares aplicables: ${state.applicableStandards.join(', ')}\n`
    }

    if (state.calculationType) {
      context += `Tipo de cálculo requerido: ${this.getCalculationTypeSpanish(state.calculationType)}\n`
    }

    return context
  }

  private getCalculationInstructions(type: string): string {
    const instructions: Record<string, string> = {
      'head_loss': 'el cálculo detallado de pérdida de carga con la ecuación utilizada',
      'pipe_sizing': 'el procedimiento de dimensionamiento con verificación de velocidades',
      'pump_selection': 'los cálculos de altura dinámica total (TDH) y potencia requerida',
      'flow_rate': 'el cálculo de caudal con las unidades apropiadas',
      'velocity': 'el cálculo de velocidad y verificación contra límites normativos',
      'pressure': 'el análisis de presiones con consideración de golpe de ariete si aplica'
    }

    return instructions[type] || 'los cálculos pertinentes'
  }

  private getCalculationTypeSpanish(type: string): string {
    const translations: Record<string, string> = {
      'head_loss': 'pérdida de carga',
      'pipe_sizing': 'dimensionamiento de tuberías',
      'pump_selection': 'selección de bombas',
      'flow_rate': 'caudal',
      'velocity': 'velocidad',
      'pressure': 'presión'
    }

    return translations[type] || type
  }
}

// Factory function
export function createGenerateNode(customConfig?: Partial<GenerationConfig>): GenerateNode {
  const defaultConfig: GenerationConfig = {
    temperature: parseFloat(process.env.GENERATION_TEMPERATURE || '0.3'),
    maxTokens: parseInt(process.env.GENERATION_MAX_TOKENS || '2000'),
    includeCitations: true,
    includeCalculations: true,
    responseLanguage: 'es',
    technicalLevel: 'intermediate'
  }

  const config = { ...defaultConfig, ...customConfig }
  return new GenerateNode(config)
}