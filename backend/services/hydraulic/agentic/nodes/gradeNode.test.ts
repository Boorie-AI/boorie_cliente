/**
 * El graduado descarta documentos, y descartarlos todos deja al agente sin nada
 * que decir sobre un corpus que sí tenía la respuesta. Aquí se prueba justo eso:
 * qué pasa cuando el juez falla y cuándo se conserva lo recuperado.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import axios from 'axios'
import { GradeNode } from './gradeNode'
import { olvidarModelosRAG } from '../modelosRAG'

vi.mock('axios')

const config = {
  relevanceThreshold: 0.5,
  requireTechnicalContent: true,
  checkStandardsAlignment: true,
  strictRegionMatch: false,
}

const documento = (id: string, content = 'Nudo 61: presión por encima de la máxima, hasta 93 m.') => ({
  id,
  content,
  metadata: { source: `Anomalías ${id}`, category: 'simulations' },
})

const estado = (docs: any[]) => ({
  originalQuestion: '¿qué problemas encontró la última simulación?',
  retrievedDocuments: docs,
  applicableStandards: [],
  reformulatedQueries: [],
  engineeringDomain: 'water_distribution',
  calculationType: null,
}) as any

const gestor = () => ({ updateState: vi.fn(), addError: vi.fn() }) as any

/** Lo que contesta el juez, ya envuelto como lo devuelve Ollama. */
const veredicto = (relevant: boolean, score: number) =>
  ({ data: { response: JSON.stringify({ relevant, score, reason: 'porque sí' }) } })

describe('graduado de documentos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    olvidarModelosRAG()
    process.env.BOORIE_RAG_MODELO_PRINCIPAL = 'modelo-de-prueba'
    process.env.BOORIE_RAG_MODELO_AUXILIAR = 'modelo-de-prueba'
  })

  it('deja pasar lo que el juez aprueba', async () => {
    vi.mocked(axios.post).mockResolvedValue(veredicto(true, 0.9) as never)
    const r = await new GradeNode(config as any).execute(estado([documento('a')]), gestor())

    expect(r.data.gradedDocuments[0].relevant).toBe(true)
  })

  it('con el juez caído se queda lo que encontró la búsqueda, no el vacío', async () => {
    // El fallo real: la etiqueta del modelo no existía y Ollama devolvía 404
    // para cada documento, así que el agente se quedaba sin contexto entero.
    vi.mocked(axios.post).mockRejectedValue(new Error('Request failed with status code 404'))
    const r = await new GradeNode(config as any).execute(estado([documento('a'), documento('b')]), gestor())

    expect(r.data.gradedDocuments.every((d: any) => d.relevant)).toBe(true)
    expect(r.nextNode).toBe('generate')
  })

  it('si el juez descarta todo, sobreviven los tres mejores por similitud', async () => {
    vi.mocked(axios.post).mockResolvedValue(veredicto(false, 0) as never)
    const docs = ['a', 'b', 'c', 'd', 'e'].map(id => documento(id))
    const r = await new GradeNode(config as any).execute(estado(docs), gestor())

    const conservados = r.data.gradedDocuments.filter((d: any) => d.relevant)
    expect(conservados).toHaveLength(3)
    expect(r.nextNode).toBe('generate')
  })

  it('el rescate no asciende a nadie cuando ya había aprobados', async () => {
    vi.mocked(axios.post)
      .mockResolvedValueOnce(veredicto(true, 0.9) as never)
      .mockResolvedValue(veredicto(false, 0) as never)
    const docs = ['a', 'b', 'c', 'd'].map(id => documento(id))
    const r = await new GradeNode(config as any).execute(estado(docs), gestor())

    expect(r.data.gradedDocuments.filter((d: any) => d.relevant)).toHaveLength(1)
  })

  it('sin documentos recuperados no hay nada que rescatar', async () => {
    const r = await new GradeNode(config as any).execute(estado([]), gestor())

    expect(r.data.gradedDocuments).toHaveLength(0)
    expect(r.nextNode).not.toBe('generate')
  })

  it('le pone tope a la respuesta del juez con la opción que Ollama entiende', async () => {
    // `max_tokens` lo ignora Ollama; con `num_predict` la llamada baja de
    // veinte segundos a dos, y se hace una por documento recuperado.
    vi.mocked(axios.post).mockResolvedValue(veredicto(true, 0.9) as never)
    await new GradeNode(config as any).execute(estado([documento('a')]), gestor())

    const [, cuerpo] = vi.mocked(axios.post).mock.calls[0] as [string, any]
    expect(cuerpo.options.num_predict).toBeGreaterThan(0)
    expect(cuerpo.options.max_tokens).toBeUndefined()
  })

  it('el prompt pone el documento antes que la pregunta', () => {
    // No es cosmético: con el documento enterrado bajo el rol y los criterios,
    // el modelo pequeño contestaba que un informe de anomalías no hablaba de
    // anomalías. Se mide el orden porque es lo que arregló el veredicto.
    const nodo: any = new GradeNode(config as any)
    const prompt: string = nodo.buildGradingPrompt(documento('a'), estado([]))

    expect(prompt.indexOf('Nudo 61')).toBeLessThan(prompt.indexOf('Pregunta del usuario'))
    expect(prompt).not.toContain('Ejemplo:')
  })
})
