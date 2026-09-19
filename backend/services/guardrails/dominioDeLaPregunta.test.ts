/**
 * El filtro de dominio (#170).
 *
 * El orden de estos bloques es el orden de importancia, y no es negociable: lo
 * primero que se fija es que **no bloquee nada legítimo**, porque ése es el
 * error caro. Que bloquee lo de fuera viene después.
 */

import { describe, it, expect } from 'vitest'
import { juzgarDominio } from './dominioDeLaPregunta'

const pasa = (p: string) => juzgarDominio(p).pasa

describe('lo que nunca puede bloquear', () => {
  it('cualquier pregunta de hidráulica, en los tres idiomas', () => {
    for (const pregunta of [
      '¿Qué presión mínima exige la norma en un nudo de consumo?',
      '¿Cuáles son las hipótesis del hidrograma unitario?',
      '¿Cómo se estima la evapotranspiración potencial?',
      '¿Qué diámetro le pongo a la tubería 101?',
      '¿Qué anomalías salieron en la última simulación?',
      'Explícame el índice de Todini',
      'What is the minimum pressure required at a junction?',
      'How do I size a pump for this network?',
      'Quin cabal circula per la canonada principal?',
    ]) {
      expect(pasa(pregunta), pregunta).toBe(true)
    }
  })

  it('un saludo, un agradecimiento y una pregunta sobre el propio asistente', () => {
    for (const pregunta of ['Hola, buenos días', 'Gracias', '¿Qué puedes hacer?', 'Bon dia']) {
      expect(pasa(pregunta), pregunta).toBe(true)
    }
  })

  it('una pregunta sin ninguna señal reconocible', () => {
    // No hay que demostrar que algo es del dominio: hay que demostrar que no
    // lo es. Una pregunta de seguimiento suele no traer ni una palabra clave.
    for (const pregunta of ['¿Y el valor de C en esa fórmula?', 'Sigue', '¿Por qué?', 'Amplía el punto 2']) {
      expect(pasa(pregunta), pregunta).toBe(true)
    }
  })

  it('una pregunta del dominio que además menciona algo de fuera', () => {
    // «¿Qué tubería uso en la cocina?» es fontanería, no cocina. El indulto
    // gana siempre a la acusación.
    expect(pasa('¿Qué tubería uso para la cocina de la vivienda?')).toBe(true)
    expect(pasa('¿La presión del agua afecta al horno?')).toBe(true)
  })

  it('el texto vacío', () => {
    expect(pasa('')).toBe(true)
    expect(pasa('   ')).toBe(true)
  })
})

describe('lo que sí bloquea', () => {
  it('el caso que lo motivó', () => {
    const juicio = juzgarDominio('Cuantas hamburguesas puedo preparar con un kilo de carne?')
    expect(juicio.pasa).toBe(false)
    expect(juicio.motivo).toBe('hamburguesas')
  })

  it('deporte, política, medicina y programación genérica', () => {
    for (const pregunta of [
      '¿Quién ganó el mundial de fútbol?',
      '¿A quién debería votar en las elecciones?',
      '¿Qué medicamento tomo para el dolor?',
      'Escríbeme una función en Python para ordenar una lista',
      'Dame una receta de tortilla',
    ]) {
      expect(pasa(pregunta), pregunta).toBe(false)
    }
  })

  it('también en inglés y en catalán, que son los otros dos idiomas', () => {
    for (const pregunta of [
      'How many burgers can I make with a kilo of meat?',
      'Give me a recipe for an omelette',
      'Who won the world cup?',
      'Write me a python function to sort a list',
      'Quantes hamburgueses puc fer amb un quilo de carn?',
      "Dona'm una recepta de truita",
      'Qui va guanyar el partit de futbol?',
    ]) {
      expect(pasa(pregunta), pregunta).toBe(false)
    }
  })
})

describe('lo que se deja pasar a sabiendas', () => {
  it('«el mundial de 2022» pasa, y es el precio de no bloquear «norma mundial»', () => {
    // `mundial` a secas bloquearía «estándar mundial» o «norma mundial», que
    // son de lo más corriente aquí. Entre dejar pasar una pregunta de fútbol y
    // bloquear una de normativa, se deja pasar la de fútbol. Las formas largas
    // —«mundial de fútbol», «world cup»— sí se cazan.
    expect(pasa('¿Quién ganó el mundial de 2022?')).toBe(true)
    expect(pasa('¿Qué dice la norma mundial sobre el diámetro?')).toBe(true)
  })
})

describe('los límites de palabra', () => {
  it('no casa dentro de otra palabra', () => {
    // La lección del #161: `potencia` casaba dentro de «potencial» y el agente
    // descartaba la fuente buena. Aquí el mismo descuido bloquearía preguntas.
    expect(pasa('¿Cómo se estima la evapotranspiración potencial?')).toBe(true)
    // «cocina» no debe dispararse desde «cocinado» ni desde un id como C-OCINA.
    expect(pasa('El tramo COCINA-3 pierde carga')).toBe(true)
  })

  it('los acentos y las mayúsculas dan igual', () => {
    expect(pasa('¿Cuántas HAMBURGUESAS salen de un kilo?')).toBe(false)
    expect(pasa('¿Qué PRESIÓN hay en el nudo?')).toBe(true)
  })
})
