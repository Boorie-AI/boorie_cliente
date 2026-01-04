import type { PrismaClient } from '@prisma/client'
import { RAGSearchResult } from './ragService'

export interface QualityMetrics {
  relevanceScore: number
  technicalAccuracy: number
  completeness: number
  freshness: number
  sourceReliability: number
  overallQuality: number
  issues: QualityIssue[]
  recommendations: string[]
}

export interface QualityIssue {
  type: 'low_relevance' | 'outdated_content' | 'incomplete_info' | 'low_technical_density' | 'unreliable_source'
  severity: 'low' | 'medium' | 'high'
  description: string
  suggestion?: string
}

export interface ValidationOptions {
  strictMode?: boolean
  minQualityScore?: number
  requireTechnicalContent?: boolean
  maxContentAge?: number // en años
  preferredSources?: string[]
}

export class RAGQualityValidator {
  private prisma: PrismaClient
  
  // Fuentes confiables para ingeniería hidráulica
  private reliableSources = new Set([
    'awwa', 'american water works association',
    'iso', 'international organization for standardization',
    'epa', 'environmental protection agency',
    'who', 'world health organization',
    'asce', 'american society of civil engineers',
    'iwa', 'international water association',
    'unesco', 'united nations educational',
    'world bank', 'banco mundial',
    'bid', 'banco interamericano de desarrollo'
  ])

  // Términos técnicos que indican contenido de calidad
  private technicalIndicators = new Set([
    'ecuación', 'equation', 'fórmula', 'formula',
    'coeficiente', 'coefficient', 'parámetro', 'parameter',
    'cálculo', 'calculation', 'análisis', 'analysis',
    'dimensionamiento', 'sizing', 'diseño', 'design',
    'especificación', 'specification', 'norma', 'standard',
    'procedimiento', 'procedure', 'método', 'method',
    'resultado', 'result', 'conclusión', 'conclusion'
  ])

  constructor(prisma: PrismaClient) {
    this.prisma = prisma
  }

  /**
   * Valida la calidad de los resultados RAG
   */
  async validateResults(
    query: string,
    results: RAGSearchResult[],
    options: ValidationOptions = {}
  ): Promise<{ validatedResults: RAGSearchResult[], qualityReport: QualityMetrics[] }> {
    const {
      strictMode = false,
      minQualityScore = 0.6,
      requireTechnicalContent = true,
      maxContentAge = 10,
      preferredSources = []
    } = options

    const validatedResults: RAGSearchResult[] = []
    const qualityReport: QualityMetrics[] = []

    for (const result of results) {
      const metrics = await this.evaluateResultQuality(query, result, {
        maxContentAge,
        preferredSources,
        requireTechnicalContent
      })

      qualityReport.push(metrics)

      // Filtrar resultados según criterios de calidad
      if (this.passesQualityThreshold(metrics, minQualityScore, strictMode)) {
        // Aplicar mejoras al resultado
        const enhancedResult = this.enhanceResult(result, metrics)
        validatedResults.push(enhancedResult)
      }
    }

    // Ordenar por calidad
    const sortedResults = validatedResults.sort((a, b) => {
      const aQuality = qualityReport.find(q => q.overallQuality)?.overallQuality || 0
      const bQuality = qualityReport.find(q => q.overallQuality)?.overallQuality || 0
      return bQuality - aQuality
    })

    return {
      validatedResults: sortedResults,
      qualityReport
    }
  }

