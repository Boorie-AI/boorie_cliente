// Create Collection Modal - Modal for creating new RAG collections

import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useRAGStore } from '@/stores/ragStore'
import type { CreateCollectionParams } from '@/stores/ragStore'

interface CreateCollectionModalProps {
  onClose: () => void
}

export function CreateCollectionModal({ onClose }: CreateCollectionModalProps) {
  const { t } = useTranslation()
  const { embeddingModels, loading, createCollection, getEmbeddingModels } = useRAGStore()

  const [formData, setFormData] = useState<CreateCollectionParams>({
    name: '',
    description: '',
    chunkSize: 1024,
    overlap: 256,
    embeddingModel: '',
    modelProvider: ''
  })

  const [errors, setErrors] = useState<Partial<CreateCollectionParams>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    getEmbeddingModels()
  }, [getEmbeddingModels])

  // Set default model when models are loaded
  useEffect(() => {
    if (embeddingModels.local.length > 0 && !formData.embeddingModel) {
      const defaultModel = embeddingModels.local[0]
      setFormData(prev => ({
        ...prev,
        embeddingModel: defaultModel.name,
        modelProvider: defaultModel.provider
      }))
    } else if (embeddingModels.api.length > 0 && !formData.embeddingModel) {
      const defaultModel = embeddingModels.api[0]
      setFormData(prev => ({
        ...prev,
        embeddingModel: defaultModel.name,
        modelProvider: defaultModel.provider
      }))
    }
  }, [embeddingModels, formData.embeddingModel])

  const validateForm = (): boolean => {
    const newErrors: Partial<CreateCollectionParams> = {}

    if (!formData.name.trim()) {
      newErrors.name = t('rag.validation.nameRequired')
    }

    if (!formData.embeddingModel) {
      newErrors.embeddingModel = t('rag.validation.modelRequired')
    }

    if (!formData.chunkSize || formData.chunkSize < 100 || formData.chunkSize > 8000) {
      newErrors.chunkSize = t('rag.validation.chunkSizeRange')
    }

    if (formData.overlap === null || formData.overlap === undefined || formData.overlap < 0 || formData.overlap >= (formData.chunkSize || 1024)) {
      newErrors.overlap = t('rag.validation.overlapRange')
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) return

    setIsSubmitting(true)
    try {
      const success = await createCollection(formData)
      if (success) {
        onClose()
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleModelChange = (modelId: string) => {
    // Find the model in both local and api arrays
    const allModels = [...embeddingModels.local, ...embeddingModels.api]
    const selectedModel = allModels.find(m => m.id === modelId)
    
    if (selectedModel) {
      setFormData(prev => ({
        ...prev,
        embeddingModel: selectedModel.name,
        modelProvider: selectedModel.provider
      }))
    }
  }

  const allModels = [...embeddingModels.local, ...embeddingModels.api]

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
      <div className="bg-background border border-border/50 rounded-lg w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-foreground">{t('rag.createCollection')}</h2>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Collection Name */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                {t('rag.collectionName')} *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                className="w-full px-3 py-2 border border-border/50 rounded-lg bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                placeholder={t('rag.collectionNamePlaceholder')}
              />
              {errors.name && <p className="text-destructive text-xs mt-1">{errors.name}</p>}
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                {t('rag.description')}
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                className="w-full px-3 py-2 border border-border/50 rounded-lg bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                rows={3}
                placeholder={t('rag.descriptionPlaceholder')}
              />
            </div>

            {/* Embedding Model */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                {t('rag.embeddingModel')} *
              </label>
              {loading.embeddingModels ? (
                <div className="w-full px-3 py-2 border border-border/50 rounded-lg bg-muted/20 animate-pulse h-10" />
              ) : allModels.length === 0 ? (
                <div className="text-sm text-destructive">{t('rag.noEmbeddingModels')}</div>
              ) : (
                <select
                  value={allModels.find(m => m.name === formData.embeddingModel)?.id || ''}
                  onChange={(e) => handleModelChange(e.target.value)}
                  className="w-full px-3 py-2 border border-border/50 rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                >
                  {embeddingModels.local.length > 0 && (
                    <optgroup label={t('rag.localModels')}>
                      {embeddingModels.local.map(model => (
                        <option key={model.id} value={model.id}>
                          {model.name} ({model.provider})
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {embeddingModels.api.length > 0 && (
                    <optgroup label={t('rag.apiModels')}>
                      {embeddingModels.api.map(model => (
                        <option key={model.id} value={model.id}>
                          {model.name} ({model.provider})
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              )}
              {errors.embeddingModel && <p className="text-destructive text-xs mt-1">{errors.embeddingModel}</p>}
            </div>

            {/* Chunk Size */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                {t('rag.chunkSize')}
              </label>
              <input
                type="number"
                min="100"
                max="8000"
                step="1"
                value={formData.chunkSize}
                onChange={(e) => {
                  const value = e.target.value;
                  const numValue = value === '' ? null : Number(value);
                  setFormData(prev => ({ ...prev, chunkSize: numValue || 1024 }));
                }}
                className="w-full px-3 py-2 border border-border/50 rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
              <p className="text-xs text-muted-foreground mt-1">{t('rag.chunkSizeHint')}</p>
              {errors.chunkSize && <p className="text-destructive text-xs mt-1">{errors.chunkSize}</p>}
            </div>

            {/* Overlap */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                {t('rag.overlap')}
              </label>
              <input
                type="number"
                min="0"
                max={formData.chunkSize - 1}
                step="1"
                value={formData.overlap}
                onChange={(e) => {
                  const value = e.target.value;
                  const numValue = value === '' ? null : Number(value);
                  setFormData(prev => ({ ...prev, overlap: numValue ?? 256 }));
                }}
                className="w-full px-3 py-2 border border-border/50 rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
              <p className="text-xs text-muted-foreground mt-1">{t('rag.overlapHint')}</p>
              {errors.overlap && <p className="text-destructive text-xs mt-1">{errors.overlap}</p>}
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-border/50 rounded-lg text-foreground hover:bg-accent transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={isSubmitting || loading.embeddingModels || allModels.length === 0}
                className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <LoadingIcon className="w-4 h-4 animate-spin" />
                    {t('common.creating')}
                  </>
                ) : (
                  t('common.create')
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

// Icon components
const XIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
)

const LoadingIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
)