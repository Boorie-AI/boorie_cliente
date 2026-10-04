import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { limitarFrecuencia } from './limitarFrecuencia'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('limitarFrecuencia', () => {
  it('manda el primero enseguida y, dentro del intervalo, sólo el último', () => {
    const enviados: string[] = []
    const l = limitarFrecuencia(t => enviados.push(t), 100)
    l.emitir('a')
    l.emitir('ab')
    l.emitir('abc')
    expect(enviados).toEqual(['a'])
    vi.advanceTimersByTime(100)
    expect(enviados).toEqual(['a', 'abc'])
  })

  it('no pasa de diez por segundo aunque lleguen cien trozos', () => {
    const enviados: string[] = []
    const l = limitarFrecuencia(t => enviados.push(t), 100)
    let texto = ''
    for (let i = 0; i < 100; i++) {
      texto += 'x'
      l.emitir(texto)
      vi.advanceTimersByTime(10)
    }
    expect(enviados.length).toBeLessThanOrEqual(11)
    l.vaciar()
    expect(enviados.at(-1)).toBe(texto)
  })

  it('vaciar manda lo pendiente; cancelar lo descarta', () => {
    const enviados: string[] = []
    const l = limitarFrecuencia(t => enviados.push(t), 100)
    l.emitir('a')
    l.emitir('ab')
    l.vaciar()
    expect(enviados).toEqual(['a', 'ab'])
    l.emitir('abc')
    l.cancelar()
    vi.advanceTimersByTime(500)
    expect(enviados).toEqual(['a', 'ab'])
  })

  it('no repite el mismo texto, ni manda un vacío si no se había mandado nada', () => {
    const enviados: string[] = []
    const l = limitarFrecuencia(t => enviados.push(t), 100)
    l.emitir('')
    l.vaciar()
    l.emitir('a')
    vi.advanceTimersByTime(200)
    l.emitir('a')
    l.vaciar()
    expect(enviados).toEqual(['a'])
  })
})
