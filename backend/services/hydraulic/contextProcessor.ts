import { HydraulicContext, ProjectType } from '../../../src/types/hydraulic'

export interface QueryClassification {
  type: QueryType
  confidence: number
  parameters: ExtractedParameters
  suggestedWorkflow?: WorkflowType
}

export type QueryType = 
  | 'design_new_network'
  | 'analyze_existing'
  | 'calculate_parameter'
  | 'check_compliance'
  | 'optimize_system'
  | 'troubleshoot_problem'
  | 'general_question'

export type WorkflowType =
  | 'pipe_sizing_workflow'
  | 'pump_selection_workflow'
  | 'network_analysis_workflow'
  | 'compliance_check_workflow'
  | 'optimization_workflow'

export interface ExtractedParameters {
  // Network parameters
  networkType?: 'distribution' | 'transmission' | 'collection'
  pipelineMaterial?: string
  diameter?: { value: number; unit: string }
  length?: { value: number; unit: string }
  flow?: { value: number; unit: string }
  pressure?: { value: number; unit: string }
  
  // Location parameters
  country?: string
  region?: string
  city?: string
  
  // Design parameters
  population?: number
  demandPattern?: string
  fireFlow?: boolean
  
  // Component parameters
  components?: {
    pipes?: number
    pumps?: number
    tanks?: number
    valves?: number
  }
  
  // Analysis parameters
  analysisType?: string[]
  timeHorizon?: { value: number; unit: string }
  
  // Raw extracted values for further processing
  rawValues?: Record<string, any>
}

export class HydraulicContextProcessor {
  private queryPatterns: Map<QueryType, RegExp[]>
  private parameterExtractors: Map<string, RegExp>
  private unitPatterns: Map<string, RegExp>
  
  constructor() {
    this.initializePatterns()
  }
  
