import { useState, useEffect, useRef } from 'react'
import { Brain, ChevronDown, Search, Lightbulb, Check } from 'lucide-react'
import { useOnClickOutside } from '@/hooks/useOnClickOutside'
import { cn } from '@/utils/cn'

interface WisdomConfiguration {
  enabled: boolean
  searchTopK: number
  searchMethod: 'agentic' // Solo RAG Agéntico
  categories: string[]
  embeddingProvider?: string
}

interface WisdomSelectorProps {
  selectedConfig?: WisdomConfiguration
  onConfigChange: (config: WisdomConfiguration | undefined) => void
  className?: string
}

export function WisdomSelector({ selectedConfig, onConfigChange, className }: WisdomSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [wisdomSources, setWisdomSources] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  
  const dropdownRef = useRef<HTMLDivElement>(null)
  useOnClickOutside(dropdownRef, () => setIsOpen(false))

  // Load available wisdom sources
  useEffect(() => {
    loadWisdomSources()
  }, [])

  const loadWisdomSources = async () => {
    setLoading(true)
    try {
      const result = await window.electronAPI.wisdom.list()
      if (result.success) {
        setWisdomSources(result.documents || [])
      }
    } catch (error) {
      console.error('Error loading wisdom sources:', error)
    } finally {
      setLoading(false)
    }
  }

  const getAvailableCategories = () => {
    const categories = new Set(wisdomSources.map(doc => doc.category))
    return Array.from(categories)
  }

  const toggleWisdom = () => {
    console.log('🧠 [DEBUG] WisdomSelector - Toggle clicked, current config:', selectedConfig)
    if (selectedConfig?.enabled) {
      console.log('🧠 [DEBUG] WisdomSelector - Disabling RAG')
      onConfigChange(undefined)
    } else {
      console.log('🧠 [DEBUG] WisdomSelector - Enabling RAG with agentic method')
      const newConfig = {
        enabled: true,
        searchTopK: 5,
        searchMethod: 'agentic' as const, // Usar RAG Agéntico por defecto
        categories: []
      }
      console.log('🧠 [DEBUG] WisdomSelector - New config:', newConfig)
      onConfigChange(newConfig)
    }
  }

  const updateConfig = (updates: Partial<WisdomConfiguration>) => {
    if (!selectedConfig) return
    onConfigChange({
      ...selectedConfig,
      ...updates
    })
  }

  const toggleCategory = (category: string) => {
    if (!selectedConfig) return
    
    const categories = selectedConfig.categories.includes(category)
      ? selectedConfig.categories.filter(c => c !== category)
      : [...selectedConfig.categories, category]
    
    updateConfig({ categories })
  }

  const getDisplayText = () => {
    if (!selectedConfig?.enabled) {
      return 'No Wisdom'
    }
    
    const { categories } = selectedConfig
    const categoryText = categories.length === 0 
      ? 'All Categories'
      : categories.length === 1
        ? categories[0]
        : `${categories.length} Categories`
    
    return `${categoryText} • RAG Agéntico`
  }

  // Solo usamos RAG Agéntico ahora

  const filteredSources = wisdomSources.filter(source =>
    searchQuery === '' || 
    source.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    source.category.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className={cn("relative", className)} ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center space-x-2 px-3 py-2 rounded-lg border transition-all duration-200",
          selectedConfig?.enabled
            ? "border-primary/50 bg-primary/10 text-primary hover:bg-primary/20"
            : "border-border/50 bg-card/50 text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          "hover:border-border min-w-0 flex-shrink-0"
        )}
        title={selectedConfig?.enabled ? "Wisdom RAG is enabled" : "Click to enable Wisdom RAG"}
      >
        {selectedConfig?.enabled ? (
          <Lightbulb className="w-4 h-4" />
        ) : (
          <Brain className="w-4 h-4" />
        )}
        <span className="text-sm font-medium truncate">
          {getDisplayText()}
        </span>
        <ChevronDown className={cn(
          "w-4 h-4 transition-transform",
          isOpen && "rotate-180"
        )} />
      </button>

      {isOpen && (
        <div className={cn(
          "absolute top-full left-0 mt-2 w-80 bg-popover border border-border rounded-lg shadow-lg z-50",
          "py-2 animate-in fade-in-0 zoom-in-95"
        )}>
          {/* Header */}
          <div className="px-4 py-2 border-b border-border">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-foreground">💡 Wisdom Configuration</h3>
              <button
                onClick={toggleWisdom}
                className={cn(
                  "px-3 py-1 rounded text-xs font-medium transition-colors",
                  selectedConfig?.enabled
                    ? "bg-destructive/10 text-destructive hover:bg-destructive/20"
                    : "bg-primary/10 text-primary hover:bg-primary/20"
                )}
              >
                {selectedConfig?.enabled ? 'Disable' : 'Enable'}
              </button>
            </div>
          </div>

          {selectedConfig?.enabled && (
            <>
              {/* Search Method - Solo RAG Agéntico */}
              <div className="px-4 py-3 border-b border-border">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-foreground">
                    Search Method
                  </label>
                  <span className="text-sm text-primary font-medium">
                    RAG Agéntico ✨
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Sistema inteligente con re-ranking y búsqueda web
                </p>
              </div>

              {/* Top K Results */}
              <div className="px-4 py-3 border-b border-border">
                <label className="block text-sm font-medium text-foreground mb-2">
                  Max Results: {selectedConfig.searchTopK}
                </label>
                <input
                  type="range"
                  min="1"
                  max="20"
                  value={selectedConfig.searchTopK}
                  onChange={(e) => updateConfig({ searchTopK: parseInt(e.target.value) })}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>1</span>
                  <span>20</span>
                </div>
              </div>

              {/* Categories */}
              <div className="px-4 py-3 border-b border-border">
                <label className="block text-sm font-medium text-foreground mb-2">
                  Categories ({selectedConfig.categories.length} selected)
                </label>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {getAvailableCategories().map((category) => (
                    <button
                      key={category}
                      onClick={() => toggleCategory(category)}
                      className={cn(
                        "w-full flex items-center px-2 py-1 rounded text-sm transition-colors",
                        selectedConfig.categories.includes(category)
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      )}
                    >
                      {selectedConfig.categories.includes(category) && (
                        <Check className="w-3 h-3 mr-2" />
                      )}
                      <span className={!selectedConfig.categories.includes(category) ? "ml-5" : ""}>
                        {category}
                      </span>
                    </button>
                  ))}
                </div>
                {selectedConfig.categories.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    No categories selected - will search all available wisdom
                  </p>
                )}
              </div>

              {/* Available Sources Preview */}
              <div className="px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-foreground">
                    Available Sources ({filteredSources.length})
                  </label>
                  <button
                    onClick={loadWisdomSources}
                    className="text-xs text-muted-foreground hover:text-foreground"
                    disabled={loading}
                  >
                    {loading ? 'Loading...' : 'Refresh'}
                  </button>
                </div>
                
                <div className="relative">
                  <Search className="w-3 h-3 absolute left-2 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search sources..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-7 pr-2 py-1 text-xs bg-background border border-border rounded"
                  />
                </div>

                <div className="max-h-24 overflow-y-auto mt-2 space-y-1">
                  {filteredSources.slice(0, 10).map((source) => (
                    <div
                      key={source.id}
                      className={cn(
                        "p-2 rounded text-xs transition-colors",
                        selectedConfig.categories.length === 0 || selectedConfig.categories.includes(source.category)
                          ? "bg-primary/5 text-primary border border-primary/20"
                          : "bg-muted/50 text-muted-foreground"
                      )}
                    >
                      <div className="font-medium truncate">{source.title}</div>
                      <div className="text-muted-foreground">{source.category}</div>
                    </div>
                  ))}
                  {filteredSources.length > 10 && (
                    <div className="text-xs text-muted-foreground text-center py-1">
                      ... and {filteredSources.length - 10} more
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {!selectedConfig?.enabled && (
            <div className="px-4 py-6 text-center">
              <Brain className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground mb-3">
                Enable Wisdom RAG to enhance your conversations with hydraulic engineering knowledge
              </p>
              <button
                onClick={toggleWisdom}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                Enable Wisdom
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}