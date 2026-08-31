import { logger } from '@/utils/logger'
import i18n from '@/i18n'
import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { type ChatMessage } from '@/services/chat'
import { useAIConfigStore } from './aiConfigStore'
import { databaseService } from '@/services/database'
import { getOllamaBaseUrl } from '@/config/ollama'
import { cargarModelosRAG, modeloFijadoRAG, modelosRAGEnCache } from '@/config/modelosRAG'

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
    /** Respondió el auxiliar porque el principal no estaba (#49). */
    modeloDegradado?: boolean
    /**
     * Escenario que el agente propone y que espera confirmación (#44). Llega
     * con el nombre que le pone el handler, sin traducir, para que no haya dos
     * formas de llamar a lo mismo entre proceso principal y renderer.
     */
    /** Id de la ejecución que respalda las cifras de esta narración (#44). */
    escenarioEjecutado?: string
    /**
     * Medidas ya verificadas que acompañan a esta narración, con la ejecución
     * que respalda cada cifra, para poder valorarlas (#42, tercera entrega).
     */
    recomendaciones_energia?: Array<{ runId: string; titulo: string; contexto?: Record<string, unknown> }>
    /** Propuesta de analizar el bombeo y verificar medidas (#42). */
    propuesta_energia?: { red_id?: string; project_id?: string | null }
    propuesta_escenario?: {
      resumen?: string
      definicion?: { nombre?: string; eventos: Array<Record<string, unknown>> }
      elementos_inexistentes?: Array<{ id: string; ids_parecidos: string[] }>
      red_id?: string
    }
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
  enhancePromptWithRAG: (originalPrompt: string, projectId?: string | null) => Promise<{ enhancedPrompt: string; sources?: any[] }>

  // Hydraulic project context
  buildProjectContext: (projectId: string) => Promise<string>
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
        const fijado = modeloFijadoRAG()
        if (fijado) {
          // Con el modelo fijado (#49) el desplegable no existe, así que lo que
          // hubiera quedado en localStorage no representa ninguna elección: sin
          // esto, una conversación nueva nacía con «Default Model» o con el
          // último modelo que se hubiera podido elegir antes de ocultarlo.
          selectedModel = { name: fijado.model, provider: fijado.provider, modelId: fijado.model }
        } else {
          try {
            const stored = localStorage.getItem('selectedModel')
            if (stored) {
              selectedModel = JSON.parse(stored)
            }
          } catch {
            logger.warn('Failed to load selected model from localStorage')
          }
        }

        const newConversation: Conversation = {
          id: crypto.randomUUID(),
          title: i18n.t('chat.newConversation'),
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

        // Aviso de discrepancia con el proyecto activo (#31). Se hace aquí y no
        // en los componentes porque hay cinco sitios que abren conversaciones;
        // repartir la comprobación entre ellos es lo que produjo el problema.
        // El import es dinámico para no crear dependencia circular entre stores.
        const projectId = get().conversations.find(c => c.id === id)?.projectId
        import('./projectStore')
          .then(({ useProjectStore }) => {
            useProjectStore.getState().notifyConversationOpened(id, projectId)
          })
          .catch(error => logger.error('No se pudo comprobar el proyecto de la conversación:', error))
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
          logger.error('Failed to save message to database:', error)
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
          logger.error('Failed to delete conversation:', error)
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

        // Global timeout for the entire flow (RAG + AI response): 8 minutes.
        // Generous because small local models (nemotron-mini, llama3.2) can do
        // chain-of-thought reasoning before the first visible token. The user
        // still sees progress via setStreamingMessage on every chunk.
        // Eran 5 minutos, que no daban para las dos fases: con el presupuesto de
        // fuentes en 3 minutos y una respuesta que en local tarda otros 2, el
        // límite global cortaba justo lo que se acababa de arreglar (#63).
        const GLOBAL_TIMEOUT_MS = 480000
        const globalTimeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('GLOBAL_TIMEOUT')), GLOBAL_TIMEOUT_MS)
        )

        try {
          // Wrap the entire pipeline in a global timeout
          await Promise.race([globalTimeout, (async () => {
            /**
             * De qué proyecto es esta conversación, con el mismo criterio que
             * el contexto de red (#31, #34): el suyo o, si es un chat general,
             * el proyecto activo. Se calcula antes del RAG porque decide el
             * ámbito de la búsqueda: sin él, el agente no ve lo indexado del
             * proyecto —incluidas sus simulaciones (#41)— y sí podría citar
             * documentos de otro (#39).
             */
            const conversacionActual = get().conversations.find(c => c.id === conversationId)
            const proyectoActivo = conversacionActual?.projectId
              ? null
              : await import('./projectStore')
                  .then(({ useProjectStore }) => useProjectStore.getState().currentProjectId)
                  .catch(() => null)
            const proyectoDeLaConversacion = conversacionActual?.projectId ?? proyectoActivo ?? null

            // Enhance prompt with RAG if enabled
            let enhancedPrompt = content
            let ragSources: any[] = []
            try {
              /**
               * Cuánto se espera a las fuentes (#63).
               *
               * Eran 30 s, y ninguna consulta cabía: medido en una máquina sin
               * GPU utilizable, una consulta entera tardaba 7 min 23 s, así que
               * la carrera la ganaba siempre el reloj y el chat contestaba sin
               * una sola fuente aunque el proyecto las tuviera indexadas. Con el
               * graduado en tres documentos y sin redactar la respuesta que aquí
               * se tira, la recuperación baja a unos dos minutos y este
               * presupuesto ya se puede cumplir. Y la carrera no cancela nada:
               * pasarse de largo no ahorra trabajo, sólo desperdicia el hecho.
               */
              const PRESUPUESTO_FUENTES_MS = 180000
              const ragTimeout = new Promise<{ enhancedPrompt: string; sources?: any[] }>((resolve) =>
                setTimeout(() => {
                  logger.warn('RAG enhancement timed out, using original prompt')
                  resolve({ enhancedPrompt: content })
                }, PRESUPUESTO_FUENTES_MS)
              )
              const ragResult = await Promise.race([
                get().enhancePromptWithRAG(content, proyectoDeLaConversacion),
                ragTimeout
              ])
              enhancedPrompt = ragResult.enhancedPrompt
              ragSources = ragResult.sources || []
            } catch (error) {
              logger.warn('Failed to enhance prompt with RAG, using original:', error)
            }

            const conversation = get().conversations.find(c => c.id === conversationId)
            if (!conversation) throw new Error('Conversation not found')

            /**
             * Con qué modelo se responde (#49).
             *
             * No lo elige el usuario: con el desplegable oculto responde el
             * principal de la ruta del RAG. Se resuelve aquí y no al crear la
             * conversación porque las que ya existían se guardaron con el modelo
             * que hubiera elegido entonces —incluido uno que no es Nemotron— y
             * seguirían usándolo para siempre.
             */
            await cargarModelosRAG()
            const fijado = modeloFijadoRAG()
            const modelo = fijado?.model ?? conversation.model
            const proveedor = fijado?.provider ?? conversation.provider

            // Y se deja escrito en la conversación, que es lo que se ve al
            // volver a abrirla y lo que se guarda en la base.
            if (fijado && (conversation.model !== modelo || conversation.provider !== proveedor)) {
              get().updateConversationModel(conversationId, modelo, proveedor)
            }

            // El contexto sale del proyecto de la conversación o, si no tiene,
            // del proyecto activo global (#31). Antes se exigía el enlace
            // explícito, así que un chat «General» no recibía nada aunque
            // hubiera una red cargada delante (#34). Es el mismo proyecto que
            // fijó el ámbito del RAG unas líneas más arriba.
            const proyectoParaContexto = proyectoDeLaConversacion ?? undefined

            // El contexto de red se inyecta SIEMPRE, haya proyecto o no. Si se
            // omitiera al no haber proyecto, el modelo se quedaría sin la
            // instrucción de no describir ninguna red, y responder con
            // generalidades pasaría a depender de la disposición del modelo de
            // turno en lugar del prompt. Con llama3.2 la respuesta era pedir
            // más datos, pero incluía un «Ejemplo» con cifras inventadas.
            let hayRedEnContexto = false
            try {
              const red = await window.electronAPI.networkRepository.context(
                proyectoParaContexto ?? '',
                proveedor
              )
              if (red?.success && red.data?.texto) {
                enhancedPrompt = red.data.texto + enhancedPrompt
              }
              hayRedEnContexto = !!red?.data?.resumen
            } catch (error) {
              logger.warn('Failed to build network context:', error)
            }

            if (proyectoParaContexto) {
              try {
                const projectContextTimeout = new Promise<string>((resolve) =>
                  setTimeout(() => resolve(''), 10000)
                )
                const projectContext = await Promise.race([
                  get().buildProjectContext(proyectoParaContexto),
                  projectContextTimeout
                ])
                if (projectContext) {
                  enhancedPrompt = projectContext + enhancedPrompt
                }
              } catch (error) {
                logger.warn('Failed to attach project context, continuing without it:', error)
              }
            }

            // Clear any previous streaming message
            get().clearStreamingMessage()

            // Get API key for the provider
            const aiConfigStore = useAIConfigStore.getState()
            const providerConfig = aiConfigStore.providers.find(p => p.name === proveedor)
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

            // Ollama va por streaming salvo cuando hay red que consultar: las
            // herramientas necesitan varias vueltas de peticion y respuesta, y
            // eso vive en el handler IPC. Se cambia respuesta token a token por
            // respuesta con datos de la red, que es el objeto de #34.
            const isOllama = proveedor.toLowerCase() === 'ollama' && !hayRedEnContexto

            for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
              try {
                if (attempt > 0) {
                  await new Promise(resolve => setTimeout(resolve, 2000 * attempt))
                }

                let result: any

                if (isOllama) {
                  // Use direct streaming Ollama call so tokens appear in the
                  // UI as they arrive (setStreamingMessage on each chunk).
                  // Avoids the IPC chat handler's blocking 90s wait.
                  try {
                    const r = await get().callOllamaAPI(
                      modelo,
                      enhancedPrompt,
                      conversation.messages, // history (without the user msg added below — it's already inside)
                    )
                    result = { success: true, data: { response: r.response, metadata: r.metadata } }
                  } catch (e: any) {
                    result = { success: false, error: e?.message || 'Ollama streaming failed' }
                  }
                } else {
                  result = await window.electronAPI.chat.sendMessage({
                    provider: proveedor,
                    model: modelo,
                    messages: messages,
                    apiKey: apiKey,

                    // Con proyecto el agente puede consultar la red por
                    // herramientas, en vez de quedarse en el resumen (#34).
                    projectId: proyectoParaContexto,

                    // La pregunta sin el contexto inyectado, para reconocer si
                    // pide un escenario (#44): buscar ids de elementos en el
                    // prompt enriquecido encuentra los del resumen de la red.
                    preguntaOriginal: content
                  })
                }

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
                  model: modelo,
                  provider: proveedor,
                  tokens: 0
                }

                // Que respondiera el auxiliar no puede quedar sólo en el log:
                // las respuestas salen más cortas y menos cuidadas, y el
                // usuario no tiene ninguna otra forma de saberlo (#49).
                if (modelosRAGEnCache()?.degradado) {
                  metadata.modeloDegradado = true
                }

                // Clear streaming message before adding final message
                get().clearStreamingMessage()

                // ragEnabled reflects whether RAG actually found and injected
                // context — not just whether the feature toggle is on — so the
                // UI badge never contradicts what the model was actually given.
                if (state.wisdomConfig?.enabled) {
                  metadata.ragAttempted = true
                  metadata.ragEnabled = ragSources.length > 0
                  metadata.sources = ragSources
                  metadata.originalQuery = content
                  metadata.enhancedQuery = enhancedPrompt !== content
                } else {
                  metadata.ragAttempted = false
                  metadata.ragEnabled = false
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
          logger.error('Failed to get AI response:', error)
          get().clearStreamingMessage()

          // Show specific error message instead of generic one
          const errorMessage = error instanceof Error ? error.message : String(error)
          let userFacingMessage: string

          if (errorMessage === 'GLOBAL_TIMEOUT') {
            userFacingMessage = '**La solicitud tardó demasiado.** El sistema no pudo completar la operación en el tiempo límite (8 minutos).\n\n' +
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
          logger.error('Failed to save conversation to database:', error)
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
          logger.error('Failed to load conversations from database:', error)
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
              for (;;) {
                const { done, value } = await reader.read()
                if (done) break

                const chunk = decoder.decode(value)
                const lines = chunk.split('\n').filter(line => line.trim())

                for (const line of lines) {
                  try {
                    const data = JSON.parse(line)

                    // Reasoning models (e.g. nemotron-3-nano) emit `thinking`
                    // chunks with an empty `content`. Surface them so the user
                    // sees progress instead of a blank screen during CoT.
                    const thinkingChunk = data.message?.thinking as string | undefined
                    const contentChunk = data.message?.content as string | undefined

                    if (thinkingChunk) {
                      // Visually mark thinking text so we can hide it later if desired.
                      // We accumulate it as part of the streaming buffer; it disappears
                      // once the final assistant message is committed.
                      get().setStreamingMessage(
                        (fullResponse ? fullResponse + '\n\n' : '') +
                          '_💭 ' + thinkingChunk.replace(/\n+/g, ' ').trim() + '_'
                      )
                    }
                    if (contentChunk) {
                      fullResponse += contentChunk
                      get().setStreamingMessage(fullResponse)
                    }
                    if (data.eval_count) {
                      totalTokens = data.eval_count
                    }
                  } catch (e) {
                    logger.warn('Failed to parse streaming line:', line, e)
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
          logger.error('Ollama API call failed:', error)
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
          logger.error(`${provider} API call failed:`, error)
          throw new Error(`Failed to connect to ${provider}: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
      },

      // Wisdom/RAG methods
      setWisdomConfig: (config: WisdomConfiguration | undefined) => {
        set({ wisdomConfig: config })
      },

      enhancePromptWithRAG: async (
        originalPrompt: string,
        projectId?: string | null
      ): Promise<{ enhancedPrompt: string; sources?: any[] }> => {
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
            technicalLevel: 'intermediate',
            // Con proyecto se busca en los dos ámbitos: la normativa general y
            // lo interno del proyecto, que incluye lo indexado de sus
            // simulaciones (#41). Sin proyecto, sólo lo general (#39).
            projectId: projectId ?? null,
            ambito: projectId ? 'ambos' : 'general',
            // Aquí sólo se usan las fuentes; la respuesta del RAG se tiraba
            // después de costar tres minutos de modelo (#63).
            soloRecuperacion: true
          })

          // `sources` is always returned as an array (possibly empty) once we've
          // actually queried the RAG system, so callers can tell "attempted, no
          // matches" apart from "not attempted at all" — undefined means the
          // query itself never went out. Previously ragEnabled/ragAttempted were
          // derived from comparing prompt text, which was true just from the
          // generic system_prompt prefix even when sources was empty, causing
          // the UI to show "RAG Habilitado" with zero actual retrieval (#19/#20).
          if (!ragResult.success || !ragResult.data) {
            return { enhancedPrompt: originalPrompt, sources: [] }
          }

          const sources = ragResult.data.sources || []

          // Build enhanced prompt with context
          let enhancedPrompt = ''

          // Add system prompt if available
          if (systemPrompt) {
            enhancedPrompt += `${systemPrompt}\n\n`
          }

          // Add RAG context
          if (sources.length > 0) {
            enhancedPrompt += '=== CONTEXT FROM HYDRAULIC ENGINEERING KNOWLEDGE ===\n\n'

            sources.forEach((source: any, index: number) => {
              enhancedPrompt += `[Source ${index + 1}]: ${source.title}\n`
              enhancedPrompt += `${source.content}\n\n`
            })

            enhancedPrompt += '=== END CONTEXT ===\n\n'
            enhancedPrompt += 'Based on the above hydraulic engineering context, please answer the following question:\n\n'
          } else {
            // No matches: tell the model explicitly instead of letting it guess
            // (previously it would deny having any RAG access at all, contradicting
            // the "RAG Habilitado" badge shown from the enabled toggle).
            enhancedPrompt += 'No se encontró información relevante en los documentos indexados del RAG para esta consulta. Indícaselo claramente al usuario en vez de afirmar que no tienes acceso a ningún sistema RAG.\n\n'
          }

          enhancedPrompt += originalPrompt

          return { enhancedPrompt: enhancedPrompt, sources }

        } catch (error) {
          logger.error('Failed to enhance prompt with RAG:', error)
          return { enhancedPrompt: originalPrompt, sources: [] }
        }
      },

      buildProjectContext: async (projectId: string): Promise<string> => {
        try {
          const result = await window.electronAPI.hydraulic.getProject(projectId)
          if (!result.success || !result.data) {
            return ''
          }

          const project = result.data
          let context = '=== HYDRAULIC PROJECT CONTEXT ===\n\n'
          context += `Project: ${project.name}\n`
          if (project.description) context += `Description: ${project.description}\n`
          if (project.type) context += `Type: ${project.type}\n`
          if (project.status) context += `Status: ${project.status}\n`
          if (project.location?.country || project.location?.region) {
            context += `Location: ${[project.location?.city, project.location?.region, project.location?.country].filter(Boolean).join(', ')}\n`
          }

          if (project.calculations && project.calculations.length > 0) {
            context += `\nCalculations performed on this project (${project.calculations.length}):\n`
            project.calculations.slice(0, 10).forEach((calc: any) => {
              context += `- ${calc.name} (${calc.type})${calc.verified ? ' [verified]' : ''}\n`
            })
          }

          context += '\n=== END PROJECT CONTEXT ===\n\n'
          context += 'Utiliza el contexto del proyecto anterior cuando sea relevante para responder la consulta del usuario.\n\n'

          return context
        } catch (error) {
          logger.warn('Failed to build project context:', error)
          return ''
        }
      }
    }),
    { name: 'chat-store' }
  )
)