  private initializePatterns() {
    // Query type patterns
    this.queryPatterns = new Map([
      ['design_new_network', [
        /diseñ(ar|o)?\s+(una?\s+)?(nueva?\s+)?red/i,
        /dimensiona(r|miento)\s+(de\s+)?tuber[ií]as?/i,
        /calcula(r|o)?\s+diámetros?/i,
        /proyect(o|ar)?\s+(de\s+)?abastecimiento/i,
        /design\s+(a\s+)?new\s+(water\s+)?network/i
      ]],
      ['analyze_existing', [
        /analiz(ar|a)?\s+(la\s+)?red(\s+existente)?/i,
        /evalua(r|ción)?\s+(de\s+)?presiones?/i,
        /verifica(r|ción)?\s+(el\s+)?funcionamiento/i,
        /diagnóstico\s+(de\s+)?(la\s+)?red/i,
        /analyze\s+(the\s+)?existing\s+network/i
      ]],
      ['calculate_parameter', [
        /calcula(r|o)?\s+(la\s+)?pérdida/i,
        /determina(r|o)?\s+(el\s+)?caudal/i,
        /hall(ar|o)?\s+(la\s+)?presión/i,
        /cuánt(o|a)\s+(es|será)\s+(la|el)/i,
        /calculate\s+(the\s+)?(head\s+)?loss/i
      ]],
      ['check_compliance', [
        /cumpl(e|ir)?\s+con\s+(la\s+)?norma/i,
        /verifica(r|ción)?\s+normativa/i,
        /requisitos?\s+(de\s+)?(la\s+)?NOM/i,
        /está\s+dentro\s+de\s+norma/i,
        /compliance\s+with\s+standards?/i
      ]],
      ['optimize_system', [
        /optimiz(ar|ación)?\s+(de\s+)?(la\s+)?red/i,
        /mejor(ar|a)?\s+(la\s+)?eficiencia/i,
        /reduc(ir|ción)?\s+(de\s+)?costos?/i,
        /minimiza(r|ción)?\s+(de\s+)?pérdidas/i,
        /optimize\s+(the\s+)?system/i
      ]],
      ['troubleshoot_problem', [
        /problem(a|as)?\s+(con|de)\s+presión/i,
        /fug(a|as)?\s+en\s+(la\s+)?red/i,
        /no\s+llega\s+(el\s+)?agua/i,
        /baja\s+presión/i,
        /troubleshoot\s+(pressure\s+)?problem/i
      ]]
    ])
    
    // Parameter extraction patterns
    this.parameterExtractors = new Map([
      ['diameter', /(?:diámetro|diameter|DN|Ø)\s*(?:de\s+)?(\d+(?:\.\d+)?)\s*(mm|cm|m|in|pulg(?:adas?)?)?/i],
      ['length', /(?:longitud|largo|distancia|length)\s*(?:de\s+)?(\d+(?:\.\d+)?)\s*(m|km|ft|mi)?/i],
      ['flow', /(?:caudal|gasto|flujo|flow|Q)\s*(?:de\s+)?(\d+(?:\.\d+)?)\s*(L\/s|m3\/s|m³\/h|gpm|cfs)?/i],
      ['pressure', /(?:presión|pressure|P)\s*(?:de\s+)?(\d+(?:\.\d+)?)\s*(m\.?c\.?a\.?|mca|kPa|bar|psi)?/i],
      ['population', /(?:población|habitantes?|people|population)\s*(?:de\s+)?(\d+(?:,\d{3})*|\d+)/i],
      ['material', /(?:material|tubería\s+de|pipe\s+(?:material|type))\s*(?:es\s+)?(\w+(?:\s+\w+)?)/i]
    ])
    
    // Unit conversion patterns
    this.unitPatterns = new Map([
      ['length_metric', /^(mm|cm|m|km)$/i],
      ['length_imperial', /^(in|ft|yd|mi)$/i],
      ['flow_metric', /^(L\/s|m3\/s|m³\/h)$/i],
      ['flow_imperial', /^(gpm|cfs|gpd)$/i],
      ['pressure_metric', /^(Pa|kPa|bar|mca|m\.c\.a\.)$/i],
      ['pressure_imperial', /^(psi|ft)$/i]
    ])
  }
  
  async classifyQuery(query: string, context?: Partial<HydraulicContext>): Promise<QueryClassification> {
    const normalizedQuery = this.normalizeQuery(query)
    
    // Try to match query patterns
    let matchedType: QueryType = 'general_question'
    let maxMatches = 0
    
    for (const [type, patterns] of this.queryPatterns) {
      const matches = patterns.filter(pattern => pattern.test(normalizedQuery)).length
      if (matches > maxMatches) {
        maxMatches = matches
        matchedType = type
      }
    }
    
    // Extract parameters
    const parameters = await this.extractParameters(normalizedQuery)
    
    // Determine confidence based on matches and context
    const confidence = this.calculateConfidence(matchedType, maxMatches, parameters, context)
    
    // Suggest workflow based on classification
    const suggestedWorkflow = this.suggestWorkflow(matchedType, parameters)
    
    return {
      type: matchedType,
      confidence,
      parameters,
      suggestedWorkflow
    }
  }
  
  async extractParameters(query: string): Promise<ExtractedParameters> {
    const params: ExtractedParameters = { rawValues: {} }
    
    // Extract numeric parameters with units
    for (const [param, pattern] of this.parameterExtractors) {
      const match = query.match(pattern)
      if (match) {
        const value = parseFloat(match[1].replace(',', ''))
        const unit = match[2] || this.inferDefaultUnit(param)
        
        switch (param) {
          case 'diameter':
            params.diameter = { value, unit }
            break
          case 'length':
            params.length = { value, unit }
            break
          case 'flow':
            params.flow = { value, unit }
            break
          case 'pressure':
            params.pressure = { value, unit }
            break
          case 'population':
            params.population = value
            break
          case 'material':
            params.pipelineMaterial = this.normalizeMaterial(match[1])
            break
        }
        
        params.rawValues![param] = match[0]
      }
    }
    
    // Extract location information
    const locationInfo = this.extractLocation(query)
    if (locationInfo) {
      Object.assign(params, locationInfo)
    }
    
    // Extract network type
    params.networkType = this.extractNetworkType(query)
    
    // Extract analysis types if mentioned
    params.analysisType = this.extractAnalysisTypes(query)
    
    return params
  }
  
