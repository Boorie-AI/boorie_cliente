// Agentic RAG Types for Hydraulic Engineering Domain

export interface Document {
  id: string
  content: string
  metadata: {
    source: string
    title?: string
    page?: number
    section?: string
    category?: string
    region?: string
    language?: string
    standard?: string
    lastUpdated?: string
  }
  embedding?: number[]
}

export interface GradedDocument extends Document {
  relevanceScore: number
  relevant: boolean
  reason: string
}

export interface AgenticRAGState {
  // Query state
  originalQuestion: string
  currentQuery: string
  reformulatedQueries: string[]
  queryLanguage: string

  // Document state
  retrievedDocuments: Document[]
  gradedDocuments: GradedDocument[]
  webSearchResults: Document[]
  parentDocuments: Document[] // For parent-child retrieval

  // Generation state
  generation: string
  confidence: number
  citations: Citation[]

  // Control flow
  iteration: number
  maxIterations: number
  shouldWebSearch: boolean
  shouldReformulate: boolean

  // Metrics and debugging
  relevanceScores: number[]
  processingTime: number
  nodesVisited: string[]
  errors: NodeError[]

  // Technical context
  engineeringDomain: 'water_distribution' | 'sewage' | 'hydraulics' | 'general'
  calculationType?: string
  applicableStandards: string[]
}

export interface Citation {
  documentId: string
  page?: number
  section?: string
  quote: string
  confidence: number
}

export interface NodeError {
  node: string
  error: string
  timestamp: Date
  recoverable: boolean
}

export interface NodeConfig {
  name: string
  timeout?: number
  retries?: number
  fallback?: string
}

export interface RetrievalConfig {
  topK: number
  minScore: number
  useParentChild: boolean
  includeMetadata: boolean
  categories?: string[]
  regions?: string[]
}

export interface GradingConfig {
  relevanceThreshold: number
  requireTechnicalContent: boolean
  checkStandardsAlignment: boolean
  strictRegionMatch: boolean
}

export interface GenerationConfig {
  temperature: number
  maxTokens: number
  includeCitations: boolean
  includeCalculations: boolean
  responseLanguage: string
  technicalLevel: 'basic' | 'intermediate' | 'advanced'
  provider?: string // 'local', 'openai', 'anthropic', etc.
  model?: string    // 'gpt-4o', 'claude-3-5-sonnet', 'llama3'
  apiKey?: string   // Optional API key for external providers
}

export interface WebSearchConfig {
  enabled: boolean
  provider: 'brave' | 'tavily' | 'serper'
  maxResults: number
  technicalSitesOnly: boolean
  excludeDomains: string[]
}

export interface AgenticRAGConfig {
  retrieval: RetrievalConfig
  grading: GradingConfig
  generation: GenerationConfig
  webSearch: WebSearchConfig
  maxIterations: number
  confidenceThreshold: number
  enableCaching: boolean
  debugMode: boolean
}

// Node execution result types
export interface NodeResult<T = any> {
  success: boolean
  data?: T
  error?: string
  nextNode?: string
  metrics?: {
    duration: number
    tokensUsed?: number
    apiCalls?: number
  }
}

export interface RetrievalResult extends NodeResult {
  data: {
    documents: Document[]
    queryEmbedding: number[]
    searchMethod: 'vector' | 'hybrid' | 'multiQuery'
  }
}

export interface GradingResult extends NodeResult {
  data: {
    gradedDocuments: GradedDocument[]
    averageRelevance: number
    shouldWebSearch: boolean
    shouldReformulate: boolean
  }
}

export interface GenerationResult extends NodeResult {
  data: {
    generation: string
    confidence: number
    citations: Citation[]
    calculationsIncluded: boolean
  }
}

export interface ReformulationResult extends NodeResult {
  data: {
    reformulatedQueries: string[]
    expansions: Record<string, string[]> // Technical term expansions
  }
}

export interface WebSearchResult extends NodeResult {
  data: {
    webDocuments: Document[]
    searchQuery: string
    resultsCount: number
  }
}

// Workflow control types
export type NodeName = 'retrieve' | 'grade' | 'generate' | 'reformulate' | 'webSearch' | 'end'

export interface WorkflowEdge {
  from: NodeName
  to: NodeName
  condition?: (state: AgenticRAGState) => boolean
}

export interface WorkflowConfig {
  startNode: NodeName
  edges: WorkflowEdge[]
  nodes: Record<NodeName, NodeConfig>
}

// Cache types
export interface CacheEntry {
  key: string
  value: any
  timestamp: Date
  ttl: number
  hits: number
}

// Metrics types
export interface RAGMetrics {
  totalQueries: number
  averageLatency: number
  nodeMetrics: Record<NodeName, {
    executions: number
    averageDuration: number
    errorRate: number
  }>
  cacheHitRate: number
  webSearchRate: number
  confidenceDistribution: number[]
}