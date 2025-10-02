import { ChatMessage, ChatResponse, ChatProvider } from './types'

export const openrouterProvider: ChatProvider = {
  name: 'OpenRouter',
  supportsStreaming: true,

  async sendMessage(
    model: string,
    messages: ChatMessage[],
    apiKey: string,
    onStream?: (chunk: string) => void
  ): Promise<ChatResponse> {
    const isStreaming = !!onStream

    const requestBody = {
      model: model,
      messages: messages,
      stream: isStreaming,
      max_tokens: 4000,
      temperature: 0.7,
      // OpenRouter specific headers
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
    }

    console.log('OpenRouter API Request:', { model, messagesCount: messages.length, stream: isStreaming })

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://boorie.app', // Required by OpenRouter
        'X-Title': 'Boorie', // Required by OpenRouter
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`OpenRouter API error: ${response.status} ${response.statusText} - ${errorData.error?.message || 'Unknown error'}`)
    }

    if (isStreaming) {
      return handleStreamingResponse(response, model, onStream!)
    } else {
      return handleRegularResponse(response, model)
    }
  }
}

async function handleRegularResponse(response: Response, model: string): Promise<ChatResponse> {
  const data = await response.json()
  
  return {
    response: data.choices[0]?.message?.content || 'No response from OpenRouter',
    metadata: {
      model: data.model || model,
      provider: 'OpenRouter',
      tokens: data.usage?.total_tokens,
      usage: data.usage,
      finish_reason: data.choices[0]?.finish_reason,
      created_at: new Date(data.created * 1000).toISOString(),
    }
  }
}

async function handleStreamingResponse(
  response: Response, 
  model: string, 
  onStream: (chunk: string) => void
): Promise<ChatResponse> {
  let fullResponse = ''
  let totalTokens = 0
  let finishReason = ''
  let actualModel = model

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
            
            if (data === '[DONE]') {
              break
            }

            try {
              const parsed = JSON.parse(data)
              const content = parsed.choices?.[0]?.delta?.content

              if (content) {
                fullResponse += content
                // Throttle streaming updates
                setTimeout(() => onStream(fullResponse), Math.random() * 30 + 20)
              }

              if (parsed.choices?.[0]?.finish_reason) {
                finishReason = parsed.choices[0].finish_reason
              }

              if (parsed.usage) {
                totalTokens = parsed.usage.total_tokens
              }

              if (parsed.model) {
                actualModel = parsed.model
              }
            } catch (e) {
              console.warn('Failed to parse OpenRouter streaming chunk:', data)
            }
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  return {
    response: fullResponse || 'No response from OpenRouter',
    metadata: {
      model: actualModel,
      provider: 'OpenRouter',
      tokens: totalTokens,
      finish_reason: finishReason,
      created_at: new Date().toISOString(),
    }
  }
}