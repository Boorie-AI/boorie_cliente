import { useState, useEffect } from 'react'
import { useAppStore } from '@/stores/appStore'
import { useChatStore } from '@/stores/chatStore'
import { useAIConfigStore } from '@/stores/aiConfigStore'
import { ChevronDown, Server, Cloud, Settings, AlertCircle, CheckCircle } from 'lucide-react'
import { cn } from '@/utils/cn'
import * as Select from '@radix-ui/react-select'

interface Model {
  id: string
  name: string
  provider: string
  type: 'local' | 'api'
  isAvailable: boolean
  modelId?: string // For API models, this is the actual model ID to send to the API
}

export function ModelSelector() {
  const { setCurrentView } = useAppStore()
  const { conversations, activeConversationId, updateConversationModel } = useChatStore()
  const { getSelectedModels } = useAIConfigStore()
  const [ollamaStatus, setOllamaStatus] = useState<'checking' | 'available' | 'unavailable'>('checking')
  const [availableModels, setAvailableModels] = useState<Model[]>([])
  const [selectedModel, setSelectedModel] = useState('')

  const activeConversation = conversations.find(c => c.id === activeConversationId)

  useEffect(() => {
    checkOllamaAndLoadModels()

    // Load previously selected model from localStorage
    try {
      const stored = localStorage.getItem('selectedModel')
      if (stored) {
        const storedModel = JSON.parse(stored)
        setSelectedModel(storedModel.id)
      }
    } catch (error) {
      console.warn('Failed to load selected model from localStorage')
    }
  }, [])

  // Reload models when AI config changes
  useEffect(() => {
    checkOllamaAndLoadModels()
  }, [getSelectedModels])

  useEffect(() => {
    if (activeConversation) {
      // Try to find model by modelId first (for API models), then by name (for local models)
      const modelId = availableModels.find(m =>
        (m.modelId && m.modelId === activeConversation.model) ||
        m.name === activeConversation.model
      )?.id || ''
      setSelectedModel(modelId)
    } else if (availableModels.length > 0 && !selectedModel) {
      // Set default model when no conversation is active
      const defaultModel = availableModels.find(m => m.isAvailable) || availableModels[0]
      setSelectedModel(defaultModel.id)
    }
  }, [activeConversation, availableModels, selectedModel])

  const checkOllamaAndLoadModels = async () => {
    let ollamaModels: Model[] = []

    try {
      // Check Ollama status
      const response = await fetch('http://localhost:11434/api/tags', {
        method: 'GET',
      })

      if (response.ok) {
        const data = await response.json()
        setOllamaStatus('available')

        // Add Ollama models
        ollamaModels = (data.models || []).map((model: any) => ({
          id: `ollama-${model.name}`,
          name: model.name,
          provider: 'Ollama',
          type: 'local' as const,
          isAvailable: true
        }))
      } else {
        setOllamaStatus('unavailable')
      }
    } catch (error) {
      setOllamaStatus('unavailable')
    }

    // Load configured API models from AI config store
    const selectedAPIModels = getSelectedModels()
    const apiModels: Model[] = selectedAPIModels.map(({ provider, model }) => ({
      id: `${provider.id}-${model.modelId}`,
      name: model.modelName,
      provider: provider.name,
      type: 'api' as const,
      isAvailable: true,
      modelId: model.modelId // Store the actual model ID for API calls
    }))

    // Combine all models and deduplicate by ID
    const allModels = [...ollamaModels, ...apiModels]
    const uniqueModels = Array.from(new Map(allModels.map(item => [item.id, item])).values())

    setAvailableModels(uniqueModels)

    // Debug log
    console.log('Loaded models:', uniqueModels)
    console.log('API models from config:', selectedAPIModels)
  }

  const handleModelChange = (modelId: string) => {
    const selectedModelObj = availableModels.find(m => m.id === modelId)
    if (selectedModelObj) {
      console.log('Selected model:', selectedModelObj)
      setSelectedModel(modelId)

      // Update current conversation's model if there's an active conversation
      if (activeConversationId) {
        // For API models, use the actual modelId, for local models use the name
        const modelForConversation = selectedModelObj.type === 'api' && selectedModelObj.modelId
          ? selectedModelObj.modelId
          : selectedModelObj.name

        updateConversationModel(activeConversationId, modelForConversation, selectedModelObj.provider)
      }

      // Store the selected model for new conversations
      localStorage.setItem('selectedModel', JSON.stringify({
        id: modelId,
        name: selectedModelObj.name,
        provider: selectedModelObj.provider,
        type: selectedModelObj.type,
        modelId: selectedModelObj.modelId || selectedModelObj.name
      }))
    }
  }

  // Debug: Log current state (reduced logging)
  if (availableModels.length === 0) {
    console.log('No models loaded yet')
  }

  return (
    <div className="flex items-center relative">
      <Select.Root value={selectedModel} onValueChange={handleModelChange}>
        <Select.Trigger className={cn(
          "flex items-center justify-between w-full px-3 py-2 bg-card border border-border rounded-lg",
          "hover:bg-accent hover:text-accent-foreground transition-colors",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
          "min-w-[180px] data-[state=open]:border-ring"
        )}>
          <div className="flex items-center space-x-2">
            {ollamaStatus === 'available' && selectedModel.startsWith('ollama-') ? (
              <Server size={16} className="text-green-600" />
            ) : selectedModel ? (
              <Cloud size={16} className="text-blue-600" />
            ) : (
              <AlertCircle size={16} className="text-yellow-600" />
            )}
            <Select.Value placeholder="Select Model">
              <span className="font-medium text-sm">
                {availableModels.find(m => m.id === selectedModel)?.name || 'Select Model'}
              </span>
            </Select.Value>
          </div>
          <Select.Icon>
            <ChevronDown size={16} className="text-muted-foreground" />
          </Select.Icon>
        </Select.Trigger>

        <Select.Portal>
          <Select.Content
            className="bg-popover border border-border rounded-lg shadow-lg min-w-[280px] max-h-[300px] overflow-hidden"
            position="popper"
            sideOffset={4}
            style={{ zIndex: 99999 }}
          >
            <Select.Viewport className="p-1">
              {/* Local Models Section */}
              {ollamaStatus === 'available' && availableModels.some(m => m.type === 'local') && (
                <>
                  <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Local Models (Ollama)
                  </div>
                  {availableModels
                    .filter(m => m.type === 'local')
                    .map((model) => (
                      <Select.Item
                        key={model.id}
                        value={model.id}
                        className={cn(
                          "flex items-center space-x-3 px-3 py-2 rounded-md cursor-pointer",
                          "hover:bg-accent hover:text-accent-foreground",
                          "focus:bg-accent focus:text-accent-foreground focus:outline-none"
                        )}
                      >
                        <Server size={16} className="text-green-600" />
                        <div className="flex-1">
                          <div className="font-medium">{model.name}</div>
                          <div className="text-xs text-muted-foreground">{model.provider}</div>
                        </div>
                        <CheckCircle size={14} className="text-green-600" />
                      </Select.Item>
                    ))}
                  <Select.Separator className="h-px bg-border my-1" />
                </>
              )}

              {/* Ollama Not Available */}
              {ollamaStatus === 'unavailable' && (
                <>
                  <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Local Models
                  </div>
                  <div className="px-3 py-3 text-sm text-muted-foreground">
                    <div className="flex items-center space-x-2 mb-2">
                      <AlertCircle size={16} className="text-yellow-600" />
                      <span>Ollama not detected</span>
                    </div>
                    <button
                      onClick={() => setCurrentView('settings')}
                      className="text-primary hover:underline text-xs"
                    >
                      Configure Ollama in Settings
                    </button>
                  </div>
                  <Select.Separator className="h-px bg-border my-1" />
                </>
              )}

              {/* API Models Section */}
              <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                API Models
              </div>
              {availableModels
                .filter(m => m.type === 'api')
                .map((model) => (
                  <Select.Item
                    key={model.id}
                    value={model.id}
                    disabled={!model.isAvailable}
                    className={cn(
                      "flex items-center space-x-3 px-3 py-2 rounded-md cursor-pointer",
                      model.isAvailable
                        ? "hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                        : "opacity-50 cursor-not-allowed",
                      "focus:outline-none"
                    )}
                  >
                    <Cloud size={16} className={model.isAvailable ? "text-blue-600" : "text-muted-foreground"} />
                    <div className="flex-1">
                      <div className="font-medium">{model.name}</div>
                      <div className="text-xs text-muted-foreground">{model.provider}</div>
                    </div>
                    {model.isAvailable ? (
                      <CheckCircle size={14} className="text-green-600" />
                    ) : (
                      <AlertCircle size={14} className="text-yellow-600" />
                    )}
                  </Select.Item>
                ))}

              <Select.Separator className="h-px bg-border my-1" />
              <button
                onClick={() => setCurrentView('settings')}
                className={cn(
                  "w-full flex items-center space-x-2 px-3 py-2 text-sm",
                  "text-muted-foreground hover:text-foreground hover:bg-accent rounded-md",
                  "transition-colors"
                )}
              >
                <Settings size={16} />
                <span>Configure API Providers</span>
              </button>
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </div>
  )
}