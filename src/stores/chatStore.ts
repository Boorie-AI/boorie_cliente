import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { type ChatMessage } from '@/services/chat'
import { useAIConfigStore } from './aiConfigStore'
import { databaseService } from '@/services/database'
import { getOllamaBaseUrl } from '@/config/ollama'

export interface WisdomConfiguration {
  enabled: boolean
  searchTopK: number
  searchMethod: 'agentic'
  categories: string[]
  embeddingProvider?: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  metadata?: {
    model?: string
    provider?: string
    tokens?: number
    sources?: string[]
    ragEnabled?: boolean
    originalQuery?: string
    enhancedQuery?: boolean
    ragAttempted?: boolean
  }
}

export interface Conversation {
  id: string
  title: string
  messages: Message[]
  projectId?: string
  createdAt: Date
  updatedAt: Date
  model: string
  provider: string
}

interface ChatState {
  conversations: Conversation[]
  activeConversationId: string | null
  isLoading: boolean
  streamingMessage: string
  streamingBuffer: string

  // Wisdom/RAG configuration
  wisdomConfig: WisdomConfiguration | undefined

  // Actions
  createNewConversation: (projectId?: string) => void
  setActiveConversation: (id: string) => void
  addMessageToConversation: (conversationId: string, message: Omit<Message, 'id' | 'timestamp'>) => Promise<void>
  updateConversationTitle: (id: string, title: string) => void
  updateConversationModel: (id: string, model: string, provider: string) => void
  updateConversation: (id: string, updates: Partial<Conversation>) => void
  deleteConversation: (id: string) => void
  sendMessage: (content: string) => Promise<void>
  setStreamingMessage: (content: string) => void
  clearStreamingMessage: () => void
  saveConversation: (conversation: Conversation) => Promise<void>
  loadConversations: (projectId?: string) => Promise<void>
  loadAllConversations: () => Promise<void>
  callOllamaAPI: (model: string, prompt: string, context: Message[]) => Promise<{ response: string; metadata: any }>
  callAPIProvider: (provider: string, model: string, prompt: string, context: Message[]) => Promise<{ response: string; metadata: any }>

  // Wisdom/RAG actions
  setWisdomConfig: (config: WisdomConfiguration | undefined) => void
  enhancePromptWithRAG: (originalPrompt: string) => Promise<{ enhancedPrompt: string; sources?: any[] }>
}

