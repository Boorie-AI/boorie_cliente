import { useState, useEffect } from 'react'

import {
  Upload, Search, FileText, Trash2, RefreshCw, Settings,
  Grid, List, FolderOpen, Archive, Plus, Network, CheckSquare, Square
} from 'lucide-react'
import { VectorGraphViewer } from './VectorGraphViewer'
import { BulkUploadDialog } from './BulkUploadDialog'

// Interfaces
interface IndexingStatus {
  isIndexed: boolean
  hasEmbeddings: boolean
  indexingComplete: boolean
  totalChunks: number
  chunksWithEmbeddings: number
  status: 'completed' | 'partial' | 'not_indexed'
}

interface WisdomDocument {
  id: string
  title: string
  category: string
  subcategory?: string
  region?: string[]
  language: string
  updatedAt: string
  version: string
  source?: string
  pageCount?: number
  size?: string
  type: 'uploaded' | 'catalog'
  indexing?: IndexingStatus
  description?: string
}

/*
interface CatalogEntry {
  id: string
  section: string
  subsection: string
  title: string
  filename: string
  category: string
  description: string
  pages?: number
  size?: string
  topics: string[]
  indexed: boolean
  lastIndexed?: string
  path: string
  type: 'catalog'
}
*/



interface EmbeddingProvider {
  id: string
  name: string
  model: string
  dimension: number
}

type ViewMode = 'grid' | 'list'

