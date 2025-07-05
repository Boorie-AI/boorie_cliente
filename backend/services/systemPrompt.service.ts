import { DatabaseService } from './database.service'
import { 
  ISystemPrompt, 
  ICreateSystemPromptData, 
  IUpdateSystemPromptData, 
  IServiceResponse 
} from '../models'
import { appLogger } from '../utils/logger'

export class SystemPromptService {
  constructor(private databaseService: DatabaseService) {}

  async getAllSystemPrompts(): Promise<IServiceResponse<ISystemPrompt[]>> {
    try {
      const prompts = await this.databaseService.prisma.systemPrompt.findMany({
        orderBy: [
          { isDefault: 'desc' },
          { createdAt: 'desc' }
        ]
      })

      return {
        success: true,
        data: prompts.map(prompt => ({
          ...prompt,
          createdAt: new Date(prompt.createdAt),
          updatedAt: new Date(prompt.updatedAt)
        }))
      }
    } catch (error) {
      appLogger.error('Failed to get system prompts', error as Error)
      return {
        success: false,
        error: 'Failed to retrieve system prompts'
      }
    }
  }

  async getSystemPromptById(id: string): Promise<IServiceResponse<ISystemPrompt>> {
    try {
      const prompt = await this.databaseService.prisma.systemPrompt.findUnique({
        where: { id }
      })

      if (!prompt) {
        return {
          success: false,
          error: 'System prompt not found'
        }
      }

      return {
        success: true,
        data: {
          ...prompt,
          createdAt: new Date(prompt.createdAt),
          updatedAt: new Date(prompt.updatedAt)
        }
      }
    } catch (error) {
      appLogger.error('Failed to get system prompt by ID', error as Error)
      return {
        success: false,
        error: 'Failed to retrieve system prompt'
      }
    }
  }

  async getActiveSystemPrompts(): Promise<IServiceResponse<ISystemPrompt[]>> {
    try {
      const prompts = await this.databaseService.prisma.systemPrompt.findMany({
        where: { isActive: true },
        orderBy: [
          { isDefault: 'desc' },
          { name: 'asc' }
        ]
      })

      return {
        success: true,
        data: prompts.map(prompt => ({
          ...prompt,
          createdAt: new Date(prompt.createdAt),
          updatedAt: new Date(prompt.updatedAt)
        }))
      }
    } catch (error) {
      appLogger.error('Failed to get active system prompts', error as Error)
      return {
        success: false,
        error: 'Failed to retrieve active system prompts'
      }
    }
  }

  async createSystemPrompt(data: ICreateSystemPromptData): Promise<IServiceResponse<ISystemPrompt>> {
    try {
      // Validate required fields
      if (!data.name || !data.title || !data.content) {
        return {
          success: false,
          error: 'Name, title, and content are required'
        }
      }

      // Check if name already exists
      const existingPrompt = await this.databaseService.prisma.systemPrompt.findUnique({
        where: { name: data.name }
      })

      if (existingPrompt) {
        return {
          success: false,
          error: 'A system prompt with this name already exists'
        }
      }

      // If this is set as default, unset other defaults
      if (data.isDefault) {
        await this.databaseService.prisma.systemPrompt.updateMany({
          where: { isDefault: true },
          data: { isDefault: false }
        })
      }

      const prompt = await this.databaseService.prisma.systemPrompt.create({
        data: {
          name: data.name,
          title: data.title,
          content: data.content,
          description: data.description,
          saludo: data.saludo,
          isActive: data.isActive ?? true,
          isDefault: data.isDefault ?? false
        }
      })

      appLogger.info('System prompt created successfully', { id: prompt.id, name: prompt.name })

      return {
        success: true,
        data: {
          ...prompt,
          createdAt: new Date(prompt.createdAt),
          updatedAt: new Date(prompt.updatedAt)
        }
      }
    } catch (error) {
      appLogger.error('Failed to create system prompt', error as Error)
      return {
        success: false,
        error: 'Failed to create system prompt'
      }
    }
  }

