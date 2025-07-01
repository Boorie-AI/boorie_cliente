// AI Provider Service - Business logic for AI provider and model management

import {
  IServiceResponse,
  IAIProvider,
  IAIModel,
  ICreateAIProviderData,
  IUpdateAIProviderData,
  ServiceError,
  AIProviderError
} from '../models'
import { DatabaseService } from './database.service'
import { aiProviderLogger } from '../utils/logger'
import { validateString, validateBoolean, validateRequired } from '../utils/validation'

export class AIProviderService {
  private databaseService: DatabaseService
  private logger = aiProviderLogger

  constructor(databaseService: DatabaseService) {
    this.databaseService = databaseService
    this.logger.info('AI Provider service initialized')
  }

  // AI Provider Operations
  async getAllProviders(): Promise<IServiceResponse<IAIProvider[]>> {
    try {
      this.logger.debug('Getting all AI providers')

      const result = await this.databaseService.getAIProviders()

      if (!result.success) {
        throw new ServiceError(result.error || 'Failed to get AI providers', 'DATABASE_ERROR')
      }

      this.logger.success(`Retrieved ${result.data?.length || 0} AI providers`)
      return result
    } catch (error) {
      this.logger.error('Failed to get all AI providers', error as Error)
      return {
        success: false,
        error: error instanceof ServiceError ? error.message : 'Failed to retrieve AI providers'
      }
    }
  }

  async getProviderById(id: string): Promise<IServiceResponse<IAIProvider>> {
    try {
      validateString(id, 'Provider ID')
      this.logger.debug('Getting AI provider by ID', { id })

      const providers = await this.databaseService.getAIProviders()
      if (!providers.success || !providers.data) {
        throw new ServiceError('Failed to get providers', 'DATABASE_ERROR')
      }

      const provider = providers.data.find(p => p.id === id)
      if (!provider) {
        throw new ServiceError('AI provider not found', 'NOT_FOUND', 404)
      }

      this.logger.success('Retrieved AI provider', { id, name: provider.name })
      return {
        success: true,
        data: provider
      }
    } catch (error) {
      this.logger.error('Failed to get AI provider by ID', error as Error, { id })
      return {
        success: false,
        error: error instanceof ServiceError ? error.message : 'Failed to retrieve AI provider'
      }
    }
  }

  async createProvider(data: ICreateAIProviderData): Promise<IServiceResponse<IAIProvider>> {
    try {
      this.logger.debug('Creating new AI provider', { name: data.name, type: data.type })

      // Validate input data
      this.validateProviderData(data)

      // Check if provider with this name already exists
      const existingProviders = await this.databaseService.getAIProviders()
      if (existingProviders.success && existingProviders.data) {
        const duplicate = existingProviders.data.find(p => p.name === data.name)
        if (duplicate) {
          throw new ServiceError(
            `AI provider with name '${data.name}' already exists`,
            'DUPLICATE_ERROR',
            409
          )
        }
      }

      // Create the provider
      const result = await this.databaseService.createAIProvider(data)

      if (!result.success) {
        throw new ServiceError(result.error || 'Failed to create AI provider', 'DATABASE_ERROR')
      }

      this.logger.success('Created AI provider', {
        id: result.data?.id,
        name: result.data?.name
      })
      return result
    } catch (error) {
      this.logger.error('Failed to create AI provider', error as Error, data)
      return {
        success: false,
        error: error instanceof ServiceError ? error.message : 'Failed to create AI provider'
      }
    }
  }

  async updateProvider(id: string, updates: IUpdateAIProviderData): Promise<IServiceResponse<IAIProvider>> {
    try {
      validateString(id, 'Provider ID')
      this.logger.debug('Updating AI provider', { id, updates })

      // Validate updates
      this.validateProviderUpdates(updates)

      // Check if provider exists
      const existingResult = await this.getProviderById(id)
      if (!existingResult.success) {
        throw new ServiceError('AI provider not found', 'NOT_FOUND', 404)
      }

      // Check for name conflicts if name is being updated
      if (updates.name && updates.name !== existingResult.data?.name) {
        const allProviders = await this.databaseService.getAIProviders()
        if (allProviders.success && allProviders.data) {
          const duplicate = allProviders.data.find(p => p.name === updates.name && p.id !== id)
          if (duplicate) {
            throw new ServiceError(
              `AI provider with name '${updates.name}' already exists`,
              'DUPLICATE_ERROR',
              409
            )
          }
        }
      }

      // Update the provider
      const result = await this.databaseService.updateAIProvider(id, updates)

      if (!result.success) {
        throw new ServiceError(result.error || 'Failed to update AI provider', 'DATABASE_ERROR')
      }

      this.logger.success('Updated AI provider', {
        id: result.data?.id,
        name: result.data?.name
      })
      return result
    } catch (error) {
      this.logger.error('Failed to update AI provider', error as Error, { id, updates })
      return {
        success: false,
        error: error instanceof ServiceError ? error.message : 'Failed to update AI provider'
      }
    }
  }

