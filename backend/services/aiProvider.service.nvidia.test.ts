import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AIProviderService } from './aiProvider.service'
import { PAREJAS } from './hydraulic/agentic/modelosRAG'
import { MENSAJES_NVIDIA } from './ai/pruebaNvidia'
import type { DatabaseService } from './database.service'

const { principal, auxiliar } = PAREJAS.nvidia

function baseFalsa() {
  const proveedor = { id: 'p-nvidia', name: 'nvidia', type: 'api', apiKey: 'nvapi-x', isActive: true, config: {} }
  const db = {
    getAIProviders: vi.fn(async () => ({ success: true, data: [proveedor] })),
    updateAIProvider: vi.fn(async () => ({ success: true })),
    deleteAIModels: vi.fn(async () => ({ success: true })),
    createOrUpdateAIModel: vi.fn(async (m: { modelId: string }) => ({ success: true, data: { id: m.modelId, ...m } })),
  }
  return { db, servicio: new AIProviderService(db as unknown as DatabaseService) }
}

function apiNvidia(porModelo: Record<string, number>) {
  const f = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const { model } = JSON.parse(String(init?.body))
    return new Response('{}', { status: porModelo[model] ?? 500 })
  })
  vi.stubGlobal('fetch', f)
  return f
}

describe('AIProviderService con NVIDIA (#222)', () => {
  beforeEach(() => vi.unstubAllGlobals())
  afterEach(() => vi.unstubAllGlobals())

  it('una clave rechazada no da «conectado», y el motivo llega a la interfaz', async () => {
    apiNvidia({ [principal]: 401, [auxiliar]: 401 })
    const { db, servicio } = baseFalsa()

    const r = await servicio.testProviderConnection('p-nvidia')

    expect(r).toMatchObject({ success: true, data: false, message: MENSAJES_NVIDIA.claveNoValida })
    expect(db.updateAIProvider).toHaveBeenCalledWith('p-nvidia', expect.objectContaining({
      isConnected: false, lastTestMessage: MENSAJES_NVIDIA.claveNoValida,
    }))
    expect(db.createOrUpdateAIModel).not.toHaveBeenCalled()
  })

  it('sin acceso al principal, conecta, lo avisa y sólo guarda el auxiliar', async () => {
    const f = apiNvidia({ [principal]: 404, [auxiliar]: 200 })
    const { db, servicio } = baseFalsa()

    const r = await servicio.testProviderConnection('p-nvidia')

    expect(r).toMatchObject({ success: true, data: true, message: MENSAJES_NVIDIA.sinPrincipal })
    const guardados = db.createOrUpdateAIModel.mock.calls.map(([m]) => m.modelId)
    expect(guardados).toEqual([auxiliar])
    // La carga de modelos reutiliza la prueba: dos peticiones, no cuatro.
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('con acceso a los dos, guarda la pareja entera', async () => {
    apiNvidia({ [principal]: 200, [auxiliar]: 200 })
    const { db, servicio } = baseFalsa()

    const r = await servicio.testProviderConnection('p-nvidia')

    expect(r).toMatchObject({ success: true, data: true })
    expect(db.createOrUpdateAIModel.mock.calls.map(([m]) => m.modelId)).toEqual([principal, auxiliar])
  })
})
