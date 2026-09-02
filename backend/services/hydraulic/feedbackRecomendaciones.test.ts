/**
 * El registro de si una recomendación sirvió (#42, tercera entrega).
 *
 * Lo que se vigila es lo que hace del registro un dataset y no un contador de
 * pulgares: que cada valoración lleve la ejecución que respaldó la cifra, que
 * volver a valorar sustituya en vez de acumular —dos filas contradictorias sobre
 * la misma ejecución no sirven para entrenar nada— y que la corrección escrita a
 * mano, que es la parte con más valor, no se pierda ni se guarde en blanco.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { FeedbackRecomendacionesService, CATEGORIA_ENERGIA } from './feedbackRecomendaciones'

/** Un prisma de mentira con la memoria justa para estas comprobaciones. */
function prismaFalso(filas: any[] = []) {
  const almacen = [...filas]
  return {
    almacen,
    feedback: {
      create: vi.fn(async ({ data }: any) => {
        const fila = { id: `f${almacen.length + 1}`, createdAt: new Date(2026, 7, 21, almacen.length), ...data }
        almacen.push(fila)
        return fila
      }),
      deleteMany: vi.fn(async ({ where }: any) => {
        const contiene = where?.context?.contains
        for (let i = almacen.length - 1; i >= 0; i--) {
          if (almacen[i].category === where.category && String(almacen[i].context).includes(contiene)) {
            almacen.splice(i, 1)
          }
        }
        return { count: 0 }
      }),
      findMany: vi.fn(async ({ where, orderBy }: any) => {
        let r = almacen.filter(f => f.category === where.category)
        if (where.OR) {
          r = r.filter(f => where.OR.some((o: any) => String(f.context).includes(o.context.contains)))
        }
        r = [...r].sort((a, b) => a.createdAt - b.createdAt)
        if (orderBy?.createdAt === 'desc') r.reverse()
        return r
      }),
    },
  } as never
}

const contexto = {
  medida: { tipo: 'pump_outage', elementos: ['335'], desde_h: 18, hasta_h: 22 },
  ahorro: { energia_kwh: 77.4, coste: 19.49, moneda: 'USD', origen: { clave: 'energy.originSimulated' } },
}

describe('feedback de recomendaciones energéticas', () => {
  let prisma: any
  let servicio: FeedbackRecomendacionesService

  beforeEach(() => {
    prisma = prismaFalso()
    servicio = new FeedbackRecomendacionesService(prisma)
  })

  it('guarda la valoración con la ejecución que respaldó la cifra', async () => {
    await servicio.guardar({ runId: 'run1', titulo: 'Sacar la bomba 335 de punta', rating: 1, contexto })

    const fila = prisma.almacen[0]
    expect(fila.category).toBe(CATEGORIA_ENERGIA)
    expect(fila.rating).toBe(1)
    expect(JSON.parse(fila.context).runId).toBe('run1')
    // La cifra valorada se guarda: sin ella, un −1 no dice qué estaba mal.
    expect(JSON.parse(fila.response)).toMatchObject({ energia_kwh: 77.4, origen: { clave: 'energy.originSimulated' } })
  })

  it('no atribuye las cifras a ningún modelo de lenguaje', async () => {
    await servicio.guardar({ runId: 'run1', titulo: 'x', rating: 1, contexto })
    // Las produjo una simulación. Poner aquí el modelo del chat daría a entender
    // lo contrario justo en el registro que se usaría para entrenar.
    expect(prisma.almacen[0].modelUsed).toBeNull()
  })

  it('volver a valorar sustituye, no acumula', async () => {
    await servicio.guardar({ runId: 'run1', titulo: 'x', rating: 1, contexto })
    await servicio.guardar({ runId: 'run1', titulo: 'x', rating: -1, correccion: 'deja el depósito sin reserva', contexto })

    expect(prisma.almacen).toHaveLength(1)
    expect(prisma.almacen[0].rating).toBe(-1)
    expect(prisma.almacen[0].correction).toBe('deja el depósito sin reserva')
  })

  it('una corrección en blanco no se guarda como texto vacío', async () => {
    await servicio.guardar({ runId: 'run1', titulo: 'x', rating: -1, correccion: '   ', contexto })
    expect(prisma.almacen[0].correction).toBeNull()
  })

  it('devuelve lo valorado indexado por ejecución, para poder enseñarlo al volver', async () => {
    await servicio.guardar({ runId: 'run1', titulo: 'a', rating: 1, contexto })
    await servicio.guardar({ runId: 'run2', titulo: 'b', rating: -1, contexto })

    const marcas = await servicio.de(['run1', 'run2', 'run3'])
    expect(marcas.run1.rating).toBe(1)
    expect(marcas.run2.rating).toBe(-1)
    expect(marcas.run3).toBeUndefined()
  })

  it('sin ejecuciones que consultar no pregunta a la base', async () => {
    expect(await servicio.de([])).toEqual({})
    expect(prisma.feedback.findMany).not.toHaveBeenCalled()
  })

  it('el dataset sale completo y en orden, que es para lo que existe', async () => {
    await servicio.guardar({ runId: 'run1', titulo: 'primera', rating: 1, contexto })
    await servicio.guardar({ runId: 'run2', titulo: 'segunda', rating: -1, correccion: 'no en esta red', contexto })

    const dataset = await servicio.dataset()
    expect(dataset.map(d => d.titulo)).toEqual(['primera', 'segunda'])
    expect(dataset[1]).toMatchObject({ rating: -1, correccion: 'no en esta red' })
    expect(dataset[1].contexto.runId).toBe('run2')
    expect((dataset[1].contexto as any).medida.elementos).toEqual(['335'])
  })
})
