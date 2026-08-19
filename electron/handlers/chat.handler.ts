// Chat Handler - IPC handlers for chat and AI provider API calls
import { ipcMain } from 'electron'
import { createLogger } from '../../backend/utils/logger'
import { DatabaseService } from '../../backend/services'
import { HERRAMIENTAS, ejecutarHerramienta, type RedCompleta } from '../../backend/services/hydraulic/agentTools'
import { leerRedActiva } from '../../backend/services/hydraulic/redActiva'
import {
  esErrorDeHerramientas,
  herramientasAnthropic,
  herramientasOpenAI,
  llamadasDesdeAnthropic,
  llamadasDesdeOpenAI,
  llamadasDesdeOllama,
  proveedorSoportaHerramientas,
  mensajeResultadosAnthropic,
  mensajesResultadosOpenAI,
  textoDesdeAnthropic,
  type LlamadaHerramienta,
} from '../../backend/services/ai/toolWire'
// Import types
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface ChatResponse {
  response: string
  metadata: any
}

export interface ChatProvider {
  name: string
  supportsStreaming: boolean
  sendMessage(
    model: string,
    messages: ChatMessage[],
    apiKey: string,
    onStream?: (chunk: string) => void
  ): Promise<ChatResponse>
}

const logger = createLogger('ChatHandler')

export interface SendChatMessageParams {
  provider: string
  model: string
  messages: ChatMessage[]
  apiKey: string
  stream?: boolean
  /** Proyecto cuya red activa puede consultar el agente con herramientas (#34). */
  projectId?: string
}

/**
 * Tope de vueltas del bucle de herramientas. Cuatro dan de sobra para el uso
 * previsto (mirar un nudo, mirar sus tramos, responder) y acotan tanto el gasto
 * como el caso del modelo que se queda pidiendo herramientas sin concluir.
 */
const MAX_VUELTAS_HERRAMIENTAS = 4

/**
 * Un modelo local tarda lo suyo, y con herramientas cada respuesta cuesta dos
 * inferencias completas en vez de una. Con los 120 s de siempre, llama3.1:8b
 * sobre Net3 se pasaba de largo en la primera vuelta y el chat mostraba «The
 * operation was aborted due to timeout». El margen ancho solo se aplica cuando
 * hay herramientas: sin ellas, el limite corto sigue siendo el aviso util de
 * que Ollama no responde.
 */
const TIMEOUT_OLLAMA_MS = 120000
const TIMEOUT_OLLAMA_HERRAMIENTAS_MS = 300000

export interface IPCChatResponse {
  success: boolean
  data?: {
    response: string
    metadata: any
  }
  error?: string
}

export class ChatHandler {
  private databaseService: DatabaseService

  constructor(databaseService: DatabaseService) {
    this.databaseService = databaseService
    this.registerHandlers()
    logger.info('Chat handler initialized')
  }

  private registerHandlers(): void {
    // Handler for sending chat messages through backend
    ipcMain.handle('chat:send-message', async (event, params: SendChatMessageParams) => {
      try {
        logger.debug('IPC: Sending chat message', {
          provider: params.provider,
          model: params.model,
          messageCount: params.messages.length
        })

        const result = await this.sendChatMessage(params)

        logger.success('IPC: Chat message sent successfully', {
          provider: params.provider,
          model: params.model
        })

        return result
      } catch (error) {
        logger.error('IPC: Failed to send chat message', error as Error, {
          provider: params.provider,
          model: params.model
        })

        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        } as IPCChatResponse
      }
    })

