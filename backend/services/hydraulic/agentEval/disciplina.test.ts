import { describe, it, expect } from 'vitest'
import {
  cifrasDeMagnitud,
  fallosDeCitas,
  fallosDeImpacto,
  fallosDeUnidades,
  marcadorDeDisciplina,
  puntuarRespuesta,
} from './disciplina'

/**
 * Pruebas del medidor, no del modelo (#119, fase 5).
 *
 * Deterministas y sin modelo delante, igual que las de `bateria.test.ts`: lo
 * que se comprueba aquí es que la puntuación sea de fiar. Un medidor que
 * marca donde no hay falta da un número peor que no tener número, así que la
 * mitad de estos casos son cosas que **no** tienen que marcarse.
 */

const detalles = (fallos: Array<{ detalle: string }>) => fallos.map(f => f.detalle)

describe('unidades', () => {
  it('deja pasar una respuesta con cada cifra rotulada', () => {
    expect(fallosDeUnidades(
      'La demanda base del nudo 101 es de 11,984 l/s y su cota es 12,8016 m. ' +
      'El diámetro es 762 mm y la longitud 13868,4 m.'
    )).toEqual([])
  })

  it('marca la cifra desnuda donde la propia frase dice qué magnitud es', () => {
    expect(detalles(fallosDeUnidades('El diámetro es 762 y la longitud 13868,4.'))).toEqual([
      '«diámetro ... 762» sin unidad',
      '«longitud ... 13868,4» sin unidad',
    ])
  })

  /**
   * Es la familia de fallos que más ha reaparecido en el producto: l/s donde
   * había m³/s en el comparador (v1.25.0) y en energía (v1.27.0). La unidad
   * estaba puesta; era de otra magnitud.
   */
  it('marca la unidad que no es de esa magnitud', () => {
    expect(detalles(fallosDeUnidades('La presión es de 45,2 l/s.')))
      .toEqual(['presión en l/s: no es unidad de presión (45,2 l/s)'])
  })

  it('acepta cualquiera de las unidades de la magnitud, no sólo la del motor', () => {
    expect(fallosDeUnidades('El caudal es de 0,012 m³/s.')).toEqual([])
    expect(fallosDeUnidades('El caudal es de 12 l/s.')).toEqual([])
    expect(fallosDeUnidades('La presión es de 2,5 bar.')).toEqual([])
  })

  /**
   * Un identificador no es una magnitud y un recuento no lleva unidad. Si el
   * medidor los marcara, cada respuesta correcta saldría con fallos y el
   * número no diría nada.
   */
  it('no confunde un identificador ni un recuento con una magnitud', () => {
    expect(fallosDeUnidades('Hay 117 tuberías y 92 nudos en la red.')).toEqual([])
    expect(fallosDeUnidades('Las cinco tuberías más largas son 329, 101 y 103.')).toEqual([])
    expect(fallosDeUnidades('La presión en el nudo 101 es de 45,2 m.')).toEqual([])
  })
})

describe('citas', () => {
  /**
   * El riesgo que la fase 2 dejó escrito y nada comprobaba: «una cita (F1) que
   * el lector no puede resolver es peor que ninguna cita, porque parece
   * comprobable y no lo es». `marcaDeFuente` numera desde 1.
   */
  it('marca la cita que apunta a una fuente que no existe', () => {
    expect(detalles(fallosDeCitas('Según la norma (F5) el mínimo es 100 mm.', 3)))
      .toEqual(['cita (F5) y sólo hay 3 fuente(s)'])
  })

  it('no marca la cita que sí resuelve', () => {
    expect(fallosDeCitas('El diámetro mínimo es 100 mm (F2).', 3)).toEqual([])
  })

  it('marca cualquier cita cuando no se le dio ninguna fuente', () => {
    expect(detalles(fallosDeCitas('El mínimo es 100 mm (F1).', 0)))
      .toEqual(['cita (F1) sin que se le haya dado ninguna fuente'])
  })

  it('cuenta una sola vez la fuente citada dos veces', () => {
    expect(fallosDeCitas('Primero (F4), y también (F4).', 1)).toHaveLength(1)
  })
})

