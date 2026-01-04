import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CheckCircle,
  XCircle,
  RefreshCw,
  AlertTriangle,
  ExternalLink,
  Eye,
  EyeOff,
  Download,
  Trash2,
  Plus,
  Terminal,
  Settings,
  Zap,
  X,
  Search
} from 'lucide-react'
import { cn } from '@/utils/cn'
import * as Tabs from '@radix-ui/react-tabs'
import * as Dialog from '@radix-ui/react-dialog'
import * as Switch from '@radix-ui/react-switch'
import { type CustomModel, validateCustomModel } from '@/services/ai/providers'
import { useAIConfigStore, type AIProvider, type ProviderModel } from '@/stores/aiConfigStore'
import { databaseService } from '@/services/database'
import anthropicLogo from '@/assets/anthropic.png'
import openaiLogo from '@/assets/openai.png'
import googleLogo from '@/assets/google.png'
import openrouterLogo from '@/assets/openrouter.png'
import ollamaLogo from '@/assets/ollama.png'

interface OllamaModel {
  name: string
  size: string
  modified: string
}

export function AIConfigurationPanel() {
  const { t } = useTranslation()
  const {
    providers,
    loadProviders,
    saveProvider,
    toggleProvider,
    updateAPIKey,
    testProviderConnection,
    toggleModelSelection,
    addCustomModel,
    removeCustomModel
  } = useAIConfigStore()

  const getProviderLogo = (providerId: string) => {
    const lowerCaseId = providerId.toLowerCase()
    switch (lowerCaseId) {
      case 'anthropic':
        return anthropicLogo
      case 'openai':
        return openaiLogo
      case 'google':
        return googleLogo
      case 'openrouter':
        return openrouterLogo
      case 'ollama':
        return ollamaLogo
      default:
        return null
    }
  }

  const [ollamaInstalled, setOllamaInstalled] = useState<boolean | null>(null)
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([])
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [showAPIKey, setShowAPIKey] = useState<Record<string, boolean>>({})
  const [newModelName, setNewModelName] = useState('')
  const [isInstallingModel, setIsInstallingModel] = useState(false)
  const [installProgress, setInstallProgress] = useState({ progress: 0, status: '', currentModel: '' })
  const [showInstallDialog, setShowInstallDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [modelToDelete, setModelToDelete] = useState('')
  const [showAddModelDialog, setShowAddModelDialog] = useState(false)
  const [selectedProviderId, setSelectedProviderId] = useState('')
  const [customModel, setCustomModel] = useState<CustomModel>({
    modelId: '',
    modelName: '',
    description: ''
  })
  const [modelSearchTerms, setModelSearchTerms] = useState<Record<string, string>>({})

  const popularModels = [
    'llama3.2:latest',
    'llama3.1:8b',
    'mistral:latest',
    'codellama:latest',
    'phi3:latest',
    'gemma2:latest'
  ]

  useEffect(() => {
    checkOllamaInstallation()
    initializeProviders()
  }, [])

  const initializeProviders = async () => {
    // First load existing providers from database
    await loadProviders()

    // If no providers exist, create default ones
    if (providers.length === 0) {
      await createDefaultProviders()
    }
  }

  const createDefaultProviders = async () => {
    console.log('🆕 Creating default AI providers...')

    const defaultProviders = [
      {
        name: 'OpenAI',
        type: 'api' as const,
        isActive: false,
        isConnected: false
      },
      {
        name: 'Anthropic',
        type: 'api' as const,
        isActive: false,
        isConnected: false
      },
      {
        name: 'Google',
        type: 'api' as const,
        isActive: false,
        isConnected: false
      },
      {
        name: 'OpenRouter',
        type: 'api' as const,
        isActive: false,
        isConnected: false
      }
    ]

    for (const providerData of defaultProviders) {
      try {
        await saveProvider(providerData)
        console.log(`✅ Created default provider: ${providerData.name}`)
      } catch (error) {
        console.error(`❌ Failed to create provider ${providerData.name}:`, error)
      }
    }
  }

  const checkOllamaInstallation = async () => {
    try {
      const response = await fetch('http://localhost:11434/api/tags', {
        method: 'GET',
      })

      if (response.ok) {
        const data = await response.json()
        setOllamaInstalled(true)
        setOllamaModels(data.models || [])
      } else {
        setOllamaInstalled(false)
      }
    } catch (error) {
      setOllamaInstalled(false)
    }
  }

  const refreshOllamaModels = async () => {
    setIsRefreshing(true)
    await checkOllamaInstallation()
    setIsRefreshing(false)
  }

  const installOllamaModel = async (modelName: string) => {
    setIsInstallingModel(true)
    setInstallProgress({ progress: 0, status: 'Starting download...', currentModel: modelName })

    try {
      // Make a POST request to Ollama API to pull the model
      const response = await fetch('http://localhost:11434/api/pull', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: modelName, stream: true }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('Failed to get response reader')
      }

      let currentProgress = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        // Parse the streaming response
        const chunk = new TextDecoder().decode(value)
        const lines = chunk.split('\n').filter(line => line.trim())

        for (const line of lines) {
          try {
            const data = JSON.parse(line)

            if (data.status) {
              let progress = currentProgress

              // Parse progress from different status messages
              if (data.status.includes('pulling') && data.completed && data.total) {
                progress = Math.round((data.completed / data.total) * 100)
                currentProgress = progress
              } else if (data.status.includes('verifying') || data.status.includes('writing')) {
                progress = Math.min(currentProgress + 5, 95)
                currentProgress = progress
              } else if (data.status.includes('success')) {
                progress = 100
              }

              setInstallProgress({
                progress,
                status: data.status,
                currentModel: modelName
              })
            }

            // Check for completion
            if (data.status && data.status.includes('success')) {
              setInstallProgress({
                progress: 100,
                status: 'Model installed successfully!',
                currentModel: modelName
              })
              break
            }
          } catch (e) {
            // Ignore JSON parse errors for incomplete chunks
          }
        }
      }

      // Refresh the models list after installation
      await refreshOllamaModels()

      // Show success for a moment before closing
      setTimeout(() => {
        setShowInstallDialog(false)
        setNewModelName('')
        setInstallProgress({ progress: 0, status: '', currentModel: '' })
      }, 2000)

    } catch (error) {
      console.error('Failed to install model:', error)
      setInstallProgress({
        progress: 0,
        status: `Error: ${error instanceof Error ? error.message : 'Failed to install model'}`,
        currentModel: modelName
      })

      // Keep dialog open on error so user can see the error message
      setTimeout(() => {
        setInstallProgress({ progress: 0, status: '', currentModel: '' })
      }, 5000)
    } finally {
      setIsInstallingModel(false)
    }
  }

  const handleDeleteModelClick = (modelName: string) => {
    console.log('Delete button clicked for model:', modelName)
    setModelToDelete(modelName)
    setShowDeleteDialog(true)
    console.log('showDeleteDialog set to true')
  }

  const confirmDeleteModel = async () => {
    if (!modelToDelete) return

    try {
      // Make a DELETE request to Ollama API to remove the model
      const response = await fetch('http://localhost:11434/api/delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: modelToDelete }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      console.log(`Successfully removed model: ${modelToDelete}`)
      await refreshOllamaModels()
      setShowDeleteDialog(false)
      setModelToDelete('')
    } catch (error) {
      console.error('Failed to remove model:', error)
      // Show error to user
      window.alert(`Failed to remove model ${modelToDelete}: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const cancelDeleteModel = () => {
    setShowDeleteDialog(false)
    setModelToDelete('')
  }

  const saveProviderToDatabase = async (provider: AIProvider) => {
    try {
      console.log('🔄 Saving provider to database:', provider.id)

      // Check if electronAPI is available
      if (!window.electronAPI) {
        console.error('❌ window.electronAPI is not available')
        return
      }

      // Check if provider exists
      const existingProviders = await databaseService.getAIProviders()
      const existingProvider = existingProviders.find(p => p.name === provider.id)

      if (existingProvider) {
        // Update existing provider
        await databaseService.updateAIProvider(existingProvider.id, {
          apiKey: provider.apiKey,
          isActive: provider.isActive,
          isConnected: provider.isConnected
        })
      } else {
        // Create new provider
        await databaseService.saveAIProvider({
          name: provider.id,
          type: 'api',
          apiKey: provider.apiKey,
          isActive: provider.isActive,
          isConnected: provider.isConnected
        })
      }

      // Save models
      const savedProviders = await databaseService.getAIProviders()
      const dbProvider = savedProviders.find(p => p.name === provider.id)
      if (dbProvider) {
        // Save/update models (the saveAIModel function now handles upsert logic)
        for (const model of provider.availableModels) {
          await databaseService.saveAIModel({
            providerId: dbProvider.id,
            modelName: model.modelName,
            modelId: model.modelId,
            isDefault: model.isSelected,
            isAvailable: true,
            metadata: { description: model.description },
            isSelected: false
          })
        }
        console.log('✅ Successfully saved provider and models to database')
      } else {
        console.error('❌ Could not find saved provider after creation/update')
      }
    } catch (error) {
      console.error('❌ Failed to save provider to database:', error)
    }
  }


  const handleModelToggle = async (providerId: string, modelId: string, isSelected: boolean) => {
    console.log('Model toggle:', { providerId, modelId, isSelected })
    await toggleModelSelection(providerId, modelId, isSelected)
  }

  const handleAPIKeyUpdate = async (providerId: string, apiKey: string) => {
    console.log('API key update:', { providerId })
    await updateAPIKey(providerId, apiKey)
  }

  const handleProviderToggle = async (providerId: string, isActive: boolean) => {
    console.log('Provider toggle:', { providerId, isActive })
    await toggleProvider(providerId, isActive)
  }

  const testAPIConnection = async (providerId: string) => {
    console.log('Testing API connection:', providerId)
    return await testProviderConnection(providerId)
  }

  const handleAddCustomModel = async () => {
    if (!validateCustomModel(customModel) || !selectedProviderId) return

    const newModel: ProviderModel = {
      modelId: customModel.modelId,
      modelName: customModel.modelName,
      description: customModel.description || 'Custom model',
      isSelected: true
    }

    addCustomModel(selectedProviderId, newModel)

    // Save to database
    const provider = providers.find(p => p.id === selectedProviderId)
    if (provider) {
      await saveProviderToDatabase({
        ...provider,
        availableModels: [...provider.availableModels, newModel]
      })
    }

    // Reset form
    setCustomModel({ modelId: '', modelName: '', description: '' })
    setShowAddModelDialog(false)
    setSelectedProviderId('')
  }

  const toggleAPIKeyVisibility = (providerId: string) => {
    setShowAPIKey(prev => ({ ...prev, [providerId]: !prev[providerId] }))
  }

  const handleModelSearch = (providerId: string, searchTerm: string) => {
    setModelSearchTerms(prev => ({ ...prev, [providerId]: searchTerm }))
  }

  const getFilteredModels = (provider: AIProvider) => {
    const searchTerm = modelSearchTerms[provider.id] || ''
    if (!searchTerm.trim()) {
      return provider.availableModels
    }

    return provider.availableModels.filter(model =>
      model.modelName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      model.modelId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (model.description && model.description.toLowerCase().includes(searchTerm.toLowerCase()))
    )
  }

  const formatModelSize = (size: number | string) => {
    // If it's already a formatted string from Ollama (like "4.1 GB"), return as is
    if (typeof size === 'string' && (size.includes('GB') || size.includes('MB'))) {
      return size
    }

    // If it's a number or numeric string, convert from bytes
    const bytes = typeof size === 'string' ? parseInt(size) : size

    if (isNaN(bytes)) return t('ai.unknownSize')

    const MB = 1024 * 1024
    const GB = MB * 1024

    if (bytes >= GB) {
      return `${(bytes / GB).toFixed(1)} GB`
    } else {
      return `${(bytes / MB).toFixed(0)} MB`
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'testing':
        return <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />
      default:
        return <Settings className="w-4 h-4 text-gray-400" />
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="space-y-6 pb-6">
        <Tabs.Root defaultValue="local" className="h-full flex flex-col">
          <Tabs.List className="flex space-x-1 bg-muted p-1 rounded-lg w-fit mb-6">
            <Tabs.Trigger
              value="local"
              className={cn(
                "px-4 py-2 rounded-md text-sm font-medium transition-all",
                "data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
                "data-[state=inactive]:text-muted-foreground hover:text-foreground"
              )}
            >
              {t('ai.localModels')}
            </Tabs.Trigger>
            <Tabs.Trigger
              value="api"
              className={cn(
                "px-4 py-2 rounded-md text-sm font-medium transition-all",
                "data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
                "data-[state=inactive]:text-muted-foreground hover:text-foreground"
              )}
            >
              {t('ai.apiProviders')}
            </Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="local" className="space-y-6">
            <div className="bg-card rounded-xl border border-border p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-semibold text-card-foreground flex items-center">
                    {t('ai.ollamaConfiguration')}
                  </h2>
                  <p className="text-muted-foreground mt-1">
                    {t('ai.ollamaDesc')}
                  </p>
                  {isInstallingModel && (
                    <div className="mt-2 flex items-center space-x-2 p-2 bg-primary/10 border border-primary/20 rounded-lg">
                      <Download className="w-4 h-4 text-primary animate-pulse" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-primary">
                          {t('ai.installing')} {installProgress.currentModel}
                        </p>
                        <p className="text-xs text-primary/70">
                          {installProgress.status} - {installProgress.progress}%
                        </p>
                      </div>
                      <div className="w-24 bg-muted rounded-full h-1.5">
                        <div
                          className="bg-primary h-1.5 rounded-full transition-all duration-300"
                          style={{ width: `${installProgress.progress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={refreshOllamaModels}
                    disabled={isRefreshing}
                    className={cn(
                      "flex items-center space-x-2 px-4 py-2 rounded-lg border transition-all",
                      "hover:bg-accent hover:text-accent-foreground",
                      isRefreshing && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
                    <span>{t('ai.refresh')}</span>
                  </button>

                  {ollamaInstalled && (
                    <Dialog.Root open={showInstallDialog} onOpenChange={setShowInstallDialog}>
                      <Dialog.Trigger asChild>
                        <button className="flex items-center space-x-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors">
                          <Plus size={16} />
                          <span>{t('ai.installModel')}</span>
                        </button>
                      </Dialog.Trigger>
                      <Dialog.Portal>
                        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
                        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card border border-border rounded-xl p-6 w-full max-w-md z-50">
                          <Dialog.Title className="text-lg font-semibold text-card-foreground mb-4">
                            {t('ai.installOllamaModel')}
                          </Dialog.Title>

                          <div className="space-y-4">
                            {!isInstallingModel ? (
                              <>
                                <div>
                                  <label className="text-sm font-medium text-card-foreground mb-2 block">
                                    {t('ai.modelName')}
                                  </label>
                                  <input
                                    type="text"
                                    value={newModelName}
                                    onChange={(e) => setNewModelName(e.target.value)}
                                    placeholder="e.g., llama3.2:latest"
                                    className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground placeholder-muted-foreground focus:border-ring focus:outline-none"
                                  />
                                </div>

                                <div>
                                  <p className="text-sm font-medium text-card-foreground mb-2">{t('ai.popularModels')}</p>
                                  <div className="grid grid-cols-2 gap-2">
                                    {popularModels.map((model) => (
                                      <button
                                        key={model}
                                        onClick={() => setNewModelName(model)}
                                        className="text-left p-2 text-sm bg-accent/30 hover:bg-accent rounded-lg transition-colors"
                                      >
                                        {model}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              </>
                            ) : (
                              <div className="space-y-6 py-4">
                                <div className="text-center">
                                  <div className="w-16 h-16 mx-auto mb-4 bg-primary/10 rounded-full flex items-center justify-center">
                                    <Download className="w-8 h-8 text-primary animate-pulse" />
                                  </div>
                                  <h3 className="text-lg font-medium text-card-foreground mb-2">
                                    {t('ai.installing')} {installProgress.currentModel}
                                  </h3>
                                  <p className="text-sm text-muted-foreground">
                                    {installProgress.status}
                                  </p>
                                </div>

                                <div className="space-y-2">
                                  <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">{t('ai.progress')}</span>
                                    <span className="text-card-foreground font-medium">{installProgress.progress}%</span>
                                  </div>
                                  <div className="w-full bg-muted rounded-full h-2">
                                    <div
                                      className="bg-primary h-2 rounded-full transition-all duration-300 ease-out"
                                      style={{ width: `${installProgress.progress}%` }}
                                    />
                                  </div>
                                </div>

                                {installProgress.progress === 100 && (
                                  <div className="flex items-center justify-center space-x-2 text-green-600">
                                    <CheckCircle className="w-5 h-5" />
                                    <span className="font-medium">{t('ai.installationCompleted')}</span>
                                  </div>
                                )}
                              </div>
                            )}

                            <div className="flex space-x-2 pt-4">
                              <Dialog.Close asChild>
                                <button
                                  disabled={isInstallingModel}
                                  className="flex-1 px-4 py-2 text-muted-foreground border border-border rounded-lg hover:bg-accent transition-colors disabled:opacity-50"
                                >
                                  {isInstallingModel ? t('ai.installing') : t('common.cancel')}
                                </button>
                              </Dialog.Close>
                              {!isInstallingModel && (
                                <button
                                  onClick={() => installOllamaModel(newModelName)}
                                  disabled={!newModelName}
                                  className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
                                >
                                  {t('ai.install')}
                                </button>
                              )}
                            </div>
                          </div>
                        </Dialog.Content>
                      </Dialog.Portal>
                    </Dialog.Root>
                  )}
                </div>
              </div>

              {ollamaInstalled === null ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="animate-spin w-6 h-6 text-muted-foreground" />
                  <span className="ml-2 text-muted-foreground">{t('ai.checkingOllama')}</span>
                </div>
              ) : ollamaInstalled ? (
                <div className="space-y-4">
                  <div className="flex items-center space-x-2 text-green-600">
                    <CheckCircle size={16} />
                    <span className="text-sm font-medium">{t('ai.ollamaRunning')}</span>
                  </div>

                  {ollamaModels.length > 0 ? (
                    <div className="space-y-3">
                      <h3 className="font-medium text-card-foreground">{t('ai.installedModels')}</h3>
                      <div className="space-y-2">
                        {ollamaModels.map((model, index) => (
                          <div key={index} className="flex items-center justify-between p-4 bg-accent/30 rounded-lg border border-border/50">
                            <div className="flex items-center space-x-3">
                              <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm border border-border/20">
                                <img
                                  src={getProviderLogo("ollama")!}
                                  alt="Ollama logo"
                                  className="w-6 h-6 object-contain"
                                />
                              </div>
                              <div>
                                <div className="font-medium text-card-foreground">{model.name}</div>
                                <div className="text-sm text-muted-foreground">
                                  {formatModelSize(model.size)}
                                </div>
                              </div>
                            </div>
                            <div className="flex space-x-2">
                              <button
                                onClick={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  handleDeleteModelClick(model.name)
                                }}
                                className="flex items-center space-x-2 px-4 py-2.5 text-sm bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 transition-all duration-200 shadow-sm hover:shadow-md"
                              >
                                <Trash2 className="w-4 h-4" />
                                <span>{t('ai.remove')}</span>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 border border-dashed border-border rounded-lg">
                      <Terminal className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                      <h3 className="font-medium text-card-foreground mb-2">{t('ai.noModels')}</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        {t('ai.noModelsDesc')}
                      </p>
                      <button
                        onClick={() => setShowInstallDialog(true)}
                        className="text-primary hover:underline text-sm"
                      >
                        {t('ai.installFirstModel')}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 border border-dashed border-destructive/20 bg-destructive/5 rounded-lg">
                  <XCircle className="w-12 h-12 text-destructive mx-auto mb-3" />
                  <h3 className="font-medium text-card-foreground mb-2">{t('ai.ollamaNotDetected')}</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    {t('ai.ollamaNotDetectedDesc')}
                  </p>
                  <a
                    href="https://ollama.ai"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center space-x-2 text-primary hover:underline"
                  >
                    <span>{t('ai.downloadOllama')}</span>
                    <ExternalLink size={14} />
                  </a>
                </div>
              )}
            </div>
          </Tabs.Content>

          <Tabs.Content value="api" className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-card-foreground mb-2">{t('ai.apiProviderConfig')}</h2>
              <p className="text-muted-foreground">
                {t('ai.apiProviderConfigDesc')}
              </p>
            </div>

            <div className="space-y-6">
              {providers.filter(p => p.type === 'api').map((provider) => (
                <div key={provider.id} className="bg-card rounded-xl border border-border overflow-hidden">
                  {/* Provider Header */}
                  <div className="p-4 sm:p-6 border-b border-border">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
                      <div className="flex items-center space-x-3 sm:space-x-4 min-w-0 flex-1">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center bg-white shadow-sm border border-border/20 flex-shrink-0">
                          {getProviderLogo(provider.id) && (
                            <img
                              src={getProviderLogo(provider.id)!}
                              alt={`${provider.name} logo`}
                              className="w-6 h-6 sm:w-8 sm:h-8 object-contain"
                            />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold text-card-foreground flex items-center space-x-2">
                            <span className="truncate">{provider.name}</span>
                            {provider.isConnected && (
                              <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                            )}
                          </h3>
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {provider.description}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-3 sm:space-y-0 sm:space-x-4 flex-shrink-0">
                        {provider.testStatus !== 'idle' && (
                          <div className="flex items-center space-x-2 min-w-0">
                            {getStatusIcon(provider.testStatus)}
                            <span className="text-sm text-muted-foreground truncate">
                              {provider.testMessage}
                            </span>
                          </div>
                        )}

                        <Switch.Root
                          checked={provider.isActive}
                          onCheckedChange={(checked) => handleProviderToggle(provider.id, checked)}
                          className="w-11 h-6 bg-gray-200 rounded-full data-[state=checked]:bg-primary relative flex-shrink-0"
                        >
                          <Switch.Thumb className="block w-5 h-5 bg-white rounded-full transition-transform duration-100 translate-x-0.5 data-[state=checked]:translate-x-[22px]" />
                        </Switch.Root>
                      </div>
                    </div>
                  </div>

                  {/* Provider Configuration */}
                  {provider.isActive && (
                    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
                      {/* API Key Section */}
                      <div className="space-y-3">
                        <label className="text-sm font-medium text-card-foreground">
                          {t('ai.apiKey')}
                        </label>
                        <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
                          <div className="relative flex-1 min-w-0">
                            <input
                              type={showAPIKey[provider.id] ? "text" : "password"}
                              value={provider.apiKey}
                              onChange={(e) => handleAPIKeyUpdate(provider.id, e.target.value)}
                              placeholder={t('ai.enterApiKey')}
                              className="w-full px-3 py-2 pr-10 bg-input border border-border rounded-lg text-foreground placeholder-muted-foreground focus:border-ring focus:outline-none text-sm"
                            />
                            <button
                              onClick={() => toggleAPIKeyVisibility(provider.id)}
                              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                              {showAPIKey[provider.id] ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                          </div>
                          <button
                            onClick={() => testAPIConnection(provider.id)}
                            disabled={!provider.apiKey || provider.testStatus === 'testing'}
                            className={cn(
                              "px-3 sm:px-4 py-2 rounded-lg border transition-all flex items-center justify-center space-x-2 text-sm whitespace-nowrap flex-shrink-0 min-w-[70px]",
                              provider.testStatus === 'testing' && "opacity-50 cursor-not-allowed",
                              provider.testStatus === 'success' && "border-green-500 bg-green-50 text-green-700",
                              provider.testStatus === 'error' && "border-red-500 bg-red-50 text-red-700",
                              provider.testStatus === 'idle' && "border-border hover:border-primary text-muted-foreground hover:text-foreground"
                            )}
                          >
                            {provider.testStatus === 'testing' && <RefreshCw className="w-4 h-4 animate-spin" />}
                            {provider.testStatus === 'success' && <CheckCircle className="w-4 h-4" />}
                            {provider.testStatus === 'error' && <XCircle className="w-4 h-4" />}
                            <span className="hidden sm:inline">{t('ai.test')}</span>
                          </button>
                        </div>
                      </div>

                      {/* Models Section */}
                      {provider.isConnected && provider.availableModels.length > 0 && (
                        <div className="space-y-3">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0">
                            <label className="text-sm font-medium text-card-foreground">
                              {t('ai.availableModels')}
                              {modelSearchTerms[provider.id] ? (
                                <span className="text-muted-foreground">
                                  ({getFilteredModels(provider).length}/{provider.availableModels.length})
                                </span>
                              ) : (
                                <span className="text-muted-foreground">({provider.availableModels.length})</span>
                              )}
                            </label>

                            <button
                              onClick={() => {
                                setSelectedProviderId(provider.id)
                                setShowAddModelDialog(true)
                              }}
                              className="flex items-center space-x-1 px-3 py-1 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors self-start sm:self-auto"
                            >
                              <Plus className="w-3 h-3" />
                              <span>{t('ai.addModel')}</span>
                            </button>

                          </div>

                          {/* Search Bar */}
                          {provider.availableModels.length > 5 && (
                            <div className="relative">
                              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                              <input
                                type="text"
                                placeholder={t('ai.searchModels')}
                                value={modelSearchTerms[provider.id] || ''}
                                onChange={(e) => handleModelSearch(provider.id, e.target.value)}
                                className="w-full pl-10 pr-4 py-2 text-sm bg-input border border-border rounded-lg text-foreground placeholder-muted-foreground focus:border-ring focus:outline-none"
                              />
                            </div>
                          )}
                          <div className="space-y-3 max-h-60 overflow-y-auto">
                            {getFilteredModels(provider).length === 0 && modelSearchTerms[provider.id] ? (
                              <div className="text-center py-6 text-muted-foreground">
                                <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                <p className="text-sm">{t('ai.noModelsFound')}</p>
                                <p className="text-xs mt-1">{t('ai.tryDifferentSearch')}</p>
                              </div>
                            ) : (
                              getFilteredModels(provider).map((model) => (
                                <div key={`${provider.id}-${model.modelId}`} className={cn(
                                  "flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 sm:p-4 rounded-lg border transition-all space-y-3 sm:space-y-0",
                                  model.isSelected
                                    ? "bg-primary/10 border-primary/30 shadow-sm"
                                    : "bg-accent/30 border-border/50 hover:bg-accent/50"
                                )}>
                                  <div className="flex-1 min-w-0">
                                    <div className="font-medium text-card-foreground truncate text-sm sm:text-base">
                                      {model.modelName}
                                    </div>
                                    <div className="text-xs text-muted-foreground line-clamp-2 mt-1">
                                      {model.description}
                                    </div>
                                  </div>
                                  <div className="flex items-center justify-between sm:justify-end space-x-2 sm:space-x-3 sm:ml-4 flex-shrink-0">
                                    {model.isSelected && (
                                      <div className="flex items-center space-x-1 text-xs text-primary">
                                        <CheckCircle className="w-3 h-3" />
                                        <span className="hidden sm:inline">{t('ai.active')}</span>
                                      </div>
                                    )}
                                    <Switch.Root
                                      checked={model.isSelected}
                                      onCheckedChange={(checked) => handleModelToggle(provider.id, model.modelId, checked)}
                                      className="w-9 h-5 bg-gray-200 rounded-full data-[state=checked]:bg-primary relative flex-shrink-0"
                                    >
                                      <Switch.Thumb className="block w-4 h-4 bg-white rounded-full transition-transform duration-100 translate-x-0.5 data-[state=checked]:translate-x-4" />
                                    </Switch.Root>
                                    {provider.id === 'openrouter' && (
                                      <button
                                        onClick={() => removeCustomModel(provider.id, model.modelId)}
                                        className="p-1 text-destructive hover:bg-destructive/10 rounded transition-colors flex-shrink-0"
                                      >
                                        <X className="w-4 h-4" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      )}

                      {/* OpenRouter Special Message */}
                      {provider.id === 'openrouter' && provider.isConnected && provider.availableModels.length === 0 && (
                        <div className="text-center py-6 border border-dashed border-border rounded-lg">
                          <Zap className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                          <p className="text-sm text-muted-foreground mb-3">
                            {t('ai.openrouterConnected')}
                          </p>
                          <button
                            onClick={() => {
                              setSelectedProviderId(provider.id)
                              setShowAddModelDialog(true)
                            }}
                            className="text-primary hover:underline text-sm"
                          >
                            {t('ai.addFirstModel')}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Add Custom Model Dialog */}
            <Dialog.Root open={showAddModelDialog} onOpenChange={setShowAddModelDialog}>
              <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
                <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card border border-border rounded-xl p-6 w-full max-w-md z-50">
                  <Dialog.Title className="text-lg font-semibold text-card-foreground mb-4">
                    {t('ai.addCustomModel')}
                  </Dialog.Title>

                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-card-foreground mb-2 block">
                        {t('ai.modelId')}
                      </label>
                      <input
                        type="text"
                        value={customModel.modelId}
                        onChange={(e) => setCustomModel(prev => ({ ...prev, modelId: e.target.value }))}
                        placeholder="e.g., anthropic/claude-3-haiku"
                        className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground placeholder-muted-foreground focus:border-ring focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium text-card-foreground mb-2 block">
                        {t('ai.modelName')}
                      </label>
                      <input
                        type="text"
                        value={customModel.modelName}
                        onChange={(e) => setCustomModel(prev => ({ ...prev, modelName: e.target.value }))}
                        placeholder="e.g., Claude 3 Haiku"
                        className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground placeholder-muted-foreground focus:border-ring focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium text-card-foreground mb-2 block">
                        {t('ai.description')} ({t('ai.optional')})
                      </label>
                      <input
                        type="text"
                        value={customModel.description}
                        onChange={(e) => setCustomModel(prev => ({ ...prev, description: e.target.value }))}
                        placeholder={t('ai.fastEfficient')}
                        className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground placeholder-muted-foreground focus:border-ring focus:outline-none"
                      />
                    </div>

                    <div className="flex space-x-2 pt-4">
                      <Dialog.Close asChild>
                        <button className="flex-1 px-4 py-2 text-muted-foreground border border-border rounded-lg hover:bg-accent transition-colors">
                          {t('common.cancel')}
                        </button>
                      </Dialog.Close>
                      <button
                        onClick={handleAddCustomModel}
                        disabled={!validateCustomModel(customModel)}
                        className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
                      >
                        {t('ai.addModel')}
                      </button>
                    </div>
                  </div>
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
          </Tabs.Content>
        </Tabs.Root>

        {/* Delete Model Confirmation Dialog - Moved outside tabs for better z-index handling */}
        <Dialog.Root open={showDeleteDialog} onOpenChange={cancelDeleteModel}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
            <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card border border-border rounded-xl p-6 w-full max-w-md z-50 shadow-lg">
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-destructive" />
                </div>
                <div>
                  <Dialog.Title className="text-lg font-semibold text-card-foreground">
                    {t('ai.deleteModel')}
                  </Dialog.Title>
                  <p className="text-sm text-muted-foreground">
                    {t('ai.deleteModelDesc')}
                  </p>
                </div>
              </div>

              <div className="mb-6">
                <p className="text-card-foreground">
                  {t('ai.deleteModelConfirm')} <span className="font-medium text-destructive">{modelToDelete}</span>?
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  {t('ai.deleteModelWarning')}
                </p>
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={cancelDeleteModel}
                  className="flex-1 px-4 py-2.5 text-card-foreground bg-accent hover:bg-accent/80 rounded-lg transition-colors font-medium"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={confirmDeleteModel}
                  className="flex-1 px-4 py-2.5 bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-lg transition-colors font-medium"
                >
                  {t('ai.deleteModel')}
                </button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
    </div>
  )
}