import { MilvusClient, DataType, ConsistencyLevelEnum } from '@zilliz/milvus2-sdk-node';
import path from 'path';
import fs from 'fs';

export class MilvusService {
    private static instance: MilvusService;
    private client: MilvusClient;
    private connected: boolean = false;

    // Collection Names
    public static COLLECTIONS = {
        KNOWLEDGE: 'hydraulic_knowledge',
        CONVERSATIONS: 'conversations'
    };

    private constructor() {
        // Connect to local server provided by Python script
        // Default Milvus port is 19530
        const address = '127.0.0.1:19530';
        console.log('[MilvusService] Connecting to Milvus Server at', address);
        this.client = new MilvusClient({ address });
    }

    public static getInstance(): MilvusService {
        if (!MilvusService.instance) {
            MilvusService.instance = new MilvusService();
        }
        return MilvusService.instance;
    }

    public getClient(): MilvusClient {
        return this.client;
    }

    public async ensureConnection() {
        if (this.connected) return;
        try {
            // Wait for connection? Milvus Node SDK is lazy/async.
            // We can try to list collections to verify connectivity.
            // Retry loop might be needed if Python script is still starting.
            let retries = 10;
            while (retries > 0) {
                try {
                    await this.client.listCollections();
                    this.connected = true;
                    console.log('[MilvusService] Connected successfully');
                    break;
                } catch (e) {
                    console.log(`[MilvusService] Waiting for Milvus server... (${retries})`);
                    await new Promise(r => setTimeout(r, 2000));
                    retries--;
                }
            }

            if (this.connected) {
                await this.initCollections();
            } else {
                console.error('[MilvusService] Could not connect to Milvus server after retries');
            }
        } catch (error) {
            console.error('[MilvusService] Connection failed:', error);
        }
    }

    private async initCollections() {
        // We need to determine the dimension. For now, we default to 768 (Ollama) if not specified, 
        // but ideally this should come from config.
        // Let's assume the user is moving to Ollama (768).
        // If we really want to be dynamic, we need to pass this in.
        // For this specific fix, we'll try to check the active provider or default to 768.
        const dimension = process.env.EMBEDDING_DIMENSION ? parseInt(process.env.EMBEDDING_DIMENSION) : 768;

        // 1. Knowledge Collection
        await this.ensureCollection(MilvusService.COLLECTIONS.KNOWLEDGE, dimension);

        // 2. Conversations Collection
        await this.ensureCollection(MilvusService.COLLECTIONS.CONVERSATIONS, dimension);
    }

    private async ensureCollection(name: string, dimension: number) {
        const has = await this.client.hasCollection({ collection_name: name });
        if (has.value) {
            // Check dimension match
            const desc = await this.client.describeCollection({ collection_name: name });
            const vectorField = desc.schema.fields.find((f: any) => f.name === 'vector');
            const currentDim = vectorField && (vectorField as any).params ? parseInt((vectorField as any).params.find((p: any) => p.key === 'dim')?.value || '0') : 0;

            // If we can't find params (SDK variance), we might inspect differently, but let's assume standard response structure
            // If the SDK structure is different (fields as array of objects), we rely on that.
            // Note: Zilliz SDK describeCollection returns { status, schema: { name, description, fields: [...] }, ... }

            if (currentDim !== dimension && currentDim !== 0) {
                console.warn(`[MilvusService] Collection ${name} dimension mismatch (Current: ${currentDim}, Required: ${dimension}). Recreating...`);
                await this.client.dropCollection({ collection_name: name });
            } else {
                await this.client.loadCollection({ collection_name: name });
                return;
            }
        }

        console.log(`[MilvusService] Creating collection ${name} with dimension ${dimension}...`);
        await this.client.createCollection({
            collection_name: name,
            fields: [
                {
                    name: 'id',
                    data_type: DataType.VarChar,
                    max_length: 64,
                    is_primary_key: true,
                },
                {
                    name: 'vector',
                    data_type: DataType.FloatVector,
                    dim: dimension,
                },
                {
                    name: 'content',
                    data_type: DataType.VarChar,
                    max_length: 8192,
                },
                {
                    name: 'metadata',
                    data_type: DataType.JSON,
                },
                {
                    name: 'timestamp',
                    data_type: DataType.Int64,
                    description: 'Unix timestamp'
                }
            ],
        });

        await this.client.createIndex({
            collection_name: name,
            field_name: 'vector',
            index_type: 'FLAT',
            metric_type: 'COSINE',
            params: { nlist: 1024 }
        });
        console.log(`[MilvusService] Collection ${name} created.`);
        await this.client.loadCollection({ collection_name: name });
    }

    public async search(collection: string, vector: number[], limit: number = 10, filter?: string, consistency: boolean = true) {
        await this.ensureConnection();
        return this.client.search({
            collection_name: collection,
            data: vector,
            limit: limit,
            filter: filter,
            output_fields: ['content', 'metadata', 'timestamp'],
            consistency_level: consistency ? ConsistencyLevelEnum.Strong : ConsistencyLevelEnum.Eventually
        });
    }

    public async insert(collection: string, rows: any[]) {
        await this.ensureConnection();
        return this.client.insert({
            collection_name: collection,
            data: rows
        });
    }

    public async delete(collection: string, ids: string[]) {
        await this.ensureConnection();
        return this.client.delete({
            collection_name: collection,
            filter: `id in ["${ids.join('","')}"]`
        });
    }

    public async listCollections() {
        await this.ensureConnection();
        return this.client.listCollections();
    }

    public async describeCollection(collectionName: string) {
        await this.ensureConnection();
        return this.client.describeCollection({ collection_name: collectionName });
    }

    public async getCollectionStatistics(collectionName: string) {
        await this.ensureConnection();
        return this.client.getCollectionStatistics({ collection_name: collectionName });
    }

    public async query(collection: string, filter: string = '', output_fields: string[] = ['*'], limit: number = 50, offset: number = 0) {
        await this.ensureConnection();
        // Determine filter. If empty, Milvus might expect an expression that matches all, or we might need to be careful.
        // Usually "" is not valid. "id != ''" or similar might be needed if filter is mandatory, 
        // but often query() without filter implies "all" if the SDK supports it, or it might fail.
        // Safe default might be a simple tautology if available, but let's try passing undefined/empty first.
        // Actually, for Milvus query, 'expr' is required. "id > 0" or similar depends on PK type.
        // Let's assume the caller provides a valid filter or we use a fallback if possible.
        // For now, if filter is empty, we'll try to use a "match all" strategy if we know the PK.
        // But simply exposing the method is enough for now; the handler can deal with the filter.

        return this.client.query({
            collection_name: collection,
            filter: filter || 'id != ""', // rudimentary fallback for string IDs, might fail for int IDs
            output_fields: output_fields,
            limit: limit,
            offset: offset
        });
    }
}
