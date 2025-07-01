"use strict";
// AI Provider Service - Business logic for AI provider and model management
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIProviderService = void 0;
const models_1 = require("../models");
const logger_1 = require("../utils/logger");
const validation_1 = require("../utils/validation");
class AIProviderService {
    constructor(databaseService) {
        this.logger = logger_1.aiProviderLogger;
        this.databaseService = databaseService;
        this.logger.info('AI Provider service initialized');
    }
    // AI Provider Operations
    async getAllProviders() {
        try {
            this.logger.debug('Getting all AI providers');
            const result = await this.databaseService.getAIProviders();
            if (!result.success) {
                throw new models_1.ServiceError(result.error || 'Failed to get AI providers', 'DATABASE_ERROR');
            }
            this.logger.success(`Retrieved ${result.data?.length || 0} AI providers`);
            return result;
        }
        catch (error) {
            this.logger.error('Failed to get all AI providers', error);
            return {
                success: false,
                error: error instanceof models_1.ServiceError ? error.message : 'Failed to retrieve AI providers'
            };
        }
    }
    async getProviderById(id) {
        try {
            (0, validation_1.validateString)(id, 'Provider ID');
            this.logger.debug('Getting AI provider by ID', { id });
            const providers = await this.databaseService.getAIProviders();
            if (!providers.success || !providers.data) {
                throw new models_1.ServiceError('Failed to get providers', 'DATABASE_ERROR');
            }
            const provider = providers.data.find(p => p.id === id);
            if (!provider) {
                throw new models_1.ServiceError('AI provider not found', 'NOT_FOUND', 404);
            }
            this.logger.success('Retrieved AI provider', { id, name: provider.name });
            return {
                success: true,
                data: provider
            };
        }
        catch (error) {
            this.logger.error('Failed to get AI provider by ID', error, { id });
            return {
                success: false,
                error: error instanceof models_1.ServiceError ? error.message : 'Failed to retrieve AI provider'
            };
        }
    }
    async createProvider(data) {
        try {
            this.logger.debug('Creating new AI provider', { name: data.name, type: data.type });
            // Validate input data
            this.validateProviderData(data);
            // Check if provider with this name already exists
            const existingProviders = await this.databaseService.getAIProviders();
            if (existingProviders.success && existingProviders.data) {
                const duplicate = existingProviders.data.find(p => p.name === data.name);
                if (duplicate) {
                    throw new models_1.ServiceError(`AI provider with name '${data.name}' already exists`, 'DUPLICATE_ERROR', 409);
                }
            }
            // Create the provider
            const result = await this.databaseService.createAIProvider(data);
            if (!result.success) {
                throw new models_1.ServiceError(result.error || 'Failed to create AI provider', 'DATABASE_ERROR');
            }
            this.logger.success('Created AI provider', {
                id: result.data?.id,
                name: result.data?.name
            });
            return result;
        }
        catch (error) {
            this.logger.error('Failed to create AI provider', error, data);
            return {
                success: false,
                error: error instanceof models_1.ServiceError ? error.message : 'Failed to create AI provider'
            };
        }
    }
    async updateProvider(id, updates) {
        try {
            (0, validation_1.validateString)(id, 'Provider ID');
            this.logger.debug('Updating AI provider', { id, updates });
            // Validate updates
            this.validateProviderUpdates(updates);
            // Check if provider exists
            const existingResult = await this.getProviderById(id);
            if (!existingResult.success) {
                throw new models_1.ServiceError('AI provider not found', 'NOT_FOUND', 404);
            }
            // Check for name conflicts if name is being updated
            if (updates.name && updates.name !== existingResult.data?.name) {
                const allProviders = await this.databaseService.getAIProviders();
                if (allProviders.success && allProviders.data) {
                    const duplicate = allProviders.data.find(p => p.name === updates.name && p.id !== id);
                    if (duplicate) {
                        throw new models_1.ServiceError(`AI provider with name '${updates.name}' already exists`, 'DUPLICATE_ERROR', 409);
                    }
                }
            }
            // Update the provider
            const result = await this.databaseService.updateAIProvider(id, updates);
            if (!result.success) {
                throw new models_1.ServiceError(result.error || 'Failed to update AI provider', 'DATABASE_ERROR');
            }
            this.logger.success('Updated AI provider', {
                id: result.data?.id,
                name: result.data?.name
            });
            return result;
        }
        catch (error) {
            this.logger.error('Failed to update AI provider', error, { id, updates });
            return {
                success: false,
                error: error instanceof models_1.ServiceError ? error.message : 'Failed to update AI provider'
            };
        }
    }
    async testProviderConnection(id) {
        try {
            (0, validation_1.validateString)(id, 'Provider ID');
            this.logger.debug('Testing AI provider connection', { id });
            // Get provider details
            const providerResult = await this.getProviderById(id);
            if (!providerResult.success || !providerResult.data) {
                throw new models_1.ServiceError('AI provider not found', 'NOT_FOUND', 404);
            }
            const provider = providerResult.data;
            let testResult;
            let testMessage;
            try {
                // Test connection based on provider type
                if (provider.type === 'local') {
                    testResult = await this.testLocalProvider(provider);
                    testMessage = testResult ? 'Local provider connection successful' : 'Local provider connection failed';
                }
                else {
                    testResult = await this.testAPIProvider(provider);
                    testMessage = testResult ? 'API provider connection successful' : 'API provider connection failed';
                }
            }
            catch (error) {
                testResult = false;
                testMessage = error instanceof Error ? error.message : 'Connection test failed';
            }
            // Update provider with test results
            await this.databaseService.updateAIProvider(id, {
                isConnected: testResult,
                lastTestResult: testResult ? 'success' : 'error',
                lastTestMessage: testMessage
            });
            this.logger.success('Tested AI provider connection', {
                id,
                name: provider.name,
                result: testResult
            });
            return {
                success: true,
                data: testResult,
                message: testMessage
            };
        }
        catch (error) {
            this.logger.error('Failed to test AI provider connection', error, { id });
            return {
                success: false,
                error: error instanceof models_1.ServiceError ? error.message : 'Failed to test connection'
            };
        }
    }
    // AI Model Operations
    async getModelsForProvider(providerId) {
        try {
            (0, validation_1.validateString)(providerId, 'Provider ID');
            this.logger.debug('Getting models for provider', { providerId });
            const result = await this.databaseService.getAIModels(providerId);
            if (!result.success) {
                throw new models_1.ServiceError(result.error || 'Failed to get AI models', 'DATABASE_ERROR');
            }
            this.logger.success(`Retrieved ${result.data?.length || 0} models for provider`, { providerId });
            return result;
        }
        catch (error) {
            this.logger.error('Failed to get models for provider', error, { providerId });
            return {
                success: false,
                error: error instanceof models_1.ServiceError ? error.message : 'Failed to retrieve models'
            };
        }
    }
    async getAllModels() {
        try {
            this.logger.debug('Getting all AI models');
            const result = await this.databaseService.getAIModels();
            if (!result.success) {
                throw new models_1.ServiceError(result.error || 'Failed to get AI models', 'DATABASE_ERROR');
            }
            this.logger.success(`Retrieved ${result.data?.length || 0} AI models`);
            return result;
        }
        catch (error) {
            this.logger.error('Failed to get all AI models', error);
            return {
                success: false,
                error: error instanceof models_1.ServiceError ? error.message : 'Failed to retrieve models'
            };
        }
    }
    async saveModel(modelData) {
        try {
            this.logger.debug('Saving AI model', {
                providerId: modelData.providerId,
                modelId: modelData.modelId
            });
            // Validate model data
            this.validateModelData(modelData);
            // Save or update the model
            const result = await this.databaseService.createOrUpdateAIModel(modelData);
            if (!result.success) {
                throw new models_1.ServiceError(result.error || 'Failed to save AI model', 'DATABASE_ERROR');
            }
            this.logger.success('Saved AI model', {
                id: result.data?.id,
                modelName: result.data?.modelName
            });
            return result;
        }
        catch (error) {
            this.logger.error('Failed to save AI model', error, modelData);
            return {
                success: false,
                error: error instanceof models_1.ServiceError ? error.message : 'Failed to save model'
            };
        }
    }
    async deleteModelsForProvider(providerId) {
        try {
            (0, validation_1.validateString)(providerId, 'Provider ID');
            this.logger.debug('Deleting models for provider', { providerId });
            // Check if provider exists
            const providerResult = await this.getProviderById(providerId);
            if (!providerResult.success) {
                throw new models_1.ServiceError('AI provider not found', 'NOT_FOUND', 404);
            }
            // Delete models
            const result = await this.databaseService.deleteAIModels(providerId);
            if (!result.success) {
                throw new models_1.ServiceError(result.error || 'Failed to delete AI models', 'DATABASE_ERROR');
            }
            this.logger.success('Deleted models for provider', { providerId });
            return result;
        }
        catch (error) {
            this.logger.error('Failed to delete models for provider', error, { providerId });
            return {
                success: false,
                error: error instanceof models_1.ServiceError ? error.message : 'Failed to delete models'
            };
        }
    }
    async refreshProviderModels(providerId) {
        try {
            (0, validation_1.validateString)(providerId, 'Provider ID');
            this.logger.debug('Refreshing models for provider', { providerId });
            // Get provider details
            const providerResult = await this.getProviderById(providerId);
            if (!providerResult.success || !providerResult.data) {
                throw new models_1.ServiceError('AI provider not found', 'NOT_FOUND', 404);
            }
            const provider = providerResult.data;
            // Delete existing models
            await this.deleteModelsForProvider(providerId);
            // Fetch new models based on provider type
            let models = [];
            if (provider.type === 'local') {
                models = await this.fetchLocalModels(provider);
            }
            else {
                models = await this.fetchAPIModels(provider);
            }
            // Save new models
            const savedModels = [];
            for (const modelData of models) {
                const saveResult = await this.saveModel({
                    ...modelData,
                    providerId: providerId
                });
                if (saveResult.success && saveResult.data) {
                    savedModels.push(saveResult.data);
                }
            }
            this.logger.success('Refreshed models for provider', {
                providerId,
                modelCount: savedModels.length
            });
            return {
                success: true,
                data: savedModels
            };
        }
        catch (error) {
            this.logger.error('Failed to refresh provider models', error, { providerId });
            return {
                success: false,
                error: error instanceof models_1.ServiceError ? error.message : 'Failed to refresh models'
            };
        }
    }
    // Private helper methods
    validateProviderData(data) {
        (0, validation_1.validateString)(data.name, 'Name', 1, 100);
        (0, validation_1.validateRequired)(data.type, 'Type');
        if (!['local', 'api'].includes(data.type)) {
            throw new models_1.ServiceError('Type must be either "local" or "api"', 'VALIDATION_ERROR');
        }
        (0, validation_1.validateBoolean)(data.isActive, 'Is Active');
        (0, validation_1.validateBoolean)(data.isConnected, 'Is Connected');
        if (data.apiKey !== undefined && data.apiKey !== null) {
            (0, validation_1.validateString)(data.apiKey, 'API Key');
        }
    }
    validateProviderUpdates(updates) {
        if (updates.name !== undefined) {
            (0, validation_1.validateString)(updates.name, 'Name', 1, 100);
        }
        if (updates.type !== undefined) {
            if (!['local', 'api'].includes(updates.type)) {
                throw new models_1.ServiceError('Type must be either "local" or "api"', 'VALIDATION_ERROR');
            }
        }
        if (updates.isActive !== undefined) {
            (0, validation_1.validateBoolean)(updates.isActive, 'Is Active');
        }
        if (updates.isConnected !== undefined) {
            (0, validation_1.validateBoolean)(updates.isConnected, 'Is Connected');
        }
        if (updates.apiKey !== undefined && updates.apiKey !== null) {
            (0, validation_1.validateString)(updates.apiKey, 'API Key');
        }
    }
    validateModelData(data) {
        (0, validation_1.validateString)(data.providerId, 'Provider ID');
        (0, validation_1.validateString)(data.modelName, 'Model Name', 1, 100);
        (0, validation_1.validateString)(data.modelId, 'Model ID', 1, 100);
        (0, validation_1.validateBoolean)(data.isAvailable, 'Is Available');
        (0, validation_1.validateBoolean)(data.isSelected, 'Is Selected');
        if (data.isDefault !== undefined) {
            (0, validation_1.validateBoolean)(data.isDefault, 'Is Default');
        }
    }
    async testLocalProvider(provider) {
        try {
            // Test Ollama connection
            const ollamaUrl = provider.config?.baseUrl || 'http://localhost:11434';
            const response = await fetch(`${ollamaUrl}/api/tags`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });
            return response.ok;
        }
        catch (error) {
            this.logger.warn('Local provider test failed', { provider: provider.name, error });
            return false;
        }
    }
    async testAPIProvider(provider) {
        try {
            if (!provider.apiKey) {
                throw new models_1.AIProviderError('API key is required for API providers', provider.name);
            }
            // Basic API key validation - could be expanded for specific providers
            switch (provider.name.toLowerCase()) {
                case 'openai':
                    return await this.testOpenAI(provider);
                case 'anthropic':
                    return await this.testAnthropic(provider);
                case 'google':
                    return await this.testGoogleAI(provider);
                default:
                    // Generic test - just check if API key is provided
                    return !!provider.apiKey;
            }
        }
        catch (error) {
            this.logger.warn('API provider test failed', { provider: provider.name, error });
            return false;
        }
    }
    async testOpenAI(provider) {
        try {
            const response = await fetch('https://api.openai.com/v1/models', {
                headers: {
                    'Authorization': `Bearer ${provider.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });
            return response.ok;
        }
        catch {
            return false;
        }
    }
    async testAnthropic(provider) {
        // Anthropic doesn't have a simple endpoint to test, so we just validate the key format
        return !!provider.apiKey && provider.apiKey.startsWith('sk-ant-');
    }
    async testGoogleAI(provider) {
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${provider.apiKey}`);
            return response.ok;
        }
        catch {
            return false;
        }
    }
    async fetchLocalModels(provider) {
        try {
            const ollamaUrl = provider.config?.baseUrl || 'http://localhost:11434';
            const response = await fetch(`${ollamaUrl}/api/tags`);
            if (!response.ok) {
                throw new models_1.AIProviderError('Failed to fetch local models', provider.name);
            }
            const data = await response.json();
            return data.models?.map((model) => ({
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
            })) || [];
        }
        catch (error) {
            this.logger.error('Failed to fetch local models', error, { provider: provider.name });
            return [];
        }
    }
    async fetchAPIModels(provider) {
        // This would need to be implemented based on each provider's API
        // For now, return empty array
        this.logger.warn('API model fetching not implemented yet', { provider: provider.name });
        return [];
    }
}
exports.AIProviderService = AIProviderService;
