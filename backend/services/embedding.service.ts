import { OpenAIEmbeddings } from "@langchain/openai";
import { PrismaClient } from "@prisma/client";
import { modeloEmbeddingsOllama, dimensionEsperada } from "./modeloEmbeddings";

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

    /**
     * Un texto por `/api/embed`, no por LangChain.
     *
     * LangChain habla con `/api/embeddings`, el endpoint antiguo, que devuelve
     * un 500 —«the input length exceeds the context length»— en cuanto el texto
     * pasa de la ventana del modelo; el nuevo lo trunca y responde. Con un
     * modelo de ventana corta eso convertía cada fragmento largo en un fallo, y
     * encima LangChain reintenta por dentro con espera creciente: medido, el
     * reindexado se quedaba parado minutos por un solo fragmento. Comprobado
     * lado a lado con el mismo texto de 3.000 caracteres: `/api/embed` responde,
     * `/api/embeddings` da 500.
     */
    private async unoPorOllama(texto: string, url?: string, modelo?: string): Promise<number[]> {
        const [vector] = await this.loteOllama([texto], url, modelo);
        return vector;
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
                    return await this.unoPorOllama(
                        text,
                        this._activeProvider.baseUrl || process.env.OLLAMA_BASE_URL,
                        this._activeProvider.model
                    );
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

        // BUG FIX #9: OpenAI embeddings (1536 dims) son INCOMPATIBLES con Ollama embeddings (768 dims)
        // Si se mezclan en la BD, la búsqueda semántica falla silenciosamente
        // Solución: Usar SIEMPRE el mismo modelo. El de Ollama lo fija `modeloEmbeddings`.
        // Si ya hay embeddings en la BD con otras dims, se deben reindexar.
        
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
                const model = modeloEmbeddingsOllama();
                const baseUrl = config.baseUrl || process.env.OLLAMA_BASE_URL || "http://localhost:11434";

                let vector: number[];
                try {
                    vector = await this.unoPorOllama(text, baseUrl, model);
                } catch (ollamaErr: any) {
                    if (ollamaErr.cause && (ollamaErr.cause.code === 'ECONNREFUSED' || ollamaErr.cause.code === 'ETIMEDOUT')) {
                        throw new Error(`Ollama connection failed at ${baseUrl}. Is Ollama running on the server?`);
                    }
                    throw ollamaErr;
                }

                // El `return` iba antes de esto y el proveedor no se apuntaba nunca: cada
                // lote de `generateEmbeddings` caía al camino de uno en uno, con su consulta
                // a la base por fragmento. Medido en una base real: 146 fragmentos/min, uno
                // por petición, cuando el lote da 551.
                this._activeProvider = {
                    id: 'ollama-db',
                    name: 'Ollama (Database)',
                    model: model,
                    dimension: dimensionEsperada(),
                    baseUrl
                };
                return vector;
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
            const defaultOllamaUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
            const modeloLocal = modeloEmbeddingsOllama();
            console.log(`[EmbeddingService] Attempting default Ollama at ${defaultOllamaUrl} (${modeloLocal})`);
            const result = await this.unoPorOllama(text, defaultOllamaUrl, modeloLocal);

            this._activeProvider = {
                id: 'ollama-local',
                name: 'Ollama (Local)',
                model: modeloLocal,
                dimension: dimensionEsperada(),
                baseUrl: defaultOllamaUrl
            };
            return result;
        } catch (e: any) {
            if (e.cause && (e.cause.code === 'ECONNREFUSED' || e.cause.code === 'ETIMEDOUT')) {
                console.warn("[EmbeddingService] Default local Ollama unreachable. Is 'ollama serve' running?");
            } else {
                console.warn("[EmbeddingService] Default local Ollama failed:", e.message);
            }
        }

        throw new Error(`No active embedding provider found. Please configure OpenAI or ensure Ollama is running with '${modeloEmbeddingsOllama()}'.`);
    }

    /**
     * Varios textos de una vez.
     *
     * Indexar mandaba **un fragmento por petición HTTP**, y ahí se va el tiempo
     * de reindexar una base grande: medido sobre fragmentos reales con bge-m3 en
     * una GTX 960M, 96 fragmentos/min uno a uno contra 199 agrupando. El doble,
     * sin cambiar de modelo ni de máquina. La ganancia satura con lotes de diez,
     * así que no hace falta afinar el tamaño.
     *
     * El resto de proveedores y cualquier fallo del lote caen al camino de uno
     * en uno, que es el que había: esto es una optimización, no una ruta nueva
     * con su propia manera de fallar.
     */
    async generateEmbeddings(textos: string[], estricto = false): Promise<number[][]> {
        if (textos.length === 0) return [];

        // La primera llamada resuelve el proveedor con la lógica de siempre.
        if (!this._activeProvider) await this.generateEmbedding(textos[0]);

        if (String(this._activeProvider?.id ?? '').includes('ollama')) {
            try {
                return await this.loteOllama(textos);
            } catch (e) {
                // `estricto` deja que el fallo suba: quien llama puede partir el
                // lote en dos y aislar al culpable en seis peticiones en vez de
                // rehacer cincuenta de una en una.
                if (estricto) throw e;
                console.warn('[EmbeddingService] El lote falló; se sigue uno a uno:', (e as Error).message);
            }
        }

        const salida: number[][] = [];
        for (const texto of textos) salida.push(await this.generateEmbedding(texto));
        return salida;
    }

    /** Una sola petición a `/api/embed` con todos los textos del lote. */
    private async loteOllama(textos: string[], url?: string, modelo?: string): Promise<number[][]> {
        const baseUrl = url
            || this._activeProvider?.baseUrl
            || process.env.OLLAMA_BASE_URL
            || 'http://localhost:11434';
        const model = modelo || this._activeProvider?.model || modeloEmbeddingsOllama();

        const respuesta = await fetch(`${baseUrl}/api/embed`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, input: textos }),
            signal: AbortSignal.timeout(300000)
        });
        if (!respuesta.ok) {
            throw new Error(`Ollama respondió ${respuesta.status} al lote de ${textos.length}`);
        }

        const datos = await respuesta.json() as { embeddings?: number[][] };
        // Un lote incompleto desalinearía los vectores con sus fragmentos, que
        // es peor que no agrupar: se rechaza y se vuelve al camino de siempre.
        if (!Array.isArray(datos.embeddings) || datos.embeddings.length !== textos.length) {
            throw new Error(`Ollama devolvió ${datos.embeddings?.length ?? 0} vectores para ${textos.length} textos`);
        }
        return datos.embeddings;
    }
}
