/**
 * Lo que se fija aquí (#157): que un fichero del que no se saca texto no
 * produzca nunca un contenido que parezca un documento.
 */

import { describe, it, expect } from 'vitest'
import {
  MINIMO_CARACTERES,
  esRellenoFabricado,
  formatoNoSoportado,
  hayTextoAprovechable,
  indexadoSinContenido,
  textoIlegible,
  textoLeido,
} from './textoDeDocumento'

describe('cuándo hay texto que indexar', () => {
  it('un documento de verdad sí', () => {
    const real = 'La pérdida de carga por fricción se calcula con la ecuación de Darcy-Weisbach.'
    expect(hayTextoAprovechable(real)).toBe(true)
    expect(textoLeido(real)).toEqual({ texto: real })
  })

  it('lo vacío, lo blanco y lo ausente no', () => {
    for (const nada of ['', '   ', '\n\n\t', null, undefined]) {
      expect(hayTextoAprovechable(nada as string), String(nada)).toBe(false)
    }
  })

  it('un PDF escaneado, que devuelve cuatro caracteres sueltos, tampoco', () => {
    expect(hayTextoAprovechable('1 2\n3')).toBe(false)
    expect(hayTextoAprovechable('x'.repeat(MINIMO_CARACTERES - 1))).toBe(false)
    expect(hayTextoAprovechable('x'.repeat(MINIMO_CARACTERES))).toBe(true)
  })

  it('el texto se guarda recortado, no como venía', () => {
    const conBordes = `\n\n  ${'a'.repeat(60)}  \n`
    expect(textoLeido(conBordes).texto).toBe('a'.repeat(60))
  })
})

describe('lo que nunca puede pasar', () => {
  it('un fichero ilegible no devuelve texto, devuelve el motivo', () => {
    const r = textoIlegible(new Error('Invalid PDF structure'))

    expect(r.texto).toBe('')
    expect(r.problema).toBe('ilegible')
    // El error va al detalle, para el log. Nunca al contenido del documento:
    // eso es lo que acababa troceado y vectorizado en la base.
    expect(r.detalle).toBe('Invalid PDF structure')
  })

  it('un formato que no sabemos abrir tampoco', () => {
    const r = formatoNoSoportado('.doc binario')

    expect(r.texto).toBe('')
    expect(r.problema).toBe('formato-no-soportado')
  })

  it('lo vacío se marca como problema, no como documento corto', () => {
    const r = textoLeido('   ')

    expect(r.texto).toBe('')
    expect(r.problema).toBe('vacio')
  })

  it('ninguno de los tres produce algo que parezca contenido', () => {
    for (const r of [textoIlegible(new Error('x')), formatoNoSoportado('y'), textoLeido('')]) {
      expect(r.texto).toBe('')
      expect(hayTextoAprovechable(r.texto)).toBe(false)
    }
  })
})

describe('el relleno que quedó indexado en las bases de antes', () => {
  /** Los dos que había en una base real, con sus 69 caracteres. */
  const REALES = [
    'PDF Document: 1.1 Fuentes-Superficiales.pdf\n(Empty content extracted)',
    'PDF Document: 1.2 Groundwater--supplies.pdf\n(Empty content extracted)',
  ]

  it('supera el listón de caracteres, y por eso hace falta reconocerlo', () => {
    // Es lo que hacía que un documento vacío pasara por documento corto: el
    // relleno es largo porque lleva el nombre del fichero dentro.
    for (const relleno of REALES) {
      expect(relleno.length).toBeGreaterThan(MINIMO_CARACTERES)
      expect(hayTextoAprovechable(relleno)).toBe(true)
      expect(esRellenoFabricado(relleno)).toBe(true)
      expect(indexadoSinContenido(relleno)).toBe(true)
    }
  })

  it('reconoce las otras frases que escribían las tres rutas', () => {
    for (const relleno of [
      'PDF Document: x.pdf\nUnable to extract text content. Error: boom',
      'DOCX Document: y.docx\nError extracting content: boom',
      'DOC Document: z.doc\nLegacy binary Word formats are not supported. Please convert to DOCX or PDF.',
      'algo\n\n[SYSTEM WARNING: This document appears to have little to no text content. …]',
    ]) {
      expect(esRellenoFabricado(relleno), relleno.slice(0, 30)).toBe(true)
    }
  })

  it('y no confunde un documento de verdad con relleno', () => {
    const real = 'La pérdida de carga se calcula con Darcy-Weisbach. El factor de fricción depende de Reynolds.'
    expect(esRellenoFabricado(real)).toBe(false)
    expect(indexadoSinContenido(real)).toBe(false)
  })

  it('lo corto también cuenta como indexado sin contenido', () => {
    expect(indexadoSinContenido('dos palabras')).toBe(true)
  })
})
