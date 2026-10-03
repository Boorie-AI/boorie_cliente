import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * La clave no sale del proceso principal ni aparece en los logs (#225, D2, R11).
 */

const handlers: Record<string, (evento: unknown, ...args: any[]) => Promise<any>> = {}

vi.mock('electron', () => ({
  ipcMain: {
    handle: (canal: string, fn: any) => { handlers[canal] = fn },
    removeAllListeners: () => {},
  },
}))

import { AIProviderHandler } from './aiProvider.handler'
import { AIProviderService } from '../../backend/services/aiProvider.service'
import { configurarCifrador, olvidarClavesDeSesion, SIN_CIFRADO, valorParaGuardar } from '../../backend/services/security/clavesProveedor'
import { cifradorDePrueba } from '../../backend/services/security/cifradorDePrueba'

const CLAVE = 'nvapi-FAKElogs0123456789abcdefghijklmnop'

let escrito: string[]

function capturarConsola() {
  escrito = []
  for (const metodo of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, metodo).mockImplementation((...args: unknown[]) => {
      escrito.push(args.map(a => (typeof a === 'string' ? a : JSON.stringify(a, Object.getOwnPropertyNames(a ?? {})))).join(' '))
    })
  }
}

beforeEach(() => {
  configurarCifrador(cifradorDePrueba())
  capturarConsola()
})

afterEach(() => {
  vi.restoreAllMocks()
  configurarCifrador(SIN_CIFRADO)
  olvidarClavesDeSesion()
})

describe('lo que devuelve el canal de proveedores', () => {
  const fila = () => ({ id: 'p1', name: 'nvidia', type: 'api', apiKey: CLAVE, isActive: true, isConnected: false })

  function conServicio(servicio: Partial<AIProviderService>) {
    new AIProviderHandler(servicio as AIProviderService)
  }

  it('la lista no lleva la clave, sólo su estado y los cuatro últimos', async () => {
    conServicio({ getAllProviders: async () => ({ success: true, data: [fila() as never] }) })
    const lista = await handlers['db-get-ai-providers'](null)
    expect(JSON.stringify(lista)).not.toContain(CLAVE)
    expect(lista[0]).toMatchObject({ name: 'nvidia', tieneClave: true, finClave: 'mnop' })
    expect('apiKey' in lista[0]).toBe(false)
  })

  it('la clave que llegue por el canal genérico se ignora: sólo entra por guardarClave', async () => {
    const updateProvider = vi.fn(async () => ({ success: true, data: fila() as never }))
    conServicio({ updateProvider })
    const r = await handlers['db-update-ai-provider'](null, 'p1', { apiKey: CLAVE, isActive: true })
    expect(updateProvider).toHaveBeenCalledWith('p1', { isActive: true })
    expect(JSON.stringify(r)).not.toContain(CLAVE)
  })

  it('guardar una clave devuelve su estado, no la clave', async () => {
    const guardarClave = vi.fn(async () => ({ success: true, data: { tieneClave: true, estadoClave: 'ok' as const, finClave: 'mnop' } }))
    conServicio({ guardarClave })
    const r = await handlers['ai-provider:guardarClave'](null, 'p1', CLAVE)
    expect(guardarClave).toHaveBeenCalledWith('p1', CLAVE, { permitirSinCifrar: false })
    expect(JSON.stringify(r)).not.toContain(CLAVE)
  })

  it('ni los errores de crear o actualizar escriben la clave en el log', async () => {
    const roto = {
      getAIProviders: async () => ({ success: true, data: [{ id: 'p1', name: 'nvidia' }] }),
      createAIProvider: async () => ({ success: false, error: 'boom' }),
      updateAIProvider: async () => ({ success: false, error: 'boom' }),
      escribirClave: async () => { throw new Error('boom') },
    }
    const servicio = new AIProviderService(roto as never)
    conServicio(servicio)

    await handlers['db-save-ai-provider'](null, { name: 'otro', type: 'api', apiKey: CLAVE, isActive: true, isConnected: false })
    await handlers['db-update-ai-provider'](null, 'p1', { apiKey: CLAVE, isActive: true })
    await servicio.createProvider({ name: 'otro', type: 'api', apiKey: CLAVE, isActive: true, isConnected: false })
    await servicio.updateProvider('p1', { apiKey: CLAVE })
    await servicio.guardarClave('p1', CLAVE)

    expect(escrito.length).toBeGreaterThan(0)
    expect(escrito.join('\n')).not.toContain(CLAVE)
  })
})

describe('el estado de una clave según dónde está', () => {
  it('cifrada, de otro equipo o heredada en claro', async () => {
    const c = cifradorDePrueba()
    new AIProviderHandler({
      getAllProviders: async () => ({
        success: true,
        data: [
          { id: '1', name: 'nvidia', apiKey: valorParaGuardar(CLAVE, { cifrador: c }) },
          { id: '2', name: 'openai', apiKey: valorParaGuardar(CLAVE, { cifrador: cifradorDePrueba('otro') }) },
          { id: '3', name: 'anthropic', apiKey: 'sk-ant-FAKEheredada0123456789abcdef' },
        ] as never,
      }),
    } as never)
    const lista = await handlers['db-get-ai-providers'](null)
    expect(lista.map((p: any) => p.estadoClave)).toEqual(['ok', 'ilegible', 'sinCifrado'])
  })
})