export function UnifiedWisdomPanel() {
  // const { t } = useTranslation()

  // State for documents and catalog
  const [wisdomDocuments, setWisdomDocuments] = useState<WisdomDocument[]>([])
  const [allDocuments, setAllDocuments] = useState<WisdomDocument[]>([])

  // UI State
  const [loading, setLoading] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [showSettings, setShowSettings] = useState(false)
  const [showVectorGraph, setShowVectorGraph] = useState(false)
  const [showBulkUpload, setShowBulkUpload] = useState(false)
  const [selectedDocuments, setSelectedDocuments] = useState<Set<string>>(new Set())
  const [isSelectMode, setIsSelectMode] = useState(false)
  const [apiAvailable, setApiAvailable] = useState(false)
  const [ollamaStatus, setOllamaStatus] = useState<'checking' | 'available' | 'unavailable'>('checking')

  // Progress State
  const [uploadProgress, setUploadProgress] = useState<{ current: number, total: number, message: string, filename: string } | null>(null)

  // Listen for upload progress
  useEffect(() => {
    if (window.electronAPI?.wisdom?.onUploadProgress) {
      const unsubscribe = window.electronAPI.wisdom.onUploadProgress((data: { current: number; total: number; message: string; filename: string }) => {
        setUploadProgress(data)
      })
      return () => unsubscribe()
    }
  }, [])

  // Search and filters
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [selectedRegion, setSelectedRegion] = useState<string>('')

  // Catalog specific

  // Embedding settings
  const [embeddingProviders, setEmbeddingProviders] = useState<EmbeddingProvider[]>([])
  const [selectedProviderId, setSelectedProviderId] = useState<string>('')

  // Helper function to get indexing status component
  const getIndexingStatusComponent = (indexing?: IndexingStatus) => {
    if (!indexing) {
      return <span className="text-xs text-muted-foreground">⚪ Status unknown</span>
    }

    switch (indexing.status) {
      case 'completed':
        return (
          <div className="flex items-center gap-1">
            <span className="text-xs text-green-600 font-medium">✅ Indexed</span>
            <span className="text-xs text-muted-foreground">({indexing.totalChunks} chunks)</span>
          </div>
        )
      case 'partial':
        return (
          <div className="flex items-center gap-1">
            <span className="text-xs text-yellow-600 font-medium">🔄 Partial</span>
            <span className="text-xs text-muted-foreground">({indexing.chunksWithEmbeddings}/{indexing.totalChunks})</span>
          </div>
        )
      case 'not_indexed':
      default:
        return <span className="text-xs text-red-600 font-medium">❌ Not Indexed</span>
    }
  }

  // Load data on mount
  useEffect(() => {
    // Clear any potential cached data first
    console.log('🔄 Clearing all document state on mount')
    setWisdomDocuments([])
    setAllDocuments([])
    setWisdomDocuments([])
    setAllDocuments([])
    // Note: Starting with clean RAG database - no predefined documents

    // Check if electronAPI is available before loading
    if (window.electronAPI && window.electronAPI.wisdom) {
      setApiAvailable(true)
      loadAllData()
      loadEmbeddingProviders()
    } else {
      setApiAvailable(false)
      console.warn('Electron API not available, retrying in 2 seconds...')
      // Retry after a short delay in case the preload is still loading
      const timer = setTimeout(() => {
        if (window.electronAPI && window.electronAPI.wisdom) {
          setApiAvailable(true)
          loadAllData()
          loadEmbeddingProviders()
        } else {
          console.error('Electron API still not available after retry')
          setApiAvailable(false)
        }
      }, 2000)

      return () => clearTimeout(timer)
    }
  }, [])

  // Combine and filter documents when data changes
  useEffect(() => {
    combineDocuments()
  }, [wisdomDocuments, searchQuery, selectedCategory])

  // Debug: Log when embedding providers change
  useEffect(() => {
    console.log(`🔄 [React] Embedding providers state updated: ${embeddingProviders.length} providers`)
    console.log('🔍 [React] Current providers:', embeddingProviders.map(p => ({ id: p.id, name: p.name })))
    console.log('🎯 [React] Selected provider ID:', selectedProviderId)
  }, [embeddingProviders, selectedProviderId])

  const loadAllData = async () => {
    setLoading(true)
    try {
      // Only load user uploaded documents, no predefined catalog
      await loadWisdomDocuments()
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadWisdomDocuments = async () => {
    try {
      // Check if electronAPI is available
      if (!window.electronAPI || !window.electronAPI.wisdom) {
        console.error('Electron API not available')
        return
      }

      const filters: any = {}
      if (selectedCategory !== 'all') filters.category = selectedCategory
      if (selectedRegion) filters.region = selectedRegion

      console.log('🔄 Frontend: Calling wisdom.list with filters:', filters)

      let result
      try {
        result = await window.electronAPI.wisdom.list(filters)
        console.log('📄 Frontend: Raw result from IPC:', result)
      } catch (ipcError: any) {
        console.error('❌ Frontend: IPC call error:', ipcError)
        // Create a proper error response
        result = {
          success: false,
          message: ipcError.message || 'IPC call failed',
          documents: []
        }
      }

      console.log('📄 Frontend: Processed result:', { success: result.success, documentsCount: result.documents?.length || 0 })

      if (result.success) {
        const docs = (result.documents || []).map((doc: any) => ({
          ...doc,
          type: 'uploaded' as const
        }))
        console.log('✅ Frontend: Setting wisdom documents:', docs.length)
        setWisdomDocuments(docs)
      } else {
        console.error('❌ Frontend: API call failed:', result)
        setWisdomDocuments([])
      }
    } catch (error) {
      console.error('Error loading wisdom documents:', error)
      setWisdomDocuments([])
    }
  }

  // Removed catalog loading - only user documents now

  const combineDocuments = () => {
    let combined: WisdomDocument[] = [...wisdomDocuments]

    // Apply filters
    if (selectedCategory !== 'all') {
      combined = combined.filter(doc => doc.category === selectedCategory)
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      combined = combined.filter(doc => {
        const searchFields = [
          doc.title.toLowerCase(),
          doc.category.toLowerCase(),
          doc.subcategory?.toLowerCase() || '',
          doc.region?.join(' ').toLowerCase() || ''
        ].filter(Boolean)

        return searchFields.some(field => field.includes(query))
      })
    }

    setAllDocuments(combined)
  }

  const loadEmbeddingProviders = async () => {
    try {
      console.log('🔄 Loading embedding providers...')

      // Check if electronAPI is available
      if (!window.electronAPI || !window.electronAPI.wisdom) {
        console.error('❌ Electron API not available')
        setEmbeddingProviders([])
        return
      }

      // Get all providers from backend (includes dynamic Ollama detection)
      console.log('🔄 Calling wisdom.getEmbeddingProviders...')
      console.log('🔍 Available wisdom methods:', Object.keys(window.electronAPI.wisdom))

      let result
      try {
        result = await window.electronAPI.wisdom.getEmbeddingProviders()
        console.log('📦 Backend providers result:', result)
        console.log('📦 Result type:', typeof result, 'Success:', result?.success, 'Providers count:', result?.providers?.length)
      } catch (ipcError: any) {
        console.error('❌ IPC call failed:', ipcError)
        // Create fallback response
        result = {
          success: false,
          message: `IPC failed: ${ipcError.message}`,
          providers: []
        }
      }

      if (result.success && result.providers) {
        const providers = result.providers
        console.log(`📦 Total providers from backend: ${providers.length}`)
        console.log(`📊 Static providers: ${result.staticCount || 'unknown'}, Dynamic (Ollama): ${result.dynamicCount || 'unknown'}`)
        console.log('📋 All providers:', providers.map((p: any) => ({ id: p.id, name: p.name })))

        console.log('🔄 [React] About to call setEmbeddingProviders with:', providers.map((p: any) => p.name))
        setEmbeddingProviders(providers)
        console.log('✅ [React] setEmbeddingProviders called successfully')

        // Set selected provider
        const currentProviderId = result.currentProviderId || providers[0]?.id || ''
        console.log('🎯 Setting current provider:', currentProviderId)
        setSelectedProviderId(currentProviderId)
        console.log('✅ [React] setSelectedProviderId called successfully')

        // Update Ollama status based on dynamic providers
        if (result.dynamicCount > 0) {
          console.log(`✅ Ollama available with ${result.dynamicCount} models`)
          setOllamaStatus('available')
        } else {
          console.log('⚠️ No dynamic Ollama providers found')
          setOllamaStatus('unavailable')
        }
      } else {
        console.error('❌ Failed to get providers from backend:', result)
        console.log('🔄 Trying fallback approach - creating minimal providers')

        // FALLBACK: Create basic Ollama providers as minimum
        const fallbackProviders = [
          {
            id: 'ollama-nomic',
            name: 'Ollama Nomic Embed',
            model: 'nomic-embed-text',
            dimension: 768
          },
          {
            id: 'ollama-mxbai',
            name: 'Ollama MxBai Embed',
            model: 'mxbai-embed-large',
            dimension: 1024
          }
        ]

        console.log('📦 Using fallback providers:', fallbackProviders.length)
        setEmbeddingProviders(fallbackProviders)
        setSelectedProviderId(fallbackProviders[0].id)

        // Test Ollama connection separately to set correct status
        console.log('🔄 Testing Ollama status for UI display...')
        try {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 3000)

          const response = await fetch('http://localhost:11434/api/tags', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal
          })
          clearTimeout(timeoutId)

          if (response.ok) {
            setOllamaStatus('available')
            console.log('✅ Ollama is actually available - setting status to available')
          } else {
            setOllamaStatus('unavailable')
          }
        } catch (testError) {
          setOllamaStatus('unavailable')
          console.log('⚠️ Ollama status test failed - setting to unavailable')
        }

        console.log('⚠️ Using fallback providers due to IPC failure')
      }
    } catch (error) {
      console.error('❌ Error loading embedding providers:', error)
      setEmbeddingProviders([])
    }
  }

  const checkOllamaConnection = async () => {
    setOllamaStatus('checking')
    console.log('🔄 Testing Ollama connection...')

    try {
      // First try to use IPC method if available (main process can bypass CORS)
      if (window.electronAPI?.wisdom?.checkOllamaConnection) {
        console.log('🔄 Using IPC method for Ollama connection...')
        const result = await window.electronAPI.wisdom.checkOllamaConnection()
        console.log('📋 IPC result:', result)

        if (result.success) {
          if (result.available) {
            console.log(`✅ IPC: Ollama is available with ${result.totalModels} total models`)
            console.log(`🎯 IPC: Found ${result.models?.length || 0} embedding models`)
            setOllamaStatus('available')
          } else {
            console.log('❌ IPC: Ollama not available:', result.message)
            setOllamaStatus('unavailable')
          }
          return result
        } else {
          console.log('❌ IPC method failed:', result.message)
          // Fall through to fallback method
        }
      }

      // Fallback: direct fetch from renderer (may fail due to CORS)
      console.log('⚠️ Using fallback direct fetch method...')
      try {
        // Create AbortController manually for better browser compatibility
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 3000)

        const response = await fetch('http://localhost:11434/api/tags', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal
        })
        clearTimeout(timeoutId)

        if (response.ok) {
          const data = await response.json()
          const models = data.models || []
          const embeddingModels = models.filter((model: any) => {
            const name = model.name.toLowerCase()
            return (
              name.includes('embed') ||
              name.includes('nomic') ||
              name.includes('mxbai') ||
              name.includes('minilm') ||
              name.includes('bge') ||
              name.includes('e5') ||
              name.includes('gemma') ||
              name.includes('llama') ||
              name.includes('mistral')
            )
          })

          console.log(`✅ Direct fetch: Ollama is available with ${models.length} total models`)
          console.log(`🎯 Direct fetch: Found ${embeddingModels.length} embedding models`)
          setOllamaStatus('available')
          return {
            success: true,
            available: true,
            models: embeddingModels,
            totalModels: models.length,
            message: `Found ${embeddingModels.length} embedding models`
          }
        } else {
          throw new Error(`HTTP ${response.status}`)
        }
      } catch (fetchError: any) {
        console.log('❌ Direct fetch failed:', fetchError.message)
        setOllamaStatus('unavailable')
        return {
          success: true,
          available: false,
          models: [],
          totalModels: 0,
          message: `Ollama not available: ${fetchError.message}`
        }
      }
    } catch (error: any) {
      console.error('❌ Failed to check Ollama connection:', error)
      setOllamaStatus('unavailable')
      return { success: false, message: error.message }
    }
  }

  /*
    const getDimensionForModel = (modelName: string) => {
      const name = modelName.toLowerCase()
      if (name.includes('nomic')) return 768
      if (name.includes('mxbai')) return 1024
      if (name.includes('minilm')) return 384
      if (name.includes('bge-large')) return 1024
      if (name.includes('bge-base')) return 768
      if (name.includes('e5-large')) return 1024
      if (name.includes('e5-base')) return 768
      if (name.includes('gemma')) return 3072  // Gemma/EmbeddingGemma has 3072 dimensions typically
      if (name.includes('llama')) return 4096  // Llama models typically 4096
      if (name.includes('mistral')) return 4096 // Mistral models typically 4096
      return 768 // Default dimension
    }
  */

  const handleProviderChange = async (providerId: string) => {
    setLoading(true)
    try {
      const result = await window.electronAPI.wisdom.setEmbeddingProvider(providerId)
      if (result.success) {
        setSelectedProviderId(providerId)
        alert(result.message)
      } else {
        alert(result.message)
      }
    } catch (error) {
      console.error('Error changing embedding provider:', error)
      alert('Error changing embedding provider')
    } finally {
      setLoading(false)
    }
  }


  const handleUpload = async () => {
    // Check if electronAPI is available
    if (!window.electronAPI || !window.electronAPI.wisdom) {
      alert('Error: Electron API not available. Please restart the application.')
      return
    }

    const options = {
      category: selectedCategory === 'all' ? 'hydraulics' : selectedCategory as any,
      language: 'es',
      region: selectedRegion ? [selectedRegion] : undefined
    }

    setLoading(true)
    setUploadProgress(null) // Reset on start
    try {
      const result = await window.electronAPI.wisdom.upload(options)
      if (result.success) {
        await loadWisdomDocuments()

        // Show detailed success message
        let message = result.message
        if (result.stats) {
          message += `\n\nDetails:\n`
          if (result.stats.pdfProcessed > 0) {
            message += `• ${result.stats.pdfProcessed} PDF file(s) processed with advanced indexing\n`
          }
          if (result.stats.textFiles > 0) {
            message += `• ${result.stats.textFiles} text file(s) processed\n`
          }
          message += `• Total documents indexed: ${result.stats.total}`
        }

        alert(message)
      } else {
        alert(result.message)
      }
    } catch (error) {
      console.error('Error uploading documents:', error)
      alert('Error uploading documents. Please check the console for details.')
    } finally {
      setLoading(false)
      setUploadProgress(null) // Reset on finish
    }
  }

  const handleSemanticSearch = async () => {
    if (!searchQuery.trim()) return

    // Check if electronAPI is available
    if (!window.electronAPI || !window.electronAPI.wisdom) {
      alert('Error: Electron API not available. Please restart the application.')
      return
    }

    setLoading(true)
    try {
      const options = {
        category: selectedCategory !== 'all' ? selectedCategory : undefined,
        region: selectedRegion || undefined,
        language: 'es'
      }

      const result = await window.electronAPI.wisdom.search(searchQuery, options)
      if (result.success) {
        // setSearchResults(result.results || [])
        // Show search results in a modal or overlay instead of switching tabs
        alert(`Found ${result.results?.length || 0} relevant documents using semantic search`)
      }
    } catch (error) {
      console.error('Error searching documents:', error)
      alert('Error performing semantic search. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (documentId: string) => {
    if (!confirm('Are you sure you want to delete this document?')) return

    setLoading(true)
    try {
      const result = await window.electronAPI.wisdom.delete(documentId)
      if (result.success) {
        await loadWisdomDocuments()
      }
    } catch (error) {
      console.error('Error deleting document:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleForceIndex = async (documentId: string) => {
    if (!confirm('Force reindexing will delete existing chunks and recreate them. Continue?')) return

    setLoading(true)
    try {
      console.log('🔄 Force indexing document:', documentId)

      // Check if we have a reindex handler, if not use update
      if (window.electronAPI.wisdom.reindex) {
        const result = await window.electronAPI.wisdom.reindex(documentId)
        if (result.success) {
          console.log('✅ Document reindexed successfully')
          await loadWisdomDocuments() // Refresh the list
          alert('Document reindexed successfully!')
        } else {
          console.error('❌ Reindexing failed:', result.message)
          alert(`Reindexing failed: ${result.message}`)
        }
      } else {
        // Fallback: use update to trigger reprocessing
        const result = await window.electronAPI.wisdom.update(documentId, { forceReindex: true })
        if (result.success) {
          console.log('✅ Document updated/reindexed successfully')
          await loadWisdomDocuments()
          alert('Document reindexed successfully!')
        } else {
          console.error('❌ Reindexing failed:', result.message)
          alert(`Reindexing failed: ${result.message}`)
        }
      }
    } catch (error) {
      console.error('Error reindexing document:', error)
      alert('Error reindexing document. Check console for details.')
    } finally {
      setLoading(false)
    }
  }

  const handleBulkDelete = async () => {
    const selectedCount = selectedDocuments.size
    if (selectedCount === 0) {
      alert('No documents selected for deletion')
      return
    }

    if (!confirm(`Are you sure you want to delete ${selectedCount} selected documents? This action cannot be undone.`)) {
      return
    }

    setLoading(true)
    try {
      let deleted = 0
      let errors = 0

      for (const documentId of selectedDocuments) {
        try {
          const result = await window.electronAPI.wisdom.delete(documentId)
          if (result.success) {
            deleted++
          } else {
            errors++
          }
        } catch (error) {
          console.error('Error deleting document:', documentId, error)
          errors++
        }
      }

      // Clear selection and reload
      setSelectedDocuments(new Set())
      setIsSelectMode(false)
      await loadWisdomDocuments()

      if (errors === 0) {
        alert(`Successfully deleted ${deleted} documents`)
      } else {
        alert(`Deleted ${deleted} documents with ${errors} errors`)
      }
    } catch (error) {
      console.error('Error in bulk delete:', error)
      alert('Error during bulk delete operation')
    } finally {
      setLoading(false)
    }
  }

  const toggleDocumentSelection = (documentId: string) => {
    const newSelected = new Set(selectedDocuments)
    if (newSelected.has(documentId)) {
      newSelected.delete(documentId)
    } else {
      newSelected.add(documentId)
    }
    setSelectedDocuments(newSelected)
  }

  const selectAllDocuments = () => {
    const uploadedDocs = allDocuments.filter(doc => doc.type === 'uploaded')
    setSelectedDocuments(new Set(uploadedDocs.map(doc => doc.id)))
  }

  const clearSelection = () => {
    setSelectedDocuments(new Set())
  }

  // Removed catalog indexing - only user uploaded documents now

  // Removed section toggling - no catalog sections anymore

  // Get unique categories from uploaded documents only
  // const allCategories = [...new Set(wisdomDocuments.map(doc => doc.category))]

  // Removed catalog grouping - only user documents now

  // Show API unavailable message if needed
  if (!apiAvailable) {
    return (
      <div className="flex-1 p-6 bg-background overflow-y-auto">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center h-96">
            <div className="text-center">
              <div className="w-16 h-16 border-4 border-destructive/30 border-t-destructive rounded-full animate-spin mx-auto mb-4"></div>
              <h2 className="text-xl font-semibold text-foreground mb-2">Initializing Wisdom Center</h2>
              <p className="text-muted-foreground mb-4">
                Connecting to Electron API... Please wait.
              </p>
              <p className="text-sm text-muted-foreground">
                If this persists, try restarting the application.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 p-6 bg-background overflow-y-auto">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-foreground">💡 Unified Wisdom Center</h1>
          <div className="flex items-center gap-2">
            {/* View Mode Toggle */}
            <div className="flex border border-border rounded-lg">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 ${viewMode === 'grid' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'} transition-colors`}
              >
                <Grid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 ${viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'} transition-colors`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>


        {/* Filters and Actions */}
        <div className="bg-card rounded-lg p-4 mb-6">
          <div className="flex flex-wrap gap-4 items-center">
            {/* Left side - Filters and Search */}
            <div className="flex flex-wrap gap-4 items-center flex-1">
              {/* Category Filter */}
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-4 py-2 bg-background border border-border rounded-lg text-foreground"
              >
                <option value="all">All Categories</option>
                <option value="fuentes-hidrologia">Fuentes e Hidrología</option>
                <option value="obras-toma">Obras de Toma</option>
                <option value="hidraulica-aducciones">Hidráulica y Aducciones</option>
                <option value="potabilizacion">Sistemas de Potabilización</option>
                <option value="almacenamiento">Estanques de Almacenamiento</option>
                <option value="bombeo">Bombas y Estaciones de Bombeo</option>
                <option value="redes-distribucion">Redes de Distribución</option>
                <option value="aguas-servidas">Recolección de Aguas Servidas</option>
                <option value="tratamiento">Sistemas de Tratamiento</option>
                <option value="cadena-valor">Cadena de Valor APyS</option>
              </select>

              {/* Region Filter */}
              <input
                type="text"
                placeholder="Region (e.g., MX, CO, ES)"
                value={selectedRegion}
                onChange={(e) => setSelectedRegion(e.target.value)}
                className="px-4 py-2 bg-background border border-border rounded-lg text-foreground min-w-[200px]"
              />

              {/* Search Bar */}
              <div className="flex gap-2 flex-1 min-w-[300px]">
                <input
                  type="text"
                  placeholder="Search documents, topics, or descriptions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      if (e.shiftKey) {
                        handleSemanticSearch()
                      } else {
                        combineDocuments()
                      }
                    }
                  }}
                  className="flex-1 px-4 py-2 bg-background border border-border rounded-lg text-foreground"
                />
                <button
                  onClick={handleSemanticSearch}
                  disabled={loading || !searchQuery.trim()}
                  className="flex items-center gap-2 px-4 py-2 bg-accent text-accent-foreground rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50 whitespace-nowrap"
                  title="Semantic Search (Shift + Enter)"
                >
                  <Search className="w-4 h-4" />
                  RAG Search
                </button>
              </div>
            </div>

            {/* Right side - Action Buttons */}
            <div className="flex items-center gap-2">
              {/* Selection Mode Controls */}
              {isSelectMode && (
                <>
                  <button
                    onClick={selectAllDocuments}
                    disabled={loading}
                    className="flex items-center gap-2 px-3 py-2 bg-accent text-accent-foreground rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50 text-sm"
                  >
                    <CheckSquare className="w-4 h-4" />
                    Select All
                  </button>
                  <button
                    onClick={clearSelection}
                    disabled={loading || selectedDocuments.size === 0}
                    className="flex items-center gap-2 px-3 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/90 transition-colors disabled:opacity-50 text-sm"
                  >
                    <Square className="w-4 h-4" />
                    Clear
                  </button>
                  <button
                    onClick={handleBulkDelete}
                    disabled={loading || selectedDocuments.size === 0}
                    className="flex items-center gap-2 px-3 py-2 bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 transition-colors disabled:opacity-50 text-sm"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete ({selectedDocuments.size})
                  </button>
                  <button
                    onClick={() => {
                      setIsSelectMode(false)
                      setSelectedDocuments(new Set())
                    }}
                    className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Cancel
                  </button>
                </>
              )}

              {/* Regular Action Buttons */}
              {!isSelectMode && (
                <>
                  <button
                    onClick={() => setIsSelectMode(true)}
                    disabled={loading || allDocuments.filter(doc => doc.type === 'uploaded').length === 0}
                    className="flex items-center gap-2 px-3 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/90 transition-colors disabled:opacity-50 text-sm"
                    title="Select multiple documents for deletion"
                  >
                    <CheckSquare className="w-4 h-4" />
                    Select
                  </button>
                </>
              )}
              <button
                onClick={() => setShowVectorGraph(true)}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-accent text-accent-foreground rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50 whitespace-nowrap"
                title="View Vector Graph & RAG Health"
              >
                <Network className="w-4 h-4" />
                Vector Graph
              </button>

              <button
                onClick={() => setShowBulkUpload(true)}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/90 transition-colors disabled:opacity-50 whitespace-nowrap"
                title="Upload documents from folders"
              >
                <FolderOpen className="w-4 h-4" />
                Upload Folder
              </button>

              <button
                onClick={handleUpload}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                Add Document
              </button>

              <button
                onClick={async () => {
                  console.log('🔄 Manual refresh triggered by user')
                  // Clear current state first
                  setWisdomDocuments([])
                  // setCatalogEntries([])
                  setAllDocuments([])
                  // Then reload
                  await loadAllData()
                }}
                disabled={loading}
                className="flex items-center gap-2 px-3 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/90 transition-colors disabled:opacity-50"
                title="Refresh All Data"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>

              {/* Settings Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className="p-2 text-muted-foreground hover:text-foreground transition-colors"
                  title="Embedding Settings"
                >
                  <Settings className="w-4 h-4" />
                </button>

                {showSettings && (
                  <div className="absolute right-0 top-full mt-2 w-96 bg-card border border-border rounded-lg shadow-lg p-4 z-10">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-foreground">Embedding Settings</h3>
                      <button
                        onClick={async () => {
                          console.log('🔄 Manual refresh of embedding providers triggered')
                          setLoading(true)
                          try {
                            await loadEmbeddingProviders()
                            console.log('✅ Embedding providers refreshed')
                          } catch (error) {
                            console.error('❌ Failed to refresh providers:', error)
                          } finally {
                            setLoading(false)
                          }
                        }}
                        disabled={loading}
                        className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                        title="Refresh Ollama models and providers"
                      >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                      </button>
                    </div>

                    <label className="block text-sm text-muted-foreground mb-2">
                      Embedding Provider:
                    </label>

                    {/* Debug info */}
                    <div className="text-xs text-muted-foreground mb-1">
                      Debug: {embeddingProviders.length} providers loaded, selected: {selectedProviderId || 'none'}
                    </div>
                    <select
                      key={`provider-select-${embeddingProviders.length}`}
                      value={selectedProviderId}
                      onChange={(e) => handleProviderChange(e.target.value)}
                      disabled={loading}
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm mb-3"
                    >
                      {embeddingProviders.length > 0 ? (
                        embeddingProviders.map((provider) => (
                          <option key={provider.id} value={provider.id}>
                            {provider.name} ({provider.dimension}d)
                          </option>
                        ))
                      ) : (
                        <option value="">No providers available</option>
                      )}
                    </select>

                    {/* Current provider info */}
                    {selectedProviderId && (
                      <div className="bg-muted/20 rounded-lg p-3 mb-3">
                        <div className="text-sm">
                          <div className="font-medium text-foreground mb-1">Current Provider:</div>
                          {(() => {
                            const currentProvider = embeddingProviders.find(p => p.id === selectedProviderId)
                            if (!currentProvider) return null

                            const isOllama = currentProvider.id.startsWith('ollama-')
                            const isEmbeddingModel = currentProvider.model.toLowerCase().includes('embed') ||
                              currentProvider.model.toLowerCase().includes('nomic') ||
                              currentProvider.model.toLowerCase().includes('mxbai') ||
                              currentProvider.model.toLowerCase().includes('minilm') ||
                              currentProvider.model.toLowerCase().includes('bge') ||
                              currentProvider.model.toLowerCase().includes('e5')
                            return (
                              <div className="text-muted-foreground space-y-1">
                                <div>📊 Model: {currentProvider.model}</div>
                                <div>📏 Dimensions: {currentProvider.dimension}</div>
                                <div>🔗 Type: {isOllama ? 'Local (Ollama)' : 'API'}</div>
                                {isOllama && !isEmbeddingModel && (
                                  <div className="text-xs text-yellow-600 mt-1">
                                    ⚠️ This is a chat model being used for embeddings
                                  </div>
                                )}
                                {isOllama && isEmbeddingModel && (
                                  <div className="text-xs text-green-600 mt-1">
                                    ✅ Dedicated embedding model
                                  </div>
                                )}
                                {isOllama && (
                                  <div className="text-xs text-green-600 mt-1">
                                    🚀 Running locally via Ollama
                                  </div>
                                )}
                              </div>
                            )
                          })()}
                        </div>
                      </div>
                    )}

                    {/* Ollama section */}
                    <div className="border-t border-border pt-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-medium text-foreground">Ollama Models</h4>
                          <span className="text-xs px-2 py-1 bg-primary/10 text-primary rounded-full">
                            Local
                          </span>
                        </div>

                        {/* Ollama status indicator */}
                        <div className="flex items-center gap-1">
                          {ollamaStatus === 'checking' && (
                            <>
                              <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
                              <span className="text-xs text-yellow-600">Checking...</span>
                            </>
                          )}
                          {ollamaStatus === 'available' && (
                            <>
                              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                              <span className="text-xs text-green-600">Available</span>
                            </>
                          )}
                          {ollamaStatus === 'unavailable' && (
                            <>
                              <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                              <span className="text-xs text-red-600">Offline</span>
                            </>
                          )}
                        </div>
                      </div>

                      {ollamaStatus === 'available' ? (
                        <div className="text-xs text-muted-foreground space-y-1">
                          <div>🔍 Embedding models auto-detected and available</div>
                          <div>🚀 Models are running locally for privacy and speed</div>

                          <div className="mt-2 pt-2 border-t border-border">
                            <div>💡 Recommended embedding models:</div>
                            <div className="space-y-1 mt-1">
                              <div className="bg-background px-2 py-1 rounded font-mono text-xs">
                                ollama pull nomic-embed-text
                              </div>
                              <div className="bg-background px-2 py-1 rounded font-mono text-xs">
                                ollama pull mxbai-embed-large
                              </div>
                              <div className="bg-background px-2 py-1 rounded font-mono text-xs">
                                ollama pull all-minilm
                              </div>
                            </div>

                            <div className="mt-2 text-muted-foreground/80">
                              • nomic-embed-text (768d) - General purpose<br />
                              • mxbai-embed-large (1024d) - High quality<br />
                              • all-minilm (384d) - Fast & lightweight
                            </div>

                            <div className="mt-2 pt-2 border-t border-border text-xs text-yellow-600">
                              ⚠️ Chat models (gemma, llama, mistral) can be used but are less efficient for embeddings
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground space-y-1">
                          <div className="text-yellow-600">⚠️ Ollama is not running or not installed</div>
                          <div>📥 Install Ollama from: <code className="bg-background px-1 rounded">ollama.ai</code></div>
                          <div>🔄 Start Ollama service to enable local embedding models</div>

                          <div className="mt-2 pt-2 border-t border-border">
                            <button
                              onClick={async () => {
                                console.log('🧪 Testing Ollama connection manually...')

                                try {
                                  const result = await checkOllamaConnection()

                                  if (result.success && result.available) {
                                    await loadEmbeddingProviders()
                                    alert(`Ollama detected! Found ${result.models?.length || 0} embedding models out of ${result.totalModels || 0} total models.`)
                                  } else {
                                    alert(`Ollama connection failed: ${result.message || 'Unknown error'}`)
                                  }
                                } catch (error: any) {
                                  console.error('❌ Error checking connection:', error)
                                  alert(`Connection check failed: ${error.message}`)
                                }
                              }}
                              className="text-xs px-2 py-1 bg-primary/10 text-primary rounded hover:bg-primary/20 transition-colors"
                            >
                              🧪 Test Connection
                            </button>

                            <div className="text-muted-foreground/80 mt-2">
                              Local models provide:<br />
                              • Complete privacy (no data sent to cloud)<br />
                              • Faster processing (no network latency)<br />
                              • No usage limits or costs
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div>
          {/* Progress Bar Overlay */}
          {loading && uploadProgress && (
            <div className="bg-card border border-border rounded-lg p-6 mb-6 shadow-sm">
              <div className="flex items-center gap-3 mb-2">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
                </span>
                <h3 className="font-semibold text-foreground">Indexing Document...</h3>
                <span className="text-xs text-muted-foreground ml-auto">{uploadProgress.filename}</span>
              </div>
              <div className="w-full bg-secondary h-2.5 rounded-full mb-2">
                <div
                  className="bg-primary h-2.5 rounded-full transition-all duration-300 ease-in-out"
                  style={{ width: `${Math.round((uploadProgress.current / uploadProgress.total) * 100)}%` }}
                ></div>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{uploadProgress.message}</span>
                <span>{Math.round((uploadProgress.current / uploadProgress.total) * 100)}%</span>
              </div>
            </div>
          )}

          {loading && !uploadProgress ? (
            <div className="text-center py-12">
              <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">Loading documents...</p>
            </div>
          ) : (
            /* Documents View (All) */
            <div>
              <h2 className="text-xl font-semibold text-foreground mb-4">
                📚 My Documents ({allDocuments.length})
              </h2>
              <div className="text-sm text-muted-foreground mb-4">
                {wisdomDocuments.length} documents in your knowledge base
              </div>

              {allDocuments.length > 0 ? (
                viewMode === 'grid' ? (
                  /* Grid View */
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {allDocuments.map((doc) => (
                      <div key={doc.id} className={`bg-card rounded-lg p-4 border transition-colors ${isSelectMode && selectedDocuments.has(doc.id)
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                        }`}>
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-2">
                            {/* Selection checkbox */}
                            {isSelectMode && doc.type === 'uploaded' && (
                              <button
                                onClick={() => toggleDocumentSelection(doc.id)}
                                className="p-1 hover:bg-accent rounded transition-colors"
                              >
                                {selectedDocuments.has(doc.id) ? (
                                  <CheckSquare className="w-4 h-4 text-primary" />
                                ) : (
                                  <Square className="w-4 h-4 text-muted-foreground" />
                                )}
                              </button>
                            )}
                            <FileText className="w-4 h-4 text-primary" />
                            <span className="text-xs px-2 py-1 rounded-full font-medium bg-primary/10 text-primary">
                              My Document
                            </span>
                          </div>
                          {doc.type === 'uploaded' && !isSelectMode && (
                            <div className="flex items-center gap-1">
                              {/* Force Index Button */}
                              {doc.indexing && doc.indexing.status !== 'completed' && (
                                <button
                                  onClick={() => handleForceIndex(doc.id)}
                                  className="p-1 text-muted-foreground hover:text-yellow-600 transition-colors"
                                  title="Force reindex this document"
                                >
                                  <RefreshCw className="w-3 h-3" />
                                </button>
                              )}
                              <button
                                onClick={() => handleDelete(doc.id)}
                                className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>

                        <h3 className="font-semibold text-foreground mb-2 line-clamp-2">{doc.title}</h3>

                        {/* Indexing Status */}
                        <div className="mb-2">
                          {getIndexingStatusComponent(doc.indexing)}
                        </div>

                        {'description' in doc && (
                          <p className="text-sm text-muted-foreground mb-2 line-clamp-2">{doc.description}</p>
                        )}

                        <div className="text-xs text-muted-foreground space-y-1">
                          <div>🏷️ {doc.category}</div>
                          {doc.subcategory && (
                            <div>📂 {doc.subcategory}</div>
                          )}
                          {doc.region && doc.region.length > 0 && (
                            <div>🌍 {doc.region.join(', ')}</div>
                          )}
                          {doc.language && (
                            <div>🗣️ {doc.language.toUpperCase()}</div>
                          )}
                          {doc.pageCount && (
                            <div>📄 {doc.pageCount} pages</div>
                          )}
                          {doc.size && (
                            <div>💾 {doc.size}</div>
                          )}
                        </div>


                      </div>
                    ))}
                  </div>
                ) : (
                  /* List View */
                  <div className="space-y-2">
                    {allDocuments.map((doc) => (
                      <div key={doc.id} className={`bg-card rounded-lg p-4 border transition-colors ${isSelectMode && selectedDocuments.has(doc.id)
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                        }`}>
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2 flex-1">
                            {/* Selection checkbox */}
                            {isSelectMode && doc.type === 'uploaded' && (
                              <button
                                onClick={() => toggleDocumentSelection(doc.id)}
                                className="p-1 hover:bg-accent rounded transition-colors flex-shrink-0"
                              >
                                {selectedDocuments.has(doc.id) ? (
                                  <CheckSquare className="w-4 h-4 text-primary" />
                                ) : (
                                  <Square className="w-4 h-4 text-muted-foreground" />
                                )}
                              </button>
                            )}
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <FileText className="w-4 h-4 text-primary" />
                                <h3 className="font-semibold text-foreground">{doc.title}</h3>
                                <span className="text-xs px-2 py-1 rounded-full font-medium bg-primary/10 text-primary">
                                  My Document
                                </span>
                                {/* Indexing Status */}
                                {getIndexingStatusComponent(doc.indexing)}
                              </div>


                              <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                                <span>🏷️ {doc.category}</span>
                                {doc.subcategory && <span>📂 {doc.subcategory}</span>}
                                {doc.region && doc.region.length > 0 && <span>🌍 {doc.region.join(', ')}</span>}
                                {doc.language && <span>🗣️ {doc.language.toUpperCase()}</span>}
                                {doc.version && <span>📌 v{doc.version}</span>}
                              </div>

                            </div>
                          </div>

                          <div className="flex items-center gap-2 ml-4">
                            {!isSelectMode && (
                              <>
                                {/* Force Index Button */}
                                {doc.indexing && doc.indexing.status !== 'completed' && (
                                  <button
                                    onClick={() => handleForceIndex(doc.id)}
                                    className="p-2 text-muted-foreground hover:text-yellow-600 transition-colors"
                                    title="Force reindex this document"
                                  >
                                    <RefreshCw className="w-4 h-4" />
                                  </button>
                                )}
                                <button
                                  onClick={() => handleDelete(doc.id)}
                                  className="p-2 text-muted-foreground hover:text-destructive transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                <div className="bg-card rounded-lg p-8 text-center">
                  <Archive className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-foreground mb-2">No Documents Found</h3>
                  <p className="text-muted-foreground mb-4">
                    No documents match your current filters, or upload documents to build your knowledge base
                  </p>
                  <button
                    onClick={handleUpload}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors mx-auto"
                  >
                    <Upload className="w-4 h-4" />
                    Add Document
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Stats Footer */}
        <div className="mt-8 p-4 bg-muted/20 rounded-lg">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <div className="flex items-center gap-6">
              <span>📚 {wisdomDocuments.length} documents in knowledge base</span>
              <span>🔍 {selectedDocuments.size} selected</span>
              {ollamaStatus === 'available' && (
                <span className="text-green-600">🚀 Ollama running locally</span>
              )}
            </div>
            <div className="text-xs">
              💡 Use Shift+Enter for semantic search • Upload your own documents • Toggle grid/list view
              {ollamaStatus === 'available' && ' • Local embedding models available'}
            </div>
          </div>
        </div>
      </div>

      {/* Vector Graph Viewer Modal */}
      <VectorGraphViewer
        isOpen={showVectorGraph}
        onClose={() => setShowVectorGraph(false)}
      />

      {/* Bulk Upload Dialog */}
      <BulkUploadDialog
        open={showBulkUpload}
        onClose={() => setShowBulkUpload(false)}
        onUploadComplete={() => {
          loadAllData() // Refresh the documents list after upload
        }}
      />
    </div>
  )
}