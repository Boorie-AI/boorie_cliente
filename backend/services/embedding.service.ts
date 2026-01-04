import { OpenAIEmbeddings } from "@langchain/openai";
import { OllamaEmbeddings } from "@langchain/ollama";
import { PrismaClient } from "@prisma/client";

export class EmbeddingService {
    private prisma: PrismaClient;
    private _activeProvider: any = null;

    constructor(prisma?: PrismaClient) {
        this.prisma = prisma || new PrismaClient();
        // Start with no specific active provider to allow auto-discovery
        this._activeProvider = null;
    }

    get activeProvider() {
        return this._activeProvider;
    }

    set activeProvider(provider: any) {
        this._activeProvider = provider;
    }

    getProviders() {
        return [
            {
                id: 'openai-small',
                name: 'OpenAI Small',
                model: 'text-embedding-3-small',
                dimension: 1536
            },
            {
                id: 'openai-large',
                name: 'OpenAI Large',
                model: 'text-embedding-3-large',
                dimension: 3072
            }
        ];
    }

    setProvider(providerId: string) {
        const providers = this.getProviders();
        const provider = providers.find(p => p.id === providerId);
        if (provider) {
            this._activeProvider = provider;
        } else {
            // Support dynamic Ollama providers setting
            if (providerId.startsWith('ollama-')) {
                // For now, we accept it if it's passed as an object to the property directly
                // or we can reconstruct it partially if needed, but best is if the caller handles it.
                // This method is primarily for the static list.
                console.log(`[EmbeddingService] Set dynamic provider by ID: ${providerId}`);
            }
        }
    }

    async generateEmbedding(text: string): Promise<number[]> {
        // 1. Try Active Provider if set
        if (this._activeProvider) {
            try {
                const pid = this._activeProvider.id;

                // OpenAI
                if (pid.includes('openai')) {
                    const apiKey = process.env.OPENAI_API_KEY;
                    if (!apiKey) {
                        // If selected but no key, maybe we should fall through? 
                        // But if user explicitly selected it, we should probably error or warn.
                        // For default behavior, we'll try to fallback.
                        console.warn("[EmbeddingService] Active provider is OpenAI but no key found. Falling back to auto-discovery.");
                        // Fall through to discovery
                    } else {
                        const embeddings = new OpenAIEmbeddings({
                            openAIApiKey: apiKey,
                            modelName: this._activeProvider.model
                        });
                        return await embeddings.embedQuery(text);
                    }
                }

                // Ollama
                else if (pid.includes('ollama')) {
                    const embeddings = new OllamaEmbeddings({
                        baseUrl: "http://localhost:11434",
                        model: this._activeProvider.model
                    });
                    return await embeddings.embedQuery(text);
                }
            } catch (e) {
                console.error(`[EmbeddingService] Error using active provider ${this._activeProvider.name}:`, e);
                console.log("[EmbeddingService] Falling back to auto-discovery...");
                // Fall through to discovery on error
            }
        }

        // 2. Auto-Discovery Logic (Fallback)

        // A. Check Database for OpenAI
        const openaiProvider = await this.prisma.aIProvider.findFirst({
            where: {
                name: { contains: 'OpenAI' },
                isActive: true
            }
        });

        if (openaiProvider && (openaiProvider.apiKey || process.env.OPENAI_API_KEY)) {
            try {
                console.log("[EmbeddingService] Auto-discovered OpenAI from DB");
                const embeddings = new OpenAIEmbeddings({
                    openAIApiKey: openaiProvider.apiKey || process.env.OPENAI_API_KEY,
                    modelName: "text-embedding-3-small"
                });
                const result = await embeddings.embedQuery(text);

                // Auto-set as active for future consistency
                this._activeProvider = {
                    id: 'openai-db',
                    name: 'OpenAI (Database)',
                    model: 'text-embedding-3-small',
                    dimension: 1536
                };
                return result;
            } catch (e) {
                console.error("Error generating OpenAI embedding:", e);
            }
        }

        // B. Check Database for Ollama
        const ollamaProvider = await this.prisma.aIProvider.findFirst({
            where: {
                name: { contains: 'Ollama' },
                isActive: true
            }
        });

        if (ollamaProvider) {
            try {
                console.log("[EmbeddingService] Auto-discovered Ollama from DB");
                const config = ollamaProvider.config ? JSON.parse(ollamaProvider.config) : {};
                const model = "nomic-embed-text";
                const embeddings = new OllamaEmbeddings({
                    baseUrl: config.baseUrl || "http://localhost:11434",
                    model: model
                });
                const result = await embeddings.embedQuery(text);

                this._activeProvider = {
                    id: 'ollama-db',
                    name: 'Ollama (Database)',
                    model: model,
                    dimension: 768
                };
                return result;
            } catch (e) {
                console.error("Error generating Ollama embedding:", e);
            }
        }

        // C. Check Env for OpenAI
        if (process.env.OPENAI_API_KEY) {
            try {
                console.log("[EmbeddingService] Auto-discovered OpenAI from ENV");
                const embeddings = new OpenAIEmbeddings({
                    openAIApiKey: process.env.OPENAI_API_KEY,
                    modelName: "text-embedding-3-small"
                });
                const result = await embeddings.embedQuery(text);

                this._activeProvider = {
                    id: 'openai-env',
                    name: 'OpenAI (Env)',
                    model: 'text-embedding-3-small',
                    dimension: 1536
                };
                return result;
            } catch (e) {
                console.error("Error generating OpenAI embedding (Env):", e);
            }
        }

        // D. Last Resort: Try default Ollama local
        try {
            console.log("[EmbeddingService] Attempting default local Ollama (nomic-embed-text)");
            const embeddings = new OllamaEmbeddings({
                baseUrl: "http://localhost:11434",
                model: "nomic-embed-text"
            });
            const result = await embeddings.embedQuery(text);

            this._activeProvider = {
                id: 'ollama-local',
                name: 'Ollama (Local)',
                model: 'nomic-embed-text',
                dimension: 768
            };
            return result;
        } catch (e) {
            // Silent fail here, will throw generic error below
        }

        throw new Error("No active embedding provider found. Please configure OpenAI or ensure Ollama is running with 'nomic-embed-text'.");
    }
}
