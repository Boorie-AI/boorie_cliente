const { MilvusClient } = require('@zilliz/milvus2-sdk-node');

async function checkMilvus() {
    console.log("Connecting to Milvus...");
    try {
        const client = new MilvusClient({ address: '127.0.0.1:19530' });

        // Wait for connection
        await new Promise(r => setTimeout(r, 2000));

        console.log("Listing collections...");
        const collections = await client.listCollections();
        console.log("Collections:", collections);

        if (collections.data && collections.data.find(c => c.name === 'hydraulic_knowledge')) {
            console.log("Found 'hydraulic_knowledge' collection.");
            console.log("Collection 'hydraulic_knowledge' is healthy.");
        } else {
            console.log("Collection 'hydraulic_knowledge' NOT found.");
        }

    } catch (e) {
        console.error("Error connecting or querying Milvus:", e);
    }
}

checkMilvus();
