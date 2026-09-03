import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { DialogoDescargo } from './DialogoDescargo'
import { VERSION_DESCARGO } from '@/services/descargo'

/**
 * El diálogo del descargo (issue #108).
 *
 * Lo que protegen estos tests es que aparezca cuando debe, que no se pueda
 * esquivar, y que la aceptación quede guardada. Las tres salidas cerradas
 * —Escape, pinchar fuera, y no tener botón de cerrar— son la parte que un
 * cambio de versión de Radix puede romper **en silencio**: seguiría abriéndose
 * igual, y nadie se enteraría de que ya se puede saltar.
 */
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

const ajustes = new Map<string, string>()
let setSetting: ReturnType<typeof vi.fn>

beforeEach(() => {
  ajustes.clear()
  setSetting = vi.fn(async (k: string, v: string) => { ajustes.set(k, v) })
  ;(window as unknown as { electronAPI: unknown }).electronAPI = {
    database: {
      getSetting: vi.fn(async (k: string) => ajustes.get(k) ?? null),
      setSetting,
    },
  }
})

const verElDialogo = () => screen.findByText('descargo.parrafoDecision')

describe('diálogo del descargo', () => {
  it('aparece con la base limpia', async () => {
    render(<DialogoDescargo />)
    expect(await verElDialogo()).toBeTruthy()
  })

  it('no aparece si ya está aceptada esta versión', async () => {
    ajustes.set('descargo.aceptacion', JSON.stringify({ version: VERSION_DESCARGO, fecha: 'x' }))
    render(<DialogoDescargo />)
    await waitFor(() => {
      expect(screen.queryByText('descargo.parrafoDecision')).toBeNull()
    })
  })

  it('vuelve a aparecer si lo aceptado es de una versión anterior', async () => {
    ajustes.set('descargo.aceptacion', JSON.stringify({ version: VERSION_DESCARGO - 1, fecha: 'x' }))
    render(<DialogoDescargo />)
    expect(await verElDialogo()).toBeTruthy()
  })

  it('si la base no responde, se pregunta en vez de darlo por aceptado', async () => {
    (window.electronAPI as unknown as { database: { getSetting: unknown } }).database.getSetting =
      vi.fn(async () => { throw new Error('base caída') })
    render(<DialogoDescargo />)
    expect(await verElDialogo()).toBeTruthy()
  })

  it('no se puede cerrar con Escape ni pinchando fuera, y no hay botón de cerrar', async () => {
    render(<DialogoDescargo />)
    await verElDialogo()

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape', code: 'Escape' })
    expect(await verElDialogo()).toBeTruthy()

    fireEvent.pointerDown(document.body)
    fireEvent.click(document.body)
    expect(await verElDialogo()).toBeTruthy()

    // La única salida es aceptar: ningún botón más en el diálogo.
    expect(screen.getAllByRole('button').map(b => b.textContent)).toEqual(['descargo.aceptar'])
  })

  it('al aceptar, guarda la constancia y se cierra', async () => {
    render(<DialogoDescargo />)
    await verElDialogo()

    fireEvent.click(screen.getByText('descargo.aceptar'))

    await waitFor(() => expect(setSetting).toHaveBeenCalled())
    const [clave, valor] = setSetting.mock.calls[0]
    expect(clave).toBe('descargo.aceptacion')
    const guardado = JSON.parse(valor as string)
    expect(guardado.version).toBe(VERSION_DESCARGO)
    expect(Number.isNaN(Date.parse(guardado.fecha))).toBe(false)

    await waitFor(() => expect(screen.queryByText('descargo.parrafoDecision')).toBeNull())
  })

  it('si no se puede guardar, no se cierra: cerrar sin constancia es lo peor de los dos mundos', async () => {
    (window.electronAPI as unknown as { database: { setSetting: unknown } }).database.setSetting =
      vi.fn(async () => { throw new Error('no se pudo escribir') })
    render(<DialogoDescargo />)
    await verElDialogo()

    fireEvent.click(screen.getByText('descargo.aceptar'))
    expect(await verElDialogo()).toBeTruthy()
  })
})
