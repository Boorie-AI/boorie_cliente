export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface ChatResponse {
  response: string
  metadata: {
    model: string
    provider: string
    tokens?: number
    usage?: {
      prompt_tokens?: number
      completion_tokens?: number
      total_tokens?: number
    }
    finish_reason?: string
    created_at?: string
  }
}

export interface StreamingChatResponse {
  response: string
  metadata: ChatResponse['metadata']
  isComplete: boolean
}

export interface ChatProvider {
  name: string
  sendMessage: (
    model: string,
    messages: ChatMessage[],
    apiKey: string,
    onStream?: (chunk: string) => void
  ) => Promise<ChatResponse>
  supportsStreaming: boolean
}

export interface ChatConfig {
  apiKey: string
  baseURL?: string
  timeout?: number
  maxTokens?: number
  temperature?: number
  topP?: number
}