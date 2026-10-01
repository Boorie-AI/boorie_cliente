import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DialogoAyuda } from './DialogoAyuda'
import { useAyudaStore } from '@/stores/ayudaStore'
import { useAppStore } from '@/stores/appStore'
import es from '@/locales/es.json'

/**
 * El formulario de «Ayuda y comentarios» (#217). Usa el i18n real en
 * castellano —lo carga `src/test/setup.ts`— para comprobar también que no
 * queda ninguna clave sin traducir a la vista.
 */

const feedback = {
  getEnvironment: vi.fn(),
  preview: vi.fn(async (_f: unknown, _o: unknown) => ({ success: true, titulo: 't', cuerpo: 'CUERPO DE LA VISTA PREVIA', recortado: false })),
  openGithub: vi.fn(async (_f: unknown, _o: unknown) => ({ success: true, recortado: false })),
  copy: vi.fn(async (_f: unknown, _o: unknown) => ({ success: true })),
  snapshot: vi.fn(async () => ({ success: true })),
  copySnapshot: vi.fn(async () => ({ success: true })),
  discardSnapshot: vi.fn(async () => ({ success: true })),
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(window as unknown as { electronAPI: unknown }).electronAPI = { feedback }
  useAyudaStore.setState({ abierta: false, tipo: 'bug', pantalla: 'unknown' })
  useAppStore.setState({ currentView: 'chat' })
})

async function abrir(tipo: 'bug' | 'mejora' = 'bug') {
  render(<DialogoAyuda />)
  await act(() => useAyudaStore.getState().abrir(tipo))
  return screen.findByRole('dialog')
}

const a = es.ayuda

