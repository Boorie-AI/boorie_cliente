import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { databaseService } from '@/services/database'

export interface ProviderModel {
  modelId: string
  modelName: string
  description: string
  isSelected: boolean
}

export interface AIProvider {
  id: string
  name: string
  description: string
  isActive: boolean
  apiKey: string
  isConnected: boolean
  testStatus: 'idle' | 'testing' | 'success' | 'error'
  testMessage: string
  availableModels: ProviderModel[]
  color: string
  order: number
}

interface AIConfigState {
  providers: AIProvider[]
  isLoading: boolean
  
  // Actions
  loadProviders: () => Promise<void>
  saveProvider: (provider: Partial<AIProvider>) => Promise<void>
  updateProvider: (providerId: string, updates: Partial<AIProvider>) => Promise<void>
  toggleProvider: (providerId: string, isActive: boolean) => Promise<void>
  updateAPIKey: (providerId: string, apiKey: string) => Promise<void>
  testProviderConnection: (providerId: string) => Promise<boolean>
  updateProviderConnection: (providerId: string, isConnected: boolean, testStatus: AIProvider['testStatus'], testMessage: string, models?: ProviderModel[]) => void
  toggleModelSelection: (providerId: string, modelId: string, isSelected: boolean) => Promise<void>
  addCustomModel: (providerId: string, model: ProviderModel) => Promise<void>
  removeCustomModel: (providerId: string, modelId: string) => Promise<void>
  refreshProviderModels: (providerId: string) => Promise<void>
  getActiveProviders: () => AIProvider[]
  getSelectedModels: () => { provider: AIProvider; model: ProviderModel }[]
  initializeProviders: (providers: AIProvider[]) => void
}

