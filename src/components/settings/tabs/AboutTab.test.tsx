import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { AboutTab } from './AboutTab'

// El componente importa CHANGELOG.md con `?raw`; se sustituye por un contenido
// controlado para que el test no dependa del changelog real del repositorio (la
// coherencia de ése ya la cubre changelog.test.ts).
vi.mock('../../../../CHANGELOG.md?raw', () => ({
  default: `
## [9.9.9] - 2026-08-08

Resumen de la versión más reciente.

- Detalle destacado

## [9.9.8] - 2026-07-01

Resumen de la versión anterior.
`,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { language: 'es' },
  }),
}))

/** Sustituye el IPC de versión por uno controlado y devuelve el espía. */
function mockVersion(resultado: Promise<string>) {
  const getAppVersion = vi.fn().mockReturnValue(resultado)
  Object.defineProperty(window, 'electronAPI', { value: { getAppVersion }, writable: true })
  return getAppVersion
}

describe('AboutTab', () => {
  beforeEach(() => {
    vi.stubGlobal('__BUILD_DATE__', '2026-08-08T10:00:00.000Z')
    mockVersion(Promise.resolve('9.9.9'))
  })

  it('muestra la versión que informa la aplicación, no una constante', async () => {
    render(<AboutTab />)
    await waitFor(() => expect(screen.getByText('9.9.9')).toBeTruthy())
    expect(window.electronAPI.getAppVersion).toHaveBeenCalled()
  })

  it('lista el historial en el orden del changelog, con la más reciente primero', async () => {
    render(<AboutTab />)
    const versiones = (await screen.findAllByText(/^v9\.9\.\d$/)).map((e) => e.textContent)
    expect(versiones).toEqual(['v9.9.9', 'v9.9.8'])
  })

  it('muestra resumen y detalles de cada entrada', async () => {
    render(<AboutTab />)
    expect(await screen.findByText('Resumen de la versión más reciente.')).toBeTruthy()
    expect(screen.getByText('Detalle destacado')).toBeTruthy()
  })

  it('marca la versión instalada como candidata cuando lleva sufijo', async () => {
    mockVersion(Promise.resolve('9.9.9-rc.2'))
    render(<AboutTab />)
    await waitFor(() => expect(screen.getByText('9.9.9-rc.2')).toBeTruthy())
    expect(screen.getByText('settings.about.channelPrerelease')).toBeTruthy()
  })

  it('avisa cuando el historial no cubre la versión instalada', async () => {
    mockVersion(Promise.resolve('7.0.0'))
    render(<AboutTab />)
    expect(await screen.findByText('settings.about.outOfSync')).toBeTruthy()
  })

  it('no revienta si la versión no se puede obtener', async () => {
    mockVersion(Promise.reject(new Error('sin IPC')))
    render(<AboutTab />)
    expect(await screen.findByText('v9.9.9')).toBeTruthy()
  })
})
