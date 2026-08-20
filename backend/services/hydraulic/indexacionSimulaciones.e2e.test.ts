/**
 * La cadena completa del #41 contra piezas reales: base SQLite, embeddings de
 * Ollama y Milvus Lite. Las pruebas de al lado usan dobles y comprueban la
 * lógica; ésta comprueba que las piezas encajan —que el vector se escribe con la
 * metainformación que luego se filtra, que el borrado llega al almacén, que la
 * pregunta del criterio de aceptación devuelve las anomalías reales—, que es lo
 * único que los dobles no pueden decir.
 *
 * Se salta sola si no hay entorno. Para correrla:
 *
 *   BOORIE_DATA_DIR=/ruta/datos ./venv-wntr/bin/python scripts/start_milvus.py &
 *   BOORIE_DATA_DIR=/ruta/datos BOORIE_E2E_DB=/ruta/fresh.db \
 *     npx vitest run backend/services/hydraulic/indexacionSimulaciones.e2e.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { IndexacionSimulacionesService } from './indexacionSimulaciones'
import { HybridSearchService } from './hybridSearch'
import { NetworkVersionService } from './networkVersions'
import { RetrieveNode } from './agentic/nodes/retrieveNode'

const DB = process.env.BOORIE_E2E_DB
const LARGO = 600_000

const topologia = JSON.stringify({
  nodes: [
    { id: 'J-1', type: 'junction' },
    { id: 'J-2', type: 'junction' },
    { id: 'R-1', type: 'reservoir' },
  ],
})

/** Una red con un nudo que cae en la punta de la mañana y un tramo embalado. */
const resultados = (factor = 1) => ({
  status: 'ok',
  timestamps: [0, 3600, 7200, 10800],
  node_results: {
    'J-1': { pressure: [22, 19, 9 * factor, 11] },
    'J-2': { pressure: [31, 30, 29, 30] },
    'R-1': { pressure: [0, 0, 0, 0] },
  },
  link_results: {
    'P-1': { velocity: [1.2, 2.1, 3.8 * factor, 2.4], flow: [10, 12, 18, 13] },
  },
  stats: { pressure: { min: 9, max: 31, mean: 22 }, velocity: { min: 1.2, max: 3.8, mean: 2.4 } },
  summary: { nodes: 3, links: 1, duration: 10800, report_timestep: 3600 },
})

let prisma: PrismaClient
let indexacion: IndexacionSimulacionesService
let busqueda: HybridSearchService
let versiones: NetworkVersionService

const ids = { proyectoA: '', proyectoB: '', red: '', v1: '', v2: '', run1: '', run2: '' }

async function crearProyecto(name: string) {
  const p = await prisma.hydraulicProject.create({
    data: {
      name,
      type: 'analysis',
      networkType: 'distribution',
      location: '{}',
      status: 'design',
      regulations: '[]',
    },
  })
  return p.id
}

