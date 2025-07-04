// RAG Panel - Main RAG interface component

import React, { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useRAGStore } from '@/stores/ragStore'
import { CollectionManager } from './CollectionManager'
import { DocumentManager } from './DocumentManager'
import { SearchInterface } from './SearchInterface'

export function RAGPanel() {
  const { t } = useTranslation()
  const { 
    collections, 
    selectedCollectionIds, 
    loading,
    error,
    getCollections,
    getEmbeddingModels,
    clearError
  } = useRAGStore()

  useEffect(() => {
    getCollections()
    getEmbeddingModels()
  }, [getCollections, getEmbeddingModels])

  return (
    <div className="flex h-full w-full bg-background">
      {/* Left sidebar - Collections */}
      <div className="w-80 min-w-80 border-r border-border/50 bg-background/50 flex flex-col">
        <div className="p-4 border-b border-border/50">
          <h2 className="text-lg font-semibold text-foreground">{t('rag.title')}</h2>
          <p className="text-sm text-muted-foreground mt-1">{t('rag.subtitle')}</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          <CollectionManager />
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {error && (
          <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 mx-4 mt-4 rounded-lg flex items-center justify-between">
            <span className="text-sm">{error}</span>
            <button
              onClick={clearError}
              className="text-destructive hover:text-destructive/80 ml-2"
            >
              ×
            </button>
          </div>
        )}

        {/* Search Interface */}
        <div className="p-4 border-b border-border/50">
          <SearchInterface />
        </div>

        {/* Document Manager */}
        <div className="flex-1 overflow-hidden">
          {selectedCollectionIds.length > 0 ? (
            <DocumentManager />
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-4">
                <DatabaseIcon className="w-16 h-16 text-muted-foreground/50 mx-auto" />
                <div className="space-y-2">
                  <h3 className="text-lg font-medium text-foreground">{t('rag.noCollectionSelected')}</h3>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    {t('rag.selectCollectionHint')}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Icon components
const DatabaseIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s8-1.79 8-4" />
  </svg>
)