import { PrismaClient } from '@prisma/client'
import { MilvusService } from '../milvus.service'
import { EmbeddingService } from '../embedding.service'

export interface SearchResult {
  id: string
  content: string
  score: number
  method: 'semantic'
  metadata?: any
}

export interface HybridSearchOptions {
  topK?: number
  category?: string
  region?: string
  language?: string
}

export class HybridSearchService {
  private prisma: PrismaClient
  private embeddingService: any
  private milvusService: MilvusService

  constructor(prisma: PrismaClient, embeddingService?: any) {
    this.prisma = prisma
    this.embeddingService = embeddingService || new EmbeddingService(prisma)
    this.milvusService = MilvusService.getInstance()

    // Initial sync
    this.milvusService.ensureConnection().then(() => {
      this.syncPrismaToMilvus()
    })
  }

  private async syncPrismaToMilvus() {
    try {
      const stats = await this.milvusService.getClient().getCollectionStatistics({
        collection_name: MilvusService.COLLECTIONS.KNOWLEDGE
      })
      const rowCountStats = stats.stats.find(s => s.key === 'row_count')
      const milvusCount = rowCountStats ? parseInt(String(rowCountStats.value)) : 0
      const prismaCount = await this.prisma.knowledgeChunk.count()

      const targetDimension = 768; // Hardcoded to Ollama defaults for now

      console.log(`[HybridSearchService] Checking sync status... Milvus: ${milvusCount}, Prisma: ${prismaCount}`);

      // Only sync if there is a significant discrepancy
      if (milvusCount < prismaCount) {
        console.log('[HybridSearchService] Syncing chunks to Milvus (Batch Mode)...')

        const BATCH_SIZE = 50;
        let processed = 0;

        // We'll process everything to be safe, but in small batches
        // Ideally we would only fetch missing ones, but we don't track that easily yet.
        // We iterate through all chunks.

        let cursorEncoded: string | undefined = undefined;
        let lastId = undefined;

        while (true) {
          const params: any = {
            take: BATCH_SIZE,
            include: { knowledge: true },
            orderBy: { id: 'asc' }
          };

          if (lastId) {
            params.cursor = { id: lastId };
            params.skip = 1; // Skip the cursor itself
          }

          const chunks = await this.prisma.knowledgeChunk.findMany(params) as any[];

          if (chunks.length === 0) break;

          const milvusBatch = [];

          for (const chunk of chunks) {
            lastId = chunk.id; // Update cursor

            if (!chunk.content) continue;

            let vector: number[] = [];
            let needsUpdate = false;

            try {
              if (chunk.embedding) {
                vector = JSON.parse(chunk.embedding);
              }
            } catch (e) { }

            // Check dimension mismatch
            if (vector.length !== targetDimension) {
              // Only log occasionally to avoid spam
              if (processed % 10 === 0) {
                console.log(`[HybridSearchService] Embedding dimension mismatch/missing for chunk ${chunk.id}. Re-generating...`);
              }

              try {
                // Safety Truncation: Ensure content isn't too large for the model
                // This handles legacy chunks that were created before the size limit was enforced
                let contentToEmbed = chunk.content;
                if (contentToEmbed.length > 1000) {
                  // console.warn(`[HybridSearchService] Truncating oversized chunk ${chunk.id} (${contentToEmbed.length} chars) to 1000 chars.`);
                  contentToEmbed = contentToEmbed.substring(0, 1000);
                }

                vector = await this.embeddingService.generateEmbedding(contentToEmbed);
                needsUpdate = true;
              } catch (embedError) {
                console.error(`[HybridSearchService] Failed to re-embed chunk ${chunk.id}:`, embedError);
                continue;
              }
            }

            if (vector.length > 0) {
              if (needsUpdate) {
                await this.prisma.knowledgeChunk.update({
                  where: { id: chunk.id },
                  data: { embedding: JSON.stringify(vector) }
                });
              }

              milvusBatch.push({
                id: chunk.id,
                vector: vector,
                content: chunk.content,
                metadata: {
                  chunkId: chunk.id,
                  docId: chunk.knowledgeId,
                  title: chunk.knowledge.title,
                  category: chunk.knowledge.category
                },
                timestamp: chunk.createdAt.getTime()
              })
            }
          }

          if (milvusBatch.length > 0) {
            await this.milvusService.insert(MilvusService.COLLECTIONS.KNOWLEDGE, milvusBatch);
            processed += milvusBatch.length;
            console.log(`[HybridSearchService] Synced batch of ${milvusBatch.length} chunks. Total processed: ${processed}`);
          }

          // Sleep briefly to yield to the event loop
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        console.log(`[HybridSearchService] Sync complete. Processed ${processed} chunks.`);
      }
    } catch (e) {
      console.error('Sync failed', e)
    }
  }

  /**
   * Main Search Method
   */
  async hybridSearch(
    query: string,
    options: HybridSearchOptions = {}
  ): Promise<SearchResult[]> {
    const { topK = 10 } = options

    try {
      console.log(`[HybridSearchService] Generating embedding for query: "${query}"`);
      const vector = await this.embeddingService.generateEmbedding(query)
      console.log(`[HybridSearchService] Embedding generated. Length: ${vector.length}`);

      // Construct filter expression
      const filters: string[] = []
      if (options.category) {
        filters.push(`metadata["category"] == "${options.category}"`)
      }
      if (options.region) {
        filters.push(`metadata["region"] == "${options.region}"`)
      }
      if (options.language) {
        filters.push(`metadata["language"] == "${options.language}"`)
      }

      const filterExpr = filters.length > 0 ? filters.join(' and ') : undefined
      console.log(`[HybridSearchService] executing Milvus search. Filter: "${filterExpr || 'NONE'}"`);

      const searchRes = await this.milvusService.search(
        MilvusService.COLLECTIONS.KNOWLEDGE,
        vector,
        topK,
        filterExpr
      )

      console.log(`[HybridSearchService] Milvus returned ${searchRes.results?.length || 0} results.`);

      if (!searchRes.results) return []

      return searchRes.results.map((hit: any) => ({
        id: hit.id,
        content: hit.content,
        score: hit.score,
        method: 'semantic',
        metadata: hit.metadata
      }))

    } catch (error) {
      console.error('Search error:', error)
      return []
    }
  }

  // Helper methods
  async quickSearch(query: string) { return this.hybridSearch(query, { topK: 5 }) }
}