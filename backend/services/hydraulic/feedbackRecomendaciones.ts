/**
 * Si una recomendación energética sirvió o no (#42, tercera entrega).
 *
 * El issue lo pide por una razón concreta y a largo plazo: este registro **es el
 * dataset** que habilitaría el Enfoque B —afinar un modelo con pares
 * (situación → recomendación validada)— y sin él ese camino no se puede ni
 * empezar. Por eso lo que se guarda no es un pulgar suelto: va con la medida, la
 * cifra verificada y **el identificador de la ejecución que la respaldó**, que es
 * lo que convierte un «no me sirve» en un ejemplo utilizable.
 *
 * Se reutiliza el modelo `Feedback` que ya existía en el esquema y nadie usaba,
 * en vez de crear una tabla nueva: sus campos encajan y así el feedback del chat
 * y el de las recomendaciones viven juntos.
 */

import { PrismaClient } from '@prisma/client'

/** Categoría con la que se distingue este feedback del de las respuestas del chat. */
export const CATEGORIA_ENERGIA = 'energia' as const

export interface FeedbackRecomendacion {
  /** La ejecución de WNTR que verificó la cifra. Es la clave con la que se recupera. */
  runId: string
  titulo: string
  /** 1 útil, −1 incorrecta. */
  rating: 1 | -1
  /** Lo que el ingeniero quiera matizar: es la parte con más valor del dataset. */
  correccion?: string | null
  /** La medida y su ahorro verificado, para que el ejemplo se entienda sin la aplicación delante. */
  contexto?: Record<string, unknown>
}

export interface FeedbackGuardado {
  id: string
  runId: string | null
  rating: number
  correccion: string | null
  createdAt: Date
}

/** El sitio donde vive el id de la ejecución dentro de `context`. */
interface ContextoGuardado {
  runId?: string
  [clave: string]: unknown
}

function leerContexto(bruto: string | null): ContextoGuardado {
  if (!bruto) return {}
  try {
    const leido = JSON.parse(bruto)
    return leido && typeof leido === 'object' ? leido as ContextoGuardado : {}
  } catch {
    return {}
  }
}

export class FeedbackRecomendacionesService {
  private prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this.prisma = prisma
  }

  /**
   * Guarda la valoración. Volver a valorar la misma recomendación **sustituye** la
   * anterior en vez de acumular: el dataset quiere la opinión del ingeniero, no
   * su historial de clics, y dos filas contradictorias sobre la misma ejecución
   * no sirven para entrenar nada.
   */
  async guardar(feedback: FeedbackRecomendacion): Promise<FeedbackGuardado> {
    const contexto = { ...(feedback.contexto ?? {}), runId: feedback.runId }

    await this.prisma.feedback.deleteMany({
      where: { category: CATEGORIA_ENERGIA, context: { contains: `"runId":"${feedback.runId}"` } },
    })

    const fila = await this.prisma.feedback.create({
      data: {
        query: feedback.titulo,
        // Lo que se valora es la cifra verificada, así que es lo que se guarda
        // como «respuesta»: sin ella, un −1 no dice qué estaba mal.
        response: JSON.stringify(feedback.contexto?.ahorro ?? {}),
        rating: feedback.rating,
        correction: feedback.correccion?.trim() || null,
        context: JSON.stringify(contexto),
        // Deliberadamente vacío: estas cifras no las produjo ningún modelo de
        // lenguaje, las produjo una simulación. Poner aquí el nombre del modelo
        // del chat daría a entender lo contrario.
        modelUsed: null,
        category: CATEGORIA_ENERGIA,
      },
    })

    return {
      id: fila.id,
      runId: feedback.runId,
      rating: fila.rating,
      correccion: fila.correction,
      createdAt: fila.createdAt,
    }
  }

  /**
   * Lo valorado hasta ahora, indexado por ejecución, para que la interfaz pueda
   * enseñar la marca al volver a abrir el panel en vez de pedirla otra vez.
   */
  async de(runIds: string[]): Promise<Record<string, FeedbackGuardado>> {
    if (runIds.length === 0) return {}

    const filas = await this.prisma.feedback.findMany({
      where: {
        category: CATEGORIA_ENERGIA,
        OR: runIds.map(runId => ({ context: { contains: `"runId":"${runId}"` } })),
      },
      orderBy: { createdAt: 'desc' },
    })

    const porEjecucion: Record<string, FeedbackGuardado> = {}
    for (const fila of filas) {
      const runId = leerContexto(fila.context).runId
      // El primero que se encuentra gana, y vienen ordenadas de más reciente a
      // más antigua: si quedaran restos de una valoración anterior, manda la última.
      if (runId && !porEjecucion[runId]) {
        porEjecucion[runId] = {
          id: fila.id,
          runId,
          rating: fila.rating,
          correccion: fila.correction,
          createdAt: fila.createdAt,
        }
      }
    }
    return porEjecucion
  }

  /**
   * El dataset acumulado, que es para lo que existe todo esto.
   *
   * Se devuelve entero y sin resumir a propósito: quien vaya a usarlo para
   * afinar un modelo necesita los pares completos, no una media de estrellas.
   */
  async dataset(): Promise<Array<{ titulo: string; respuesta: string; rating: number; correccion: string | null; contexto: ContextoGuardado; createdAt: Date }>> {
    const filas = await this.prisma.feedback.findMany({
      where: { category: CATEGORIA_ENERGIA },
      orderBy: { createdAt: 'asc' },
    })
    return filas.map(fila => ({
      titulo: fila.query,
      respuesta: fila.response,
      rating: fila.rating,
      correccion: fila.correction,
      contexto: leerContexto(fila.context),
      createdAt: fila.createdAt,
    }))
  }
}
