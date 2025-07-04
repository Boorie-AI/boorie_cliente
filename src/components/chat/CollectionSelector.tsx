import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Database, X } from 'lucide-react'
import { useRAGStore } from '@/stores/ragStore'
import { useChatStore } from '@/stores/chatStore'
import { useOnClickOutside } from '@/hooks/useOnClickOutside'
import { cn } from '@/utils/cn'
import { useTranslation } from 'react-i18next'

export function CollectionSelector() {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  
  const { collections, getCollections, loading } = useRAGStore()
  const { selectedCollectionId, setSelectedCollectionId } = useChatStore()
  
  const selectedCollection = collections.find(c => c.id === selectedCollectionId)
  
  useOnClickOutside(dropdownRef, () => setIsOpen(false))
  
  useEffect(() => {
    // Load collections when component mounts
    if (collections.length === 0 && !loading.collections) {
      getCollections()
    }
  }, [])
  
  const handleSelectCollection = (collectionId: string | null) => {
    setSelectedCollectionId(collectionId)
    setIsOpen(false)
  }
  
  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg border border-border/50",
          "text-sm font-medium transition-all duration-200",
          "hover:bg-accent hover:border-border",
          "bg-card/50 hover:bg-accent/50",
          selectedCollection && "bg-primary/10 border-primary/30"
        )}
      >
        <Database size={16} className={cn(
          "text-muted-foreground",
          selectedCollection && "text-primary"
        )} />
        <span className={cn(
          "max-w-[150px] truncate",
          selectedCollection ? "text-foreground" : "text-muted-foreground"
        )}>
          {selectedCollection ? selectedCollection.name : t('rag.noCollection')}
        </span>
        <ChevronDown size={14} className={cn(
          "text-muted-foreground transition-transform",
          isOpen && "transform rotate-180"
        )} />
      </button>
      
      {isOpen && (
        <div className={cn(
          "absolute top-full left-0 mt-2 w-64 max-h-64 overflow-y-auto",
          "bg-popover border border-border rounded-lg shadow-lg z-50",
          "animate-in fade-in-0 zoom-in-95"
        )}>
          <div className="p-1">
            {selectedCollection && (
              <button
                onClick={() => handleSelectCollection(null)}
                className={cn(
                  "w-full flex items-center justify-between px-3 py-2 text-sm rounded-md",
                  "hover:bg-accent hover:text-accent-foreground transition-colors"
                )}
              >
                <span className="flex items-center gap-2">
                  <X size={14} />
                  {t('rag.clearSelection')}
                </span>
              </button>
            )}
            
            {collections.length === 0 ? (
              <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                {loading.collections ? t('common.loading') : t('rag.noCollections')}
              </div>
            ) : (
              collections.map((collection) => (
                <button
                  key={collection.id}
                  onClick={() => handleSelectCollection(collection.id)}
                  className={cn(
                    "w-full text-left px-3 py-2 text-sm rounded-md",
                    "hover:bg-accent hover:text-accent-foreground transition-colors",
                    selectedCollectionId === collection.id && "bg-accent text-accent-foreground"
                  )}
                >
                  <div className="font-medium truncate">{collection.name}</div>
                  {collection.description && (
                    <div className="text-xs text-muted-foreground truncate mt-0.5">
                      {collection.description}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground mt-1">
                    {collection.documents?.length || 0} {t('rag.documents')}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}