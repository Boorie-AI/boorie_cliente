/**
 * Tarifa eléctrica, por proyecto (#42).
 *
 * Sin precio no hay optimización económica, sólo aritmética hidráulica: el mismo
 * kWh ahorrado vale el doble a las siete de la tarde que a las tres de la
 * mañana, y toda la recomendación de «mover el bombeo a horas valle» depende de
 * esa diferencia. Por eso la tarifa es un dato del proyecto y no una constante.
 *
 * Va por proyecto y no sólo global porque, como señaló Luis Mora al validar el
 * issue, el precio «se modela por país, generalmente para ALC oscila entre 0,14 y
 * 0,25 USD/kWh», depende de la estación y de la hora, y un despacho puede llevar
 * proyectos en varios países a la vez.
 *
 * Se sigue el mismo mecanismo de herencia que los ajustes de indexación (#41):
 * un proyecto sin tarifa propia usa la general y sigue sus cambios; en cuanto
 * guarda la suya, se desengancha. La diferencia se puede consultar, para que la
 * pantalla no muestre los mismos números en los dos casos sin avisar.
 */

import { PrismaClient } from '@prisma/client'

export interface BloqueHorario {
  /** Cómo lo llama la factura: «punta», «valle», «llano»… */
  nombre: string
  desde_h: number
  hasta_h: number
  precio_kwh: number
}

export interface TarifaElectrica {
  moneda: string
  /** Precio de las horas que no cae en ningún bloque. */
  precio_kwh: number
  bloques: BloqueHorario[]
  /**
   * Eficiencia global de bombeo, en porcentaje, para las bombas que no declaran
   * curva. Sólo se usa si el .inp no la trae.
   */
  eficienciaGlobal: number
}

/**
 * 0,18 USD/kWh es el punto medio del rango que Luis Mora da para América Latina
 * y el Caribe. No es una afirmación sobre la tarifa de nadie: es lo que permite
 * que la primera respuesta traiga unidades monetarias, y viaja declarado en cada
 * resultado para que se vea con qué precio se calculó.
 *
 * Sin bloques por defecto: inventar una punta de 18 a 22 para todo el mundo daría
 * recomendaciones con horas que no son las de su factura.
 */
export const TARIFA_POR_DEFECTO: TarifaElectrica = {
  moneda: 'USD',
  precio_kwh: 0.18,
  bloques: [],
  eficienciaGlobal: 75,
}

const CLAVE_TARIFA = 'energia.tarifa'

function claveDe(projectId?: string | null): string {
  return projectId ? `${CLAVE_TARIFA}.${projectId}` : CLAVE_TARIFA
}

function numero(valor: unknown, porDefecto: number, minimo = 0): number {
  const n = typeof valor === 'number' ? valor : Number(valor)
  return Number.isFinite(n) && n >= minimo ? n : porDefecto
}

/**
 * Deja la tarifa en un estado con el que se pueda calcular, tolerando lo que
 * venga a medias o de una versión anterior.
 *
 * Los bloques se saneàn en vez de rechazarse: una hora fuera de rango o un
 * precio negativo son un error de teclado, y descartar la tarifa entera por eso
 * dejaría al proyecto calculando con el precio general sin decírselo. Lo que sí
 * se descarta es un bloque sin horas utilizables, porque no se puede adivinar.
 */