export const useAIConfigStore = create<AIConfigState>()(
  devtools(
    (set, get) => ({
      providers: [],
      isLoading: false,

      loadProviders: async () => {
        try {
          set({ isLoading: true })
          console.log('🔄 Loading AI providers from database...')
          
          const savedProviders = await databaseService.getAIProviders()
          const savedModels = await databaseService.getAIModels()
          
          // Map database providers to UI format
          const uiProviders: AIProvider[] = savedProviders.map(dbProvider => {
            const providerModels = savedModels.filter(model => model.providerId === dbProvider.id)
            
            return {
              id: dbProvider.name.toLowerCase(), // Use lowercase name as ID for consistency
              name: dbProvider.name,
              description: get().getProviderDescription(dbProvider.name),
              isActive: dbProvider.isActive,
              apiKey: dbProvider.apiKey || '',
              isConnected: dbProvider.isConnected,
              testStatus: dbProvider.lastTestResult === 'success' ? 'success' : 
                         dbProvider.lastTestResult === 'error' ? 'error' : 'idle',
              testMessage: dbProvider.lastTestMessage || '',
              availableModels: providerModels.map(model => ({
                modelId: model.modelId,
                modelName: model.modelName,
                description: model.description || '',
                isSelected: model.isSelected
              })),
              color: get().getProviderColor(dbProvider.name),
              order: get().getProviderOrder(dbProvider.name)
            }
          })
          
          set({ providers: uiProviders })
          console.log(`✅ Loaded ${uiProviders.length} providers from database`)
        } catch (error) {
          console.error('❌ Failed to load providers from database:', error)
        } finally {
          set({ isLoading: false })
        }
      },

      saveProvider: async (providerData) => {
        try {
          console.log('💾 Saving provider to database:', providerData.name)
          
          // Check if provider already exists
          const existingProviders = await databaseService.getAIProviders()
          const existingProvider = existingProviders.find(p => p.name === providerData.name)
          
          if (existingProvider) {
            console.log('⚠️ Provider already exists, skipping creation:', providerData.name)
            return
          }
          
          const savedProvider = await databaseService.saveAIProvider({
            name: providerData.name!,
            type: providerData.name?.toLowerCase() === 'ollama' ? 'local' : 'api',
            apiKey: providerData.apiKey,
            isActive: providerData.isActive || false,
            isConnected: providerData.isConnected || false,
            config: null
          })
          
          if (savedProvider) {
            // Add to local state
            const newProvider: AIProvider = {
              id: savedProvider.name.toLowerCase(), // Use lowercase name as ID for consistency
              name: savedProvider.name,
              description: get().getProviderDescription(savedProvider.name),
              isActive: savedProvider.isActive,
              apiKey: savedProvider.apiKey || '',
              isConnected: savedProvider.isConnected,
              testStatus: 'idle',
              testMessage: '',
              availableModels: [],
              color: get().getProviderColor(savedProvider.name),
              order: get().getProviderOrder(savedProvider.name)
            }
            
            set((state) => ({
              providers: [...state.providers, newProvider]
            }))
            
            console.log('✅ Provider saved successfully')
          }
        } catch (error) {
          console.error('❌ Failed to save provider:', error)
        }
      },

      updateProvider: async (providerId, updates) => {
        try {
          console.log('🔄 Updating provider:', providerId, updates)
          
          // Find the actual provider database ID from the UI ID
          const providers = get().providers
          const provider = providers.find(p => p.id === providerId)
          
          if (!provider) {
            console.error('❌ Provider not found:', providerId)
            return
          }
          
          // Find the database provider by name to get the actual database ID
          const dbProviders = await databaseService.getAIProviders()
          const dbProvider = dbProviders.find(p => p.name === provider.name)
          
          if (!dbProvider) {
            console.error('❌ Database provider not found:', provider.name)
            return
          }
          
          // Map UI fields to database fields
          const dbUpdates: any = { ...updates }
          if (updates.testStatus) {
            dbUpdates.lastTestResult = updates.testStatus
            delete dbUpdates.testStatus
          }
          if (updates.testMessage !== undefined) {
            dbUpdates.lastTestMessage = updates.testMessage
            delete dbUpdates.testMessage
          }
          // Remove UI-only fields
          delete dbUpdates.availableModels
          delete dbUpdates.description
          delete dbUpdates.color
          delete dbUpdates.order
          
          const success = await databaseService.updateAIProvider(dbProvider.id, dbUpdates)
          
          if (success) {
            set((state) => ({
              providers: state.providers.map(p => 
                p.id === providerId ? { ...p, ...updates } : p
              )
            }))
            console.log('✅ Provider updated successfully')
          }
        } catch (error) {
          console.error('❌ Failed to update provider:', error)
        }
      },

      toggleProvider: async (providerId, isActive) => {
        await get().updateProvider(providerId, {
          isActive,
          // Reset connection state when deactivating
          ...(isActive ? {} : { 
            isConnected: false, 
            testStatus: 'idle' as const, 
            testMessage: ''
          })
        })
      },

      updateAPIKey: async (providerId, apiKey) => {
        await get().updateProvider(providerId, {
          apiKey, 
          isConnected: false, 
          testStatus: 'idle' as const,
          testMessage: ''
        })
      },

      testProviderConnection: async (providerId) => {
        try {
          console.log('🔄 Testing provider connection:', providerId)
          
          // Find the actual provider database ID from the UI ID
          const providers = get().providers
          const provider = providers.find(p => p.id === providerId)
          
          if (!provider) {
            console.error('❌ Provider not found:', providerId)
            return false
          }
          
          // Find the database provider by name to get the actual database ID
          const dbProviders = await databaseService.getAIProviders()
          const dbProvider = dbProviders.find(p => p.name === provider.name)
          
          if (!dbProvider) {
            console.error('❌ Database provider not found:', provider.name)
            return false
          }
          
          // Update UI to show testing state
          get().updateProviderConnection(providerId, false, 'testing', 'Testing connection...')
          
          // Test connection via IPC using the actual database ID
          const result = await window.electronAPI.database.testAIProvider?.(dbProvider.id)
          
          if (result?.success) {
            // Fetch models after successful connection
            await get().refreshProviderModels(providerId)
            console.log('✅ Provider connection test successful')
            return true
          } else {
            get().updateProviderConnection(providerId, false, 'error', result?.message || 'Connection failed')
            console.log('❌ Provider connection test failed')
            return false
          }
        } catch (error) {
          console.error('❌ Provider connection test error:', error)
          get().updateProviderConnection(providerId, false, 'error', 'Connection test failed')
          return false
        }
      },

      refreshProviderModels: async (providerId) => {
        try {
          console.log('🔄 Refreshing models for provider:', providerId)
          
          // Find the actual provider database ID from the UI ID
          const providers = get().providers
          const provider = providers.find(p => p.id === providerId)
          
          if (!provider) {
            console.error('❌ Provider not found:', providerId)
            return
          }
          
          // Find the database provider by name to get the actual database ID
          const dbProviders = await databaseService.getAIProviders()
          const dbProvider = dbProviders.find(p => p.name === provider.name)
          
          if (!dbProvider) {
            console.error('❌ Database provider not found:', provider.name)
            return
          }
          
          // Use the database service method which handles the IPC correctly
          const result = await databaseService.refreshAIModels(dbProvider.id)
          
          if (result?.success && result.data && Array.isArray(result.data)) {
            const providerModels: ProviderModel[] = result.data.map(model => ({
              modelId: model.modelId,
              modelName: model.modelName,
              description: model.description || '',
              isSelected: model.isSelected || false
            }))
            
            get().updateProviderConnection(providerId, true, 'success', 'Connected successfully', providerModels)
            console.log(`✅ Refreshed ${result.data.length} models for provider`)
          } else {
            console.warn('⚠️ No models received or invalid response structure:', result)
            get().updateProviderConnection(providerId, true, 'success', 'Connected successfully', [])
          }
        } catch (error) {
          console.error('❌ Failed to refresh models:', error)
          get().updateProviderConnection(providerId, false, 'error', 'Failed to fetch models')
        }
      },

      updateProviderConnection: (providerId, isConnected, testStatus, testMessage, models = []) => {
        set((state) => ({
          providers: state.providers.map(p => 
            p.id === providerId 
              ? { 
                  ...p, 
                  isConnected,
                  testStatus,
                  testMessage,
                  availableModels: models.map(model => ({
                    ...model,
                    isSelected: model.isSelected ?? false
                  }))
                } 
              : p
          )
        }))
      },

      toggleModelSelection: async (providerId, modelId, isSelected) => {
        try {
          console.log('🔄 Toggling model selection:', { providerId, modelId, isSelected })
          
          // Find the actual provider database ID from the UI ID
          const providers = get().providers
          const provider = providers.find(p => p.id === providerId)
          
          if (!provider) {
            console.error('❌ Provider not found:', providerId)
            return
          }
          
          // Find the database provider by name to get the actual database ID
          const dbProviders = await databaseService.getAIProviders()
          const dbProvider = dbProviders.find(p => p.name === provider.name)
          
          if (!dbProvider) {
            console.error('❌ Database provider not found:', provider.name)
            return
          }
          
          // Find the model in the database
          const allModels = await databaseService.getAIModels(dbProvider.id)
          const model = allModels.find(m => m.modelId === modelId)
          
          if (model) {
            // Update model selection in database
            await databaseService.saveAIModel({
              ...model,
              isSelected
            })
            
            // Update local state
            set((state) => ({
              providers: state.providers.map(p => 
                p.id === providerId 
                  ? {
                      ...p,
                      availableModels: p.availableModels.map(m => 
                        m.modelId === modelId ? { ...m, isSelected } : m
                      )
                    }
                  : p
              )
            }))
            
            console.log('✅ Model selection updated successfully')
          }
        } catch (error) {
          console.error('❌ Failed to toggle model selection:', error)
        }
      },

      addCustomModel: async (providerId, model) => {
        try {
          console.log('➕ Adding custom model:', { providerId, model })
          
          // Find the actual provider database ID from the UI ID
          const providers = get().providers
          const provider = providers.find(p => p.id === providerId)
          
          if (!provider) {
            console.error('❌ Provider not found:', providerId)
            return
          }
          
          // Find the database provider by name to get the actual database ID
          const dbProviders = await databaseService.getAIProviders()
          const dbProvider = dbProviders.find(p => p.name === provider.name)
          
          if (!dbProvider) {
            console.error('❌ Database provider not found:', provider.name)
            return
          }
          
          const savedModel = await databaseService.saveAIModel({
            providerId: dbProvider.id,
            modelName: model.modelName,
            modelId: model.modelId,
            isDefault: false,
            isAvailable: true,
            isSelected: true,
            description: model.description
          })
          
          if (savedModel) {
            set((state) => ({
              providers: state.providers.map(p => 
                p.id === providerId 
                  ? {
                      ...p,
                      availableModels: [...p.availableModels, { ...model, isSelected: true }]
                    }
                  : p
              )
            }))
            console.log('✅ Custom model added successfully')
          }
        } catch (error) {
          console.error('❌ Failed to add custom model:', error)
        }
      },

      removeCustomModel: async (providerId, modelId) => {
        try {
          console.log('🗑️ Removing custom model:', { providerId, modelId })
          
          // In a real implementation, you'd want to delete from database
          // For now, just update local state
          set((state) => ({
            providers: state.providers.map(p => 
              p.id === providerId 
                ? {
                    ...p,
                    availableModels: p.availableModels.filter(m => m.modelId !== modelId)
                  }
                : p
            )
          }))
          
          console.log('✅ Custom model removed successfully')
        } catch (error) {
          console.error('❌ Failed to remove custom model:', error)
        }
      },

      getActiveProviders: () => {
        return get().providers.filter(p => p.isActive && p.isConnected)
      },

      getSelectedModels: () => {
        const activeProviders = get().getActiveProviders()
        const result: { provider: AIProvider; model: ProviderModel }[] = []
        
        activeProviders.forEach(provider => {
          provider.availableModels
            .filter(model => model.isSelected)
            .forEach(model => {
              result.push({ provider, model })
            })
        })
        
        return result
      },

      initializeProviders: (providers) => {
        set({ providers })
      },

      // Helper methods
      getProviderDescription: (name: string) => {
        const descriptions: Record<string, string> = {
          'OpenAI': 'Advanced AI models including GPT-4 and GPT-3.5',
          'Anthropic': 'Claude models focused on safety and helpfulness',
          'Google': 'Google AI models including Gemini',
          'OpenRouter': 'Access to multiple AI models through one API'
        }
        return descriptions[name] || `${name} AI provider`
      },

      getProviderColor: (name: string) => {
        const colors: Record<string, string> = {
          'OpenAI': '#10a37f',
          'Anthropic': '#d97706',
          'Google': '#4285f4', 
          'OpenRouter': '#8b5cf6'
        }
        return colors[name] || '#6b7280'
      },

      getProviderOrder: (name: string) => {
        const orders: Record<string, number> = {
          'OpenAI': 1,
          'Anthropic': 2,
          'Google': 3,
          'OpenRouter': 4,
        }
        return orders[name] || 99
      }
    }),
    { name: 'ai-config-store' }
  )
)