  private normalizeQuery(query: string): string {
    return query
      .toLowerCase()
      .replace(/[¿?¡!]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  }
  
  private normalizeMaterial(material: string): string {
    const materialMap: Record<string, string> = {
      'pvc': 'PVC',
      'polietileno': 'HDPE',
      'hdpe': 'HDPE',
      'pe': 'HDPE',
      'acero': 'Steel',
      'steel': 'Steel',
      'hierro': 'Iron',
      'iron': 'Iron',
      'concreto': 'Concrete',
      'concrete': 'Concrete',
      'cobre': 'Copper',
      'copper': 'Copper'
    }
    
    const normalized = material.toLowerCase().trim()
    return materialMap[normalized] || material
  }
  
  private inferDefaultUnit(parameter: string): string {
    const defaults: Record<string, string> = {
      'diameter': 'mm',
      'length': 'm',
      'flow': 'L/s',
      'pressure': 'mca'
    }
    return defaults[parameter] || ''
  }
  
  private extractLocation(query: string): Partial<ExtractedParameters> {
    const location: Partial<ExtractedParameters> = {}
    
    // Country patterns
    const countries: Record<string, string[]> = {
      'México': ['méxico', 'mexico', 'mx'],
      'Colombia': ['colombia', 'co'],
      'España': ['españa', 'spain', 'es'],
      'Chile': ['chile', 'cl'],
      'Argentina': ['argentina', 'ar'],
      'Perú': ['perú', 'peru', 'pe']
    }
    
    for (const [country, patterns] of Object.entries(countries)) {
      if (patterns.some(p => query.toLowerCase().includes(p))) {
        location.country = country
        break
      }
    }
    
    return location
  }
  
  private extractNetworkType(query: string): 'distribution' | 'transmission' | 'collection' | undefined {
    if (/distribución|distribution|secundaria/i.test(query)) {
      return 'distribution'
    }
    if (/conducción|transmission|principal|aducción/i.test(query)) {
      return 'transmission'
    }
    if (/alcantarillado|sewer|collection|drenaje/i.test(query)) {
      return 'collection'
    }
    return undefined
  }
  
  private extractAnalysisTypes(query: string): string[] {
    const types: string[] = []
    
    const analysisPatterns: Record<string, RegExp> = {
      'hydraulic': /hidráulic[oa]|presión|caudal|velocidad|hydraulic|pressure|flow/i,
      'water_quality': /calidad|cloro|edad|quality|chlorine|age/i,
      'energy': /energ[íi]a|bombeo|consumo|energy|pumping|consumption/i,
      'resilience': /resiliencia|confiabilidad|redundancia|resilience|reliability/i
    }
    
    for (const [type, pattern] of Object.entries(analysisPatterns)) {
      if (pattern.test(query)) {
        types.push(type)
      }
    }
    
    return types
  }
  
  private calculateConfidence(
    type: QueryType,
    matches: number,
    parameters: ExtractedParameters,
    context?: Partial<HydraulicContext>
  ): number {
    let confidence = 0.5 // Base confidence
    
    // Increase confidence based on pattern matches
    confidence += matches * 0.15
    
    // Increase confidence if we extracted relevant parameters
    const paramCount = Object.keys(parameters).filter(k => k !== 'rawValues').length
    confidence += paramCount * 0.05
    
    // Increase confidence if context aligns with query
    if (context) {
      if (context.projectType && this.isProjectTypeAligned(type, context.projectType)) {
        confidence += 0.1
      }
    }
    
    return Math.min(confidence, 1.0)
  }
  
  private isProjectTypeAligned(queryType: QueryType, projectType: ProjectType): boolean {
    const alignment: Record<QueryType, ProjectType[]> = {
      'design_new_network': ['design'],
      'analyze_existing': ['analysis', 'troubleshooting'],
      'calculate_parameter': ['design', 'analysis'],
      'check_compliance': ['design', 'analysis'],
      'optimize_system': ['optimization'],
      'troubleshoot_problem': ['troubleshooting'],
      'general_question': ['design', 'analysis', 'optimization', 'troubleshooting']
    }
    
    return alignment[queryType]?.includes(projectType) || false
  }
  
  private suggestWorkflow(type: QueryType, parameters: ExtractedParameters): WorkflowType | undefined {
    switch (type) {
      case 'design_new_network':
        if (parameters.diameter || parameters.flow) {
          return 'pipe_sizing_workflow'
        }
        return 'network_analysis_workflow'
        
      case 'analyze_existing':
        return 'network_analysis_workflow'
        
      case 'check_compliance':
        return 'compliance_check_workflow'
        
      case 'optimize_system':
        return 'optimization_workflow'
        
      default:
        return undefined
    }
  }
  
  async identifyApplicableRegulations(
    context: HydraulicContext
  ): Promise<string[]> {
    const regulations: string[] = []
    
    // Map of countries to their main water regulations
    const countryRegulations: Record<string, string[]> = {
      'México': [
        'NOM-127-SSA1-1994', // Calidad del agua
        'NOM-001-CONAGUA-2011', // Sistemas de agua potable
        'NOM-013-CONAGUA-2000' // Redes de distribución
      ],
      'Colombia': [
        'RAS 2000 Título B', // Sistemas de acueducto
        'Resolución CRA 688/2014', // Regulación tarifaria
        'Decreto 1575/2007' // Sistema de protección y control
      ],
      'España': [
        'RD 140/2003', // Calidad del agua de consumo
        'CTE DB-HS4', // Suministro de agua
        'UNE-EN 805' // Abastecimiento de agua
      ],
      'Chile': [
        'NCh 409', // Agua potable requisitos
        'NCh 691', // Agua potable conducción
        'RIDAA' // Reglamento de instalaciones domiciliarias
      ]
    }
    
    // Add country-specific regulations
    if (context.region && countryRegulations[context.region]) {
      regulations.push(...countryRegulations[context.region])
    }
    
    // Add regulations based on project type
    if (context.projectType === 'design') {
      regulations.push('ISO 24516-1') // Gestión de activos
    }
    
    // Add regulations based on network type
    if (context.networkType === 'collection') {
      regulations.push('ISO 24511') // Aguas residuales
    }
    
    return [...new Set(regulations)] // Remove duplicates
  }
  
  formatContextForLLM(context: HydraulicContext): string {
    const sections: string[] = []
    
    sections.push(`Tipo de proyecto: ${context.projectType}`)
    sections.push(`Tipo de red: ${context.networkType}`)
    
    if (context.region) {
      sections.push(`Región: ${context.region}`)
    }
    
    if (context.regulations.length > 0) {
      sections.push(`Normativas aplicables: ${context.regulations.join(', ')}`)
    }
    
    if (context.components.length > 0) {
      const componentSummary = context.components
        .reduce((acc, comp) => {
          acc[comp.type] = (acc[comp.type] || 0) + 1
          return acc
        }, {} as Record<string, number>)
      
      sections.push(`Componentes: ${Object.entries(componentSummary)
        .map(([type, count]) => `${count} ${type}s`)
        .join(', ')}`)
    }
    
    if (context.constraints.length > 0) {
      sections.push(`Restricciones: ${context.constraints
        .map(c => `${c.type}: ${c.min || ''}${c.min && c.max ? '-' : ''}${c.max || ''} ${c.units}`)
        .join(', ')}`)
    }
    
    return sections.join('\n')
  }
}