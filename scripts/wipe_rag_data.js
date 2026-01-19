const { MilvusClient } = require('@zilliz/milvus2-sdk-node');
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

// Initialize Prisma
const prisma = new PrismaClient();

async function wipeData() {
    console.log("⚠️ STARTING RAG DATA WIPE ⚠️");

    // 1. Clear Milvus
    try {
        console.log("Connecting to Milvus...");
        const milvus = new MilvusClient({ address: '127.0.0.1:19530' });

        console.log("Dropping Milvus collection 'hydraulic_knowledge'...");
        const dropRes = await milvus.dropCollection({ collection_name: 'hydraulic_knowledge' });
        console.log("Milvus drop result:", dropRes);
    } catch (e) {
        console.error("Error clearing Milvus:", e);
    }

    // 2. Clear SQLite Data
    try {
        console.log("Clearing SQLite tables...");

        // Delete chunks first due to foreign keys
        const deletedChunks = await prisma.knowledgeChunk.deleteMany({});
        console.log(`Deleted ${deletedChunks.count} knowledge chunks.`);

        const deletedKnowledge = await prisma.hydraulicKnowledge.deleteMany({});
        console.log(`Deleted ${deletedKnowledge.count} knowledge entries.`);

        // Also clear document tables if they are used for RAG
        const deletedDocChunks = await prisma.documentChunk.deleteMany({});
        console.log(`Deleted ${deletedDocChunks.count} document chunks.`);

        const deletedDocs = await prisma.document.deleteMany({});
        console.log(`Deleted ${deletedDocs.count} documents.`);

        console.log("✅ SQLite data cleared.");
    } catch (e) {
        console.error("Error clearing SQLite:", e);
    } finally {
        await prisma.$disconnect();
    }
}

wipeData();