export function normalizarTarifa(crudo: unknown): TarifaElectrica {
  if (!crudo || typeof crudo !== 'object') return TARIFA_POR_DEFECTO
  const t = crudo as Partial<TarifaElectrica>

  const precioBase = numero(t.precio_kwh, TARIFA_POR_DEFECTO.precio_kwh)
  const bloques = Array.isArray(t.bloques)
    ? t.bloques
      .map((b, i) => {
        const desde = numero((b as BloqueHorario)?.desde_h, NaN)
        const hasta = numero((b as BloqueHorario)?.hasta_h, NaN)
        if (!Number.isFinite(desde) || !Number.isFinite(hasta) || desde === hasta) return null
        return {
          nombre: String((b as BloqueHorario)?.nombre || `bloque ${i + 1}`),
          desde_h: Math.min(24, Math.max(0, desde)),
          hasta_h: Math.min(24, Math.max(0, hasta)),
          precio_kwh: numero((b as BloqueHorario)?.precio_kwh, precioBase),
        }
      })
      .filter((b): b is BloqueHorario => b !== null)
    : TARIFA_POR_DEFECTO.bloques

  return {
    moneda: String(t.moneda || TARIFA_POR_DEFECTO.moneda),
    precio_kwh: precioBase,
    bloques,
    // Por debajo del 10% o por encima del 100% no hay bomba, hay un error de
    // unidades: quien escriba 0,75 pensando en fracción vería consumos cien
    // veces mayores sin que nada se lo dijera.
    eficienciaGlobal: Math.min(100, Math.max(10, numero(t.eficienciaGlobal, TARIFA_POR_DEFECTO.eficienciaGlobal, 0))),
  }
}

/**
 * Bloques que se pisan entre sí, si los hay.
 *
 * No se corrigen: gana el primero que encaja, que es lo que hace el cálculo, y
 * eso se puede avisar. Corregirlos por nuestra cuenta cambiaría el precio de
 * unas horas sin que el usuario lo hubiera pedido.
 */
export function bloquesSolapados(tarifa: TarifaElectrica): Array<[string, string]> {
  const cubre = (b: BloqueHorario, hora: number) =>
    b.desde_h < b.hasta_h
      ? hora >= b.desde_h && hora < b.hasta_h
      : hora >= b.desde_h || hora < b.hasta_h

  const solapes: Array<[string, string]> = []
  for (let i = 0; i < tarifa.bloques.length; i++) {
    for (let j = i + 1; j < tarifa.bloques.length; j++) {
      const solapa = Array.from({ length: 24 }, (_, h) => h)
        .some(h => cubre(tarifa.bloques[i], h) && cubre(tarifa.bloques[j], h))
      if (solapa) solapes.push([tarifa.bloques[i].nombre, tarifa.bloques[j].nombre])
    }
  }
  return solapes
}

export class TarifaElectricaService {
  private prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this.prisma = prisma
  }

  /** La que rige para un proyecto: la suya si la tiene, y si no la general. */
  async tarifaDe(projectId?: string | null): Promise<TarifaElectrica> {
    try {
      const claves = projectId ? [claveDe(projectId), CLAVE_TARIFA] : [CLAVE_TARIFA]
      for (const key of claves) {
        const fila = await this.prisma.appSetting.findUnique({ where: { key } })
        if (fila?.value) return normalizarTarifa(JSON.parse(fila.value))
      }
    } catch {
      // Ajuste ausente o ilegible: rige el valor por defecto, declarado en cada
      // resultado para que nadie confunda el precio de Boorie con el suyo.
    }
    return TARIFA_POR_DEFECTO
  }

  /** La tarifa **propia** de un proyecto, o `null` si todavía hereda la general. */
  async tarifaPropiaDe(projectId: string): Promise<TarifaElectrica | null> {
    try {
      const fila = await this.prisma.appSetting.findUnique({ where: { key: claveDe(projectId) } })
      return fila?.value ? normalizarTarifa(JSON.parse(fila.value)) : null
    } catch {
      return null
    }
  }

  /** Devuelve el proyecto a heredar la tarifa general. */
  async olvidarTarifa(projectId: string): Promise<void> {
    await this.prisma.appSetting.deleteMany({ where: { key: claveDe(projectId) } })
  }

  async guardarTarifa(projectId: string | null, tarifa: Partial<TarifaElectrica>): Promise<TarifaElectrica> {
    const key = claveDe(projectId)
    const fusionada = normalizarTarifa({ ...(await this.tarifaDe(projectId)), ...tarifa })

    await this.prisma.appSetting.upsert({
      where: { key },
      update: { value: JSON.stringify(fusionada) },
      create: { key, value: JSON.stringify(fusionada), category: 'energia' },
    })
    return fusionada
  }
}
