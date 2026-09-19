/**
 * El rail de entrada, llamado de verdad antes de mandarle nada al modelo (#170).
 *
 * Estaba todo construido —el flujo de Colang que dice «Block: topics totally
 * outside hydraulic engineering», el envoltorio de Python, el handler IPC, el
 * panel de ajustes, y los cuatro rails activados por defecto— y nadie lo
 * llamaba desde el chat. Preguntado «¿cuántas hamburguesas puedo preparar con
 * un kilo de carne?», el asistente contestó «40», que además de no ser asunto
 * suyo es una cifra inventada dicha con el mismo aplomo con el que daría una
 * presión.
 *
 * Las dos reglas de abajo importan más que el bloqueo en sí: **un guardián mal
 * puesto es peor que ninguno**.
 */

/** Lo que devuelve el rail. Sólo se mira `allow`; lo demás es para el log. */
export interface VeredictoGuardian {
  allow?: boolean
  reason?: string
  severity?: string
}

/**
 * Ante la duda, pasa.
 *
 * El juez es `nemotron-mini`, el mismo modelo que ya sabemos que sigue las
 * instrucciones a medias. Bloquear una pregunta legítima de hidráulica es
 * mucho peor que responder una de cocina: lo primero rompe la herramienta para
 * quien la está usando bien. Así que sólo se bloquea con un `allow: false`
 * explícito; un veredicto ausente, ilegible o a medias deja pasar.
 */
export function dejaPasar(veredicto: VeredictoGuardian | null | undefined): boolean {
  return veredicto?.allow !== false
}

export interface ResultadoGuardian {
  pasa: boolean
  motivo?: string
}

/**
 * Comprueba la entrada sin poder colgar el chat.
 *
 * El guardián es otra llamada a un modelo local, y el servicio va por Python:
 * si no está levantado, si tarda o si revienta, la pregunta sigue su camino.
 * Que el guardián no esté disponible no puede dejar al usuario sin poder
 * preguntar; como mucho, sin guardián.
 */
export async function compruebaLaEntrada(
  pedirVeredicto: () => Promise<VeredictoGuardian | null | undefined>,
  msTope = 20000,
): Promise<ResultadoGuardian> {
  try {
    const seAgota = new Promise<'tarde'>(resolve => setTimeout(() => resolve('tarde'), msTope))
    const veredicto = await Promise.race([pedirVeredicto(), seAgota])

    if (veredicto === 'tarde') return { pasa: true }
    if (dejaPasar(veredicto)) return { pasa: true }

    return { pasa: false, motivo: veredicto?.reason?.trim() || undefined }
  } catch {
    return { pasa: true }
  }
}
