const fs = require('fs');
const pdf = require('pdf-parse');

const filePath = 'rag-knowledge/000-libros-Boorie/1-Fuentes-Hidrologia/1.5 Cosecha-agua-Couv-guide-eau-de-pluie_2601 2.pdf';
const docId = 'cmkjua3g3000nv5c7kkvasxkt';

async function generateSQL() {
    try {
        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdf(dataBuffer);
        let text = data.text;

        // Take first 8000 chars
        text = text.substring(0, 8000);

        // Escape single quotes for SQL
        const safeText = text.replace(/'/g, "''");

        const sql = `UPDATE knowledge_chunks SET content = '${safeText}', embedding = '[]' WHERE knowledgeId = '${docId}';`;
        console.log(sql);
    } catch (e) {
        console.error("Error:", e);
        process.exit(1);
    }
}

generateSQL();
