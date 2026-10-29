/**
 * El esquema de arranque visto desde otra conexión mientras se aplica (#301).
 *
 * SQLite guarda el esquema en caché por conexión. Una que lo leía entre el
 * `CREATE TABLE "ai_providers"` y su índice único —que va al final de la lista—
 * se quedaba con la tabla sin índice, y el `upsert` de Prisma, que es un `INSERT …
 * ON CONFLICT`, fallaba al prepararse sin que SQLite recargara el esquema. En el
 * primer arranque eso dejaba la tabla de proveedores vacía.
 *
 * Aquí la segunda conexión vigila el esquema mientras se aplica y, si llega a ver
 * la tabla sin el índice, se detiene en ese punto: es la conexión que fallaba.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { ensureProductionSchema } from './esquemaProduccion'
import { activarWAL } from './baseSqlite'

let dir: string
let principal: PrismaClient
let otra: PrismaClient

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'boorie-esquema-conexiones-'))
  const url = `file:${join(dir, 'hydraulic.db')}?connection_limit=1`
  principal = new PrismaClient({ datasources: { db: { url } } })
  otra = new PrismaClient({ datasources: { db: { url } } })
  await principal.$connect()
  await activarWAL(principal, url)
  await otra.$connect()
})

afterEach(async () => {
  await otra.$disconnect()
  await principal.$disconnect()
  rmSync(dir, { recursive: true, force: true })
})

async function loQueVe(cliente: PrismaClient): Promise<string[]> {
  const filas = await cliente.$queryRawUnsafe(
    `SELECT name FROM sqlite_master WHERE name IN ('ai_providers', 'ai_providers_name_key')`
  ) as { name: string }[]
  return filas.map(f => f.name).sort()
}

describe('esquema de arranque con otra conexión abierta (#301)', () => {
  it('ninguna otra conexión ve una tabla sin su índice, y su upsert funciona', async () => {
    await loQueVe(otra)

    const avisar = console.warn
    console.warn = () => {}
    let terminado = false
    const aplicando = ensureProductionSchema(principal).finally(() => { terminado = true })

    let aMedias = false
    try {
      while (!terminado) {
        const visto = await loQueVe(otra)
        if (visto.length === 1) { aMedias = true; break }
      }
      await aplicando
    } finally {
      console.warn = avisar
    }

    await expect(otra.aIProvider.upsert({
      where: { name: 'openai' },
      // Con algo que actualizar, como en el arranque: así Prisma lo traduce a ON CONFLICT.
      update: { type: 'api' },
      create: { name: 'openai', type: 'api', apiKey: '', isActive: false, isConnected: false, config: '{}' },
    })).resolves.toMatchObject({ name: 'openai' })
    expect(aMedias, 'la otra conexión vio ai_providers sin ai_providers_name_key').toBe(false)
  }, 60_000)

  it('sobre una base que ya tiene el esquema, lo que sobra falla sin cortar lo demás', async () => {
    const avisar = console.warn
    const avisos: string[] = []
    console.warn = (...args: unknown[]) => { avisos.push(String(args[1])) }
    try {
      await ensureProductionSchema(principal)
      const antes = avisos.length
      await principal.$executeRawUnsafe('DROP INDEX "ai_providers_name_key"')

      await ensureProductionSchema(principal)

      // Los ALTER que ya están avisan, y el índice del final se vuelve a crear.
      expect(avisos.length).toBeGreaterThan(antes)
    } finally {
      console.warn = avisar
    }
    expect(await loQueVe(principal)).toEqual(['ai_providers', 'ai_providers_name_key'])
  }, 60_000)
})
