import { ChatProvider, ChatMessage, ChatResponse } from './types'
import { openaiProvider } from './openai'
import { anthropicProvider } from './anthropic'
import { googleProvider } from './google'
import { openrouterProvider } from './openrouter'

// Map of provider IDs to their implementations
export const chatProviders: Record<string, ChatProvider> = {
  'openai': openaiProvider,
  'anthropic': anthropicProvider,
  'google': googleProvider,
  'openrouter': openrouterProvider,
}

// Helper function to get provider by name
export function getChatProvider(providerName: string): ChatProvider | null {
  // Map common provider names to IDs
  const providerMap: Record<string, string> = {
    'OpenAI': 'openai',
    'Anthropic': 'anthropic',
    'Google AI': 'google',
    'OpenRouter': 'openrouter',
  }

  const providerId = providerMap[providerName] || providerName.toLowerCase()
  return chatProviders[providerId] || null
}

// Main function to send chat messages
export async function sendChatMessage(
  providerName: string,
  model: string,
  messages: ChatMessage[],
  apiKey: string,
  onStream?: (chunk: string) => void
): Promise<ChatResponse> {
  const provider = getChatProvider(providerName)
  
  if (!provider) {
    throw new Error(`Unsupported chat provider: ${providerName}`)
  }

  if (!apiKey) {
    throw new Error(`API key is required for ${providerName}`)
  }

  try {
    return await provider.sendMessage(model, messages, apiKey, onStream)
  } catch (error) {
    console.error(`Chat error with ${providerName}:`, error)
    throw error
  }
}

// Export types for external use
export type { ChatProvider, ChatMessage, ChatResponse } from './types'