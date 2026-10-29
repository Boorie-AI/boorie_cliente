import { describe, it, expect, vi } from 'vitest'
import { avisarDeVersionNueva } from './avisoVersionNueva'

function actualizador(comprobar: () => Promise<unknown> = async () => null) {
  let disponible: ((info: { version: string }) => void) | null = null
  return {
    autoDownload: true,
    on: vi.fn((_evento: string, escuchar: (info: { version: string }) => void) => { disponible = escuchar }),
    checkForUpdates: vi.fn(comprobar),
    hayVersion: (version: string) => disponible?.({ version }),
  }
}

describe('aviso de versión nueva en Mac (#310)', () => {
  it('comprueba sin descargar, y avisa con el enlace a la release', () => {
    const a = actualizador()
    const enviar = vi.fn()
    const pendiente = avisarDeVersionNueva(a, enviar, () => {})

    expect(a.autoDownload).toBe(false)
    expect(a.checkForUpdates).toHaveBeenCalledTimes(1)
    expect(pendiente()).toBeNull()

    a.hayVersion('1.52.0')
    const nueva = { version: '1.52.0', url: 'https://github.com/Boorie-AI/boorie_cliente/releases/tag/v1.52.0' }
    expect(enviar).toHaveBeenCalledWith(nueva)
    // Para el renderer que se monte después de la comprobación.
    expect(pendiente()).toEqual(nueva)
  })

  it('sin red, la comprobación falla sin romper el arranque', async () => {
    const error = new Error('net::ERR_INTERNET_DISCONNECTED')
    const avisarError = vi.fn()
    const pendiente = avisarDeVersionNueva(actualizador(async () => { throw error }), vi.fn(), avisarError)
    await vi.waitFor(() => expect(avisarError).toHaveBeenCalledWith(error))
    expect(pendiente()).toBeNull()
  })
})