  async testProviderConnection(id: string): Promise<IServiceResponse<boolean>> {
    try {
      validateString(id, 'Provider ID')
      this.logger.debug('Testing AI provider connection', { id })

      // Get provider details
      const providerResult = await this.getProviderById(id)
      if (!providerResult.success || !providerResult.data) {
        throw new ServiceError('AI provider not found', 'NOT_FOUND', 404)
      }

      const provider = providerResult.data
      let testResult: boolean
      let testMessage: string

      try {
        // Test connection based on provider type
        if (provider.type === 'local') {
          testResult = await this.testLocalProvider(provider)
          testMessage = testResult ? 'Local provider connection successful' : 'Local provider connection failed'
        } else {
          testResult = await this.testAPIProvider(provider)
          testMessage = testResult ? 'API provider connection successful' : 'API provider connection failed'
        }
      } catch (error) {
        testResult = false
        testMessage = error instanceof Error ? error.message : 'Connection test failed'
      }

      // Update provider with test results
      await this.databaseService.updateAIProvider(id, {
        isConnected: testResult,
        lastTestResult: testResult ? 'success' : 'error',
        lastTestMessage: testMessage
      })

      // If test was successful, automatically fetch models
      if (testResult) {
        this.logger.debug('Connection test successful, fetching models', { id, name: provider.name })
        try {
          const modelsResult = await this.refreshProviderModels(id)
          if (modelsResult.success) {
            this.logger.success('Auto-fetched models after successful connection test', {
              id,
              name: provider.name,
              modelCount: modelsResult.data?.length || 0
            })
          } else {
            this.logger.warn('Failed to auto-fetch models after successful connection test', {
              id,
              name: provider.name,
              error: modelsResult.error
            })
          }
        } catch (error) {
          // Don't fail the connection test if model fetching fails
          this.logger.warn('Error during auto-fetch models after connection test', error as Error)
        }
      }

      this.logger.success('Tested AI provider connection', {
        id,
        name: provider.name,
        result: testResult
      })

      return {
        success: true,
        data: testResult,
        message: testMessage
      }
    } catch (error) {
      this.logger.error('Failed to test AI provider connection', error as Error, { id })
      return {
        success: false,
        error: error instanceof ServiceError ? error.message : 'Failed to test connection'
      }
    }
  }

  // AI Model Operations
  async getModelsForProvider(providerId: string): Promise<IServiceResponse<IAIModel[]>> {
    try {
      validateString(providerId, 'Provider ID')
      this.logger.debug('Getting models for provider', { providerId })

      const result = await this.databaseService.getAIModels(providerId)

      if (!result.success) {
        throw new ServiceError(result.error || 'Failed to get AI models', 'DATABASE_ERROR')
      }

      this.logger.success(`Retrieved ${result.data?.length || 0} models for provider`, { providerId })
      return result
    } catch (error) {
      this.logger.error('Failed to get models for provider', error as Error, { providerId })
      return {
        success: false,
        error: error instanceof ServiceError ? error.message : 'Failed to retrieve models'
      }
    }
  }

  async getAllModels(): Promise<IServiceResponse<IAIModel[]>> {
    try {
      this.logger.debug('Getting all AI models')

      const result = await this.databaseService.getAIModels()

      if (!result.success) {
        throw new ServiceError(result.error || 'Failed to get AI models', 'DATABASE_ERROR')
      }

      this.logger.success(`Retrieved ${result.data?.length || 0} AI models`)
      return result
    } catch (error) {
      this.logger.error('Failed to get all AI models', error as Error)
      return {
        success: false,
        error: error instanceof ServiceError ? error.message : 'Failed to retrieve models'
      }
    }
  }

