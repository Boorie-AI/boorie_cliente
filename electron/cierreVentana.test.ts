import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import {
  ControlCierre,
  ESPERA_AVISO_MS,
  CANAL_SOLICITUD_CIERRE,
  CANAL_AVISO_CIERRE_MOSTRADO,
  CANAL_CONFIRMAR_CIERRE
} from './cierreVentana'

describe('canales de cierre', () => {
  it('el preload usa los mismos nombres que el main', () => {
    const preload = readFileSync(path.join(__dirname, 'preload.ts'), 'utf8')
    for (const canal of [CANAL_SOLICITUD_CIERRE, CANAL_AVISO_CIERRE_MOSTRADO, CANAL_CONFIRMAR_CIERRE]) {
      expect(preload).toContain(`'${canal}'`)
    }
  })
})

describe('ControlCierre', () => {
  let forzar: ReturnType<typeof vi.fn>
  let control: ControlCierre

  beforeEach(() => {
    vi.useFakeTimers()
    forzar = vi.fn()
    control = new ControlCierre(forzar)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('el primer intento de cerrar se para para preguntar', () => {
    expect(control.alIntentarCerrar()).toBe('preguntar')
  })

  it('tras confirmar, el cierre sigue adelante', () => {
    control.alIntentarCerrar()
    control.avisoMostrado()
    control.confirmar()
    expect(control.alIntentarCerrar()).toBe('permitir')
  })

  it('si se cancela, el siguiente intento vuelve a preguntar y no fuerza la salida', () => {
    control.alIntentarCerrar()
    control.avisoMostrado()
    vi.advanceTimersByTime(ESPERA_AVISO_MS * 10)
    expect(forzar).not.toHaveBeenCalled()
    expect(control.alIntentarCerrar()).toBe('preguntar')
  })

  it('si el renderer no acusa el aviso, fuerza la salida y deja cerrar', () => {
    control.alIntentarCerrar()
    vi.advanceTimersByTime(ESPERA_AVISO_MS - 1)
    expect(forzar).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(forzar).toHaveBeenCalledTimes(1)
    expect(control.alIntentarCerrar()).toBe('permitir')
  })

  it('dos intentos seguidos dejan un único plazo de espera', () => {
    control.alIntentarCerrar()
    vi.advanceTimersByTime(ESPERA_AVISO_MS - 100)
    control.alIntentarCerrar()
    control.avisoMostrado()
    vi.advanceTimersByTime(ESPERA_AVISO_MS * 2)
    expect(forzar).not.toHaveBeenCalled()
  })

  it('con el renderer colgado o caído se fuerza la salida sin preguntar', () => {
    control.rendererNoResponde()
    expect(control.alIntentarCerrar()).toBe('forzar')
    vi.advanceTimersByTime(ESPERA_AVISO_MS * 2)
    expect(forzar).not.toHaveBeenCalled()
  })

  it('cuando el renderer se recupera vuelve a preguntar', () => {
    control.rendererNoResponde()
    control.rendererResponde()
    expect(control.alIntentarCerrar()).toBe('preguntar')
  })
})