describe('DialogoAyuda', () => {
  it('se abre en castellano, con los tres campos del bug y la frecuencia (R6, R7, D7)', async () => {
    await abrir('bug')
    expect(screen.getByText(a.titulo)).toBeTruthy()
    expect(screen.getByText(a.haciendo)).toBeTruthy()
    expect(screen.getByText(a.paso)).toBeTruthy()
    expect(screen.getByText(a.esperabas)).toBeTruthy()
    for (const f of [a.frecuenciaUnaVez, a.frecuenciaAVeces, a.frecuenciaSiempre]) {
      expect(screen.getByRole('radio', { name: f })).toBeTruthy()
    }
    expect(document.body.textContent).not.toMatch(/ayuda\.\w+/)
  })

  it('avisa de que es público, pide no poner datos de clientes y no promete que no haga falta cuenta (R29, D1, D3)', async () => {
    await abrir()
    expect(screen.getByText(a.avisoPublico)).toBeTruthy()
    expect(screen.getByText(a.avisoCuenta)).toBeTruthy()
    expect(document.body.textContent?.toLowerCase()).not.toContain('no necesitas cuenta')
  })

  it('el modo mejora muestra sus tres campos (R8, R9)', async () => {
    await abrir('mejora')
    expect(screen.getByText(a.necesitas)).toBeTruthy()
    expect(screen.getByText(a.paraQue)).toBeTruthy()
    expect(screen.getByText(a.comoHoy)).toBeTruthy()
    expect(screen.queryByText(a.paso)).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: a.reportar }))
    expect(screen.getByText(a.paso)).toBeTruthy()
  })

  it('la información técnica empieza desmarcada (D4)', async () => {
    await abrir()
    expect((screen.getByRole('checkbox', { name: new RegExp(a.incluirTecnica) }) as HTMLInputElement).checked).toBe(false)
  })

  it('los botones de envío esperan a que esté lo obligatorio', async () => {
    await abrir()
    const abrirGh = screen.getByRole('button', { name: a.abrirGithub })
    expect((abrirGh as HTMLButtonElement).disabled).toBe(true)
    await userEvent.type(screen.getByPlaceholderText(a.pasoPh), 'Se cuelga')
    expect((abrirGh as HTMLButtonElement).disabled).toBe(false)
  })

  it('«Abrir en GitHub» manda el formulario, la consentida y la pantalla de origen al main (R4, R10, R25)', async () => {
    useAppStore.setState({ currentView: 'settings', settingsTab: 'about' })
    await abrir()
    await userEvent.type(screen.getByPlaceholderText(a.haciendoPh), 'Abría una red')
    await userEvent.type(screen.getByPlaceholderText(a.pasoPh), 'Se cuelga')
    await userEvent.type(screen.getByPlaceholderText(a.esperabasPh), 'Que abriera')
    await userEvent.click(screen.getByRole('radio', { name: a.frecuenciaSiempre }))
    await userEvent.click(screen.getByRole('checkbox', { name: new RegExp(a.incluirTecnica) }))
    await userEvent.click(screen.getByRole('button', { name: a.abrirGithub }))
    expect(feedback.openGithub).toHaveBeenCalledWith(
      { tipo: 'bug', haciendo: 'Abría una red', paso: 'Se cuelga', esperabas: 'Que abriera', frecuencia: 'siempre' },
      { incluirTecnica: true, pantalla: 'settings:about' },
    )
    expect(await screen.findByText(a.abierto)).toBeTruthy()
  })

  it('sin marcar la casilla, lo enviado lo dice explícitamente (R10)', async () => {
    await abrir()
    await userEvent.type(screen.getByPlaceholderText(a.pasoPh), 'x')
    await userEvent.click(screen.getByRole('button', { name: a.abrirGithub }))
    expect(feedback.openGithub.mock.calls[0][1]).toEqual({ incluirTecnica: false, pantalla: 'chat' })
  })

  it('avisa si el enlace va recortado y el informe completo está en el portapapeles', async () => {
    feedback.openGithub.mockResolvedValueOnce({ success: true, recortado: true })
    await abrir()
    await userEvent.type(screen.getByPlaceholderText(a.pasoPh), 'x')
    await userEvent.click(screen.getByRole('button', { name: a.abrirGithub }))
    expect(await screen.findByText(a.abiertoRecortado)).toBeTruthy()
  })

  it('un fallo se explica sin detalles técnicos (R18, R24)', async () => {
    feedback.openGithub.mockResolvedValueOnce({ success: false, error: 'open-failed' } as never)
    await abrir()
    await userEvent.type(screen.getByPlaceholderText(a.pasoPh), 'x')
    await userEvent.click(screen.getByRole('button', { name: a.abrirGithub }))
    expect(await screen.findByText(a.error)).toBeTruthy()
    expect(document.body.textContent).not.toContain('open-failed')
  })

  it('«Copiar informe» usa el mismo canal y lo confirma (D1)', async () => {
    await abrir('mejora')
    await userEvent.type(screen.getByPlaceholderText(a.necesitasPh), 'Exportar a Excel')
    await userEvent.click(screen.getByRole('button', { name: a.copiar }))
    expect(feedback.copy).toHaveBeenCalledWith(
      { tipo: 'mejora', necesitas: 'Exportar a Excel', paraQue: '', comoHoy: '' },
      { incluirTecnica: false, pantalla: 'chat' },
    )
    expect(await screen.findByText(a.copiado)).toBeTruthy()
  })

  it('la vista previa la da el main, que es quien anonimiza (R10)', async () => {
    await abrir()
    await userEvent.type(screen.getByPlaceholderText(a.pasoPh), 'x')
    const details = screen.getByText(a.verPrevia).closest('details') as HTMLDetailsElement
    details.open = true
    fireEvent(details, new Event('toggle'))
    expect(await screen.findByText('CUERPO DE LA VISTA PREVIA', {}, { timeout: 2000 })).toBeTruthy()
    expect(feedback.preview).toHaveBeenCalled()
  })

  it('la captura se hace al abrir, antes de pintar el modal, y se copia al pulsar (R32, D9)', async () => {
    let abiertaAlCapturar: boolean | null = null
    feedback.snapshot.mockImplementationOnce(async () => {
      abiertaAlCapturar = useAyudaStore.getState().abierta
      return { success: true }
    })
    await abrir()
    expect(abiertaAlCapturar).toBe(false)
    await userEvent.click(screen.getByRole('button', { name: a.capturar }))
    expect(feedback.copySnapshot).toHaveBeenCalled()
    expect(await screen.findByText(a.capturaCopiada)).toBeTruthy()
    expect(screen.getByText(a.capturaAviso)).toBeTruthy()
  })

  it('al cerrar se descarta la captura y se vuelve a la misma pantalla (R3)', async () => {
    await abrir()
    await userEvent.click(screen.getByRole('button', { name: a.cancelar }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(feedback.discardSnapshot).toHaveBeenCalled()
    expect(useAppStore.getState().currentView).toBe('chat')
  })
})
