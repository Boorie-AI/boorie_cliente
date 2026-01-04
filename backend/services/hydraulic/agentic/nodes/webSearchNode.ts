import { AgenticRAGState, WebSearchResult, WebSearchConfig, Document } from '../types'
import { StateManager } from '../stateManager'
import axios from 'axios'

interface BraveSearchResult {
  title: string
  url: string
  description: string
  extra_snippets?: string[]
  page_age?: string
  language?: string
}

export class WebSearchNode {
  private config: WebSearchConfig
  private apiKey: string
  
  // Technical hydraulic engineering domains to prioritize
  private technicalDomains = [
    'awwa.org',
    'nfpa.org',
    'iso.org',
    'iwa-network.org',
    'asce.org',
    'hydraulicspneumatics.com',
    'pumpindustry.com',
    'waterworld.com',
    'epa.gov',
    'who.int/water',
    'sciencedirect.com',
    'researchgate.net',
    'academia.edu'
  ]
  
  // Domains to exclude
  private excludedDomains = [
    'wikipedia.org', // Often too general
    'facebook.com',
    'twitter.com',
    'instagram.com',
    'tiktok.com',
    'pinterest.com'
  ]
  
  constructor(config: WebSearchConfig) {
    this.config = config
    this.apiKey = process.env.BRAVE_SEARCH_API_KEY || ''
    
    if (!this.apiKey && config.enabled) {
      console.warn('[WebSearchNode] Brave Search API key not configured')
    }
    
    // Add custom excluded domains
    if (config.excludeDomains) {
      this.excludedDomains.push(...config.excludeDomains)
    }
  }
  
