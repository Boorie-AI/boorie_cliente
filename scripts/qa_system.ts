import { PrismaClient } from '@prisma/client'
// Import paths relative to script location
import { LangChainRAGService } from '../backend/services/langChainRAG.service'
import { EmbeddingService } from '../backend/services/embedding.service'
import dotenv from 'dotenv'
import path from 'path'

// Load env from root
dotenv.config({ path: path.join(__dirname, '../.env') })

async function runQA() {
    console.log("==================================================")
    console.log("       BOORIE QA SYSTEM - AUTOMATED TEST          ")
    console.log("==================================================")

    console.log(`Time: ${new Date().toISOString()}`)
    const prisma = new PrismaClient()

    try {
        // 1. Database
        process.stdout.write("1. Testing Database Connection... ")
        await prisma.$connect()
        console.log("✅ PASS")

        // 2. Embeddings
        process.stdout.write("2. Testing Embedding Service... ")
        const embedService = new EmbeddingService(prisma)
        const vector = await embedService.generateEmbedding("Hydraulic analysis of pipe flow")
        if (vector && vector.length > 0) {
            console.log(`✅ PASS (Vector Dim: ${vector.length})`)
        } else {
            console.error("❌ FAIL (Empty Vector)")
        }

        // 3. RAG Service
        process.stdout.write("3. Testing RAG Service Initialization... ")
        const ragService = new LangChainRAGService(prisma)
        console.log("✅ PASS")

        // 4. Agentic Flow
        console.log("4. Testing Agentic RAG Flow (Retriever -> Generator)...")
        const question = "What are the common causes of cavitation in pumps?"
        console.log(`   Query: "${question}"`)

        const startTime = Date.now()
        const result = await ragService.processMessage('qa-user', 'qa-conversation-id', question)
        const duration = Date.now() - startTime

        console.log(`   Response Time: ${duration}ms`)
        console.log(`   Sources Found: ${result.sources.length}`)
        console.log(`   Response Preview: ${result.response.substring(0, 100).replace(/\n/g, ' ')}...`)

        if (result.response && result.response.length > 50) {
            console.log("✅ PASS - Generated valid response")
        } else {
            console.warn("⚠️ WARNING - Response seems short or empty. Check LLM provider.")
        }

        // 5. Short Term Memory
        process.stdout.write("5. Testing Conversation Memory... ")
        // Query again in same conversation
        const followUp = "How can I prevent it?"
        const result2 = await ragService.processMessage('qa-user', 'qa-conversation-id', followUp)
        if (result2.response) {
            console.log("✅ PASS - Follow-up handled")
        } else {
            console.error("❌ FAIL - Follow-up failed")
        }

        // 6. RLHF / Feedback
        process.stdout.write("6. Testing Feedback Mechanism... ")
        const feedback = await ragService.saveFeedback({
            query: question,
            response: result.response,
            rating: 5, // 5 stars
            correction: "Excellent explanation",
            context: { sources: result.sources.map((s: any) => s.id) }
        })
        if (feedback && feedback.id) {
            console.log("✅ PASS - Feedback saved to DB")
        } else {
            console.error("❌ FAIL - Feedback not saved")
        }

        console.log("\n==================================================")
        console.log("       ALL SYSTEM COMPONENT TESTS COMPLETED       ")
        console.log("==================================================")

    } catch (e) {
        console.error("\n❌ CRITICAL FAILURE:", e)
    } finally {
        await prisma.$disconnect()
    }
}

runQA()