  /**
   * Evalúa la calidad de un resultado individual
   */
  private async evaluateResultQuality(
    query: string,
    result: RAGSearchResult,
    options: {
      maxContentAge: number
      preferredSources: string[]
      requireTechnicalContent: boolean
    }
  ): Promise<QualityMetrics> {
    const issues: QualityIssue[] = []
    const recommendations: string[] = []

    // 1. Evaluar relevancia (basado en score y contenido)
    const relevanceScore = this.evaluateRelevance(query, result, issues)

    // 2. Evaluar precisión técnica
    const technicalAccuracy = this.evaluateTechnicalAccuracy(result, issues)

    // 3. Evaluar completeness
    const completeness = this.evaluateCompleteness(result, issues)

    // 4. Evaluar freshness
    const freshness = this.evaluateFreshness(result, options.maxContentAge, issues)

    // 5. Evaluar confiabilidad de la fuente
    const sourceReliability = this.evaluateSourceReliability(result, options.preferredSources, issues)

    // Calcular score general
    const weights = {
      relevance: 0.3,
      technical: 0.25,
      completeness: 0.2,
      freshness: 0.15,
      source: 0.1
    }

    const overallQuality = 
      relevanceScore * weights.relevance +
      technicalAccuracy * weights.technical +
      completeness * weights.completeness +
      freshness * weights.freshness +
      sourceReliability * weights.source

    // Generar recomendaciones
    this.generateRecommendations(
      { relevanceScore, technicalAccuracy, completeness, freshness, sourceReliability },
      recommendations
    )

    return {
      relevanceScore,
      technicalAccuracy,
      completeness,
      freshness,
      sourceReliability,
      overallQuality,
      issues,
      recommendations
    }
  }

  private evaluateRelevance(query: string, result: RAGSearchResult, issues: QualityIssue[]): number {
    const queryTerms = this.tokenizeText(query.toLowerCase())
    const contentTerms = this.tokenizeText(result.relevantChunks.join(' ').toLowerCase())
    
    // Calcular overlap de términos
    const commonTerms = queryTerms.filter(term => contentTerms.includes(term))
    const termOverlap = commonTerms.length / Math.max(queryTerms.length, 1)
    
    // Considerar el score original
    const relevanceScore = (result.score * 0.7) + (termOverlap * 0.3)
    
    if (relevanceScore < 0.4) {
      issues.push({
        type: 'low_relevance',
        severity: 'high',
        description: 'El contenido tiene baja relevancia para la consulta',
        suggestion: 'Considerar reformular la consulta o buscar términos más específicos'
      })
    }
    
    return Math.min(relevanceScore, 1.0)
  }

  private evaluateTechnicalAccuracy(result: RAGSearchResult, issues: QualityIssue[]): number {
    const content = result.relevantChunks.join(' ').toLowerCase()
    
    // Buscar indicadores técnicos
    const technicalTermCount = Array.from(this.technicalIndicators)
      .filter(term => content.includes(term.toLowerCase())).length
    
    // Buscar fórmulas y ecuaciones
    const formulaPatterns = [
      /[A-Za-z]\s*=\s*[^.]*[+\-*/]/g,
      /Q\s*=\s*[^.]*/g,
      /P\s*=\s*[^.]*/g,
      /H\s*=\s*[^.]*/g
    ]
    
    const formulaCount = formulaPatterns.reduce((count, pattern) => {
      const matches = content.match(pattern)
      return count + (matches ? matches.length : 0)
    }, 0)
    
    // Buscar unidades técnicas
    const unitPatterns = /\b(m3\/s|L\/s|mca|kPa|bar|psi|mm|cm|m|km|gpm|cfs)\b/g
    const unitMatches = content.match(unitPatterns) || []
    
    // Calcular densidad técnica
    const words = content.split(/\s+/).length
    const technicalDensity = (technicalTermCount + formulaCount + unitMatches.length) / Math.max(words, 1)
    
    let accuracyScore = Math.min(technicalDensity * 10, 1.0) // Normalizar
    
    if (technicalDensity < 0.02) {
      issues.push({
        type: 'low_technical_density',
        severity: 'medium',
        description: 'El contenido tiene baja densidad técnica',
        suggestion: 'Buscar documentos más especializados o técnicos'
      })
      accuracyScore *= 0.7
    }
    
    return accuracyScore
  }

