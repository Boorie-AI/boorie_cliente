// Embedding Service - Handles text embedding generation and similarity calculations

import { IServiceResponse } from '../models'
import { createLogger } from '../utils/logger'
import { DatabaseService } from './database.service'

const logger = createLogger('EmbeddingService')

export interface EmbeddingModel {
  id: string
  name: string
  provider: string
  type: 'embedding' | 'chat'
  isAvailable: boolean
}

export class EmbeddingService {
  private databaseService: DatabaseService

  constructor(databaseService: DatabaseService) {
    this.databaseService = databaseService
    logger.info('Embedding service initialized')
  }

  async generateEmbedding(
    text: string,
    model: string,
    provider: string
  ): Promise<IServiceResponse<number[]>> {
    try {
      logger.debug('Generating embedding', { 
        textLength: text.length, 
        model, 
        provider 
      })

      if (!text.trim()) {
        return {
          success: false,
          error: 'Text content is empty'
        }
      }

      let embedding: number[]

      switch (provider.toLowerCase()) {
        case 'ollama':
          embedding = await this.generateOllamaEmbedding(text, model)
          break
        case 'openai':
          embedding = await this.generateOpenAIEmbedding(text, model)
          break
        case 'anthropic':
          // Anthropic doesn't have embedding models, fallback to OpenAI
          return {
            success: false,
            error: 'Anthropic does not provide embedding models'
          }
        default:
          return {
            success: false,
            error: `Unsupported embedding provider: ${provider}`
          }
      }

      logger.success('Generated embedding', { 
        textLength: text.length, 
        model, 
        provider,
        embeddingDimensions: embedding.length
      })

      return {
        success: true,
        data: embedding
      }
    } catch (error) {
      logger.error('Failed to generate embedding', error as Error, { model, provider })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate embedding'
      }
    }
  }

  async getAvailableEmbeddingModels(): Promise<IServiceResponse<{ local: EmbeddingModel[], api: EmbeddingModel[] }>> {
    try {
      logger.debug('Fetching available embedding models')

      const providersResult = await this.databaseService.getAIProviders()
      if (!providersResult.success || !providersResult.data) {
        return {
          success: false,
          error: 'Failed to get AI providers'
        }
      }

      const localModels: EmbeddingModel[] = []
      const apiModels: EmbeddingModel[] = []

      for (const provider of providersResult.data) {
        if (!provider.isConnected) continue

        const modelsResult = await this.databaseService.getAIModels(provider.id)
        if (!modelsResult.success || !modelsResult.data) continue

        for (const model of modelsResult.data) {
          if (!model.isAvailable) continue

          // Filter for embedding models
          const isEmbeddingModel = this.isEmbeddingModel(model.modelId, provider.name)
          if (!isEmbeddingModel) continue

          const embeddingModel: EmbeddingModel = {
            id: model.id,
            name: model.modelName,
            provider: provider.name,
            type: 'embedding',
            isAvailable: model.isAvailable
          }

          if (provider.type === 'local') {
            localModels.push(embeddingModel)
          } else {
            apiModels.push(embeddingModel)
          }
        }
      }

      logger.success('Retrieved embedding models', { 
        localCount: localModels.length, 
        apiCount: apiModels.length 
      })

      return {
        success: true,
        data: { local: localModels, api: apiModels }
      }
    } catch (error) {
      logger.error('Failed to get available embedding models', error as Error)
      return {
        success: false,
        error: 'Failed to retrieve embedding models'
      }
    }
  }

  calculateSimilarity(embedding1: number[], embedding2: number[]): number {
    try {
      if (embedding1.length !== embedding2.length) {
        logger.warn('Embedding dimensions mismatch', { 
          dim1: embedding1.length, 
          dim2: embedding2.length 
        })
        return 0
      }

      // Calculate cosine similarity
      let dotProduct = 0
      let norm1 = 0
      let norm2 = 0

      for (let i = 0; i < embedding1.length; i++) {
        dotProduct += embedding1[i] * embedding2[i]
        norm1 += embedding1[i] * embedding1[i]
        norm2 += embedding2[i] * embedding2[i]
      }

      const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2)
      if (magnitude === 0) return 0

      return dotProduct / magnitude
    } catch (error) {
      logger.error('Failed to calculate similarity', error as Error)
      return 0
    }
  }

  // Private Methods
  private async generateOllamaEmbedding(text: string, model: string): Promise<number[]> {
    try {
      // Make request to Ollama API for embeddings
      const response = await fetch('http://localhost:11434/api/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model,
          prompt: text
        })
      })

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.statusText}`)
      }

      const data = await response.json() as { embedding?: number[] }
      
      if (!data.embedding) {
        throw new Error('No embedding returned from Ollama')
      }

      return data.embedding
    } catch (error) {
      logger.error('Failed to generate Ollama embedding', error as Error, { model })
      throw error
    }
  }

  private async generateOpenAIEmbedding(text: string, model: string): Promise<number[]> {
    try {
      // Get OpenAI API key from database
      const providerResult = await this.databaseService.getAIProviders()
      if (!providerResult.success || !providerResult.data) {
        throw new Error('Failed to get AI providers')
      }

      const openaiProvider = providerResult.data.find(p => p.name.toLowerCase().includes('openai'))
      if (!openaiProvider || !openaiProvider.apiKey) {
        throw new Error('OpenAI provider not configured')
      }

      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiProvider.apiKey}`
        },
        body: JSON.stringify({
          model: model,
          input: text
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`OpenAI API error: ${response.statusText} - ${JSON.stringify(errorData)}`)
      }

      const data = await response.json() as { data?: Array<{ embedding?: number[] }> }
      
      if (!data.data || !data.data[0] || !data.data[0].embedding) {
        throw new Error('No embedding returned from OpenAI')
      }

      return data.data[0].embedding
    } catch (error) {
      logger.error('Failed to generate OpenAI embedding', error as Error, { model })
      throw error
    }
  }

  private isEmbeddingModel(modelId: string, providerName: string): boolean {
    const embeddingModelPatterns = {
      ollama: [
        'nomic-embed',
        'mxbai-embed',
        'snowflake-arctic-embed',
        'all-minilm',
        'embed'
      ],
      openai: [
        'text-embedding-ada-002',
        'text-embedding-3-small',
        'text-embedding-3-large'
      ],
      google: [
        'embedding-001',
        'text-embedding'
      ]
    }

    const providerKey = providerName.toLowerCase()
    const patterns = embeddingModelPatterns[providerKey as keyof typeof embeddingModelPatterns] || []
    
    return patterns.some(pattern => 
      modelId.toLowerCase().includes(pattern.toLowerCase())
    )
  }
}