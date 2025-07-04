# RAG (Retrieval-Augmented Generation) Implementation Plan

## Overview

This document outlines the implementation plan for a RAG system in Xavi9 that allows users to upload documents, create collections, and chat with AI models using document knowledge.

## Architecture

The RAG system follows the existing Xavi9 architecture pattern:
```
Frontend (React/Zustand) → IPC (Preload) → Handlers → Services → Database (Prisma)
```

## Features

### 1. Collection Management
- Create collections with configurable parameters
- List, edit, and delete collections
- View collection statistics and metadata

### 2. Document Upload & Processing
- Support for PDF, DOCX, PPTX, and XLSX files
- Document chunking with configurable size and overlap
- Embedding generation using local or API models
- Metadata extraction and storage

### 3. Chat Integration
- Collection selector in chat input
- Context-aware responses using document knowledge
- Conversation history with RAG context

## Database Schema Extensions

Using existing Prisma models with enhancements:

```prisma
model Collection {
  id          String   @id @default(cuid())
  name        String   @unique
  description String?
  chunkSize   Int      @default(1024)
  overlap     Int      @default(256)
  embeddingModel String
  modelProvider  String // 'ollama' | 'openai' | 'anthropic' | etc.
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  documents   Document[]
}

model Document {
  id           String   @id @default(cuid())
  filename     String
  filepath     String?
  fileType     String   // 'pdf' | 'docx' | 'pptx' | 'xlsx'
  fileSize     Int
  content      String?  // Full text content
  metadata     Json?    // File-specific metadata
  collectionId String
  collection   Collection @relation(fields: [collectionId], references: [id], onDelete: Cascade)
  chunks       DocumentChunk[]
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

model DocumentChunk {
  id         String   @id @default(cuid())
  content    String
  embedding  String?  // JSON array of floats
  metadata   Json?    // Chunk-specific metadata (page, section, etc.)
  startPos   Int?
  endPos     Int?
  documentId String
  document   Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  createdAt  DateTime @default(now())
}

// Extend existing Conversation model
model Conversation {
  // ... existing fields
  selectedCollectionIds String? // JSON array of collection IDs for RAG context
}
```

## Implementation Components

### 1. Backend Services

#### RAG Service (`electron/services/rag.service.ts`)
```typescript
class RAGService {
  // Collection management
  createCollection(params: CreateCollectionParams): Promise<ServiceResponse<Collection>>
  getCollections(): Promise<ServiceResponse<Collection[]>>
  updateCollection(id: string, params: UpdateCollectionParams): Promise<ServiceResponse<Collection>>
  deleteCollection(id: string): Promise<ServiceResponse<void>>

  // Document management
  uploadDocument(collectionId: string, filePath: string): Promise<ServiceResponse<Document>>
  deleteDocument(documentId: string): Promise<ServiceResponse<void>>
  getDocumentsByCollection(collectionId: string): Promise<ServiceResponse<Document[]>>

  // Processing
  processDocument(document: Document): Promise<ServiceResponse<void>>
  generateEmbeddings(content: string, model: string, provider: string): Promise<ServiceResponse<number[]>>
  
  // Search and retrieval
  searchSimilarChunks(query: string, collectionIds: string[], limit?: number): Promise<ServiceResponse<DocumentChunk[]>>
}
```

#### Document Parser Service (`electron/services/document-parser.service.ts`)
```typescript
class DocumentParserService {
  parsePDF(filePath: string): Promise<{ content: string; metadata: any }>
  parseDOCX(filePath: string): Promise<{ content: string; metadata: any }>
  parsePPTX(filePath: string): Promise<{ content: string; metadata: any }>
  parseXLSX(filePath: string): Promise<{ content: string; metadata: any }>
  
  chunkContent(content: string, chunkSize: number, overlap: number): string[]
}
```

#### Embedding Service (`electron/services/embedding.service.ts`)
```typescript
class EmbeddingService {
  generateEmbedding(text: string, model: string, provider: string): Promise<number[]>
  calculateSimilarity(embedding1: number[], embedding2: number[]): number
  getAvailableEmbeddingModels(): Promise<{ local: string[], api: string[] }>
}
```

### 2. IPC Handlers

#### RAG Handler (`electron/handlers/rag.handler.ts`)
```typescript
class RAGHandler {
  // Collection endpoints
  'rag:create-collection'
  'rag:get-collections'
  'rag:update-collection'
  'rag:delete-collection'
  
  // Document endpoints
  'rag:upload-document'
  'rag:delete-document'
  'rag:get-documents'
  'rag:process-document'
  
  // Search endpoints
  'rag:search-documents'
  'rag:get-embedding-models'
}
```

### 3. Frontend Components

