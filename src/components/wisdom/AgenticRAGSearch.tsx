import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Search, Loader, AlertCircle, ChevronRight, FileText,
  Globe, BarChart2, Zap, Target,
  Brain, Layers, CheckCircle, XCircle
} from 'lucide-react'

interface AgenticSearchProps {
  onResultsChange?: (hasResults: boolean) => void
  selectedCategory?: string
  selectedRegions?: string[]
}

interface SearchSource {
  id: string
  type: 'document' | 'web'
  title: string
  relevance?: number
  page?: number
  section?: string
  category?: string
  url?: string
  cited?: boolean
  citationConfidence?: number
}

interface SearchMetrics {
  processingTime: number
  iterations: number
  nodesVisited: string[]
  documentsRetrieved: number
  webSearchUsed: boolean
  reformulationUsed: boolean
}

export function AgenticRAGSearch({
  onResultsChange,
  selectedCategory,
  selectedRegions
}: AgenticSearchProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [result, setResult] = useState<{
    answer: string
    confidence: number
    sources: SearchSource[]
    metrics: SearchMetrics
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showMetrics, setShowMetrics] = useState(false)
  const [technicalLevel, setTechnicalLevel] = useState<'basic' | 'intermediate' | 'advanced'>('intermediate')
  const [forceWebSearch, setForceWebSearch] = useState(false)
  const [systemConfig] = useState<any>(null)
  // const [systemConfig, setSystemConfig] = useState<any>(null)

  // Test system configuration on mount
  useEffect(() => {
    // testSystemConfig()
  }, [])

  /*
  const testSystemConfig = async () => {
    try {
      const config = await window.electronAPI.agenticRAG.testConfig()
      if (config.success) {
        setSystemConfig(config.data)
      }
    } catch (err) {
      console.error('Failed to test agentic RAG config:', err)
    }
  }
  */

  const performSearch = async () => {
    if (!query.trim()) return

    setIsSearching(true)
    setError(null)
    setResult(null)

    try {
      const categories = selectedCategory ? [selectedCategory] : undefined
      const regions = selectedRegions && selectedRegions.length > 0 ? selectedRegions : undefined

      const searchResult = await window.electronAPI.agenticRAG.query(query, {
        categories,
        regions,
        forceWebSearch,
        technicalLevel
      })

      if (!searchResult.success) {
        throw new Error(searchResult.error || 'Search failed')
      }

      setResult(searchResult.data!)
      onResultsChange?.(true)
    } catch (err: any) {
      setError(err.message || 'An error occurred during search')
      onResultsChange?.(false)
    } finally {
      setIsSearching(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isSearching) {
      performSearch()
    }
  }

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-500'
    if (confidence >= 0.6) return 'text-yellow-500'
    return 'text-red-500'
  }

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 0.8) return t('wisdom.confidence.high')
    if (confidence >= 0.6) return t('wisdom.confidence.medium')
    return t('wisdom.confidence.low')
  }

  const renderNodePath = (nodes: string[]) => {
    return nodes.map((node, index) => (
      <span key={node} className="inline-flex items-center">
        {index > 0 && <ChevronRight className="w-3 h-3 mx-1 text-gray-400" />}
        <span className={`text-xs px-2 py-0.5 rounded ${node === 'generate' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' :
          node === 'webSearch' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' :
            node === 'reformulate' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300' :
              'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
          }`}>
          {node}
        </span>
      </span>
    ))
  }

  return (
    <div className="space-y-4">
      {/* System Status */}
      {systemConfig && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-purple-500" />
              <span className="font-medium">Agentic RAG System</span>
            </div>
            <div className="flex items-center gap-2">
              {systemConfig.ollamaAvailable ? (
                <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                  <CheckCircle className="w-3 h-3" />
                  Ollama Connected
                </span>
              ) : (
                <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                  <XCircle className="w-3 h-3" />
                  Ollama Offline
                </span>
              )}
              {systemConfig.webSearchEnabled && (
                <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                  <Globe className="w-3 h-3" />
                  Web Search
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Search Controls */}
      <div className="space-y-3">
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={t('wisdom.search.agenticPlaceholder')}
            className="w-full px-4 py-2 pl-10 pr-24 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400"
            disabled={isSearching}
          />
          <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
          <button
            onClick={performSearch}
            disabled={isSearching || !query.trim()}
            className="absolute right-2 top-2 px-3 py-1 bg-purple-500 text-white rounded-md hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
          >
            {isSearching ? (
              <Loader className="w-4 h-4 animate-spin" />
            ) : (
              <span className="flex items-center gap-1">
                <Zap className="w-3 h-3" />
                {t('wisdom.search.agentic')}
              </span>
            )}
          </button>
        </div>

        {/* Advanced Options */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Technical Level */}
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-gray-400" />
              <select
                value={technicalLevel}
                onChange={(e) => setTechnicalLevel(e.target.value as any)}
                className="text-sm px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
              >
                <option value="basic">{t('wisdom.technicalLevel.basic')}</option>
                <option value="intermediate">{t('wisdom.technicalLevel.intermediate')}</option>
                <option value="advanced">{t('wisdom.technicalLevel.advanced')}</option>
              </select>
            </div>

            {/* Force Web Search */}
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <input
                type="checkbox"
                checked={forceWebSearch}
                onChange={(e) => setForceWebSearch(e.target.checked)}
                className="rounded text-purple-500"
              />
              <Globe className="w-4 h-4" />
              {t('wisdom.forceWebSearch')}
            </label>
          </div>

          {/* Metrics Toggle */}
          {result && (
            <button
              onClick={() => setShowMetrics(!showMetrics)}
              className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
            >
              <BarChart2 className="w-4 h-4" />
              {t('wisdom.showMetrics')}
            </button>
          )}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5" />
            <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
          </div>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Answer Section */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
            {/* Confidence Indicator */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{t('wisdom.result.answer')}</h3>
              <div className={`flex items-center gap-2 ${getConfidenceColor(result.confidence)}`}>
                <Layers className="w-4 h-4" />
                <span className="text-sm font-medium">
                  {Math.round(result.confidence * 100)}% {getConfidenceLabel(result.confidence)}
                </span>
              </div>
            </div>

            {/* Answer Text */}
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <div
                className="whitespace-pre-wrap"
                dangerouslySetInnerHTML={{
                  __html: result.answer.replace(
                    /\[Fuente: ([^\]]+)\]/g,
                    '<span class="text-purple-600 dark:text-purple-400 font-medium">[$1]</span>'
                  )
                }}
              />
            </div>
          </div>

          {/* Metrics Section */}
          {showMetrics && (
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 space-y-3">
              <h4 className="font-medium flex items-center gap-2">
                <BarChart2 className="w-4 h-4" />
                {t('wisdom.metrics.title')}
              </h4>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600 dark:text-gray-400">
                    {t('wisdom.metrics.processingTime')}:
                  </span>
                  <span className="ml-2 font-mono">{result.metrics.processingTime}ms</span>
                </div>
                <div>
                  <span className="text-gray-600 dark:text-gray-400">
                    {t('wisdom.metrics.iterations')}:
                  </span>
                  <span className="ml-2 font-mono">{result.metrics.iterations}</span>
                </div>
                <div>
                  <span className="text-gray-600 dark:text-gray-400">
                    {t('wisdom.metrics.documentsRetrieved')}:
                  </span>
                  <span className="ml-2 font-mono">{result.metrics.documentsRetrieved}</span>
                </div>
                <div>
                  <span className="text-gray-600 dark:text-gray-400">
                    {t('wisdom.metrics.webSearch')}:
                  </span>
                  <span className="ml-2">
                    {result.metrics.webSearchUsed ? (
                      <span className="text-blue-600 dark:text-blue-400">✓ Used</span>
                    ) : (
                      <span className="text-gray-400">Not used</span>
                    )}
                  </span>
                </div>
              </div>

              {/* Node Path */}
              <div>
                <span className="text-sm text-gray-600 dark:text-gray-400 block mb-2">
                  {t('wisdom.metrics.executionPath')}:
                </span>
                <div className="flex items-center flex-wrap gap-1">
                  {renderNodePath(result.metrics.nodesVisited)}
                </div>
              </div>
            </div>
          )}

          {/* Sources Section */}
          {result.sources.length > 0 && (
            <div className="space-y-3">
              <h4 className="font-medium flex items-center gap-2">
                <FileText className="w-4 h-4" />
                {t('wisdom.result.sources')} ({result.sources.length})
              </h4>

              <div className="space-y-2">
                {result.sources.map((source) => (
                  <div
                    key={source.id}
                    className={`bg-white dark:bg-gray-800 rounded-lg p-3 border ${source.cited
                      ? 'border-purple-300 dark:border-purple-700'
                      : 'border-gray-200 dark:border-gray-700'
                      }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          {source.type === 'web' ? (
                            <Globe className="w-4 h-4 text-blue-500" />
                          ) : (
                            <FileText className="w-4 h-4 text-gray-500" />
                          )}
                          <h5 className="font-medium text-sm">{source.title}</h5>
                          {source.cited && (
                            <span className="text-xs bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded">
                              Cited
                            </span>
                          )}
                        </div>

                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400 space-x-2">
                          {source.page && <span>Page {source.page}</span>}
                          {source.section && <span>{source.section}</span>}
                          {source.category && (
                            <span className="inline-block px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">
                              {source.category}
                            </span>
                          )}
                        </div>

                        {source.url && (
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 dark:text-blue-400 hover:underline mt-1 inline-block"
                          >
                            {source.url}
                          </a>
                        )}
                      </div>

                      {source.relevance !== undefined && (
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {Math.round(source.relevance * 100)}%
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}