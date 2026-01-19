const { MilvusClient, DataType } = require('@zilliz/milvus2-sdk-node');
const fs = require('fs');
const path = require('path');

const jsonPath = path.join(__dirname, '../scripts/chunks_dump.json');
const MILVUS_ADDRESS = 'localhost:19530';
const COLLECTION_NAME = 'hydraulic_knowledge';

async function syncMilvus() {
    console.log("Starting Sync Script...");

    // 1. Read JSON
    let rows;
    try {
        const raw = fs.readFileSync(jsonPath, 'utf8');
        rows = JSON.parse(raw);
    } catch (e) {
        console.error("Failed to read/parse JSON dump:", e);
        process.exit(1);
    }
    console.log(`Loaded ${rows.length} chunks from JSON.`);

    // 2. Connect to Milvus
    const milvus = new MilvusClient({ address: MILVUS_ADDRESS });
    try {
        await milvus.connectPromise;
        console.log('Connected to Milvus.');

        // 2.5 Ensure Collection Exists
        console.log(`Checking collection ${COLLECTION_NAME}...`);
        const has = await milvus.hasCollection({ collection_name: COLLECTION_NAME });
        if (!has.value) {
            console.log(`Collection ${COLLECTION_NAME} missing. Creating...`);
            await milvus.createCollection({
                collection_name: COLLECTION_NAME,
                fields: [
                    { name: 'id', data_type: DataType.VarChar, max_length: 64, is_primary_key: true },
                    { name: 'vector', data_type: DataType.FloatVector, dim: 768 },
                    { name: 'content', data_type: DataType.VarChar, max_length: 16384 }, // Max length increased to be safe
                    { name: 'metadata', data_type: DataType.JSON },
                    { name: 'timestamp', data_type: DataType.Int64 }
                ]
            });
            console.log("Collection created.");

            // Create Index
            console.log("Creating Index...");
            await milvus.createIndex({
                collection_name: COLLECTION_NAME,
                field_name: 'vector',
                index_type: 'FLAT',
                metric_type: 'COSINE',
                params: { nlist: 1024 }
            });
            console.log("Index created.");

            // Load collection
            await milvus.loadCollection({ collection_name: COLLECTION_NAME });
            console.log("Collection loaded.");
        } else {
            console.log(`Collection ${COLLECTION_NAME} exists.`);
            await milvus.loadCollection({ collection_name: COLLECTION_NAME });
        }

    } catch (e) {
        console.error('Failed to connect to Milvus or create collection:', e);
    }

    // 3. Process Chunks (already loaded)
    console.log(`Found ${rows.length} chunks in JSON.`);

    if (rows.length === 0) return;

    // 4. Prepare Data for Milvus
    const data = [];
    let skipped = 0;

    for (const row of rows) {
        let vector;
        try {
            vector = JSON.parse(row.embedding);
        } catch (e) {
            console.warn(`Invalid JSON embedding for chunk ${row.id}`);
            skipped++;
            continue;
        }

        if (!Array.isArray(vector) || vector.length === 0) {
            console.warn(`Empty vector for chunk ${row.id}`);
            skipped++;
            continue;
        }

        // Construct metadata
        let meta = {};
        try {
            meta = JSON.parse(row.chunk_metadata || '{}');
        } catch (e) { }

        // Add denormalized fields
        meta.docId = row.docId;
        meta.title = row.title;
        meta.category = row.category;
        meta.chunkId = row.id;

        // Milvus Row
        data.push({
            id: row.id,
            vector: vector,
            content: row.content,
            metadata: meta,
            timestamp: new Date(row.timestamp).getTime()
        });
    }

    console.log(`Prepared ${data.length} rows for insertion (Skipped ${skipped}).`);

    if (data.length > 0) {
        // 5. Insert into Milvus (batching usually handled by SDK or we do 100s)
        // We'll do batches of 100
        const batchSize = 100;
        for (let i = 0; i < data.length; i += batchSize) {
            const batch = data.slice(i, i + batchSize);
            console.log(`Inserting batch ${i} to ${i + batch.length}...`);

            try {
                const resp = await milvus.insert({
                    collection_name: COLLECTION_NAME,
                    data: batch
                });
                console.log('Insert status:', resp.status);
            } catch (e) {
                console.error('Insert failed:', e);
            }
        }

        console.log("Sync Complete.");

        console.log("Flushing...");
        await milvus.flush({ collection_names: [COLLECTION_NAME] });

        // Verify
        await new Promise(r => setTimeout(r, 2000)); // wait for index?
        const stats = await milvus.getCollectionStatistics({ collection_name: COLLECTION_NAME });
        console.log("New Milvus Stats:", JSON.stringify(stats, null, 2));
    }
}

syncMilvus();
