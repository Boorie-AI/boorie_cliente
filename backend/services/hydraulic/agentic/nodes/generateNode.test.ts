/**
 * La generación tenía un tope que Ollama no entendía y un minuto de paciencia.
 * El resultado no era un error visible: era la respuesta de «no encontré nada»
 * sobre documentos que sí estaban, porque la respuesta buena llegaba tarde.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import axios from 'axios'
import { GenerateNode } from './generateNode'
import { olvidarModelosRAG } from '../modelosRAG'

vi.mock('axios')

const config = {
  temperature: 0.3,
  maxTokens: 2000,
  includeCitations: true,
  includeCalculations: true,
  responseLanguage: 'es',
  technicalLevel: 'intermediate',
}

const estado = (docs: any[]) => ({
  originalQuestion: '¿qué problemas encontró la última simulación?',
  currentQuery: '¿qué problemas encontró la última simulación?',
  gradedDocuments: docs,
  parentDocuments: [],
  webSearchResults: [],
  applicableStandards: [],
  reformulatedQueries: [],
  engineeringDomain: 'water_distribution',
  calculationType: null,
  queryLanguage: 'es',
}) as any

const gestor = () => ({ updateState: vi.fn(), addError: vi.fn() }) as any

const documento = {
  id: 'a',
  content: 'Nudo 61: presión por encima de la máxima, hasta 93 m (umbral 70 m).',
  metadata: { source: 'Anomalías de la simulación', category: 'simulations' },
  relevant: true,
  relevanceScore: 0.8,
}

describe('generación de la respuesta', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    olvidarModelosRAG()
    process.env.BOORIE_RAG_MODELO_PRINCIPAL = 'modelo-de-prueba'
    process.env.BOORIE_RAG_MODELO_AUXILIAR = 'modelo-de-prueba'
  })

  it('pide el tope con la opción que Ollama entiende', async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: { response: 'El nudo 61 supera la presión máxima.' } } as never)
    await new GenerateNode(config as any).execute(estado([documento]), gestor())

    const [, cuerpo, opciones] = vi.mocked(axios.post).mock.calls[0] as [string, any, any]
    expect(cuerpo.options.num_predict).toBe(2000)
    expect(cuerpo.options.max_tokens).toBeUndefined()
    // Y la espera acompaña al tope: 2000 tokens en CPU no caben en un minuto.
    expect(opciones.timeout).toBeGreaterThanOrEqual(120000)
  })

  it('si falla la redacción lo dice, en vez de negar que hubiera fuentes', async () => {
    // El fallo real: la generación se pasaba de su espera y el usuario leía «no
    // encontré información en la base de conocimientos» sobre una consulta que
    // había encontrado cuatro documentos relevantes (#63).
    vi.mocked(axios.post).mockRejectedValue(new Error('timeout of 240000ms exceeded'))
    const r = await new GenerateNode(config as any).execute(estado([documento]), gestor())

    expect(r.success).toBe(false)
    expect(r.data.generation).toContain('1 documento relevante')
    expect(r.data.generation).toContain('no pude terminar de redactar')
    expect(r.data.generation).toContain('Anomalías de la simulación')
    expect(r.data.generation).not.toContain('No pude encontrar información')
  })

  it('recorta cada documento: el prompt entero era la mitad de la espera', async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: { response: 'ok' } } as never)
    const largo = { ...documento, content: 'x'.repeat(6000) }
    await new GenerateNode(config as any).execute(estado([largo]), gestor())

    const [, cuerpo] = vi.mocked(axios.post).mock.calls[0] as [string, any]
    expect(cuerpo.prompt).toContain('…')
    expect(cuerpo.prompt.length).toBeLessThan(6000)
  })

  it('sin documentos relevantes no se inventa una respuesta', async () => {
    const r = await new GenerateNode(config as any).execute(estado([]), gestor())

    expect(r.success).toBe(false)
    expect(axios.post).not.toHaveBeenCalled()
  })
})
