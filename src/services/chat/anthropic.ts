import { ChatMessage, ChatResponse, ChatProvider } from './types'

export const anthropicProvider: ChatProvider = {
  name: 'Anthropic',
  supportsStreaming: true,

  async sendMessage(
    model: string,
    messages: ChatMessage[],
    apiKey: string,
    onStream?: (chunk: string) => void
  ): Promise<ChatResponse> {
    const isStreaming = !!onStream

    // Convert messages to Anthropic format
    const anthropicMessages = convertToAnthropicFormat(messages)

    const requestBody = {
      model: model,
      max_tokens: 4000,
      messages: anthropicMessages,
      stream: isStreaming,
    }

    console.log('Anthropic API Request:', { 
      model, 
      messagesCount: anthropicMessages.length, 
      stream: isStreaming,
      requestBody,
      apiKeyPresent: !!apiKey,
      apiKeyFormat: apiKey?.substring(0, 10) + '...'
    })

    let response: Response
    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(requestBody),
        // Add timeout to prevent hanging
        signal: AbortSignal.timeout(30000) // 30 second timeout
      })
      
      console.log('Anthropic API Response:', { 
        status: response.status, 
        ok: response.ok, 
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries())
      })
    } catch (fetchError) {
      console.error('Anthropic fetch error details:', {
        error: fetchError,
        name: fetchError instanceof Error ? fetchError.name : 'Unknown',
        message: fetchError instanceof Error ? fetchError.message : 'Unknown',
        stack: fetchError instanceof Error ? fetchError.stack : 'No stack'
      })
      
      // Network-level errors
      if (fetchError instanceof Error) {
        if (fetchError.name === 'AbortError') {
          throw new Error('⏱️ Request to Anthropic API timed out. Please check your internet connection and try again.')
        }
        if (fetchError instanceof TypeError && fetchError.message.includes('fetch')) {
          throw new Error('🌐 Unable to connect to Anthropic API. Please check your internet connection and try again.')
        }
        if (fetchError.message.includes('Failed to fetch') || fetchError.message.includes('NetworkError')) {
          throw new Error('🌐 Network error: Unable to reach Anthropic API. Please check your internet connection, firewall, or proxy settings.')
        }
      }
      throw new Error(`🌐 Network error connecting to Anthropic: ${fetchError instanceof Error ? fetchError.message : 'Unknown network error'}`)
    }

    if (!response.ok) {
      let errorMessage = 'Unknown error'
      let errorType = 'API_ERROR'
      
      try {
        const errorData = await response.json()
        errorMessage = errorData.error?.message || errorData.message || 'Unknown error'
        errorType = errorData.error?.type || 'API_ERROR'
        
        // Provide specific error messages based on status code and error type
        switch (response.status) {
          case 400:
            // Check for credit/billing errors in 400 responses too
            if (errorMessage.toLowerCase().includes('credit') || errorMessage.toLowerCase().includes('billing') || errorMessage.toLowerCase().includes('balance')) {
              throw new Error('💳 Insufficient Anthropic credits. Please go to Plans & Billing in your Anthropic account to add credits or upgrade your plan.')
            }
            if (errorType === 'invalid_request_error') {
              throw new Error(`Invalid request to Anthropic: ${errorMessage}`)
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
            if (errorMessage.toLowerCase().includes('rate limit')) {
              throw new Error('Anthropic rate limit exceeded. Please wait a moment and try again.')
            }
            throw new Error('Too many requests to Anthropic. Please try again later.')
          
          case 500:
          case 502:
          case 503:
          case 504:
            throw new Error('Anthropic API is temporarily unavailable. Please try again in a few moments.')
          
          default:
            throw new Error(`Anthropic API error (${response.status}): ${errorMessage}`)
        }
      } catch (jsonError) {
        // If we can't parse the error response
        if (response.status === 401) {
          throw new Error('Invalid Anthropic API key. Please check your API key in settings.')
        } else if (response.status === 403) {
          throw new Error('Access denied to Anthropic API. This might be due to insufficient credits or account restrictions.')
        } else if (response.status >= 500) {
          throw new Error('Anthropic API is temporarily unavailable. Please try again in a few moments.')
        } else {
          throw new Error(`Anthropic API error: ${response.status} ${response.statusText}`)
        }
      }
    }

    if (isStreaming) {
      return handleStreamingResponse(response, model, onStream!)
    } else {
      return handleRegularResponse(response, model)
    }
  }
}

function convertToAnthropicFormat(messages: ChatMessage[]) {
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

async function handleRegularResponse(response: Response, model: string): Promise<ChatResponse> {
  const data = await response.json()
  
  return {
    response: data.content?.[0]?.text || 'No response from Anthropic',
    metadata: {
      model: model,
      provider: 'Anthropic',
      tokens: data.usage?.input_tokens + data.usage?.output_tokens,
      usage: {
        prompt_tokens: data.usage?.input_tokens,
        completion_tokens: data.usage?.output_tokens,
        total_tokens: data.usage?.input_tokens + data.usage?.output_tokens,
      },
      finish_reason: data.stop_reason,
      created_at: new Date().toISOString(),
    }
  }
}

async function handleStreamingResponse(
  response: Response, 
  model: string, 
  onStream: (chunk: string) => void
): Promise<ChatResponse> {
  let fullResponse = ''
  let inputTokens = 0
  let outputTokens = 0
  let stopReason = ''

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
          if (line.startsWith('data: ')) {
            const data = line.slice(6)

            try {
              const parsed = JSON.parse(data)

              if (parsed.type === 'content_block_delta') {
                const content = parsed.delta?.text
                if (content) {
                  fullResponse += content
                  // Stream updates immediately for better responsiveness
                  onStream(fullResponse)
                }
              }

              if (parsed.type === 'message_start') {
                inputTokens = parsed.message?.usage?.input_tokens || 0
              }

              if (parsed.type === 'message_delta') {
                outputTokens = parsed.delta?.usage?.output_tokens || 0
                stopReason = parsed.delta?.stop_reason || ''
              }
            } catch (e) {
              console.warn('Failed to parse Anthropic streaming chunk:', data)
            }
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  return {
    response: fullResponse || 'No response from Anthropic',
    metadata: {
      model: model,
      provider: 'Anthropic',
      tokens: inputTokens + outputTokens,
      usage: {
        prompt_tokens: inputTokens,
        completion_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens,
      },
      finish_reason: stopReason,
      created_at: new Date().toISOString(),
    }
  }
}