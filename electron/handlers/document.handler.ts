import { ipcMain, dialog } from 'electron'
import * as fs from 'fs/promises'
import * as path from 'path'
import { HydraulicRAGService } from '../../backend/services/hydraulic/ragService'
import { PrismaClient } from '@prisma/client'

export function registerDocumentHandlers() {
  const prisma = new PrismaClient()
  const ragService = new HydraulicRAGService(prisma)
  const EmbeddingService = require('../../backend/services/embeddingService')
  const embeddingService = new EmbeddingService()
  
  // Upload document for RAG processing
  ipcMain.handle('document:upload', async (event, options: {
    category: 'hydraulics' | 'regulations' | 'best-practices'
    subcategory?: string
    region?: string[]
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
        const fileContent = await fs.readFile(filePath, 'utf-8')
        
        // Extract metadata from filename or content
        const metadata = {
          fileName,
          uploadDate: new Date().toISOString(),
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
          title: fileName.replace(/\.[^/.]+$/, ''), // Remove extension
          content: fileContent,
          metadata,
          version: '1.0'
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
      return {
        success: false,
        message: error.message || 'Failed to upload documents'
      }
    }
  })
  
  // Search documents
  ipcMain.handle('document:search', async (event, query: string, options?: any) => {
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
  ipcMain.handle('document:list', async (event, filters?: {
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
      
      const documents = await prisma.hydraulicKnowledge.findMany({
        where,
        orderBy: { updatedAt: 'desc' }
      })
      
      return {
        success: true,
        documents: documents.map((doc: any) => ({
          id: doc.id,
          title: doc.title,
          category: doc.category,
          subcategory: doc.subcategory,
          region: JSON.parse(doc.region),
          language: doc.language,
          updatedAt: doc.updatedAt,
          version: doc.version
        }))
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
  ipcMain.handle('document:delete', async (event, documentId: string) => {
    try {
      // Delete chunks first
      await prisma.knowledgeChunk.deleteMany({
        where: { knowledgeId: documentId }
      })
      
      // Delete document
      await prisma.hydraulicKnowledge.delete({
        where: { id: documentId }
      })
      
      return {
        success: true,
        message: 'Document deleted successfully'
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
  ipcMain.handle('document:update', async (event, documentId: string, updates: any) => {
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
  
  // Get available embedding providers
  ipcMain.handle('document:get-embedding-providers', async () => {
    try {
      const providers = embeddingService.getProviders()
      const currentProvider = embeddingService.activeProvider
      
      return {
        success: true,
        providers,
        currentProviderId: currentProvider.id
      }
    } catch (error: any) {
      console.error('Get embedding providers error:', error)
      return {
        success: false,
        message: error.message || 'Failed to get embedding providers'
      }
    }
  })
  
  // Set embedding provider
  ipcMain.handle('document:set-embedding-provider', async (event, providerId: string) => {
    try {
      embeddingService.setProvider(providerId)
      
      return {
        success: true,
        message: `Switched to ${embeddingService.activeProvider.name}`
      }
    } catch (error: any) {
      console.error('Set embedding provider error:', error)
      return {
        success: false,
        message: error.message || 'Failed to set embedding provider'
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