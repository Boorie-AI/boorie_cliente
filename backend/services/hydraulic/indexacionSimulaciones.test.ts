import { describe, it, expect, vi } from 'vitest'

/** El almacén vectorial se sustituye: aquí se prueba qué se borra, no dónde. */
const borrarVectores = vi.fn()
vi.mock('../milvus.service', () => ({
  MilvusService: {
    getInstance: () => ({ ensureConnection: async () => {}, delete: borrarVectores }),
  },
}))

import {
  AJUSTES_POR_DEFECTO,
  IndexacionSimulacionesService,
  normalizarAjustes,
} from './indexacionSimulaciones'

const RESULTADOS = JSON.stringify({
  status: 'Completed',
  timestamps: [0, 3600],
  node_results: { 'J-1': { pressure: [40, 9] } },
  link_results: { 'P-1': { velocity: [1, 1.2] } },
  stats: { pressure: { min: 9, max: 40, mean: 24 } },
  summary: { nodes: 1, links: 1, duration: 3600, report_timestep: 3600 },
})

/**
 * Prisma de mentira con lo justo que toca el servicio. Se prefiere a la base
 * real porque lo que se comprueba aquí es el orden de las cosas —marcar, borrar,
 * indexar, volver a marcar— y eso no necesita SQLite delante.
 */
function prismaFalso(overrides: Record<string, any> = {}) {
  const run = {
    id: 'run-1',
    tipo: 'Simulación Hidráulica',
    parameters: '{}',
    results: RESULTADOS,
    createdAt: new Date('2026-08-20T10:00:00Z'),
    estadoIndexacion: 'pendiente',
    errorIndexacion: null,
    networkVersion: {
      id: 'ver-1',
      versionNumber: 2,
      network: { id: 'red-1', name: 'Red Norte', projectId: 'proy-1' },
    },
  }

  const estado = { run, ajuste: null as null | { value: string } }

  return {
    estado,
    prisma: {
      appSetting: {
        findUnique: vi.fn(async () => estado.ajuste),
        upsert: vi.fn(async ({ update }: any) => {
          estado.ajuste = { value: update.value }
          return estado.ajuste
        }),
      },
      simulationRun: {
        findUnique: vi.fn(async () => estado.run),
        findFirst: vi.fn(async () => null),
        update: vi.fn(async ({ data }: any) => {
          Object.assign(estado.run, data)
          return estado.run
        }),
      },
      hydraulicKnowledge: {
        findMany: vi.fn(async () => []),
        deleteMany: vi.fn(async () => ({ count: 0 })),
      },
      ...overrides,
    } as any,
  }
}

function ragFalso() {
  return { addDocument: vi.fn(async () => 'doc-nuevo') } as any
}

describe('ajustes de indexación', () => {
  it('completa lo que falta con los valores por defecto', () => {
    expect(normalizarAjustes(null)).toEqual(AJUSTES_POR_DEFECTO)
    expect(normalizarAjustes({ incluirCrudos: true }).automatica).toBe(true)
    expect(normalizarAjustes({ umbrales: { presionMinimaM: 7 } as any }).umbrales).toEqual({
      ...AJUSTES_POR_DEFECTO.umbrales,
      presionMinimaM: 7,
    })
  })

  it('los del proyecto pesan más que los generales', async () => {
    const { prisma } = prismaFalso()
    prisma.appSetting.findUnique = vi.fn(async ({ where }: any) =>
      where.key === 'indexacion.simulaciones.proy-1'
        ? { value: JSON.stringify({ automatica: false }) }
        : { value: JSON.stringify({ automatica: true }) }
    )

    const servicio = new IndexacionSimulacionesService(prisma, ragFalso())
    expect((await servicio.ajustesDe('proy-1')).automatica).toBe(false)
    expect((await servicio.ajustesDe(null)).automatica).toBe(true)
  })
})

describe('ciclo de vida del índice', () => {
  it('podar versiones borra sus documentos, sin esperar a la cascada', async () => {
    // La columna llega por ALTER TABLE en las instalaciones que actualizan, y
    // eso en SQLite deja la clave foránea fuera: si el borrado dependiera de la
    // cascada, ahí no ocurriría y el índice seguiría respondiendo con
    // simulaciones de redes que ya no existen.
    const { prisma } = prismaFalso()
    prisma.hydraulicKnowledge.findMany = vi.fn(async () => [{ id: 'doc-1', chunks: [{ id: 'c-1' }] }])

    const borrados = await new IndexacionSimulacionesService(prisma, ragFalso())
      .limpiarIndicePorVersiones(['ver-1', 'ver-2'])

    expect(borrados).toBe(1)
    expect(borrarVectores).toHaveBeenCalledWith('hydraulic_knowledge', ['c-1'])
    expect(prisma.hydraulicKnowledge.deleteMany).toHaveBeenCalledWith({
      where: { simulationRun: { networkVersionId: { in: ['ver-1', 'ver-2'] } } },
    })
  })

  it('sin versiones que podar no toca nada', async () => {
    const { prisma } = prismaFalso()
    await new IndexacionSimulacionesService(prisma, ragFalso()).limpiarIndicePorVersiones([])
    expect(prisma.hydraulicKnowledge.deleteMany).not.toHaveBeenCalled()
  })
})

