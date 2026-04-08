import { OpenAIEmbeddings } from "@langchain/openai";
import { OllamaEmbeddings } from "@langchain/ollama";
import { PrismaClient } from "@prisma/client";

export class EmbeddingService {
    private prisma: PrismaClient;
    private _activeProvider: any = null;
    private _cachedEmbeddingsInstance: any = null;
    private _cachedProviderId: string | null = null;

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

    /**
     * Get or create a cached embeddings instance for the current provider.
     * Avoids re-instantiating the provider on every call, which is critical for batch operations.
     */
    private getOrCreateEmbeddingsInstance(providerId: string, factory: () => any): any {
        if (this._cachedEmbeddingsInstance && this._cachedProviderId === providerId) {
            return this._cachedEmbeddingsInstance;
        }
        this._cachedEmbeddingsInstance = factory();
        this._cachedProviderId = providerId;
        return this._cachedEmbeddingsInstance;
    }

    async generateEmbedding(text: string): Promise<number[]> {
        // Helper to wrap embed call with timeout
        const embedWithTimeout = async (embeddings: any, text: string, timeoutMs: number = 30000) => {
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error(`Embedding generation timed out after ${timeoutMs}ms`)), timeoutMs)
            );
            return Promise.race([embeddings.embedQuery(text), timeoutPromise]) as Promise<number[]>;
        };

        // 1. Try Active Provider if set (with instance caching)
        if (this._activeProvider) {
            try {
                const pid = this._activeProvider.id;

                // OpenAI
                if (pid.includes('openai')) {
                    const apiKey = process.env.OPENAI_API_KEY;
                    if (!apiKey) {
                        console.warn("[EmbeddingService] Active provider is OpenAI but no key found. Falling back to auto-discovery.");
                    } else {
                        const embeddings = this.getOrCreateEmbeddingsInstance(pid, () => new OpenAIEmbeddings({
                            openAIApiKey: apiKey,
                            modelName: this._activeProvider.model
                        }));
                        return await embedWithTimeout(embeddings, text);
                    }
                }

                // Ollama
                else if (pid.includes('ollama')) {
                    const embeddings = this.getOrCreateEmbeddingsInstance(pid, () => new OllamaEmbeddings({
                        baseUrl: process.env.OLLAMA_BASE_URL || "http://192.168.1.13:11434", // Configurable via env var
                        model: this._activeProvider.model
                    }));
                    return await embedWithTimeout(embeddings, text, 60000); // 60s for local model
                }
            } catch (e) {
                console.error(`[EmbeddingService] Error using active provider ${this._activeProvider.name}:`, e);
                console.log("[EmbeddingService] Falling back to auto-discovery...");
                // Invalidate cache on error
                this._cachedEmbeddingsInstance = null;
                this._cachedProviderId = null;
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
                const embeddings = this.getOrCreateEmbeddingsInstance('openai-db', () => new OpenAIEmbeddings({
                    openAIApiKey: openaiProvider.apiKey || process.env.OPENAI_API_KEY,
                    modelName: "text-embedding-3-small"
                }));
                const result = await embedWithTimeout(embeddings, text);

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
                const baseUrl = config.baseUrl || process.env.OLLAMA_BASE_URL || "http://192.168.1.13:11434";
                const embeddings = this.getOrCreateEmbeddingsInstance('ollama-db', () => new OllamaEmbeddings({
                    baseUrl: baseUrl,
                    model: model
                }));

                // Validate if Ollama is reachable first
                try {
                    return await embedWithTimeout(embeddings, text, 60000); // 60s timeout per embedding
                } catch (ollamaErr: any) {
                    if (ollamaErr.cause && (ollamaErr.cause.code === 'ECONNREFUSED' || ollamaErr.cause.code === 'ETIMEDOUT')) {
                        throw new Error(`Ollama connection failed at ${baseUrl}. Is Ollama running on the server?`);
                    }
                    throw ollamaErr;
                }

                this._activeProvider = {
                    id: 'ollama-db',
                    name: 'Ollama (Database)',
                    model: model,
                    dimension: 768
                };
            } catch (e) {
                console.error("Error generating Ollama embedding:", e);
            }
        }

        // C. Check Env for OpenAI
        if (process.env.OPENAI_API_KEY) {
            try {
                console.log("[EmbeddingService] Auto-discovered OpenAI from ENV");
                const embeddings = this.getOrCreateEmbeddingsInstance('openai-env', () => new OpenAIEmbeddings({
                    openAIApiKey: process.env.OPENAI_API_KEY,
                    modelName: "text-embedding-3-small"
                }));
                const result = await embedWithTimeout(embeddings, text);

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

        // D. Last Resort: Try default Ollama
        try {
            const defaultOllamaUrl = process.env.OLLAMA_BASE_URL || "http://192.168.1.13:11434";
            console.log(`[EmbeddingService] Attempting default Ollama at ${defaultOllamaUrl} (nomic-embed-text)`);
            const embeddings = this.getOrCreateEmbeddingsInstance('ollama-local', () => new OllamaEmbeddings({
                baseUrl: defaultOllamaUrl,
                model: "nomic-embed-text"
            }));
            const result = await embedWithTimeout(embeddings, text, 180000);

            this._activeProvider = {
                id: 'ollama-local',
                name: 'Ollama (Local)',
                model: 'nomic-embed-text',
                dimension: 768
            };
            return result;
        } catch (e: any) {
            if (e.cause && (e.cause.code === 'ECONNREFUSED' || e.cause.code === 'ETIMEDOUT')) {
                console.warn("[EmbeddingService] Default local Ollama unreachable. Is 'ollama serve' running?");
            } else {
                console.warn("[EmbeddingService] Default local Ollama failed:", e.message);
            }
        }

        throw new Error("No active embedding provider found. Please configure OpenAI or ensure Ollama is running with 'nomic-embed-text'.");
    }
}
