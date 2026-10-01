import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { AboutTab } from './AboutTab'
import { useAyudaStore } from '@/stores/ayudaStore'

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

  describe('Ayuda y comentarios (#217)', () => {
    function mockFeedback(entorno: { so: string; python: string | null } | null) {
      const getEnvironment = vi.fn().mockResolvedValue(
        entorno ? { success: true, entorno: { ...entorno, version: '9.9.9', arquitectura: 'x64', venvGestionado: false, pantalla: 'settings:about', registro: [] } } : { success: false },
      )
      const snapshot = vi.fn().mockResolvedValue({ success: true })
      Object.defineProperty(window, 'electronAPI', {
        value: { getAppVersion: vi.fn().mockResolvedValue('9.9.9'), feedback: { getEnvironment, snapshot, discardSnapshot: vi.fn().mockResolvedValue({}) } },
        writable: true,
      })
      return getEnvironment
    }

    beforeEach(() => useAyudaStore.setState({ abierta: false, tipo: 'bug' }))

    it('muestra la tarjeta con los dos botones después de la versión (R1)', async () => {
      render(<AboutTab />)
      const titulo = screen.getByText('ayuda.tarjetaTitulo')
      const version = screen.getByText('settings.about.version')
      expect(version.compareDocumentPosition(titulo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(screen.getByRole('button', { name: /ayuda.reportar/ })).toBeTruthy()
      expect(screen.getByRole('button', { name: /ayuda.sugerir/ })).toBeTruthy()
    })

    it('cada botón abre el formulario en su modo', async () => {
      mockFeedback(null)
      render(<AboutTab />)
      fireEvent.click(screen.getByRole('button', { name: /ayuda.sugerir/ }))
      await waitFor(() => expect(useAyudaStore.getState()).toMatchObject({ abierta: true, tipo: 'mejora' }))
      useAyudaStore.setState({ abierta: false })
      fireEvent.click(screen.getByRole('button', { name: /ayuda.reportar/ }))
      await waitFor(() => expect(useAyudaStore.getState()).toMatchObject({ abierta: true, tipo: 'bug' }))
    })

    it('enseña la fila Entorno con el SO y el Python que informa el main (R30)', async () => {
      const getEnvironment = mockFeedback({ so: 'Windows 10.0.22631', python: 'Python 3.13.12' })
      render(<AboutTab />)
      await waitFor(() => expect(screen.getByTestId('entorno').textContent).toBe('Windows 10.0.22631 · Python 3.13.12'))
      expect(getEnvironment).toHaveBeenCalledWith('settings:about')
    })

    it('dice que no hay Python en vez de dejar un hueco', async () => {
      mockFeedback({ so: 'Linux 6.8.0', python: null })
      render(<AboutTab />)
      await waitFor(() => expect(screen.getByTestId('entorno').textContent).toBe('Linux 6.8.0 · settings.about.noPython'))
    })
  })
})