  async execute(state: AgenticRAGState, stateManager: StateManager): Promise<WebSearchResult> {
    const startTime = Date.now()
    
    if (!this.config.enabled || !this.apiKey) {
      return {
        success: false,
        error: 'Web search is disabled or API key not configured',
        data: {
          webDocuments: [],
          searchQuery: '',
          resultsCount: 0
        },
        nextNode: 'generate'
      }
    }
    
    try {
      // Build search query with technical context
      const searchQuery = this.buildSearchQuery(state)
      
      // Execute web search
      const searchResults = await this.performSearch(searchQuery)
      
      // Convert to documents
      const webDocuments = await this.convertToDocuments(searchResults, state)
      
      // Update state
      stateManager.updateState({
        webSearchResults: webDocuments
      })
      
      return {
        success: true,
        data: {
          webDocuments,
          searchQuery,
          resultsCount: webDocuments.length
        },
        nextNode: 'generate',
        metrics: {
          duration: Date.now() - startTime,
          apiCalls: 1
        }
      }
    } catch (error) {
      console.error('[WebSearchNode] Error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      stateManager.addError('webSearch', errorMessage, false)
      
      return {
        success: false,
        error: errorMessage,
        data: {
          webDocuments: [],
          searchQuery: '',
          resultsCount: 0
        },
        nextNode: 'generate' // Continue to generation even on failure
      }
    }
  }
  
  private buildSearchQuery(state: AgenticRAGState): string {
    let query = state.originalQuestion
    
    // Add technical context
    if (state.engineeringDomain !== 'general') {
      const domainKeywords: Record<string, string> = {
        'water_distribution': 'water distribution system hydraulic',
        'sewage': 'sewage wastewater hydraulic',
        'hydraulics': 'hydraulic engineering fluid mechanics'
      }
      
      if (domainKeywords[state.engineeringDomain]) {
        query = `${domainKeywords[state.engineeringDomain]} ${query}`
      }
    }
    
    // Add calculation type if present
    if (state.calculationType) {
      const calcKeywords: Record<string, string> = {
        'head_loss': 'head loss calculation Hazen Williams Darcy Weisbach',
        'pipe_sizing': 'pipe sizing diameter hydraulic design',
        'pump_selection': 'pump selection curve TDH power',
        'flow_rate': 'flow rate discharge calculation',
        'velocity': 'flow velocity hydraulic',
        'pressure': 'pressure calculation hydraulic'
      }
      
      if (calcKeywords[state.calculationType]) {
        query += ` ${calcKeywords[state.calculationType]}`
      }
    }
    
    // Add standards if applicable
    if (state.applicableStandards.length > 0) {
      query += ` ${state.applicableStandards[0]}`
    }
    
    // Add site restrictions for technical content
    if (this.config.technicalSitesOnly) {
      const siteRestrictions = this.technicalDomains
        .slice(0, 5)
        .map(domain => `site:${domain}`)
        .join(' OR ')
      
      query = `(${query}) AND (${siteRestrictions})`
    }
    
    return query
  }
  
  private async performSearch(query: string): Promise<BraveSearchResult[]> {
    try {
      const response = await axios.get('https://api.brave.com/res/v1/web/search', {
        headers: {
          'Accept': 'application/json',
          'X-Subscription-Token': this.apiKey
        },
        params: {
          q: query,
          count: this.config.maxResults * 2, // Get extra for filtering
          search_lang: 'es', // Spanish priority
          country: 'ALL',
          safesearch: 'strict',
          freshness: 'pw' // Past week for recent content
        }
      })
      
      if (!response.data.web?.results) {
        throw new Error('No search results returned')
      }
      
      return response.data.web.results
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Brave Search API error: ${error.response?.status} - ${error.response?.statusText}`)
      }
      throw error
    }
  }
  
  private async convertToDocuments(
    results: BraveSearchResult[], 
    state: AgenticRAGState
  ): Promise<Document[]> {
    const documents: Document[] = []
    
    for (const result of results) {
      // Filter out excluded domains
      if (this.excludedDomains.some(domain => result.url.includes(domain))) {
        continue
      }
      
      // Build document content
      let content = `${result.title}\n\n${result.description}`
      
      // Add extra snippets if available
      if (result.extra_snippets && result.extra_snippets.length > 0) {
        content += '\n\n' + result.extra_snippets.join('\n\n')
      }
      
      // Check relevance to hydraulic engineering
      if (!this.isRelevantToHydraulics(content, state)) {
        continue
      }
      
      // Create document
      documents.push({
        id: this.generateDocumentId(result.url),
        content: this.cleanContent(content),
        metadata: {
          source: result.url,
          page: undefined,
          section: result.title,
          category: 'web_search',
          region: this.detectRegion(content),
          language: result.language || this.detectLanguage(content),
          standard: this.detectStandard(content),
          lastUpdated: result.page_age || new Date().toISOString()
        }
      })
      
      // Limit to configured max results
      if (documents.length >= this.config.maxResults) {
        break
      }
    }
    
    return documents
  }
  
  private isRelevantToHydraulics(content: string, state: AgenticRAGState): boolean {
    const lowerContent = content.toLowerCase()
    
    // Must contain hydraulic-related terms
    const hydraulicTerms = [
      'hydraulic', 'hidráulic', 'water', 'agua', 'pipe', 'tubería',
      'pump', 'bomba', 'flow', 'caudal', 'pressure', 'presión',
      'valve', 'válvula', 'tank', 'tanque', 'sewage', 'alcantarillado',
      'wastewater', 'residual', 'distribution', 'distribución'
    ]
    
    const hasHydraulicTerm = hydraulicTerms.some(term => lowerContent.includes(term))
    
    if (!hasHydraulicTerm) {
      return false
    }
    
    // Check for calculation-related content if needed
    if (state.calculationType) {
      const calcTerms: Record<string, string[]> = {
        'head_loss': ['head loss', 'pérdida de carga', 'hazen', 'darcy', 'friction'],
        'pipe_sizing': ['diameter', 'diámetro', 'sizing', 'dimensionamiento', 'DN'],
        'pump_selection': ['pump curve', 'curva', 'TDH', 'NPSH', 'potencia'],
        'flow_rate': ['flow rate', 'caudal', 'Q =', 'discharge', 'gasto'],
        'velocity': ['velocity', 'velocidad', 'V =', 'm/s', 'ft/s'],
        'pressure': ['pressure', 'presión', 'bar', 'psi', 'kPa']
      }
      
      const relevantTerms = calcTerms[state.calculationType] || []
      if (relevantTerms.length > 0 && !relevantTerms.some((term: string) => lowerContent.includes(term.toLowerCase()))) {
        return false
      }
    }
    
    // Exclude purely commercial content
    const commercialIndicators = [
      'buy now', 'comprar ahora', 'on sale', 'en venta',
      'discount', 'descuento', 'shop', 'tienda'
    ]
    
    const isCommercial = commercialIndicators.some(indicator => lowerContent.includes(indicator))
    
    return !isCommercial
  }
  
  private cleanContent(content: string): string {
    // Remove excessive whitespace
    content = content.replace(/\s+/g, ' ').trim()
    
    // Remove common web artifacts
    content = content.replace(/\[.*?\]/g, '') // Remove brackets
    content = content.replace(/Read more\.*/gi, '') // Remove "Read more"
    content = content.replace(/Click here\.*/gi, '') // Remove "Click here"
    
    // Limit length
    if (content.length > 2000) {
      content = content.substring(0, 2000) + '...'
    }
    
    return content
  }
  
  private generateDocumentId(url: string): string {
    // Generate a consistent ID from URL
    return `web_${Buffer.from(url).toString('base64').substring(0, 20)}`
  }
  
  private detectRegion(content: string): string {
    const regionPatterns = {
      'mexico': /méxico|mexican|nom-\d+/i,
      'colombia': /colombia|colombian|nsr|ras/i,
      'spain': /españa|spanish|une\s+\d+/i,
      'usa': /united states|american|awwa|nfpa/i,
      'international': /iso\s+\d+|international/i
    }
    
    for (const [region, pattern] of Object.entries(regionPatterns)) {
      if (pattern.test(content)) {
        return region
      }
    }
    
    return 'general'
  }
  
  private detectLanguage(content: string): string {
    // Simple language detection based on common words
    const spanishWords = /\b(el|la|de|que|en|y|los|las|un|una|para|con|por|del)\b/gi
    const englishWords = /\b(the|of|and|to|in|that|is|for|with|on|as|by)\b/gi
    
    const spanishMatches = (content.match(spanishWords) || []).length
    const englishMatches = (content.match(englishWords) || []).length
    
    return spanishMatches > englishMatches ? 'es' : 'en'
  }
  
  private detectStandard(content: string): string | undefined {
    const standardPatterns = [
      { pattern: /AWWA\s+[A-Z]\d+/i, name: 'AWWA' },
      { pattern: /ISO\s+\d+/i, name: 'ISO' },
      { pattern: /NFPA\s+\d+/i, name: 'NFPA' },
      { pattern: /NOM-\d+-\w+-\d+/i, name: 'NOM' },
      { pattern: /NSR-\d+/i, name: 'NSR' },
      { pattern: /RAS\s+\d+/i, name: 'RAS' },
      { pattern: /UNE\s+\d+/i, name: 'UNE' }
    ]
    
    for (const { pattern } of standardPatterns) {
      const match = content.match(pattern)
      if (match) {
        return match[0]
      }
    }
    
    return undefined
  }
}

// Factory function
export function createWebSearchNode(customConfig?: Partial<WebSearchConfig>): WebSearchNode {
  const defaultConfig: WebSearchConfig = {
    enabled: process.env.WEB_SEARCH_ENABLED === 'true',
    provider: 'brave',
    maxResults: parseInt(process.env.WEB_SEARCH_MAX_RESULTS || '5'),
    technicalSitesOnly: true,
    excludeDomains: []
  }
  
  const config = { ...defaultConfig, ...customConfig }
  return new WebSearchNode(config)
}