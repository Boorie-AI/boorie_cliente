// Backend Models and Interfaces
// Centralized type definitions for the backend services

export interface IConversation {
  id: string
  title: string
  messages: IMessage[]
  model: string
  provider: string
  createdAt: Date
  updatedAt: Date
}

export interface IMessage {
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

export interface IAIProvider {
  id: string
  name: string
  type: 'local' | 'api'
  apiKey?: string | null
  isActive: boolean
  isConnected: boolean
  lastTestResult?: 'success' | 'error' | null
  lastTestMessage?: string | null
  config?: any
  createdAt: Date
  updatedAt: Date
  models?: IAIModel[]
}

export interface IAIModel {
  id: string
  providerId: string
  modelName: string
  modelId: string
  isDefault: boolean
  isAvailable: boolean
  isSelected: boolean
  description?: string | null
  metadata?: any
  createdAt: Date
  updatedAt: Date
}

export interface IAppSetting {
  id: string
  key: string
  value: string
  category?: string | null
  createdAt: Date
  updatedAt: Date
}

export interface ISystemPrompt {
  id: string
  name: string
  title: string
  content: string
  description?: string | null
  saludo?: string | null
  isActive: boolean
  isDefault: boolean
  createdAt: Date
  updatedAt: Date
}

export interface IDocument {
  id: string
  filename: string
  filepath: string
  content: string
  metadata?: any
  embeddings?: any
  createdAt: Date
  updatedAt: Date
  chunks?: IDocumentChunk[]
}

export interface IDocumentChunk {
  id: string
  documentId: string
  content: string
  embedding?: any
  metadata?: any
  startPos?: number
  endPos?: number
  createdAt: Date
}

export interface IAuthToken {
  id: string
  provider: string
  tokenType: string
  accessToken: string
  refreshToken?: string
  expiresAt?: Date
  createdAt: Date
  updatedAt: Date
}

export interface IEmailMessage {
  id: string
  provider: string
  messageId: string
  subject: string
  from: string
  to: string[]
  cc?: string[]
  bcc?: string[]
  body: string
  htmlBody?: string
  attachments?: any[]
  isRead: boolean
  isImportant: boolean
  receivedAt: Date
  createdAt: Date
  updatedAt: Date
}

export interface ICalendarEvent {
  id: string
  provider: string
  eventId: string
  title: string
  description?: string
  location?: string
  startTime: Date
  endTime: Date
  isAllDay: boolean
  attendees?: any[]
  organizer?: string
  createdAt: Date
  updatedAt: Date
}

// Service Response Types
export interface IServiceResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

// Database Operation Types
export interface ICreateConversationData {
  id: string
  title: string
  messages: IMessage[]
  model: string
  provider: string
}

export interface IUpdateConversationData {
  title?: string
  messages?: IMessage[]
  model?: string
  provider?: string
}

export interface ICreateAIProviderData {
  name: string
  type: 'local' | 'api'
  apiKey?: string
  isActive: boolean
  isConnected: boolean
  config?: any
}

export interface IUpdateAIProviderData {
  name?: string
  type?: 'local' | 'api'
  apiKey?: string
  isActive?: boolean
  isConnected?: boolean
  lastTestResult?: 'success' | 'error' | null
  lastTestMessage?: string
  config?: any
}

export interface ICreateSystemPromptData {
  name: string
  title: string
  content: string
  description?: string
  saludo?: string
  isActive?: boolean
  isDefault?: boolean
}

export interface IUpdateSystemPromptData {
  name?: string
  title?: string
  content?: string
  description?: string
  saludo?: string
  isActive?: boolean
  isDefault?: boolean
}

// AI Provider Configuration Types
export interface IOllamaConfig {
  baseUrl: string
  timeout: number
}

export interface IOpenAIConfig {
  apiKey: string
  baseUrl?: string
  organization?: string
}

export interface IAnthropicConfig {
  apiKey: string
  baseUrl?: string
}

export interface IGoogleAIConfig {
  apiKey: string
  baseUrl?: string
}

// Chat Message Types for API calls
export interface IChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface IChatResponse {
  response: string
  metadata: {
    model: string
    provider: string
    tokens?: number
    created_at?: string
  }
}

// Streaming Response Types
export interface IStreamingCallback {
  (content: string): void
}

// Error Types
export class ServiceError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500
  ) {
    super(message)
    this.name = 'ServiceError'
  }
}

export class DatabaseError extends ServiceError {
  constructor(message: string, originalError?: Error) {
    super(message, 'DATABASE_ERROR', 500)
    this.name = 'DatabaseError'
    if (originalError) {
      this.stack = originalError.stack
    }
  }
}

export class AIProviderError extends ServiceError {
  constructor(message: string, provider: string) {
    super(`${provider}: ${message}`, 'AI_PROVIDER_ERROR', 502)
    this.name = 'AIProviderError'
  }
}

export class ValidationError extends ServiceError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR', 400)
    this.name = 'ValidationError'
  }
}