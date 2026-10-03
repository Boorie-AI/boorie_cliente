/**
 * Un proveedor externo sólo está activo con una clave válida (#246), contra
 * una base SQLite de verdad como la de `migracionClaves.test.ts`: la
 * corrección del arranque une filas, mueve modelos y borra, y eso un doble de
 * Prisma no lo comprueba. Cada prueba crea su base en una carpeta temporal.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { mkdtempSync, rmSync, copyFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { ensureProductionSchema } from '../../../electron/esquemaProduccion'
import { activarWAL } from '../../../electron/baseSqlite'
import { corregirProveedores, CLAVE_MODELO_RESPUESTA, SIN_CLAVE_VALIDADA } from './proveedoresActivos'
import { cifradorDePrueba } from './cifradorDePrueba'
import { configurarCifrador, olvidarClavesDeSesion, SIN_CIFRADO, valorParaGuardar } from './clavesProveedor'
import { DatabaseService } from '../database.service'
import { AIProviderService } from '../aiProvider.service'
import { MENSAJES_PRUEBA } from '../ai/pruebaProveedores'

const CLAVE = 'sk-ant-FAKEactivos0123456789abcdefghij'
const silencio = { warn: () => {}, info: () => {} }

let plantilla: string
let dir: string
let prisma: PrismaClient

beforeAll(async () => {
  plantilla = mkdtempSync(join(tmpdir(), 'boorie-activos-plantilla-'))
  const cliente = new PrismaClient({ datasources: { db: { url: `file:${join(plantilla, 'vacia.db')}` } } })
  const avisar = console.warn
  console.warn = () => {}
  try {
    await ensureProductionSchema(cliente)
  } finally {
    console.warn = avisar
    await cliente.$disconnect()
  }
}, 60_000)

afterAll(() => rmSync(plantilla, { recursive: true, force: true }))

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'boorie-activos-'))
  copyFileSync(join(plantilla, 'vacia.db'), join(dir, 'prueba.db'))
  // Una sola conexión: el `wal_checkpoint(TRUNCATE)` del final espera a las demás
  // del pool hasta el `busy_timeout` (5 s) y en un CI cargado tumbaba la prueba.
  const url = `file:${join(dir, 'prueba.db')}?connection_limit=1`
  prisma = new PrismaClient({ datasources: { db: { url } } })
  await prisma.$connect()
  await activarWAL(prisma, url)
})

afterEach(async () => {
  vi.unstubAllGlobals()
  configurarCifrador(SIN_CIFRADO)
  olvidarClavesDeSesion()
  await prisma.$disconnect()
  rmSync(dir, { recursive: true, force: true })
})

const crear = (name: string, datos: Partial<{ type: string; apiKey: string | null; isActive: boolean; lastTestResult: string }> = {}) =>
  prisma.aIProvider.create({ data: { name, type: 'api', apiKey: '', isActive: true, ...datos } })

const elegir = (proveedor: string) => prisma.appSetting.create({
  data: { key: CLAVE_MODELO_RESPUESTA, value: JSON.stringify({ proveedorId: proveedor.toLowerCase(), proveedor, modelo: 'm' }) },
})

describe('al arrancar', () => {
  it('apaga los externos activos sin clave, y deja Ollama y los que tienen clave', async () => {
    const c = cifradorDePrueba()
    await crear('openai')
    await crear('anthropic')
    await crear('nvidia', { apiKey: valorParaGuardar(CLAVE, { cifrador: c }) })
    await crear('ollama', { type: 'local' })

    const r = await corregirProveedores(prisma as never, c, silencio)

    expect(r.desactivadas.sort()).toEqual(['anthropic', 'openai'])
    const activos = (await prisma.aIProvider.findMany({ where: { isActive: true } })).map(f => f.name).sort()
    expect(activos).toEqual(['nvidia', 'ollama'])
  })

  it('apaga el de una clave ilegible (base de otro equipo) pero no la borra', async () => {
    const deOtro = valorParaGuardar(CLAVE, { cifrador: cifradorDePrueba('otro-equipo') })!
    await crear('anthropic', { apiKey: deOtro })

    await corregirProveedores(prisma as never, cifradorDePrueba(), silencio)

    const fila = await prisma.aIProvider.findUniqueOrThrow({ where: { name: 'anthropic' } })
    expect(fila.isActive).toBe(false)
    expect(fila.apiKey).toBe(deOtro)
  })

  it('une «OpenAI» con «openai»: rescata su clave y sus modelos, y no deja dos filas', async () => {
    const c = cifradorDePrueba()
    await crear('openai')
    const duplicada = await crear('OpenAI', { apiKey: valorParaGuardar(CLAVE, { cifrador: c }), isActive: false, lastTestResult: 'success' })
    await prisma.aIModel.create({ data: { providerId: duplicada.id, modelId: 'gpt-x', modelName: 'gpt-x', isSelected: true } })
    await crear('Google', { isActive: false })

    const r = await corregirProveedores(prisma as never, c, silencio)

    expect(r).toMatchObject({ unidas: 1, renombradas: 1 })
    const filas = await prisma.aIProvider.findMany({ include: { models: true }, orderBy: { name: 'asc' } })
    expect(filas.map(f => f.name)).toEqual(['google', 'openai'])
    const openai = filas.find(f => f.name === 'openai')!
    expect(openai.apiKey).toBe(valorParaGuardar(CLAVE, { cifrador: c }))
    expect(openai.lastTestResult).toBe('success')
    expect(openai.models.map(m => m.modelId)).toEqual(['gpt-x'])
  })

  it('el modelo que redacta de un proveedor apagado vuelve al automático', async () => {
    await crear('anthropic')
    await elegir('Anthropic')

    const r = await corregirProveedores(prisma as never, cifradorDePrueba(), silencio)

    expect(r.modeloElegidoOlvidado).toBe(true)
    expect((await prisma.appSetting.findUniqueOrThrow({ where: { key: CLAVE_MODELO_RESPUESTA } })).value).toBe('')
  })

  it('el de un proveedor con clave se queda', async () => {
    const c = cifradorDePrueba()
    await crear('anthropic', { apiKey: valorParaGuardar(CLAVE, { cifrador: c }) })
    await elegir('Anthropic')

    await corregirProveedores(prisma as never, c, silencio)

    expect((await prisma.appSetting.findUniqueOrThrow({ where: { key: CLAVE_MODELO_RESPUESTA } })).value).toContain('Anthropic')
  })

  it('una segunda pasada no cambia nada', async () => {
    const c = cifradorDePrueba()
    await crear('openai')
    await crear('OpenAI', { isActive: false })
    await corregirProveedores(prisma as never, c, silencio)
    const r = await corregirProveedores(prisma as never, c, silencio)
    expect(r).toEqual({ unidas: 0, renombradas: 0, desactivadas: [], modeloElegidoOlvidado: false })
  })
})

describe('el interruptor', () => {
  const servicio = () => {
    configurarCifrador(cifradorDePrueba())
    return new AIProviderService(new DatabaseService(prisma))
  }
  const anthropicDice = (status: number) => vi.stubGlobal('fetch', vi.fn(async () =>
    new Response(JSON.stringify(status === 200 ? { data: [{ id: 'claude-a', display_name: 'Claude A' }] } : { error: {} }), { status })))

  it('no se enciende sin clave', async () => {
    const fila = await crear('anthropic', { isActive: false })
    const r = await servicio().updateProvider(fila.id, { isActive: true })
    expect(r).toMatchObject({ success: false, error: SIN_CLAVE_VALIDADA })
    expect((await prisma.aIProvider.findUniqueOrThrow({ where: { id: fila.id } })).isActive).toBe(false)
  })

  it('no se enciende con una clave que nadie ha probado', async () => {
    const s = servicio()
    const fila = await crear('anthropic', { isActive: false })
    await s.guardarClave(fila.id, CLAVE)
    expect((await s.updateProvider(fila.id, { isActive: true })).success).toBe(false)
  })

  it('«Probar» con una clave aceptada lo enciende y guarda los modelos de la API', async () => {
    const s = servicio()
    const fila = await crear('anthropic', { isActive: false })
    await s.guardarClave(fila.id, CLAVE)
    anthropicDice(200)

    const r = await s.testProviderConnection(fila.id)

    expect(r).toMatchObject({ success: true, data: true })
    const guardada = await prisma.aIProvider.findUniqueOrThrow({ where: { id: fila.id }, include: { models: true } })
    expect(guardada).toMatchObject({ isActive: true, isConnected: true, lastTestResult: 'success' })
    expect(guardada.models.map(m => m.modelId)).toEqual(['claude-a'])
  })

  it('«Probar» con una clave rechazada lo apaga, y el que redacta vuelve al automático', async () => {
    const s = servicio()
    const fila = await crear('anthropic', { isActive: true, lastTestResult: 'success' })
    await prisma.aIProvider.update({ where: { id: fila.id }, data: { apiKey: valorParaGuardar(CLAVE) } })
    await elegir('Anthropic')
    anthropicDice(401)

    const r = await s.testProviderConnection(fila.id)

    expect(r).toMatchObject({ success: true, data: false, message: MENSAJES_PRUEBA.claveNoValida })
    expect((await prisma.aIProvider.findUniqueOrThrow({ where: { id: fila.id } })).isActive).toBe(false)
    expect((await prisma.appSetting.findUniqueOrThrow({ where: { key: CLAVE_MODELO_RESPUESTA } })).value).toBe('')
  })

  it('sin red no se sabe nada de la clave: no lo apaga', async () => {
    const s = servicio()
    const fila = await crear('anthropic', { isActive: true, lastTestResult: 'success' })
    await prisma.aIProvider.update({ where: { id: fila.id }, data: { apiKey: valorParaGuardar(CLAVE) } })
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed') }))

    const r = await s.testProviderConnection(fila.id)

    expect(r).toMatchObject({ data: false, message: MENSAJES_PRUEBA.sinRed })
    expect((await prisma.aIProvider.findUniqueOrThrow({ where: { id: fila.id } })).isActive).toBe(true)
  })

  it('pegar una clave nueva lo apaga hasta que se pruebe', async () => {
    const s = servicio()
    const fila = await crear('anthropic', { isActive: true, lastTestResult: 'success' })
    await s.guardarClave(fila.id, CLAVE)
    expect(await prisma.aIProvider.findUniqueOrThrow({ where: { id: fila.id } })).toMatchObject({ isActive: false, lastTestResult: null })
  })

  it('el chat no encuentra la clave de un proveedor apagado', async () => {
    const db = new DatabaseService(prisma)
    configurarCifrador(cifradorDePrueba())
    await crear('anthropic', { isActive: false, apiKey: valorParaGuardar(CLAVE) })
    expect(await db.claveDeProveedor('anthropic')).toBeNull()
    await prisma.aIProvider.update({ where: { name: 'anthropic' }, data: { isActive: true } })
    expect(await db.claveDeProveedor('Anthropic')).toBe(CLAVE)
  })

  it('Configuración ve también los apagados, para poder pegarles la clave', async () => {
    await crear('anthropic', { isActive: false })
    await crear('ollama', { type: 'local' })
    const r = await new DatabaseService(prisma).getAIProviders()
    expect(r.data!.map(p => p.name).sort()).toEqual(['anthropic', 'ollama'])
  })
})
