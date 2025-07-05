"use strict";
// RAG IPC Handler - Handles RAG-related IPC communication
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
exports.RAGHandler = void 0;
const electron_1 = require("electron");
const logger_1 = require("../backend/utils/logger");
const fs = __importStar(require("fs"));
const logger = (0, logger_1.createLogger)('RAGHandler');
class RAGHandler {
    constructor(ragService, documentParser, embeddingService) {
        this.ragService = ragService;
        this.documentParser = documentParser;
        this.embeddingService = embeddingService;
        this.registerHandlers();
        logger.info('RAG IPC handlers registered');
    }
    registerHandlers() {
        // Collection Management
        electron_1.ipcMain.handle('rag:create-collection', async (event, params) => {
            try {
                logger.debug('IPC: Creating collection', { name: params.name });
                const result = await this.ragService.createCollection(params);
                if (result.success) {
                    logger.success('IPC: Created collection', { id: result.data?.id, name: params.name });
                    return {
                        success: true,
                        data: result.data
                    };
                }
                else {
                    logger.error('IPC: Failed to create collection', new Error(result.error), { name: params.name });
                    return {
                        success: false,
                        error: result.error
                    };
                }
            }
            catch (error) {
                logger.error('IPC: Error in create-collection handler', error, params);
                return {
                    success: false,
                    error: 'Failed to create collection'
                };
            }
        });
        electron_1.ipcMain.handle('rag:get-collections', async (event) => {
            try {
                logger.debug('IPC: Getting collections');
                const result = await this.ragService.getCollections();
                if (result.success) {
                    logger.success('IPC: Retrieved collections', { count: result.data?.length || 0 });
                    return {
                        success: true,
                        data: result.data
                    };
                }
                else {
                    logger.error('IPC: Failed to get collections', new Error(result.error));
                    return {
                        success: false,
                        error: result.error
                    };
                }
            }
            catch (error) {
                logger.error('IPC: Error in get-collections handler', error);
                return {
                    success: false,
                    error: 'Failed to retrieve collections'
                };
            }
        });
        electron_1.ipcMain.handle('rag:get-collection', async (event, id) => {
            try {
                logger.debug('IPC: Getting collection by ID', { id });
                const result = await this.ragService.getCollectionById(id);
                if (result.success) {
                    logger.success('IPC: Retrieved collection', { id, name: result.data?.name });
                    return {
                        success: true,
                        data: result.data
                    };
                }
                else {
                    logger.error('IPC: Failed to get collection', new Error(result.error), { id });
                    return {
                        success: false,
                        error: result.error
                    };
                }
            }
            catch (error) {
                logger.error('IPC: Error in get-collection handler', error, { id });
                return {
                    success: false,
                    error: 'Failed to retrieve collection'
                };
            }
        });
        electron_1.ipcMain.handle('rag:update-collection', async (event, id, params) => {
            try {
                logger.debug('IPC: Updating collection', { id, params });
                const result = await this.ragService.updateCollection(id, params);
                if (result.success) {
                    logger.success('IPC: Updated collection', { id, name: result.data?.name });
                    return {
                        success: true,
                        data: result.data
                    };
                }
                else {
                    logger.error('IPC: Failed to update collection', new Error(result.error), { id });
                    return {
                        success: false,
                        error: result.error
                    };
                }
            }
            catch (error) {
                logger.error('IPC: Error in update-collection handler', error, { id, params });
                return {
                    success: false,
                    error: 'Failed to update collection'
                };
            }
        });
        electron_1.ipcMain.handle('rag:delete-collection', async (event, id) => {
            try {
                logger.debug('IPC: Deleting collection', { id });
                const result = await this.ragService.deleteCollection(id);
                if (result.success) {
                    logger.success('IPC: Deleted collection', { id });
                    return {
                        success: true,
                        data: true
                    };
                }
                else {
                    logger.error('IPC: Failed to delete collection', new Error(result.error), { id });
                    return {
                        success: false,
                        error: result.error
                    };
                }
            }
            catch (error) {
                logger.error('IPC: Error in delete-collection handler', error, { id });
                return {
                    success: false,
                    error: 'Failed to delete collection'
                };
            }
        });
        // Document Management
        electron_1.ipcMain.handle('rag:select-documents', async (event) => {
            try {
                logger.debug('IPC: Opening file dialog for document selection');
                const result = await electron_1.dialog.showOpenDialog({
                    title: 'Select Documents',
                    properties: ['openFile', 'multiSelections'],
                    filters: [
                        { name: 'Documents', extensions: ['pdf', 'docx', 'pptx', 'xlsx'] },
                        { name: 'PDF Files', extensions: ['pdf'] },
                        { name: 'Word Documents', extensions: ['docx'] },
                        { name: 'PowerPoint Presentations', extensions: ['pptx'] },
                        { name: 'Excel Spreadsheets', extensions: ['xlsx'] }
                    ]
                });
                if (result.canceled || result.filePaths.length === 0) {
                    logger.debug('IPC: File selection canceled');
                    return {
                        success: true,
                        data: []
                    };
                }
                logger.success('IPC: Files selected', { count: result.filePaths.length });
                return {
                    success: true,
                    data: result.filePaths
                };
            }
            catch (error) {
                logger.error('IPC: Error in select-documents handler', error);
                return {
                    success: false,
                    error: 'Failed to select documents'
                };
            }
        });
        electron_1.ipcMain.handle('rag:upload-document', async (event, collectionId, filePath) => {
            try {
                logger.debug('IPC: Uploading document', { collectionId, filePath });
                if (!fs.existsSync(filePath)) {
                    return {
                        success: false,
                        error: 'File not found'
                    };
                }
                const result = await this.ragService.uploadDocument(collectionId, filePath);
                if (result.success) {
                    logger.success('IPC: Uploaded document', {
                        id: result.data?.id,
                        filename: result.data?.filename,
                        collectionId
                    });
                    return {
                        success: true,
                        data: result.data
                    };
                }
                else {
                    logger.error('IPC: Failed to upload document', new Error(result.error), { collectionId, filePath });
                    return {
                        success: false,
                        error: result.error
                    };
                }
            }
            catch (error) {
                logger.error('IPC: Error in upload-document handler', error, { collectionId, filePath });
                return {
                    success: false,
                    error: 'Failed to upload document'
                };
            }
        });
        electron_1.ipcMain.handle('rag:get-documents', async (event, collectionId) => {
            try {
                logger.debug('IPC: Getting documents for collection', { collectionId });
                const result = await this.ragService.getDocumentsByCollection(collectionId);
                if (result.success) {
                    logger.success('IPC: Retrieved documents', {
                        collectionId,
                        count: result.data?.length || 0
                    });
                    return {
                        success: true,
                        data: result.data
                    };
                }
                else {
                    logger.error('IPC: Failed to get documents', new Error(result.error), { collectionId });
                    return {
                        success: false,
                        error: result.error
                    };
                }
            }
            catch (error) {
                logger.error('IPC: Error in get-documents handler', error, { collectionId });
                return {
                    success: false,
                    error: 'Failed to retrieve documents'
                };
            }
        });
        electron_1.ipcMain.handle('rag:delete-document', async (event, documentId) => {
            try {
                logger.debug('IPC: Deleting document', { documentId });
                const result = await this.ragService.deleteDocument(documentId);
                if (result.success) {
                    logger.success('IPC: Deleted document', { documentId });
                    return {
                        success: true,
                        data: true
                    };
                }
                else {
                    logger.error('IPC: Failed to delete document', new Error(result.error), { documentId });
                    return {
                        success: false,
                        error: result.error
                    };
                }
            }
            catch (error) {
                logger.error('IPC: Error in delete-document handler', error, { documentId });
                return {
                    success: false,
                    error: 'Failed to delete document'
                };
            }
        });
        // Search and Retrieval
        electron_1.ipcMain.handle('rag:search-documents', async (event, query, collectionIds, limit) => {
            try {
                logger.debug('IPC: Searching documents', {
                    query: query.substring(0, 50),
                    collectionIds,
                    limit
                });
                const result = await this.ragService.searchSimilarChunks(query, collectionIds, limit);
                if (result.success) {
                    logger.success('IPC: Search completed', {
                        query: query.substring(0, 50),
                        resultCount: result.data?.length || 0
                    });
                    return {
                        success: true,
                        data: result.data
                    };
                }
                else {
                    logger.error('IPC: Search failed', new Error(result.error), { query, collectionIds });
                    return {
                        success: false,
                        error: result.error
                    };
                }
            }
            catch (error) {
                logger.error('IPC: Error in search-documents handler', error, { query, collectionIds });
                return {
                    success: false,
                    error: 'Failed to search documents'
                };
            }
        });
        // Embedding Models
        electron_1.ipcMain.handle('rag:get-embedding-models', async (event) => {
            try {
                logger.debug('IPC: Getting available embedding models');
                const result = await this.embeddingService.getAvailableEmbeddingModels();
                if (result.success) {
                    logger.success('IPC: Retrieved embedding models', {
                        localCount: result.data?.local.length || 0,
                        apiCount: result.data?.api.length || 0
                    });
                    return {
                        success: true,
                        data: result.data
                    };
                }
                else {
                    logger.error('IPC: Failed to get embedding models', new Error(result.error));
                    return {
                        success: false,
                        error: result.error
                    };
                }
            }
            catch (error) {
                logger.error('IPC: Error in get-embedding-models handler', error);
                return {
                    success: false,
                    error: 'Failed to retrieve embedding models'
                };
            }
        });
        // Test embedding generation
        electron_1.ipcMain.handle('rag:test-embedding', async (event, text, model, provider) => {
            try {
                logger.debug('IPC: Testing embedding generation', { model, provider });
                const result = await this.embeddingService.generateEmbedding(text, model, provider);
                if (result.success) {
                    logger.success('IPC: Embedding test successful', {
                        model,
                        provider,
                        dimensions: result.data?.length || 0
                    });
                    return {
                        success: true,
                        data: {
                            dimensions: result.data?.length || 0,
                            sample: result.data?.slice(0, 5) || [] // Return first 5 dimensions as sample
                        }
                    };
                }
                else {
                    logger.error('IPC: Embedding test failed', new Error(result.error), { model, provider });
                    return {
                        success: false,
                        error: result.error
                    };
                }
            }
            catch (error) {
                logger.error('IPC: Error in test-embedding handler', error, { model, provider });
                return {
                    success: false,
                    error: 'Failed to test embedding'
                };
            }
        });
    }
    // Method to unregister handlers (useful for cleanup)
    unregisterHandlers() {
        const handlers = [
            'rag:create-collection',
            'rag:get-collections',
            'rag:get-collection',
            'rag:update-collection',
            'rag:delete-collection',
            'rag:select-documents',
            'rag:upload-document',
            'rag:get-documents',
            'rag:delete-document',
            'rag:search-documents',
            'rag:get-embedding-models',
            'rag:test-embedding'
        ];
        handlers.forEach(handler => {
            electron_1.ipcMain.removeAllListeners(handler);
        });
        logger.info('RAG IPC handlers unregistered');
    }
}
exports.RAGHandler = RAGHandler;
