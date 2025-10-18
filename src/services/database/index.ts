// Database service for electron renderer process
// This interfaces with the main process via IPC

export interface AIProvider {
  id: string
  name: string
  type: 'local' | 'api'
  apiKey?: string
  isActive: boolean
  isConnected: boolean
  lastTestResult?: string
  lastTestMessage?: string
  config?: any
  createdAt: Date
  updatedAt: Date
}

export interface AIModel {
  id: string
  providerId: string
  modelName: string
  modelId: string
  isDefault: boolean
  isAvailable: boolean
  isSelected: boolean
  description?: string
  metadata?: any
  createdAt: Date
  updatedAt: Date
}

export interface AppSetting {
  id: string
  key: string
  value: string
  category?: string
  createdAt: Date
  updatedAt: Date
}

export interface Conversation {
  id: string
  title: string
  messages: any[]
  model: string
  provider: string
  projectId?: string
  createdAt: Date
  updatedAt: Date
}

class DatabaseService {
  // AI Providers
  async getAIProviders(): Promise<AIProvider[]> {
    if (!window.electronAPI) {
      console.error('❌ window.electronAPI not available in getAIProviders')
      return []
    }
    
    try {
      const providers = await window.electronAPI.database.getAIProviders()
      return providers.map((provider: any) => ({
        id: provider.id,
        name: provider.name,
        type: provider.type,
        apiKey: provider.apiKey,
        isActive: provider.isActive,
        isConnected: provider.isConnected,
        lastTestResult: provider.lastTestResult,
        lastTestMessage: provider.lastTestMessage,
        config: provider.config ? JSON.parse(provider.config) : null,
        createdAt: new Date(provider.createdAt),
        updatedAt: new Date(provider.updatedAt)
      }))
    } catch (error) {
      console.error('❌ Failed to get AI providers:', error)
      return []
    }
  }

  async saveAIProvider(provider: Omit<AIProvider, 'id' | 'createdAt' | 'updatedAt'>): Promise<AIProvider | null> {
    if (!window.electronAPI) {
      console.error('❌ window.electronAPI not available in saveAIProvider')
      return null
    }
    
    try {
      const result = await window.electronAPI.database.saveAIProvider({
        name: provider.name,
        type: provider.type,
        apiKey: provider.apiKey,
        isActive: provider.isActive,
        isConnected: provider.isConnected,
        config: provider.config ? JSON.stringify(provider.config) : null
      })
      
      if (result) {
        console.log('✅ Provider saved successfully:', provider.name)
        return {
          id: result.id,
          ...provider,
          createdAt: new Date(result.createdAt),
          updatedAt: new Date(result.updatedAt)
        }
      }
      
      return null
    } catch (error) {
      console.error('❌ Failed to save AI provider:', error)
      return null
    }
  }

  async updateAIProvider(id: string, updates: Partial<AIProvider>): Promise<boolean> {
    if (!window.electronAPI) {
      console.error('❌ window.electronAPI not available in updateAIProvider')
      return false
    }
    
    try {
      const result = await window.electronAPI.database.updateAIProvider(id, updates)
      
      if (result) {
        console.log('✅ Provider updated successfully')
        return true
      }
      
      return false
    } catch (error) {
      console.error('❌ Failed to update AI provider:', error)
      return false
    }
  }

  // AI Models
  async getAIModels(providerId?: string): Promise<AIModel[]> {
    if (!window.electronAPI) return []
    
    try {
      const models = await window.electronAPI.database.getAIModels(providerId)
      return models.map((model: any) => ({
        id: model.id,
        providerId: model.providerId,
        modelName: model.modelName,
        modelId: model.modelId,
        isDefault: model.isDefault || false,
        isAvailable: model.isAvailable,
        isSelected: model.isSelected || false,
        description: model.description || '',
        metadata: model.metadata ? (typeof model.metadata === 'string' ? JSON.parse(model.metadata) : model.metadata) : null,
        createdAt: new Date(model.createdAt),
        updatedAt: new Date(model.updatedAt)
      }))
    } catch (error) {
      console.error('Failed to get AI models:', error)
      return []
    }
  }

  async saveAIModel(model: Omit<AIModel, 'id' | 'createdAt' | 'updatedAt'>): Promise<AIModel | null> {
    if (!window.electronAPI) return null
    
    try {
      const result = await window.electronAPI.database.saveAIModel({
        providerId: model.providerId,
        modelId: model.modelId,
        modelName: model.modelName,
        isDefault: model.isDefault || false,
        isAvailable: model.isAvailable,
        isSelected: model.isSelected || false,
        description: model.description || '',
        metadata: model.metadata ? JSON.stringify(model.metadata) : null
      })
      
      if (result) {
        return {
          id: result.id,
          providerId: result.providerId,
          modelName: result.modelName,
          modelId: result.modelId,
          isDefault: result.isDefault || false,
          isAvailable: result.isAvailable,
          isSelected: result.isSelected || false,
          description: result.description || '',
          metadata: result.metadata ? (typeof result.metadata === 'string' ? JSON.parse(result.metadata) : result.metadata) : null,
          createdAt: new Date(result.createdAt),
          updatedAt: new Date(result.updatedAt)
        }
      }
      
      return null
    } catch (error) {
      console.error('Failed to save AI model:', error)
      return null
    }
  }

