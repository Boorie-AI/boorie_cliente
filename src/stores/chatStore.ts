import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { type ChatMessage } from '@/services/chat'
import { useAIConfigStore } from './aiConfigStore'
import { databaseService } from '@/services/database'

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
  }
}

export interface Conversation {
  id: string
  title: string
  messages: Message[]
  createdAt: Date
  updatedAt: Date
  model: string
  provider: string
  systemPromptId?: string | null
}

interface ChatState {
  conversations: Conversation[]
  activeConversationId: string | null
  isLoading: boolean
  streamingMessage: string
  streamingBuffer: string
  selectedCollectionId: string | null
  
  // Actions
  createNewConversation: () => Promise<void>
  setActiveConversation: (id: string) => void
  addMessageToConversation: (conversationId: string, message: Omit<Message, 'id' | 'timestamp'>) => Promise<void>
  updateConversationTitle: (id: string, title: string) => void
  updateConversationModel: (id: string, model: string, provider: string) => void
  updateConversationSystemPrompt: (id: string, systemPromptId: string | null) => void
  deleteConversation: (id: string) => void
  sendMessage: (content: string) => Promise<void>
  setStreamingMessage: (content: string) => void
  clearStreamingMessage: () => void
  saveConversation: (conversation: Conversation) => Promise<void>
  loadConversations: () => Promise<void>
  setSelectedCollectionId: (collectionId: string | null) => void
  callOllamaAPI: (model: string, prompt: string, context: Message[], systemPrompt?: string) => Promise<{ response: string; metadata: any }>
  callAPIProvider: (provider: string, model: string, prompt: string, context: Message[], systemPrompt?: string) => Promise<{ response: string; metadata: any }>
}

