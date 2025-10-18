const { getDatabaseService } = require('./database.service')
const axios = require('axios')

const EMBEDDING_PROVIDERS = [
  {
    id: 'openai',
    name: 'OpenAI',
    model: 'text-embedding-3-small',
    dimension: 1536
  },
  {
    id: 'openai-large',
    name: 'OpenAI Large',
    model: 'text-embedding-3-large',
    dimension: 3072
  },
  {
    id: 'ollama-nomic',
    name: 'Ollama Nomic Embed',
    model: 'nomic-embed-text',
    dimension: 768
  },
  {
    id: 'ollama-mxbai',
    name: 'Ollama MxBai Embed',
    model: 'mxbai-embed-large',
    dimension: 1024
  },
  {
    id: 'ollama-all-minilm',
    name: 'Ollama All-MiniLM',
    model: 'all-minilm',
    dimension: 384
  }
]

class EmbeddingService {
  constructor() {
    // Default to OpenAI small embeddings
    this.activeProvider = EMBEDDING_PROVIDERS[0]
    this.providers = EMBEDDING_PROVIDERS
  }
  
  getProviders() {
    return this.providers
  }
  
  setProvider(providerId) {
    const provider = this.providers.find(p => p.id === providerId)
    if (provider) {
      this.activeProvider = provider
      console.log(`Switched to embedding provider: ${provider.name}`)
    } else {
      throw new Error(`Unknown embedding provider: ${providerId}`)
    }
  }
  
  async generateEmbedding(text) {
    try {
      // Check if it's an Ollama provider
      if (this.activeProvider.id.startsWith('ollama-')) {
        return await this.generateOllamaEmbedding(text)
      }
      
      // Otherwise use OpenAI
      return await this.generateOpenAIEmbedding(text)
      
    } catch (error) {
      console.error('Embedding generation error:', error)
      console.warn('Using mock embeddings due to error')
      return this.generateMockEmbedding(text)
    }
  }
  
  async generateOpenAIEmbedding(text) {
    // Get OpenAI provider from database
    const dbService = getDatabaseService()
    const providers = await dbService.getAIProviders()
    
    if (!providers.success || !providers.data) {
      console.warn('No AI providers found, using mock embeddings')
      return this.generateMockEmbedding(text)
    }
    
    const openaiProvider = providers.data.find(p => p.type === 'openai' && p.enabled)
    
    if (!openaiProvider || !openaiProvider.apiKey) {
      console.warn('OpenAI provider not configured or enabled, using mock embeddings')
      return this.generateMockEmbedding(text)
    }
    
    // Dynamically import OpenAI
    const { default: OpenAI } = await import('openai')
    const openai = new OpenAI({
      apiKey: openaiProvider.apiKey
    })
    
    const response = await openai.embeddings.create({
      model: this.activeProvider.model,
      input: text,
      encoding_format: 'float'
    })
    
    if (!response.data || response.data.length === 0) {
      throw new Error('No embedding returned from API')
    }
    
    return response.data[0].embedding
  }
  
  async generateOllamaEmbedding(text) {
    try {
      // Get Ollama provider configuration
      const dbService = getDatabaseService()
      const providers = await dbService.getAIProviders()
      
      if (!providers.success || !providers.data) {
        console.warn('No AI providers found, using mock embeddings')
        return this.generateMockEmbedding(text)
      }
      
      const ollamaProvider = providers.data.find(p => p.type === 'ollama' && p.enabled)
      const baseUrl = ollamaProvider?.baseUrl || 'http://localhost:11434'
      
      // Check if the model is available
      try {
        const modelsResponse = await axios.get(`${baseUrl}/api/tags`)
        const availableModels = modelsResponse.data.models || []
        const modelExists = availableModels.some(m => m.name === this.activeProvider.model)
        
        if (!modelExists) {
          console.warn(`Ollama model ${this.activeProvider.model} not found. Please pull it with: ollama pull ${this.activeProvider.model}`)
          return this.generateMockEmbedding(text)
        }
      } catch (error) {
        console.warn('Could not check Ollama models, attempting to use anyway...')
      }
      
      // Generate embedding
      const response = await axios.post(`${baseUrl}/api/embeddings`, {
        model: this.activeProvider.model,
        prompt: text
      })
      
      if (!response.data || !response.data.embedding) {
        throw new Error('No embedding returned from Ollama')
      }
      
      return response.data.embedding
      
    } catch (error) {
      console.error('Ollama embedding error:', error.message)
      console.warn('Using mock embeddings due to Ollama error')
      return this.generateMockEmbedding(text)
    }
  }
  
  async generateBatchEmbeddings(texts) {
    try {
      // For Ollama, we need to generate embeddings one by one
      if (this.activeProvider.id.startsWith('ollama-')) {
        const embeddings = []
        for (const text of texts) {
          const embedding = await this.generateEmbedding(text)
          embeddings.push(embedding)
        }
        return embeddings
      }
      
      // For OpenAI, we can batch
      const dbService = getDatabaseService()
      const providers = await dbService.getAIProviders()
      
      if (!providers.success || !providers.data) {
        console.warn('No AI providers found, using mock embeddings')
        return texts.map(text => this.generateMockEmbedding(text))
      }
      
      const openaiProvider = providers.data.find(p => p.type === 'openai' && p.enabled)
      
      if (!openaiProvider || !openaiProvider.apiKey) {
        console.warn('OpenAI provider not configured or enabled, using mock embeddings')
        return texts.map(text => this.generateMockEmbedding(text))
      }
      
      const { default: OpenAI } = await import('openai')
      const openai = new OpenAI({
        apiKey: openaiProvider.apiKey
      })
      
      const response = await openai.embeddings.create({
        model: this.activeProvider.model,
        input: texts,
        encoding_format: 'float'
      })
      
      return response.data.map(item => item.embedding)
      
    } catch (error) {
      console.error('Batch embedding generation error:', error)
      return texts.map(text => this.generateMockEmbedding(text))
    }
  }
  
  cosineSimilarity(a, b) {
    if (a.length !== b.length) {
      throw new Error('Embeddings must have the same dimension')
    }
    
    let dotProduct = 0
    let normA = 0
    let normB = 0
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i]
      normA += a[i] * a[i]
      normB += b[i] * b[i]
    }
    
    normA = Math.sqrt(normA)
    normB = Math.sqrt(normB)
    
    if (normA === 0 || normB === 0) {
      return 0
    }
    
    return dotProduct / (normA * normB)
  }
  
  generateMockEmbedding(text) {
    const dimension = this.activeProvider.dimension
    const embedding = []
    
    // Use text hash as seed for consistent embeddings
    let hash = 0
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash) + text.charCodeAt(i)
      hash |= 0 // Convert to 32-bit integer
    }
    
    // Generate pseudo-random embedding based on hash
    for (let i = 0; i < dimension; i++) {
      hash = (hash * 1103515245 + 12345) & 0x7fffffff
      embedding.push((hash / 0x7fffffff) * 2 - 1) // Normalize to [-1, 1]
    }
    
    return embedding
  }
}

module.exports = EmbeddingService