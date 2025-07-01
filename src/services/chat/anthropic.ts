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

    console.log('Anthropic API Request:', { model, messagesCount: anthropicMessages.length, stream: isStreaming })

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Anthropic API error: ${response.status} ${response.statusText} - ${errorData.error?.message || 'Unknown error'}`)
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
                  // Throttle streaming updates
                  setTimeout(() => onStream(fullResponse), Math.random() * 30 + 20)
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