export const useChatStore = create<ChatState>()(
  devtools(
    (set, get) => ({
      conversations: [],
      activeConversationId: null,
      isLoading: false,
      streamingMessage: '',
      streamingBuffer: '',
      selectedCollectionId: null,

      createNewConversation: async () => {
        // Get selected model from localStorage or use first available
        let selectedModel = { name: 'Default Model', provider: 'Ollama' }
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
          createdAt: new Date(),
          updatedAt: new Date(),
          model: selectedModel.modelId || selectedModel.name, // Use modelId for API models, name for local models
          provider: selectedModel.provider
        }

        // Get default system prompt and add greeting if available
        try {
          const defaultPromptResponse = await window.electronAPI.systemPrompts.getDefault()
          if (defaultPromptResponse.success && defaultPromptResponse.data) {
            const systemPrompt = defaultPromptResponse.data
            newConversation.systemPromptId = systemPrompt.id
            
            // Add greeting message if available
            if (systemPrompt.saludo) {
              const greetingMessage: Message = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: systemPrompt.saludo,
                timestamp: new Date(),
                metadata: {
                  isGreeting: true
                }
              }
              newConversation.messages.push(greetingMessage)
            }
          }
        } catch (error) {
          console.warn('Failed to load default system prompt:', error)
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
          console.log('Message saved to database successfully')
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

      updateConversationSystemPrompt: (id, systemPromptId) => {
        set((state) => ({
          conversations: state.conversations.map((conv) =>
            conv.id === id ? { ...conv, systemPromptId, updatedAt: new Date() } : conv
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
          console.log('Conversation deleted:', id)
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
        const selectedCollectionId = state.selectedCollectionId

        // Add user message
        await get().addMessageToConversation(conversationId, {
          role: 'user',
          content
        })

        set({ isLoading: true })

        try {
          const conversation = get().conversations.find(c => c.id === conversationId)
          if (!conversation) throw new Error('Conversation not found')
          
          console.log('Sending message with conversation:', {
            model: conversation.model,
            provider: conversation.provider,
            message: content,
            collectionId: selectedCollectionId,
            systemPromptId: conversation.systemPromptId
          })
          
          let response: string
          let metadata: any
          let ragContext = ''
          let systemPromptContent = ''
          
          // Clear any previous streaming message
          get().clearStreamingMessage()
          
          // Get system prompt content if one is selected
          if (conversation.systemPromptId) {
            try {
              const systemPromptResponse = await window.electronAPI.systemPrompts.getById(conversation.systemPromptId)
              if (systemPromptResponse.success && systemPromptResponse.data) {
                systemPromptContent = systemPromptResponse.data.content
                console.log('Using system prompt:', systemPromptResponse.data.title)
              }
            } catch (error) {
              console.error('Failed to get system prompt:', error)
              // Continue without system prompt if fetch fails
            }
          }
          
          // If a collection is selected, perform RAG search
          if (selectedCollectionId) {
            try {
              const searchResults = await window.electronAPI.rag.searchDocuments(
                content, 
                [selectedCollectionId], 
                5 // Top 5 results
              )
              
              if (searchResults.success && searchResults.data && searchResults.data.length > 0) {
                // Format RAG context
                ragContext = '\n\nContext from knowledge base:\n'
                searchResults.data.forEach((chunk: any, index: number) => {
                  ragContext += `\n[${index + 1}] ${chunk.content}\n`
                  if (chunk.document?.filename) {
                    ragContext += `   Source: ${chunk.document.filename}\n`
                  }
                })
                ragContext += '\nBased on the above context and your knowledge, please answer the following question:\n'
                
                // Add sources to metadata - remove duplicates
                const uniqueSources = [...new Set(searchResults.data
                  .map((chunk: any) => chunk.document?.filename)
                  .filter((filename: string | undefined) => filename !== undefined)
                )]
                
                if (uniqueSources.length > 0) {
                  metadata = {
                    ...metadata,
                    sources: uniqueSources
                  }
                }
              }
            } catch (error) {
              console.error('RAG search failed:', error)
              // Continue without RAG context if search fails
            }
          }
          
          // Prepare the enhanced prompt with RAG context
          const enhancedPrompt = ragContext ? ragContext + content : content
          
          // Check if it's an Ollama model (local)
          if (conversation.provider === 'Ollama') {
            const ollamaResponse = await get().callOllamaAPI(conversation.model, enhancedPrompt, conversation.messages, systemPromptContent)
            response = ollamaResponse.response
            metadata = { ...ollamaResponse.metadata, ...metadata }
          } else {
            // Handle API providers
            try {
              const apiResponse = await get().callAPIProvider(conversation.provider, conversation.model, enhancedPrompt, conversation.messages, systemPromptContent)
              response = apiResponse.response
              metadata = { ...apiResponse.metadata, ...metadata }
            } catch (error) {
              console.error(`Failed to call ${conversation.provider} API:`, error)
              response = `Error connecting to ${conversation.provider}: ${error instanceof Error ? error.message : 'Unknown error'}`
              metadata = {
                model: conversation.model,
                provider: conversation.provider,
                tokens: 0,
                ...metadata
              }
            }
          }
          
          // Clear streaming message before adding final message
          get().clearStreamingMessage()
          
          // Add assistant message
          await get().addMessageToConversation(conversationId, {
            role: 'assistant',
            content: response,
            metadata
          })
        } catch (error) {
          console.error('Failed to get AI response:', error)
          get().clearStreamingMessage()
          await get().addMessageToConversation(conversationId, {
            role: 'assistant',
            content: 'Sorry, I encountered an error while processing your request. Please try again.'
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

      setSelectedCollectionId: (collectionId: string | null) => {
        set({ selectedCollectionId: collectionId })
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
              systemPromptId: conversation.systemPromptId
            })
          } else {
            // Create new conversation
            await databaseService.saveConversation({
              id: conversation.id,
              title: conversation.title,
              messages: conversation.messages,
              model: conversation.model,
              provider: conversation.provider,
              systemPromptId: conversation.systemPromptId
            })
          }
          
          console.log('Conversation saved to database:', conversation.title)
        } catch (error) {
          console.error('Failed to save conversation to database:', error)
        }
      },

      loadConversations: async () => {
        try {
          // Load conversations from database
          const storedConversations = await databaseService.getConversations()
          
          const conversations: Conversation[] = storedConversations.map((conv: any) => ({
            ...conv,
            createdAt: new Date(conv.createdAt),
            updatedAt: new Date(conv.updatedAt),
            messages: Array.isArray(conv.messages) ? conv.messages.map((msg: any) => ({
              ...msg,
              timestamp: new Date(msg.timestamp)
            })) : []
          }))

          // Sort by updated date (database should already sort, but let's be safe)
          conversations.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())

          set({ conversations })
          console.log('Loaded conversations from database:', conversations.length)
        } catch (error) {
          console.error('Failed to load conversations from database:', error)
        }
      },

      callOllamaAPI: async (model: string, prompt: string, context: Message[], systemPrompt?: string) => {
        try {
          // Clean model name (remove 'ollama-' prefix if present)
          const cleanModelName = model.startsWith('ollama-') ? model.replace('ollama-', '') : model
          
          // Prepare context messages for Ollama
          const messages = context.slice(-10).map(msg => ({
            role: msg.role,
            content: msg.content
          }))
          
          // Add system prompt if provided
          if (systemPrompt) {
            messages.unshift({ role: 'system', content: systemPrompt })
          }
          
          // Add current prompt
          messages.push({ role: 'user', content: prompt })
          
          console.log(`Calling Ollama API with model: ${cleanModelName}`)
          console.log('Messages to send:', messages)
          
          const requestBody = {
            model: cleanModelName,
            messages: messages,
            stream: true
          }
          
          console.log('Request body:', requestBody)
          
          const response = await fetch('http://localhost:11434/api/chat', {
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
                    console.log('Streaming data:', data) // Debug log
                    
                    if (data.message?.content) {
                      fullResponse += data.message.content
                      console.log('Updated fullResponse:', fullResponse) // Debug log
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

      callAPIProvider: async (provider: string, model: string, prompt: string, context: Message[], systemPrompt?: string) => {
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

          // Add system prompt if provided
          if (systemPrompt) {
            chatMessages.unshift({ role: 'system', content: systemPrompt })
          }

          // Add current prompt
          chatMessages.push({ role: 'user', content: prompt })

          console.log(`Calling ${provider} API with model: ${model} via IPC`)
          console.log('Messages to send:', chatMessages)

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
      }
    }),
    { name: 'chat-store' }
  )
)