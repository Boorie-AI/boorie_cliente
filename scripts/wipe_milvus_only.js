const { MilvusClient } = require('@zilliz/milvus2-sdk-node');

async function wipeMilvus() {
    console.log("⚠️ WIPING MILVUS DATA ⚠️");
    try {
        const milvus = new MilvusClient({ address: '127.0.0.1:19530' });

        console.log("Dropping collection 'hydraulic_knowledge'...");
        await milvus.dropCollection({ collection_name: 'hydraulic_knowledge' });
        console.log("✅ Collection dropped.");
    } catch (e) {
        console.error("Error:", e);
    }
}

wipeMilvus();
