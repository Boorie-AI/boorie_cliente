import { ipcMain, dialog } from 'electron'
import * as fs from 'fs/promises'
import * as path from 'path'
import pdf from 'pdf-parse'
import mammoth from 'mammoth'
import { HydraulicRAGService } from '../../backend/services/hydraulic/ragService'
import { PrismaClient } from '@prisma/client'

import { EmbeddingService } from '../../backend/services/embedding.service'

export function registerWisdomHandlers(prisma?: PrismaClient) {
  const prismaClient = prisma || new PrismaClient()
  const embeddingService = new EmbeddingService(prismaClient)
  const ragService = new HydraulicRAGService(prismaClient, embeddingService)

  // Upload document for RAG processing
  ipcMain.handle('wisdom:upload', async (event, options: {
    category: 'hydraulics' | 'regulations' | 'best-practices'
    subcategory?: string
    region?: string[]
    secondaryCategories?: string[]
    language?: string
  }) => {
    try {
      // Open file dialog
      const result = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: 'Documents', extensions: ['pdf', 'txt', 'md', 'docx', 'doc'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      })

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, message: 'No files selected' }
      }

      const uploadedDocs = []

      for (const filePath of result.filePaths) {
        const fileName = path.basename(filePath)
        const fileExtension = path.extname(fileName).toLowerCase()

        let fileContent: string

        // Handle different file types
        if (fileExtension === '.pdf') {
          // For PDF files, we need special processing
          try {
            const pdfBuffer = await fs.readFile(filePath)
            const pdfData = await pdf(pdfBuffer)
            fileContent = pdfData.text

            // Clean up content (remove excessive newlines, etc.)
            fileContent = fileContent.replace(/\n\s*\n/g, '\n\n').trim()

            console.log(`[Document Handler] Successfully extracted text from PDF: ${fileName} (${fileContent.length} chars)`)
          } catch (error) {
            console.warn(`Could not process PDF ${fileName}:`, error)
            fileContent = `PDF Document: ${fileName}\nUnable to extract text content. Error: ${error}`
          }
        } else if (fileExtension === '.docx') {
          // For DOCX files
          try {
            const buffer = await fs.readFile(filePath)
            const result = await mammoth.extractRawText({ buffer })
            fileContent = result.value
            console.log(`[Document Handler] Successfully extracted text from DOCX: ${fileName} (${fileContent.length} chars)`)
            if (result.messages && result.messages.length > 0) {
              console.log('[Document Handler] Mammoth messages:', result.messages)
            }
          } catch (error) {
            console.warn(`Could not process DOCX ${fileName}:`, error)
            fileContent = `DOCX Document: ${fileName}\nUnable to extract text content. Error: ${error}`
          }
        } else if (fileExtension === '.doc') {
          fileContent = `DOC Document: ${fileName}\nLegacy binary Word formats are not supported. Please convert to DOCX or PDF.`
        } else {
          // For text-based files
          fileContent = await fs.readFile(filePath, 'utf-8')
        }

        // Validate content extraction
        if (!fileContent || fileContent.trim().length < 50) {
          console.warn(`[Document Handler] Document ${fileName} has very little content (< 50 chars). It might be an image-only PDF or empty file.`)
          // We can optionally reject it or just append a warning
          // For now, let's append a warning to the content itself so it's indexed (maybe metadata is there) but also visible
          fileContent += "\n\n[SYSTEM WARNING: This document appears to have little to no text content. If this is a scanned PDF, please perform OCR before uploading.]"
        }

        // Extract metadata from filename or content
        const metadata = {
          fileName,
          uploadDate: new Date().toISOString(),
          fileType: fileExtension.substring(1),
          formulas: [],
          tables: [],
          figures: [],
          examples: [],
          references: [],
          keywords: extractKeywords(fileContent),
          language: options.language || 'es'
        }

        // Add to RAG system
        const docId = await ragService.addDocument({
          category: options.category,
          subcategory: options.subcategory || 'general',
          region: options.region || [],
          secondaryCategories: options.secondaryCategories || [],
          title: fileName.replace(/\.[^/.]+$/, ''), // Remove extension
          content: fileContent,
          metadata,
          version: '1.0'
        }, (progress) => {
          // Send progress to renderer
          if (event.sender) {
            event.sender.send('wisdom:upload-progress', {
              current: progress.current,
              total: progress.total,
              message: progress.message,
              filename: fileName
            })
          }
        })

        uploadedDocs.push({
          id: docId,
          fileName,
          title: fileName.replace(/\.[^/.]+$/, '')
        })
      }

      return {
        success: true,
        documents: uploadedDocs,
        message: `Successfully uploaded ${uploadedDocs.length} document(s)`
      }

    } catch (error: any) {
      console.error('Document upload error:', error)
      console.error('Document upload error:', error)
      return {
        success: false,
        message: `Failed to add document to knowledge base: ${error.message || 'Unknown error'}. Check the developer console for more details.`
      }
    }
  })

  // Search documents
  ipcMain.handle('wisdom:search', async (event, query: string, options?: any) => {
    try {
      const results = await ragService.search(query, options)
      return {
        success: true,
        results
      }
    } catch (error: any) {
      console.error('Document search error:', error)
      return {
        success: false,
        message: error.message || 'Failed to search documents'
      }
    }
  })

  // Get all documents
  ipcMain.handle('wisdom:list', async (event, filters?: {
    category?: string
    region?: string
    language?: string
  }) => {
    try {
      const where: any = { status: 'active' }

      if (filters?.category) {
        where.category = filters.category
      }
      if (filters?.region) {
        where.region = { contains: filters.region }
      }
      if (filters?.language) {
        where.language = filters.language
      }

      const documents = await prismaClient.hydraulicKnowledge.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        include: {
          chunks: {
            select: {
              id: true,
              embedding: true
            }
          }
        }
      })

      return {
        success: true,
        documents: documents.map((doc: any) => {
          const totalChunks = doc.chunks.length
          const chunksWithEmbeddings = doc.chunks.filter((chunk: any) => chunk.embedding !== null).length
          const isIndexed = totalChunks > 0
          const hasEmbeddings = chunksWithEmbeddings > 0
          const indexingComplete = totalChunks > 0 && chunksWithEmbeddings === totalChunks

          return {
            id: doc.id,
            title: doc.title,
            category: doc.category,
            subcategory: doc.subcategory,
            region: JSON.parse(doc.region),
            language: doc.language,
            updatedAt: doc.updatedAt,
            version: doc.version,
            // Indexing status information
            indexing: {
              isIndexed,
              hasEmbeddings,
              indexingComplete,
              totalChunks,
              chunksWithEmbeddings,
              status: indexingComplete ? 'completed' : (isIndexed ? 'partial' : 'not_indexed')
            }
          }
        })
      }
    } catch (error: any) {
      console.error('Document list error:', error)
      return {
        success: false,
        message: error.message || 'Failed to list documents'
      }
    }
  })

  // Delete document
  ipcMain.handle('wisdom:delete', async (event, documentId: string) => {
    try {
      // Delete from Milvus first
      try {
        const milvusService = (await import('../../backend/services/milvus.service')).MilvusService.getInstance()
        // We need to find chunks to get their IDs or delete by expression if supported
        // For now, simpler approach: get chunks, then delete from Milvus by ID
        const chunks = await prismaClient.knowledgeChunk.findMany({
          where: { knowledgeId: documentId },
          select: { id: true }
        })

        if (chunks.length > 0) {
          const chunkIds = chunks.map(c => c.id)
          await milvusService.delete(
            'hydraulic_knowledge', // Use constant in real code
            chunkIds
          )
          console.log(`[Document Handler] Deleted ${chunkIds.length} chunks from Milvus`)
        }
      } catch (milvusError) {
        console.error('[Document Handler] Failed to delete from Milvus (continuing with DB delete):', milvusError)
      }

      // Delete chunks from DB
      await prismaClient.knowledgeChunk.deleteMany({
        where: { knowledgeId: documentId }
      })

      // Delete document from DB
      await prismaClient.hydraulicKnowledge.delete({
        where: { id: documentId }
      })

      return {
        success: true,
        message: 'Document deleted successfully from Database and Vector Store'
      }
    } catch (error: any) {
      console.error('Document delete error:', error)
      return {
        success: false,
        message: error.message || 'Failed to delete document'
      }
    }
  })

  // Update document
  ipcMain.handle('wisdom:update', async (event, documentId: string, updates: any) => {
    try {
      await ragService.updateDocument(documentId, updates)

      return {
        success: true,
        message: 'Document updated successfully'
      }
    } catch (error: any) {
      console.error('Document update error:', error)
      return {
        success: false,
        message: error.message || 'Failed to update document'
      }
    }
  })

  // Force reindex document
  ipcMain.handle('wisdom:reindex', async (event, documentId: string) => {
    try {
      console.log(`[Document Handler] Force reindexing document: ${documentId}`)

      // Get the document first
      const document = await prismaClient.hydraulicKnowledge.findUnique({
        where: { id: documentId }
      })

      if (!document) {
        throw new Error('Document not found')
      }

      console.log(`[Document Handler] Reindexing document: "${document.title}"`)

      // Delete existing chunks first
      const deletedChunks = await prismaClient.knowledgeChunk.deleteMany({
        where: { knowledgeId: documentId }
      })

      console.log(`[Document Handler] Deleted ${deletedChunks.count} existing chunks`)

      // Update the document's updatedAt to trigger reprocessing
      // The chunks were already deleted, so the system should recreate them
      await prismaClient.hydraulicKnowledge.update({
        where: { id: documentId },
        data: {
          updatedAt: new Date(),
          // Optionally trigger reprocessing by changing a field slightly
          version: document.version + '.reindexed'
        }
      })

      console.log(`[Document Handler] Document reindexed successfully`)

      return {
        success: true,
        message: 'Document reindexed successfully'
      }
    } catch (error: any) {
      console.error('Document reindex error:', error)
      return {
        success: false,
        message: error.message || 'Failed to reindex document'
      }
    }
  })

  // Validate indexing status across all documents
  ipcMain.handle('wisdom:validateIndexing', async () => {
    try {
      console.log('[Document Handler] Starting indexing validation...')

      // Get all documents with their chunks
      const documents = await prismaClient.hydraulicKnowledge.findMany({
        include: {
          chunks: true
        }
      })

      const validationReport = {
        totalDocuments: documents.length,
        fullyIndexed: 0,
        partiallyIndexed: 0,
        notIndexed: 0,
        corruptedEmbeddings: 0,
        documents: [] as any[]
      }

      for (const doc of documents) {
        const totalChunks = doc.chunks.length
        const chunksWithEmbeddings = doc.chunks.filter(chunk => {
          try {
            // Validate embedding format
            if (!chunk.embedding) return false
            const embedding = JSON.parse(chunk.embedding)
            return Array.isArray(embedding) && embedding.length > 0
          } catch {
            return false
          }
        }).length

        let status: 'fully_indexed' | 'partially_indexed' | 'not_indexed' | 'corrupted'

        if (totalChunks === 0) {
          status = 'not_indexed'
          validationReport.notIndexed++
        } else if (chunksWithEmbeddings === 0) {
          status = 'not_indexed'
          validationReport.notIndexed++
        } else if (chunksWithEmbeddings === totalChunks) {
          status = 'fully_indexed'
          validationReport.fullyIndexed++
        } else {
          status = 'partially_indexed'
          validationReport.partiallyIndexed++
        }

        // Check for corrupted embeddings
        const corruptedChunks = doc.chunks.filter(chunk => {
          if (!chunk.embedding) return false
          try {
            const embedding = JSON.parse(chunk.embedding)
            // Check if embedding has valid dimensions (should be consistent)
            return !Array.isArray(embedding) || embedding.length === 0 ||
              embedding.some(val => typeof val !== 'number' || isNaN(val))
          } catch {
            return true
          }
        }).length

        if (corruptedChunks > 0) {
          validationReport.corruptedEmbeddings++
        }

        validationReport.documents.push({
          id: doc.id,
          title: doc.title,
          category: doc.category,
          status,
          totalChunks,
          chunksWithEmbeddings,
          corruptedChunks,
          indexingPercentage: totalChunks > 0 ? Math.round((chunksWithEmbeddings / totalChunks) * 100) : 0
        })
      }

      console.log(`[Document Handler] Validation complete: ${validationReport.fullyIndexed}/${validationReport.totalDocuments} fully indexed`)

      return {
        success: true,
        report: validationReport
      }

    } catch (error: any) {
      console.error('Indexing validation error:', error)
      return {
        success: false,
        message: error.message || 'Failed to validate indexing'
      }
    }
  })

  // Massive reindexing with options
  ipcMain.handle('wisdom:massiveReindex', async (event, options: {
    clearAllEmbeddings?: boolean
    reindexAll?: boolean
    onlyCorrupted?: boolean
    onlyPartial?: boolean
    embeddingModel?: string
    categories?: string[]
  }) => {
    try {
      console.log('[Document Handler] Starting massive reindexing with options:', options)

      let documentsToReindex: any[] = []

      if (options.reindexAll) {
        // Get all documents
        documentsToReindex = await prismaClient.hydraulicKnowledge.findMany({
          include: { chunks: true },
          where: options.categories ? {
            category: { in: options.categories }
          } : undefined
        })
      } else {
        // Get documents based on criteria
        const documents = await prismaClient.hydraulicKnowledge.findMany({
          include: { chunks: true },
          where: options.categories ? {
            category: { in: options.categories }
          } : undefined
        })

        documentsToReindex = documents.filter(doc => {
          const totalChunks = doc.chunks.length
          const chunksWithEmbeddings = doc.chunks.filter(chunk => {
            try {
              if (!chunk.embedding) return false
              const embedding = JSON.parse(chunk.embedding)
              return Array.isArray(embedding) && embedding.length > 0 &&
                !embedding.some(val => typeof val !== 'number' || isNaN(val))
            } catch {
              return false
            }
          }).length

          if (options.onlyCorrupted) {
            // Include documents with corrupted embeddings
            return doc.chunks.some(chunk => {
              if (!chunk.embedding) return true
              try {
                const embedding = JSON.parse(chunk.embedding)
                return !Array.isArray(embedding) || embedding.length === 0 ||
                  embedding.some(val => typeof val !== 'number' || isNaN(val))
              } catch {
                return true
              }
            })
          }

          if (options.onlyPartial) {
            // Include partially indexed documents
            return totalChunks > 0 && chunksWithEmbeddings < totalChunks && chunksWithEmbeddings > 0
          }

          // Default: include not indexed or corrupted
          return totalChunks === 0 || chunksWithEmbeddings === 0
        })
      }

      console.log(`[Document Handler] Found ${documentsToReindex.length} documents to reindex`)

      if (options.clearAllEmbeddings) {
        console.log('[Document Handler] Clearing all existing embeddings...')
        await prismaClient.knowledgeChunk.updateMany({
          data: { embedding: '' }
        })
      }

      const results = {
        totalProcessed: 0,
        successful: 0,
        failed: 0,
        errors: [] as string[]
      }

      for (const doc of documentsToReindex) {
        try {
          console.log(`[Document Handler] Reindexing: "${doc.title}"`)

          if (!options.clearAllEmbeddings) {
            // Delete existing chunks for this document
            await prismaClient.knowledgeChunk.deleteMany({
              where: { knowledgeId: doc.id }
            })
          }

          // Update document to trigger reprocessing
          await prismaClient.hydraulicKnowledge.update({
            where: { id: doc.id },
            data: {
              updatedAt: new Date(),
              version: doc.version + '.reindexed-' + Date.now()
            }
          })

          results.successful++
        } catch (error: any) {
          console.error(`Failed to reindex document ${doc.id}:`, error)
          results.failed++
          results.errors.push(`${doc.title}: ${error.message}`)
        }

        results.totalProcessed++
      }

      console.log(`[Document Handler] Massive reindexing complete: ${results.successful}/${results.totalProcessed} successful`)

      return {
        success: true,
        results
      }

    } catch (error: any) {
      console.error('Massive reindexing error:', error)
      return {
        success: false,
        message: error.message || 'Failed to perform massive reindexing'
      }
    }
  })

  // Clean orphaned embeddings and chunks
  ipcMain.handle('wisdom:cleanDatabase', async () => {
    try {
      console.log('[Document Handler] Starting database cleanup...')

      const cleanupResults = {
        orphanedChunks: 0,
        emptyEmbeddings: 0,
        corruptedEmbeddings: 0,
        duplicateChunks: 0
      }

      // Remove chunks with corrupted or empty embeddings
      const corruptedChunks = await prismaClient.knowledgeChunk.findMany({
        where: {
          OR: [
            { embedding: { equals: '' } },
            { embedding: { equals: '[]' } },
            { embedding: { equals: 'null' } }
          ]
        }
      })

      for (const chunk of corruptedChunks) {
        try {
          if (chunk.embedding && chunk.embedding !== '' && chunk.embedding !== 'null') {
            const embedding = JSON.parse(chunk.embedding)
            if (!Array.isArray(embedding) || embedding.length === 0 ||
              embedding.some(val => typeof val !== 'number' || isNaN(val))) {
              await prismaClient.knowledgeChunk.delete({ where: { id: chunk.id } })
              cleanupResults.corruptedEmbeddings++
            }
          } else {
            await prismaClient.knowledgeChunk.delete({ where: { id: chunk.id } })
            cleanupResults.emptyEmbeddings++
          }
        } catch (error) {
          await prismaClient.knowledgeChunk.delete({ where: { id: chunk.id } })
          cleanupResults.corruptedEmbeddings++
        }
      }

      // Check for orphaned chunks using a more complex query
      const orphanedChunks = await prismaClient.$queryRaw<{ id: string }[]>`
        SELECT kc.id FROM "knowledge_chunks" kc 
        LEFT JOIN "hydraulic_knowledge" hk ON kc."knowledgeId" = hk.id 
        WHERE hk.id IS NULL
      `

      if (orphanedChunks.length > 0) {
        await prismaClient.knowledgeChunk.deleteMany({
          where: {
            id: { in: orphanedChunks.map(c => c.id) }
          }
        })
      }

      cleanupResults.orphanedChunks = orphanedChunks.length

      // Find and remove potential duplicate chunks
      // Fix: Use correct table name 'knowledge_chunks' instead of Model name 'KnowledgeChunk'
      const duplicates = await prismaClient.$queryRaw`
        SELECT "knowledgeId", content, COUNT(*) as count 
        FROM "knowledge_chunks" 
        GROUP BY "knowledgeId", content 
        HAVING COUNT(*) > 1
      ` as any[]

      for (const duplicate of duplicates) {
        const chunks = await prismaClient.knowledgeChunk.findMany({
          where: {
            knowledgeId: duplicate.knowledgeId,
            content: duplicate.content
          },
          orderBy: { createdAt: 'desc' }
        })

        // Keep the most recent chunk, delete the rest
        for (let i = 1; i < chunks.length; i++) {
          await prismaClient.knowledgeChunk.delete({
            where: { id: chunks[i].id }
          })
          cleanupResults.duplicateChunks++
        }
      }

      console.log('[Document Handler] Database cleanup complete:', cleanupResults)

      return {
        success: true,
        results: cleanupResults
      }

    } catch (error: any) {
      console.error('Database cleanup error:', error)
      return {
        success: false,
        message: error.message || 'Failed to clean database'
      }
    }
  })

  // Get available embedding providers (static + dynamic Ollama)
  ipcMain.handle('wisdom:getEmbeddingProviders', async () => {
    try {
      console.log('[Document Handler] Getting embedding providers...')

      // Get static providers from service
      const staticProviders = embeddingService.getProviders()
      console.log(`[Document Handler] Static providers: ${staticProviders.length}`)

      // Get dynamic Ollama providers
      const ollamaResult = await ipcMain.emit('wisdom:checkOllamaConnection')
      let dynamicProviders = []

      // Try to get Ollama models directly since emit doesn't return values
      try {
        const axios = require('axios')
        const response = await axios.get('http://localhost:11434/api/tags', {
          timeout: 3000,
          headers: { 'Content-Type': 'application/json' }
        })

        if (response.status === 200 && response.data) {
          const models = response.data.models || []
          console.log(`[Document Handler] Found ${models.length} Ollama models`)

          // Filter for embedding models
          const embeddingModels = models.filter((model: any) => {
            const name = model.name.toLowerCase()
            return (
              name.includes('embed') ||
              name.includes('nomic') ||
              name.includes('mxbai') ||
              name.includes('minilm') ||
              name.includes('bge') ||
              name.includes('e5') ||
              name.includes('gemma') ||
              name.includes('llama') ||
              name.includes('mistral')
            )
          })

          console.log(`[Document Handler] Found ${embeddingModels.length} embedding models`)

          // Create provider objects
          dynamicProviders = embeddingModels.map((model: any) => {
            const name = model.name.toLowerCase()
            let dimension = 768 // default

            if (name.includes('mxbai')) dimension = 1024
            if (name.includes('nomic')) dimension = 768
            if (name.includes('minilm')) dimension = 384
            if (name.includes('bge-large')) dimension = 1024
            if (name.includes('bge-base')) dimension = 768
            if (name.includes('e5-large')) dimension = 1024
            if (name.includes('e5-base')) dimension = 768
            if (name.includes('gemma')) dimension = 3072
            if (name.includes('llama')) dimension = 4096
            if (name.includes('mistral')) dimension = 4096

            return {
              id: `ollama-${model.name}`,
              name: `Ollama: ${model.name}`,
              model: model.name,
              dimension
            }
          })

          console.log(`[Document Handler] Created ${dynamicProviders.length} dynamic providers`)
        }
      } catch (ollamaError: any) {
        console.log('[Document Handler] Ollama not available for dynamic providers:', ollamaError.message)
      }

      // Combine providers
      const allProviders = [...staticProviders, ...dynamicProviders]
      console.log(`[Document Handler] Total providers: ${allProviders.length}`)

      const currentProvider = embeddingService.activeProvider

      return {
        success: true,
        providers: allProviders,
        currentProviderId: currentProvider?.id || (allProviders.length > 0 ? allProviders[0].id : ''),
        dynamicCount: dynamicProviders.length,
        staticCount: staticProviders.length
      }
    } catch (error: any) {
      console.error('Get embedding providers error:', error)
      return {
        success: false,
        message: error.message || 'Failed to get embedding providers'
      }
    }
  })

  // Set embedding provider (handles both static and dynamic providers)
  ipcMain.handle('wisdom:setEmbeddingProvider', async (event, providerId: string) => {
    try {
      console.log(`[Document Handler] Setting embedding provider: ${providerId}`)

      // Get all available providers (static + dynamic)
      const staticProviders = embeddingService.getProviders()
      let dynamicProviders = []

      // Get dynamic Ollama providers if available
      try {
        const axios = require('axios')
        const response = await axios.get('http://localhost:11434/api/tags', {
          timeout: 3000,
          headers: { 'Content-Type': 'application/json' }
        })

        if (response.status === 200 && response.data) {
          const models = response.data.models || []
          const embeddingModels = models.filter((model: any) => {
            const name = model.name.toLowerCase()
            return (
              name.includes('embed') ||
              name.includes('nomic') ||
              name.includes('mxbai') ||
              name.includes('minilm') ||
              name.includes('bge') ||
              name.includes('e5') ||
              name.includes('gemma') ||
              name.includes('llama') ||
              name.includes('mistral')
            )
          })

          dynamicProviders = embeddingModels.map((model: any) => {
            const name = model.name.toLowerCase()
            let dimension = 768 // default

            if (name.includes('mxbai')) dimension = 1024
            if (name.includes('nomic')) dimension = 768
            if (name.includes('minilm')) dimension = 384
            if (name.includes('bge-large')) dimension = 1024
            if (name.includes('bge-base')) dimension = 768
            if (name.includes('e5-large')) dimension = 1024
            if (name.includes('e5-base')) dimension = 768
            if (name.includes('gemma')) dimension = 3072
            if (name.includes('llama')) dimension = 4096
            if (name.includes('mistral')) dimension = 4096

            return {
              id: `ollama-${model.name}`,
              name: `Ollama: ${model.name}`,
              model: model.name,
              dimension
            }
          })
        }
      } catch (ollamaError: any) {
        console.log('[Document Handler] Could not get dynamic providers:', ollamaError.message)
      }

      // Combine all providers
      const allProviders = [...staticProviders, ...dynamicProviders]
      const selectedProvider = allProviders.find(p => p.id === providerId)

      if (!selectedProvider) {
        throw new Error(`Provider ${providerId} not found. Available providers: ${allProviders.map(p => p.id).join(', ')}`)
      }

      // For static providers, use the existing service
      if (staticProviders.find((p: any) => p.id === providerId)) {
        embeddingService.setProvider(providerId)
        return {
          success: true,
          message: `Switched to ${embeddingService.activeProvider.name}`
        }
      } else {
        // For dynamic providers, set manually
        embeddingService.activeProvider = selectedProvider
        console.log(`[Document Handler] Set dynamic provider: ${selectedProvider.name}`)
        return {
          success: true,
          message: `Switched to ${selectedProvider.name}`
        }
      }

    } catch (error: any) {
      console.error('Set embedding provider error:', error)
      return {
        success: false,
        message: error.message || 'Failed to set embedding provider'
      }
    }
  })

  // Additional handlers for bulk upload and folder operations
  ipcMain.handle('wisdom:selectFolder', async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory']
      })

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, message: 'No folder selected' }
      }

      return {
        success: true,
        folderPath: result.filePaths[0]
      }
    } catch (error: any) {
      console.error('Select folder error:', error)
      return {
        success: false,
        message: error.message || 'Failed to select folder'
      }
    }
  })

  ipcMain.handle('wisdom:getFolderStructure', async (event, folderPath: string) => {
    try {
      console.log('[Folder Structure] Reading folder:', folderPath)

      // Recursive function to build folder tree structure
      const buildFolderTree = async (currentPath: string, relativePath: string = ''): Promise<any> => {
        const stats = await fs.stat(currentPath)
        const name = path.basename(currentPath)

        const node = {
          path: currentPath,
          name: name,
          children: [] as any[],
          files: [] as string[],
          selected: false,
          expanded: false
        }

        if (stats.isDirectory()) {
          try {
            const items = await fs.readdir(currentPath, { withFileTypes: true })

            for (const item of items) {
              const itemPath = path.join(currentPath, item.name)
              const itemRelativePath = path.join(relativePath, item.name)

              if (item.isDirectory()) {
                // Recursively process subdirectories
                const childNode = await buildFolderTree(itemPath, itemRelativePath)
                if (childNode.children.length > 0 || childNode.files.length > 0) {
                  node.children.push(childNode)
                }
              } else if (item.isFile()) {
                const ext = path.extname(item.name).toLowerCase()
                if (['.pdf', '.txt', '.md', '.docx', '.doc'].includes(ext)) {
                  node.files.push(itemPath)
                }
              }
            }
          } catch (dirError) {
            console.warn(`Could not read directory ${currentPath}:`, dirError)
          }
        }

        return node
      }

      const structure = await buildFolderTree(folderPath)

      console.log(`[Folder Structure] Found structure with ${structure.children.length} subfolders and ${structure.files.length} files`)

      return {
        success: true,
        data: structure
      }
    } catch (error: any) {
      console.error('Get folder structure error:', error)
      return {
        success: false,
        message: error.message || 'Failed to get folder structure'
      }
    }
  })

  ipcMain.handle('wisdom:bulkUploadDocuments', async (event, options: {
    files: string[]
    mode?: 'folder' | 'recursive'
    category?: string
    subcategory?: string
    region?: string[]
    secondaryCategories?: string[]
    language?: string
  }) => {
    try {
      console.log(`[Bulk Upload] Processing ${options.files.length} files with mode: ${options.mode}`)

      const uploadedDocs = []
      let errors = 0

      for (const filePath of options.files) {
        try {
          const fileName = path.basename(filePath)
          const fileExtension = path.extname(fileName).toLowerCase()

          console.log(`[Bulk Upload] Processing file: ${fileName}`)

          if (!['.pdf', '.txt', '.md', '.docx', '.doc'].includes(fileExtension)) {
            console.warn(`[Bulk Upload] Skipping unsupported file: ${fileName}`)
            continue
          }

          let fileContent: string

          // Handle different file types
          // Handle different file types
          if (fileExtension === '.pdf') {
            try {
              const pdfBuffer = await fs.readFile(filePath)
              const pdfParse = require('pdf-parse')
              const data = await pdfParse(pdfBuffer)
              fileContent = data.text

              if (!fileContent || fileContent.trim().length === 0) {
                console.warn(`[Bulk Upload] Warning: Empty content extracted from PDF ${fileName}`)
                fileContent = `PDF Document: ${fileName}\n(Empty content extracted)`
              }
            } catch (error: any) {
              console.warn(`Could not process PDF ${fileName}:`, error)
              fileContent = `PDF Document: ${fileName}\nError extracting content: ${error.message}`
            }
          } else if (fileExtension === '.docx') {
            try {
              const mammoth = require('mammoth')
              const result = await mammoth.extractRawText({ path: filePath })
              fileContent = result.value
            } catch (error: any) {
              console.warn(`Could not process DOCX ${fileName}:`, error)
              fileContent = `DOCX Document: ${fileName}\nError extracting content: ${error.message}`
            }
          } else {
            fileContent = await fs.readFile(filePath, 'utf-8')
          }

          // Extract folder-based category if not specified
          let categoryToUse = options.category || 'hydraulics'
          let subcategoryToUse = options.subcategory || 'general'

          // Try to determine category from folder path
          if (!options.category) {
            const folderPath = path.dirname(filePath)
            const folderName = path.basename(folderPath).toLowerCase()

            // Map folder names to categories
            const categoryMap: Record<string, string> = {
              'hidrologia': 'fuentes-hidrologia',
              'fuentes': 'fuentes-hidrologia',
              'toma': 'obras-toma',
              'obras': 'obras-toma',
              'aducciones': 'hidraulica-aducciones',
              'hidraulica': 'hidraulica-aducciones',
              'potabilizacion': 'potabilizacion',
              'tratamiento': 'potabilizacion',
              'almacenamiento': 'almacenamiento',
              'tanques': 'almacenamiento',
              'bombeo': 'bombeo',
              'bombas': 'bombeo',
              'redes': 'redes-distribucion',
              'distribucion': 'redes-distribucion',
              'servidas': 'aguas-servidas',
              'saneamiento': 'aguas-servidas',
              'cadena': 'cadena-valor',
              'valor': 'cadena-valor'
            }

            for (const [key, value] of Object.entries(categoryMap)) {
              if (folderName.includes(key)) {
                categoryToUse = value
                subcategoryToUse = folderName
                break
              }
            }
          }

          const metadata = {
            fileName,
            uploadDate: new Date().toISOString(),
            fileType: fileExtension.substring(1),
            folderPath: path.dirname(filePath),
            formulas: [],
            tables: [],
            figures: [],
            examples: [],
            references: [],
            keywords: extractKeywords(fileContent),
            language: options.language || 'es'
          }

          // Notify start of file processing
          if (event.sender) {
            event.sender.send('wisdom:upload-progress', {
              current: uploadedDocs.length + 1,
              total: options.files.length,
              message: `Iniciando carga de ${fileName}...`,
              filename: fileName
            })
          }

          const docId = await ragService.addDocument({
            category: categoryToUse as any,
            subcategory: subcategoryToUse,
            region: options.region || [],
            secondaryCategories: options.secondaryCategories || [],
            title: fileName.replace(/\.[^/.]+$/, ''),
            content: fileContent,
            metadata,
            version: '1.0'
          }, (progress) => {
            // Forward chunk progress
            if (event.sender) {
              event.sender.send('wisdom:upload-progress', {
                current: uploadedDocs.length + 1,
                total: options.files.length,
                message: `${fileName}: ${progress.message}`,
                filename: fileName
              })
            }
          })

          uploadedDocs.push({
            id: docId,
            fileName,
            title: fileName.replace(/\.[^/.]+$/, ''),
            category: categoryToUse,
            subcategory: subcategoryToUse
          })

          console.log(`[Bulk Upload] Successfully processed: ${fileName} -> ${categoryToUse}`)

        } catch (error) {
          console.error(`Error uploading file ${path.basename(filePath)}:`, error)
          errors++
        }
      }

      console.log(`[Bulk Upload] Complete: ${uploadedDocs.length} successful, ${errors} errors`)

      return {
        success: true,
        documents: uploadedDocs,
        processed: uploadedDocs.length,
        errors,
        stats: {
          total: uploadedDocs.length,
          errors,
          successful: uploadedDocs.length
        },
        message: `Successfully uploaded ${uploadedDocs.length} documents${errors > 0 ? ` (${errors} errors)` : ''}`
      }
    } catch (error: any) {
      console.error('Bulk upload error:', error)
      return {
        success: false,
        message: error.message || 'Failed to bulk upload documents'
      }
    }
  })

  // Check Ollama connection from main process (bypasses CORS restrictions)
  ipcMain.handle('wisdom:checkOllamaConnection', async () => {
    try {
      console.log('[Document Handler] Checking Ollama connection from main process...')

      const axios = require('axios')

      const response = await axios.get('http://localhost:11434/api/tags', {
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json'
        }
      })

      if (response.status === 200 && response.data) {
        const models = response.data.models || []

        console.log(`[Document Handler] Ollama is available with ${models.length} models`)

        // Filter for embedding models
        const embeddingModels = models.filter((model: any) => {
          const name = model.name.toLowerCase()
          return (
            name.includes('embed') ||
            name.includes('nomic') ||
            name.includes('mxbai') ||
            name.includes('minilm') ||
            name.includes('bge') ||
            name.includes('e5') ||
            name.includes('gemma') ||
            name.includes('llama') ||
            name.includes('mistral')
          )
        }).map((model: any) => {
          // Determine dimension based on model name
          const name = model.name.toLowerCase()
          let dimension = 768 // default

          if (name.includes('mxbai')) dimension = 1024
          if (name.includes('nomic')) dimension = 768
          if (name.includes('minilm')) dimension = 384
          if (name.includes('bge-large')) dimension = 1024
          if (name.includes('bge-base')) dimension = 768
          if (name.includes('e5-large')) dimension = 1024
          if (name.includes('e5-base')) dimension = 768
          if (name.includes('gemma')) dimension = 3072
          if (name.includes('llama')) dimension = 4096
          if (name.includes('mistral')) dimension = 4096

          return {
            name: model.name,
            size: model.size,
            modified_at: model.modified_at,
            dimension
          }
        })

        return {
          success: true,
          available: true,
          models: embeddingModels,
          totalModels: models.length,
          message: `Found ${embeddingModels.length} embedding models out of ${models.length} total models`
        }
      } else {
        throw new Error(`Ollama responded with status ${response.status}`)
      }

    } catch (error: any) {
      console.log('[Document Handler] Ollama connection failed:', error.message)

      let message = 'Ollama is not available'
      if (error.code === 'ECONNREFUSED') {
        message = 'Ollama service is not running. Start with: ollama serve'
      } else if (error.code === 'ETIMEDOUT') {
        message = 'Ollama connection timed out. Check if service is responsive.'
      } else {
        message = `Ollama error: ${error.message}`
      }

      return {
        success: true,
        available: false,
        models: [],
        totalModels: 0,
        message
      }
    }
  })
}

