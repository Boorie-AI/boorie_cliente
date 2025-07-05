"use strict";
// Embedding Service - Handles text embedding generation and similarity calculations
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmbeddingService = void 0;
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('EmbeddingService');
class EmbeddingService {
    constructor(databaseService) {
        this.databaseService = databaseService;
        logger.info('Embedding service initialized');
    }
    async generateEmbedding(text, model, provider) {
        try {
            logger.debug('Generating embedding', {
                textLength: text.length,
                model,
                provider
            });
            if (!text.trim()) {
                return {
                    success: false,
                    error: 'Text content is empty'
                };
            }
            let embedding;
            switch (provider.toLowerCase()) {
                case 'ollama':
                    embedding = await this.generateOllamaEmbedding(text, model);
                    break;
                case 'openai':
                    embedding = await this.generateOpenAIEmbedding(text, model);
                    break;
                case 'anthropic':
                    // Anthropic doesn't have embedding models, fallback to OpenAI
                    return {
                        success: false,
                        error: 'Anthropic does not provide embedding models'
                    };
                default:
                    return {
                        success: false,
                        error: `Unsupported embedding provider: ${provider}`
                    };
            }
            logger.success('Generated embedding', {
                textLength: text.length,
                model,
                provider,
                embeddingDimensions: embedding.length
            });
            return {
                success: true,
                data: embedding
            };
        }
        catch (error) {
            logger.error('Failed to generate embedding', error, { model, provider });
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to generate embedding'
            };
        }
    }
    async getAvailableEmbeddingModels() {
        try {
            logger.debug('Fetching available embedding models');
            const localModels = [];
            const apiModels = [];
            // Auto-detect Ollama models directly from Ollama API
            const ollamaModels = await this.getOllamaEmbeddingModels();
            localModels.push(...ollamaModels);
            // Get API providers from database (for OpenAI, etc.)
            const providersResult = await this.databaseService.getAIProviders();
            if (providersResult.success && providersResult.data) {
                logger.debug('Found AI providers', {
                    count: providersResult.data.length,
                    providers: providersResult.data.map(p => ({ name: p.name, type: p.type, isConnected: p.isConnected }))
                });
                for (const provider of providersResult.data) {
                    logger.debug('Processing provider', {
                        name: provider.name,
                        type: provider.type,
                        isConnected: provider.isConnected
                    });
                    if (!provider.isConnected || provider.type === 'local') {
                        logger.debug('Skipping disconnected or local provider', { name: provider.name });
                        continue;
                    }
                    const modelsResult = await this.databaseService.getAIModels(provider.id);
                    if (!modelsResult.success || !modelsResult.data) {
                        logger.warn('Failed to get models for provider', {
                            providerId: provider.id,
                            providerName: provider.name,
                            error: modelsResult.error
                        });
                        continue;
                    }
                    for (const model of modelsResult.data) {
                        if (!model.isAvailable) {
                            continue;
                        }
                        // Filter for embedding models
                        const isEmbeddingModel = this.isEmbeddingModel(model.modelId, provider.name);
                        if (!isEmbeddingModel) {
                            if (model.modelId.toLowerCase().includes('embed') || model.modelName.toLowerCase().includes('embed')) {
                                logger.debug('Potential embedding model not detected', {
                                    modelId: model.modelId,
                                    modelName: model.modelName,
                                    provider: provider.name
                                });
                            }
                            continue;
                        }
                        const embeddingModel = {
                            id: model.id,
                            name: model.modelName,
                            provider: provider.name,
                            type: 'embedding',
                            isAvailable: model.isAvailable
                        };
                        apiModels.push(embeddingModel);
                        logger.debug('Added API embedding model', embeddingModel);
                    }
                }
            }
            logger.success('Retrieved embedding models', {
                localCount: localModels.length,
                apiCount: apiModels.length,
                localModels: localModels.map(m => m.name),
                apiModels: apiModels.map(m => m.name)
            });
            return {
                success: true,
                data: { local: localModels, api: apiModels }
            };
        }
        catch (error) {
            logger.error('Failed to get available embedding models', error);
            return {
                success: false,
                error: 'Failed to retrieve embedding models'
            };
        }
    }
    calculateSimilarity(embedding1, embedding2) {
        try {
            if (embedding1.length !== embedding2.length) {
                logger.warn('Embedding dimensions mismatch', {
                    dim1: embedding1.length,
                    dim2: embedding2.length
                });
                return 0;
            }
            // Calculate cosine similarity
            let dotProduct = 0;
            let norm1 = 0;
            let norm2 = 0;
            for (let i = 0; i < embedding1.length; i++) {
                dotProduct += embedding1[i] * embedding2[i];
                norm1 += embedding1[i] * embedding1[i];
                norm2 += embedding2[i] * embedding2[i];
            }
            const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2);
            if (magnitude === 0)
                return 0;
            return dotProduct / magnitude;
        }
        catch (error) {
            logger.error('Failed to calculate similarity', error);
            return 0;
        }
    }
    // Private Methods
    async getOllamaEmbeddingModels() {
        try {
            logger.debug('Fetching Ollama models directly from API');
            const response = await fetch('http://127.0.0.1:11434/api/tags', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            logger.debug('Ollama API response status', { status: response.status, ok: response.ok });
            if (!response.ok) {
                logger.error('Failed to fetch Ollama models', new Error(`HTTP ${response.status}: ${response.statusText}`));
                return [];
            }
            const data = await response.json();
            logger.debug('Ollama API response data', {
                hasModels: !!data.models,
                modelCount: data.models?.length || 0,
                models: data.models?.map(m => m.name) || []
            });
            if (!data.models || data.models.length === 0) {
                logger.warn('No models found in Ollama response');
                return [];
            }
            const embeddingModels = [];
            for (const model of data.models) {
                const modelName = model.name;
                // Log all models for debugging
                logger.info('Checking Ollama model', {
                    modelName,
                    size: model.size,
                    modified: model.modified_at
                });
                // Check if it's an embedding model
                const isEmbedding = this.isOllamaEmbeddingModel(modelName);
                logger.info('Ollama embedding check result', {
                    modelName,
                    isEmbedding
                });
                if (isEmbedding) {
                    embeddingModels.push({
                        id: modelName,
                        name: modelName,
                        provider: 'Ollama',
                        type: 'embedding',
                        isAvailable: true
                    });
                    logger.success('Added Ollama embedding model', { modelName });
                }
            }
            logger.success('Retrieved Ollama embedding models', {
                count: embeddingModels.length,
                models: embeddingModels.map(m => m.name)
            });
            return embeddingModels;
        }
        catch (error) {
            logger.error('Failed to fetch Ollama models', error);
            return [];
        }
    }
    isOllamaEmbeddingModel(modelName) {
        const modelNameLower = modelName.toLowerCase();
        // List of known embedding model patterns for Ollama
        const embeddingPatterns = [
            'embed',
            'embedding',
            'e5-',
            'bge-',
            'all-minilm',
            'sentence-transformer'
        ];
        // Check if model name contains any embedding pattern
        const isEmbedding = embeddingPatterns.some(pattern => modelNameLower.includes(pattern));
        logger.debug('Ollama embedding model check', {
            modelName,
            modelNameLower,
            isEmbedding,
            matchedPattern: embeddingPatterns.find(p => modelNameLower.includes(p))
        });
        return isEmbedding;
    }
    async generateOllamaEmbedding(text, model) {
        try {
            // Make request to Ollama API for embeddings
            const response = await fetch('http://127.0.0.1:11434/api/embeddings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: model,
                    prompt: text
                })
            });
            if (!response.ok) {
                throw new Error(`Ollama API error: ${response.statusText}`);
            }
            const data = await response.json();
            if (!data.embedding) {
                throw new Error('No embedding returned from Ollama');
            }
            return data.embedding;
        }
        catch (error) {
            logger.error('Failed to generate Ollama embedding', error, { model });
            throw error;
        }
    }
    async generateOpenAIEmbedding(text, model) {
        try {
            // Get OpenAI API key from database
            const providerResult = await this.databaseService.getAIProviders();
            if (!providerResult.success || !providerResult.data) {
                throw new Error('Failed to get AI providers');
            }
            const openaiProvider = providerResult.data.find(p => p.name.toLowerCase().includes('openai'));
            if (!openaiProvider || !openaiProvider.apiKey) {
                throw new Error('OpenAI provider not configured');
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
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`OpenAI API error: ${response.statusText} - ${JSON.stringify(errorData)}`);
            }
            const data = await response.json();
            if (!data.data || !data.data[0] || !data.data[0].embedding) {
                throw new Error('No embedding returned from OpenAI');
            }
            return data.data[0].embedding;
        }
        catch (error) {
            logger.error('Failed to generate OpenAI embedding', error, { model });
            throw error;
        }
    }
    isEmbeddingModel(modelId, providerName) {
        const modelIdLower = modelId.toLowerCase();
        const providerKey = providerName.toLowerCase();
        // Special handling for Ollama models
        if (providerKey.includes('ollama')) {
            const ollamaEmbeddingPatterns = [
                'nomic-embed',
                'mxbai-embed',
                'snowflake-arctic-embed',
                'all-minilm',
                'sentence-transformer',
                'e5-',
                'bge-'
            ];
            const isOllamaEmbedding = ollamaEmbeddingPatterns.some(pattern => modelIdLower.includes(pattern));
            if (isOllamaEmbedding) {
                logger.debug('Ollama embedding model detected', { modelId, pattern: ollamaEmbeddingPatterns.find(p => modelIdLower.includes(p)) });
                return true;
            }
        }
        const embeddingModelPatterns = {
            openai: [
                'text-embedding-ada-002',
                'text-embedding-3-small',
                'text-embedding-3-large'
            ],
            google: [
                'embedding-001',
                'text-embedding'
            ],
            openrouter: [
                'text-embedding',
                'embedding'
            ]
        };
        const patterns = embeddingModelPatterns[providerKey] || [];
        const isMatch = patterns.some(pattern => modelIdLower.includes(pattern.toLowerCase()));
        if (modelIdLower.includes('embed') && !isMatch && !providerKey.includes('openrouter')) {
            logger.debug('Potential embedding model not matched by patterns', {
                modelId,
                providerName: providerKey,
                patterns
            });
        }
        return isMatch;
    }
}
exports.EmbeddingService = EmbeddingService;
