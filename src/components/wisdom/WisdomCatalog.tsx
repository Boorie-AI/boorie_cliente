import { useState, useEffect } from 'react'

import { BookOpen, Search, X, ChevronDown, ChevronRight, FileText } from 'lucide-react'

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
}

interface WisdomCatalogProps {
  isOpen: boolean
  onClose: () => void
}

export function WisdomCatalog({ isOpen, onClose }: WisdomCatalogProps) {
  // const { t } = useTranslation()
  const [catalogEntries, setCatalogEntries] = useState<CatalogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())
  const [filteredEntries, setFilteredEntries] = useState<CatalogEntry[]>([])

  // Load catalog on mount
  useEffect(() => {
    if (isOpen) {
      loadCatalog()
    }
  }, [isOpen])

  // Filter entries when search or category changes
  useEffect(() => {
    filterEntries()
  }, [catalogEntries, searchQuery, selectedCategory])

  const loadCatalog = async () => {
    setLoading(true)
    try {
      const result = await window.electronAPI.wisdom.getCatalog()
      if (result.success) {
        setCatalogEntries(result.catalog || [])
        // Auto-expand first few sections
        const firstSections = new Set<string>(result.catalog?.slice(0, 3).map((entry: CatalogEntry) => entry.section) || [])
        setExpandedSections(firstSections)
      }
    } catch (error) {
      console.error('Error loading wisdom catalog:', error)
    } finally {
      setLoading(false)
    }
  }

  const filterEntries = () => {
    let filtered = catalogEntries

    // Filter by category
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(entry => entry.category === selectedCategory)
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(entry =>
        entry.title.toLowerCase().includes(query) ||
        entry.description.toLowerCase().includes(query) ||
        entry.topics.some(topic => topic.toLowerCase().includes(query)) ||
        entry.filename.toLowerCase().includes(query)
      )
    }

    setFilteredEntries(filtered)
  }

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections)
    if (newExpanded.has(section)) {
      newExpanded.delete(section)
    } else {
      newExpanded.add(section)
    }
    setExpandedSections(newExpanded)
  }

  const handleIndexDocument = async (entry: CatalogEntry) => {
    setLoading(true)
    try {
      const result = await window.electronAPI.wisdom.indexFromCatalog(entry.id)
      if (result.success) {
        // Update the entry status
        setCatalogEntries(prev => prev.map(e =>
          e.id === entry.id
            ? { ...e, indexed: true, lastIndexed: new Date().toISOString() }
            : e
        ))
        alert(`✅ Successfully indexed: ${entry.title}`)
      } else {
        alert(`❌ Failed to index: ${result.message}`)
      }
    } catch (error) {
      console.error('Error indexing document:', error)
      alert('❌ Error indexing document')
    } finally {
      setLoading(false)
    }
  }

  const groupedEntries = filteredEntries.reduce((groups, entry) => {
    if (!groups[entry.section]) {
      groups[entry.section] = []
    }
    groups[entry.section].push(entry)
    return groups
  }, {} as Record<string, CatalogEntry[]>)

  const categories = [...new Set(catalogEntries.map(entry => entry.category))]

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-6xl h-5/6 flex flex-col m-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <BookOpen className="w-6 h-6 text-primary" />
            <h2 className="text-xl font-bold text-foreground">📚 Boorie Wisdom Catalog</h2>
            <span className="text-sm text-muted-foreground">
              ({filteredEntries.length} of {catalogEntries.length} documents)
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filters */}
        <div className="p-4 border-b border-border bg-muted/20">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex-1 relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search documents, topics, or descriptions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-lg text-foreground"
              />
            </div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-4 py-2 bg-background border border-border rounded-lg text-foreground"
            >
              <option value="all">All Categories</option>
              {categories.map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
                <p className="text-muted-foreground">Loading catalog...</p>
              </div>
            </div>
          ) : Object.keys(groupedEntries).length > 0 ? (
            <div className="space-y-4">
              {Object.entries(groupedEntries).map(([section, entries]) => (
                <div key={section} className="border border-border rounded-lg overflow-hidden">
                  {/* Section Header */}
                  <button
                    onClick={() => toggleSection(section)}
                    className="w-full flex items-center justify-between p-4 bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {expandedSections.has(section) ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                      <h3 className="font-semibold text-foreground">{section}</h3>
                      <span className="text-sm text-muted-foreground">({entries.length} docs)</span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {entries.filter(e => e.indexed).length} indexed
                    </div>
                  </button>

                  {/* Section Content */}
                  {expandedSections.has(section) && (
                    <div className="border-t border-border">
                      {entries.map((entry) => (
                        <div key={entry.id} className="p-4 border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              {/* Title and Status */}
                              <div className="flex items-center gap-2 mb-2">
                                <FileText className="w-4 h-4 text-muted-foreground" />
                                <h4 className="font-medium text-foreground">{entry.title}</h4>
                                {entry.indexed ? (
                                  <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                                    ✓ Indexed
                                  </span>
                                ) : (
                                  <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full">
                                    Not Indexed
                                  </span>
                                )}
                              </div>

                              {/* Description */}
                              <p className="text-sm text-muted-foreground mb-2">{entry.description}</p>

                              {/* Metadata */}
                              <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                                <span>📁 {entry.filename}</span>
                                {entry.pages && <span>📄 {entry.pages} pages</span>}
                                {entry.size && <span>💾 {entry.size}</span>}
                                <span>🏷️ {entry.category}</span>
                              </div>

                              {/* Topics */}
                              {entry.topics.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {entry.topics.slice(0, 5).map((topic, i) => (
                                    <span key={i} className="px-2 py-1 bg-primary/10 text-primary text-xs rounded">
                                      {topic}
                                    </span>
                                  ))}
                                  {entry.topics.length > 5 && (
                                    <span className="px-2 py-1 bg-muted text-muted-foreground text-xs rounded">
                                      +{entry.topics.length - 5} more
                                    </span>
                                  )}
                                </div>
                              )}

                              {/* Last Indexed */}
                              {entry.lastIndexed && (
                                <div className="text-xs text-muted-foreground mt-2">
                                  Last indexed: {new Date(entry.lastIndexed).toLocaleDateString()}
                                </div>
                              )}
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-2 ml-4">
                              {!entry.indexed && (
                                <button
                                  onClick={() => handleIndexDocument(entry)}
                                  disabled={loading}
                                  className="px-3 py-1 bg-primary text-primary-foreground text-sm rounded hover:bg-primary/90 transition-colors disabled:opacity-50"
                                >
                                  Index
                                </button>
                              )}
                              <button
                                onClick={() => handleIndexDocument(entry)}
                                disabled={loading}
                                className="px-3 py-1 bg-secondary text-secondary-foreground text-sm rounded hover:bg-secondary/90 transition-colors disabled:opacity-50"
                              >
                                Re-index
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <BookOpen className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">No Documents Found</h3>
              <p className="text-muted-foreground">
                {searchQuery ? 'Try adjusting your search terms' : 'The catalog appears to be empty'}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border bg-muted/20">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <div className="flex items-center gap-4">
              <span>📚 {catalogEntries.length} total documents</span>
              <span>✅ {catalogEntries.filter(e => e.indexed).length} indexed</span>
              <span>⏳ {catalogEntries.filter(e => !e.indexed).length} pending</span>
            </div>
            <div>
              <span>Knowledge source: rag-knowledge/000-libros-Boorie/</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}