  async saveModel(modelData: any): Promise<IServiceResponse<IAIModel>> {
    try {
      this.logger.debug('Saving AI model', {
        providerId: modelData.providerId,
        modelId: modelData.modelId
      })

      // Validate model data
      this.validateModelData(modelData)

      // Save or update the model
      const result = await this.databaseService.createOrUpdateAIModel(modelData)

      if (!result.success) {
        throw new ServiceError(result.error || 'Failed to save AI model', 'DATABASE_ERROR')
      }

      this.logger.success('Saved AI model', {
        id: result.data?.id,
        modelName: result.data?.modelName
      })
      return result
    } catch (error) {
      this.logger.error('Failed to save AI model', error as Error, modelData)
      return {
        success: false,
        error: error instanceof ServiceError ? error.message : 'Failed to save model'
      }
    }
  }

  async deleteModelsForProvider(providerId: string): Promise<IServiceResponse<boolean>> {
    try {
      validateString(providerId, 'Provider ID')
      this.logger.debug('Deleting models for provider', { providerId })

      // Check if provider exists
      const providerResult = await this.getProviderById(providerId)
      if (!providerResult.success) {
        throw new ServiceError('AI provider not found', 'NOT_FOUND', 404)
      }

      // Delete models
      const result = await this.databaseService.deleteAIModels(providerId)

      if (!result.success) {
        throw new ServiceError(result.error || 'Failed to delete AI models', 'DATABASE_ERROR')
      }

      this.logger.success('Deleted models for provider', { providerId })
      return result
    } catch (error) {
      this.logger.error('Failed to delete models for provider', error as Error, { providerId })
      return {
        success: false,
        error: error instanceof ServiceError ? error.message : 'Failed to delete models'
      }
    }
  }

  async refreshProviderModels(providerId: string): Promise<IServiceResponse<IAIModel[]>> {
    try {
      validateString(providerId, 'Provider ID')
      this.logger.debug('Refreshing models for provider', { providerId })

      // Get provider details
      const providerResult = await this.getProviderById(providerId)
      if (!providerResult.success || !providerResult.data) {
        throw new ServiceError('AI provider not found', 'NOT_FOUND', 404)
      }

      const provider = providerResult.data

      // Delete existing models
      await this.deleteModelsForProvider(providerId)

      // Fetch new models based on provider type
      let models: any[] = []
      if (provider.type === 'local') {
        models = await this.fetchLocalModels(provider)
      } else {
        models = await this.fetchAPIModels(provider)
      }

      // Save new models
      const savedModels: IAIModel[] = []
      for (const modelData of models) {
        const saveResult = await this.saveModel({
          ...modelData,
          providerId: providerId
        })
        if (saveResult.success && saveResult.data) {
          savedModels.push(saveResult.data)
        }
      }

      this.logger.success('Refreshed models for provider', {
        providerId,
        modelCount: savedModels.length
      })

      return {
        success: true,
        data: savedModels
      }
    } catch (error) {
      this.logger.error('Failed to refresh provider models', error as Error, { providerId })
      return {
        success: false,
        error: error instanceof ServiceError ? error.message : 'Failed to refresh models'
      }
    }
  }

  // Private helper methods
  private validateProviderData(data: ICreateAIProviderData): void {
    validateString(data.name, 'Name', 1, 100)
    validateRequired(data.type, 'Type')
    if (!['local', 'api'].includes(data.type)) {
      throw new ServiceError('Type must be either "local" or "api"', 'VALIDATION_ERROR')
    }
    validateBoolean(data.isActive, 'Is Active')
    validateBoolean(data.isConnected, 'Is Connected')

    if (data.apiKey !== undefined && data.apiKey !== null) {
      validateString(data.apiKey, 'API Key')
    }
  }

  private validateProviderUpdates(updates: IUpdateAIProviderData): void {
    if (updates.name !== undefined) {
      validateString(updates.name, 'Name', 1, 100)
    }
    if (updates.type !== undefined) {
      if (!['local', 'api'].includes(updates.type)) {
        throw new ServiceError('Type must be either "local" or "api"', 'VALIDATION_ERROR')
      }
    }
    if (updates.isActive !== undefined) {
      validateBoolean(updates.isActive, 'Is Active')
    }
    if (updates.isConnected !== undefined) {
      validateBoolean(updates.isConnected, 'Is Connected')
    }
    if (updates.apiKey !== undefined && updates.apiKey !== null) {
      validateString(updates.apiKey, 'API Key')
    }
  }

