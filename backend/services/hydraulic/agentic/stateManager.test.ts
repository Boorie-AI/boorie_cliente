/**
 * De qué cree el agente que va la pregunta (#161).
 *
 * Esto parece inofensivo y no lo es: el tipo de cálculo detectado viaja hasta
 * el prompt del juez —«Ten en cuenta que la pregunta trata sobre …»— y decide
 * qué documentos se descartan. Una clasificación equivocada no se ve por ningún
 * sitio; lo que se ve es que la respuesta no cita la fuente que sí tenía la
 * respuesta.
 */

import { describe, it, expect } from 'vitest'
import { createStateManager } from './stateManager'

const tipoDe = (pregunta: string) => createStateManager(pregunta).getState().calculationType
const dominioDe = (pregunta: string) => createStateManager(pregunta).getState().engineeringDomain

describe('el tipo de cálculo no se detecta dentro de otra palabra', () => {
  it('«evapotranspiración potencial» no es selección de bombas', () => {
    // El caso real: `potencia` casaba dentro de `potencial`, al juez se le
    // decía que la pregunta iba de bombas y rechazaba las tres fuentes
    // recuperadas, incluida la que respondía.
    expect(tipoDe('Según la documentación indexada, ¿cómo se estima la evapotranspiración potencial?'))
      .toBeUndefined()
  })

  it('pero «qué potencia necesita la bomba» sí lo es', () => {
    expect(tipoDe('¿Qué potencia necesita la bomba 3?')).toBe('pump_selection')
  })

  it('cada cálculo se reconoce por su nombre completo', () => {
    expect(tipoDe('¿Cómo calculo la pérdida de carga?')).toBe('head_loss')
    expect(tipoDe('¿Qué caudal circula por la tubería 101?')).toBe('flow_rate')
    expect(tipoDe('¿Qué presión hay en el nudo 12?')).toBe('pressure')
    expect(tipoDe('¿Qué diámetro mínimo exige la norma?')).toBe('pipe_sizing')
    expect(tipoDe('¿Qué velocidad lleva el agua?')).toBe('velocity')
  })

  it('una pregunta que no va de ningún cálculo no se clasifica', () => {
    for (const pregunta of [
      '¿Cuáles son las hipótesis del hidrograma unitario?',
      '¿Qué es un hietograma?',
      '¿Cómo se mide la infiltración?',
    ]) {
      expect(tipoDe(pregunta), pregunta).toBeUndefined()
    }
  })
})

describe('el dominio', () => {
  it('se reconoce cuando la pregunta lo nombra, y si no queda en general', () => {
    expect(dominioDe('¿Cómo se diseña una red de agua potable?')).toBe('water_distribution')
    expect(dominioDe('¿Cómo se dimensiona el alcantarillado?')).toBe('sewage')
    expect(dominioDe('¿Cuáles son las hipótesis del hidrograma unitario?')).toBe('general')
  })
})
