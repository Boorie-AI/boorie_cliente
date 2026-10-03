/**
 * La conversión de las claves antiguas y el guardado, contra una base SQLite de
 * verdad (#225, R1, R3, R10): lo que importa es que la clave no quede en los
 * bytes del fichero —ni en las páginas libres ni en el `-wal`—, y eso un doble
 * de Prisma no lo puede decir. Cada prueba crea su base en una carpeta
 * temporal; nunca se toca la base de trabajo.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { mkdtempSync, readFileSync, existsSync, rmSync, copyFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { ensureProductionSchema } from '../../../electron/esquemaProduccion'
import { activarWAL } from '../../../electron/baseSqlite'
import { migrarClaves } from './migracionClaves'
import { cifradorDePrueba } from './cifradorDePrueba'
import { configurarCifrador, leerClave, olvidarClavesDeSesion, SIN_CIFRADO } from './clavesProveedor'
import { DatabaseService, proveedorSinClave } from '../database.service'

const CLAVE_NVIDIA = 'nvapi-FAKEmigracion0123456789abcdefghij'
const CLAVE_OPENAI = 'sk-proj-FAKEmigracion0123456789abcdefghij'
const CLAVE_GUARDRAILS = 'nvapi-FAKEguardrails0123456789abcdefghij'

let plantilla: string
let dir: string
let url: string
let prisma: PrismaClient
const silencio = { warn: () => {}, info: () => {} }

function bytesDeLaBase(): string {
  return ['', '-wal', '-shm']
    .map(s => join(dir, `prueba.db${s}`))
    .filter(existsSync)
    .map(f => readFileSync(f).toString('latin1'))
    .join('\n')
}

async function proveedor(name: string, apiKey: string | null) {
  return prisma.aIProvider.create({ data: { name, type: 'api', apiKey, isActive: true } })
}

// El esquema se crea una vez y cada prueba parte de una copia: crearlo son segundos.
beforeAll(async () => {
  plantilla = mkdtempSync(join(tmpdir(), 'boorie-claves-plantilla-'))
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
  dir = mkdtempSync(join(tmpdir(), 'boorie-claves-'))
  copyFileSync(join(plantilla, 'vacia.db'), join(dir, 'prueba.db'))
  // Una sola conexión: el `wal_checkpoint(TRUNCATE)` del final espera a las demás
  // del pool hasta el `busy_timeout` (5 s) y en un CI cargado tumbaba la prueba.
  url = `file:${join(dir, 'prueba.db')}?connection_limit=1`
  prisma = new PrismaClient({ datasources: { db: { url } } })
  await prisma.$connect()
  await activarWAL(prisma, url)
})

afterEach(async () => {
  configurarCifrador(SIN_CIFRADO)
  olvidarClavesDeSesion()
  await prisma.$disconnect()
  rmSync(dir, { recursive: true, force: true })
})

describe('las claves en claro de una versión anterior (R3)', () => {
  it('quedan cifradas, se leen igual y no queda rastro en el fichero', async () => {
    // Como en la versión anterior: la clave se escribía letra a letra al teclearla.
    const nvidia = await proveedor('nvidia', '')
    for (let i = 8; i <= CLAVE_NVIDIA.length; i += 6) {
      await prisma.aIProvider.update({ where: { id: nvidia.id }, data: { apiKey: CLAVE_NVIDIA.slice(0, i) } })
    }
    await prisma.aIProvider.update({ where: { id: nvidia.id }, data: { apiKey: CLAVE_NVIDIA } })
    await proveedor('OpenAI', CLAVE_OPENAI)
    await proveedor('ollama', '')
    expect(bytesDeLaBase()).toContain(CLAVE_NVIDIA)

    const c = cifradorDePrueba()
    const r = await migrarClaves(prisma as never, c, silencio)

    expect(r.cifradas).toBe(2)
    const filas = await prisma.aIProvider.findMany()
    expect(leerClave(filas.find(f => f.name === 'nvidia')!.apiKey, c).clave).toBe(CLAVE_NVIDIA)
    expect(leerClave(filas.find(f => f.name === 'OpenAI')!.apiKey, c).clave).toBe(CLAVE_OPENAI)
    expect(filas.find(f => f.name === 'ollama')!.apiKey).toBe('')

    const bytes = bytesDeLaBase()
    expect(bytes).not.toContain(CLAVE_NVIDIA)
    expect(bytes).not.toContain(CLAVE_OPENAI)
  })

  it('una segunda pasada no cambia nada', async () => {
    await proveedor('nvidia', CLAVE_NVIDIA)
    const c = cifradorDePrueba()
    await migrarClaves(prisma as never, c, silencio)
    const antes = (await prisma.aIProvider.findFirst({ where: { name: 'nvidia' } }))!.apiKey

    const r = await migrarClaves(prisma as never, c, silencio)

    expect(r).toEqual({ cifradas: 0, guardrailsMovida: false, guardrailsDescartada: false })
    expect((await prisma.aIProvider.findFirst({ where: { name: 'nvidia' } }))!.apiKey).toBe(antes)
  })

  it('sin llavero las deja como estaban, y se cifran en cuanto lo hay', async () => {
    await proveedor('nvidia', CLAVE_NVIDIA)

    expect((await migrarClaves(prisma as never, SIN_CIFRADO, silencio)).cifradas).toBe(0)
    expect((await prisma.aIProvider.findFirst({ where: { name: 'nvidia' } }))!.apiKey).toBe(CLAVE_NVIDIA)

    expect((await migrarClaves(prisma as never, cifradorDePrueba(), silencio)).cifradas).toBe(1)
  })

  it('lo guardado sin cifrar a petición del usuario también se cifra cuando hay llavero', async () => {
    await proveedor('nvidia', `plano:v1:${CLAVE_NVIDIA}`)
    const c = cifradorDePrueba()
    await migrarClaves(prisma as never, c, silencio)
    const fila = (await prisma.aIProvider.findFirst({ where: { name: 'nvidia' } }))!
    expect(fila.apiKey!.startsWith('enc:v1:')).toBe(true)
    expect(leerClave(fila.apiKey, c).clave).toBe(CLAVE_NVIDIA)
  })

  it('una clave cifrada en otro equipo no se toca', async () => {
    const ajena = 'enc:v1:' + cifradorDePrueba('equipo-b').cifrar(CLAVE_NVIDIA).toString('base64')
    await proveedor('nvidia', ajena)
    await migrarClaves(prisma as never, cifradorDePrueba('equipo-a'), silencio)
    expect((await prisma.aIProvider.findFirst({ where: { name: 'nvidia' } }))!.apiKey).toBe(ajena)
  })
})

describe('una sola clave de NVIDIA (R10, D4)', () => {
  const ajustes = (extra: object) => prisma.appSetting.create({
    data: { key: 'guardrails_settings', value: JSON.stringify({ judgeProvider: 'nvidia-api', judgeModel: 'm', ...extra }), category: 'guardrails' },
  })
  const leerAjustes = async () => JSON.parse((await prisma.appSetting.findUnique({ where: { key: 'guardrails_settings' } }))!.value)

  it('si el proveedor no tiene, la de guardrails pasa al proveedor', async () => {
    await proveedor('nvidia', '')
    await ajustes({ nvidiaApiKey: CLAVE_GUARDRAILS })
    const c = cifradorDePrueba()

    const r = await migrarClaves(prisma as never, c, silencio)

    expect(r.guardrailsMovida).toBe(true)
    expect(leerClave((await prisma.aIProvider.findFirst({ where: { name: 'nvidia' } }))!.apiKey, c).clave).toBe(CLAVE_GUARDRAILS)
    expect(await leerAjustes()).toEqual({ judgeProvider: 'nvidia-api', judgeModel: 'm' })
    expect(bytesDeLaBase()).not.toContain(CLAVE_GUARDRAILS)
  })

  it('si los dos tienen, se queda la del proveedor y se avisa sin el valor', async () => {
    await proveedor('nvidia', CLAVE_NVIDIA)
    await ajustes({ nvidiaApiKey: CLAVE_GUARDRAILS })
    const avisos: string[] = []
    const c = cifradorDePrueba()

    const r = await migrarClaves(prisma as never, c, { warn: m => avisos.push(m), info: () => {} })

    expect(r.guardrailsDescartada).toBe(true)
    expect(leerClave((await prisma.aIProvider.findFirst({ where: { name: 'nvidia' } }))!.apiKey, c).clave).toBe(CLAVE_NVIDIA)
    expect((await leerAjustes()).nvidiaApiKey).toBeUndefined()
    expect(avisos).toHaveLength(1)
    expect(avisos.join()).not.toContain('nvapi-')
    expect(bytesDeLaBase()).not.toContain(CLAVE_GUARDRAILS)
  })

  it('un campo vacío se quita sin más', async () => {
    await proveedor('nvidia', '')
    await ajustes({ nvidiaApiKey: '' })
    await migrarClaves(prisma as never, cifradorDePrueba(), silencio)
    expect(await leerAjustes()).toEqual({ judgeProvider: 'nvidia-api', judgeModel: 'm' })
  })
})

describe('guardar una clave desde Configuración (R1, R2)', () => {
  it('en el fichero no aparece, y el proceso principal la lee', async () => {
    const c = cifradorDePrueba()
    configurarCifrador(c)
    const fila = await proveedor('nvidia', '')
    const db = new DatabaseService(prisma)

    await db.escribirClave(fila.id, CLAVE_NVIDIA)

    expect(bytesDeLaBase()).not.toContain(CLAVE_NVIDIA)
    expect(await db.claveDeProveedor('NVIDIA')).toBe(CLAVE_NVIDIA)
    const { data } = await db.getAIProviders()
    expect(data[0].apiKey).toBe(CLAVE_NVIDIA)
    expect(JSON.stringify(proveedorSinClave({ name: 'nvidia', apiKey: (await prisma.aIProvider.findFirst())!.apiKey }))).not.toContain(CLAVE_NVIDIA)
  })

  it('la interfaz recibe el estado de lo guardado, no el de la clave ya descifrada', async () => {
    configurarCifrador(cifradorDePrueba())
    const cifrada = await proveedor('nvidia', '')
    const db = new DatabaseService(prisma)
    await db.escribirClave(cifrada.id, CLAVE_NVIDIA)
    await proveedor('openai', 'enc:v1:' + cifradorDePrueba('equipo-b').cifrar(CLAVE_OPENAI).toString('base64'))

    const { data } = await db.getAIProviders()
    const publicos = data.map(proveedorSinClave)

    expect(publicos.find(p => p.name === 'nvidia')).toMatchObject({ tieneClave: true, estadoClave: 'ok' })
    expect(publicos.find(p => p.name === 'openai')).toMatchObject({ tieneClave: false, estadoClave: 'ilegible' })
    expect(JSON.stringify(publicos)).not.toContain(CLAVE_NVIDIA)
  })

  it('al cambiarla, la anterior tampoco queda', async () => {
    configurarCifrador(cifradorDePrueba())
    const fila = await proveedor('nvidia', CLAVE_NVIDIA)
    const db = new DatabaseService(prisma)

    await db.escribirClave(fila.id, CLAVE_GUARDRAILS)

    expect(bytesDeLaBase()).not.toContain(CLAVE_NVIDIA)
    expect(await db.claveDeProveedor('nvidia')).toBe(CLAVE_GUARDRAILS)
  })

  it('sin llavero no se escribe: queda para la sesión, y la vieja en claro se borra', async () => {
    configurarCifrador(SIN_CIFRADO)
    const fila = await proveedor('nvidia', CLAVE_NVIDIA)
    const db = new DatabaseService(prisma)

    await db.escribirClave(fila.id, CLAVE_GUARDRAILS)

    expect((await prisma.aIProvider.findFirst())!.apiKey).toBe('')
    expect(bytesDeLaBase()).not.toContain(CLAVE_NVIDIA)
    expect(bytesDeLaBase()).not.toContain(CLAVE_GUARDRAILS)
    expect(await db.claveDeProveedor('nvidia')).toBe(CLAVE_GUARDRAILS)
    expect((await db.getAIProviders()).data[0].estadoClave).toBe('sesion')
  })

  it('sin llavero y pidiéndolo, se guarda sin cifrar y se dice', async () => {
    configurarCifrador(SIN_CIFRADO)
    const fila = await proveedor('nvidia', '')
    const db = new DatabaseService(prisma)

    await db.escribirClave(fila.id, CLAVE_NVIDIA, {}, { permitirSinCifrar: true })

    expect((await prisma.aIProvider.findFirst())!.apiKey).toBe(`plano:v1:${CLAVE_NVIDIA}`)
    expect((await db.getAIProviders()).data[0].estadoClave).toBe('sinCifrado')
  })
})
