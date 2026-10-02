import { describe, it, expect, beforeEach, vi } from 'vitest'
import { capturarConsolaDelMain, MAX_ENTRADAS, registrar, ultimas, vaciarRegistro } from './registroReciente'

describe('registroReciente (#217, D5)', () => {
  beforeEach(() => vaciarRegistro())

  it('guarda solo las últimas entradas, en orden', () => {
    for (let i = 0; i < MAX_ENTRADAS + 10; i++) registrar('main', 'warn', `aviso ${i}`)
    const todas = ultimas()
    expect(todas).toHaveLength(MAX_ENTRADAS)
    expect(todas[0].texto).toBe('aviso 10')
    expect(todas.at(-1)?.texto).toBe(`aviso ${MAX_ENTRADAS + 9}`)
    expect(ultimas(3).map(e => e.texto)).toEqual([47, 48, 49].map(i => `aviso ${i + 10}`))
    expect(ultimas(0)).toEqual([])
  })

  it('compacta los saltos de línea, recorta lo largo e ignora lo vacío', () => {
    registrar('renderer', 'error', 'Error: x\n    at foo\n    at bar')
    registrar('renderer', 'error', '   ')
    registrar('main', 'error', 'y'.repeat(2000))
    const [a, b] = ultimas()
    expect(a.texto).toBe('Error: x at foo at bar')
    expect(b.texto.length).toBe(501)
    expect(ultimas()).toHaveLength(2)
  })

  it('copia warn y error de la consola del main sin dejar de escribirlos', () => {
    const consola = { warn: vi.fn(), error: vi.fn() }
    const [warn, error] = [consola.warn, consola.error]
    capturarConsolaDelMain(consola)
    consola.warn('cuidado', { a: 1 })
    consola.error(new Error('roto'))
    expect(warn).toHaveBeenCalledWith('cuidado', { a: 1 })
    expect(error).toHaveBeenCalled()
    expect(ultimas().map(e => `${e.origen}/${e.nivel}/${e.texto}`)).toEqual([
      'main/warn/cuidado {"a":1}',
      'main/error/Error: roto',
    ])
  })
})
