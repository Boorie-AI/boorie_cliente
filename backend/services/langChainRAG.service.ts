import { ChatOpenAI } from "@langchain/openai";
import { PrismaClient } from "@prisma/client";
import { HybridSearchService } from "./hydraulic/hybridSearch";
import { HumanMessage, AIMessage, BaseMessage } from "@langchain/core/messages";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";

export class LangChainRAGService {
    private prisma: PrismaClient;
    private searchService: HybridSearchService;

    constructor(prisma: PrismaClient) {
        this.prisma = prisma;
        this.searchService = new HybridSearchService(prisma);
    }

    async processMessage(userId: string, conversationId: string, query: string) {
        // 1. Retrieve Context
        // Use topK=4 for now
        const docs = await this.searchService.hybridSearch(query, { topK: 4 });
        const context = docs.map(d => d.content).join("\n\n---\n\n");

        // 2. Load History (Short-term memory)
        const history = await this.getConversationHistory(conversationId);

        // 3. Setup Model
        // Check for provider key
        const openAIKey = process.env.OPENAI_API_KEY;

        // Use ChatOpenAI or fallback (could be Ollama in future iteration)
        const model = new ChatOpenAI({
            modelName: "gpt-4-turbo-preview",
            apiKey: openAIKey,
            temperature: 0.2
        });

        // 4. Construct Prompt
        const prompt = ChatPromptTemplate.fromMessages([
            ["system", `You are a hydraulic engineering expert AI assistant named Boorie. 
            Use the following pieces of retrieved technical context to answer the question. 
            If the answer is not in the context, say so, but you can use your general knowledge if it's a general hydraulic question. 
            Always prioritize the context provided.
            
            Technical Context:
            {context}`],
            new MessagesPlaceholder("history"),
            ["human", "{question}"]
        ]);

        // 5. Run Chain
        const chain = prompt.pipe(model).pipe(new StringOutputParser());
        const response = await chain.invoke({
            context,
            history,
            question: query
        });

        // 6. Save Message & Response to DB (Persistence)
        await this.saveInteraction(conversationId, query, response, docs);

        return {
            response,
            sources: docs
        };
    }

    private async getConversationHistory(conversationId: string): Promise<BaseMessage[]> {
        if (!conversationId) return [];

        const messages = await this.prisma.message.findMany({
            where: { conversationId },
            orderBy: { createdAt: 'desc' }, // Latest first
            take: 10 // Last 10 messages
        });

        // Reverse to chronological order for the LLM
        return messages.reverse().map(m =>
            m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content)
        );
    }

    private async saveInteraction(conversationId: string, query: string, response: string, sources: any[]) {
        if (!conversationId) return;

        // Save User Message
        await this.prisma.message.create({
            data: { conversationId, role: 'user', content: query }
        });

        // Save AI Response with metadata (sources)
        await this.prisma.message.create({
            data: {
                conversationId,
                role: 'assistant',
                content: response,
                metadata: JSON.stringify({ sources: sources.map(s => s.id) })
            }
        });
    }

    // RLHF Endpoint to save feedback
    async saveFeedback(feedbackData: {
        query: string,
        response: string,
        rating: number,
        correction?: string,
        context?: any
    }) {
        return this.prisma.feedback.create({
            data: {
                query: feedbackData.query,
                response: feedbackData.response,
                rating: feedbackData.rating,
                correction: feedbackData.correction,
                context: feedbackData.context ? JSON.stringify(feedbackData.context) : undefined
            }
        });
    }
}
