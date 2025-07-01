import { ChatMessage, ChatResponse, ChatProvider } from './types'

export const googleProvider: ChatProvider = {
  name: 'Google AI',
  supportsStreaming: true,

  async sendMessage(
    model: string,
    messages: ChatMessage[],
    apiKey: string,
    onStream?: (chunk: string) => void
  ): Promise<ChatResponse> {
    const isStreaming = !!onStream

    // Convert messages to Google AI format
    const googleMessages = convertToGoogleFormat(messages)

    const requestBody = {
      contents: googleMessages.contents,
      systemInstruction: googleMessages.systemInstruction,
      generationConfig: {
        maxOutputTokens: 4000,
        temperature: 0.7,
      },
    }

    const streamParam = isStreaming ? '?alt=sse' : ''
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:${isStreaming ? 'streamGenerateContent' : 'generateContent'}${streamParam}`

    console.log('Google AI API Request:', { model, messagesCount: googleMessages.contents.length, stream: isStreaming })

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Google AI API error: ${response.status} ${response.statusText} - ${errorData.error?.message || 'Unknown error'}`)
    }

    if (isStreaming) {
      return handleStreamingResponse(response, model, onStream!)
    } else {
      return handleRegularResponse(response, model)
    }
  }
}

function convertToGoogleFormat(messages: ChatMessage[]) {
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

async function handleRegularResponse(response: Response, model: string): Promise<ChatResponse> {
  const data = await response.json()
  
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response from Google AI'
  const usageMetadata = data.usageMetadata || {}
  
  return {
    response: content,
    metadata: {
      model: model,
      provider: 'Google AI',
      tokens: usageMetadata.totalTokenCount,
      usage: {
        prompt_tokens: usageMetadata.promptTokenCount,
        completion_tokens: usageMetadata.candidatesTokenCount,
        total_tokens: usageMetadata.totalTokenCount,
      },
      finish_reason: data.candidates?.[0]?.finishReason,
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
  let totalTokens = 0
  let finishReason = ''

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
              const content = parsed.candidates?.[0]?.content?.parts?.[0]?.text

              if (content) {
                fullResponse += content
                // Throttle streaming updates
                setTimeout(() => onStream(fullResponse), Math.random() * 30 + 20)
              }

              if (parsed.candidates?.[0]?.finishReason) {
                finishReason = parsed.candidates[0].finishReason
              }

              if (parsed.usageMetadata) {
                totalTokens = parsed.usageMetadata.totalTokenCount
              }
            } catch (e) {
              console.warn('Failed to parse Google AI streaming chunk:', data)
            }
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  return {
    response: fullResponse || 'No response from Google AI',
    metadata: {
      model: model,
      provider: 'Google AI',
      tokens: totalTokens,
      finish_reason: finishReason,
      created_at: new Date().toISOString(),
    }
  }
}