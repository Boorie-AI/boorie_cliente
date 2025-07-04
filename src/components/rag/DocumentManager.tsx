// Document Manager - Manages documents within selected collections

import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useRAGStore } from '@/stores/ragStore'
import { ConfirmationModal } from '@/components/ui/ConfirmationModal'
import type { Document } from '@/stores/ragStore'

export function DocumentManager() {
  const { t } = useTranslation()
  const {
    selectedCollectionIds,
    collections,
    documents,
    loading,
    getDocuments,
    selectDocuments,
    uploadDocument,
    deleteDocument
  } = useRAGStore()

  const [deletingDocument, setDeletingDocument] = useState<Document | null>(null)

  // Get documents for the first selected collection
  const selectedCollectionId = selectedCollectionIds[0]
  const selectedCollection = collections.find(c => c.id === selectedCollectionId)

  useEffect(() => {
    if (selectedCollectionId) {
      getDocuments(selectedCollectionId)
    }
  }, [selectedCollectionId, getDocuments])

  const handleUploadDocuments = async () => {
    if (!selectedCollectionId) return
    
    try {
      const filePaths = await selectDocuments()
      if (filePaths.length === 0) return

      // Upload documents one by one
      for (const filePath of filePaths) {
        await uploadDocument(selectedCollectionId, filePath)
      }
    } catch (error) {
      console.error('Failed to upload documents:', error)
    }
  }

  const handleDeleteConfirm = async () => {
    if (deletingDocument) {
      const success = await deleteDocument(deletingDocument.id)
      if (success) {
        setDeletingDocument(null)
      }
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const getFileTypeIcon = (fileType: string) => {
    switch (fileType) {
      case 'pdf':
        return <PdfIcon className="w-5 h-5 text-red-500" />
      case 'docx':
        return <DocIcon className="w-5 h-5 text-blue-500" />
      case 'pptx':
        return <PptIcon className="w-5 h-5 text-orange-500" />
      case 'xlsx':
        return <XlsIcon className="w-5 h-5 text-green-500" />
      default:
        return <DocumentIcon className="w-5 h-5 text-muted-foreground" />
    }
  }

  if (!selectedCollectionId) {
    return null
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border/50">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-foreground">{selectedCollection?.name}</h3>
            <p className="text-sm text-muted-foreground">
              {documents.length} {t('rag.documents')} • {selectedCollection?.embeddingModel}
            </p>
          </div>
          <button
            onClick={handleUploadDocuments}
            disabled={loading.uploading}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading.uploading ? (
              <LoadingIcon className="w-4 h-4 animate-spin" />
            ) : (
              <UploadIcon className="w-4 h-4" />
            )}
            {t('rag.uploadDocuments')}
          </button>
        </div>
      </div>

      {/* Documents list */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading.documents ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-20 bg-muted/20 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : documents.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-4">
              <DocumentIcon className="w-16 h-16 text-muted-foreground/50 mx-auto" />
              <div className="space-y-2">
                <h4 className="text-lg font-medium text-foreground">{t('rag.noDocuments')}</h4>
                <p className="text-sm text-muted-foreground max-w-sm">
                  {t('rag.uploadFirstDocument')}
                </p>
                <button
                  onClick={handleUploadDocuments}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                >
                  {t('rag.uploadDocuments')}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {documents.map(document => (
              <DocumentCard
                key={document.id}
                document={document}
                onDelete={() => setDeletingDocument(document)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {deletingDocument && (
        <ConfirmationModal
          isOpen={true}
          onClose={() => setDeletingDocument(null)}
          onConfirm={handleDeleteConfirm}
          title={t('rag.deleteDocument')}
          message={t('rag.deleteDocumentConfirm', { name: deletingDocument.filename })}
          confirmButtonText={t('common.delete')}
          cancelButtonText={t('common.cancel')}
          isDestructive={true}
        />
      )}
    </div>
  )
}

interface DocumentCardProps {
  document: Document
  onDelete: () => void
}

function DocumentCard({ document, onDelete }: DocumentCardProps) {
  const { t } = useTranslation()
  const chunkCount = document.chunks?.length || 0

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const getFileTypeIcon = (fileType: string) => {
    switch (fileType) {
      case 'pdf':
        return <PdfIcon className="w-5 h-5 text-red-500" />
      case 'docx':
        return <DocIcon className="w-5 h-5 text-blue-500" />
      case 'pptx':
        return <PptIcon className="w-5 h-5 text-orange-500" />
      case 'xlsx':
        return <XlsIcon className="w-5 h-5 text-green-500" />
      default:
        return <DocumentIcon className="w-5 h-5 text-muted-foreground" />
    }
  }

  return (
    <div className="p-4 border border-border/50 rounded-lg hover:border-border transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {getFileTypeIcon(document.fileType)}
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-medium text-foreground truncate">{document.filename}</h4>
            <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
              <span>{formatFileSize(document.fileSize)}</span>
              <span>{document.fileType.toUpperCase()}</span>
              <span>{chunkCount} {t('rag.chunks')}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
              {document.content.substring(0, 100)}...
            </p>
          </div>
        </div>
        
        <button
          onClick={onDelete}
          className="p-2 rounded hover:bg-destructive/10 transition-colors"
          title={t('common.delete')}
        >
          <TrashIcon className="w-4 h-4 text-muted-foreground hover:text-destructive transition-colors" />
        </button>
      </div>
    </div>
  )
}

// Icon components
const UploadIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
  </svg>
)

const DocumentIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
)

const TrashIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
)

const LoadingIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
)

const PdfIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path d="M6 2h8l6 6v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2zm7 1.5L18.5 9H13V3.5z"/>
  </svg>
)

const DocIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path d="M6 2h8l6 6v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2zm7 1.5L18.5 9H13V3.5z"/>
  </svg>
)

const PptIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path d="M6 2h8l6 6v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2zm7 1.5L18.5 9H13V3.5z"/>
  </svg>
)

const XlsIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path d="M6 2h8l6 6v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2zm7 1.5L18.5 9H13V3.5z"/>
  </svg>
)