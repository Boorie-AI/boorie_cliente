const fs = require('fs');
const pdf = require('pdf-parse');
const { PrismaClient } = require('@prisma/client');
const path = require('path');

const prisma = new PrismaClient();

async function fixPdfContent() {
    const filePath = 'rag-knowledge/000-libros-Boorie/1-Fuentes-Hidrologia/1.5 Cosecha-agua-Couv-guide-eau-de-pluie_2601 2.pdf';
    const docId = 'cmkjua3g3000nv5c7kkvasxkt'; // From previous sqlite query

    console.log(`Reading PDF: ${filePath}`);
    const dataBuffer = fs.readFileSync(filePath);

    try {
        const data = await pdf(dataBuffer);
        const text = data.text;
        console.log(`Extracted ${text.length} characters.`);

        // We'll just update the existing single chunk with the first 8000 chars for now to avoid huge chunks
        // Ideally we should re-chunk, but let's just make it searchable first.
        const safeContent = text.substring(0, 8000);

        console.log("Updating database chunk...");
        await prisma.knowledgeChunk.updateMany({
            where: { knowledgeId: docId },
            data: {
                content: safeContent,
                embedding: '[]' // Clear embedding to force regeneration
            }
        });

        console.log("Database updated. Please run embedding generation script.");

    } catch (e) {
        console.error("Error parsing PDF:", e);
    }
}

fixPdfContent();