  private validateModelData(data: any): void {
    validateString(data.providerId, 'Provider ID')
    validateString(data.modelName, 'Model Name', 1, 100)
    validateString(data.modelId, 'Model ID', 1, 100)
    validateBoolean(data.isAvailable, 'Is Available')
    validateBoolean(data.isSelected, 'Is Selected')

    if (data.isDefault !== undefined) {
      validateBoolean(data.isDefault, 'Is Default')
    }
  }

  private async testLocalProvider(provider: IAIProvider): Promise<boolean> {
    try {
      // Test Ollama connection
      const ollamaUrl = provider.config?.baseUrl || 'http://localhost:11434'
      const response = await fetch(`${ollamaUrl}/api/tags`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      })

      return response.ok
    } catch (error) {
      this.logger.warn('Local provider test failed', { provider: provider.name, error })
      return false
    }
  }

  private async testAPIProvider(provider: IAIProvider): Promise<boolean> {
    try {
      if (!provider.apiKey) {
        throw new AIProviderError('API key is required for API providers', provider.name)
      }

      // Basic API key validation - could be expanded for specific providers
      switch (provider.name.toLowerCase()) {
        case 'openai':
          return await this.testOpenAI(provider)
        case 'anthropic':
          return await this.testAnthropic(provider)
        case 'google':
          return await this.testGoogleAI(provider)
        default:
          // Generic test - just check if API key is provided
          return !!provider.apiKey
      }
    } catch (error) {
      this.logger.warn('API provider test failed', { provider: provider.name, error })
      return false
    }
  }

  private async testOpenAI(provider: IAIProvider): Promise<boolean> {
    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${provider.apiKey}`,
          'Content-Type': 'application/json'
        }
      })
      return response.ok
    } catch {
      return false
    }
  }

  private async testAnthropic(provider: IAIProvider): Promise<boolean> {
    // Anthropic doesn't have a simple endpoint to test, so we just validate the key format
    return !!provider.apiKey && provider.apiKey.startsWith('sk-ant-')
  }

  private async testGoogleAI(provider: IAIProvider): Promise<boolean> {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${provider.apiKey}`)
      return response.ok
    } catch {
      return false
    }
  }

  private async fetchLocalModels(provider: IAIProvider): Promise<any[]> {
    try {
      const ollamaUrl = provider.config?.baseUrl || 'http://localhost:11434'
      const response = await fetch(`${ollamaUrl}/api/tags`)

      if (!response.ok) {
        throw new AIProviderError('Failed to fetch local models', provider.name)
      }

      const data = await response.json() as { models?: any[] }
      return data.models?.map((model: any) => ({
        modelId: model.name,
        modelName: model.name,
        isDefault: false,
        isAvailable: true,
        isSelected: false,
        description: `Local Ollama model: ${model.name}`,
        metadata: {
          size: model.size,
          modified_at: model.modified_at
        }
      })) || []
    } catch (error) {
      this.logger.error('Failed to fetch local models', error as Error, { provider: provider.name })
      return []
    }
  }

  private async fetchAPIModels(provider: IAIProvider): Promise<any[]> {
    try {
      this.logger.debug('🚀 Starting fetchAPIModels', { providerName: provider.name })
      
      if (!provider.apiKey) {
        this.logger.warn('❌ No API key provided for provider', { provider: provider.name })
        throw new AIProviderError('API key is required to fetch models', provider.name)
      }

      this.logger.debug('✅ API key exists, proceeding with model fetch', {
        provider: provider.name,
        providerLowerCase: provider.name.toLowerCase()
      })

      const lowerCaseName = provider.name.toLowerCase()
      this.logger.debug('🔄 About to switch on provider name', { 
        lowerCaseName,
        originalName: provider.name 
      })

      switch (lowerCaseName) {
        case 'openai':
          this.logger.debug('Matched OpenAI case, calling fetchOpenAIModels')
          return await this.fetchOpenAIModels(provider)
        case 'anthropic':
          this.logger.debug('Matched Anthropic case, calling fetchAnthropicModels')
          return await this.fetchAnthropicModels(provider)
        case 'google':
          this.logger.debug('Matched Google case, calling fetchGoogleAIModels')
          return await this.fetchGoogleAIModels(provider)
        case 'openrouter':
          this.logger.debug('Matched OpenRouter case, calling fetchOpenRouterModels')
          return await this.fetchOpenRouterModels(provider)
        default:
          this.logger.warn('❌ API model fetching not implemented for provider', {
            provider: provider.name,
            providerLowerCase: provider.name.toLowerCase(),
            receivedLowerCase: lowerCaseName,
            exactMatch: lowerCaseName === 'openai',
            availableCases: ['openai', 'anthropic', 'google', 'openrouter']
          })
          return []
      }
    } catch (error) {
      this.logger.error('Failed to fetch API models', error as Error, { provider: provider.name })
      return []
    }
  }

  private async fetchOpenAIModels(provider: IAIProvider): Promise<any[]> {
    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${provider.apiKey}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json() as { data?: any[] }
      return data.data?.filter((model: any) => {
        // Only include chat models, exclude embedding/other models
        const chatModels = ['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo', 'gpt-4o']
        return chatModels.some(cm => model.id.includes(cm))
      }).map((model: any) => ({
        modelId: model.id,
        modelName: model.id,
        isDefault: model.id === 'gpt-3.5-turbo',
        isAvailable: true,
        isSelected: false,
        description: `OpenAI model: ${model.id}`,
        metadata: {
          owned_by: model.owned_by,
          created: model.created
        }
      })) || []
    } catch (error) {
      this.logger.error('Failed to fetch OpenAI models', error as Error)
      return []
    }
  }

  private async fetchAnthropicModels(provider: IAIProvider): Promise<any[]> {
    // Anthropic doesn't have a public models endpoint, so we return known models
    return [
      {
        modelId: 'claude-3-5-sonnet-20241022',
        modelName: 'Claude 3.5 Sonnet',
        isDefault: true,
        isAvailable: true,
        isSelected: false,
        description: 'Most intelligent model, ideal for complex tasks',
        metadata: { version: '20241022' }
      },
      {
        modelId: 'claude-3-haiku-20240307',
        modelName: 'Claude 3 Haiku',
        isDefault: false,
        isAvailable: true,
        isSelected: false,
        description: 'Fastest model, ideal for simple tasks',
        metadata: { version: '20240307' }
      },
      {
        modelId: 'claude-3-opus-20240229',
        modelName: 'Claude 3 Opus',
        isDefault: false,
        isAvailable: true,
        isSelected: false,
        description: 'Most powerful model for complex reasoning',
        metadata: { version: '20240229' }
      }
    ]
  }

  private async fetchGoogleAIModels(provider: IAIProvider): Promise<any[]> {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${provider.apiKey}`)

      if (!response.ok) {
        throw new Error(`Google AI API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json() as { models?: any[] }
      return data.models?.filter((model: any) => {
        // Only include generateContent models
        return model.supportedGenerationMethods?.includes('generateContent')
      }).map((model: any) => ({
        modelId: model.name.split('/').pop(),
        modelName: model.displayName || model.name.split('/').pop(),
        isDefault: model.name.includes('gemini-pro'),
        isAvailable: true,
        isSelected: false,
        description: model.description || `Google AI model: ${model.displayName}`,
        metadata: {
          version: model.version,
          inputTokenLimit: model.inputTokenLimit,
          outputTokenLimit: model.outputTokenLimit
        }
      })) || []
    } catch (error) {
      this.logger.error('Failed to fetch Google AI models', error as Error)
      return []
    }
  }

  private async fetchOpenRouterModels(provider: IAIProvider): Promise<any[]> {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
          'Authorization': `Bearer ${provider.apiKey}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json() as { data?: any[] }
      return data.data?.map((model: any) => ({
        modelId: model.id,
        modelName: model.name || model.id,
        isDefault: false,
        isAvailable: true,
        isSelected: false,
        description: model.description || `${model.name} - Context: ${model.context_length}`,
        metadata: {
          context_length: model.context_length,
          pricing: model.pricing,
          architecture: model.architecture
        }
      })) || []
    } catch (error) {
      this.logger.error('Failed to fetch OpenRouter models', error as Error)
      return []
    }
  }
}