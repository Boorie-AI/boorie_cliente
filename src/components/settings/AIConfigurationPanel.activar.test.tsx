import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { AIConfigurationPanel } from './AIConfigurationPanel'
import { motivoParaNoActivar, useAIConfigStore } from '@/stores/aiConfigStore'

/**
 * Un proveedor externo no se puede encender sin una clave que «Probar» haya
 * aceptado (#246), y la interfaz lo explica en vez de dejar un interruptor
 * mudo. La misma regla la aplica el proceso principal.
 */

const fila = (o: object) => ({ type: 'api', isActive: false, isConnected: false, tieneClave: false, estadoClave: null, finClave: null, lastTestResult: null, lastTestMessage: null, ...o })

let filas: any[]

beforeEach(() => {
  const api = window.electronAPI as any
  filas = [
    fila({ id: 'db-anthropic', name: 'anthropic' }),
    fila({ id: 'db-openai', name: 'openai', tieneClave: true, estadoClave: 'ok', finClave: 'abcd' }),
    fila({ id: 'db-google', name: 'google', estadoClave: 'ilegible' }),
    fila({ id: 'db-nvidia', name: 'nvidia', isActive: true, isConnected: true, tieneClave: true, estadoClave: 'ok', finClave: 'wxyz', lastTestResult: 'success' }),
    fila({ id: 'db-ollama', name: 'ollama', type: 'local', isActive: true }),
  ]
  api.database.getAIProviders = vi.fn(async () => filas)
  api.database.getAIModels = vi.fn().mockResolvedValue([])
  api.database.updateAIProvider = vi.fn().mockResolvedValue({})
  api.database.estadoCifrado = vi.fn().mockResolvedValue({ disponible: true, plataforma: 'linux' })
  api.database.getSetting = vi.fn().mockResolvedValue(null)
  api.agenticRAG = { modelos: vi.fn().mockResolvedValue({ success: true, data: { backend: 'ollama', principal: 'm', auxiliar: 'm', modeloRespuesta: 'm', degradado: false, selectorVisible: false } }) }
  api.nube = { estado: vi.fn(async () => ({ version: 1, consentimientos: {} })) }
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('sin Ollama') }))
  useAIConfigStore.setState({ providers: [] })
})

async function abrirProveedoresAPI() {
  render(<AIConfigurationPanel />)
  const pestana = screen.getByRole('tab', { name: 'Proveedores de API' })
  fireEvent.mouseDown(pestana)
  fireEvent.click(pestana)
  await waitFor(() => expect(screen.getByRole('switch', { name: 'Activar anthropic' })).toBeInTheDocument())
}

describe('el interruptor de un proveedor externo', () => {
  it('sin clave está deshabilitado y explica qué falta', async () => {
    await abrirProveedoresAPI()
    const interruptor = screen.getByRole('switch', { name: 'Activar anthropic' })
    expect(interruptor).toBeDisabled()
    expect(interruptor).toHaveAttribute('aria-checked', 'false')
    expect(within(screen.getByTestId('motivo-anthropic')).getByText(/pega su clave y pulsa «Probar»/)).toBeInTheDocument()
  })

  it('con una clave sin probar, también, y pide probarla', async () => {
    await abrirProveedoresAPI()
    expect(screen.getByRole('switch', { name: 'Activar openai' })).toBeDisabled()
    expect(screen.getByTestId('motivo-openai')).toHaveTextContent('Pulsa «Probar»')
  })

  it('con una clave ilegible pide volver a pegarla', async () => {
    await abrirProveedoresAPI()
    expect(screen.getByRole('switch', { name: 'Activar google' })).toBeDisabled()
    expect(screen.getByTestId('motivo-google')).toHaveTextContent('no se puede leer en este equipo')
  })

  it('uno activo con la clave aceptada se puede apagar', async () => {
    await abrirProveedoresAPI()
    const interruptor = screen.getByRole('switch', { name: 'Activar nvidia' })
    expect(interruptor).toBeEnabled()
    fireEvent.click(interruptor)
    await waitFor(() => expect((window.electronAPI as any).database.updateAIProvider).toHaveBeenCalledWith('db-nvidia', expect.objectContaining({ isActive: false })))
  })

  it('el campo de la clave está aunque el proveedor esté apagado', async () => {
    await abrirProveedoresAPI()
    expect(screen.getAllByText('Clave API').length).toBeGreaterThanOrEqual(4)
  })

  it('una sola fila por proveedor: Configuración ya no crea «OpenAI» junto a «openai»', async () => {
    await abrirProveedoresAPI()
    expect((window.electronAPI as any).database.saveAIProvider).not.toHaveBeenCalled()
  })
})

describe('la regla en el almacén', () => {
  it('motivoParaNoActivar', () => {
    const base = { type: 'api' as const, tieneClave: true, estadoClave: 'ok' as const, testStatus: 'success' as const }
    expect(motivoParaNoActivar(base)).toBeNull()
    expect(motivoParaNoActivar({ ...base, type: 'local' as const, tieneClave: false })).toBeNull()
    expect(motivoParaNoActivar({ ...base, tieneClave: false, estadoClave: null })).toBe('ai.activar.sinClave')
    expect(motivoParaNoActivar({ ...base, testStatus: 'error' as const })).toBe('ai.activar.sinProbar')
    expect(motivoParaNoActivar({ ...base, estadoClave: 'ilegible' as const })).toBe('ai.activar.claveIlegible')
  })

  it('encender sin clave validada no llega al proceso principal', async () => {
    await useAIConfigStore.getState().loadProviders()
    await useAIConfigStore.getState().toggleProvider('openai', true)
    expect((window.electronAPI as any).database.updateAIProvider).not.toHaveBeenCalled()
  })

  it('pegar una clave nueva lo deja apagado hasta probarla', async () => {
    const api = window.electronAPI as any
    api.database.guardarClaveProveedor = vi.fn().mockResolvedValue({ success: true, data: { tieneClave: true, estadoClave: 'ok', finClave: 'zzzz' } })
    await useAIConfigStore.getState().loadProviders()
    await useAIConfigStore.getState().updateAPIKey('nvidia', 'nvapi-FAKEnueva0123456789abcdefghij')
    expect(useAIConfigStore.getState().providers.find(p => p.id === 'nvidia')).toMatchObject({ isActive: false, testStatus: 'idle' })
  })

  it('«Probar» relee el proveedor: si la clave vale, sale encendido', async () => {
    const api = window.electronAPI as any
    await useAIConfigStore.getState().loadProviders()
    api.database.testAIProvider = vi.fn(async () => {
      filas = filas.map(f => f.name === 'openai' ? { ...f, isActive: true, isConnected: true, lastTestResult: 'success' } : f)
      return { success: true, message: 'API provider connection successful' }
    })
    expect(await useAIConfigStore.getState().testProviderConnection('openai')).toBe(true)
    expect(useAIConfigStore.getState().providers.find(p => p.id === 'openai')).toMatchObject({ isActive: true, testStatus: 'success' })
  })

  it('«Probar» con una clave rechazada la deja apagada con el motivo', async () => {
    const api = window.electronAPI as any
    await useAIConfigStore.getState().loadProviders()
    api.database.testAIProvider = vi.fn().mockResolvedValue({ success: false, message: 'ai.prueba.claveNoValida' })
    expect(await useAIConfigStore.getState().testProviderConnection('openai')).toBe(false)
    expect(useAIConfigStore.getState().providers.find(p => p.id === 'openai')).toMatchObject({ isActive: false, testStatus: 'error', testMessage: 'ai.prueba.claveNoValida' })
  })
})
