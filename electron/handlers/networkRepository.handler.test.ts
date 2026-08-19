import { describe, it, expect, vi } from 'vitest'

/**
 * `window.electronAPI.networkRepository` no está declarado en
 * `src/types/declarations.d.ts`, así que la llamada del renderer no se
 * comprueba en compilación: pasar el proveedor en la posición equivocada daría
 * un texto sin herramientas sin que nadie se entere. Esto fija el contrato del
 * canal por el lado del main.
 */

const handlersRegistrados: Record<string, (evento: unknown, ...args: any[]) => Promise<any>> = {}

vi.mock('electron', () => ({
  ipcMain: {
    handle: (canal: string, fn: any) => { handlersRegistrados[canal] = fn },
    removeHandler: () => {},
    removeAllListeners: () => {},
  },
}))

import { NetworkRepositoryHandler } from './networkRepository.handler'

const RED = {
  nodes: [{ id: 'J1', type: 'junction', elevation: 10, demand: 0.000231 }],
  links: [{ id: 'P1', type: 'pipe', from: 'R1', to: 'J1', length: 200, diameter: 0.075 }],
}

// La red solo existe para «p1»: si el fake respondiera a cualquier projectId,
// el test de los argumentos invertidos pasaria sin comprobar nada.
const prismaFalso = {
  hydraulicNetwork: {
    findFirst: async ({ where }: any) =>
      where?.projectId === 'p1'
        ? {
            id: 'n1',
            name: 'villa_100_casas.inp',
            summary: JSON.stringify({ junctions: 1, pipes: 1 }),
            networkData: JSON.stringify(RED),
          }
        : null,
  },
  hydraulicCalculation: { findMany: async () => [] },
} as any

const pedirContexto = (projectId: string, proveedor?: string) =>
  handlersRegistrados['network-repo:context'](null, projectId, proveedor)

describe('network-repo:context', () => {
  it('con un proveedor que sabe usar herramientas, manda consultar', async () => {
    new NetworkRepositoryHandler(prismaFalso)
    const r = await pedirContexto('p1', 'anthropic')

    expect(r.success).toBe(true)
    expect(r.data.resumen.nombre).toBe('villa_100_casas.inp')
    expect(r.data.texto).toContain('herramientas de consulta')
  })

  it('con Google no promete una consulta que no puede hacer', async () => {
    new NetworkRepositoryHandler(prismaFalso)
    const r = await pedirContexto('p1', 'google')

    expect(r.data.texto).toContain('no puedes consultar nudos ni tramos concretos')
    expect(r.data.texto).not.toContain('herramientas de consulta')
  })

  it('sin proveedor tampoco promete', async () => {
    // Es lo que pasa con `RedEnContexto`, que llama sin proveedor porque solo
    // usa el resumen. Que el texto salga conservador es lo correcto.
    new NetworkRepositoryHandler(prismaFalso)
    const r = await pedirContexto('p1')

    expect(r.data.texto).not.toContain('herramientas de consulta')
  })

  it('projectId va primero y proveedor segundo, y el orden importa', async () => {
    // El renderer llama sin tipos, asi que invertirlos no lo cazaria el
    // compilador: «anthropic» se leeria como projectId, no habria red y el
    // agente se quedaria con el bloque de chat general teniendo una delante.
    new NetworkRepositoryHandler(prismaFalso)

    const bien = await pedirContexto('p1', 'anthropic')
    expect(bien.data.texto).toContain('=== RED HIDRÁULICA ACTIVA ===')
    expect(bien.data.texto).toContain('herramientas de consulta')

    const alReves = await pedirContexto('anthropic', 'p1')
    expect(alReves.data.resumen).toBeNull()
    expect(alReves.data.texto).toContain('=== CHAT GENERAL ===')
  })

  it('sin proyecto devuelve el bloque de chat general', async () => {
    new NetworkRepositoryHandler(prismaFalso)
    const r = await pedirContexto('', 'anthropic')

    expect(r.data.resumen).toBeNull()
    expect(r.data.texto).toContain('=== CHAT GENERAL ===')
  })
})
