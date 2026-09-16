/**
 * Ventana de simulación compartida (#142).
 *
 * Antes cada panel fijaba sus horas por su cuenta —24 h en el formulario de
 * interrupción, 24 h a fuego en el de energía— mientras la tarjeta de análisis
 * usaba la duración escrita en el .inp. La misma red daba así cifras distintas
 * según la pantalla, sin nada que dijera sobre qué ventana estaba calculada.
 *
 * La duración del fichero es la opción por defecto porque es la que el modelo
 * declara: si alguien escribió 168 h en el .inp, el ciclo que quiere
 * representar dura una semana, y recortarlo a 24 h mide un transitorio de
 * llenado en vez del régimen normal.
 */

export type Ventana = 'fichero' | '24' | '72' | '168'

export const VENTANA_POR_DEFECTO: Ventana = 'fichero'

/** Horas fijas de cada opción; `fichero` las toma del modelo. */
const HORAS: Record<Exclude<Ventana, 'fichero'>, number> = {
  '24': 24,
  '72': 72,
  '168': 168,
}

/** Cuando el .inp no declara duración utilizable, se cae aquí. */
export const HORAS_DE_RESPALDO = 24

/** A partir de cuántas horas conviene avisar de que la simulación tardará. */
export const HORAS_LARGAS = 72

/** Duración del modelo en horas, a partir de `networkData.options.time`. */
export function horasDelFichero(opcionesTiempo?: { duration?: number } | null): number | null {
  const segundos = opcionesTiempo?.duration
  if (typeof segundos !== 'number' || !Number.isFinite(segundos) || segundos <= 0) return null
  return segundos / 3600
}

export function resolverHoras(ventana: Ventana, horasFichero: number | null): number {
  if (ventana !== 'fichero') return HORAS[ventana]
  return horasFichero ?? HORAS_DE_RESPALDO
}

/** Sin decimales cuando son horas enteras, que es el caso habitual. */
export function formatearHoras(horas: number): string {
  return Number.isInteger(horas) ? String(horas) : horas.toFixed(1)
}