// Helper function to extract keywords from text
function extractKeywords(text: string): string[] {
  // Common hydraulic engineering terms
  const hydraulicTerms = [
    'presión', 'caudal', 'tubería', 'válvula', 'bomba', 'tanque',
    'pressure', 'flow', 'pipe', 'valve', 'pump', 'tank',
    'diámetro', 'velocidad', 'pérdida', 'fricción', 'reynolds',
    'diameter', 'velocity', 'loss', 'friction', 'hazen-williams',
    'darcy-weisbach', 'bernoulli', 'continuidad', 'momentum'
  ]

  const words = text.toLowerCase().split(/\s+/)
  const keywords = new Set<string>()

  // Find hydraulic terms in text
  for (const term of hydraulicTerms) {
    if (words.some(word => word.includes(term))) {
      keywords.add(term)
    }
  }

  // Add other relevant words (4+ characters, not common)
  const commonWords = new Set(['para', 'este', 'esta', 'como', 'with', 'from', 'that', 'this'])

  for (const word of words) {
    const cleaned = word.replace(/[^a-záéíóúñ]/gi, '')
    if (cleaned.length >= 4 && !commonWords.has(cleaned)) {
      keywords.add(cleaned)
      if (keywords.size >= 20) break
    }
  }

  return Array.from(keywords)
}