#### RAG Store (`src/stores/ragStore.ts`)
```typescript
interface RAGStore {
  // State
  collections: Collection[]
  selectedCollectionIds: string[]
  documents: Document[]
  loading: {
    collections: boolean
    documents: boolean
    uploading: boolean
    processing: boolean
  }
  
  // Actions
  createCollection: (params: CreateCollectionParams) => Promise<void>
  getCollections: () => Promise<void>
  uploadDocument: (collectionId: string, file: File) => Promise<void>
  deleteDocument: (documentId: string) => Promise<void>
  searchDocuments: (query: string) => Promise<DocumentChunk[]>
  setSelectedCollections: (collectionIds: string[]) => void
}
```

#### Collection Management (`src/components/rag/`)
```
CollectionList.tsx          - List all collections
CollectionCard.tsx          - Individual collection display
CreateCollectionModal.tsx   - Collection creation form
DocumentUpload.tsx          - File upload component
DocumentList.tsx           - Documents in collection
CollectionSelector.tsx     - Collection picker for chat
```

#### Chat Integration
- Enhance `MessageInput.tsx` with collection selector
- Modify chat handler to include RAG context
- Update message display to show when RAG was used

### 4. File Processing Pipeline

#### Supported File Types:
1. **PDF**: Extract text using `pdf-parse` or similar
2. **DOCX**: Extract text using `mammoth` or `docx` library
3. **PPTX**: Extract text and slide content using `officegen` or similar
4. **XLSX**: Process row-by-row, each row as a chunk regardless of chunk size

#### Processing Flow:
```
File Upload → Type Detection → Content Extraction → Chunking → Embedding Generation → Storage
```

#### Chunking Strategy:
- **Text files (PDF, DOCX, PPTX)**: Standard chunking with overlap
- **XLSX**: One row per chunk, preserve row structure in metadata

## User Interface Flow

### 1. Collection Management
1. Navigate to RAG section in sidebar or settings
2. View existing collections in a grid/list layout
3. Create new collection with configuration modal
4. Edit collection settings
5. Delete collections with confirmation

### 2. Document Upload
1. Select collection
2. Click upload button or drag-and-drop files
3. Show upload progress and processing status
4. Display document list with metadata
5. Preview document content and chunks

### 3. Chat with RAG
1. In chat interface, click collection selector button
2. Choose one or more collections from dropdown/modal
3. Selected collections show as badges near input
4. AI responses include context from selected documents
5. Option to see which documents influenced the response

## Configuration Options

### Collection Settings:
- **Name**: Unique identifier for the collection
- **Description**: Optional description
- **Chunk Size**: Token/character limit per chunk (default: 1024)
- **Overlap**: Character overlap between chunks (default: 256)
- **Embedding Model**: Local (Ollama) or API-based embedding model
- **Model Provider**: ollama, openai, anthropic, etc.

### Chat Integration:
- Multiple collection selection
- Context window management
- Relevance scoring for retrieved chunks
- Source attribution in responses

## Dependencies

### New Dependencies:
```json
{
  "pdf-parse": "^1.1.1",
  "mammoth": "^1.6.0",
  "xlsx": "^0.18.5",
  "pptx2json": "^2.0.0",
  "cosine-similarity": "^1.0.1",
  "file-type": "^18.7.0"
}
```

### AI/ML Dependencies:
- Utilize existing AI provider integrations
- Extend for embedding-specific models
- Consider local embedding models (sentence-transformers via Python bridge)

## Security Considerations

1. **File Validation**: Verify file types and sizes
2. **Path Sanitization**: Prevent directory traversal
3. **Content Filtering**: Basic content validation
4. **Access Control**: User-specific collections (future enhancement)
5. **API Key Security**: Reuse existing encrypted storage

## Performance Optimizations

1. **Async Processing**: Background document processing
2. **Batch Operations**: Bulk embedding generation
3. **Caching**: Cache embeddings and search results
4. **Indexing**: Database indices for similarity search
5. **Streaming**: Stream large file processing updates

## Testing Strategy

1. **Unit Tests**: Service layer functions
2. **Integration Tests**: End-to-end document processing
3. **Performance Tests**: Large document handling
4. **UI Tests**: Component interaction testing

## Migration Plan

1. **Phase 1**: Backend services and database setup
2. **Phase 2**: Document upload and processing
3. **Phase 3**: Basic RAG functionality in chat
4. **Phase 4**: Advanced features and optimizations

## Future Enhancements

1. **Advanced Search**: Semantic search with filters
2. **Document Versioning**: Track document updates
3. **Collaborative Collections**: Multi-user access
4. **Advanced Chunking**: Smart chunking based on document structure
5. **Vector Database**: Dedicated vector storage (Chroma, Pinecone)
6. **Real-time Processing**: Live document updates
7. **Export/Import**: Collection backup and sharing

---

This implementation plan provides a comprehensive roadmap for integrating RAG functionality into Xavi9 while maintaining the existing architectural patterns and ensuring a smooth user experience.