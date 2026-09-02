import i18n from '@/i18n'
/**
 * Eje temporal de una simulación (#45).
 *
 * El reloj de la interfaz salía de dos constantes: una fecha base inventada
 * (`2025-10-09T00:00:00`) y una hora fija por paso. Para un modelo que reporta
 * cada 15 minutos, el reloj avanzaba cuatro veces más rápido que la simulación,
 * y la fecha no correspondía a nada.
 *
 * WNTR ya devuelve el eje bueno: `timestamps` es el índice de sus resultados, en
 * segundos desde el arranque de la simulación. Y el `.inp` declara su propia hora
 * de inicio en `start_clocktime`. Boorie sólo tiene que leerlos —criterio
 * explícito del Ing. Luis Mora: «eso se define en EPANET; Boorie sólo debe leer
 * ese paso temporal»—.
 */

export interface OpcionesTiempo {
  /** Duración total en segundos. */
  duration?: number
  /** Cada cuánto reporta el modelo, en segundos. */
  report_timestep?: number
  /** Hora de arranque declarada en el .inp, en segundos desde medianoche. */
  start_clocktime?: number
}

export interface LineaTiempo {
  /** Segundos de simulación de cada paso. */
  segundos: number[]
  pasos: number
  /** Un solo paso: es un estado estacionario y no hay nada que reproducir. */
  estacionaria: boolean
  /** Paso de reporte real en segundos; 0 si no se ha podido determinar. */
  intervalo: number
  /**
   * La hora sale del reloj que declara el `.inp`. Cuando no lo declara se
   * muestra tiempo relativo, que es lo honesto: un `start_clocktime` a cero no
   * significa «medianoche», significa que nadie puso una hora.
   */
  conReloj: boolean
}

const VACIA: LineaTiempo = {
  segundos: [0],
  pasos: 1,
  estacionaria: true,
  intervalo: 0,
  conReloj: false,
}

export function construirLineaTiempo(
  timestamps: number[] | undefined | null,
  opciones?: OpcionesTiempo | null
): LineaTiempo {
  const reloj = opciones?.start_clocktime
  const conReloj = typeof reloj === 'number' && Number.isFinite(reloj) && reloj > 0

  const reales = (timestamps ?? []).filter(t => typeof t === 'number' && Number.isFinite(t))

  // Los timestamps de WNTR son la verdad. Sólo cuando no llegan se reconstruye el
  // eje a partir de la duración y el paso de reporte del modelo.
  let segundos = reales
  if (segundos.length === 0) {
    const duracion = opciones?.duration ?? 0
    const paso = opciones?.report_timestep ?? 0
    if (duracion > 0 && paso > 0) {
      segundos = []
      for (let t = 0; t <= duracion; t += paso) segundos.push(t)
    }
  }

  if (segundos.length === 0) return { ...VACIA, conReloj }

  const intervalo =
    segundos.length > 1
      ? segundos[1] - segundos[0]
      : (opciones?.report_timestep ?? 0)

  return {
    segundos,
    pasos: segundos.length,
    estacionaria: segundos.length <= 1,
    intervalo,
    conReloj,
  }
}

function dosDigitos(n: number): string {
  return String(Math.floor(n)).padStart(2, '0')
}

function hhmmss(segundos: number): string {
  const s = Math.max(0, Math.round(segundos))
  return `${dosDigitos(s / 3600)}:${dosDigitos((s % 3600) / 60)}:${dosDigitos(s % 60)}`
}

/**
 * Etiqueta completa de un paso. Sin reloj declarado, tiempo transcurrido con
 * signo —`+04:15:00`— para que se lea como lo que es y no como una hora del día.
 */
export function etiquetaPaso(
  linea: LineaTiempo,
  paso: number,
  opciones?: OpcionesTiempo | null
): string {
  const t = linea.segundos[paso] ?? linea.segundos[linea.segundos.length - 1] ?? 0

  if (!linea.conReloj) return `+${hhmmss(t)}`

  const inicio = opciones?.start_clocktime ?? 0
  const absoluto = inicio + t
  const dia = Math.floor(absoluto / 86400)
  const hora = hhmmss(absoluto % 86400)

  return dia > 0 ? i18n.t('viewer.dayNumber', { hora, dia: dia + 1 }) : hora
}

/** Etiqueta corta para el eje: horas y minutos, sin segundos. */
export function etiquetaCorta(
  linea: LineaTiempo,
  paso: number,
  opciones?: OpcionesTiempo | null
): string {
  const completa = etiquetaPaso(linea, paso, opciones)
  // `\d{2,}`, no `\d{2}`: una simulación de una semana llega a las 168 horas y
  // con dos dígitos la etiqueta se quedaba con los segundos puestos, así que el
  // eje mezclaba «+21:00» con «+105:00:00».
  return completa.replace(/^(\+?\d{2,}:\d{2}):\d{2}/, '$1')
}

/**
 * Marcas repartidas por el eje. Se piden `cuantas` y se devuelven como mucho
 * esas, siempre con el primer y el último paso, para que los extremos del eje no
 * mientan sobre la duración.
 */
export function marcasEje(
  linea: LineaTiempo,
  cuantas: number,
  opciones?: OpcionesTiempo | null
): Array<{ paso: number; texto: string }> {
  if (linea.pasos <= 1) return [{ paso: 0, texto: etiquetaCorta(linea, 0, opciones) }]

  const total = Math.max(2, Math.min(cuantas, linea.pasos))
  const pasos = new Set<number>()
  for (let i = 0; i < total; i++) {
    pasos.add(Math.round((i * (linea.pasos - 1)) / (total - 1)))
  }

  return [...pasos]
    .sort((a, b) => a - b)
    .map(paso => ({ paso, texto: etiquetaCorta(linea, paso, opciones) }))
}

/** Duración total de la simulación, para poder enseñarla junto al eje. */
export function duracionTotal(linea: LineaTiempo): string {
  return hhmmss(linea.segundos[linea.segundos.length - 1] ?? 0)
}
