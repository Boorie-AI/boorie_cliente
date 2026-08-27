/**
 * Reconoce los resultados de calidad del agua que **no salieron de una
 * simulación** (#79 · auditoría de cifras).
 *
 * Hasta la v1.23.0, «Calidad del Agua» no simulaba nada: corría el modelo
 * hidráulico y fabricaba la calidad a mano —para la edad, una recta de cero a la
 * duración, idéntica en todos los nudos—. Esas ejecuciones **están guardadas en
 * los proyectos** de quien ya usaba Boorie, y en el historial son indistinguibles
 * de las de verdad.
 *
 * No se borran: son datos del usuario y no se tocan sin que lo pida. Se marcan,
 * que es lo que permite distinguirlas cuando vuelva a abrirlas dentro de seis
 * meses. Las dos marcas de abajo las escribía sólo aquel código.
 */

/** La nota que el servicio antiguo adjuntaba a todos sus resultados. */
const NOTA_ANTIGUA = 'Synthetic WQ'
/** Y el estado con el que los rotulaba. */
const ESTADO_ANTIGUO = 'Completed (Simulated)'

interface ResultadoCalidad {
  status?: unknown
  summary?: { note?: unknown; [k: string]: unknown } | null
  [k: string]: unknown
}

/**
 * @param datos El resultado, o **el JSON sin parsear**: el historial lista
 *   docenas de ejecuciones y los resultados de una sola pesan megabytes, así que
 *   sobre el texto se buscan las dos marcas y no se parsea nada. Son cadenas lo
 *   bastante específicas para que no aparezcan por casualidad.
 */
export function esCalidadSintetica(datos: ResultadoCalidad | string | null | undefined): boolean {
  if (!datos) return false

  if (typeof datos === 'string') {
    return datos.includes(NOTA_ANTIGUA) || datos.includes(ESTADO_ANTIGUO)
  }

  const nota = datos.summary?.note
  if (typeof nota === 'string' && nota.includes(NOTA_ANTIGUA)) return true

  return datos.status === ESTADO_ANTIGUO
}
