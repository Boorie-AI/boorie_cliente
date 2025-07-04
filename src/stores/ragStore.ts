// RAG Store - Zustand store for RAG functionality

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

// Types
export interface Collection {
  id: string
  name: string
  description?: string
  chunkSize: number
  overlap: number
  embeddingModel: string
  modelProvider: string
  createdAt: Date
  updatedAt: Date
  documents?: Document[]
}

export interface Document {
  id: string
  filename: string
  filepath?: string
  fileType: 'pdf' | 'docx' | 'pptx' | 'xlsx'
  fileSize: number
  content: string
  metadata?: any
  collectionId: string
  createdAt: Date
  updatedAt: Date
  chunks?: DocumentChunk[]
}

export interface DocumentChunk {
  id: string
  content: string
  embedding?: number[]
  metadata?: any
  startPos?: number
  endPos?: number
  documentId: string
  createdAt: Date
  similarity?: number
}

export interface EmbeddingModel {
  id: string
  name: string
  provider: string
  type: 'embedding' | 'chat'
  isAvailable: boolean
}

export interface CreateCollectionParams {
  name: string
  description?: string
  chunkSize?: number
  overlap?: number
  embeddingModel: string
  modelProvider: string
}

export interface UpdateCollectionParams {
  name?: string
  description?: string
  chunkSize?: number
  overlap?: number
  embeddingModel?: string
  modelProvider?: string
}

interface RAGState {
  // State
  collections: Collection[]
  selectedCollectionIds: string[]
  documents: Document[]
  searchResults: DocumentChunk[]
  embeddingModels: {
    local: EmbeddingModel[]
    api: EmbeddingModel[]
  }
  loading: {
    collections: boolean
    documents: boolean
    uploading: boolean
    processing: boolean
    searching: boolean
    embeddingModels: boolean
  }
  error: string | null

  // Actions
  setSelectedCollections: (collectionIds: string[]) => void
  clearError: () => void
  
  // Collection actions
  createCollection: (params: CreateCollectionParams) => Promise<boolean>
  getCollections: () => Promise<void>
  getCollection: (id: string) => Promise<Collection | null>
  updateCollection: (id: string, params: UpdateCollectionParams) => Promise<boolean>
  deleteCollection: (id: string) => Promise<boolean>
  
  // Document actions
  selectDocuments: () => Promise<string[]>
  uploadDocument: (collectionId: string, filePath: string) => Promise<boolean>
  getDocuments: (collectionId: string) => Promise<void>
  deleteDocument: (documentId: string) => Promise<boolean>
  
  // Search actions
  searchDocuments: (query: string, collectionIds?: string[], limit?: number) => Promise<DocumentChunk[]>
  clearSearchResults: () => void
  
  // Model actions
  getEmbeddingModels: () => Promise<void>
  testEmbedding: (text: string, model: string, provider: string) => Promise<{ dimensions: number; sample: number[] } | null>
}

