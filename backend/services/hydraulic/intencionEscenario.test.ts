/**
 * La detección en código de que una pregunta pide un escenario (#44).
 *
 * Existe por una medición: con la pregunta del criterio de aceptación,
 * `nemotron-mini` contestó «10» sin llamar a la herramienta. Lo que se prueba
 * aquí es que la red de seguridad reconozca esa pregunta **y que no se dispare
 * donde no debe**, porque un escenario propuesto a destiempo interrumpe una
 * conversación normal.
 */

import { describe, it, expect } from 'vitest'
import { detectarIntencionEscenario, detectarIntencionEnergia } from './intencionEscenario'
import type { RedCompleta } from './agentTools'

const red: RedCompleta = {
  nodes: [
    { id: '10', type: 'junction', demand: 0.01 },
    { id: '11', type: 'junction', demand: 0.02 },
    { id: 'R1', type: 'reservoir' },
  ],
  links: [
    { id: '12', type: 'pipe', from: '10', to: '11' },
    { id: 'B1', type: 'pump', from: 'R1', to: '10' },
    { id: 'B2', type: 'pump', from: 'R1', to: '11' },
  ],
}

const detectar = (texto: string) => detectarIntencionEscenario(texto, red)

describe('intención de escenario', () => {
  it('reconoce la pregunta del criterio de aceptación', () => {
    const i = detectar('¿cuántos clientes quedan sin servicio si se pierde el control de las bombas 4 horas?')

    expect(i).toMatchObject({ tipo: 'control_loss', duracion_h: 4 })
    expect(i!.elementos).toEqual(['B1', 'B2'])
  })

  it('distingue la familia por lo que la define, no por lo que menciona', () => {
    // Menciona bombas, pero lo que la define es el control.
    expect(detectar('¿y si se pierde el control de las bombas?')!.tipo).toBe('control_loss')
    expect(detectar('¿qué pasa si se para la bomba B1 durante 3 horas?')!.tipo).toBe('pump_outage')
    expect(detectar('¿y si se rompe la tubería 12?')!.tipo).toBe('pipe_break')
    expect(detectar('simula un incendio: la demanda se multiplica por 4 en la red')!.tipo).toBe('demand_surge')
    expect(detectar('¿qué pasa si hay sequía y el embalse R1 baja?')!.tipo).toBe('source_reduction')
  })

  it('lee la ventana temporal y el momento de inicio', () => {
    const i = detectar('¿qué pasa si paramos la bomba B1 desde las 8 durante 4 horas?')
    expect(i).toMatchObject({ desde_h: 8, duracion_h: 4 })
  })

  it('lee el multiplicador de una sobredemanda', () => {
    expect(detectar('¿y si la demanda de toda la red se multiplica por 3?')).toMatchObject({
      tipo: 'demand_surge', multiplicador: 3,
    })
  })

  it('no se dispara sin condicional: un hecho no es una hipótesis', () => {
    // «Se rompió la tubería 12» es un parte de incidencias, no un escenario.
    expect(detectar('Se rompió la tubería 12 esta mañana')).toBeNull()
    expect(detectar('La bomba B1 lleva 4 horas parada')).toBeNull()
  })

  it('no se dispara en una conversación normal', () => {
    expect(detectar('¿qué cota tiene el nudo 10?')).toBeNull()
    expect(detectar('resume mi red hidráulica')).toBeNull()
    expect(detectar('¿qué problemas encontró la última simulación?')).toBeNull()
  })

  it('una rotura hay que nombrarla: no se propone romper la red entera', () => {
    expect(detectar('¿qué pasa si se rompe una tubería?')).toBeNull()
  })

  it('sólo acepta identificadores de la red, y enteros', () => {
    // «4 horas» no puede convertirse en el nudo 4, ni «B9» existir porque el
    // usuario lo escriba.
    expect(detectar('¿qué pasa si se para la bomba B9 4 horas?')).toBeNull()
    const i = detectar('¿y si se rompe la tubería 12 durante 2 horas?')
    expect(i!.elementos).toEqual(['12'])
  })

  it('acepta los ids como los escriba el usuario, sin distinguir mayúsculas', () => {
    expect(detectar('¿qué pasa si se para la bomba b1?')!.elementos).toEqual(['B1'])
  })

  it('reconoce una pregunta de eficiencia energética', () => {
    expect(detectarIntencionEnergia('¿cómo puedo reducir el consumo energético del bombeo?')).toBe(true)
    expect(detectarIntencionEnergia('¿qué puedo hacer para ahorrar en la factura de la luz?')).toBe(true)
    expect(detectarIntencionEnergia('recomiéndame medidas para bajar los kWh')).toBe(true)
    expect(detectarIntencionEnergia('¿cuánto me cuesta bombear en hora punta?')).toBe(true)
  })

  it('no confunde una mención con una petición', () => {
    // Un dato suelto no es una pregunta: «la tarifa es de 0,18» no pide nada.
    expect(detectarIntencionEnergia('la tarifa es de 0,18 USD/kWh')).toBe(false)
    expect(detectarIntencionEnergia('gracias')).toBe(false)
    expect(detectarIntencionEnergia('¿qué cota tiene el nudo 10?')).toBe(false)
  })
})