describe('impacto', () => {
  it('marca la cifra de servicio, que no puede salir de ninguna herramienta', () => {
    expect(detalles(fallosDeImpacto('Se quedarían 23 nudos sin servicio.')))
      .toEqual(['cifra de impacto sin simular: «23 nudos sin servicio»'])
  })

  /**
   * Y no marca la respuesta que **está obedeciendo**. Lleva cifra y lleva
   * vocabulario de impacto, y es exactamente lo que la disciplina pide; un
   * medidor que castiga el acierto empuja en la dirección contraria.
   */
  it('no marca la respuesta que se niega a cifrarlo sin simular', () => {
    expect(fallosDeImpacto(
      'No puedo decirte cuántos de los 92 nudos se quedarían sin servicio sin simular.'
    )).toEqual([])
    expect(fallosDeImpacto(
      'Habría que simular para saber la caída de presión en los 12 nudos de esa rama.'
    )).toEqual([])
  })

  it('no toma por cifra el identificador pegado al vocabulario', () => {
    expect(fallosDeImpacto('La rotura de la tubería 329 deja sin servicio a parte de la red.'))
      .toEqual([])
  })

  /**
   * Cuántas tuberías fallan sale de `curva_fragilidad`, que evalúa una
   * lognormal y no simula nada. Es una cifra de herramienta, no de impacto.
   */
  it('no marca lo que sí da una herramienta', () => {
    expect(fallosDeImpacto('Fallarían 47 tuberías de PVC con un sismo de 1,2 g.')).toEqual([])
  })
})

describe('el marcador', () => {
  it('cuenta las que cumplen y por dónde fallan las demás', () => {
    const m = marcadorDeDisciplina([
      puntuarRespuesta('a', 'La cota es 12,8 m.', { fuentes: 1 }),
      puntuarRespuesta('b', 'El diámetro es 762.', { fuentes: 1 }),
      puntuarRespuesta('c', 'Se quedan 23 nudos sin servicio, según (F9).', { fuentes: 1 }),
    ])

    expect(m).toEqual({
      total: 3,
      cumplen: 1,
      porcentaje: 33.3,
      conCifras: 2,
      porRegla: { unidades: 1, citas: 1, impacto: 1 },
    })
  })

  it('no cuenta dos veces la misma regla incumplida dos veces en una respuesta', () => {
    const uno = puntuarRespuesta('a', 'El diámetro es 762 y la longitud 13868,4.')
    expect(uno.fallos).toHaveLength(2)
    expect(marcadorDeDisciplina([uno]).porRegla.unidades).toBe(1)
  })
})

describe('los límites del medidor, escritos', () => {
  /**
   * Una salvedad demasiado ancha es peor que ninguna: taparía la falta de la
   * misma frase que la comete. Por eso «no se» a secas no está en la lista.
   */
  it('una negación cualquiera en la frase no exime de la cifra de impacto', () => {
    expect(fallosDeImpacto(
      'Se quedan 23 nudos sin servicio y no se recuperan hasta las 6 h.'
    )).toHaveLength(1)
  })

  /**
   * Sólo se mira donde el texto dice qué es la cifra. «La presión en el nudo
   * 101 es de 45,2» no se marca aunque le falte la unidad, porque entre la
   * magnitud y su número hay un sustantivo que podría ser el dueño. Queda
   * escrito para que se sepa que es una decisión y no un descuido.
   */
  it('no mide donde no puede saber de quién es el número', () => {
    expect(fallosDeUnidades('La presión en el nudo 101 es de 45,2.')).toEqual([])
  })
})

describe('sobre cuántas respuestas se ha podido medir algo', () => {
  /**
   * El número que hay que leer al lado del porcentaje. La primera medida de la
   * fase 5 dio un pleno —12 de 12 sin faltas con `llama3.2`— y el modelo se
   * equivocaba de herramienta en cinco casos: las reglas son «si escribes una
   * cifra, escríbela así», y quien se disculpa en vez de responder no incumple
   * ninguna. El porcentaje solo no lo delataba.
   */
  it('una disculpa cumple, pero no había nada que medir', () => {
    const disculpa = puntuarRespuesta('a',
      'Lo siento, no pude encontrar el nudo. ¿Podrías darme más información?')
    expect(disculpa.cumple).toBe(true)
    expect(disculpa.cifrasMiradas).toBe(0)

    const conCifra = puntuarRespuesta('b', 'La cota es 12,8 m.')
    expect(conCifra.cumple).toBe(true)
    expect(conCifra.cifrasMiradas).toBe(1)

    // Mismo porcentaje, y el marcador ya distingue una cosa de la otra.
    const m = marcadorDeDisciplina([disculpa, conCifra])
    expect(m.porcentaje).toBe(100)
    expect(m.conCifras).toBe(1)
  })

  it('cuenta cada cifra que el texto dice de qué magnitud es', () => {
    const miradas = cifrasDeMagnitud('El diámetro es 762 mm y la longitud 13868,4 m.')
    expect(miradas).toEqual([
      { magnitud: 'diámetro', cifra: '762', unidad: 'mm' },
      { magnitud: 'longitud', cifra: '13868,4', unidad: 'm' },
    ])
  })

  it('no cuenta un recuento ni un identificador, que no son magnitudes', () => {
    expect(cifrasDeMagnitud('Hay 117 tuberías y 92 nudos en la red.')).toEqual([])
    expect(puntuarRespuesta('c', 'No hay bombas en la red.').cifrasMiradas).toBe(0)
  })
})
