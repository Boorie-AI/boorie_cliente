/**
 * Lo que se fija aquí (#170), por orden de importancia: que el guardián no
 * pueda dejar al usuario sin preguntar, y sólo después, que bloquee lo que no
 * es del dominio.
 */

import { describe, it, expect, vi } from 'vitest'
import { compruebaLaEntrada, dejaPasar } from './guardianDeEntrada'

describe('ante la duda, pasa', () => {
  it('un veredicto ausente o a medias no bloquea', () => {
    // El juez es un modelo pequeño: bloquear una pregunta legítima de
    // hidráulica rompe la herramienta para quien la usa bien.
    expect(dejaPasar(undefined)).toBe(true)
    expect(dejaPasar(null)).toBe(true)
    expect(dejaPasar({})).toBe(true)
    expect(dejaPasar({ reason: 'algo raro' })).toBe(true)
  })

  it('sólo bloquea con un «allow: false» explícito', () => {
    expect(dejaPasar({ allow: false })).toBe(false)
    expect(dejaPasar({ allow: true })).toBe(true)
  })
})

describe('el guardián no puede colgar el chat', () => {
  it('si revienta, la pregunta sigue su camino', async () => {
    const r = await compruebaLaEntrada(() => Promise.reject(new Error('Python no responde')))
    expect(r.pasa).toBe(true)
  })

  it('si tarda más de la cuenta, tampoco espera', async () => {
    vi.useFakeTimers()
    const nunca = () => new Promise<never>(() => {})
    const promesa = compruebaLaEntrada(nunca, 20000)
    await vi.advanceTimersByTimeAsync(20001)
    expect((await promesa).pasa).toBe(true)
    vi.useRealTimers()
  })
})

describe('y cuando sí bloquea', () => {
  it('bloquea lo que el rail marca fuera del dominio, con su motivo', async () => {
    const r = await compruebaLaEntrada(async () => ({
      allow: false,
      reason: 'Fuera del dominio de la ingeniería hidráulica',
    }))

    expect(r.pasa).toBe(false)
    expect(r.motivo).toBe('Fuera del dominio de la ingeniería hidráulica')
  })

  it('un bloqueo sin motivo no inventa uno', async () => {
    const r = await compruebaLaEntrada(async () => ({ allow: false, reason: '   ' }))
    expect(r.pasa).toBe(false)
    expect(r.motivo).toBeUndefined()
  })

  it('deja pasar una pregunta de hidráulica', async () => {
    const r = await compruebaLaEntrada(async () => ({ allow: true, reason: 'ALLOW' }))
    expect(r.pasa).toBe(true)
  })
})

