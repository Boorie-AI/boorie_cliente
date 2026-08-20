/**
 * La generación tenía un tope que Ollama no entendía y un minuto de paciencia.
 * El resultado no era un error visible: era la respuesta de «no encontré nada»
 * sobre documentos que sí estaban, porque la respuesta buena llegaba tarde.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import axios from 'axios'
import { GenerateNode } from './generateNode'
import { olvidarModeloLocal } from '../modeloLocal'

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
    olvidarModeloLocal()
    process.env.OLLAMA_MODEL = 'modelo-de-prueba'
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

  it('sin documentos relevantes no se inventa una respuesta', async () => {
    const r = await new GenerateNode(config as any).execute(estado([]), gestor())

    expect(r.success).toBe(false)
    expect(axios.post).not.toHaveBeenCalled()
  })
})
