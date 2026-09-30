import { describe, it, expect } from 'vitest'
import { terminosDelGlosario } from './glosarioHidraulico'

const LUIS = 'Deseo planificar una prueba de bombeo a caudal variable para ver la eficiencia de un pozo para explotacion de agua subterranean con fines de abastecimiento urbano. El pozo se acaba de perforar y desarrollar, el nivel estatico esta a 20 metros, el diametro del poszo es de 16 pulgadas. Dame una tabla de tiempos, los escalones de caudales a considerar, las precauciones que debo tomar y los equipos de bombeo que debo y no debo utilizar.'

describe('el glosario hidráulico', () => {
  it('nombra el ensayo como el libro: la prueba a caudal variable es un step drawdown test', () => {
    const terminos = terminosDelGlosario(LUIS)
    expect(terminos[0]).toBe('step drawdown test')
    expect(terminos).toEqual(expect.arrayContaining(['time intervals water level measurements', 'well loss coefficient']))
  })

  it('como mucho seis, sin repetir', () => {
    const terminos = terminosDelGlosario(LUIS)
    expect(terminos.length).toBeLessThanOrEqual(6)
    expect(new Set(terminos).size).toBe(terminos.length)
  })

  it('en catalán y sin acentos', () => {
    expect(terminosDelGlosario("Com calculo l'eficiència del pou amb un assaig de bombament esglaonat?"))
      .toEqual(expect.arrayContaining(['step drawdown test', 'pumping test', 'well loss coefficient']))
  })

  it('planificar una red no es diseñar una prueba de bombeo', () => {
    expect(terminosDelGlosario('Quiero planificar la red de distribución del barrio')).toEqual(['water distribution network'])
  })

  it('sin conceptos que reconozca, nada', () => {
    expect(terminosDelGlosario('¿Quién es el autor?')).toEqual([])
  })
})