export function registerVectorGraphHandlers(prisma?: PrismaClient) {
  console.log('[Vector Graph Handler] Registering handlers...')
  const prismaClient = prisma || new PrismaClient()

  // Get Vector Graph data for visualization
  ipcMain.handle('wisdom:getVectorGraph', async (event, options?: any) => {
    try {
      // Get all documents with their chunks and embeddings
      const documents = await prismaClient.hydraulicKnowledge.findMany({
        where: { status: 'active' },
        include: {
          chunks: {
            where: {
              embedding: { notIn: ['', '[]', 'null'] }
            }
          }
        }
      })

      const nodes = []
      const edges = []
      const categoryNodes = new Map<string, any>()

      // Create nodes for documents
      for (const doc of documents) {
        const nodeId = `doc-${doc.id}`
        const categories = [doc.category]

        // Parse secondary categories
        if ((doc as any).secondaryCategories) {
          try {
            const secondary = JSON.parse((doc as any).secondaryCategories)
            if (Array.isArray(secondary)) {
              categories.push(...secondary)
            }
          } catch (e) {
            // Ignore parse errors
          }
        }

        nodes.push({
          id: nodeId,
          label: doc.title,
          type: 'document',
          category: doc.category,
          allCategories: categories, // Pass all categories to frontend
          region: JSON.parse(doc.region),
          chunks: (doc as any).chunks.length,
          color: getColorForCategory(doc.category),
          size: Math.max(15, Math.min(35, (doc as any).chunks.length * 2))
        })

        // Process categories for graph nodes and links
        categories.forEach(cat => {
          if (!cat) return
          if (!categoryNodes.has(cat)) {
            categoryNodes.set(cat, {
              id: `cat-${cat}`,
              label: cat,
              type: 'category',
              color: getColorForCategory(cat),
              size: 25,
              title: `Category: ${cat}`
            })
          }

          // Link document to category
          edges.push({
            id: `${nodeId}-cat-${cat}`,
            from: nodeId,
            to: `cat-${cat}`,
            type: 'category_link',
            color: { color: '#e2e8f0', opacity: 0.3 }
          })
        })

        // Create nodes for chunks
        for (const chunk of (doc as any).chunks.slice(0, 3)) { // Limit to first 3 chunks per doc
          const chunkId = `chunk-${chunk.id}`
          nodes.push({
            id: chunkId,
            label: `Chunk ${chunk.chunkIndex + 1}`,
            type: 'chunk',
            parentDoc: doc.title,
            content: chunk.content.substring(0, 100) + '...',
            color: '#94a3b8',
            size: 8
          })

          // Connect chunk to document only, document connects to categories
          edges.push({
            id: `${nodeId}-${chunkId}`,
            from: nodeId,
            to: chunkId,
            type: 'contains'
          })
        }
      }

      // Add category nodes to graph
      categoryNodes.forEach(node => nodes.push(node))

      // Calculate category statistics (considering primary category only for grouping stats, or primary + secondary?)
      // Standard practice: Stats by Primary Category for simplicity, or we can expand.
      // Let's stick to Primary Category for the stats object to avoid double counting size/chunks.
      const categoryStats: Record<string, { count: number, totalChunks: number, totalSize: number, avgChunkSize: number }> = {}
      const uniqueCategories = new Set<string>()

      for (const doc of documents) {
        if (!doc.category) continue
        uniqueCategories.add(doc.category)

        if (!categoryStats[doc.category]) {
          categoryStats[doc.category] = { count: 0, totalChunks: 0, totalSize: 0, avgChunkSize: 0 }
        }

        const stats = categoryStats[doc.category]
        stats.count++
        stats.totalChunks += doc.chunks.length

        const docChunkSize = doc.chunks.reduce((sum, chunk) => sum + chunk.content.length, 0)
        stats.totalSize += docChunkSize
      }

      // Finalize averages
      Object.keys(categoryStats).forEach(cat => {
        const stats = categoryStats[cat]
        stats.avgChunkSize = stats.totalChunks > 0 ? Math.round(stats.totalSize / stats.totalChunks) : 0
      })

      return {
        success: true,
        graph: {
          nodes,
          edges,
          statistics: {
            totalNodes: nodes.length,
            totalEdges: edges.length,
            totalDocuments: documents.length,
            totalChunks: documents.reduce((sum, doc) => sum + doc.chunks.length, 0),
            categories: categoryNodes.size, // Use size of all unique categories found
            categoryStats
          }
        }
      }
    } catch (error: any) {
      console.error('Get vector graph error:', error)
      return {
        success: false,
        message: error.message || 'Failed to get vector graph'
      }
    }
  })

  // Get RAG system health metrics
  ipcMain.handle('wisdom:getRAGHealth', async () => {
    try {
      const totalDocs = await prismaClient.hydraulicKnowledge.count({
        where: { status: 'active' }
      })

      const totalChunks = await prismaClient.knowledgeChunk.count()
      const chunksWithEmbeddings = await prismaClient.knowledgeChunk.count({
        where: { embedding: { notIn: ['', '[]', 'null'] } }
      })

      const categories = await prismaClient.hydraulicKnowledge.groupBy({
        by: ['category'],
        where: { status: 'active' },
        _count: { category: true }
      })

      // Calculate derived metrics
      const embeddingCoverage = totalChunks > 0 ? (chunksWithEmbeddings / totalChunks) * 100 : 0

      // Calculate how many docs are properly indexed (have at least one chunk)
      const indexedPercentage = totalDocs > 0 ? (await prismaClient.hydraulicKnowledge.count({
        where: {
          status: 'active',
          chunks: { some: {} }
        }
      }) / totalDocs) * 100 : 0

      const avgChunksPerDoc = totalDocs > 0 ? Math.round(totalChunks / totalDocs) : 0

      // Identify issues
      const issues = []
      if (embeddingCoverage < 100 && totalChunks > 0) issues.push(`${totalChunks - chunksWithEmbeddings} chunks missing embeddings`)
      if (indexedPercentage < 100 && totalDocs > 0) issues.push(`${Math.round(100 - indexedPercentage)}% documents not indexed`)
      if (totalDocs === 0) issues.push('No documents in knowledge base')

      // Determine overall status
      let status = 'excellent'
      if (issues.length > 0) status = 'healthy'
      if (embeddingCoverage < 80 || indexedPercentage < 80) status = 'degraded'
      if (embeddingCoverage < 50 || totalDocs === 0) status = 'critical'

      const health = {
        status,
        timestamp: new Date().toISOString(),
        issues,
        metrics: {
          databaseStatus: 'connected',
          documents: {
            total: totalDocs,
            indexedPercentage: Math.round(indexedPercentage)
          },
          embeddings: {
            coverage: Math.round(embeddingCoverage),
            total: chunksWithEmbeddings
          },
          chunks: {
            total: totalChunks,
            avgPerDocument: avgChunksPerDoc
          },
          categories: categories.map(cat => ({
            category: cat.category,
            count: cat._count.category
          })),
          performance: {
            recentSearches: 0,
            avgProcessingTime: 0,
            avgResponseQuality: 5.0
          }
        }
      }

      return {
        success: true,
        health
      }
    } catch (error: any) {
      console.error('Get RAG health error:', error)
      return {
        success: false,
        message: error.message || 'Failed to get RAG health'
      }
    }
  })

  // Get vector clusters analysis
  ipcMain.handle('wisdom:getVectorClusters', async (event, options?: any) => {
    try {
      // Clustering based on categories and similarity
      const documents = await prismaClient.hydraulicKnowledge.findMany({
        where: { status: 'active' },
        include: {
          chunks: {
            where: { embedding: { notIn: ['', '[]', 'null'] } },
            select: { id: true, content: true } // Need content length, don't need embedding for basic clustering
          }
        }
      })

      const clusters = new Map()
      let totalChunksInSystem = 0

      for (const doc of documents) {
        if (!doc.category) continue

        const category = doc.category
        if (!clusters.has(category)) {
          clusters.set(category, {
            docs: [],
            totalChunks: 0,
            totalContentLength: 0
          })
        }

        const cluster = clusters.get(category)
        cluster.docs.push({
          id: doc.id,
          title: doc.title,
          region: JSON.parse(doc.region)
        })

        const docChunks = doc.chunks.length
        const docContentLength = doc.chunks.reduce((sum, chunk) => sum + chunk.content.length, 0)

        cluster.totalChunks += docChunks
        cluster.totalContentLength += docContentLength
        totalChunksInSystem += docChunks
      }

      const clustersArray = Array.from(clusters.entries()).map(([category, data]) => {
        const chunkCount = data.totalChunks
        const avgChunkSize = chunkCount > 0 ? Math.round(data.totalContentLength / chunkCount) : 0

        // Calculate a pseudo-density score based on average chunk size and document count
        // Ideally this would come from vector density, but for now we approximate
        // Higher density = more chunks per document + consistent chunk sizes
        const avgChunksPerDoc = data.docs.length > 0 ? chunkCount / data.docs.length : 0
        const density = Math.min(Math.max(avgChunksPerDoc / 20, 0.1), 1.0)

        return {
          id: category,
          label: category,
          chunkCount: chunkCount,
          avgChunkSize: avgChunkSize,
          density: density,
          size: data.docs.length
        }
      })

      return {
        success: true,
        totalClusters: clustersArray.length,
        totalChunks: totalChunksInSystem,
        clusters: clustersArray
      }
    } catch (error: any) {
      console.error('Get vector clusters error:', error)
      return {
        success: false,
        message: error.message || 'Failed to get vector clusters'
      }
    }
  })
}