  async updateSystemPrompt(id: string, data: IUpdateSystemPromptData): Promise<IServiceResponse<ISystemPrompt>> {
    try {
      // Check if prompt exists
      const existingPrompt = await this.databaseService.prisma.systemPrompt.findUnique({
        where: { id }
      })

      if (!existingPrompt) {
        return {
          success: false,
          error: 'System prompt not found'
        }
      }

      // Check if name already exists (but not for the current prompt)
      if (data.name && data.name !== existingPrompt.name) {
        const nameExists = await this.databaseService.prisma.systemPrompt.findUnique({
          where: { name: data.name }
        })

        if (nameExists) {
          return {
            success: false,
            error: 'A system prompt with this name already exists'
          }
        }
      }

      // If this is set as default, unset other defaults
      if (data.isDefault) {
        await this.databaseService.prisma.systemPrompt.updateMany({
          where: { 
            isDefault: true,
            id: { not: id }
          },
          data: { isDefault: false }
        })
      }

      const prompt = await this.databaseService.prisma.systemPrompt.update({
        where: { id },
        data: {
          ...(data.name && { name: data.name }),
          ...(data.title && { title: data.title }),
          ...(data.content && { content: data.content }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.saludo !== undefined && { saludo: data.saludo }),
          ...(data.isActive !== undefined && { isActive: data.isActive }),
          ...(data.isDefault !== undefined && { isDefault: data.isDefault })
        }
      })

      appLogger.info('System prompt updated successfully', { id, name: prompt.name })

      return {
        success: true,
        data: {
          ...prompt,
          createdAt: new Date(prompt.createdAt),
          updatedAt: new Date(prompt.updatedAt)
        }
      }
    } catch (error) {
      appLogger.error('Failed to update system prompt', error as Error)
      return {
        success: false,
        error: 'Failed to update system prompt'
      }
    }
  }

  async deleteSystemPrompt(id: string): Promise<IServiceResponse<boolean>> {
    try {
      const existingPrompt = await this.databaseService.prisma.systemPrompt.findUnique({
        where: { id }
      })

      if (!existingPrompt) {
        return {
          success: false,
          error: 'System prompt not found'
        }
      }

      await this.databaseService.prisma.systemPrompt.delete({
        where: { id }
      })

      appLogger.info('System prompt deleted successfully', { id, name: existingPrompt.name })

      return {
        success: true,
        data: true
      }
    } catch (error) {
      appLogger.error('Failed to delete system prompt', error as Error)
      return {
        success: false,
        error: 'Failed to delete system prompt'
      }
    }
  }

  async setDefaultSystemPrompt(id: string): Promise<IServiceResponse<boolean>> {
    try {
      const existingPrompt = await this.databaseService.prisma.systemPrompt.findUnique({
        where: { id }
      })

      if (!existingPrompt) {
        return {
          success: false,
          error: 'System prompt not found'
        }
      }

      // Unset all other defaults
      await this.databaseService.prisma.systemPrompt.updateMany({
        where: { isDefault: true },
        data: { isDefault: false }
      })

      // Set this one as default
      await this.databaseService.prisma.systemPrompt.update({
        where: { id },
        data: { isDefault: true }
      })

      appLogger.info('Default system prompt set successfully', { id, name: existingPrompt.name })

      return {
        success: true,
        data: true
      }
    } catch (error) {
      appLogger.error('Failed to set default system prompt', error as Error)
      return {
        success: false,
        error: 'Failed to set default system prompt'
      }
    }
  }

  async getDefaultSystemPrompt(): Promise<IServiceResponse<ISystemPrompt | null>> {
    try {
      const prompt = await this.databaseService.prisma.systemPrompt.findFirst({
        where: { 
          isDefault: true,
          isActive: true
        }
      })

      return {
        success: true,
        data: prompt ? {
          ...prompt,
          createdAt: new Date(prompt.createdAt),
          updatedAt: new Date(prompt.updatedAt)
        } : null
      }
    } catch (error) {
      appLogger.error('Failed to get default system prompt', error as Error)
      return {
        success: false,
        error: 'Failed to retrieve default system prompt'
      }
    }
  }
}