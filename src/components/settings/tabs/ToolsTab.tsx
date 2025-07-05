import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Edit, Trash2, Check, X, Star, Eye } from 'lucide-react'
import { cn } from '@/utils/cn'

interface SystemPrompt {
  id: string
  name: string
  title: string
  content: string
  description?: string
  saludo?: string
  isActive: boolean
  isDefault: boolean
  createdAt: Date
  updatedAt: Date
}

interface SystemPromptFormData {
  name: string
  title: string
  content: string
  description: string
  saludo: string
  isActive: boolean
  isDefault: boolean
}

export function ToolsTab() {
  const { t } = useTranslation()
  const [systemPrompts, setSystemPrompts] = useState<SystemPrompt[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingPrompt, setEditingPrompt] = useState<SystemPrompt | null>(null)
  const [formData, setFormData] = useState<SystemPromptFormData>({
    name: '',
    title: '',
    content: '',
    description: '',
    saludo: '',
    isActive: true,
    isDefault: false
  })

  useEffect(() => {
    loadSystemPrompts()
  }, [])

  const loadSystemPrompts = async () => {
    try {
      setLoading(true)
      const response = await window.electronAPI.systemPrompts.getAll()
      if (response.success && response.data) {
        setSystemPrompts(response.data)
      } else {
        setSystemPrompts([])
        console.error('Failed to load system prompts:', response.error)
      }
    } catch (error) {
      console.error('Failed to load system prompts:', error)
      setSystemPrompts([])
    } finally {
      setLoading(false)
    }
  }

  const handleCreatePrompt = () => {
    setEditingPrompt(null)
    setFormData({
      name: '',
      title: '',
      content: '',
      description: '',
      saludo: '',
      isActive: true,
      isDefault: false
    })
    setShowForm(true)
  }

  const handleEditPrompt = (prompt: SystemPrompt) => {
    setEditingPrompt(prompt)
    setFormData({
      name: prompt.name,
      title: prompt.title,
      content: prompt.content,
      description: prompt.description || '',
      saludo: prompt.saludo || '',
      isActive: prompt.isActive,
      isDefault: prompt.isDefault
    })
    setShowForm(true)
  }

  const handleSavePrompt = async () => {
    try {
      if (editingPrompt) {
        // Update existing prompt
        const response = await window.electronAPI.systemPrompts.update(editingPrompt.id, formData)
        if (response.success) {
          await loadSystemPrompts()
          setShowForm(false)
        } else {
          console.error('Failed to update system prompt:', response.error)
        }
      } else {
        // Create new prompt
        const response = await window.electronAPI.systemPrompts.create(formData)
        if (response.success) {
          await loadSystemPrompts()
          setShowForm(false)
        } else {
          console.error('Failed to create system prompt:', response.error)
        }
      }
    } catch (error) {
      console.error('Failed to save system prompt:', error)
    }
  }

  const handleDeletePrompt = async (id: string) => {
    if (window.confirm(t('settings.systemPrompts.confirmDelete'))) {
      try {
        const response = await window.electronAPI.systemPrompts.delete(id)
        if (response.success) {
          await loadSystemPrompts()
        } else {
          console.error('Failed to delete system prompt:', response.error)
        }
      } catch (error) {
        console.error('Failed to delete system prompt:', error)
      }
    }
  }

  const handleSetDefault = async (id: string) => {
    try {
      const response = await window.electronAPI.systemPrompts.setDefault(id)
      if (response.success) {
        await loadSystemPrompts()
      } else {
        console.error('Failed to set default system prompt:', response.error)
      }
    } catch (error) {
      console.error('Failed to set default system prompt:', error)
    }
  }

  const handleFormChange = (field: keyof SystemPromptFormData, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="space-y-6 pb-6">
        <div className="max-w-4xl mx-auto p-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-2xl font-bold text-card-foreground">{t('settings.systemPrompts.title')}</h1>
              <p className="text-sm text-muted-foreground mt-1">{t('settings.systemPrompts.description')}</p>
            </div>
            <button
              onClick={handleCreatePrompt}
              className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              <Plus size={18} />
              <span>{t('settings.systemPrompts.create')}</span>
            </button>
          </div>

          {/* System Prompts List */}
          <div className="space-y-4">
            {systemPrompts.map((prompt) => (
          <div
            key={prompt.id}
            className={cn(
              "bg-card border border-border rounded-lg p-4",
              prompt.isDefault && "ring-2 ring-blue-500"
            )}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-3 mb-2">
                  <h3 className="font-semibold text-card-foreground">{prompt.title}</h3>
                  <div className="flex items-center space-x-2">
                    {prompt.isDefault && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        <Star size={12} className="mr-1" />
                        {t('settings.systemPrompts.isDefault')}
                      </span>
                    )}
                    <span className={cn(
                      "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium",
                      prompt.isActive 
                        ? "bg-green-100 text-green-800" 
                        : "bg-gray-100 text-gray-800"
                    )}>
                      {prompt.isActive ? (
                        <>
                          <Eye size={12} className="mr-1" />
                          {t('settings.systemPrompts.isActive')}
                        </>
                      ) : (
                        t('common.disabled')
                      )}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mb-2">
                  {t('settings.systemPrompts.name')}: <span className="font-mono">{prompt.name}</span>
                </p>
                {prompt.description && (
                  <p className="text-sm text-muted-foreground mb-2">{prompt.description}</p>
                )}
                {prompt.saludo && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-2">
                    <p className="text-xs font-medium text-blue-700 mb-1">Saludo del Agente:</p>
                    <p className="text-sm text-blue-800">"{prompt.saludo}"</p>
                  </div>
                )}
                <div className="bg-accent/50 rounded-lg p-3 mt-2">
                  <p className="text-xs font-mono text-card-foreground whitespace-pre-wrap">
                    {prompt.content.substring(0, 200)}
                    {prompt.content.length > 200 && '...'}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2 ml-4">
                {!prompt.isDefault && (
                  <button
                    onClick={() => handleSetDefault(prompt.id)}
                    className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title={t('settings.systemPrompts.setDefault')}
                  >
                    <Star size={16} />
                  </button>
                )}
                <button
                  onClick={() => handleEditPrompt(prompt)}
                  className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  title={t('settings.systemPrompts.edit')}
                >
                  <Edit size={16} />
                </button>
                <button
                  onClick={() => handleDeletePrompt(prompt.id)}
                  className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title={t('settings.systemPrompts.delete')}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          </div>
        ))}

        {systemPrompts.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">{t('settings.systemPrompts.noPrompts')}</p>
            <button
              onClick={handleCreatePrompt}
              className="mt-4 text-blue-600 hover:text-blue-700 font-medium"
            >
              {t('settings.systemPrompts.createFirst')}
            </button>
          </div>
        )}
          </div>
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto m-4">
            <div className="p-6 border-b border-border">
              <h2 className="text-xl font-semibold text-card-foreground">
                {editingPrompt ? t('settings.systemPrompts.edit') : t('settings.systemPrompts.create')}
              </h2>
            </div>
            
            <div className="p-6 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-card-foreground mb-2">
                  {t('settings.systemPrompts.name')} *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleFormChange('name', e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background text-card-foreground"
                  placeholder={t('settings.systemPrompts.namePlaceholder')}
                />
              </div>

              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-card-foreground mb-2">
                  {t('settings.systemPrompts.title')} *
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => handleFormChange('title', e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background text-card-foreground"
                  placeholder={t('settings.systemPrompts.titlePlaceholder')}
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-card-foreground mb-2">
                  {t('settings.systemPrompts.description')}
                </label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => handleFormChange('description', e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background text-card-foreground"
                  placeholder={t('settings.systemPrompts.descriptionPlaceholder')}
                />
              </div>

              {/* Saludo */}
              <div>
                <label className="block text-sm font-medium text-card-foreground mb-2">
                  Saludo del Agente
                </label>
                <textarea
                  value={formData.saludo}
                  onChange={(e) => handleFormChange('saludo', e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background text-card-foreground"
                  placeholder="Mensaje de saludo que aparecerá cuando se cree una nueva conversación con este prompt..."
                  rows={3}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Este mensaje aparecerá automáticamente como primer mensaje del asistente en nuevas conversaciones.
                </p>
              </div>

              {/* Content */}
              <div>
                <label className="block text-sm font-medium text-card-foreground mb-2">
                  {t('settings.systemPrompts.content')} *
                </label>
                <textarea
                  value={formData.content}
                  onChange={(e) => handleFormChange('content', e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background text-card-foreground font-mono text-sm"
                  placeholder={t('settings.systemPrompts.contentPlaceholder')}
                  rows={8}
                />
              </div>

              {/* Options */}
              <div className="flex space-x-6">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => handleFormChange('isActive', e.target.checked)}
                    className="rounded border-border focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-sm text-card-foreground">{t('settings.systemPrompts.isActive')}</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={formData.isDefault}
                    onChange={(e) => handleFormChange('isDefault', e.target.checked)}
                    className="rounded border-border focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-sm text-card-foreground">{t('settings.systemPrompts.isDefault')}</span>
                </label>
              </div>
            </div>

            <div className="p-6 border-t border-border flex justify-end space-x-3">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
              >
                <X size={16} className="inline mr-2" />
                {t('settings.systemPrompts.cancel')}
              </button>
              <button
                onClick={handleSavePrompt}
                disabled={!formData.name || !formData.title || !formData.content}
                className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white px-4 py-2 rounded-lg transition-colors"
              >
                <Check size={16} />
                <span>{t('settings.systemPrompts.save')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}