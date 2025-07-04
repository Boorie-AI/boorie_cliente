"use strict";
// Document Parser Service - Handles parsing of different document types
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
exports.DocumentParserService = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const logger_1 = require("../utils/logger");
// Import document parsing libraries
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const XLSX = require('xlsx');
const logger = (0, logger_1.createLogger)('DocumentParserService');
class DocumentParserService {
    constructor() {
        logger.info('Document parser service initialized');
    }
    async parseDocument(filePath, fileType) {
        try {
            logger.debug('Parsing document', { filePath, fileType });
            if (!fs.existsSync(filePath)) {
                return {
                    success: false,
                    error: 'File not found'
                };
            }
            let result;
            switch (fileType) {
                case 'pdf':
                    result = await this.parsePDF(filePath);
                    break;
                case 'docx':
                    result = await this.parseDOCX(filePath);
                    break;
                case 'pptx':
                    result = await this.parsePPTX(filePath);
                    break;
                case 'xlsx':
                    result = await this.parseXLSX(filePath);
                    break;
                default:
                    return {
                        success: false,
                        error: `Unsupported file type: ${fileType}`
                    };
            }
            logger.success('Parsed document successfully', {
                filePath,
                fileType,
                contentLength: result.content.length
            });
            return {
                success: true,
                data: result
            };
        }
        catch (error) {
            logger.error('Failed to parse document', error, { filePath, fileType });
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to parse document'
            };
        }
    }
    async parsePDF(filePath) {
        try {
            logger.debug('Parsing PDF file', { filePath });
            const dataBuffer = fs.readFileSync(filePath);
            const data = await pdfParse(dataBuffer);
            const metadata = {
                pageCount: data.numpages,
                fileType: 'pdf',
                title: data.info?.Title || null,
                author: data.info?.Author || null,
                subject: data.info?.Subject || null,
                creator: data.info?.Creator || null,
                producer: data.info?.Producer || null,
                creationDate: data.info?.CreationDate || null,
                modificationDate: data.info?.ModDate || null
            };
            return {
                content: data.text.trim(),
                metadata
            };
        }
        catch (error) {
            logger.error('Failed to parse PDF', error, { filePath });
            throw error;
        }
    }
    async parseDOCX(filePath) {
        try {
            logger.debug('Parsing DOCX file', { filePath });
            const result = await mammoth.extractRawText({ path: filePath });
            const metadata = {
                fileType: 'docx',
                hasImages: result.messages.some((msg) => msg.message.includes('image')),
                messageCount: result.messages.length
            };
            return {
                content: result.value.trim(),
                metadata
            };
        }
        catch (error) {
            logger.error('Failed to parse DOCX', error, { filePath });
            throw error;
        }
    }
    async parsePPTX(filePath) {
        try {
            logger.debug('Parsing PPTX file', { filePath });
            // For PPTX, we'll try to extract text using a basic approach
            // This is a simplified version - in production, you might want to use a more robust library
            const workbook = XLSX.readFile(filePath, { bookType: 'xlsx', type: 'buffer' });
            let content = '';
            let slideCount = 0;
            // Try to extract text from slides (this is a basic approach)
            try {
                const sheetNames = workbook.SheetNames;
                for (const sheetName of sheetNames) {
                    const sheet = workbook.Sheets[sheetName];
                    const sheetText = XLSX.utils.sheet_to_txt(sheet);
                    if (sheetText.trim()) {
                        content += `Slide ${slideCount + 1}:\n${sheetText}\n\n`;
                        slideCount++;
                    }
                }
            }
            catch (sheetError) {
                // If XLSX approach fails, try to read as binary and extract what we can
                logger.warn('Failed to parse PPTX with XLSX, trying alternative approach', sheetError);
                const buffer = fs.readFileSync(filePath);
                content = buffer.toString('utf8').replace(/[^\x20-\x7E\n\r]/g, ' ').trim();
            }
            const metadata = {
                fileType: 'pptx',
                slideCount,
                extractionMethod: 'basic'
            };
            return {
                content: content.trim() || 'Unable to extract text content from PPTX file',
                metadata
            };
        }
        catch (error) {
            logger.error('Failed to parse PPTX', error, { filePath });
            // Fallback: return basic file info
            return {
                content: `PPTX file: ${path.basename(filePath)} (text extraction failed)`,
                metadata: {
                    fileType: 'pptx',
                    extractionFailed: true,
                    error: error instanceof Error ? error.message : 'Unknown error'
                }
            };
        }
    }
    async parseXLSX(filePath) {
        try {
            logger.debug('Parsing XLSX file', { filePath });
            const workbook = XLSX.readFile(filePath);
            let content = '';
            const sheetData = [];
            for (const sheetName of workbook.SheetNames) {
                const sheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
                // Add sheet header
                content += `Sheet: ${sheetName}\n`;
                // Process each row
                jsonData.forEach((row, rowIndex) => {
                    if (row.length > 0) {
                        const rowText = row.join(' | ');
                        content += `Row ${rowIndex + 1}: ${rowText}\n`;
                    }
                });
                content += '\n';
                sheetData.push({
                    name: sheetName,
                    rowCount: jsonData.length,
                    columnCount: jsonData.length > 0 ? Math.max(...jsonData.map((row) => row.length)) : 0
                });
            }
            const metadata = {
                fileType: 'xlsx',
                sheetCount: workbook.SheetNames.length,
                sheets: sheetData
            };
            return {
                content: content.trim(),
                metadata
            };
        }
        catch (error) {
            logger.error('Failed to parse XLSX', error, { filePath });
            throw error;
        }
    }
    chunkContent(content, chunkSize, overlap, fileType) {
        try {
            logger.debug('Chunking content', {
                contentLength: content.length,
                chunkSize,
                overlap,
                fileType
            });
            // For XLSX files, use line-based chunking (one row per chunk)
            if (fileType === 'xlsx') {
                return this.chunkXLSXContent(content);
            }
            // For other file types, use standard text chunking
            return this.chunkTextContent(content, chunkSize, overlap);
        }
        catch (error) {
            logger.error('Failed to chunk content', error, { chunkSize, overlap, fileType });
            return [];
        }
    }
    chunkTextContent(content, chunkSize, overlap) {
        const chunks = [];
        if (content.length <= chunkSize) {
            chunks.push({
                content,
                startPos: 0,
                endPos: content.length,
                metadata: { chunkIndex: 0, totalChunks: 1 }
            });
            return chunks;
        }
        let start = 0;
        let chunkIndex = 0;
        while (start < content.length) {
            let end = Math.min(start + chunkSize, content.length);
            // Try to break at word boundary if not at the end
            if (end < content.length) {
                const lastSpace = content.lastIndexOf(' ', end);
                const lastNewline = content.lastIndexOf('\n', end);
                const breakPoint = Math.max(lastSpace, lastNewline);
                if (breakPoint > start) {
                    end = breakPoint;
                }
            }
            const chunk = content.slice(start, end).trim();
            if (chunk.length > 0) {
                chunks.push({
                    content: chunk,
                    startPos: start,
                    endPos: end,
                    metadata: {
                        chunkIndex,
                        totalChunks: -1, // Will be updated later
                        hasOverlap: chunkIndex > 0
                    }
                });
                chunkIndex++;
            }
            // Move start position considering overlap
            start = Math.max(start + chunkSize - overlap, end);
        }
        // Update total chunks count
        chunks.forEach(chunk => {
            if (chunk.metadata) {
                chunk.metadata.totalChunks = chunks.length;
            }
        });
        logger.debug('Created text chunks', { totalChunks: chunks.length });
        return chunks;
    }
    chunkXLSXContent(content) {
        const chunks = [];
        const lines = content.split('\n');
        let currentSheet = '';
        let rowIndex = 0;
        for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine.startsWith('Sheet:')) {
                currentSheet = trimmedLine.replace('Sheet:', '').trim();
                rowIndex = 0;
                continue;
            }
            if (trimmedLine.startsWith('Row ') && trimmedLine.includes(':')) {
                const rowContent = trimmedLine.substring(trimmedLine.indexOf(':') + 1).trim();
                if (rowContent) {
                    chunks.push({
                        content: rowContent,
                        metadata: {
                            sheet: currentSheet,
                            rowIndex,
                            fileType: 'xlsx',
                            chunkType: 'row'
                        }
                    });
                    rowIndex++;
                }
            }
        }
        logger.debug('Created XLSX chunks', { totalChunks: chunks.length });
        return chunks;
    }
}
exports.DocumentParserService = DocumentParserService;
