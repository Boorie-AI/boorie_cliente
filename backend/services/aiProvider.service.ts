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
import { PAREJAS } from './hydraulic/agentic/modelosRAG'
import { probarClaveNvidia, type ResultadoPruebaNvidia } from './ai/pruebaNvidia'
import { claveUtilizable, type EstadoPublicoClave, estadoPublico } from './security/clavesProveedor'
import { probarClaveExterna, rechazaLaClave, tienePrueba, type ResultadoPrueba } from './ai/pruebaProveedores'
import { olvidarModeloElegidoDe, puedeActivarse, SIN_CLAVE_VALIDADA } from './security/proveedoresActivos'

export class AIProviderService {
  private databaseService: DatabaseService
  private logger = aiProviderLogger
  /** La prueba y la carga de modelos van seguidas: así la segunda no repite las peticiones. */
  private ultimaPruebaNvidia: { apiKey: string; resultado: ResultadoPruebaNvidia } | null = null
  private ultimaPrueba = new Map<string, { apiKey: string; resultado: ResultadoPrueba }>()

  constructor(databaseService: DatabaseService) {
    this.databaseService = databaseService
    this.logger.info('AI Provider service initialized')
  }

  // AI Provider Operations
  async initializeDefaultProviders(): Promise<void> {
    try {
      this.logger.info('Initializing default AI providers')

      const providers = [
        {
          name: 'openai',
          type: 'api',
          apiKey: process.env.OPENAI_API_KEY,
          config: { baseUrl: 'https://api.openai.com/v1' }
        },
        {
          name: 'anthropic',
          type: 'api',
          apiKey: process.env.ANTHROPIC_API_KEY,
          config: { baseUrl: 'https://api.anthropic.com/v1' }
        },
        {
          name: 'ollama',
          type: 'local',
          config: { baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434' }
        },
        {
          name: 'nvidia',
          type: 'api',
          apiKey: process.env.NVIDIA_API_KEY,
          config: { baseUrl: 'https://integrate.api.nvidia.com/v1' }
        },
        {
          name: 'google',
          type: 'api',
          apiKey: process.env.GOOGLE_API_KEY,
          config: { baseUrl: 'https://generativelanguage.googleapis.com/v1beta' }
        },
        {
          name: 'openrouter',
          type: 'api',
          apiKey: process.env.OPENROUTER_API_KEY,
          config: { baseUrl: 'https://openrouter.ai/api/v1' }
        }
      ]

      for (const p of providers) {
        // La clave no va en el upsert: se escribe aparte, cifrada (#225).
        const fila = await this.databaseService.prisma.aIProvider.upsert({
          where: { name: p.name },
          update: { type: p.type, config: JSON.stringify(p.config) },
          create: {
            name: p.name,
            type: p.type,
            apiKey: '',
            // Uno externo nace apagado: se enciende al validar su clave (#246).
            isActive: p.type === 'local',
            isConnected: false,
            config: JSON.stringify(p.config)
          }
        })
        // La del entorno sólo se escribe si cambia: reescribirla en cada arranque
        // sería un punto de control de la base por proveedor y arranque.
        if (p.apiKey && claveUtilizable(fila.name, fila.apiKey) !== p.apiKey) {
          await this.databaseService.escribirClave(fila.id, p.apiKey)
        }
        this.logger.debug(`Ensured provider ${p.name} exists`)
      }

      this.logger.success('Default AI providers initialized')
    } catch (error) {
      this.logger.error('Failed to initialize default providers', error as Error)
    }
  }

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
      return result as unknown as IServiceResponse<IAIProvider>
    } catch (error) {
      this.logger.error('Failed to create AI provider', error as Error, { name: data.name, type: data.type })
      return {
        success: false,
        error: error instanceof ServiceError ? error.message : 'Failed to create AI provider'
      }
    }
  }

  async updateProvider(id: string, updates: IUpdateAIProviderData): Promise<IServiceResponse<IAIProvider>> {
    try {
      validateString(id, 'Provider ID')
      this.logger.debug('Updating AI provider', { id, campos: Object.keys(updates) })

      // Validate updates
      this.validateProviderUpdates(updates)

      // Check if provider exists
      const existingResult = await this.getProviderById(id)
      if (!existingResult.success) {
        throw new ServiceError('AI provider not found', 'NOT_FOUND', 404)
      }

      const actual = existingResult.data!
      if (updates.isActive === true && !actual.isActive && !puedeActivarse(actual, actual.apiKey ?? null)) {
        throw new ServiceError(SIN_CLAVE_VALIDADA, 'VALIDATION_ERROR', 400)
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

      if (updates.isActive === false && actual.isActive) await this.olvidarModeloElegido(actual.name)

      this.logger.success('Updated AI provider', {
        id: result.data?.id,
        name: result.data?.name
      })
      return result as unknown as IServiceResponse<IAIProvider>
    } catch (error) {
      this.logger.error('Failed to update AI provider', error as Error, { id, campos: Object.keys(updates) })
      return {
        success: false,
        error: error instanceof ServiceError ? error.message : 'Failed to update AI provider'
      }
    }
  }

  /**
   * Guarda la clave que se pega en Configuración (#225). Es la única entrada de
   * una clave desde la interfaz, y lo único que devuelve es su estado.
   */
  async guardarClave(
    id: string,
    clave: string,
    opciones: { permitirSinCifrar?: boolean } = {}
  ): Promise<IServiceResponse<EstadoPublicoClave>> {
    try {
      validateString(id, 'Provider ID')
      // Una clave nueva todavía no está validada: el proveedor se apaga hasta
      // que «Probar» la acepte (#246).
      const fila = await this.databaseService.escribirClave(
        id,
        clave.trim(),
        { isActive: false, isConnected: false, lastTestResult: null, lastTestMessage: null },
        opciones
      )
      this.ultimaPruebaNvidia = null
      this.ultimaPrueba.delete(fila.name.toLowerCase())
      if (fila.type === 'api') await this.olvidarModeloElegido(fila.name)
      return { success: true, data: estadoPublico(fila.name, fila.apiKey) }
    } catch (error) {
      this.logger.error('Failed to save API key', error as Error, { id })
      return { success: false, error: error instanceof Error ? error.message : 'Failed to save API key' }
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
        } else if (!provider.apiKey) {
          testResult = false
          testMessage = 'ai.prueba.claveNoValida'
        } else if (provider.name.toLowerCase() === 'nvidia') {
          const resultado = await this.probarNvidia(provider)
          testResult = resultado.ok
          testMessage = resultado.mensaje ?? 'API provider connection successful'
        } else if (tienePrueba(provider.name)) {
          const resultado = await this.probarExterno(provider)
          testResult = resultado.ok
          testMessage = resultado.mensaje ?? 'API provider connection successful'
        } else {
          // Sin una prueba contra su API no hay forma de saber si la clave vale.
          testResult = false
          testMessage = 'ai.prueba.noSoportado'
        }
      } catch (error) {
        testResult = false
        testMessage = error instanceof Error ? error.message : 'Connection test failed'
      }

      /**
       * El interruptor sigue a la prueba (#246): aceptada, se enciende;
       * rechazada la clave, se apaga. Sin red o con el servicio caído no se
       * sabe nada de la clave, así que se queda como estaba.
       */
      const esExterno = provider.type === 'api'
      const apagar = esExterno && !testResult && rechazaLaClave(testMessage)
      await this.databaseService.updateAIProvider(id, {
        isConnected: testResult,
        lastTestResult: testResult ? 'success' : 'error',
        lastTestMessage: testMessage,
        ...(esExterno && testResult ? { isActive: true } : {}),
        ...(apagar ? { isActive: false } : {}),
      })
      if (apagar) await this.olvidarModeloElegido(provider.name)

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

  async ensureOllamaModel(modelName: string, providerId?: string): Promise<boolean> {
    try {
      this.logger.debug('Ensuring Ollama model exists', { modelName })

      let ollamaUrl = 'http://127.0.0.1:11434'

      // If provider ID is given, try to get URL from config
      if (providerId) {
        const providerResult = await this.getProviderById(providerId)
        if (providerResult.success && providerResult.data?.config?.baseUrl) {
          ollamaUrl = providerResult.data.config.baseUrl
        }
      }

      // Check if model exists
      const response = await fetch(`${ollamaUrl}/api/tags`)
      if (!response.ok) {
        this.logger.warn('Failed to list Ollama models')
        return false
      }

      const data = await response.json() as { models?: any[] }
      const modelExists = data.models?.some((m: any) => m.name.includes(modelName))

      if (modelExists) {
        this.logger.debug('Model already exists', { modelName })
        return true
      }

      this.logger.info('Model not found, pulling...', { modelName })

      // Pull model
      const pullResponse = await fetch(`${ollamaUrl}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName, stream: false })
      })

      if (pullResponse.ok) {
        this.logger.success('Successfully pulled model', { modelName })
        return true
      } else {
        const errorText = await pullResponse.text()
        this.logger.error('Failed to pull model', new Error(errorText), { modelName })
        return false
      }
    } catch (error) {
      this.logger.error('Error ensuring Ollama model', error as Error, { modelName })
      return false
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
      const ollamaUrl = provider.config?.baseUrl || 'http://127.0.0.1:11434'
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

  private async fetchLocalModels(provider: IAIProvider): Promise<any[]> {
    try {
      const ollamaUrl = provider.config?.baseUrl || 'http://127.0.0.1:11434'
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

      if (lowerCaseName === 'nvidia') return await this.fetchNvidiaModels(provider)
      if (!tienePrueba(lowerCaseName)) {
        this.logger.warn('API model fetching not implemented for provider', { provider: provider.name })
        return []
      }
      // La lista sale de la misma petición que valida la clave.
      const previa = this.ultimaPrueba.get(lowerCaseName)
      const prueba = previa && previa.apiKey === provider.apiKey ? previa.resultado : await this.probarExterno(provider)
      if (!prueba.ok) throw new AIProviderError(prueba.mensaje ?? 'Key test failed', provider.name)
      return prueba.modelos.map(m => ({
        ...m,
        isDefault: false,
        isAvailable: true,
        isSelected: false,
      }))
    } catch (error) {
      this.logger.error('Failed to fetch API models', error as Error, { provider: provider.name })
      return []
    }
  }

  private async probarExterno(provider: IAIProvider): Promise<ResultadoPrueba> {
    const nombre = provider.name.toLowerCase()
    if (!provider.apiKey || !tienePrueba(nombre)) {
      throw new AIProviderError('API key is required for API providers', provider.name)
    }
    const resultado = await probarClaveExterna(nombre, provider.apiKey)
    this.ultimaPrueba.set(nombre, { apiKey: provider.apiKey, resultado })
    this.logger.debug('Key test', { provider: nombre, ok: resultado.ok, modelos: resultado.modelos.length, mensaje: resultado.mensaje })
    return resultado
  }

  /** Un proveedor que se apaga deja de redactar: el chat vuelve al automático. */
  private async olvidarModeloElegido(nombre: string): Promise<void> {
    try {
      await olvidarModeloElegidoDe(this.databaseService.prisma, n => n === nombre.toLowerCase())
    } catch (error) {
      this.logger.warn('No se pudo devolver el modelo que redacta al automático', error as Error)
    }
  }

  /**
   * Los dos Nemotron de la especificación, y nada más (#49).
   *
   * Antes se enumeraba el catálogo entero de la API y se le enseñaba al
   * usuario, con un respaldo codificado que además incluía
   * `meta/llama-3.1-405b-instruct`: tres modelos elegibles, uno de ellos ni
   * Nemotron, para una ruta —la del RAG— que la especificación fija en dos. La
   * pareja se lee de donde la usa el agente, para que no haya dos listas que
   * puedan separarse.
   */
  private async probarNvidia(provider: IAIProvider): Promise<ResultadoPruebaNvidia> {
    if (!provider.apiKey) {
      throw new AIProviderError('API key is required for API providers', provider.name)
    }
    const resultado = await probarClaveNvidia(provider.apiKey, PAREJAS.nvidia)
    this.ultimaPruebaNvidia = { apiKey: provider.apiKey, resultado }
    this.logger.debug('NVIDIA key test', { ok: resultado.ok, modelos: resultado.modelos, mensaje: resultado.mensaje })
    return resultado
  }

  private async fetchNvidiaModels(provider: IAIProvider): Promise<any[]> {
    const { principal, auxiliar } = PAREJAS.nvidia
    const previa = this.ultimaPruebaNvidia
    const prueba = previa && previa.apiKey === provider.apiKey ? previa.resultado : await this.probarNvidia(provider)
    if (!prueba.ok) {
      throw new AIProviderError(prueba.mensaje ?? 'NVIDIA key test failed', provider.name)
    }

    // Sólo se ofrecen los que la clave puede usar: elegir uno sin acceso
    // dejaría el chat sin respuesta.
    return [
      {
        modelId: principal,
        modelName: 'Nemotron (principal)',
        isDefault: true,
        isAvailable: true,
        isSelected: false,
        description: 'Razona sobre el contexto recuperado y redacta la respuesta',
      },
      {
        modelId: auxiliar,
        modelName: 'Nemotron (auxiliar)',
        isDefault: false,
        isAvailable: true,
        isSelected: false,
        description: 'Reformulación de consultas y graduación de relevancia',
      },
    ].filter(m => prueba.modelos[m.modelId] === 'acceso')
  }
}
