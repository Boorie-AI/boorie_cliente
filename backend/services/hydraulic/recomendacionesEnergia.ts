/**
 * Qué medidas de eficiencia energética proponer, y por qué (#42, segunda entrega).
 *
 * Las candidatas las genera **código**, no el modelo. La razón está medida: en el
 * #44, a la pregunta del criterio de aceptación el modelo local contestó «10»
 * —una cifra inventada— sin llamar a ninguna herramienta. Aquí el reparto es el
 * mismo que allí: el análisis dice qué pasa, el código propone qué probar, WNTR
 * dice cuánto se ahorra, y al modelo le queda redactar. Ninguna cifra de ahorro
 * puede venir del modelo, que es el criterio explícito del issue.
 *
 * Sólo se proponen medidas **verificables por simulación**. Una recomendación
 * cualitativa —«revisa las consignas»— no se puede respaldar con una cifra, y
 * este issue existe para que las cifras estén respaldadas.
 */

import { TextoDelMotor } from '../../../src/services/hydraulic/textoDelMotor'

export interface BloqueDeBomba {
  kwh: number
  coste: number
  precio_kwh: number
  desde_h: number | null
  hasta_h: number | null
}

export interface BombaAnalizada {
  nombre: string
  energia_kwh: number
  coste: number
  horas_en_marcha: number
  potencia_media_kw: number
  caudal_medio_m3s: number
  por_bloque_horario?: Record<string, BloqueDeBomba>
  eficiencia?: { origen: string; media_pct: number; minima_pct: number; maxima_pct: number } | null
  punto_optimo?: {
    curva: string
    eficiencia_en_operacion_pct: number
    punto_optimo: { caudal_m3s: number; eficiencia_pct: number }
    desviacion_caudal_pct: number | null
  } | null
}

export interface AnalisisParaRecomendar {
  energia_total_kwh: number
  coste_total: number
  moneda: string
  bombas: BombaAnalizada[]
  tarifa_aplicada: { moneda: string; precio_kwh: number; bloques: Array<{ nombre: string; desde_h: number; hasta_h: number; precio_kwh: number }> }
}

export interface Candidata {
  /** Identificador estable, para poder atar el resultado verificado a su candidata. */
  id: string
  clase: 'traslado_horario' | 'punto_optimo'
  titulo: TextoDelMotor
  /** Por qué se propone, con las cifras del análisis (no del ahorro, que aún no existe). */
  motivo: TextoDelMotor
  /** Qué se le va a pedir al motor. Es el vocabulario de eventos del #43, más `pump_bep`. */
  medida: { tipo: string; elementos: string[]; desde_h?: number; hasta_h?: number }
  /**
   * Qué clase de decisión implica. Un traslado de horario se hace mañana; llevar
   * una bomba a su punto óptimo exige comprarla o redimensionarla, y comparar
   * las dos cifras sin decirlo sería engañoso.
   */
  naturaleza: 'operativa' | 'equipo'
  /** Para ordenar: el coste que hoy se está pagando y que la medida toca. */
  costeEnJuego: number
}

/** Cuántos puntos de eficiencia por debajo del óptimo se consideran señal. */
const BRECHA_MINIMA_PCT = 10
/** Cuánto por debajo del caudal óptimo empieza a ser un problema de dimensionado. */
const DESVIACION_MINIMA_PCT = 20

const numero = (n: number, decimales = 1) => n.toFixed(decimales).replace('.', ',')

/**
 * Las candidatas, ordenadas por el dinero que hay en juego.
 *
 * @param maximo Cuántas devolver. Cada verificación son **dos** simulaciones de
 *   periodo extendido, así que el tope no es cosmético: en una máquina sin GPU,
 *   cinco candidatas son diez simulaciones y varios minutos de espera.
 */
