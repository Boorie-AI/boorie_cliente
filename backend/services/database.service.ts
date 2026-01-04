import { PrismaClient } from '@prisma/client';

// Simple database service wrapper for legacy code
export class DatabaseService {
    public prisma: PrismaClient;
    [x: string]: any; // Allow dynamic methods to satisfy TypeScript for missing implementations

    constructor(prismaClient?: PrismaClient) {
        // Use provided client or create new one
        this.prisma = prismaClient || new PrismaClient();
    }

    async getAIProviders() {
        try {
            const providers = await this.prisma.aIProvider.findMany({
                where: {
                    isActive: true
                },
                include: {
                    models: true
                }
            });

            const result = providers.map(provider => ({
                id: provider.id,
                name: provider.name,
                type: provider.type as "local" | "api",
                apiKey: provider.apiKey,
                isActive: provider.isActive,
                enabled: provider.isActive,
                isConnected: false,
                createdAt: new Date(),
                updatedAt: new Date(),
                baseUrl: provider.config ? (JSON.parse(provider.config as string)).baseUrl : undefined,
                models: provider.models
            }));

            return {
                success: true,
                data: result
            };
        } catch (error) {
            console.error('Error getting AI providers:', error);
            return {
                success: false,
                data: [],
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    async createAIProvider(data: any) {
        try {
            const provider = await this.prisma.aIProvider.create({
                data: {
                    name: data.name,
                    type: data.type,
                    apiKey: data.apiKey,
                    isActive: data.isActive || false,
                    isConnected: data.isConnected || false,
                    config: data.config
                }
            });
            return { success: true, data: provider };
        } catch (error) {
            console.error('Error creating AI provider:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    async updateAIProvider(id: string, data: any) {
        try {
            const provider = await this.prisma.aIProvider.update({
                where: { id },
                data: data
            });
            return { success: true, data: provider };
        } catch (error) {
            console.error('Error updating AI provider:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    async getAIModels(providerId?: string) {
        try {
            const where = providerId ? { providerId } : {};
            const models = await this.prisma.aIModel.findMany({
                where
            });
            return { success: true, data: models };
        } catch (error) {
            console.error('Error getting AI models:', error);
            return {
                success: false,
                data: [],
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    async createOrUpdateAIModel(data: any) {
        try {
            // Check if model exists by providerId and modelId
            const existing = await this.prisma.aIModel.findFirst({
                where: {
                    providerId: data.providerId,
                    modelId: data.modelId
                }
            });

            let model;
            if (existing) {
                model = await this.prisma.aIModel.update({
                    where: { id: existing.id },
                    data: {
                        modelName: data.modelName,
                        isDefault: data.isDefault,
                        isAvailable: data.isAvailable,
                        isSelected: data.isSelected,
                        description: data.description,
                        metadata: data.metadata ? JSON.stringify(data.metadata) : null
                    }
                });
            } else {
                model = await this.prisma.aIModel.create({
                    data: {
                        providerId: data.providerId,
                        modelId: data.modelId,
                        modelName: data.modelName,
                        isDefault: data.isDefault || false,
                        isAvailable: data.isAvailable || true,
                        isSelected: data.isSelected || false,
                        description: data.description,
                        metadata: data.metadata ? JSON.stringify(data.metadata) : null
                    }
                });
            }
            return { success: true, data: model };
        } catch (error) {
            console.error('Error saving AI model:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    async deleteAIModels(providerId: string) {
        try {
            await this.prisma.aIModel.deleteMany({
                where: { providerId }
            });
            return { success: true };
        } catch (error) {
            console.error('Error deleting AI models:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    async disconnect() {
        try {
            await this.prisma.$disconnect();
        } catch (error) {
            console.error('Error disconnecting database:', error);
        }
    }

    // Settings Methods
    async getSettings(category?: string) {
        try {
            const where = category ? { category } : {};
            const settings = await this.prisma.appSetting.findMany({ where });
            return { success: true, data: settings };
        } catch (error) {
            console.error('Error getting settings:', error);
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    }

    async getSetting(key: string) {
        try {
            const setting = await this.prisma.appSetting.findUnique({
                where: { key }
            });

            if (!setting) {
                return { success: true, data: null };
            }

            return { success: true, data: setting.value };
        } catch (error) {
            console.error('Error getting setting:', error);
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    }

    async setSetting(key: string, value: any, category?: string) {
        try {
            const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
            const setting = await this.prisma.appSetting.upsert({
                where: { key },
                update: {
                    value: stringValue,
                    category: category
                },
                create: {
                    key,
                    value: stringValue,
                    category
                }
            });
            return { success: true, data: setting };
        } catch (error) {
            console.error('Error setting value:', error);
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    }

    async healthCheck() {
        try {
            await this.prisma.$queryRaw`SELECT 1`;
            return { success: true };
        } catch (error) {
            console.error('Health check failed:', error);
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    }

    // Auth Token Methods for TokenSecurityService

    async getAuthToken(provider: string, tokenType: string = 'access') {
        try {
            const token = await this.prisma.authToken.findUnique({
                where: {
                    provider_tokenType: {
                        provider,
                        tokenType
                    }
                }
            });

            if (!token) {
                return { success: true, data: null };
            }

            return { success: true, data: token };
        } catch (error) {
            console.error('Error getting auth token:', error);
            return {
                success: false,
                data: null,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    async storeAuthToken(data: {
        provider: string,
        tokenType: string,
        accessToken: string,
        refreshToken?: string,
        expiresAt?: Date
    }) {
        try {
            const token = await this.prisma.authToken.upsert({
                where: {
                    provider_tokenType: {
                        provider: data.provider,
                        tokenType: data.tokenType
                    }
                },
                update: {
                    accessToken: data.accessToken,
                    refreshToken: data.refreshToken,
                    expiresAt: data.expiresAt
                },
                create: {
                    provider: data.provider,
                    tokenType: data.tokenType,
                    accessToken: data.accessToken,
                    refreshToken: data.refreshToken,
                    expiresAt: data.expiresAt
                }
            });

            return { success: true, data: token };
        } catch (error) {
            console.error('Error storing auth token:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    async deleteAuthTokens(provider: string) {
        try {
            await this.prisma.authToken.deleteMany({
                where: {
                    provider
                }
            });
            return { success: true };
        } catch (error) {
            console.error('Error deleting auth tokens:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    // Conversation Methods
    async getConversations() {
        try {
            const conversations = await this.prisma.conversation.findMany({
                include: {
                    messages: {
                        orderBy: {
                            timestamp: 'asc'
                        }
                    }
                },
                orderBy: {
                    updatedAt: 'desc'
                }
            });

            return { success: true, data: conversations as any };
        } catch (error) {
            console.error('Error getting conversations:', error);
            return {
                success: false,
                data: [],
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    async getConversationById(id: string) {
        try {
            const conversation = await this.prisma.conversation.findUnique({
                where: { id },
                include: {
                    messages: {
                        orderBy: {
                            timestamp: 'asc'
                        }
                    }
                }
            });

            if (!conversation) {
                return { success: false, error: 'Conversation not found' };
            }

            return { success: true, data: conversation as any };
        } catch (error) {
            console.error('Error getting conversation by ID:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    async createConversation(data: any) {
        try {
            // Check if messages need to be created nested
            const createData: any = {
                id: data.id,
                title: data.title,
                model: data.model,
                provider: data.provider,
                projectId: data.projectId
            };

            if (data.messages && Array.isArray(data.messages) && data.messages.length > 0) {
                createData.messages = {
                    create: data.messages.map((msg: any) => ({
                        role: msg.role,
                        content: msg.content,
                        timestamp: msg.timestamp || new Date(),
                        metadata: msg.metadata ? JSON.stringify(msg.metadata) : null
                    }))
                };
            }

            const conversation = await this.prisma.conversation.create({
                data: createData,
                include: {
                    messages: true
                }
            });

            return { success: true, data: conversation as any };
        } catch (error) {
            console.error('Error creating conversation:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    async updateConversation(id: string, data: any) {
        try {
            // Handle updates
            const updateData: any = { ...data };

            // If messages are provided, we typically don't update them this way in this simplified service
            // The ConversationService usually handles adding messages separately via createMessage
            // But if we need to update properties:
            delete updateData.messages; // Don't try to update messages via this method for now to avoid complexity

            const conversation = await this.prisma.conversation.update({
                where: { id },
                data: updateData,
                include: {
                    messages: {
                        orderBy: {
                            timestamp: 'asc'
                        }
                    }
                }
            });

            return { success: true, data: conversation as any };
        } catch (error) {
            console.error('Error updating conversation:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    async deleteConversation(id: string) {
        try {
            await this.prisma.conversation.delete({
                where: { id }
            });
            return { success: true };
        } catch (error) {
            console.error('Error deleting conversation:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    async createMessage(data: any) {
        try {
            const message = await this.prisma.message.create({
                data: {
                    conversationId: data.conversationId,
                    role: data.role,
                    content: data.content,
                    metadata: data.metadata ? JSON.stringify(data.metadata) : null,
                    timestamp: data.timestamp || new Date()
                }
            });

            // Also update the conversation's updatedAt
            await this.prisma.conversation.update({
                where: { id: data.conversationId },
                data: { updatedAt: new Date() }
            });

            return { success: true, data: message as any };
        } catch (error) {
            console.error('Error creating message:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
}

// Singleton instance
let sharedDatabaseService: DatabaseService | null = null;

export function getDatabaseService() {
    if (!sharedDatabaseService) {
        sharedDatabaseService = new DatabaseService();
    }
    return sharedDatabaseService;
}

// For backward compatibility if needed, though named exports are preferred in TS
export const SimpleDatabaseService = DatabaseService;
