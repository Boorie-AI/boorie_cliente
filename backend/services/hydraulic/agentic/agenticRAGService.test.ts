/**
 * Lo que hace que una consulta quepa en el tiempo que el chat puede esperar
 * (#63): cuántos documentos se graduán y si se redacta una respuesta que el
 * chat va a tirar. Medido en una máquina sin GPU utilizable, graduar cuesta ~45 s
 * por documento y redactar se comía otros 180 s, así que estas dos cosas eran la
 * diferencia entre 7 minutos y dos.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createAgenticRAGService } from './agenticRAGService'

type Resultado = { success: boolean; data: unknown; nextNode?: string }

const nodo = () => ({
  execute: vi.fn(async (): Promise<Resultado> => ({ success: true, data: {} })),
  setConfig: vi.fn(),
})

const nodos = {
  retrieve: nodo(),
  grade: nodo(),
  generate: nodo(),
  reformulate: nodo(),
  webSearch: nodo(),
}

vi.mock('./nodes/retrieveNode', () => ({ createRetrieveNode: () => nodos.retrieve }))
vi.mock('./nodes/gradeNode', () => ({ createGradeNode: () => nodos.grade }))
vi.mock('./nodes/generateNode', () => ({ createGenerateNode: () => nodos.generate }))
vi.mock('./nodes/reformulateNode', () => ({ createReformulateNode: () => nodos.reformulate }))
vi.mock('./nodes/webSearchNode', () => ({ createWebSearchNode: () => nodos.webSearch }))

const servicio = () => createAgenticRAGService({} as never)

describe('consulta del RAG agéntico', () => {
  beforeEach(() => {
    for (const n of Object.values(nodos)) {
      n.execute.mockClear()
      n.setConfig.mockClear()
      n.execute.mockImplementation(async () => ({ success: true, data: {} }))
    }
    delete process.env.RETRIEVAL_TOP_K
  })

  it('gradúa tres documentos por defecto, no diez', async () => {
    await servicio().query('¿qué problemas encontró la última simulación?')

    expect(nodos.retrieve.setConfig).toHaveBeenCalledWith(expect.objectContaining({ topK: 3 }))
  })

  it('respeta el «Max Results» del selector, que antes se ignoraba', async () => {
    await servicio().query('pérdida de carga', { searchTopK: 8 })

    expect(nodos.retrieve.setConfig).toHaveBeenCalledWith(expect.objectContaining({ topK: 8 }))
  })

  it('con sólo recuperación no redacta: son 180 s que el chat tiraba', async () => {
    nodos.retrieve.execute.mockResolvedValue({ success: true, data: {}, nextNode: 'grade' })
    nodos.grade.execute.mockResolvedValue({ success: true, data: {}, nextNode: 'generate' })

    const r = await servicio().query('pérdida de carga', { soloRecuperacion: true })

    expect(nodos.grade.execute).toHaveBeenCalled()
    expect(nodos.generate.execute).not.toHaveBeenCalled()
    // Y no se inventa el «No se pudo generar una respuesta» de siempre, que
    // sonaba a fallo cuando es que nadie la pidió.
    expect(r.answer).toBe('')
  })

  it('pidiendo la respuesta sí se redacta', async () => {
    nodos.retrieve.execute.mockResolvedValue({ success: true, data: {}, nextNode: 'grade' })
    nodos.grade.execute.mockResolvedValue({ success: true, data: {}, nextNode: 'generate' })

    await servicio().query('pérdida de carga')

    expect(nodos.generate.execute).toHaveBeenCalled()
  })
})
