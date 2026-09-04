import { describe, it, expect } from 'vitest'
import {
  contextoDeConocimiento,
  identidadDeFuente,
  marcaDeFuente,
  type FuenteConocimiento,
} from './contextoConocimiento'

const fuente = (extra: Partial<FuenteConocimiento> = {}): FuenteConocimiento => ({
  title: 'NOM-013-CONAGUA-2015',
  content: 'El diámetro mínimo en red de distribución es de 100 mm.',
  ...extra,
})

describe('la identidad de una fuente', () => {
  it('lleva documento, sección y página cuando las hay', () => {
    // Las tres las recupera el RAG y antes se tiraban antes de que el modelo
    // las viera: no podía citar una sección porque nadie se la había dicho.
    expect(identidadDeFuente(fuente({ section: '4.2', page: 17 }), 0))
      .toBe('[F1] NOM-013-CONAGUA-2015 — sección 4.2, página 17')
  })

  it('omite lo que no hay en vez de rellenarlo', () => {
    expect(identidadDeFuente(fuente(), 2)).toBe('[F3] NOM-013-CONAGUA-2015')
    expect(identidadDeFuente(fuente({ section: '4.2' }), 0))
      .toBe('[F1] NOM-013-CONAGUA-2015 — sección 4.2')
  })

  it('descarta la página cero, que no ayuda a encontrar nada', () => {
    expect(identidadDeFuente(fuente({ page: 0 }), 0)).not.toMatch(/página/)
  })

  it('una fuente web lleva su dirección', () => {
    const f = fuente({ type: 'web', url: 'https://ejemplo.org/norma', title: 'Guía GEM' })
    expect(identidadDeFuente(f, 0)).toContain('https://ejemplo.org/norma')
  })

  it('un documento sin título se dice, no se deja en blanco', () => {
    expect(identidadDeFuente({ content: 'algo' }, 0)).toBe('[F1] Documento sin título')
  })
})

describe('el bloque de conocimiento', () => {
  it('numera las fuentes con la marca que el modelo tiene que usar', () => {
    const bloque = contextoDeConocimiento([fuente({ section: '4.2' }), fuente({ title: 'Otra' })])
    expect(bloque).toContain('[F1] NOM-013-CONAGUA-2015 — sección 4.2')
    expect(bloque).toContain('[F2] Otra')
    expect(marcaDeFuente(0)).toBe('F1')
  })

  it('pide citar con la marca y prohíbe inventar la sección', () => {
    const bloque = contextoDeConocimiento([fuente()])
    expect(bloque).toMatch(/va con su marca/)
    expect(bloque).toMatch(/No cites una sección o una página que no aparezca/)
  })

  it('manda decirlo cuando la respuesta no está en las fuentes', () => {
    // Es la regla que separa una cifra comprobable de una inventada.
    expect(contextoDeConocimiento([fuente()])).toMatch(/no está en ellas, dilo/)
  })

  it('las reglas van después de las fuentes, no antes', () => {
    // Antes quedarían a miles de caracteres del momento de responder.
    const bloque = contextoDeConocimiento([fuente()])
    expect(bloque.indexOf('Cómo usar lo anterior')).toBeGreaterThan(bloque.indexOf('[F1]'))
  })

  it('lleva el contenido de cada fuente, que es lo que se responde', () => {
    expect(contextoDeConocimiento([fuente()])).toContain('El diámetro mínimo en red de distribución es de 100 mm.')
  })

  it('sin fuentes lo dice, y no deja creer que no hay sistema', () => {
    const bloque = contextoDeConocimiento([])
    expect(bloque).toMatch(/No se encontró nada relevante/)
    expect(bloque).toMatch(/sí lo tienes y se ha consultado/)
    // Y no cuela el andamiaje de un bloque vacío.
    expect(bloque).not.toContain('=== CONOCIMIENTO CONSULTADO ===')
    expect(bloque).not.toContain('[F1]')
  })

  it('avisa de que las fuentes no son toda la normativa que existe', () => {
    // Sin esto, a «¿qué dice la norma de Colombia?» responde con lo que haya
    // encontrado de México, que es peor que no responder.
    expect(contextoDeConocimiento([fuente()])).toMatch(/no toda la normativa que existe/)
  })
})
