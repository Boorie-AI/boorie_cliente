/**
 * La política de lectura tolerante (#174).
 *
 * Lo que se fija, por orden: que una base sana no pague nada por esto, que una
 * rota devuelva todo lo legible en vez de nada, y que diga cuáles no lo son.
 */

import { describe, it, expect, vi } from 'vitest'
import { avisoDeIlegibles, leerTolerando } from './lecturaTolerante'

const doc = (id: string) => ({ id, title: `Documento ${id}` })

describe('cuando la base está sana', () => {
  it('se lee de golpe y no se toca nada más', async () => {
    const listar = vi.fn()
    const unoAUno = vi.fn()

    const r = await leerTolerando(async () => [doc('a'), doc('b')], listar, unoAUno)

    expect(r.documentos).toHaveLength(2)
    expect(r.ilegibles).toEqual([])
    // Una base sana paga una consulta, no N.
    expect(listar).not.toHaveBeenCalled()
    expect(unoAUno).not.toHaveBeenCalled()
  })
})

describe('cuando hay un documento ilegible', () => {
  const lista = [
    { id: 'a', title: 'Bueno uno' },
    { id: 'roto', title: 'PDF con basura dentro' },
    { id: 'b', title: 'Bueno dos' },
  ]
  const unoAUno = async (id: string) => {
    if (id === 'roto') throw new Error('Failed to convert rust `String` into napi `string`')
    return doc(id)
  }

  it('devuelve los legibles en vez de no devolver nada', async () => {
    const r = await leerTolerando(
      async () => { throw new Error('Couldn\'t convert data to UTF-8') },
      async () => lista,
      unoAUno,
    )

    expect(r.documentos.map(d => d.id)).toEqual(['a', 'b'])
  })

  it('y nombra el que no se pudo leer, que es lo que faltaba', async () => {
    // El mensaje del motor no dice de qué documento habla, así que el usuario
    // no tenía forma de saber cuál quitar.
    const r = await leerTolerando(
      async () => { throw new Error('boom') },
      async () => lista,
      unoAUno,
    )

    expect(r.ilegibles).toHaveLength(1)
    expect(r.ilegibles[0].title).toBe('PDF con basura dentro')
    expect(r.ilegibles[0].motivo).toContain('napi')
  })

  it('un documento que no existe no es un documento ilegible', async () => {
    const r = await leerTolerando(
      async () => { throw new Error('boom') },
      async () => [{ id: 'fantasma', title: 'Ya no está' }],
      async () => null,
    )

    expect(r.documentos).toEqual([])
    expect(r.ilegibles).toEqual([])
  })
})

describe('si no se puede leer ni la lista', () => {
  it('se propaga: entonces el problema es otro', async () => {
    await expect(leerTolerando(
      async () => { throw new Error('boom') },
      async () => { throw new Error('la base no abre') },
      async () => null,
    )).rejects.toThrow('la base no abre')
  })
})

describe('el aviso al usuario', () => {
  it('sin ilegibles no hay aviso', () => {
    expect(avisoDeIlegibles([])).toBeNull()
  })

  it('con ilegibles los nombra y dice qué hacer', () => {
    const aviso = avisoDeIlegibles([{ id: 'x', title: 'Fuentes-Superficiales', motivo: 'napi' }])!

    expect(aviso).toContain('Fuentes-Superficiales')
    expect(aviso).toContain('bórrelos desde la lista')
  })
})
