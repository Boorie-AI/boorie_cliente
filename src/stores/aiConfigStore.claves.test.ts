import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAIConfigStore } from './aiConfigStore'

/** La interfaz no recibe ni guarda la clave (#225, D2): sólo su estado. */
describe('las claves en el almacén de proveedores', () => {
  beforeEach(() => {
    const api = window.electronAPI as any
    api.database.getAIProviders = vi.fn().mockResolvedValue([
      { id: 'db-1', name: 'nvidia', type: 'api', isActive: true, isConnected: false, tieneClave: true, estadoClave: 'ok', finClave: 'mnop' },
    ])
    api.database.getAIModels = vi.fn().mockResolvedValue([])
    api.database.guardarClaveProveedor = vi.fn().mockResolvedValue({ success: true, data: { tieneClave: true, estadoClave: 'sesion', finClave: 'wxyz' } })
    api.database.updateAIProvider = vi.fn().mockResolvedValue({})
  })

  it('carga el estado, no la clave', async () => {
    await useAIConfigStore.getState().loadProviders()
    const p = useAIConfigStore.getState().providers[0]
    expect(p).toMatchObject({ id: 'nvidia', tieneClave: true, estadoClave: 'ok', finClave: 'mnop' })
    expect('apiKey' in p).toBe(false)
  })

  it('guardar una clave va por su canal y se queda con el estado que devuelve', async () => {
    await useAIConfigStore.getState().loadProviders()
    const ok = await useAIConfigStore.getState().updateAPIKey('nvidia', 'nvapi-FAKEstore0123456789abcdefghijk', { permitirSinCifrar: false })

    expect(ok).toBe(true)
    const api = window.electronAPI as any
    expect(api.database.guardarClaveProveedor).toHaveBeenCalledWith('db-1', 'nvapi-FAKEstore0123456789abcdefghijk', { permitirSinCifrar: false })
    expect(api.database.updateAIProvider).not.toHaveBeenCalled()
    expect(useAIConfigStore.getState().providers[0]).toMatchObject({ estadoClave: 'sesion', finClave: 'wxyz', testStatus: 'idle' })
    expect(JSON.stringify(useAIConfigStore.getState().providers)).not.toContain('nvapi-FAKEstore')
  })
})
