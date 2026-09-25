import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const buscar = vi.fn()

vi.mock('@zilliz/milvus2-sdk-node', () => ({
  MilvusClient: class {
    search = buscar
  },
  DataType: {},
  ConsistencyLevelEnum: { Strong: 'Strong', Eventually: 'Eventually' },
}))

import { MilvusService } from './milvus.service'

// Los plazos son estáticos privados; los tests los acortan.
const plazos = MilvusService as any

const exito = { status: { error_code: 'Success' }, results: [{ id: 'f1', score: 0.9 }] }
const plazoVencido = () => new Error('4 DEADLINE_EXCEEDED: Deadline exceeded after 15.001s')

describe('la búsqueda en Milvus', () => {
  const servicio = MilvusService.getInstance()
  const original = {
    presupuesto: plazos.PRESUPUESTO_BUSQUEDA_MS,
    pausa: plazos.PAUSA_REINTENTO_MS,
  }

  beforeEach(() => {
    buscar.mockReset()
    vi.spyOn(servicio, 'ensureConnection').mockResolvedValue(undefined)
    plazos.PAUSA_REINTENTO_MS = 0
  })

  afterEach(() => {
    plazos.PRESUPUESTO_BUSQUEDA_MS = original.presupuesto
    plazos.PAUSA_REINTENTO_MS = original.pausa
  })

  it('lleva su propio plazo, más largo que los 15 s del SDK', async () => {
    // Con la memoria de intercambio llena, la misma búsqueda que tarda 2 s midió 22: con el
    // plazo del SDK se cortaba y el chat respondía sin fuentes.
    buscar.mockResolvedValue(exito)

    await servicio.search('hydraulic_knowledge', [0.1, 0.2], 6, 'projectId == ""')

    expect(buscar.mock.calls[0][0].timeout).toBeGreaterThan(15_000)
  })

  it('reintenta un plazo vencido en vez de rendirse, que es lo que manda al chat sin fuentes', async () => {
    buscar
      .mockRejectedValueOnce(plazoVencido())
      .mockRejectedValueOnce(plazoVencido())
      .mockResolvedValueOnce(exito)

    const res: any = await servicio.search('hydraulic_knowledge', [0.1, 0.2], 6)

    expect(buscar).toHaveBeenCalledTimes(3)
    expect(res.results).toHaveLength(1)
  })

  it('sin conexión también reintenta, y ya no devuelve una lista vacía como si no hubiera nada', async () => {
    vi.spyOn(servicio, 'ensureConnection')
      .mockRejectedValueOnce(new Error('Milvus unavailable (cached)'))
      .mockResolvedValue(undefined)
    buscar.mockResolvedValue(exito)

    const res: any = await servicio.search('hydraulic_knowledge', [0.1, 0.2], 6)

    expect(res.results).toHaveLength(1)
  })

  it('un error que no se arregla esperando falla a la primera', async () => {
    buscar.mockRejectedValue(new Error('cannot parse expression: projectId =='))

    await expect(servicio.search('hydraulic_knowledge', [0.1, 0.2], 6)).rejects.toThrow(/cannot parse/)
    expect(buscar).toHaveBeenCalledTimes(1)
  })

  it('agotado el presupuesto, lanza para que el chat sepa que no se pudo buscar', async () => {
    plazos.PRESUPUESTO_BUSQUEDA_MS = 0
    buscar.mockRejectedValue(plazoVencido())

    await expect(servicio.search('hydraulic_knowledge', [0.1, 0.2], 6)).rejects.toThrow(/DEADLINE_EXCEEDED/)
  })
})
