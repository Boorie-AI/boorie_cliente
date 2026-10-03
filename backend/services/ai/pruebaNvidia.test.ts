import { describe, it, expect, vi } from 'vitest'
import { probarClaveNvidia, MENSAJES_NVIDIA, URL_NVIDIA } from './pruebaNvidia'

const PAREJA = { principal: 'nvidia/principal', auxiliar: 'nvidia/auxiliar' }

const respuesta = (status: number) => new Response(status === 200 ? '{"choices":[]}' : '{}', { status })

/** Un `fetch` que responde por modelo, y anota qué se le pidió. */
function api(porModelo: Record<string, number>) {
  return vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const { model } = JSON.parse(String(init?.body))
    return respuesta(porModelo[model])
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>
}

describe('probarClaveNvidia', () => {
  it('con acceso a los dos modelos, la clave vale y no hay nada que avisar', async () => {
    const f = api({ 'nvidia/principal': 200, 'nvidia/auxiliar': 200 })
    const r = await probarClaveNvidia('nvapi-x', PAREJA, f)
    expect(r).toEqual({ ok: true, modelos: { 'nvidia/principal': 'acceso', 'nvidia/auxiliar': 'acceso' } })
  })

  it('pide un solo token a /chat/completions con la clave como Bearer', async () => {
    const f = api({ 'nvidia/principal': 200, 'nvidia/auxiliar': 200 })
    await probarClaveNvidia('nvapi-x', PAREJA, f)
    const [url, init] = f.mock.calls[0]
    expect(url).toBe(`${URL_NVIDIA}/chat/completions`)
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer nvapi-x')
    expect(JSON.parse(init.body).max_tokens).toBe(1)
  })

  it.each([401, 403])('un %i es una clave no válida, y no se gasta una segunda petición', async status => {
    const f = api({ 'nvidia/principal': status, 'nvidia/auxiliar': status })
    const r = await probarClaveNvidia('mala', PAREJA, f)
    expect(r.ok).toBe(false)
    expect(r.mensaje).toBe(MENSAJES_NVIDIA.claveNoValida)
    expect(f).toHaveBeenCalledTimes(1)
  })

  it.each([402, 429])('un %i es crédito o límite agotado, no un error genérico', async status => {
    const r = await probarClaveNvidia('k', PAREJA, api({ 'nvidia/principal': status }))
    expect(r).toMatchObject({ ok: false, mensaje: MENSAJES_NVIDIA.sinCredito })
  })

  it('sin acceso al principal la clave vale, pero lo dice', async () => {
    const r = await probarClaveNvidia('k', PAREJA, api({ 'nvidia/principal': 404, 'nvidia/auxiliar': 200 }))
    expect(r).toEqual({
      ok: true,
      modelos: { 'nvidia/principal': 'sinAcceso', 'nvidia/auxiliar': 'acceso' },
      mensaje: MENSAJES_NVIDIA.sinPrincipal,
    })
  })

  it('sin acceso al auxiliar, lo mismo con el auxiliar', async () => {
    const r = await probarClaveNvidia('k', PAREJA, api({ 'nvidia/principal': 200, 'nvidia/auxiliar': 404 }))
    expect(r).toMatchObject({ ok: true, mensaje: MENSAJES_NVIDIA.sinAuxiliar })
  })

  it('sin acceso a ninguno, la prueba no pasa', async () => {
    const r = await probarClaveNvidia('k', PAREJA, api({ 'nvidia/principal': 404, 'nvidia/auxiliar': 400 }))
    expect(r).toMatchObject({ ok: false, mensaje: MENSAJES_NVIDIA.sinAccesoATodos })
  })

  it('un 5xx es el servicio caído, no la clave', async () => {
    const r = await probarClaveNvidia('k', PAREJA, api({ 'nvidia/principal': 503 }))
    expect(r).toMatchObject({ ok: false, mensaje: MENSAJES_NVIDIA.noDisponible })
  })

  it('sin red, lo dice', async () => {
    const f = vi.fn(async () => { throw new TypeError('fetch failed') }) as unknown as typeof fetch
    const r = await probarClaveNvidia('k', PAREJA, f)
    expect(r).toMatchObject({ ok: false, mensaje: MENSAJES_NVIDIA.sinRed })
  })

  it('con el mismo modelo en los dos papeles, una sola petición', async () => {
    const f = api({ 'nvidia/uno': 200 })
    const r = await probarClaveNvidia('k', { principal: 'nvidia/uno', auxiliar: 'nvidia/uno' }, f)
    expect(r.ok).toBe(true)
    expect(f).toHaveBeenCalledTimes(1)
  })
})
