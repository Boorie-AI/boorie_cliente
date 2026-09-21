import { PrismaClient } from '@prisma/client'
import { MilvusService } from '../milvus.service'
import { EmbeddingService } from '../embedding.service'
import { duenoVectorial, duenosPermitidos, filtroPrisma, filtroVectorial, type Ambito } from './ambitos'
import { corpusDe, filtroDeCorpus, repartirPorCorpus, sinRepetidos, unirFiltros, type Corpus } from './repartoDeCorpus'
import { dimensionEsperada } from '../modeloEmbeddings'

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
  /**
   * Ámbito de la búsqueda (#39). Esta es la ruta del agente del chat, y hasta
   * ahora no filtraba por nada: un documento interno del proyecto A podía
   * acabar citado en una conversación del proyecto B. El valor por defecto es
   * el general, que es lo único que se puede servir sin saber quién pregunta.
   */
  ambito?: Ambito
  projectId?: string | null
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

      // La del modelo en uso, no un 768 fijo (#155): con el valor a mano, un
      // modelo de otro tamaño hacía que TODOS los fragmentos parecieran
      // desajustados y se regeneraran en cada arranque, para siempre.
      const targetDimension = dimensionEsperada();

      console.log(`[HybridSearchService] Checking sync status... Milvus: ${milvusCount}, Prisma: ${prismaCount}`);

      // Only sync if there is a significant discrepancy
      if (milvusCount < prismaCount) {
        console.log('[HybridSearchService] Syncing chunks to Milvus (Batch Mode)...')

        const BATCH_SIZE = 50;
        let processed = 0;
        let fallosAlGuardar = 0;
        let descuadrados = 0;

        // We'll process everything to be safe, but in small batches
        // Ideally we would only fetch missing ones, but we don't track that easily yet.
        // We iterate through all chunks.

        let lastId = undefined;

        for (;;) {
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
            } catch {
              // ignore JSON parse failures; vector stays empty
            }

            /*
             * Un vector del tamaño que no toca NO se regenera aquí.
             *
             * Esto reindexaba la base entera al arrancar, fragmento a
             * fragmento, sin que nadie lo pidiera: en la base de un usuario con
             * 102.062 fragmentos eso son horas de GPU en cada apertura, y
             * además compite con el reindexado que el usuario sí haya lanzado
             * desde el panel —medido: el suyo no avanzó ni un fragmento en 150
             * segundos mientras esta sincronización tenía la tarjeta—. La
             * interfaz ya promete lo contrario: «No se hace solo: hasta que lo
             * pidas, no se toca nada». Se cuentan y se avisa una vez; quien los
             * regenera es `wisdom:massiveReindex`, con su aviso y su progreso.
             *
             * Un fragmento SIN vector es otra cosa: es un hueco, no un cambio
             * de modelo, y ése sí se rellena aquí.
             */
            if (vector.length > 0 && vector.length !== targetDimension) {
              descuadrados++;
              continue;
            }

            if (vector.length !== targetDimension) {
              // Only log occasionally to avoid spam
              if (processed % 10 === 0) {
                console.log(`[HybridSearchService] Embedding missing for chunk ${chunk.id}. Generating...`);
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
                /*
                 * Este `update` estaba fuera de todo try —el de arriba sólo
                 * cubre generar el vector—, así que un `P1008` de Prisma al
                 * reescribir **un** fragmento salía del bucle y se llevaba por
                 * delante la migración entera. En una base de 102.062
                 * fragmentos paró en 8.397 y no volvió a arrancar: el resto se
                 * quedó con vectores del modelo viejo, que es como dejar el RAG
                 * mudo. Se anota y se sigue; lo que no se guardó se vuelve a
                 * intentar en el siguiente arranque.
                 */
                try {
                  await this.prisma.knowledgeChunk.update({
                    where: { id: chunk.id },
                    data: { embedding: JSON.stringify(vector) }
                  });
                } catch (updateError) {
                  fallosAlGuardar++;
                  console.error(`[HybridSearchService] No se pudo guardar el embedding de ${chunk.id}:`, updateError);
                  continue;
                }
              }

              milvusBatch.push({
                id: chunk.id,
                vector: vector,
                content: chunk.content,
                metadata: {
                  chunkId: chunk.id,
                  docId: chunk.knowledgeId,
                  title: chunk.knowledge.title,
                  category: chunk.knowledge.category,
                  // Igual que en el resto de rutas de indexado: el fragmento que
                  // entra sin dueño no lo encuentra ninguna búsqueda (#158).
                  projectId: duenoVectorial(chunk.knowledge.projectId)
                },
                timestamp: chunk.createdAt.getTime()
              })
            }
          }

          if (milvusBatch.length > 0) {
            // Lo mismo con el almacén vectorial: el lote que falle se reintenta
            // en el próximo arranque, porque `milvusCount < prismaCount` seguirá
            // siendo cierto. Abortar aquí dejaba la base a medio migrar.
            try {
              await this.milvusService.insert(MilvusService.COLLECTIONS.KNOWLEDGE, milvusBatch);
              processed += milvusBatch.length;
              console.log(`[HybridSearchService] Synced batch of ${milvusBatch.length} chunks. Total processed: ${processed}`);
            } catch (insertError) {
              console.error(`[HybridSearchService] No se pudo insertar un lote de ${milvusBatch.length} fragmentos:`, insertError);
            }
          }

          // Sleep briefly to yield to the event loop
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        console.log(
          `[HybridSearchService] Sync complete. Processed ${processed} chunks.` +
          (fallosAlGuardar > 0 ? ` ${fallosAlGuardar} se quedaron sin guardar y se reintentarán.` : '')
        );
        if (descuadrados > 0) {
          console.warn(
            `[HybridSearchService] ${descuadrados} fragmentos tienen vectores de otro tamaño y no se han ` +
            `tocado: son de un modelo de embeddings anterior. Hay que reindexar la base de conocimiento ` +
            `desde el panel para que vuelvan a poder buscarse.`
          );
        }
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
    const { topK = 10, ambito = 'general', projectId = null } = options
    const permitidos = duenosPermitidos(ambito, projectId)

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

      const filtroAmbito = filtroVectorial(permitidos)
      if (filtroAmbito) filters.push(`(${filtroAmbito})`)

      const filterExpr = filters.length > 0 ? filters.join(' and ') : undefined
      console.log(`[HybridSearchService] executing Milvus search. Filter: "${filterExpr || 'NONE'}"`);

      /**
       * Una búsqueda por corpus y luego el reparto (#158). Es el camino del
       * chat, y es donde más se notaba: con proyecto activo se busca en los dos
       * ámbitos, así que los trescientos informes de simulación compiten con la
       * documentación en cada pregunta.
       */
      const porCorpus = await Promise.all(
        (['documental', 'simulacion'] as Corpus[]).map(corpus =>
          this.milvusService.search(
            MilvusService.COLLECTIONS.KNOWLEDGE,
            vector,
            // Con ámbito de proyecto se piden más candidatos: parte de lo que
            // devuelva el almacén se descarta al comprobar de quién es.
            permitidos.length > 1 ? topK * 6 : topK * 3,
            unirFiltros(filterExpr, filtroDeCorpus(corpus))
          )
        )
      )

      const candidatos = sinRepetidos(
        porCorpus.flatMap(res => res?.results ?? [])
      ).sort((a: any, b: any) => b.score - a.score)

      console.log(`[HybridSearchService] Milvus returned ${candidatos.length} results across both corpora.`);

      if (candidatos.length === 0) return []

      /**
       * Y el recorte respeta la cuota de cada corpus (#158).
       *
       * **Todos** los recortes del camino tienen que respetarla, no sólo el
       * último. Se intentó dejarlo para el final y el manual no llegaba: este
       * `slice` por puntuación se lo comía antes, porque los informes de
       * simulación puntúan más alto al estar escritos en el idioma de la
       * pregunta. Una plaza reservada que otro corte reparte por puntuación no
       * está reservada.
       *
       * El ámbito se comprueba antes: no tiene sentido guardarle sitio a un
       * fragmento que la base va a descartar por no ser suyo.
       */
      const permitidosPorAmbito = await this.filtrarPorAmbito(candidatos, permitidos)
      return repartirPorCorpus(
        permitidosPorAmbito,
        topK,
        (hit: any) => corpusDe(hit?.metadata?.category)
      )

    } catch (error) {
      console.error('Search error:', error)
      return []
    }
  }

  /**
   * Deja pasar sólo los fragmentos cuyos documentos permite el ámbito.
   *
   * La garantía se pone aquí y no en el filtro del almacén vectorial (#39): el
   * almacén puede ignorar el filtro o devolver de más, y falla en silencio. La
   * base es la autoridad sobre de quién es cada documento, y un fragmento cuyo
   * documento no aparece en esta consulta no llega a ser una cita.
   */
  private async filtrarPorAmbito(hits: any[], permitidos: (string | null)[]): Promise<SearchResult[]> {
    const docIds = [...new Set(hits.map(h => h.metadata?.docId).filter(Boolean))]

    // Sin docId no se puede comprobar de quién es el fragmento. Se descarta:
    // ante la duda, se ve de menos.
    if (docIds.length === 0) return []

    const permitidosEnBase = await this.prisma.hydraulicKnowledge.findMany({
      where: { id: { in: docIds as string[] }, ...filtroPrisma(permitidos) },
      select: { id: true },
    })
    const visibles = new Set(permitidosEnBase.map(d => d.id))

    return hits
      .filter(h => h.metadata?.docId && visibles.has(h.metadata.docId))
      .map(hit => ({
        // Milvus Lite no devuelve la clave primaria en los resultados de
        // búsqueda, ni pidiéndola en `output_fields`, así que `hit.id` viene
        // vacío. Sin identificador, el nodo de recuperación mete todos los
        // resultados en el mismo `undefined` al desempatar y se queda con uno.
        // El `chunkId` de la metainformación es esa misma clave.
        id: hit.id ?? hit.metadata?.chunkId,
        content: hit.content,
        score: hit.score,
        method: 'semantic' as const,
        metadata: hit.metadata,
      }))
  }

  // Helper methods
  async quickSearch(query: string) { return this.hybridSearch(query, { topK: 5 }) }
}