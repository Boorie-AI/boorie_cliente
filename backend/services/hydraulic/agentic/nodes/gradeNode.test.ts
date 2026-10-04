/**
 * El graduado descarta documentos, y descartarlos todos deja al agente sin nada
 * que decir sobre un corpus que sí tenía la respuesta. Aquí se prueba justo eso:
 * qué pasa cuando el juez falla y cuándo se conserva lo recuperado.
 */

import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest'
import axios from 'axios'
import { GradeNode } from './gradeNode'
import { cargarMotorRAG, guardarMotorRAG, olvidarModelosRAG, usarClaveNvidiaDe } from '../modelosRAG'
import { aceptarConsentimiento, cargarConsentimientos } from '../../../security/consentimientoNube'

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

  describe('con NVIDIA (#224)', () => {
    let avisos: MockInstance
    const ajustes = () => {
      const filas = new Map<string, string>()
      return {
        appSetting: {
          findUnique: async ({ where }: { where: { key: string } }) => (filas.has(where.key) ? { value: filas.get(where.key)! } : null),
          upsert: async ({ where, create, update }: { where: { key: string }; create: { value: string }; update: { value: string } }) => { filas.set(where.key, filas.has(where.key) ? update.value : create.value) },
        },
      }
    }
    const lista = (veredictos: Array<{ doc: number; relevant: boolean; score: number }>) =>
      ({ data: { choices: [{ message: { content: JSON.stringify(veredictos.map(v => ({ ...v, reason: 'porque sí' }))) } }] } })

    beforeEach(async () => {
      delete process.env.BOORIE_RAG_MODELO_PRINCIPAL
      delete process.env.BOORIE_RAG_MODELO_AUXILIAR
      const a = ajustes()
      await cargarConsentimientos(a)
      await aceptarConsentimiento(a, 'nvidia')
      usarClaveNvidiaDe(async () => 'nvapi-FAKEgrado0123456789abcdefghijklmnop')
      await guardarMotorRAG(a, 'nvidia')
      avisos = vi.spyOn(console, 'warn').mockImplementation(() => {})
      vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.spyOn(console, 'log').mockImplementation(() => {})
    })

    afterEach(async () => {
      vi.useRealTimers()
      vi.restoreAllMocks()
      await cargarConsentimientos(ajustes())
      await cargarMotorRAG(ajustes())
      usarClaveNvidiaDe(async () => null)
    })

    it('gradúa de cinco en cinco: siete fragmentos son dos llamadas, no siete', async () => {
      vi.mocked(axios.post)
        .mockResolvedValueOnce(lista([1, 2, 3, 4, 5].map(doc => ({ doc, relevant: doc !== 2, score: 0.9 }))) as never)
        .mockResolvedValueOnce(lista([{ doc: 1, relevant: true, score: 0.8 }, { doc: 2, relevant: false, score: 0.1 }]) as never)
      const docs = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(id => documento(id))
      const r = await new GradeNode(config).execute(estado(docs), gestor())

      expect(axios.post).toHaveBeenCalledTimes(2)
      expect(r.metrics?.apiCalls).toBe(2)
      expect(r.data.gradedDocuments.map(d => d.relevant)).toEqual([true, false, true, true, true, true, false])
      const [, cuerpo] = vi.mocked(axios.post).mock.calls[0] as unknown as [string, { model: string; messages: Array<{ content: string }> }]
      expect(cuerpo.model).toBe('nvidia/nemotron-3.5-lightning-30b-a3b')
      expect(cuerpo.messages[0].content).toContain('[5] Fuente: Anomalías e')
    })

    it('lo que el juez no evalúa en el lote se conserva y se dice', async () => {
      vi.mocked(axios.post).mockResolvedValueOnce(lista([{ doc: 1, relevant: false, score: 0 }]) as never)
      const r = await new GradeNode(config).execute(estado([documento('a'), documento('b')]), gestor())

      expect(r.data.gradedDocuments[1].relevant).toBe(true)
      expect(r.data.gradedDocuments[1].reason).toMatch(/Sin graduar \(el juez no lo evaluó\)/)
      expect(avisos).toHaveBeenCalledWith(expect.stringContaining('1 de 2 fragmentos sin graduar'))
    })

    it('con 429 espera y reintenta; si no cesa, conserva los fragmentos diciendo que fue el límite', async () => {
      vi.useFakeTimers()
      vi.mocked(axios.post).mockRejectedValue(Object.assign(new Error('429'), { response: { status: 429, headers: {} } }))
      const ejecucion = new GradeNode(config).execute(estado([documento('a'), documento('b')]), gestor())
      await vi.advanceTimersByTimeAsync(120_000)
      const r = await ejecucion

      expect(axios.post).toHaveBeenCalledTimes(5)
      expect(r.data.gradedDocuments.every(d => d.relevant)).toBe(true)
      expect(r.data.gradedDocuments[0].reason).toMatch(/límite de peticiones de la API/)
      expect(avisos).toHaveBeenCalledWith(expect.stringContaining('2 de 2 fragmentos sin graduar (límite de peticiones de la API)'))
    })
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