    logger.success('Chat IPC handlers registered successfully')
  }

  private async sendChatMessage(params: SendChatMessageParams): Promise<IPCChatResponse> {
    const { provider, model, messages, apiKey, projectId } = params

    try {
      // Get system prompt from database and add it to messages if not already present
      logger.info('Processing chat message', { provider, model, messageCount: messages.length })
      const messagesWithSystemPrompt = await this.addSystemPrompt(messages)
      logger.info('Messages after system prompt processing', { messageCount: messagesWithSystemPrompt.length })

      // La red solo se carga si el proveedor sabe usar herramientas, con la
      // misma funcion que consulta `network-repo:context` para redactar el
      // prompt. Asi el texto que promete la consulta y el codigo que la ofrece
      // no pueden decir cosas distintas.
      const red = proveedorSoportaHerramientas(provider)
        ? await this.cargarRedActiva(projectId)
        : null

      let result: ChatResponse

      switch (provider.toLowerCase()) {
        case 'anthropic':
          result = await this.sendAnthropicMessage(model, messagesWithSystemPrompt, apiKey, red)
          break
        case 'openai':
          result = await this.sendOpenAIMessage(model, messagesWithSystemPrompt, apiKey, red)
          break
        case 'google':
          result = await this.sendGoogleMessage(model, messagesWithSystemPrompt, apiKey)
          break
        case 'openrouter':
          result = await this.sendOpenRouterMessage(model, messagesWithSystemPrompt, apiKey, red)
          break
        case 'ollama':
          result = await this.sendOllamaMessage(model, messagesWithSystemPrompt, apiKey || '', red)
          break
        case 'nvidia':
          result = await this.sendNvidiaMessage(model, messagesWithSystemPrompt, apiKey, red)
          break
        default:
          throw new Error(`Unsupported chat provider: ${provider}`)
      }

      return {
        success: true,
        data: {
          response: result.response,
          metadata: result.metadata
        }
      }
    } catch (error) {
      logger.error('Chat message failed', error as Error, { provider, model })

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * La red que el agente puede consultar. Sin proyecto no hay red, y entonces
   * no se ofrecen herramientas: el prompt de chat general ya le dice que no
   * hable de redes que no tiene delante.
   */
  private async cargarRedActiva(projectId?: string): Promise<RedCompleta | null> {
    if (!projectId) return null
    try {
      const red = await leerRedActiva(this.databaseService.prisma, projectId)
      return red ? red.datos : null
    } catch (error) {
      // Quedarse sin herramientas degrada la respuesta; tumbar el mensaje del
      // usuario por no poder leer la red seria peor.
      logger.warn('No se pudo cargar la red activa para las herramientas', { error: (error as Error).message })
      return null
    }
  }

  private ejecutarLlamadas(llamadas: LlamadaHerramienta[], red: RedCompleta) {
    return llamadas.map(llamada => {
      logger.debug('Herramienta solicitada por el agente', { nombre: llamada.nombre, argumentos: llamada.argumentos })
      try {
        return { llamada, salida: ejecutarHerramienta(llamada.nombre, llamada.argumentos, red) }
      } catch (error) {
        // El error se le devuelve al modelo como resultado, no se lanza: puede
        // reformular la llamada o explicar que no ha podido consultarlo.
        return { llamada, salida: { error: (error as Error).message } }
      }
    })
  }

  private async addSystemPrompt(messages: ChatMessage[]): Promise<ChatMessage[]> {
    try {
      // Check if there's already a system message
      const hasSystemMessage = messages.some(msg => msg.role === 'system')
      if (hasSystemMessage) {
        logger.info('System message already present in conversation')
        return messages
      }

      // Get system prompt from database
      const systemPromptSetting = await this.databaseService.prisma.appSetting.findUnique({
        where: { key: 'system_prompt' }
      })

      if (systemPromptSetting && systemPromptSetting.value.trim()) {
        logger.info('Adding system prompt to conversation', { promptLength: systemPromptSetting.value.length })
        // Add system prompt as first message
        return [
          { role: 'system', content: systemPromptSetting.value },
          ...messages
        ]
      } else {
        logger.warn('No system prompt found in database')
      }

      return messages
    } catch (error) {
      logger.warn('Failed to load system prompt, proceeding without it', error as Error)
      return messages
    }
  }

  private async sendAnthropicMessage(
    model: string,
    messages: ChatMessage[],
    apiKey: string,
    red?: RedCompleta | null
  ): Promise<ChatResponse> {
    // Convert messages to Anthropic format
    const historial: any[] = this.convertToAnthropicFormat(messages)

    let usarHerramientas = !!red
    let vueltas = 0
    let entrada = 0
    let salida = 0
    let ultima: any = null

    for (;;) {
      const requestBody: any = {
        model: model,
        max_tokens: 4000,
        messages: historial,
        stream: false,
      }
      if (usarHerramientas) requestBody.tools = herramientasAnthropic(HERRAMIENTAS)

      logger.debug('Anthropic API Request via backend', {
        model,
        messagesCount: historial.length,
        herramientas: usarHerramientas,
      })

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(90000) // 90 second timeout (allows for RAG-enhanced prompts)
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as any
        const errorMessage = errorData.error?.message || 'Unknown error'

        // Reintento sin herramientas antes de dar el error por bueno: el modelo
        // puede no soportarlas, y una respuesta sin datos de red es mejor que
        // un error en la cara del usuario.
        if (usarHerramientas && esErrorDeHerramientas(response.status, errorMessage)) {
          logger.warn('Anthropic rechaza las herramientas, se reintenta sin ellas', { model, errorMessage })
          usarHerramientas = false
          continue
        }

        this.lanzarErrorAnthropic(response.status, errorMessage, model)
      }

      const data = await response.json() as any
      ultima = data
      entrada += data.usage?.input_tokens || 0
      salida += data.usage?.output_tokens || 0

      const llamadas = usarHerramientas ? llamadasDesdeAnthropic(data) : []
      if (llamadas.length === 0) break

      historial.push({ role: 'assistant', content: data.content })
      historial.push(mensajeResultadosAnthropic(this.ejecutarLlamadas(llamadas, red!)))

      // Al agotar las vueltas no se corta en seco: se responden las llamadas
      // pendientes (Anthropic exige un tool_result por cada tool_use) y se pide
      // la respuesta final ya sin herramientas.
      if (++vueltas >= MAX_VUELTAS_HERRAMIENTAS) {
        logger.warn('Tope de vueltas de herramientas alcanzado', { model, vueltas })
        usarHerramientas = false
      }
    }

    return {
      response: textoDesdeAnthropic(ultima) || 'No response from Anthropic',
      metadata: {
        model: model,
        provider: 'Anthropic',
        tokens: entrada + salida,
        usage: {
          prompt_tokens: entrada,
          completion_tokens: salida,
          total_tokens: entrada + salida,
        },
        finish_reason: ultima?.stop_reason,
        vueltas_herramientas: vueltas,
        created_at: new Date().toISOString(),
      }
    }
  }

  private lanzarErrorAnthropic(status: number, errorMessage: string, model: string): never {
    // Provide specific error messages based on status code
    switch (status) {
      case 400:
        if (errorMessage.toLowerCase().includes('credit') || errorMessage.toLowerCase().includes('billing') || errorMessage.toLowerCase().includes('balance')) {
          throw new Error('\u{1F4B3} Insufficient Anthropic credits. Please go to Plans & Billing in your Anthropic account to add credits or upgrade your plan.')
        }
        throw new Error(`Bad request to Anthropic: ${errorMessage}`)

      case 401:
        throw new Error('\u{1F511} Invalid Anthropic API key. Please check your API key in settings.')

      case 403:
        if (errorMessage.toLowerCase().includes('credit') || errorMessage.toLowerCase().includes('billing') || errorMessage.toLowerCase().includes('balance')) {
          throw new Error('\u{1F4B3} Insufficient Anthropic credits. Please go to Plans & Billing in your Anthropic account to add credits or upgrade your plan.')
        }
        throw new Error('\u{1F6AB} Access denied to Anthropic API. Please check your account permissions.')

      case 404:
        throw new Error(`Anthropic model "${model}" not found. Please select a different model.`)

      case 429:
        throw new Error('Too many requests to Anthropic. Please try again later.')

      case 500:
      case 502:
      case 503:
      case 504:
        throw new Error('Anthropic API is temporarily unavailable. Please try again in a few moments.')

      default:
        throw new Error(`Anthropic API error (${status}): ${errorMessage}`)
    }
  }

  private convertToAnthropicFormat(messages: ChatMessage[]) {
    // Anthropic expects alternating user/assistant messages
    // System messages should be handled separately
    const converted = []
    let systemMessage = ''

    for (const message of messages) {
      if (message.role === 'system') {
        systemMessage += message.content + '\n'
      } else {
        converted.push({
          role: message.role,
          content: message.content,
        })
      }
    }

    // If we have system messages, prepend to first user message
    if (systemMessage && converted.length > 0 && converted[0].role === 'user') {
      converted[0].content = systemMessage.trim() + '\n\n' + converted[0].content
    }

    return converted
  }

  /**
   * Nucleo compartido por OpenAI, OpenRouter y NVIDIA: los tres exponen
   * /chat/completions y hablan el mismo dialecto de herramientas. Solo cambian
   * la URL, las cabeceras, algun parametro del cuerpo y como nombran los
   * errores, asi que eso es lo que entra por configuracion.
   */
  private async enviarOpenAICompat(
    cfg: {
      url: string
      proveedor: string
      cabeceras: Record<string, string>
      cuerpoExtra: Record<string, unknown>
      timeout: number
      extraerError: (errorData: any, status: number) => string
      lanzarError: (status: number, errorMessage: string) => never
      modeloDeLaRespuesta: boolean
    },
    model: string,
    messages: ChatMessage[],
    red?: RedCompleta | null
  ): Promise<ChatResponse> {
    const historial: any[] = [...messages]

    let usarHerramientas = !!red
    let vueltas = 0
    let ultima: any = null
    let tokens = 0

    for (;;) {
      const requestBody: any = {
        model: model,
        messages: historial,
        stream: false,
        ...cfg.cuerpoExtra,
      }
      if (usarHerramientas) requestBody.tools = herramientasOpenAI(HERRAMIENTAS)

      logger.debug(`${cfg.proveedor} API Request via backend`, {
        model,
        messagesCount: historial.length,
        herramientas: usarHerramientas,
      })

      const response = await fetch(cfg.url, {
        method: 'POST',
        headers: cfg.cabeceras,
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(cfg.timeout)
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as any
        const errorMessage = cfg.extraerError(errorData, response.status)

        // Ni OpenRouter ni NVIDIA garantizan herramientas en todos los modelos
        // que sirven, y una lista de cuales las soportan envejeceria mal: se
        // detecta el rechazo y se reintenta sin ellas.
        if (usarHerramientas && esErrorDeHerramientas(response.status, errorMessage)) {
          logger.warn(`${cfg.proveedor} rechaza las herramientas, se reintenta sin ellas`, { model, errorMessage })
          usarHerramientas = false
          continue
        }

        cfg.lanzarError(response.status, errorMessage)
      }

      const data = await response.json() as any
      ultima = data
      tokens += data.usage?.total_tokens || 0

      const llamadas = usarHerramientas ? llamadasDesdeOpenAI(data) : []
      if (llamadas.length === 0) break

      historial.push(data.choices[0].message)
      historial.push(...mensajesResultadosOpenAI(this.ejecutarLlamadas(llamadas, red!)))

      if (++vueltas >= MAX_VUELTAS_HERRAMIENTAS) {
        logger.warn('Tope de vueltas de herramientas alcanzado', { model, vueltas })
        usarHerramientas = false
      }
    }

    return {
      response: ultima?.choices?.[0]?.message?.content || `No response from ${cfg.proveedor}`,
      metadata: {
        model: cfg.modeloDeLaRespuesta ? (ultima?.model || model) : model,
        provider: cfg.proveedor,
        tokens: tokens,
        usage: ultima?.usage || {},
        finish_reason: ultima?.choices?.[0]?.finish_reason,
        vueltas_herramientas: vueltas,
        created_at: ultima?.created ? new Date(ultima.created * 1000).toISOString() : new Date().toISOString(),
      }
    }
  }

  private async sendOpenAIMessage(
    model: string,
    messages: ChatMessage[],
    apiKey: string,
    red?: RedCompleta | null
  ): Promise<ChatResponse> {
    return this.enviarOpenAICompat({
      url: 'https://api.openai.com/v1/chat/completions',
      proveedor: 'OpenAI',
      cabeceras: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      cuerpoExtra: { max_tokens: 4000, temperature: 0.7 },
      timeout: 90000, // 90 second timeout (allows for RAG-enhanced prompts)
      modeloDeLaRespuesta: false,
      extraerError: (errorData) => errorData.error?.message || 'Unknown error',
      lanzarError: (status, errorMessage) => {
        switch (status) {
          case 401:
            throw new Error('\u{1F511} Invalid OpenAI API key. Please check your API key in settings.')
          case 403:
            throw new Error('\u{1F6AB} Access denied to OpenAI API. Please check your account permissions.')
          case 429:
            if (errorMessage.toLowerCase().includes('quota') || errorMessage.toLowerCase().includes('billing')) {
              throw new Error('\u{1F4B3} OpenAI quota exceeded. Please check your billing and usage limits.')
            }
            throw new Error('Too many requests to OpenAI. Please try again later.')
          case 500:
          case 502:
          case 503:
          case 504:
            throw new Error('OpenAI API is temporarily unavailable. Please try again in a few moments.')
          default:
            throw new Error(`OpenAI API error (${status}): ${errorMessage}`)
        }
      },
    }, model, messages, red)
  }

  private async sendGoogleMessage(model: string, messages: ChatMessage[], apiKey: string): Promise<ChatResponse> {
    // Convert messages to Google AI format
    const googleMessages = this.convertToGoogleFormat(messages)

    const requestBody = {
      contents: googleMessages.contents,
      systemInstruction: googleMessages.systemInstruction,
      generationConfig: {
        maxOutputTokens: 4000,
        temperature: 0.7,
      },
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`

    logger.debug('Google AI API Request via backend', { model, messagesCount: googleMessages.contents.length })

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(90000) // 90 second timeout (allows for RAG-enhanced prompts)
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as any
      const errorMessage = errorData.error?.message || 'Unknown error'

      switch (response.status) {
        case 400:
          throw new Error(`Bad request to Google AI: ${errorMessage}`)
        case 401:
        case 403:
          throw new Error('🔑 Invalid Google AI API key. Please check your API key in settings.')
        case 429:
          throw new Error('Too many requests to Google AI. Please try again later.')
        case 500:
        case 502:
        case 503:
        case 504:
          throw new Error('Google AI API is temporarily unavailable. Please try again in a few moments.')
        default:
          throw new Error(`Google AI API error (${response.status}): ${errorMessage}`)
      }
    }

    const data = await response.json() as any
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response from Google AI'
    const usageMetadata = data.usageMetadata || {}

    return {
      response: content,
      metadata: {
        model: model,
        provider: 'Google AI',
        tokens: usageMetadata.totalTokenCount || 0,
        usage: {
          prompt_tokens: usageMetadata.promptTokenCount || 0,
          completion_tokens: usageMetadata.candidatesTokenCount || 0,
          total_tokens: usageMetadata.totalTokenCount || 0,
        },
        finish_reason: data.candidates?.[0]?.finishReason,
        created_at: new Date().toISOString(),
      }
    }
  }

  private convertToGoogleFormat(messages: ChatMessage[]) {
    const contents = []
    let systemInstruction = null

    for (const message of messages) {
      if (message.role === 'system') {
        systemInstruction = {
          parts: [{ text: message.content }]
        }
      } else {
        contents.push({
          role: message.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: message.content }]
        })
      }
    }

    return { contents, systemInstruction }
  }

  private async sendOpenRouterMessage(
    model: string,
    messages: ChatMessage[],
    apiKey: string,
    red?: RedCompleta | null
  ): Promise<ChatResponse> {
    return this.enviarOpenAICompat({
      url: 'https://openrouter.ai/api/v1/chat/completions',
      proveedor: 'OpenRouter',
      cabeceras: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://boorie.app', // Required by OpenRouter
        'X-Title': 'Boorie', // Required by OpenRouter
      },
      // OpenRouter specific parameters
      cuerpoExtra: { max_tokens: 4000, temperature: 0.7, top_p: 1, frequency_penalty: 0, presence_penalty: 0 },
      timeout: 90000, // 90 second timeout (allows for RAG-enhanced prompts)
      modeloDeLaRespuesta: true,
      extraerError: (errorData) => errorData.error?.message || 'Unknown error',
      lanzarError: (status, errorMessage) => {
        switch (status) {
          case 401:
            throw new Error('\u{1F511} Invalid OpenRouter API key. Please check your API key in settings.')
          case 402:
            throw new Error('\u{1F4B3} Insufficient OpenRouter credits. Please add credits to your OpenRouter account.')
          case 403:
            throw new Error('\u{1F6AB} Access denied to OpenRouter API. Please check your account permissions.')
          case 429:
            throw new Error('Too many requests to OpenRouter. Please try again later.')
          case 500:
          case 502:
          case 503:
          case 504:
            throw new Error('OpenRouter API is temporarily unavailable. Please try again in a few moments.')
          default:
            throw new Error(`OpenRouter API error (${status}): ${errorMessage}`)
        }
      },
    }, model, messages, red)
  }

  private async sendOllamaMessage(
    model: string,
    messages: ChatMessage[],
    _apiKey: string,
    red?: RedCompleta | null
  ): Promise<ChatResponse> {
    // Get Ollama base URL from provider config
    const providers = await this.databaseService.prisma.aIProvider.findMany({
      where: { type: 'ollama', isActive: true }
    })
    const ollamaProvider = providers[0]
    const baseUrl = ollamaProvider?.config ? JSON.parse(ollamaProvider.config).baseUrl : 'http://127.0.0.1:11434'

    // Convert messages to Ollama format
    const historial: any[] = messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }))

    let usarHerramientas = !!red
    let vueltas = 0
    let entrada = 0
    let salida = 0
    let ultima: any = null

    try {
      for (;;) {
        const requestBody: any = {
          model: model,
          messages: historial,
          stream: false,
        }
        if (usarHerramientas) requestBody.tools = herramientasOpenAI(HERRAMIENTAS)

        logger.debug('Ollama API Request', {
          model,
          messagesCount: historial.length,
          baseUrl,
          herramientas: usarHerramientas,
        })

        const response = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(usarHerramientas ? TIMEOUT_OLLAMA_HERRAMIENTAS_MS : TIMEOUT_OLLAMA_MS)
        })

        if (!response.ok) {
          const errorData = await response.text()

          // Muchos modelos locales no traen plantilla de herramientas y Ollama
          // responde 400. Se reintenta sin ellas antes de dar error.
          if (usarHerramientas && esErrorDeHerramientas(response.status, errorData)) {
            logger.warn('Ollama rechaza las herramientas, se reintenta sin ellas', { model })
            usarHerramientas = false
            continue
          }

          logger.error('Ollama API error', new Error(errorData), { status: response.status })

          switch (response.status) {
            case 404:
              throw new Error(`Ollama model "${model}" not found. Please pull the model first: ollama pull ${model}`)
            case 500:
              throw new Error('Ollama internal error. Please check if Ollama is running.')
            default:
              throw new Error(`Ollama API error (${response.status}): ${errorData}`)
          }
        }

        const data = await response.json() as any
        ultima = data
        entrada += data.prompt_eval_count || 0
        salida += data.eval_count || 0

        const llamadas = usarHerramientas ? llamadasDesdeOllama(data) : []
        if (llamadas.length === 0) break

        historial.push(data.message)
        historial.push(...mensajesResultadosOpenAI(this.ejecutarLlamadas(llamadas, red!)))

        if (++vueltas >= MAX_VUELTAS_HERRAMIENTAS) {
          logger.warn('Tope de vueltas de herramientas alcanzado', { model, vueltas })
          usarHerramientas = false
        }
      }

      return {
        // Al pedir herramientas, nemotron devuelve content=" ": si se toma tal
        // cual, el chat ensena una respuesta en blanco.
        response: ultima?.message?.content?.trim() || 'No response from Ollama',
        metadata: {
          model: model,
          provider: 'Ollama',
          tokens: entrada + salida,
          usage: {
            prompt_tokens: entrada,
            completion_tokens: salida,
            total_tokens: entrada + salida,
          },
          vueltas_herramientas: vueltas,
          created_at: new Date().toISOString(),
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request to Ollama timed out. The model may be too large or slow.')
      }

      // Check if Ollama is running - check both FetchError cause and message content
      if (error instanceof Error) {
        const cause = (error as any).cause
        if ((cause && (cause.code === 'ECONNREFUSED' || cause.code === 'ETIMEDOUT')) ||
          error.message.includes('fetch failed') ||
          error.message.includes('ECONNREFUSED')) {
          throw new Error(`Cannot connect to Ollama at ${baseUrl}. Please verify:
1. Ollama is running on the server (ollama serve)
2. The URL ${baseUrl} is accessible
3. Check firewall settings if using a remote Ollama server
4. Verify the model "${model}" is available (ollama pull ${model})`)
        }
      }

      throw error
    }
  }

  private async sendNvidiaMessage(
    model: string,
    messages: ChatMessage[],
    apiKey: string,
    red?: RedCompleta | null
  ): Promise<ChatResponse> {
    return this.enviarOpenAICompat({
      url: 'https://integrate.api.nvidia.com/v1/chat/completions',
      proveedor: 'Nvidia',
      cabeceras: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
      },
      cuerpoExtra: { max_tokens: 4096, temperature: 0.5, top_p: 1 },
      timeout: 120000, // 120 second timeout for Nvidia
      modeloDeLaRespuesta: true,
      extraerError: (errorData, status) => errorData.detail || errorData.title || `Error ${status}`,
      lanzarError: (status, errorMessage) => {
        switch (status) {
          case 401:
            throw new Error('\u{1F511} Invalid Nvidia API key. Please check your API key in settings.')
          case 402:
            throw new Error('\u{1F4B3} Insufficient Nvidia credits.')
          case 403:
            throw new Error('\u{1F6AB} Access denied to Nvidia API. Please check your account permissions.')
          case 429:
            throw new Error('Too many requests to Nvidia. Please try again later.')
          default:
            throw new Error(`Nvidia API error (${status}): ${errorMessage}`)
        }
      },
    }, model, messages, red)
  }

  unregisterHandlers(): void {
    ipcMain.removeAllListeners('chat:send-message')
    logger.info('Chat IPC handlers unregistered')
  }
}