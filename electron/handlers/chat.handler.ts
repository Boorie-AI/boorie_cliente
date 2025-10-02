// Chat Handler - IPC handlers for chat and AI provider API calls
import { ipcMain } from 'electron'
import { createLogger } from '../../backend/utils/logger'
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
}

export interface IPCChatResponse {
  success: boolean
  data?: {
    response: string
    metadata: any
  }
  error?: string
}

export class ChatHandler {
  constructor() {
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
    const { provider, model, messages, apiKey, stream = false } = params

    try {
      let result: ChatResponse
      
      switch (provider.toLowerCase()) {
        case 'anthropic':
          result = await this.sendAnthropicMessage(model, messages, apiKey)
          break
        case 'openai':
          result = await this.sendOpenAIMessage(model, messages, apiKey)
          break
        case 'google':
          result = await this.sendGoogleMessage(model, messages, apiKey)
          break
        case 'openrouter':
          result = await this.sendOpenRouterMessage(model, messages, apiKey)
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

  private async sendAnthropicMessage(model: string, messages: ChatMessage[], apiKey: string): Promise<ChatResponse> {
    // Convert messages to Anthropic format
    const anthropicMessages = this.convertToAnthropicFormat(messages)

    const requestBody = {
      model: model,
      max_tokens: 4000,
      messages: anthropicMessages,
      stream: false,
    }

    logger.debug('Anthropic API Request via backend', { model, messagesCount: anthropicMessages.length })

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(30000) // 30 second timeout
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as any
      const errorMessage = errorData.error?.message || 'Unknown error'
      
      // Provide specific error messages based on status code
      switch (response.status) {
        case 400:
          if (errorMessage.toLowerCase().includes('credit') || errorMessage.toLowerCase().includes('billing') || errorMessage.toLowerCase().includes('balance')) {
            throw new Error('💳 Insufficient Anthropic credits. Please go to Plans & Billing in your Anthropic account to add credits or upgrade your plan.')
          }
          throw new Error(`Bad request to Anthropic: ${errorMessage}`)
        
        case 401:
          throw new Error('🔑 Invalid Anthropic API key. Please check your API key in settings.')
        
        case 403:
          if (errorMessage.toLowerCase().includes('credit') || errorMessage.toLowerCase().includes('billing') || errorMessage.toLowerCase().includes('balance')) {
            throw new Error('💳 Insufficient Anthropic credits. Please go to Plans & Billing in your Anthropic account to add credits or upgrade your plan.')
          }
          throw new Error('🚫 Access denied to Anthropic API. Please check your account permissions.')
        
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
          throw new Error(`Anthropic API error (${response.status}): ${errorMessage}`)
      }
    }

    const data = await response.json() as any
    
    return {
      response: data.content?.[0]?.text || 'No response from Anthropic',
      metadata: {
        model: model,
        provider: 'Anthropic',
        tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
        usage: {
          prompt_tokens: data.usage?.input_tokens || 0,
          completion_tokens: data.usage?.output_tokens || 0,
          total_tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
        },
        finish_reason: data.stop_reason,
        created_at: new Date().toISOString(),
      }
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

  private async sendOpenAIMessage(model: string, messages: ChatMessage[], apiKey: string): Promise<ChatResponse> {
    const requestBody = {
      model: model,
      messages: messages,
      stream: false,
      max_tokens: 4000,
      temperature: 0.7,
    }

    logger.debug('OpenAI API Request via backend', { model, messagesCount: messages.length })

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(30000) // 30 second timeout
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as any
      const errorMessage = errorData.error?.message || 'Unknown error'
      
      switch (response.status) {
        case 401:
          throw new Error('🔑 Invalid OpenAI API key. Please check your API key in settings.')
        case 403:
          throw new Error('🚫 Access denied to OpenAI API. Please check your account permissions.')
        case 429:
          if (errorMessage.toLowerCase().includes('quota') || errorMessage.toLowerCase().includes('billing')) {
            throw new Error('💳 OpenAI quota exceeded. Please check your billing and usage limits.')
          }
          throw new Error('Too many requests to OpenAI. Please try again later.')
        case 500:
        case 502:
        case 503:
        case 504:
          throw new Error('OpenAI API is temporarily unavailable. Please try again in a few moments.')
        default:
          throw new Error(`OpenAI API error (${response.status}): ${errorMessage}`)
      }
    }

    const data = await response.json() as any
    
    return {
      response: data.choices[0]?.message?.content || 'No response from OpenAI',
      metadata: {
        model: model,
        provider: 'OpenAI',
        tokens: data.usage?.total_tokens || 0,
        usage: data.usage || {},
        finish_reason: data.choices[0]?.finish_reason,
        created_at: new Date(data.created * 1000).toISOString(),
      }
    }
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
      signal: AbortSignal.timeout(30000) // 30 second timeout
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

  private async sendOpenRouterMessage(model: string, messages: ChatMessage[], apiKey: string): Promise<ChatResponse> {
    const requestBody = {
      model: model,
      messages: messages,
      stream: false,
      max_tokens: 4000,
      temperature: 0.7,
      // OpenRouter specific parameters
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
    }

    logger.debug('OpenRouter API Request via backend', { model, messagesCount: messages.length })

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://boorie.app', // Required by OpenRouter
        'X-Title': 'Boorie', // Required by OpenRouter
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(30000) // 30 second timeout
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as any
      const errorMessage = errorData.error?.message || 'Unknown error'
      
      switch (response.status) {
        case 401:
          throw new Error('🔑 Invalid OpenRouter API key. Please check your API key in settings.')
        case 402:
          throw new Error('💳 Insufficient OpenRouter credits. Please add credits to your OpenRouter account.')
        case 403:
          throw new Error('🚫 Access denied to OpenRouter API. Please check your account permissions.')
        case 429:
          throw new Error('Too many requests to OpenRouter. Please try again later.')
        case 500:
        case 502:
        case 503:
        case 504:
          throw new Error('OpenRouter API is temporarily unavailable. Please try again in a few moments.')
        default:
          throw new Error(`OpenRouter API error (${response.status}): ${errorMessage}`)
      }
    }

    const data = await response.json() as any
    
    return {
      response: data.choices[0]?.message?.content || 'No response from OpenRouter',
      metadata: {
        model: data.model || model,
        provider: 'OpenRouter',
        tokens: data.usage?.total_tokens || 0,
        usage: data.usage || {},
        finish_reason: data.choices[0]?.finish_reason,
        created_at: new Date(data.created * 1000).toISOString(),
      }
    }
  }

  unregisterHandlers(): void {
    ipcMain.removeAllListeners('chat:send-message')
    logger.info('Chat IPC handlers unregistered')
  }
}