// Helper functions
function getColorForCategory(category: string): string {
  const colors = {
    'hydraulics': '#3b82f6',
    'regulations': '#ef4444',
    'best-practices': '#10b981',
    'fuentes-hidrologia': '#8b5cf6',
    'obras-toma': '#f59e0b',
    'hidraulica-aducciones': '#06b6d4',
    'potabilizacion': '#84cc16',
    'almacenamiento': '#f97316',
    'bombeo': '#ec4899',
    'redes-distribucion': '#6366f1',
    'aguas-servidas': '#14b8a6',
    'tratamiento': '#a855f7',
    'cadena-valor': '#64748b'
  }
  return colors[category as keyof typeof colors] || '#6b7280'
}

function calculateHealthScore(totalDocs: number, totalChunks: number, chunksWithEmbeddings: number): number {
  if (totalDocs === 0) return 0

  const docScore = Math.min(totalDocs / 10, 1) * 30 // Up to 30 points for document count
  const chunkScore = totalChunks > 0 ? Math.min(totalChunks / 100, 1) * 30 : 0 // Up to 30 points for chunk count
  const embeddingScore = totalChunks > 0 ? (chunksWithEmbeddings / totalChunks) * 40 : 0 // Up to 40 points for embedding coverage

  return Math.round(docScore + chunkScore + embeddingScore)
}