export function generarCandidatas(analisis: AnalisisParaRecomendar, maximo = 3): Candidata[] {
  const candidatas: Candidata[] = []
  const moneda = analisis.moneda
  const precioBase = analisis.tarifa_aplicada?.precio_kwh ?? 0

  // 1. Bombeo en horas caras. La señal es que la bomba consuma en un bloque más
  //    caro que el precio base: ahí el mismo kWh cuesta más, y moverlo es la
  //    medida que el issue pone primero.
  for (const bomba of analisis.bombas) {
    for (const [nombre, bloque] of Object.entries(bomba.por_bloque_horario ?? {})) {
      if (bloque.precio_kwh <= precioBase || bloque.kwh <= 0) continue
      if (bloque.desde_h === null || bloque.hasta_h === null) continue

      candidatas.push({
        id: `traslado:${bomba.nombre}:${nombre}`,
        clase: 'traslado_horario',
        titulo: {
          clave: 'recomendacion.trasladoTitulo',
          datos: { bomba: bomba.nombre, bloque: nombre },
        },
        motivo: {
          clave: 'recomendacion.trasladoMotivo',
          datos: {
            kwh: numero(bloque.kwh),
            precio: numero(bloque.precio_kwh, 3),
            moneda,
            base: numero(precioBase, 3),
            coste: numero(bloque.coste, 2),
            total: numero(bomba.coste, 2),
          },
        },
        medida: {
          tipo: 'pump_outage',
          elementos: [bomba.nombre],
          desde_h: bloque.desde_h,
          hasta_h: bloque.hasta_h,
        },
        naturaleza: 'operativa',
        costeEnJuego: bloque.coste,
      })
    }
  }

  // 2. Bombas lejos de su punto óptimo. Se agrupan en una sola candidata porque
  //    cada verificación cuesta dos simulaciones y la cifra que interesa es la
  //    brecha total; el motivo dice bomba a bomba de dónde sale.
  const lejos = analisis.bombas.filter(b => {
    const po = b.punto_optimo
    if (!po) return false
    const brecha = po.punto_optimo.eficiencia_pct - po.eficiencia_en_operacion_pct
    const desviacion = Math.abs(po.desviacion_caudal_pct ?? 0)
    return brecha >= BRECHA_MINIMA_PCT || desviacion >= DESVIACION_MINIMA_PCT
  })

  if (lejos.length > 0) {
    // El detalle es una bomba por trozo: cada uno es un texto del motor, y
    // quien lo enseña los traduce y los pega.
    const detalle: TextoDelMotor[] = lejos.map(b => {
      const po = b.punto_optimo!
      const desviacion = po.desviacion_caudal_pct
      return {
        clave: 'recomendacion.optimoDetalle',
        datos: {
          bomba: b.nombre,
          actual: numero(po.eficiencia_en_operacion_pct),
          optimo: numero(po.punto_optimo.eficiencia_pct),
          caudal: '',
        },
        listas: desviacion !== null && Math.abs(desviacion) >= DESVIACION_MINIMA_PCT
          ? {
              caudal: [{
                clave: 'recomendacion.optimoCaudal',
                datos: {
                  desviacion: numero(Math.abs(desviacion), 0),
                },
                listas: {
                  sentido: [{ clave: desviacion < 0 ? 'recomendacion.porDebajo' : 'recomendacion.porEncima' }],
                },
              }],
            }
          : undefined,
      }
    })

    candidatas.push({
      id: `optimo:${lejos.map(b => b.nombre).join('+')}`,
      clase: 'punto_optimo',
      titulo: lejos.length === 1
        ? { clave: 'recomendacion.optimoTituloUna', datos: { bomba: lejos[0].nombre } }
        : { clave: 'recomendacion.optimoTituloVarias', datos: { count: lejos.length } },
      motivo: { clave: 'recomendacion.optimoMotivo', listas: { detalle } },
      medida: { tipo: 'pump_bep', elementos: lejos.map(b => b.nombre) },
      naturaleza: 'equipo',
      costeEnJuego: lejos.reduce((suma, b) => suma + b.coste, 0),
    })
  }

  return candidatas
    .sort((a, b) => b.costeEnJuego - a.costeEnJuego)
    .slice(0, Math.max(1, maximo))
}
