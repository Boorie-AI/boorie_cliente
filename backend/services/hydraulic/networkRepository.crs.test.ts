import { describe, it, expect } from 'vitest'
import { NetworkRepositoryService } from './networkRepository'

/**
 * El sistema de coordenadas está escrito en dos sitios: la columna
 * `coordinateSystem` y la copia que vive dentro de `networkData`. El mapa lee la
 * segunda y el repositorio la primera, así que si `declararCRS` actualizara sólo
 * una, la red se seguiría pintando con el sistema anterior (#36).
 */
function prismaFalso(inicial: { coordinateSystem?: string | null; networkData: string }) {
  const fila: any = {
    id: 'n1',
    coordinateSystem: inicial.coordinateSystem ?? null,
    networkData: inicial.networkData,
    fileContent: '[COORDINATES]\n J1 842913.44 1151987.21\n',
  }
  return {
    fila,
    cliente: {
      hydraulicNetwork: {
        findUnique: async ({ where }: any) => (where.id === fila.id ? fila : null),
        update: async ({ data }: any) => {
          Object.assign(fila, data)
          return fila
        },
      },
    } as any,
  }
}

describe('declararCRS', () => {
  it('escribe el EPSG en la columna y en la copia de networkData', async () => {
    const { fila, cliente } = prismaFalso({
      coordinateSystem: JSON.stringify({ type: 'projected', units: 'meters', epsg: null }),
      networkData: JSON.stringify({ name: 'red', coordinate_system: { type: 'projected', epsg: null } }),
    })
    const repo = new NetworkRepositoryService(cliente)

    const resultado = await repo.declararCRS('n1', 'EPSG:32618')

    expect(resultado.declared_epsg).toBe('EPSG:32618')
    expect(JSON.parse(fila.coordinateSystem).declared_epsg).toBe('EPSG:32618')
    expect(JSON.parse(fila.networkData).coordinate_system.declared_epsg).toBe('EPSG:32618')
  })

  it('conserva lo que ya sabía el lector del .inp', async () => {
    const { fila, cliente } = prismaFalso({
      coordinateSystem: JSON.stringify({
        type: 'projected',
        units: 'meters',
        bounds: { minX: 842000, maxX: 843500, minY: 1151000, maxY: 1152500 },
      }),
      networkData: JSON.stringify({ name: 'red', nodes: [], coordinate_system: { type: 'projected' } }),
    })
    const repo = new NetworkRepositoryService(cliente)

    await repo.declararCRS('n1', 'EPSG:32618')

    const guardado = JSON.parse(fila.coordinateSystem)
    expect(guardado.type).toBe('projected')
    expect(guardado.units).toBe('meters')
    expect(guardado.bounds.minX).toBe(842000)
    // Los nudos y el nombre siguen ahí: declarar el CRS no reescribe la red.
    expect(JSON.parse(fila.networkData).name).toBe('red')
  })

  it('no toca el .inp guardado: la exportación conserva las coordenadas originales', async () => {
    const inp = '[COORDINATES]\n J1 842913.44 1151987.21\n'
    const { fila, cliente } = prismaFalso({
      networkData: JSON.stringify({ name: 'red', coordinate_system: { type: 'projected' } }),
    })
    const repo = new NetworkRepositoryService(cliente)

    await repo.declararCRS('n1', 'EPSG:32618')

    expect(fila.fileContent).toBe(inp)
  })

  it('declarar la red como no georreferenciada es un estado válido, no un borrado', async () => {
    const { fila, cliente } = prismaFalso({
      coordinateSystem: JSON.stringify({ type: 'projected', declared_epsg: 'EPSG:32618' }),
      networkData: JSON.stringify({ name: 'red', coordinate_system: { declared_epsg: 'EPSG:32618' } }),
    })
    const repo = new NetworkRepositoryService(cliente)

    const resultado = await repo.declararCRS('n1', null)

    expect(resultado.declared_epsg).toBeNull()
    expect(resultado.requires_user_crs).toBe(true)
    expect(JSON.parse(fila.networkData).coordinate_system.declared_epsg).toBeNull()
  })

  it('una red que no existe falla en vez de crear una fila fantasma', async () => {
    const { cliente } = prismaFalso({ networkData: '{}' })
    const repo = new NetworkRepositoryService(cliente)

    await expect(repo.declararCRS('no-existe', 'EPSG:32618')).rejects.toThrow(/no encontrada/i)
  })
})