  private evaluateCompleteness(result: RAGSearchResult, issues: QualityIssue[]): number {
    const content = result.relevantChunks.join(' ')
    const contentLength = content.length
    
    // Evaluar longitud del contenido
    let lengthScore = 1.0
    if (contentLength < 200) {
      lengthScore = 0.3
      issues.push({
        type: 'incomplete_info',
        severity: 'medium',
        description: 'El contenido parece incompleto (muy corto)',
        suggestion: 'Buscar documentos con información más detallada'
      })
    } else if (contentLength < 500) {
      lengthScore = 0.6
    }
    
    // Buscar indicadores de completeness
    const completenessIndicators = [
      'ejemplo', 'example', 'caso', 'case',
      'procedimiento', 'procedure', 'paso', 'step',
      'resultado', 'result', 'conclusión', 'conclusion',
      'tabla', 'table', 'figura', 'figure',
      'referencia', 'reference', 'bibliografía', 'bibliography'
    ]
    
    const indicatorCount = completenessIndicators.filter(indicator => 
      content.toLowerCase().includes(indicator)
    ).length
    
    const indicatorScore = Math.min(indicatorCount / 3, 1.0)
    
    return (lengthScore * 0.6) + (indicatorScore * 0.4)
  }

  private evaluateFreshness(result: RAGSearchResult, maxAge: number, issues: QualityIssue[]): number {
    const lastUpdated = new Date(result.document.lastUpdated)
    const now = new Date()
    const ageInYears = (now.getTime() - lastUpdated.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
    
    let freshnessScore = Math.max(0, 1 - (ageInYears / maxAge))
    
    if (ageInYears > maxAge) {
      issues.push({
        type: 'outdated_content',
        severity: ageInYears > maxAge * 2 ? 'high' : 'medium',
        description: `El contenido tiene ${ageInYears.toFixed(1)} años de antigüedad`,
        suggestion: 'Buscar documentos más recientes o verificar si la información sigue siendo válida'
      })
      freshnessScore = 0.2 // Penalización severa por contenido muy antiguo
    }
    
    return freshnessScore
  }

  private evaluateSourceReliability(
    result: RAGSearchResult, 
    preferredSources: string[], 
    issues: QualityIssue[]
  ): number {
    const title = result.document.title.toLowerCase()
    const content = result.relevantChunks.join(' ').toLowerCase()
    const metadata = result.document.metadata
    
    // Verificar fuentes confiables
    const hasReliableSource = Array.from(this.reliableSources).some(source => 
      title.includes(source) || content.includes(source)
    )
    
    // Verificar fuentes preferidas
    const hasPreferredSource = preferredSources.some(source => 
      title.includes(source.toLowerCase()) || content.includes(source.toLowerCase())
    )
    
    let reliabilityScore = 0.5 // Base score
    
    if (hasReliableSource) {
      reliabilityScore += 0.4
    }
    
    if (hasPreferredSource) {
      reliabilityScore += 0.3
    }
    
    // Verificar indicadores de calidad en metadata
    if (metadata?.references && metadata.references.length > 0) {
      reliabilityScore += 0.1
    }
    
    if (reliabilityScore < 0.4) {
      issues.push({
        type: 'unreliable_source',
        severity: 'low',
        description: 'La fuente no está entre las reconocidas como confiables',
        suggestion: 'Verificar la credibilidad de la fuente antes de usar la información'
      })
    }
    
    return Math.min(reliabilityScore, 1.0)
  }

  private generateRecommendations(scores: any, recommendations: string[]) {
    if (scores.relevanceScore < 0.6) {
      recommendations.push('Refinar la consulta con términos más específicos')
    }
    
    if (scores.technicalAccuracy < 0.5) {
      recommendations.push('Buscar en documentos más técnicos o especializados')
    }
    
    if (scores.completeness < 0.6) {
      recommendations.push('Combinar con información de fuentes adicionales')
    }
    
    if (scores.freshness < 0.7) {
      recommendations.push('Verificar si existe información más actualizada')
    }
    
    if (scores.sourceReliability < 0.6) {
      recommendations.push('Contrastar con fuentes reconocidas del sector')
    }
  }

  private passesQualityThreshold(
    metrics: QualityMetrics, 
    minScore: number, 
    strictMode: boolean
  ): boolean {
    if (strictMode) {
      // En modo estricto, todos los aspectos deben estar por encima del umbral
      return metrics.relevanceScore >= minScore &&
             metrics.technicalAccuracy >= minScore * 0.8 &&
             metrics.completeness >= minScore * 0.7 &&
             metrics.freshness >= minScore * 0.6 &&
             metrics.sourceReliability >= minScore * 0.5
    } else {
      // En modo normal, solo el score general debe superar el umbral
      return metrics.overallQuality >= minScore
    }
  }

  private enhanceResult(result: RAGSearchResult, metrics: QualityMetrics): RAGSearchResult {
    // Agregar información de calidad al resultado
    const enhancedResult = {
      ...result,
      qualityMetrics: metrics,
      qualityScore: metrics.overallQuality
    }
    
    // Mejorar highlights basándose en términos técnicos encontrados
    if (metrics.technicalAccuracy > 0.7) {
      // Destacar contenido técnico en highlights
      enhancedResult.highlights = this.enhanceTechnicalHighlights(result.highlights)
    }
    
    return enhancedResult
  }

  private enhanceTechnicalHighlights(highlights: string[]): string[] {
    return highlights.map(highlight => {
      // Destacar términos técnicos
      let enhanced = highlight
      for (const term of this.technicalIndicators) {
        const regex = new RegExp(`\\b${term}\\b`, 'gi')
        enhanced = enhanced.replace(regex, `**${term}**`)
      }
      return enhanced
    })
  }

  private tokenizeText(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\sáéíóúñü]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length > 2)
  }

  /**
   * Genera un reporte de calidad general para un conjunto de resultados
   */
  async generateQualityReport(
    query: string,
    results: RAGSearchResult[],
    qualityMetrics: QualityMetrics[]
  ): Promise<{
    overallQuality: number
    summary: string
    recommendations: string[]
    issuesSummary: Record<string, number>
  }> {
    if (qualityMetrics.length === 0) {
      return {
        overallQuality: 0,
        summary: 'No se encontraron resultados para evaluar',
        recommendations: ['Reformular la consulta', 'Ampliar los criterios de búsqueda'],
        issuesSummary: {}
      }
    }

    const avgQuality = qualityMetrics.reduce((sum, m) => sum + m.overallQuality, 0) / qualityMetrics.length
    
    // Contar tipos de issues
    const issuesSummary: Record<string, number> = {}
    qualityMetrics.forEach(metrics => {
      metrics.issues.forEach(issue => {
        issuesSummary[issue.type] = (issuesSummary[issue.type] || 0) + 1
      })
    })

    // Recopilar recomendaciones únicas
    const allRecommendations = new Set<string>()
    qualityMetrics.forEach(metrics => {
      metrics.recommendations.forEach(rec => allRecommendations.add(rec))
    })

    // Generar resumen
    let summary = `Calidad promedio: ${(avgQuality * 100).toFixed(1)}%. `
    
    if (avgQuality >= 0.8) {
      summary += 'Excelente calidad de resultados.'
    } else if (avgQuality >= 0.6) {
      summary += 'Buena calidad de resultados.'
    } else if (avgQuality >= 0.4) {
      summary += 'Calidad moderada. Se recomienda validación adicional.'
    } else {
      summary += 'Calidad baja. Se recomienda reformular la búsqueda.'
    }

    return {
      overallQuality: avgQuality,
      summary,
      recommendations: Array.from(allRecommendations),
      issuesSummary
    }
  }
}