export const useChatStore = create<ChatState>()(
  devtools(
    (set, get) => ({
      conversations: [],
      activeConversationId: null,
      isLoading: false,
      streamingMessage: '',
      streamingBuffer: '',
      wisdomConfig: undefined,

      createNewConversation: (projectId?: string) => {
        // Get selected model from localStorage or use first available
        let selectedModel: { name: string; provider: string; modelId?: string } = { name: 'Default Model', provider: 'Ollama' }
        try {
          const stored = localStorage.getItem('selectedModel')
          if (stored) {
            selectedModel = JSON.parse(stored)
          }
        } catch (error) {
          console.warn('Failed to load selected model from localStorage')
        }

        const newConversation: Conversation = {
          id: crypto.randomUUID(),
          title: 'New Conversation',
          messages: [],
          projectId,
          createdAt: new Date(),
          updatedAt: new Date(),
          model: selectedModel.modelId || selectedModel.name, // Use modelId for API models, name for local models
          provider: selectedModel.provider
        }

        set((state) => ({
          conversations: [newConversation, ...state.conversations],
          activeConversationId: newConversation.id
        }))

        // Save to database
        get().saveConversation(newConversation)
      },

      setActiveConversation: (id) => {
        set({ activeConversationId: id })
      },

      addMessageToConversation: async (conversationId, messageData) => {
        const message: Message = {
          ...messageData,
          id: crypto.randomUUID(),
          timestamp: new Date()
        }

        // Update state immediately for UI responsiveness
        set((state) => ({
          conversations: state.conversations.map((conv) =>
            conv.id === conversationId
              ? {
                ...conv,
                messages: [...conv.messages, message],
                updatedAt: new Date(),
                title: conv.messages.length === 0 && message.role === 'user'
                  ? message.content.slice(0, 50) + (message.content.length > 50 ? '...' : '')
                  : conv.title
              }
              : conv
          )
        }))

        // Save message to database using the correct method
        try {
          await databaseService.addMessageToConversation(conversationId, {
            role: message.role,
            content: message.content,
            metadata: message.metadata
          })
        } catch (error) {
          console.error('Failed to save message to database:', error)
        }
      },

      updateConversationTitle: (id, title) => {
        set((state) => ({
          conversations: state.conversations.map((conv) =>
            conv.id === id ? { ...conv, title, updatedAt: new Date() } : conv
          )
        }))

        const updatedConversation = get().conversations.find(c => c.id === id)
        if (updatedConversation) {
          get().saveConversation(updatedConversation)
        }
      },

      updateConversationModel: (id, model, provider) => {
        set((state) => ({
          conversations: state.conversations.map((conv) =>
            conv.id === id ? { ...conv, model, provider, updatedAt: new Date() } : conv
          )
        }))

        const updatedConversation = get().conversations.find(c => c.id === id)
        if (updatedConversation) {
          get().saveConversation(updatedConversation)
        }
      },

      updateConversation: (id, updates) => {
        set((state) => ({
          conversations: state.conversations.map((conv) =>
            conv.id === id ? { ...conv, ...updates, updatedAt: new Date() } : conv
          )
        }))

        const updatedConversation = get().conversations.find(c => c.id === id)
        if (updatedConversation) {
          get().saveConversation(updatedConversation)
        }
      },

      deleteConversation: async (id) => {
        set((state) => ({
          conversations: state.conversations.filter((conv) => conv.id !== id),
          activeConversationId: state.activeConversationId === id ? null : state.activeConversationId
        }))

        // Delete from database
        try {
          await databaseService.deleteConversation(id)
        } catch (error) {
          console.error('Failed to delete conversation:', error)
        }
      },

      sendMessage: async (content) => {
        const state = get()
        const activeConversation = state.conversations.find(c => c.id === state.activeConversationId)

        if (!activeConversation) {
          // Create new conversation if none is active
          get().createNewConversation()
          const newState = get()
          const newActiveConversation = newState.conversations.find(c => c.id === newState.activeConversationId)
          if (!newActiveConversation) return
        }

        const conversationId = state.activeConversationId!

        // Add user message
        await get().addMessageToConversation(conversationId, {
          role: 'user',
          content
        })

        set({ isLoading: true })

        // Global timeout for the entire flow (RAG + AI response): 120 seconds
        const GLOBAL_TIMEOUT_MS = 120000
        const globalTimeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('GLOBAL_TIMEOUT')), GLOBAL_TIMEOUT_MS)
        )

        try {
          // Wrap the entire pipeline in a global timeout
          await Promise.race([globalTimeout, (async () => {
            // Enhance prompt with RAG if enabled
            let enhancedPrompt = content
            let ragSources: any[] = []
            try {
              // RAG enhancement with its own timeout (30s)
              const ragTimeout = new Promise<{ enhancedPrompt: string; sources?: any[] }>((resolve) =>
                setTimeout(() => {
                  console.warn('RAG enhancement timed out, using original prompt')
                  resolve({ enhancedPrompt: content })
                }, 30000)
              )
              const ragResult = await Promise.race([
                get().enhancePromptWithRAG(content),
                ragTimeout
              ])
              enhancedPrompt = ragResult.enhancedPrompt
              ragSources = ragResult.sources || []
            } catch (error) {
              console.warn('Failed to enhance prompt with RAG, using original:', error)
            }

            const conversation = get().conversations.find(c => c.id === conversationId)
            if (!conversation) throw new Error('Conversation not found')

            // Clear any previous streaming message
            get().clearStreamingMessage()

            // Get API key for the provider
            const aiConfigStore = useAIConfigStore.getState()
            const providerConfig = aiConfigStore.providers.find(p => p.name === conversation.provider)
            const apiKey = providerConfig?.apiKey || ''

            // Prepare messages for chat handler (includes system prompt automatically)
            const messages: ChatMessage[] = conversation.messages.map(msg => ({
              role: msg.role,
              content: msg.content
            }))

            // Add the current user message (use enhanced prompt if RAG is enabled)
            messages.push({
              role: 'user',
              content: enhancedPrompt
            })

            // Send with retry logic (1 retry for transient errors)
            const MAX_RETRIES = 1
            let lastError: Error | null = null

            for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
              try {
                if (attempt > 0) {
                  await new Promise(resolve => setTimeout(resolve, 2000 * attempt))
                }

                const result = await window.electronAPI.chat.sendMessage({
                  provider: conversation.provider,
                  model: conversation.model,
                  messages: messages,
                  apiKey: apiKey
                })

                if (!result.success) {
                  const err = new Error(result.error || 'Failed to send message')
                  // Only retry on transient server errors
                  if (attempt < MAX_RETRIES && result.error &&
                      (result.error.includes('temporarily unavailable') ||
                       result.error.includes('502') || result.error.includes('503') ||
                       result.error.includes('504'))) {
                    lastError = err
                    continue
                  }
                  throw err
                }

                const response = result.data?.response || ''
                const metadata = result.data?.metadata || {
                  model: conversation.model,
                  provider: conversation.provider,
                  tokens: 0
                }

                // Clear streaming message before adding final message
                get().clearStreamingMessage()

                // Add RAG sources to metadata if available
                if (enhancedPrompt !== content) {
                  metadata.ragEnabled = true
                  metadata.originalQuery = content
                  metadata.enhancedQuery = enhancedPrompt !== content
                  metadata.sources = ragSources
                  metadata.ragAttempted = true
                } else {
                  metadata.ragAttempted = true
                  metadata.ragEnabled = state.wisdomConfig?.enabled
                }

                // Add assistant message
                await get().addMessageToConversation(conversationId, {
                  role: 'assistant',
                  content: response,
                  metadata
                })

                return // Success, exit the retry loop and async function
              } catch (retryError) {
                lastError = retryError instanceof Error ? retryError : new Error(String(retryError))
                if (attempt >= MAX_RETRIES) throw lastError
                // Check if error is retryable
                const msg = lastError.message
                if (!(msg.includes('temporarily unavailable') ||
                      msg.includes('502') || msg.includes('503') || msg.includes('504') ||
                      msg.includes('timed out'))) {
                  throw lastError // Non-retryable error
                }
              }
            }
          })()])
        } catch (error) {
          console.error('Failed to get AI response:', error)
          get().clearStreamingMessage()

          // Show specific error message instead of generic one
          const errorMessage = error instanceof Error ? error.message : String(error)
          let userFacingMessage: string

          if (errorMessage === 'GLOBAL_TIMEOUT') {
            userFacingMessage = '**La solicitud tardó demasiado.** El sistema no pudo completar la operación en el tiempo límite (2 minutos).\n\n' +
              'Posibles causas:\n' +
              '- El modelo de IA está sobrecargado o es demasiado grande\n' +
              '- La búsqueda en la base de conocimiento (RAG) está tardando mucho\n' +
              '- Problemas de conexión con el proveedor de IA\n\n' +
              'Sugerencias:\n' +
              '1. Intente enviar su mensaje nuevamente\n' +
              '2. Pruebe con un modelo más pequeño o rápido\n' +
              '3. Desactive temporalmente el Wisdom Center si está habilitado'
          } else if (errorMessage.includes('Cannot connect to Ollama') || errorMessage.includes('ECONNREFUSED')) {
            userFacingMessage = '**No se puede conectar con Ollama.** Asegúrese de que Ollama esté ejecutándose.\n\n' +
              '1. Abra una terminal y ejecute: `ollama serve`\n' +
              '2. Verifique que esté activo en http://127.0.0.1:11434\n' +
              '3. Intente enviar su mensaje nuevamente.'
          } else if (errorMessage.includes('not found') && errorMessage.includes('ollama pull')) {
            userFacingMessage = `**Modelo no disponible.** ${errorMessage}\n\nAbra una terminal y descargue el modelo antes de intentar nuevamente.`
          } else if (errorMessage.includes('timed out')) {
            userFacingMessage = '**Tiempo de espera agotado.** El modelo está tardando demasiado en responder.\n\n' +
              'Esto puede ocurrir con modelos grandes o en equipos con recursos limitados.\n' +
              'Intente nuevamente o cambie a un modelo más pequeño.'
          } else if (errorMessage.includes('API key') || errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
            userFacingMessage = '**Error de autenticación.** Verifique que su clave API sea correcta en Ajustes > Proveedores de IA.'
          } else if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
            userFacingMessage = '**Límite de solicitudes excedido.** Espere un momento e intente nuevamente.'
          } else if (errorMessage.includes('credit') || errorMessage.includes('billing') || errorMessage.includes('balance') || errorMessage.includes('quota')) {
            userFacingMessage = '**Créditos insuficientes.** Verifique el saldo de su cuenta con el proveedor de IA.'
          } else if (errorMessage.includes('hydraulic_knowledge') || errorMessage.includes('does not exist in the current database')) {
            userFacingMessage = '**Error de base de datos.** Algunas tablas no se encuentran. Reinicie la aplicación para reparar la base de datos automáticamente.'
          } else {
            userFacingMessage = `**Error al procesar su solicitud:** ${errorMessage}`
          }

          await get().addMessageToConversation(conversationId, {
            role: 'assistant',
            content: userFacingMessage
          })
        } finally {
          // Ensure streaming is cleared and loading is stopped
          get().clearStreamingMessage()
          set({ isLoading: false })
        }
      },

      setStreamingMessage: (content) => {
        // Only update if we're still loading to prevent race conditions
        const state = get()
        if (state.isLoading) {
          set({ streamingMessage: content, streamingBuffer: content })
        }
      },

      clearStreamingMessage: () => {
        set({ streamingMessage: '', streamingBuffer: '' })
      },

      saveConversation: async (conversation: Conversation) => {
        try {
          // Check if conversation exists in database
          const existingConversations = await databaseService.getConversations()
          const existingConversation = existingConversations.find(c => c.id === conversation.id)

          if (existingConversation) {
            // Update existing conversation
            await databaseService.updateConversation(conversation.id, {
              title: conversation.title,
              messages: conversation.messages,
              model: conversation.model,
              provider: conversation.provider,
              projectId: conversation.projectId
            })
          } else {
            // Create new conversation
            await databaseService.saveConversation({
              id: conversation.id,
              title: conversation.title,
              messages: conversation.messages,
              model: conversation.model,
              provider: conversation.provider,
              projectId: conversation.projectId
            })
          }

        } catch (error) {
          console.error('Failed to save conversation to database:', error)
        }
      },

      loadConversations: async (projectId?: string) => {
        try {
          // Load conversations from database
          const storedConversations = await databaseService.getConversations()

          let conversations: Conversation[] = storedConversations.map((conv: any) => ({
            ...conv,
            createdAt: new Date(conv.createdAt),
            updatedAt: new Date(conv.updatedAt),
            messages: Array.isArray(conv.messages) ? conv.messages.map((msg: any) => ({
              ...msg,
              timestamp: new Date(msg.timestamp)
            })) : []
          }))

          // Filter by projectId if provided
          if (projectId) {
            conversations = conversations.filter(conv => conv.projectId === projectId)
          }

          // Sort by updated date (database should already sort, but let's be safe)
          conversations.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())

          set({ conversations })
        } catch (error) {
          console.error('Failed to load conversations from database:', error)
        }
      },

      loadAllConversations: async () => {
        // Just call loadConversations without projectId to load all
        await get().loadConversations()
      },

      callOllamaAPI: async (model: string, prompt: string, context: Message[]) => {
        try {
          // Clean model name (remove 'ollama-' prefix if present)
          const cleanModelName = model.startsWith('ollama-') ? model.replace('ollama-', '') : model

          // Prepare context messages for Ollama
          const messages = context.slice(-10).map(msg => ({
            role: msg.role,
            content: msg.content
          }))

          // Add current prompt
          messages.push({ role: 'user', content: prompt })

          const requestBody = {
            model: cleanModelName,
            messages: messages,
            stream: true
          }

          const ollamaUrl = getOllamaBaseUrl()
          const response = await fetch(`${ollamaUrl}/api/chat`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
          })

          if (!response.ok) {
            throw new Error(`Ollama API error: ${response.status} ${response.statusText}`)
          }

          let fullResponse = ''
          let totalTokens = 0

          // Stream the response
          const reader = response.body?.getReader()
          const decoder = new TextDecoder()

          if (reader) {
            try {
              while (true) {
                const { done, value } = await reader.read()
                if (done) break

                const chunk = decoder.decode(value)
                const lines = chunk.split('\n').filter(line => line.trim())

                for (const line of lines) {
                  try {
                    const data = JSON.parse(line)

                    if (data.message?.content) {
                      fullResponse += data.message.content
                      // Update streaming message immediately
                      get().setStreamingMessage(fullResponse)
                    }
                    if (data.eval_count) {
                      totalTokens = data.eval_count
                    }
                  } catch (e) {
                    console.warn('Failed to parse streaming line:', line, e)
                  }
                }
              }
            } finally {
              reader.releaseLock()
            }
          }

          return {
            response: fullResponse || 'No response from Ollama',
            metadata: {
              model: cleanModelName,
              provider: 'Ollama',
              tokens: totalTokens,
              created_at: new Date().toISOString()
            }
          }
        } catch (error) {
          console.error('Ollama API call failed:', error)
          throw new Error(`Failed to connect to Ollama: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
      },

      callAPIProvider: async (provider: string, model: string, prompt: string, context: Message[]) => {
        try {
          // Get API key from AI config store
          const aiConfigStore = useAIConfigStore.getState()
          const providerConfig = aiConfigStore.providers.find(p => p.name === provider)

          if (!providerConfig || !providerConfig.apiKey) {
            throw new Error(`No API key configured for ${provider}`)
          }

          if (!providerConfig.isActive || !providerConfig.isConnected) {
            throw new Error(`${provider} is not active or connected. Please configure it in settings.`)
          }

          // Convert context messages to chat format
          const chatMessages: ChatMessage[] = context.slice(-10).map(msg => ({
            role: msg.role,
            content: msg.content
          }))

          // Add current prompt
          chatMessages.push({ role: 'user', content: prompt })

          // Call through IPC instead of direct API call
          const result = await window.electronAPI.chat.sendMessage({
            provider,
            model,
            messages: chatMessages,
            apiKey: providerConfig.apiKey,
            stream: false // Disable streaming for now through IPC
          })

          if (!result.success) {
            throw new Error(result.error || 'Unknown error from backend')
          }

          return {
            response: result.data.response,
            metadata: result.data.metadata
          }

        } catch (error) {
          console.error(`${provider} API call failed:`, error)
          throw new Error(`Failed to connect to ${provider}: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
      },

      // Wisdom/RAG methods
      setWisdomConfig: (config: WisdomConfiguration | undefined) => {
        set({ wisdomConfig: config })
      },

      enhancePromptWithRAG: async (originalPrompt: string): Promise<{ enhancedPrompt: string; sources?: any[] }> => {
        const state = get()

        if (!state.wisdomConfig?.enabled) {
          return { enhancedPrompt: originalPrompt }
        }

        try {
          // Get system prompt from database
          const systemPrompt = await databaseService.getSetting('system_prompt')

          // Query RAG system using agentic RAG
          const ragResult = await window.electronAPI.agenticRAG.query(originalPrompt, {
            categories: state.wisdomConfig.categories.length > 0 ? state.wisdomConfig.categories : undefined,
            searchTopK: state.wisdomConfig.searchTopK,
            technicalLevel: 'intermediate'
          })

          if (!ragResult.success || !ragResult.data) {
            return { enhancedPrompt: originalPrompt }
          }

          // Build enhanced prompt with context
          let enhancedPrompt = ''

          // Add system prompt if available
          if (systemPrompt) {
            enhancedPrompt += `${systemPrompt}\n\n`
          }

          // Add RAG context
          if (ragResult.data.sources && ragResult.data.sources.length > 0) {
            enhancedPrompt += '=== CONTEXT FROM HYDRAULIC ENGINEERING KNOWLEDGE ===\n\n'

            ragResult.data.sources.forEach((source: any, index: number) => {
              enhancedPrompt += `[Source ${index + 1}]: ${source.title}\n`
              enhancedPrompt += `${source.content}\n\n`
            })

            enhancedPrompt += '=== END CONTEXT ===\n\n'
            enhancedPrompt += 'Based on the above hydraulic engineering context, please answer the following question:\n\n'
          }

          enhancedPrompt += originalPrompt

          return { enhancedPrompt: enhancedPrompt, sources: ragResult.data.sources }

        } catch (error) {
          console.error('Failed to enhance prompt with RAG:', error)
          return { enhancedPrompt: originalPrompt }
        }
      }
    }),
    { name: 'chat-store' }
  )
)