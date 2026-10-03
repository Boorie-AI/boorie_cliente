import * as fs from 'fs/promises'
import * as path from 'path'
import pdf from 'pdf-parse'
import mammoth from 'mammoth'
import {
  formatoNoSoportado,
  textoIlegible,
  textoLeido,
  type TextoDeDocumento,
} from './textoDeDocumento'
import { leerEscaneado, type AlProgresoOcr } from './ocrDeEscaneados'

/**
 * Extract plain text from a document on disk. Shared by wisdom:upload
 * (persistent RAG indexing) and chat:pickAttachment (one-off chat context),
 * and by the RAG evaluation battery (#226), which must read the attachment
 * exactly as the app does.
 */
export async function extraerTextoDeFichero(
  filePath: string,
  alProgresoOcr?: AlProgresoOcr,
): Promise<TextoDeDocumento> {
  const fileName = path.basename(filePath)
  const fileExtension = path.extname(fileName).toLowerCase()

  if (fileExtension === '.pdf') {
    try {
      const pdfBuffer = await fs.readFile(filePath)
      const pdfData = await pdf(pdfBuffer)
      const leido = textoLeido(pdfData.text.replace(/\n\s*\n/g, '\n\n'))
      // Sin capa de texto es un escaneado: se lee con OCR (#198).
      if (leido.problema !== 'vacio') return leido
      console.log(`[Document Handler] ${fileName} no tiene texto: se lee con OCR`)
      return await leerEscaneado(pdfBuffer, alProgresoOcr)
    } catch (error) {
      console.warn(`Could not process PDF ${fileName}:`, error)
      return textoIlegible(error)
    }
  }

  if (fileExtension === '.docx') {
    try {
      const buffer = await fs.readFile(filePath)
      const result = await mammoth.extractRawText({ buffer })
      return textoLeido(result.value)
    } catch (error) {
      console.warn(`Could not process DOCX ${fileName}:`, error)
      return textoIlegible(error)
    }
  }

  if (fileExtension === '.doc') {
    return formatoNoSoportado('.doc binario: hay que convertirlo a DOCX o PDF')
  }

  try {
    return textoLeido(await fs.readFile(filePath, 'utf-8'))
  } catch (error) {
    console.warn(`Could not read ${fileName}:`, error)
    return textoIlegible(error)
  }
}
