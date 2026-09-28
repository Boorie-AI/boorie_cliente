/**
 * Lo que se fija aquí (#205): que la pregunta se compara con los vectores del
 * adjunto, y que cualquier cosa que falle —la IPC, Ollama, otro modelo, la
 * espera— deja el chat eligiendo por palabras en vez de romperlo.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { coseno, prepararAdjunto, similitudesDelAdjunto } from './similitudDelAdjunto'

const vectoresDeAdjunto = vi.fn()
const vectorDeTexto = vi.fn()

beforeEach(() => {
  vectoresDeAdjunto.mockReset()
  vectorDeTexto.mockReset()
  ;(window as unknown as { electronAPI: unknown }).electronAPI = { chat: { vectoresDeAdjunto, vectorDeTexto } }
})

// Cada test con su propio texto: los vectores se recuerdan por documento.
let n = 0
const documento = () => `Documento ${n++}. The well loss coefficient.`

describe('la similitud con el adjunto', () => {
  it('el coseno', () => {
    expect(coseno([1, 0], [1, 0])).toBe(1)
    expect(coseno([1, 0], [0, 1])).toBe(0)
    expect(coseno([0, 0], [1, 1])).toBe(0)
  })

  it('compara la pregunta con cada fragmento', async () => {
    vectoresDeAdjunto.mockResolvedValue({ success: true, vectores: [[1, 0]] })
    vectorDeTexto.mockResolvedValue({ success: true, vector: [1, 0] })
    expect(await similitudesDelAdjunto(documento(), '¿pérdida de carga?')).toEqual([1])
  })

  it('el documento se vectoriza una vez aunque se pregunte dos', async () => {
    const texto = documento()
    vectoresDeAdjunto.mockResolvedValue({ success: true, vectores: [[1, 0]] })
    vectorDeTexto.mockResolvedValue({ success: true, vector: [1, 0] })
    await prepararAdjunto(texto)
    await similitudesDelAdjunto(texto, 'una')
    await similitudesDelAdjunto(texto, 'otra')
    expect(vectoresDeAdjunto).toHaveBeenCalledTimes(1)
  })

  it('si no se pudo vectorizar, nada: se elige por palabras', async () => {
    vectoresDeAdjunto.mockResolvedValue({ success: false, message: 'Ollama caído' })
    expect(await similitudesDelAdjunto(documento(), 'pregunta')).toBeUndefined()
  })

  it('con otro modelo de embeddings desde entonces, los vectores no se comparan', async () => {
    vectoresDeAdjunto.mockResolvedValue({ success: true, vectores: [[1, 0, 0]] })
    vectorDeTexto.mockResolvedValue({ success: true, vector: [1, 0] })
    expect(await similitudesDelAdjunto(documento(), 'pregunta')).toBeUndefined()
  })

  it('si tarda más de la cuenta, no se espera más', async () => {
    vectoresDeAdjunto.mockReturnValue(new Promise(() => {}))
    expect(await similitudesDelAdjunto(documento(), 'pregunta', 20)).toBeUndefined()
  })
})