describe.skipIf(!DB)('#41 de punta a punta, con Milvus y embeddings reales', () => {
  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: `file:${DB}` } } })
    indexacion = new IndexacionSimulacionesService(prisma)
    busqueda = new HybridSearchService(prisma)
    versiones = new NetworkVersionService(prisma)

    ids.proyectoA = await crearProyecto('E2E Proyecto A')
    ids.proyectoB = await crearProyecto('E2E Proyecto B')

    const red = await prisma.hydraulicNetwork.create({
      data: {
        projectId: ids.proyectoA,
        name: 'Red E2E',
        filename: 'red.inp',
        fileContent: '[JUNCTIONS]',
        networkData: topologia,
        summary: '{}',
      },
    })
    ids.red = red.id

    const v1 = await prisma.networkVersion.create({
      data: {
        networkId: red.id,
        versionNumber: 1,
        networkData: topologia,
        fileContent: '[JUNCTIONS]',
        summary: '{}',
      },
    })
    ids.v1 = v1.id

    const run1 = await prisma.simulationRun.create({
      data: {
        networkVersionId: v1.id,
        tipo: 'hidraulica',
        parameters: '{}',
        results: JSON.stringify(resultados()),
      },
    })
    ids.run1 = run1.id
  }, LARGO)

  afterAll(async () => {
    await prisma?.$disconnect()
  })

  it('indexa la ejecución y lo deja dicho en la propia ejecución', async () => {
    const r = await indexacion.indexar(ids.run1)

    expect(r.estado).toBe('indexada')
    expect(r.documentos).toBe(3) // ejecutivo, estadístico y anomalías; sin previa no hay comparación

    const estado = await indexacion.estado(ids.run1)
    expect(estado.estado).toBe('indexada')
    expect(estado.error).toBeNull()
    expect(estado.documentos).toBe(3)
  }, LARGO)

  it('ata cada documento al proyecto, a la versión y a la ejecución', async () => {
    const docs = await prisma.hydraulicKnowledge.findMany({
      where: { simulationRunId: ids.run1 },
      include: { chunks: true },
    })

    expect(docs).toHaveLength(3)
    for (const d of docs) {
      expect(d.projectId).toBe(ids.proyectoA)
      expect(d.simulationRunId).toBe(ids.run1)
      expect(d.category).toBe('simulations')
      expect(d.chunks.length).toBeGreaterThan(0)
      // La cita del origen viaja en el propio texto, que es lo que lee el modelo.
      expect(d.content).toContain(ids.run1)
      expect(d.content).toContain('Red E2E')
    }
  }, LARGO)

  it('la pregunta del criterio de aceptación recupera las anomalías reales', async () => {
    const resultados = await busqueda.hybridSearch(
      '¿qué problemas encontró la última simulación?',
      { topK: 8, ambito: 'ambos', projectId: ids.proyectoA }
    )

    const docs = await prisma.hydraulicKnowledge.findMany({
      where: { simulationRunId: ids.run1 },
      select: { id: true },
    })
    const nuestros = new Set(docs.map(d => d.id))
    const recuperados = resultados.filter(r => nuestros.has(r.metadata?.docId))

    expect(recuperados.length).toBeGreaterThan(0)
    // Cada fragmento identificado y distinto: el nodo de recuperación desempata
    // por este id, y si viniera vacío se quedaría con un solo documento.
    expect(recuperados.every(r => typeof r.id === 'string' && r.id.length > 0)).toBe(true)
    expect(new Set(resultados.map(r => r.id)).size).toBe(resultados.length)
    // El nudo que cae y el tramo embalado, por su nombre real.
    const texto = recuperados.map(r => r.content).join('\n')
    expect(texto).toMatch(/J-1|P-1/)
    // Y la metainformación que permite citar la ejecución de origen.
    expect(recuperados.some(r => r.metadata?.simulationRunId === ids.run1)).toBe(true)
  }, LARGO)

  it('desde otro proyecto no se ve nada de éste', async () => {
    const resultados = await busqueda.hybridSearch(
      '¿qué problemas encontró la última simulación?',
      { topK: 8, ambito: 'ambos', projectId: ids.proyectoB }
    )

    const docs = await prisma.hydraulicKnowledge.findMany({
      where: { projectId: ids.proyectoA },
      select: { id: true },
    })
    const ajenos = new Set(docs.map(d => d.id))

    expect(resultados.filter(r => ajenos.has(r.metadata?.docId))).toHaveLength(0)
  }, LARGO)

  it('el filtro temático del agente no se lleva por delante los derivados', async () => {
    const nodo = new RetrieveNode(prisma, {
      topK: 8,
      minScore: 0.1,
      useHybridSearch: true,
      useParentChild: false,
      includeMetadata: true,
      categories: ['regulations'],
      ambito: 'ambos',
      projectId: ids.proyectoA,
    } as any)

    const entrada = [
      { id: 'c1', content: 'anomalías', score: 0.9, metadata: { category: 'simulations', docId: 'd1' } },
      { id: 'c2', content: 'otra cosa', score: 0.9, metadata: { category: 'hydraulics', docId: 'd2' } },
      { id: 'c3', content: 'normativa', score: 0.9, metadata: { category: 'regulations', docId: 'd3' } },
    ]
    const salida = (nodo as any).processSearchResults(entrada, {
      originalQuestion: 'x',
      applicableStandards: [],
    })

    expect(salida.map((d: any) => d.id)).toContain('c1')
    expect(salida.map((d: any) => d.id)).not.toContain('c2')
  }, LARGO)

  it('la segunda ejecución añade la comparación con la anterior', async () => {
    const v2 = await prisma.networkVersion.create({
      data: {
        networkId: ids.red,
        versionNumber: 2,
        networkData: topologia,
        fileContent: '[JUNCTIONS]',
        summary: '{}',
      },
    })
    ids.v2 = v2.id

    const run2 = await prisma.simulationRun.create({
      data: {
        networkVersionId: v2.id,
        tipo: 'hidraulica',
        parameters: '{}',
        results: JSON.stringify(resultados(1.15)),
      },
    })
    ids.run2 = run2.id

    const r = await indexacion.indexar(run2.id)
    expect(r.estado).toBe('indexada')
    expect(r.documentos).toBe(4)

    const comparacion = await prisma.hydraulicKnowledge.findFirst({
      where: { simulationRunId: run2.id, subcategory: 'comparacion' },
    })
    expect(comparacion?.content).toContain(ids.run1)
  }, LARGO)

  it('reindexar rehace, no duplica', async () => {
    const antes = await prisma.hydraulicKnowledge.count({ where: { simulationRunId: ids.run1 } })
    await indexacion.reindexar(ids.run1)
    const despues = await prisma.hydraulicKnowledge.count({ where: { simulationRunId: ids.run1 } })

    expect(antes).toBe(3)
    expect(despues).toBe(3)
  }, LARGO)

  it('podar la versión no deja huérfanos ni en la base ni en el índice', async () => {
    const podadas = await versiones.podar(ids.red, { conservarSinMarcar: 1 })
    expect(podadas).toBe(1) // la v1; la v2 es la más reciente y no se toca nunca

    expect(await prisma.hydraulicKnowledge.count({ where: { simulationRunId: ids.run1 } })).toBe(0)

    const resultados = await busqueda.hybridSearch('anomalías de presión y velocidad', {
      topK: 10,
      ambito: 'ambos',
      projectId: ids.proyectoA,
    })
    // Ni siquiera como fragmento suelto: los vectores de la ejecución podada se
    // fueron con ella, y lo que quede sin documento detrás no llega a ser cita.
    expect(resultados.every(r => r.metadata?.simulationRunId !== ids.run1)).toBe(true)
  }, LARGO)
})
