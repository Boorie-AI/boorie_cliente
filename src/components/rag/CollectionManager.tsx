// Collection Manager - Manages RAG collections

import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useRAGStore } from '@/stores/ragStore'
import { CreateCollectionModal } from './modals/CreateCollectionModal'
import { EditCollectionModal } from './modals/EditCollectionModal'
import { ConfirmationModal } from '@/components/ui/ConfirmationModal'
import type { Collection } from '@/stores/ragStore'

export function CollectionManager() {
  const { t } = useTranslation()
  const {
    collections,
    selectedCollectionIds,
    loading,
    setSelectedCollections,
    deleteCollection
  } = useRAGStore()

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingCollection, setEditingCollection] = useState<Collection | null>(null)
  const [deletingCollection, setDeletingCollection] = useState<Collection | null>(null)

  const handleCollectionSelect = (collectionId: string) => {
    const isSelected = selectedCollectionIds.includes(collectionId)
    if (isSelected) {
      setSelectedCollections(selectedCollectionIds.filter(id => id !== collectionId))
    } else {
      setSelectedCollections([...selectedCollectionIds, collectionId])
    }
  }

  const handleSelectAll = () => {
    if (selectedCollectionIds.length === collections.length) {
      setSelectedCollections([])
    } else {
      setSelectedCollections(collections.map(c => c.id))
    }
  }

  const handleDeleteConfirm = async () => {
    if (deletingCollection) {
      const success = await deleteCollection(deletingCollection.id)
      if (success) {
        setDeletingCollection(null)
      }
    }
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header with actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {collections.length} {t('rag.collections')}
          </span>
          {collections.length > 0 && (
            <button
              onClick={handleSelectAll}
              className="text-xs text-primary hover:text-primary/80 transition-colors"
            >
              {selectedCollectionIds.length === collections.length ? t('common.deselectAll') : t('common.selectAll')}
            </button>
          )}
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="p-2 rounded-md hover:bg-accent transition-colors"
          title={t('rag.createCollection')}
        >
          <PlusIcon className="w-4 h-4 text-muted-foreground hover:text-foreground transition-colors" />
        </button>
      </div>

      {/* Collections list */}
      <div className="space-y-2">
        {loading.collections ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-16 bg-muted/20 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : collections.length === 0 ? (
          <div className="text-center py-8">
            <FolderIcon className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
            <h4 className="text-sm font-medium text-foreground mb-1">{t('rag.noCollections')}</h4>
            <p className="text-xs text-muted-foreground mb-4">{t('rag.createFirstCollection')}</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-xs hover:bg-primary/90 transition-colors"
            >
              {t('rag.createCollection')}
            </button>
          </div>
        ) : (
          collections.map(collection => (
            <CollectionCard
              key={collection.id}
              collection={collection}
              isSelected={selectedCollectionIds.includes(collection.id)}
              onSelect={() => handleCollectionSelect(collection.id)}
              onEdit={() => setEditingCollection(collection)}
              onDelete={() => setDeletingCollection(collection)}
            />
          ))
        )}
      </div>

      {/* Modals */}
      {showCreateModal && (
        <CreateCollectionModal onClose={() => setShowCreateModal(false)} />
      )}

      {editingCollection && (
        <EditCollectionModal
          collection={editingCollection}
          onClose={() => setEditingCollection(null)}
        />
      )}

      {deletingCollection && (
        <ConfirmationModal
          isOpen={true}
          onClose={() => setDeletingCollection(null)}
          onConfirm={handleDeleteConfirm}
          title={t('rag.deleteCollection')}
          message={t('rag.deleteCollectionConfirm', { name: deletingCollection.name })}
          confirmButtonText={t('common.delete')}
          cancelButtonText={t('common.cancel')}
          isDestructive={true}
        />
      )}
    </div>
  )
}

interface CollectionCardProps {
  collection: Collection
  isSelected: boolean
  onSelect: () => void
  onEdit: () => void
  onDelete: () => void
}

function CollectionCard({ collection, isSelected, onSelect, onEdit, onDelete }: CollectionCardProps) {
  const { t } = useTranslation()
  const documentCount = collection.documents?.length || 0

  return (
    <div className={`
      p-3 rounded-lg border cursor-pointer transition-all
      ${isSelected 
        ? 'border-primary bg-primary/5 ring-1 ring-primary/20' 
        : 'border-border/50 hover:border-border hover:bg-accent/50'
      }
    `}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0" onClick={onSelect}>
          <div className="flex items-center gap-2 mb-1">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={onSelect}
              className="w-3 h-3 rounded border-border/50"
              onClick={(e) => e.stopPropagation()}
            />
            <h4 className="text-sm font-medium text-foreground truncate">{collection.name}</h4>
          </div>
          {collection.description && (
            <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{collection.description}</p>
          )}
          <div className="gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <DocumentIcon className="w-3 h-3" />
              {documentCount} {t('rag.documents')}
            </span>
            <span className="flex items-center gap-1">
              <ChipIcon className="w-3 h-3" />
              {collection.embeddingModel}
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-1 ml-2">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onEdit()
            }}
            className="p-1 rounded hover:bg-accent transition-colors"
            title={t('common.edit')}
          >
            <EditIcon className="w-3 h-3 text-muted-foreground hover:text-foreground transition-colors" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            className="p-1 rounded hover:bg-destructive/10 transition-colors"
            title={t('common.delete')}
          >
            <TrashIcon className="w-3 h-3 text-muted-foreground hover:text-destructive transition-colors" />
          </button>
        </div>
      </div>
    </div>
  )
}

// Icon components
const PlusIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
  </svg>
)

const FolderIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
  </svg>
)

const DocumentIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
)

const ChipIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
  </svg>
)

const EditIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
  </svg>
)

const TrashIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
)