describe('indexación de una ejecución', () => {
  it('crea un documento por cada derivado y deja la ejecución indexada', async () => {
    const { prisma, estado } = prismaFalso()
    const rag = ragFalso()

    const resultado = await new IndexacionSimulacionesService(prisma, rag).indexar('run-1')

    expect(resultado.estado).toBe('indexada')
    expect(rag.addDocument).toHaveBeenCalledTimes(3)
    expect(estado.run.estadoIndexacion).toBe('indexada')
  })

  it('ata cada documento al proyecto y a la ejecución que lo generó', async () => {
    // Sin esto no hay confidencialidad (#39) ni ciclo de vida (#41): el
    // documento no sabría de quién es ni con qué desaparece.
    const { prisma } = prismaFalso()
    const rag = ragFalso()

    await new IndexacionSimulacionesService(prisma, rag).indexar('run-1')

    for (const llamada of rag.addDocument.mock.calls) {
      expect(llamada[2]).toBe('proy-1')
      expect(llamada[3]).toEqual({ simulationRunId: 'run-1', networkVersionId: 'ver-1' })
    }
  })

  it('borra lo anterior antes de volver a indexar, para no dejar dos copias', async () => {
    const { prisma } = prismaFalso()
    const rag = ragFalso()

    await new IndexacionSimulacionesService(prisma, rag).reindexar('run-1')

    expect(prisma.hydraulicKnowledge.deleteMany).toHaveBeenCalledWith({
      where: { simulationRunId: 'run-1' },
    })
  })

  it('respeta el proyecto que apagó la indexación automática', async () => {
    const { prisma, estado } = prismaFalso()
    prisma.appSetting.findUnique = vi.fn(async () => ({
      value: JSON.stringify({ automatica: false }),
    }))
    const rag = ragFalso()

    const resultado = await new IndexacionSimulacionesService(prisma, rag).indexar('run-1')

    expect(resultado.estado).toBe('omitida')
    expect(rag.addDocument).not.toHaveBeenCalled()
    expect(estado.run.estadoIndexacion).toBe('omitida')
  })

  it('el reintento manual indexa aunque la automática esté apagada', async () => {
    const { prisma } = prismaFalso()
    prisma.appSetting.findUnique = vi.fn(async () => ({
      value: JSON.stringify({ automatica: false }),
    }))
    const rag = ragFalso()

    const resultado = await new IndexacionSimulacionesService(prisma, rag).reindexar('run-1')

    expect(resultado.estado).toBe('indexada')
    expect(rag.addDocument).toHaveBeenCalled()
  })

  it('un fallo deja constancia en la ejecución en vez de perderse', async () => {
    const { prisma, estado } = prismaFalso()
    const rag = { addDocument: vi.fn(async () => { throw new Error('Ollama no responde') }) } as any

    await expect(new IndexacionSimulacionesService(prisma, rag).indexar('run-1')).rejects.toThrow('Ollama')
    expect(estado.run.estadoIndexacion).toBe('fallida')
    expect(estado.run.errorIndexacion).toContain('Ollama')
  })

  it('encolar no propaga el fallo a quien acaba de simular', async () => {
    // El criterio del issue: un fallo de indexación no invalida ni bloquea la
    // simulación. Si `encolar` dejara escapar el rechazo, tumbaría el proceso
    // principal de Electron por una promesa sin dueño.
    const { prisma, estado } = prismaFalso()
    const rag = { addDocument: vi.fn(async () => { throw new Error('embeddings caídos') }) } as any
    const servicio = new IndexacionSimulacionesService(prisma, rag)

    expect(() => servicio.encolar('run-1')).not.toThrow()
    await vi.waitFor(() => expect(estado.run.estadoIndexacion).toBe('fallida'))
  })

  it('no arranca dos veces la misma ejecución a la vez', async () => {
    const { prisma } = prismaFalso()
    let abrir: () => void = () => {}
    const puerta = new Promise<void>(res => { abrir = res })
    const rag = { addDocument: vi.fn(async () => { await puerta; return 'doc' }) } as any
    const servicio = new IndexacionSimulacionesService(prisma, rag)

    const primera = servicio.indexar('run-1')
    const segunda = await servicio.indexar('run-1')

    expect(segunda.estado).toBe('indexando')
    expect(segunda.documentos).toBe(0)

    abrir()
    expect((await primera).estado).toBe('indexada')
  })
})
