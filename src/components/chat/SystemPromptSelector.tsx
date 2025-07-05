import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, Scroll, Settings } from 'lucide-react'
import { cn } from '@/utils/cn'
import * as Select from '@radix-ui/react-select'

interface SystemPrompt {
  id: string
  name: string
  title: string
  content: string
  description?: string
  isActive: boolean
  isDefault: boolean
  createdAt: Date
  updatedAt: Date
}

interface SystemPromptSelectorProps {
  value?: string
  onChange?: (systemPromptId: string | null, systemPrompt: SystemPrompt | null) => void
  className?: string
}

export function SystemPromptSelector({ value, onChange, className }: SystemPromptSelectorProps) {
  const { t } = useTranslation()
  const [systemPrompts, setSystemPrompts] = useState<SystemPrompt[]>([])
  const [selectedPrompt, setSelectedPrompt] = useState<SystemPrompt | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadSystemPrompts()
  }, [])

  useEffect(() => {
    if (value && systemPrompts.length > 0) {
      const prompt = systemPrompts.find(p => p.id === value)
      setSelectedPrompt(prompt || null)
    } else if (!value) {
      setSelectedPrompt(null)
    }
  }, [value, systemPrompts])

  const loadSystemPrompts = async () => {
    try {
      setLoading(true)
      const response = await window.electronAPI.systemPrompts.getAll()
      if (response.success && response.data) {
        setSystemPrompts(response.data)
        
        // Auto-select default prompt if no value is provided
        if (!value && response.data.length > 0) {
          const defaultPrompt = response.data.find(p => p.isDefault)
          if (defaultPrompt) {
            setSelectedPrompt(defaultPrompt)
            onChange?.(defaultPrompt.id, defaultPrompt)
          }
        }
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

  const handleValueChange = (promptId: string) => {
    if (promptId === 'none') {
      setSelectedPrompt(null)
      onChange?.(null, null)
    } else {
      const prompt = systemPrompts.find(p => p.id === promptId)
      if (prompt) {
        setSelectedPrompt(prompt)
        onChange?.(prompt.id, prompt)
      }
    }
  }

  const openSettings = () => {
    // Navigate to settings tools tab
    window.location.hash = '#/settings?tab=tools'
  }

  if (loading) {
    return (
      <div className={cn(
        "flex items-center space-x-2 px-3 py-2 bg-accent/50 rounded-lg",
        className
      )}>
        <Scroll size={16} className="text-muted-foreground animate-pulse" />
        <span className="text-sm text-muted-foreground">{t('chat.systemPrompts.loading')}</span>
      </div>
    )
  }

  return (
    <div className={cn("flex items-center space-x-2", className)}>
      <Select.Root value={selectedPrompt?.id || 'none'} onValueChange={handleValueChange}>
        <Select.Trigger className={cn(
          "flex items-center space-x-2 px-3 py-2 bg-accent/50 hover:bg-accent rounded-lg transition-colors",
          "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
          "data-[state=open]:bg-accent"
        )}>
          <Scroll size={16} className="text-muted-foreground" />
          <Select.Value asChild>
            <span className="text-sm font-medium text-card-foreground truncate max-w-32">
              {selectedPrompt ? selectedPrompt.title : t('chat.systemPrompts.none')}
            </span>
          </Select.Value>
          <ChevronDown size={14} className="text-muted-foreground" />
        </Select.Trigger>

        <Select.Portal>
          <Select.Content className={cn(
            "bg-popover border border-border rounded-lg shadow-lg z-50",
            "max-h-64 overflow-y-auto min-w-64"
          )}>
            <Select.Viewport className="p-1">
              {/* None option */}
              <Select.Item
                value="none"
                className={cn(
                  "flex items-center space-x-2 px-3 py-2 cursor-pointer rounded-md",
                  "hover:bg-accent focus:bg-accent focus:outline-none",
                  "data-[state=checked]:bg-accent data-[state=checked]:text-accent-foreground"
                )}
              >
                <div className="flex items-center space-x-2 flex-1 min-w-0">
                  <div className="w-4 h-4 rounded border border-border bg-muted" />
                  <div className="flex flex-col min-w-0">
                    <Select.ItemText asChild>
                      <span className="text-sm font-medium text-card-foreground">
                        {t('chat.systemPrompts.none')}
                      </span>
                    </Select.ItemText>
                    <span className="text-xs text-muted-foreground">
                      {t('chat.systemPrompts.noneDescription')}
                    </span>
                  </div>
                </div>
              </Select.Item>

              {/* System prompts */}
              {systemPrompts.map((prompt) => (
                <Select.Item
                  key={prompt.id}
                  value={prompt.id}
                  className={cn(
                    "flex items-center space-x-2 px-3 py-2 cursor-pointer rounded-md",
                    "hover:bg-accent focus:bg-accent focus:outline-none",
                    "data-[state=checked]:bg-accent data-[state=checked]:text-accent-foreground"
                  )}
                >
                  <div className="flex items-center space-x-2 flex-1 min-w-0">
                    <div className={cn(
                      "w-4 h-4 rounded border",
                      prompt.isDefault 
                        ? "bg-blue-100 border-blue-500" 
                        : "border-border bg-background"
                    )}>
                      {prompt.isDefault && (
                        <div className="w-2 h-2 bg-blue-500 rounded-full m-0.5" />
                      )}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <Select.ItemText asChild>
                        <span className="text-sm font-medium text-card-foreground truncate">
                          {prompt.title}
                        </span>
                      </Select.ItemText>
                      {prompt.description && (
                        <span className="text-xs text-muted-foreground truncate">
                          {prompt.description}
                        </span>
                      )}
                    </div>
                  </div>
                  {prompt.isDefault && (
                    <span className="text-xs text-blue-600 font-medium">
                      {t('chat.systemPrompts.default')}
                    </span>
                  )}
                </Select.Item>
              ))}

              {/* Settings option */}
              <div className="border-t border-border mt-1 pt-1">
                <button
                  onClick={openSettings}
                  className={cn(
                    "flex items-center space-x-2 px-3 py-2 cursor-pointer rounded-md w-full",
                    "hover:bg-accent focus:bg-accent focus:outline-none text-left"
                  )}
                >
                  <Settings size={16} className="text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    {t('chat.systemPrompts.managePrompts')}
                  </span>
                </button>
              </div>
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </div>
  )
}