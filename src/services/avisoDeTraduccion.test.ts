/**
 * Lo que se fija aquí (#160): que una cita traída de otro idioma nunca se sirve
 * sin decirlo, use el modelo las marcas de fuente o no; y que cuando el propio
 * modelo ya lo ha dicho no se le añade encima una segunda advertencia.
 */

import { describe, it, expect } from 'vitest'
import { marcarLoTraducido } from './avisoDeTraduccion'

const EN = { title: 'Engineering Hydrology', language: 'en', content: '' }
const ES = { title: 'Norma mexicana', language: 'es', content: '' }

describe('la cita traducida lo dice', () => {
  it('lo pega a la marca cuando el modelo la ha usado', () => {
    const salida = marcarLoTraducido('El coeficiente vale 0,6 (F1).', [EN], 'es')
    expect(salida).toBe('El coeficiente vale 0,6 (F1, traducido del inglés).')
  })

  it('también cuando la marca va suelta, sin paréntesis', () => {
    const salida = marcarLoTraducido('Según F1, el coeficiente vale 0,6.', [EN], 'es')
    expect(salida).toContain('F1 (traducido del inglés)')
  })

  it('sólo la primera vez: repetirlo en cada cita es ruido', () => {
    const salida = marcarLoTraducido('Primero (F1) y luego otra vez (F1).', [EN], 'es')
    expect(salida.match(/traducido del inglés/g)).toHaveLength(1)
  })

  it('si el modelo no usa las marcas, se dice al final igualmente', () => {
    // Es lo que hace la mitad de las veces: cita por el título y se olvida.
    const salida = marcarLoTraducido(
      'Según Engineering Hydrology de K. Subramanya, se usa Penman-Monteith.', [EN], 'es')
    expect(salida).toContain('están en inglés')
    expect(salida).toContain('traducción')
  })

  it('nombra los dos idiomas cuando las fuentes vienen de dos sitios', () => {
    const CA = { title: 'Guia catalana', language: 'ca', content: '' }
    const salida = marcarLoTraducido('Una respuesta sin marcas.', [EN, CA], 'es')
    expect(salida).toContain('inglés')
    expect(salida).toContain('catalán')
  })
})

describe('cuándo no hay que decir nada', () => {
  it('las fuentes en el idioma del usuario no se marcan', () => {
    const original = 'El diámetro mínimo es 100 mm (F1).'
    expect(marcarLoTraducido(original, [ES], 'es')).toBe(original)
  })

  it('una fuente sin idioma declarado no se da por traducida', () => {
    // Marcarla obligaría a escribir «traducido del …» sin saber de qué, y una
    // procedencia inventada es peor que una cita sin adornos.
    const original = 'El diámetro mínimo es 100 mm (F1).'
    expect(marcarLoTraducido(original, [{ title: 'x', content: '' }], 'es')).toBe(original)
  })

  it('si el modelo ya avisó, no se le añade una segunda advertencia', () => {
    const original = 'El coeficiente vale 0,6 (F1, traducido del inglés).'
    expect(marcarLoTraducido(original, [EN], 'es')).toBe(original)
  })

  it('con la aplicación en inglés, una fuente en inglés no es una traducción', () => {
    const original = 'The coefficient is 0.6 (F1).'
    expect(marcarLoTraducido(original, [EN], 'en')).toBe(original)
  })

  it('el texto vacío no revienta', () => {
    expect(marcarLoTraducido('', [EN], 'es')).toBe('')
  })
})
