"use strict";
// RAG Service - Handles collection and document management for RAG functionality
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.RAGService = void 0;
const logger_1 = require("../utils/logger");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const logger = (0, logger_1.createLogger)('RAGService');
class RAGService {
    constructor(prismaClient, documentParser, embeddingService) {
        this.prismaClient = prismaClient;
        this.documentParser = documentParser;
        this.embeddingService = embeddingService;
        logger.info('RAG service initialized');
    }
    // Collection Management
    async createCollection(params) {
        try {
            logger.debug('Creating new collection', { name: params.name });
            const collection = await this.prismaClient.collection.create({
                data: {
                    name: params.name,
                    description: params.description,
                    chunkSize: params.chunkSize || 1024,
                    overlap: params.overlap || 256,
                    embeddingModel: params.embeddingModel,
                    modelProvider: params.modelProvider
                }
            });
            logger.success('Created collection', { id: collection.id, name: collection.name });
            return {
                success: true,
                data: collection
            };
        }
        catch (error) {
            logger.error('Failed to create collection', error, params);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to create collection'
            };
        }
    }
    async getCollections() {
        try {
            logger.debug('Fetching all collections');
            const collections = await this.prismaClient.collection.findMany({
                include: {
                    documents: {
                        include: {
                            chunks: true
                        }
                    }
                },
                orderBy: {
                    updatedAt: 'desc'
                }
            });
            const result = collections.map(collection => ({
                ...collection,
                documents: collection.documents.map(doc => ({
                    ...doc,
                    fileType: doc.fileType,
                    metadata: doc.metadata ? JSON.parse(doc.metadata) : null,
                    chunks: doc.chunks.map(chunk => ({
                        ...chunk,
                        embedding: chunk.embedding ? JSON.parse(chunk.embedding) : null,
                        metadata: chunk.metadata ? JSON.parse(chunk.metadata) : null
                    }))
                }))
            }));
            logger.success(`Retrieved ${result.length} collections`);
            return {
                success: true,
                data: result
            };
        }
        catch (error) {
            logger.error('Failed to get collections', error);
            return {
                success: false,
                error: 'Failed to retrieve collections'
            };
        }
    }
    async getCollectionById(id) {
        try {
            logger.debug('Fetching collection by ID', { id });
            const collection = await this.prismaClient.collection.findUnique({
                where: { id },
                include: {
                    documents: {
                        include: {
                            chunks: true
                        }
                    }
                }
            });
            if (!collection) {
                logger.warn('Collection not found', { id });
                return {
                    success: false,
                    error: 'Collection not found'
                };
            }
            const result = {
                ...collection,
                documents: collection.documents.map(doc => ({
                    ...doc,
                    fileType: doc.fileType,
                    metadata: doc.metadata ? JSON.parse(doc.metadata) : null,
                    chunks: doc.chunks.map(chunk => ({
                        ...chunk,
                        embedding: chunk.embedding ? JSON.parse(chunk.embedding) : null,
                        metadata: chunk.metadata ? JSON.parse(chunk.metadata) : null
                    }))
                }))
            };
            logger.success('Retrieved collection', { id, name: result.name });
            return {
                success: true,
                data: result
            };
        }
        catch (error) {
            logger.error('Failed to get collection by ID', error, { id });
            return {
                success: false,
                error: 'Failed to retrieve collection'
            };
        }
    }
    async updateCollection(id, params) {
        try {
            logger.debug('Updating collection', { id, params });
            const collection = await this.prismaClient.collection.update({
                where: { id },
                data: params
            });
            logger.success('Updated collection', { id, name: collection.name });
            return {
                success: true,
                data: collection
            };
        }
        catch (error) {
            logger.error('Failed to update collection', error, { id, params });
            return {
                success: false,
                error: 'Failed to update collection'
            };
        }
    }
    async deleteCollection(id) {
        try {
            logger.debug('Deleting collection', { id });
            await this.prismaClient.collection.delete({
                where: { id }
            });
            logger.success('Deleted collection', { id });
            return {
                success: true,
                data: true
            };
        }
        catch (error) {
            logger.error('Failed to delete collection', error, { id });
            return {
                success: false,
                error: 'Failed to delete collection'
            };
        }
    }
    // Document Management
    async uploadDocument(collectionId, filePath, filename) {
        try {
            logger.debug('Uploading document', { collectionId, filePath });
            // Get collection to validate it exists
            const collection = await this.prismaClient.collection.findUnique({
                where: { id: collectionId }
            });
            if (!collection) {
                return {
                    success: false,
                    error: 'Collection not found'
                };
            }
            // Get file info
            const stats = fs.statSync(filePath);
            const fileSize = stats.size;
            const actualFilename = filename || path.basename(filePath);
            const fileExtension = path.extname(actualFilename).toLowerCase();
            // Determine file type
            let fileType;
            switch (fileExtension) {
                case '.pdf':
                    fileType = 'pdf';
                    break;
                case '.docx':
                    fileType = 'docx';
                    break;
                case '.pptx':
                    fileType = 'pptx';
                    break;
                case '.xlsx':
                    fileType = 'xlsx';
                    break;
                default:
                    return {
                        success: false,
                        error: `Unsupported file type: ${fileExtension}. Supported types: PDF, DOCX, PPTX, XLSX`
                    };
            }
            // Parse document content
            const parseResult = await this.documentParser.parseDocument(filePath, fileType);
            if (!parseResult.success) {
                return {
                    success: false,
                    error: parseResult.error || 'Failed to parse document'
                };
            }
            // Create document record
            const document = await this.prismaClient.document.create({
                data: {
                    filename: actualFilename,
                    filepath: filePath,
                    fileType,
                    fileSize,
                    content: parseResult.data.content,
                    metadata: JSON.stringify(parseResult.data.metadata),
                    collectionId
                }
            });
            logger.success('Created document record', { id: document.id, filename: actualFilename });
            // Process document asynchronously
            this.processDocumentAsync(document.id, collection);
            return {
                success: true,
                data: {
                    ...document,
                    fileType: document.fileType,
                    metadata: parseResult.data.metadata
                }
            };
        }
        catch (error) {
            logger.error('Failed to upload document', error, { collectionId, filePath });
            return {
                success: false,
                error: 'Failed to upload document'
            };
        }
    }
    async getDocumentsByCollection(collectionId) {
        try {
            logger.debug('Fetching documents by collection', { collectionId });
            const documents = await this.prismaClient.document.findMany({
                where: { collectionId },
                include: {
                    chunks: true
                },
                orderBy: {
                    createdAt: 'desc'
                }
            });
            const result = documents.map(doc => ({
                ...doc,
                fileType: doc.fileType,
                metadata: doc.metadata ? JSON.parse(doc.metadata) : null,
                chunks: doc.chunks.map(chunk => ({
                    ...chunk,
                    embedding: chunk.embedding ? JSON.parse(chunk.embedding) : null,
                    metadata: chunk.metadata ? JSON.parse(chunk.metadata) : null
                }))
            }));
            logger.success(`Retrieved ${result.length} documents for collection`, { collectionId });
            return {
                success: true,
                data: result
            };
        }
        catch (error) {
            logger.error('Failed to get documents by collection', error, { collectionId });
            return {
                success: false,
                error: 'Failed to retrieve documents'
            };
        }
    }
    async deleteDocument(documentId) {
        try {
            logger.debug('Deleting document', { documentId });
            await this.prismaClient.document.delete({
                where: { id: documentId }
            });
            logger.success('Deleted document', { documentId });
            return {
                success: true,
                data: true
            };
        }
        catch (error) {
            logger.error('Failed to delete document', error, { documentId });
            return {
                success: false,
                error: 'Failed to delete document'
            };
        }
    }
    // Search and Retrieval
    async searchSimilarChunks(query, collectionIds, limit = 5) {
        try {
            logger.debug('Searching similar chunks', { query: query.substring(0, 50), collectionIds, limit });
            if (collectionIds.length === 0) {
                return {
                    success: true,
                    data: []
                };
            }
            // Get the first collection to determine embedding model
            const collection = await this.prismaClient.collection.findFirst({
                where: { id: { in: collectionIds } }
            });
            if (!collection) {
                return {
                    success: false,
                    error: 'No valid collections found'
                };
            }
            // Generate query embedding
            const queryEmbedding = await this.embeddingService.generateEmbedding(query, collection.embeddingModel, collection.modelProvider);
            if (!queryEmbedding.success || !queryEmbedding.data) {
                return {
                    success: false,
                    error: 'Failed to generate query embedding'
                };
            }
            // Get all chunks from specified collections
            const chunks = await this.prismaClient.documentChunk.findMany({
                where: {
                    document: {
                        collectionId: { in: collectionIds }
                    },
                    embedding: { not: null }
                },
                include: {
                    document: true
                }
            });
            // Calculate similarities
            const similarities = chunks.map(chunk => {
                const chunkEmbedding = JSON.parse(chunk.embedding);
                const similarity = this.embeddingService.calculateSimilarity(queryEmbedding.data, chunkEmbedding);
                return {
                    ...chunk,
                    similarity,
                    metadata: chunk.metadata ? JSON.parse(chunk.metadata) : null,
                    embedding: chunkEmbedding
                };
            });
            // Sort by similarity and take top results
            const results = similarities
                .sort((a, b) => b.similarity - a.similarity)
                .slice(0, limit);
            logger.success(`Found ${results.length} similar chunks`);
            return {
                success: true,
                data: results
            };
        }
        catch (error) {
            logger.error('Failed to search similar chunks', error, { query, collectionIds });
            return {
                success: false,
                error: 'Failed to search documents'
            };
        }
    }
    // Private Methods
    async processDocumentAsync(documentId, collection) {
        try {
            logger.debug('Processing document asynchronously', { documentId });
            const document = await this.prismaClient.document.findUnique({
                where: { id: documentId }
            });
            if (!document) {
                logger.error('Document not found for processing', new Error('Document not found'), { documentId });
                return;
            }
            // Chunk the content
            const chunks = this.documentParser.chunkContent(document.content, collection.chunkSize, collection.overlap, document.fileType);
            // Process chunks in batches
            const batchSize = 10;
            for (let i = 0; i < chunks.length; i += batchSize) {
                const batch = chunks.slice(i, i + batchSize);
                await this.processBatch(batch, documentId, collection);
            }
            logger.success('Completed document processing', { documentId, totalChunks: chunks.length });
        }
        catch (error) {
            logger.error('Failed to process document', error, { documentId });
        }
    }
    async processBatch(chunks, documentId, collection) {
        const chunkPromises = chunks.map(async (chunkData, index) => {
            try {
                // Generate embedding
                const embeddingResult = await this.embeddingService.generateEmbedding(chunkData.content, collection.embeddingModel, collection.modelProvider);
                const embedding = embeddingResult.success ? embeddingResult.data : null;
                // Create chunk record
                await this.prismaClient.documentChunk.create({
                    data: {
                        content: chunkData.content,
                        embedding: embedding ? JSON.stringify(embedding) : null,
                        metadata: chunkData.metadata ? JSON.stringify(chunkData.metadata) : null,
                        startPos: chunkData.startPos,
                        endPos: chunkData.endPos,
                        documentId
                    }
                });
            }
            catch (error) {
                logger.error('Failed to process chunk', error, { documentId, chunkIndex: index });
            }
        });
        await Promise.all(chunkPromises);
    }
}
exports.RAGService = RAGService;
