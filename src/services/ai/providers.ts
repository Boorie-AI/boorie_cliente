import { AIProvider, AIModel } from '@prisma/client'

export interface ProviderTestResult {
  success: boolean
  message: string
  models?: AIModel[]
}

export interface APIProviderConfig {
  id: string
  name: string
  description: string
  baseURL: string
  defaultModels: string[]
  color: string
  order: number
}

export const API_PROVIDERS: APIProviderConfig[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude AI models for advanced reasoning and analysis',
    baseURL: 'https://api.anthropic.com',
    defaultModels: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'],
    color: 'bg-orange-600',
    order: 1
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'Access to GPT models including GPT-4 and GPT-3.5',
    baseURL: 'https://api.openai.com',
    defaultModels: ['gpt-4o', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'],
    color: 'bg-green-600',
    order: 2
  },
  {
    id: 'google',
    name: 'Google AI',
    description: 'Gemini models for multimodal AI capabilities',
    baseURL: 'https://generativelanguage.googleapis.com',
    defaultModels: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-pro'],
    color: 'bg-blue-600',
    order: 3
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Access to multiple AI models through a single API',
    baseURL: 'https://openrouter.ai/api',
    defaultModels: [], // OpenRouter requires manual model addition
    color: 'bg-purple-600',
    order: 4
  }
]

/**
 * Test Anthropic API connection and retrieve available models
 */
export async function testAnthropicConnection(apiKey: string): Promise<ProviderTestResult> {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'test' }]
      })
    })

    if (response.ok || response.status === 400) {
      // 400 is expected for minimal test - means API key is valid
      const models = API_PROVIDERS.find(p => p.id === 'anthropic')?.defaultModels || []
      return {
        success: true,
        message: 'Connection successful',
        models: models.map(modelId => ({
          modelId,
          modelName: modelId,
          description: getModelDescription(modelId),
          isSelected: false
        }))
      }
    } else if (response.status === 401) {
      return {
        success: false,
        message: 'Invalid API key'
      }
    } else {
      return {
        success: false,
        message: `Connection failed: ${response.status}`
      }
    }
  } catch (error) {
    return {
      success: false,
      message: `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`
    }
  }
}

/**
 * Test OpenAI API connection and retrieve available models
 */
export async function testOpenAIConnection(apiKey: string): Promise<ProviderTestResult> {
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    })

    if (response.ok) {
      const data = await response.json()
      const availableModels = data.data?.filter((model: any) => 
        API_PROVIDERS.find(p => p.id === 'openai')?.defaultModels.includes(model.id)
      ) || []

      return {
        success: true,
        message: 'Connection successful',
        models: availableModels.map((model: any) => ({
          modelId: model.id,
          modelName: model.id,
          description: getModelDescription(model.id),
          isSelected: false
        }))
      }
    } else if (response.status === 401) {
      return {
        success: false,
        message: 'Invalid API key'
      }
    } else {
      return {
        success: false,
        message: `Connection failed: ${response.status}`
      }
    }
  } catch (error) {
    return {
      success: false,
      message: `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`
    }
  }
}

/**
 * Test Google AI API connection and retrieve available models
 */
export async function testGoogleConnection(apiKey: string): Promise<ProviderTestResult> {
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    })

    if (response.ok) {
      const data = await response.json()
      const availableModels = data.models?.filter((model: any) => 
        API_PROVIDERS.find(p => p.id === 'google')?.defaultModels.some(m => 
          model.name.includes(m)
        )
      ) || []

      return {
        success: true,
        message: 'Connection successful',
        models: availableModels.map((model: any) => ({
          modelId: model.name.split('/').pop(),
          modelName: model.displayName || model.name,
          description: model.description || getModelDescription(model.name),
          isSelected: false
        }))
      }
    } else if (response.status === 403) {
      return {
        success: false,
        message: 'Invalid API key'
      }
    } else {
      return {
        success: false,
        message: `Connection failed: ${response.status}`
      }
    }
  } catch (error) {
    return {
      success: false,
      message: `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`
    }
  }
}

/**
 * Test OpenRouter API connection
 */
export async function testOpenRouterConnection(apiKey: string): Promise<ProviderTestResult> {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/auth/key', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    })

    if (response.ok) {
      return {
        success: true,
        message: 'Connection successful. Add models manually.',
        models: []
      }
    } else if (response.status === 401) {
      return {
        success: false,
        message: 'Invalid API key'
      }
    } else {
      return {
        success: false,
        message: `Connection failed: ${response.status}`
      }
    }
  } catch (error) {
    return {
      success: false,
      message: `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`
    }
  }
}

/**
 * Test API connection for any provider
 */
export async function testProviderConnection(providerId: string, apiKey: string): Promise<ProviderTestResult> {
  switch (providerId) {
    case 'anthropic':
      return testAnthropicConnection(apiKey)
    case 'openai':
      return testOpenAIConnection(apiKey)
    case 'google':
      return testGoogleConnection(apiKey)
    case 'openrouter':
      return testOpenRouterConnection(apiKey)
    default:
      return {
        success: false,
        message: 'Unknown provider'
      }
  }
}

/**
 * Get model description based on model ID
 */
function getModelDescription(modelId: string): string {
  const descriptions: Record<string, string> = {
    'claude-3-5-sonnet-20241022': 'Most intelligent model with advanced reasoning',
    'claude-3-opus-20240229': 'Powerful model for complex tasks',
    'claude-3-haiku-20240307': 'Fast and efficient model',
    'gpt-4o': 'Latest multimodal GPT-4 model',
    'gpt-4-turbo': 'Advanced GPT-4 with improved speed',
    'gpt-4': 'Advanced reasoning and analysis',
    'gpt-3.5-turbo': 'Fast and cost-effective model',
    'gemini-1.5-pro': 'Most capable Gemini model',
    'gemini-1.5-flash': 'Fast multimodal model',
    'gemini-pro': 'Balanced performance model'
  }
  
  return descriptions[modelId] || 'AI language model'
}

/**
 * Add custom model for OpenRouter
 */
export interface CustomModel {
  modelId: string
  modelName: string
  description?: string
}

export function validateCustomModel(model: CustomModel): boolean {
  return !!(model.modelId && model.modelName && model.modelId.trim() && model.modelName.trim())
}