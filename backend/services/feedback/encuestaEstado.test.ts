import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { comprobarEncuesta, leerEstado, registrarEnvio } from './encuestaEstado'

let dir: string
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'encuesta-')) })

const respuesta = (issues: unknown[]) => ({ ok: true, json: async () => issues })

describe('¿está completada la encuesta? (#13)', () => {
  it('sin ningún envío hay que pedirla, sin preguntar a GitHub', async () => {
    const f = vi.fn()
    expect(await comprobarEncuesta(dir, f)).toEqual({ decision: 'pedir', noPublicada: false })
    expect(f).not.toHaveBeenCalled()
  })

  it('completada cuando un issue lleva la referencia de un envío, y ya no vuelve a consultar', async () => {
    registrarEnvio(dir, 'aaa', new Date('2026-11-09T10:00:00Z'))
    registrarEnvio(dir, 'bbb', new Date('2026-11-10T10:00:00Z'))
    const f = vi.fn(async () => respuesta([
      { number: 400, body: 'otra cosa' },
      { number: 401, body: 'x <!-- boorie-encuesta:aaa --> y', pull_request: {} },
      { number: 402, body: '### Nombre completo\n\n…\n\n<!-- boorie-encuesta:aaa -->' },
    ]))
    expect(await comprobarEncuesta(dir, f)).toEqual({ decision: 'completada', issue: 402 })
    const url = new URL(f.mock.calls[0][0] as string)
    expect(url.pathname).toBe('/repos/Boorie-AI/boorie_cliente/issues')
    expect(url.searchParams.get('since')).toBe('2026-11-08T10:00:00.000Z')
    expect(leerEstado(dir).issue).toBe(402)

    f.mockClear()
    expect(await comprobarEncuesta(dir, f)).toEqual({ decision: 'completada', issue: 402 })
    expect(f).not.toHaveBeenCalled()
  })

  it('si se abrió GitHub pero el issue no existe, hay que pedirla y avisar', async () => {
    registrarEnvio(dir, 'aaa')
    const f = vi.fn(async () => respuesta([{ number: 400, body: 'nada' }]))
    expect(await comprobarEncuesta(dir, f)).toEqual({ decision: 'pedir', noPublicada: true })
    expect(leerEstado(dir).completada).toBeUndefined()
  })

  it('sin conexión o con GitHub fallando no se sabe: se aplaza', async () => {
    registrarEnvio(dir, 'aaa')
    expect(await comprobarEncuesta(dir, vi.fn(async () => { throw new Error('offline') }))).toEqual({ decision: 'aplazar' })
    expect(await comprobarEncuesta(dir, vi.fn(async () => ({ ok: false, json: async () => ({}) })))).toEqual({ decision: 'aplazar' })
  })

  it('pasa de página si la primera viene llena', async () => {
    registrarEnvio(dir, 'aaa')
    const llena = Array.from({ length: 100 }, (_, i) => ({ number: i, body: '' }))
    const f = vi.fn()
      .mockResolvedValueOnce(respuesta(llena))
      .mockResolvedValueOnce(respuesta([{ number: 999, body: '<!-- boorie-encuesta:aaa -->' }]))
    expect(await comprobarEncuesta(dir, f)).toEqual({ decision: 'completada', issue: 999 })
    expect(new URL(f.mock.calls[1][0] as string).searchParams.get('page')).toBe('2')
  })
})
