/**
 * La tarifa decide si una recomendación de eficiencia energética tiene sentido o
 * no: el mismo kWh vale el doble a las siete de la tarde que a las tres de la
 * mañana (#42). Lo que se prueba aquí es que un dato mal escrito no se convierta
 * en un precio inventado ni tire la tarifa entera.
 */

import { describe, it, expect } from 'vitest'
import { normalizarTarifa, bloquesSolapados, TARIFA_POR_DEFECTO } from './tarifaElectrica'

describe('tarifa eléctrica', () => {
  it('sin nada guardado rige el valor por defecto, sin bloques inventados', () => {
    expect(normalizarTarifa(null)).toEqual(TARIFA_POR_DEFECTO)
    // Inventar una punta de 18 a 22 para todo el mundo daría recomendaciones con
    // horas que no son las de su factura.
    expect(normalizarTarifa({}).bloques).toEqual([])
  })

  it('conserva lo que el usuario escribió bien', () => {
    const t = normalizarTarifa({
      moneda: 'COP',
      precio_kwh: 0.21,
      bloques: [{ nombre: 'punta', desde_h: 18, hasta_h: 22, precio_kwh: 0.31 }],
      eficienciaGlobal: 68,
    })

    expect(t.moneda).toBe('COP')
    expect(t.precio_kwh).toBe(0.21)
    expect(t.bloques).toHaveLength(1)
    expect(t.bloques[0]).toMatchObject({ nombre: 'punta', desde_h: 18, hasta_h: 22, precio_kwh: 0.31 })
    expect(t.eficienciaGlobal).toBe(68)
  })

  it('un bloque sin horas utilizables se descarta, y el resto sigue valiendo', () => {
    const t = normalizarTarifa({
      bloques: [
        { nombre: 'valle', desde_h: 0, hasta_h: 6, precio_kwh: 0.09 },
        { nombre: 'imposible', desde_h: 5, hasta_h: 5, precio_kwh: 0.5 },
        { nombre: 'sin horas' } as never,
      ],
    })

    expect(t.bloques.map(b => b.nombre)).toEqual(['valle'])
  })

  it('un bloque sin precio hereda el general en vez de salir a cero', () => {
    const t = normalizarTarifa({ precio_kwh: 0.2, bloques: [{ nombre: 'llano', desde_h: 6, hasta_h: 18 } as never] })
    expect(t.bloques[0].precio_kwh).toBe(0.2)
  })

  it('la eficiencia se acota: 0,75 es un error de unidades, no una bomba', () => {
    // Quien escriba la fracción en vez del porcentaje vería consumos cien veces
    // mayores sin que nada se lo dijera.
    expect(normalizarTarifa({ eficienciaGlobal: 0.75 }).eficienciaGlobal).toBe(10)
    expect(normalizarTarifa({ eficienciaGlobal: 250 }).eficienciaGlobal).toBe(100)
  })

  it('avisa de los bloques que se pisan, incluido el que cruza la medianoche', () => {
    const solapados = bloquesSolapados(normalizarTarifa({
      bloques: [
        { nombre: 'noche', desde_h: 22, hasta_h: 6, precio_kwh: 0.09 },
        { nombre: 'madrugada', desde_h: 0, hasta_h: 4, precio_kwh: 0.05 },
      ],
    }))

    expect(solapados).toEqual([['noche', 'madrugada']])
  })

  it('no avisa cuando los bloques sólo se tocan por el extremo', () => {
    const solapados = bloquesSolapados(normalizarTarifa({
      bloques: [
        { nombre: 'valle', desde_h: 0, hasta_h: 6, precio_kwh: 0.09 },
        { nombre: 'punta', desde_h: 18, hasta_h: 22, precio_kwh: 0.25 },
      ],
    }))

    expect(solapados).toEqual([])
  })
})