  async refreshAIModels(providerId: string): Promise<{ success: boolean; data?: any[]; error?: string }> {
    if (!window.electronAPI) return { success: false, error: 'ElectronAPI not available' }
    
    try {
      console.log('🔄 [DatabaseService] Refreshing AI models for provider:', providerId)
      const result = await window.electronAPI.database.refreshAIModels(providerId)
      
      // The IPC handler returns the models directly, wrap it in the expected structure
      if (Array.isArray(result)) {
        console.log('✅ [DatabaseService] AI models refreshed:', result.length, 'models')
        return { success: true, data: result }
      } else if (result && typeof result === 'object' && 'success' in result) {
        console.log('✅ [DatabaseService] AI models refreshed:', result)
        return result
      } else {
        console.log('✅ [DatabaseService] AI models refreshed (empty):', result)
        return { success: true, data: [] }
      }
    } catch (error) {
      console.error('❌ [DatabaseService] Failed to refresh AI models:', error)
      return { success: false, error: 'Failed to refresh models' }
    }
  }

  // App Settings
  async getSetting(key: string): Promise<string | null> {
    if (!window.electronAPI) return null
    
    try {
      const result = await window.electronAPI.database.getSetting(key)
      return result
    } catch (error) {
      console.error('Failed to get setting:', error)
      return null
    }
  }

  async setSetting(key: string, value: string, category?: string): Promise<boolean> {
    if (!window.electronAPI) return false
    
    try {
      const result = await window.electronAPI.database.setSetting(key, value, category)
      return !!result
    } catch (error) {
      console.error('Failed to set setting:', error)
      return false
    }
  }

  async getSettings(category?: string): Promise<AppSetting[]> {
    if (!window.electronAPI) return []
    
    try {
      const results = await window.electronAPI.database.getSettings(category)
      return results || []
    } catch (error) {
      console.error('Failed to get settings:', error)
      return []
    }
  }

  // Conversations
  async getConversations(): Promise<Conversation[]> {
    if (!window.electronAPI) {
      console.error('❌ window.electronAPI not available in getConversations')
      return []
    }
    
    try {
      const conversations = await window.electronAPI.database.getConversations()
      return conversations || []
    } catch (error) {
      console.error('❌ Failed to get conversations:', error)
      return []
    }
  }

  async saveConversation(conversation: Omit<Conversation, 'createdAt' | 'updatedAt'>): Promise<Conversation | null> {
    if (!window.electronAPI) {
      console.error('❌ window.electronAPI not available in saveConversation')
      return null
    }
    
    try {
      const result = await window.electronAPI.database.saveConversation(conversation)
      return result
    } catch (error) {
      console.error('❌ Failed to save conversation:', error)
      return null
    }
  }

  async updateConversation(id: string, updates: Partial<Conversation>): Promise<boolean> {
    if (!window.electronAPI) {
      console.error('❌ window.electronAPI not available in updateConversation')
      return false
    }
    
    try {
      const result = await window.electronAPI.database.updateConversation(id, updates)
      
      if (result) {
        console.log('✅ Conversation updated successfully')
        return true
      }
      
      return false
    } catch (error) {
      console.error('❌ Failed to update conversation:', error)
      return false
    }
  }

  async deleteConversation(id: string): Promise<boolean> {
    if (!window.electronAPI) {
      console.error('❌ window.electronAPI not available in deleteConversation')
      return false
    }
    
    try {
      const result = await window.electronAPI.database.deleteConversation(id)
      
      if (result) {
        console.log('✅ Conversation deleted successfully')
        return true
      }
      
      return false
    } catch (error) {
      console.error('❌ Failed to delete conversation:', error)
      return false
    }
  }

  async addMessageToConversation(conversationId: string, message: any): Promise<Conversation | null> {
    if (!window.electronAPI) {
      console.error('❌ window.electronAPI not available in addMessageToConversation')
      return null
    }
    
    try {
      const result = await window.electronAPI.database.addMessageToConversation(conversationId, message)
      
      if (result) {
        console.log('✅ Message added to conversation successfully')
        return result
      }
      
      return null
    } catch (error) {
      console.error('❌ Failed to add message to conversation:', error)
      return null
    }
  }

  // Initialize database (Prisma handles schema automatically)
  async initialize(): Promise<boolean> {
    // With Prisma, the database schema is automatically managed
    // We just need to ensure the Prisma client is ready
    console.log('✅ Database ready (managed by Prisma)')
    return true
  }

}

export const databaseService = new DatabaseService()