export const useRAGStore = create<RAGState>()(
  devtools(
    (set, get) => ({
      // Initial state
      collections: [],
      selectedCollectionIds: [],
      documents: [],
      searchResults: [],
      embeddingModels: {
        local: [],
        api: []
      },
      loading: {
        collections: false,
        documents: false,
        uploading: false,
        processing: false,
        searching: false,
        embeddingModels: false
      },
      error: null,

      // Basic actions
      setSelectedCollections: (collectionIds: string[]) => {
        set({ selectedCollectionIds: collectionIds })
      },

      clearError: () => {
        set({ error: null })
      },

      // Collection actions
      createCollection: async (params: CreateCollectionParams): Promise<boolean> => {
        try {
          set(state => ({ 
            loading: { ...state.loading, collections: true },
            error: null 
          }))

          const result = await window.electronAPI.rag.createCollection(params)
          
          if (result.success) {
            // Refresh collections list
            await get().getCollections()
            return true
          } else {
            set({ error: result.error || 'Failed to create collection' })
            return false
          }
        } catch (error) {
          console.error('Failed to create collection:', error)
          set({ error: 'Failed to create collection' })
          return false
        } finally {
          set(state => ({ 
            loading: { ...state.loading, collections: false }
          }))
        }
      },

      getCollections: async (): Promise<void> => {
        try {
          set(state => ({ 
            loading: { ...state.loading, collections: true },
            error: null 
          }))

          const result = await window.electronAPI.rag.getCollections()
          
          if (result.success) {
            set({ collections: result.data || [] })
          } else {
            set({ error: result.error || 'Failed to load collections' })
          }
        } catch (error) {
          console.error('Failed to get collections:', error)
          set({ error: 'Failed to load collections' })
        } finally {
          set(state => ({ 
            loading: { ...state.loading, collections: false }
          }))
        }
      },

      getCollection: async (id: string): Promise<Collection | null> => {
        try {
          const result = await window.electronAPI.rag.getCollection(id)
          
          if (result.success) {
            return result.data
          } else {
            set({ error: result.error || 'Failed to load collection' })
            return null
          }
        } catch (error) {
          console.error('Failed to get collection:', error)
          set({ error: 'Failed to load collection' })
          return null
        }
      },

      updateCollection: async (id: string, params: UpdateCollectionParams): Promise<boolean> => {
        try {
          set(state => ({ 
            loading: { ...state.loading, collections: true },
            error: null 
          }))

          const result = await window.electronAPI.rag.updateCollection(id, params)
          
          if (result.success) {
            // Refresh collections list
            await get().getCollections()
            return true
          } else {
            set({ error: result.error || 'Failed to update collection' })
            return false
          }
        } catch (error) {
          console.error('Failed to update collection:', error)
          set({ error: 'Failed to update collection' })
          return false
        } finally {
          set(state => ({ 
            loading: { ...state.loading, collections: false }
          }))
        }
      },

      deleteCollection: async (id: string): Promise<boolean> => {
        try {
          set(state => ({ 
            loading: { ...state.loading, collections: true },
            error: null 
          }))

          const result = await window.electronAPI.rag.deleteCollection(id)
          
          if (result.success) {
            // Remove from local state and refresh
            set(state => ({
              collections: state.collections.filter(c => c.id !== id),
              selectedCollectionIds: state.selectedCollectionIds.filter(cId => cId !== id)
            }))
            return true
          } else {
            set({ error: result.error || 'Failed to delete collection' })
            return false
          }
        } catch (error) {
          console.error('Failed to delete collection:', error)
          set({ error: 'Failed to delete collection' })
          return false
        } finally {
          set(state => ({ 
            loading: { ...state.loading, collections: false }
          }))
        }
      },

      // Document actions
      selectDocuments: async (): Promise<string[]> => {
        try {
          const result = await window.electronAPI.rag.selectDocuments()
          
          if (result.success) {
            return result.data || []
          } else {
            set({ error: result.error || 'Failed to select documents' })
            return []
          }
        } catch (error) {
          console.error('Failed to select documents:', error)
          set({ error: 'Failed to select documents' })
          return []
        }
      },

      uploadDocument: async (collectionId: string, filePath: string): Promise<boolean> => {
        try {
          set(state => ({ 
            loading: { ...state.loading, uploading: true },
            error: null 
          }))

          const result = await window.electronAPI.rag.uploadDocument(collectionId, filePath)
          
          if (result.success) {
            // Refresh documents for this collection
            await get().getDocuments(collectionId)
            return true
          } else {
            set({ error: result.error || 'Failed to upload document' })
            return false
          }
        } catch (error) {
          console.error('Failed to upload document:', error)
          set({ error: 'Failed to upload document' })
          return false
        } finally {
          set(state => ({ 
            loading: { ...state.loading, uploading: false }
          }))
        }
      },

      getDocuments: async (collectionId: string): Promise<void> => {
        try {
          set(state => ({ 
            loading: { ...state.loading, documents: true },
            error: null 
          }))

          const result = await window.electronAPI.rag.getDocuments(collectionId)
          
          if (result.success) {
            set({ documents: result.data || [] })
          } else {
            set({ error: result.error || 'Failed to load documents' })
          }
        } catch (error) {
          console.error('Failed to get documents:', error)
          set({ error: 'Failed to load documents' })
        } finally {
          set(state => ({ 
            loading: { ...state.loading, documents: false }
          }))
        }
      },

      deleteDocument: async (documentId: string): Promise<boolean> => {
        try {
          set(state => ({ 
            loading: { ...state.loading, documents: true },
            error: null 
          }))

          const result = await window.electronAPI.rag.deleteDocument(documentId)
          
          if (result.success) {
            // Remove from local state
            set(state => ({
              documents: state.documents.filter(d => d.id !== documentId)
            }))
            return true
          } else {
            set({ error: result.error || 'Failed to delete document' })
            return false
          }
        } catch (error) {
          console.error('Failed to delete document:', error)
          set({ error: 'Failed to delete document' })
          return false
        } finally {
          set(state => ({ 
            loading: { ...state.loading, documents: false }
          }))
        }
      },

      // Search actions
      searchDocuments: async (query: string, collectionIds?: string[], limit?: number): Promise<DocumentChunk[]> => {
        try {
          set(state => ({ 
            loading: { ...state.loading, searching: true },
            error: null 
          }))

          const targetCollections = collectionIds || get().selectedCollectionIds
          const result = await window.electronAPI.rag.searchDocuments(
            query, 
            targetCollections, 
            limit
          )
          
          if (result.success) {
            const searchResults = result.data || []
            set({ searchResults })
            return searchResults
          } else {
            set({ error: result.error || 'Failed to search documents' })
            return []
          }
        } catch (error) {
          console.error('Failed to search documents:', error)
          set({ error: 'Failed to search documents' })
          return []
        } finally {
          set(state => ({ 
            loading: { ...state.loading, searching: false }
          }))
        }
      },

      clearSearchResults: () => {
        set({ searchResults: [] })
      },

      // Model actions
      getEmbeddingModels: async (): Promise<void> => {
        try {
          set(state => ({ 
            loading: { ...state.loading, embeddingModels: true },
            error: null 
          }))

          const result = await window.electronAPI.rag.getEmbeddingModels()
          
          if (result.success) {
            set({ embeddingModels: result.data || { local: [], api: [] } })
          } else {
            set({ error: result.error || 'Failed to load embedding models' })
          }
        } catch (error) {
          console.error('Failed to get embedding models:', error)
          set({ error: 'Failed to load embedding models' })
        } finally {
          set(state => ({ 
            loading: { ...state.loading, embeddingModels: false }
          }))
        }
      },

      testEmbedding: async (text: string, model: string, provider: string): Promise<{ dimensions: number; sample: number[] } | null> => {
        try {
          const result = await window.electronAPI.rag.testEmbedding(text, model, provider)
          
          if (result.success) {
            return result.data
          } else {
            set({ error: result.error || 'Failed to test embedding' })
            return null
          }
        } catch (error) {
          console.error('Failed to test embedding:', error)
          set({ error: 'Failed to test embedding' })
          return null
        }
      }
    }),
    {
      name: 'rag-store'
    }
  )
)