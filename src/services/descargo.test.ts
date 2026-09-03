import { describe, it, expect, beforeEach, vi } from 'vitest'
import { guardarAceptacion, hayQueAceptar, leerAceptacion, VERSION_DESCARGO } from './descargo'

/**
 * La constancia de la aceptación (issue #108).
 *
 * Lo que se protege aquí es que el diálogo aparezca cuando debe y no aparezca
 * cuando no debe: si reaparece cada dos por tres deja de leerse, y si no
 * reaparece nunca, subir la versión del texto no sirve de nada.
 */
const ajustes = new Map<string, string>()

beforeEach(() => {
  ajustes.clear()
  ;(window as unknown as { electronAPI: unknown }).electronAPI = {
    database: {
      getSetting: vi.fn(async (k: string) => ajustes.get(k) ?? null),
      setSetting: vi.fn(async (k: string, v: string) => { ajustes.set(k, v) }),
    },
  }
})

describe('aceptación del descargo', () => {
  it('sin aceptar, hay que enseñar el diálogo', async () => {
    expect(await leerAceptacion()).toBeNull()
    expect(hayQueAceptar(null)).toBe(true)
  })

  it('guarda la versión y la fecha, que es lo que se pregunta en una auditoría', async () => {
    const antes = Date.now()
    const guardada = await guardarAceptacion()

    expect(guardada.version).toBe(VERSION_DESCARGO)
    expect(new Date(guardada.fecha).getTime()).toBeGreaterThanOrEqual(antes)

    const leida = await leerAceptacion()
    expect(leida).toEqual(guardada)
    expect(hayQueAceptar(leida)).toBe(false)
  })

  it('sobrevive a reiniciar: se relee de la base, no de memoria', async () => {
    await guardarAceptacion()
    // Un arranque nuevo: el módulo no guarda estado, todo sale del almacén.
    expect(hayQueAceptar(await leerAceptacion())).toBe(false)
  })

  it('subir la versión del texto lo vuelve a pedir', async () => {
    await guardarAceptacion(VERSION_DESCARGO - 1)
    expect(hayQueAceptar(await leerAceptacion())).toBe(true)
  })

  it('quien aceptó una versión posterior no tiene que volver a aceptar', () => {
    // Pasa al abrir una versión más nueva de Boorie y volver luego a ésta.
    expect(hayQueAceptar({ version: VERSION_DESCARGO + 1, fecha: '2026-09-03T00:00:00.000Z' })).toBe(false)
  })

  it('una constancia ilegible se trata como no aceptada, no como válida', async () => {
    ajustes.set('descargo.aceptacion', 'esto no es json')
    expect(await leerAceptacion()).toBeNull()

    ajustes.set('descargo.aceptacion', JSON.stringify({ fecha: 'hoy' }))
    expect(await leerAceptacion()).toBeNull()
  })

  it('acepta también la fila entera de AppSetting, no sólo la cadena', async () => {
    // `db-get-setting` devuelve el valor, pero el servicio ha devuelto la fila
    // en otras épocas: si cambia, no debe convertirse en «no aceptado».
    const fila = { value: JSON.stringify({ version: VERSION_DESCARGO, fecha: '2026-09-03T00:00:00.000Z' }) }
    ;(window.electronAPI as unknown as { database: { getSetting: unknown } }).database.getSetting =
      vi.fn(async () => fila)
    expect((await leerAceptacion())?.version).toBe(VERSION_DESCARGO)
  })
})
