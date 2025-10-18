import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload, Search, FileText, Trash2, Filter, RefreshCw, Settings } from 'lucide-react'

interface Document {
  id: string
  title: string
  category: string
  subcategory?: string
  region?: string[]
  language: string
  updatedAt: string
  version: string
}

interface SearchResult {
  document: any
  score: number
  relevantChunks: string[]
  highlights: string[]
}

interface EmbeddingProvider {
  id: string
  name: string
  model: string
  dimension: number
}

export function RAGPanel() {
  const { t } = useTranslation()
  const [documents, setDocuments] = useState<Document[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [selectedRegion, setSelectedRegion] = useState<string>('')
  const [showSearchResults, setShowSearchResults] = useState(false)
  const [embeddingProviders, setEmbeddingProviders] = useState<EmbeddingProvider[]>([])
  const [selectedProviderId, setSelectedProviderId] = useState<string>('')
  const [showSettings, setShowSettings] = useState(false)

  // Load documents on mount
  useEffect(() => {
    loadDocuments()
    loadEmbeddingProviders()
  }, [selectedCategory, selectedRegion])

  const loadDocuments = async () => {
    setLoading(true)
    try {
      const filters: any = {}
      if (selectedCategory !== 'all') filters.category = selectedCategory
      if (selectedRegion) filters.region = selectedRegion
      
      const result = await window.electronAPI.documents.list(filters)
      if (result.success) {
        setDocuments(result.documents || [])
      }
    } catch (error) {
      console.error('Error loading documents:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadEmbeddingProviders = async () => {
    try {
      const result = await window.electronAPI.documents.getEmbeddingProviders()
      if (result.success && result.providers) {
        setEmbeddingProviders(result.providers)
        setSelectedProviderId(result.currentProviderId || result.providers[0]?.id || '')
      }
    } catch (error) {
      console.error('Error loading embedding providers:', error)
    }
  }
  
  const handleProviderChange = async (providerId: string) => {
    setLoading(true)
    try {
      const result = await window.electronAPI.documents.setEmbeddingProvider(providerId)
      if (result.success) {
        setSelectedProviderId(providerId)
        // Show success message
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
    const options = {
      category: selectedCategory === 'all' ? 'hydraulics' : selectedCategory as any,
      language: 'es',
      region: selectedRegion ? [selectedRegion] : undefined
    }
    
    setLoading(true)
    try {
      const result = await window.electronAPI.documents.upload(options)
      if (result.success) {
        await loadDocuments()
        // Show success message
        alert(result.message)
      } else {
        alert(result.message)
      }
    } catch (error) {
      console.error('Error uploading documents:', error)
      alert('Error uploading documents')
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    
    setLoading(true)
    setShowSearchResults(true)
    try {
      const options = {
        category: selectedCategory !== 'all' ? selectedCategory : undefined,
        region: selectedRegion || undefined,
        language: 'es'
      }
      
      const result = await window.electronAPI.documents.search(searchQuery, options)
      if (result.success) {
        setSearchResults(result.results || [])
      }
    } catch (error) {
      console.error('Error searching documents:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (documentId: string) => {
    if (!confirm('Are you sure you want to delete this document?')) return
    
    setLoading(true)
    try {
      const result = await window.electronAPI.documents.delete(documentId)
      if (result.success) {
        await loadDocuments()
      }
    } catch (error) {
      console.error('Error deleting document:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex-1 p-6 bg-background overflow-y-auto">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-foreground mb-6">{t('rag.title')}</h1>
        
        {/* Filters and Actions */}
        <div className="bg-card rounded-lg p-4 mb-6">
          <div className="flex flex-wrap gap-4 items-center">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-4 py-2 bg-background border border-border rounded-lg text-foreground"
            >
              <option value="all">All Categories</option>
              <option value="hydraulics">Hydraulics</option>
              <option value="regulations">Regulations</option>
              <option value="best-practices">Best Practices</option>
            </select>
            
            <input
              type="text"
              placeholder="Region (e.g., MX, CO, ES)"
              value={selectedRegion}
              onChange={(e) => setSelectedRegion(e.target.value)}
              className="px-4 py-2 bg-background border border-border rounded-lg text-foreground"
            />
            
            <button
              onClick={handleUpload}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <Upload className="w-4 h-4" />
              Upload Document
            </button>
            
            <button
              onClick={loadDocuments}
              disabled={loading}
              className="p-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            
            <div className="relative">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="p-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Settings className="w-4 h-4" />
              </button>
              
              {showSettings && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-card border border-border rounded-lg shadow-lg p-4 z-10">
                  <h3 className="font-semibold text-foreground mb-3">Embedding Settings</h3>
                  <label className="block text-sm text-muted-foreground mb-2">
                    Embedding Provider:
                  </label>
                  <select
                    value={selectedProviderId}
                    onChange={(e) => handleProviderChange(e.target.value)}
                    disabled={loading}
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm"
                  >
                    {embeddingProviders.map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.name} ({provider.dimension}d)
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground mt-2">
                    Note: Ollama models need to be pulled first with:<br/>
                    <code className="bg-background px-1 rounded">ollama pull model-name</code>
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="bg-card rounded-lg p-4 mb-6">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Search in knowledge base..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              className="flex-1 px-4 py-2 bg-background border border-border rounded-lg text-foreground"
            />
            <button
              onClick={handleSearch}
              disabled={loading || !searchQuery.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <Search className="w-4 h-4" />
              Search
            </button>
          </div>
        </div>

        {/* Search Results */}
        {showSearchResults && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-foreground">Search Results</h2>
              <button
                onClick={() => {
                  setShowSearchResults(false)
                  setSearchResults([])
                }}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Clear Results
              </button>
            </div>
            
            {searchResults.length > 0 ? (
              <div className="space-y-4">
                {searchResults.map((result, index) => (
                  <div key={index} className="bg-card rounded-lg p-4 border border-border">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold text-foreground">{result.document.title}</h3>
                      <span className="text-sm text-muted-foreground">
                        Score: {(result.score * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground mb-2">
                      {result.document.category} • {result.document.region?.join(', ')}
                    </div>
                    <div className="space-y-2">
                      {result.highlights.map((highlight, i) => (
                        <p key={i} className="text-sm text-foreground/80 italic">
                          "...{highlight}..."
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">No results found</p>
            )}
          </div>
        )}

        {/* Document List */}
        <div>
          <h2 className="text-xl font-semibold text-foreground mb-4">Documents</h2>
          
          {loading ? (
            <div className="text-center py-8">
              <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground mx-auto" />
              <p className="text-muted-foreground mt-2">Loading...</p>
            </div>
          ) : documents.length > 0 ? (
            <div className="grid gap-4">
              {documents.map((doc) => (
                <div key={doc.id} className="bg-card rounded-lg p-4 border border-border hover:border-primary/50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <FileText className="w-4 h-4 text-muted-foreground" />
                        <h3 className="font-semibold text-foreground">{doc.title}</h3>
                      </div>
                      <div className="text-sm text-muted-foreground space-x-4">
                        <span>{doc.category}</span>
                        {doc.subcategory && <span>• {doc.subcategory}</span>}
                        {doc.region && <span>• {doc.region.join(', ')}</span>}
                        <span>• {doc.language.toUpperCase()}</span>
                        <span>• v{doc.version}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Updated: {new Date(doc.updatedAt).toLocaleDateString()}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(doc.id)}
                      className="p-2 text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-card rounded-lg p-8 text-center">
              <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">No Documents</h3>
              <p className="text-muted-foreground mb-4">
                Upload documents to build your knowledge base
              </p>
              <button
                onClick={handleUpload}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors mx-auto"
              >
                <Upload className="w-4 h-4" />
                Upload Your First Document
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}