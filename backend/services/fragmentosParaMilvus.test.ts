import { describe, it, expect } from 'vitest'
import { fragmentosParaMilvus, LIMITE_CONTENT_MILVUS } from './fragmentosParaMilvus'

const bytes = (t: string) => Buffer.byteLength(t, 'utf8')

describe('fragmentos de un mensaje para Milvus', () => {
  it('un mensaje que cabe va entero', () => {
    expect(fragmentosParaMilvus('Hola')).toEqual(['Hola'])
  })

  it('la respuesta de 21 000 caracteres que Milvus rechazó cabe en trozos', () => {
    const parrafo = 'La pérdida del pozo es s_w = C·Q², con C en sec²/ft⁵. '.repeat(12)
    const texto = Array.from({ length: 30 }, () => parrafo).join('\n\n')
    expect(texto.length).toBeGreaterThan(LIMITE_CONTENT_MILVUS)

    const trozos = fragmentosParaMilvus(texto)

    expect(trozos.length).toBeGreaterThan(1)
    for (const t of trozos) expect(bytes(t)).toBeLessThanOrEqual(LIMITE_CONTENT_MILVUS)
    expect(trozos.join('\n\n')).toBe(texto)
  })

  it('mide en bytes: las tildes cuentan doble', () => {
    const trozos = fragmentosParaMilvus('á'.repeat(10), 8)
    for (const t of trozos) expect(bytes(t)).toBeLessThanOrEqual(8)
    expect(trozos.join('')).toBe('á'.repeat(10))
  })

  it('un párrafo más largo que el límite se corta sin perder nada', () => {
    const largo = 'x'.repeat(25)
    expect(fragmentosParaMilvus(largo, 10)).toEqual(['x'.repeat(10), 'x'.repeat(10), 'x'.repeat(5)])
  })
})
