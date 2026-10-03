import { describe, it, expect, vi } from 'vitest'
import { probarClaveExterna, MENSAJES_PRUEBA, rechazaLaClave, tienePrueba } from './pruebaProveedores'

const json = (status: number, cuerpo: unknown) => new Response(JSON.stringify(cuerpo), { status })

/** Un `fetch` que responde por URL y anota qué se le pidió. */
function api(responder: (url: string) => Response) {
  return vi.fn(async (url: string | URL | Request) => responder(String(url))) as unknown as typeof fetch & ReturnType<typeof vi.fn>
}

const LISTAS: Record<string, unknown> = {
  anthropic: { data: [{ id: 'claude-a', display_name: 'Claude A', type: 'model' }, { id: 'claude-b', display_name: 'Claude B', type: 'model' }], has_more: false },
  openai: { data: [{ id: 'gpt-x' }, { id: 'text-embedding-3-small' }, { id: 'whisper-1' }, { id: 'o-y' }] },
  google: { models: [
    { name: 'models/gemini-x', displayName: 'Gemini X', supportedGenerationMethods: ['generateContent', 'countTokens'] },
    { name: 'models/text-embedding-004', displayName: 'Embedding', supportedGenerationMethods: ['embedContent'] },
  ] },
  openrouter: { data: [{ id: 'vendor/modelo', name: 'Vendor: Modelo' }] },
}

describe.each(['anthropic', 'openai', 'google', 'openrouter'] as const)('«Probar» con %s', proveedor => {
  it('con la clave aceptada, la lista de modelos sale de la API', async () => {
    const f = api(url => json(200, url.includes('/key') ? { data: { label: 'x' } } : LISTAS[proveedor]))
    const r = await probarClaveExterna(proveedor, 'clave-FAKE', f)
    expect(r.ok).toBe(true)
    expect(r.mensaje).toBeUndefined()
    expect(r.modelos.length).toBeGreaterThan(0)
  })

  it.each([401, 403])('un %i es una clave no válida, y apaga el proveedor', async status => {
    const r = await probarClaveExterna(proveedor, 'mala', api(() => json(status, { error: { message: 'invalid' } })))
    expect(r).toEqual({ ok: false, mensaje: MENSAJES_PRUEBA.claveNoValida, modelos: [] })
    expect(rechazaLaClave(r.mensaje)).toBe(true)
  })

  it.each([402, 429])('un %i es crédito o límite agotado, que no apaga', async status => {
    const r = await probarClaveExterna(proveedor, 'k', api(() => json(status, {})))
    expect(r).toMatchObject({ ok: false, mensaje: MENSAJES_PRUEBA.sinCredito })
    expect(rechazaLaClave(r.mensaje)).toBe(false)
  })

  it.each([500, 503, 529])('un %i es el servicio caído, no la clave', async status => {
    const r = await probarClaveExterna(proveedor, 'k', api(() => json(status, {})))
    expect(r).toMatchObject({ ok: false, mensaje: MENSAJES_PRUEBA.noDisponible })
  })

  it('sin red, lo dice', async () => {
    const f = vi.fn(async () => { throw new TypeError('fetch failed') }) as unknown as typeof fetch
    const r = await probarClaveExterna(proveedor, 'k', f)
    expect(r).toMatchObject({ ok: false, mensaje: MENSAJES_PRUEBA.sinRed })
  })

  it('una lista vacía no da por buena la clave', async () => {
    const vacia = proveedor === 'google' ? { models: [] } : { data: [] }
    const r = await probarClaveExterna(proveedor, 'k', api(url => json(200, url.includes('/key') ? {} : vacia)))
    expect(r).toMatchObject({ ok: false, mensaje: MENSAJES_PRUEBA.sinModelos })
  })
})

describe('lo propio de cada API', () => {
  it('Anthropic: GET /v1/models con x-api-key y anthropic-version, y el nombre que da la API', async () => {
    const f = api(() => json(200, LISTAS.anthropic))
    const r = await probarClaveExterna('anthropic', 'sk-ant-FAKE', f)
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('https://api.anthropic.com/v1/models?limit=1000')
    expect(init.headers).toMatchObject({ 'x-api-key': 'sk-ant-FAKE', 'anthropic-version': '2023-06-01' })
    expect(r.modelos).toEqual([
      { modelId: 'claude-a', modelName: 'Claude A', description: '' },
      { modelId: 'claude-b', modelName: 'Claude B', description: '' },
    ])
  })

  it('OpenAI: deja fuera los modelos que no conversan', async () => {
    const r = await probarClaveExterna('openai', 'k', api(() => json(200, LISTAS.openai)))
    expect(r.modelos.map(m => m.modelId)).toEqual(['gpt-x', 'o-y'])
  })

  it('Google: una clave mala es un 400 API_KEY_INVALID, y la clave va en cabecera', async () => {
    const f = api(() => json(400, { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }] } }))
    const r = await probarClaveExterna('google', 'mala', f)
    expect(r.mensaje).toBe(MENSAJES_PRUEBA.claveNoValida)
    expect(String(f.mock.calls[0][0])).not.toContain('key=')
    expect(f.mock.calls[0][1].headers).toMatchObject({ 'x-goog-api-key': 'mala' })
  })

  it('Google: sólo los que generan contenido', async () => {
    const r = await probarClaveExterna('google', 'k', api(() => json(200, LISTAS.google)))
    expect(r.modelos.map(m => m.modelId)).toEqual(['gemini-x'])
  })

  it('OpenRouter: la clave se comprueba contra /key, porque /models responde sin clave', async () => {
    const f = api(url => url.endsWith('/key') ? json(401, { error: { message: 'No auth credentials found', code: 401 } }) : json(200, LISTAS.openrouter))
    const r = await probarClaveExterna('openrouter', 'sk-or-mala', f)
    expect(r.mensaje).toBe(MENSAJES_PRUEBA.claveNoValida)
    expect(f).toHaveBeenCalledTimes(1)
    expect(String(f.mock.calls[0][0])).toBe('https://openrouter.ai/api/v1/key')
  })

  it('NVIDIA no está aquí: tiene su propia prueba', () => {
    expect(tienePrueba('nvidia')).toBe(false)
    expect(tienePrueba('Anthropic')).toBe(true)
  })
})
