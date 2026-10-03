import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * La puerta de la nube en el proceso principal (#225, R6, R7, R17): sin
 * consentimiento para el proveedor no sale nada, ni la respuesta ni la
 * revisión contra el documento, aunque la interfaz lo pida.
 */

const handlers: Record<string, (evento: unknown, params: any) => Promise<any>> = {}

vi.mock('electron', () => ({
  ipcMain: {
    handle: (canal: string, fn: any) => { handlers[canal] = fn },
    removeAllListeners: () => {},
  },
}))
vi.mock('../../backend/services/contextoDeOllama', () => ({ contextoDeOllama: async () => 8192 }))

import { ChatHandler, SIN_CLAVE } from './chat.handler'
import {
  aceptarConsentimiento,
  cargarConsentimientos,
  hayConsentimiento,
  retirarConsentimiento,
  SIN_CONSENTIMIENTO,
} from '../../backend/services/security/consentimientoNube'

const CLAVE = 'nvapi-FAKEconsentimiento0123456789abcd'

function ajustes() {
  const filas = new Map<string, string>()
  return {
    findUnique: async ({ where }: { where: { key: string } }) => (filas.has(where.key) ? { value: filas.get(where.key)! } : null),
    upsert: async ({ where, create, update }: any) => { filas.set(where.key, filas.has(where.key) ? update.value : create.value) },
  }
}

let fetchSimulado: ReturnType<typeof vi.fn>
let prisma: { appSetting: ReturnType<typeof ajustes> }
let claveDeProveedor: ReturnType<typeof vi.fn>

const respuestaNvidia = {
  ok: true,
  status: 200,
  json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: 'Hola' } }], usage: {} }),
  body: {
    getReader: () => {
      const cola = [
        `data: ${JSON.stringify({ choices: [{ delta: { content: 'Hola' } }] })}\n\n`,
        `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`,
        'data: [DONE]\n\n',
      ].map(t => new TextEncoder().encode(t))
      return { read: async () => (cola.length ? { done: false, value: cola.shift() } : { done: true, value: undefined }) }
    },
  },
}

const enviar = (provider: string, extra: object = {}) =>
  handlers['chat:send-message'](null, { provider, model: 'm', messages: [{ role: 'user', content: 'documento del cliente' }], ...extra })

beforeEach(async () => {
  fetchSimulado = vi.fn().mockResolvedValue(respuestaNvidia)
  vi.stubGlobal('fetch', fetchSimulado)
  prisma = { appSetting: ajustes() }
  await cargarConsentimientos(prisma as never)
  claveDeProveedor = vi.fn().mockResolvedValue(CLAVE)
  new ChatHandler({
    claveDeProveedor,
    prisma: {
      appSetting: { findUnique: async () => null },
      aIProvider: { findMany: async () => [] },
      hydraulicNetwork: { findFirst: async () => null },
    },
  } as never)
})

afterEach(() => vi.unstubAllGlobals())

describe('sin consentimiento no sale nada', () => {
  it('a un proveedor externo devuelve SIN_CONSENTIMIENTO sin llamar a la API ni leer la clave', async () => {
    const r = await enviar('nvidia')
    expect(r).toEqual({ success: false, error: SIN_CONSENTIMIENTO })
    expect(fetchSimulado).not.toHaveBeenCalled()
    expect(claveDeProveedor).not.toHaveBeenCalled()
  })

  it('tampoco la revisión contra el documento, que va por el mismo canal', async () => {
    const r = await enviar('nvidia', { sinRazonar: true, messages: [{ role: 'user', content: 'revisa esto contra lo leído' }] })
    expect(r.error).toBe(SIN_CONSENTIMIENTO)
    expect(fetchSimulado).not.toHaveBeenCalled()
  })

  it('el consentimiento de un proveedor no vale para otro', async () => {
    await aceptarConsentimiento(prisma as never, 'nvidia')
    expect((await enviar('anthropic')).error).toBe(SIN_CONSENTIMIENTO)
  })
})

describe('con consentimiento', () => {
  it('sale con la clave que busca el proceso principal, no con una que traiga el mensaje', async () => {
    await aceptarConsentimiento(prisma as never, 'NVIDIA')
    const r = await enviar('nvidia', { apiKey: 'nvapi-FAKEdelrenderer000000000000000' })
    expect(r.success).toBe(true)
    expect(claveDeProveedor).toHaveBeenCalledWith('nvidia')
    expect(fetchSimulado.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${CLAVE}`)
  })

  it('al retirarlo, la siguiente pregunta ya no sale (R7)', async () => {
    await aceptarConsentimiento(prisma as never, 'nvidia')
    await retirarConsentimiento(prisma as never, 'nvidia')
    expect((await enviar('nvidia')).error).toBe(SIN_CONSENTIMIENTO)
    expect(fetchSimulado).not.toHaveBeenCalled()
  })

  it('sin clave legible no se llama a la API', async () => {
    await aceptarConsentimiento(prisma as never, 'nvidia')
    claveDeProveedor.mockResolvedValue(null)
    expect((await enviar('nvidia')).error).toBe(SIN_CLAVE)
    expect(fetchSimulado).not.toHaveBeenCalled()
  })
})

describe.each(['anthropic', 'openai', 'google', 'openrouter'])('%s pasa por la misma puerta que NVIDIA (#246)', proveedor => {
  it('sin consentimiento no sale nada ni se lee la clave', async () => {
    expect(await enviar(proveedor)).toEqual({ success: false, error: SIN_CONSENTIMIENTO })
    expect(fetchSimulado).not.toHaveBeenCalled()
    expect(claveDeProveedor).not.toHaveBeenCalled()
  })

  it('con consentimiento sale con la clave del proceso principal', async () => {
    await aceptarConsentimiento(prisma as never, proveedor)
    await enviar(proveedor)
    expect(claveDeProveedor).toHaveBeenCalledWith(proveedor)
    expect(fetchSimulado).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(fetchSimulado.mock.calls[0][1].headers)).toContain(CLAVE)
  })

  it('al retirarlo, la siguiente pregunta ya no sale', async () => {
    await aceptarConsentimiento(prisma as never, proveedor)
    await retirarConsentimiento(prisma as never, proveedor)
    expect((await enviar(proveedor)).error).toBe(SIN_CONSENTIMIENTO)
    expect(fetchSimulado).not.toHaveBeenCalled()
  })

  it('sin clave utilizable —o con el proveedor apagado— no se llama a la API', async () => {
    await aceptarConsentimiento(prisma as never, proveedor)
    claveDeProveedor.mockResolvedValue(null)
    expect((await enviar(proveedor)).error).toBe(SIN_CLAVE)
    expect(fetchSimulado).not.toHaveBeenCalled()
  })
})

describe('lo local no necesita permiso', () => {
  it('Ollama no pide consentimiento ni clave', () => {
    expect(hayConsentimiento('Ollama')).toBe(true)
  })
})
