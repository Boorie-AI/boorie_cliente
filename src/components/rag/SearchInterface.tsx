// Search Interface - Search documents using RAG

import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useRAGStore } from '@/stores/ragStore'
import type { DocumentChunk } from '@/stores/ragStore'

export function SearchInterface() {
  const { t } = useTranslation()
  const {
    selectedCollectionIds,
    searchResults,
    loading,
    searchDocuments,
    clearSearchResults
  } = useRAGStore()

  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(5)
  const [showResults, setShowResults] = useState(false)

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim() || selectedCollectionIds.length === 0) return

    const results = await searchDocuments(query.trim(), selectedCollectionIds, limit)
    setShowResults(true)
  }

  const handleClearSearch = () => {
    setQuery('')
    clearSearchResults()
    setShowResults(false)
  }

  return (
    <div className="space-y-4">
      {/* Search form */}
      <form onSubmit={handleSearch} className="space-y-3">
        <div className="flex gap-2">
          <div className="flex-1">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('rag.searchPlaceholder')}
              className="w-full px-3 py-2 border border-border/50 rounded-lg bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              disabled={selectedCollectionIds.length === 0}
            />
          </div>
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="px-3 py-2 border border-border/50 rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          >
            <option value={3}>3 {t('rag.results')}</option>
            <option value={5}>5 {t('rag.results')}</option>
            <option value={10}>10 {t('rag.results')}</option>
            <option value={20}>20 {t('rag.results')}</option>
          </select>
          <button
            type="submit"
            disabled={!query.trim() || selectedCollectionIds.length === 0 || loading.searching}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading.searching ? (
              <LoadingIcon className="w-4 h-4 animate-spin" />
            ) : (
              <SearchIcon className="w-4 h-4" />
            )}
            {t('rag.search')}
          </button>
        </div>

        {selectedCollectionIds.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('rag.selectCollectionsToSearch')}</p>
        )}
      </form>

      {/* Clear search button */}
      {(query || showResults) && (
        <button
          onClick={handleClearSearch}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {t('rag.clearSearch')}
        </button>
      )}

      {/* Search results */}
      {showResults && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-foreground">
              {t('rag.searchResults')} ({searchResults.length})
            </h4>
          </div>

          {searchResults.length === 0 ? (
            <div className="text-center py-8">
              <SearchIcon className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
              <h4 className="text-sm font-medium text-foreground mb-1">{t('rag.noResultsFound')}</h4>
              <p className="text-xs text-muted-foreground">{t('rag.tryDifferentQuery')}</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {searchResults.map((chunk, index) => (
                <SearchResultCard key={`${chunk.id}-${index}`} chunk={chunk} query={query} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface SearchResultCardProps {
  chunk: DocumentChunk
  query: string
}

function SearchResultCard({ chunk, query }: SearchResultCardProps) {
  const { t } = useTranslation()
  const similarity = chunk.similarity ? (chunk.similarity * 100).toFixed(1) : '0'

  // Highlight query terms in content
  const highlightContent = (content: string, query: string): string => {
    if (!query.trim()) return content
    
    const words = query.trim().split(' ').filter(word => word.length > 2)
    let highlighted = content
    
    words.forEach(word => {
      const regex = new RegExp(`(${word})`, 'gi')
      highlighted = highlighted.replace(regex, '<mark class="bg-yellow-200 dark:bg-yellow-800 px-1 rounded">$1</mark>')
    })
    
    return highlighted
  }

  return (
    <div className="p-3 border border-border/50 rounded-lg hover:border-border transition-colors">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{t('rag.similarity')}: {similarity}%</span>
          <div className="w-12 bg-muted rounded-full h-1.5">
            <div 
              className="bg-primary h-1.5 rounded-full transition-all"
              style={{ width: `${similarity}%` }}
            />
          </div>
        </div>
        {chunk.metadata?.chunkIndex !== undefined && (
          <span className="text-xs text-muted-foreground">
            {t('rag.chunk')} {chunk.metadata.chunkIndex + 1}
          </span>
        )}
      </div>
      
      <div 
        className="text-sm text-foreground leading-relaxed"
        dangerouslySetInnerHTML={{ 
          __html: highlightContent(chunk.content, query) 
        }}
      />
      
      {chunk.metadata?.sheet && (
        <div className="mt-2 text-xs text-muted-foreground">
          {t('rag.fromSheet')}: {chunk.metadata.sheet}
        </div>
      )}
    </div>
  )
}

// Icon components
const SearchIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
)

const LoadingIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
)