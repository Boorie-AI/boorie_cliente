/**
 * Si la base de conocimiento arranca encendida o apagada (#159).
 *
 * Arrancaba siempre apagada: `wisdomConfig` empieza en `undefined` y
 * `enhancePromptWithRAG` se sale en su primera línea. Para usarla había que
 * abrir el desplegable del chat y pulsar «Activar la base de conocimiento», y
 * nada en la pantalla de subida lo decía.
 *
 * El resultado es el fallo más caro de los que se pueden tener aquí: el usuario
 * sube sus documentos, pregunta por ellos, y recibe una respuesta del
 * conocimiento general del modelo sin que nada indique que sus documentos no se
 * han mirado. No es que falle: es que contesta igual, y parece que ha mirado.
 *
 * ## La regla
 *
 * Si el usuario ha elegido, manda su elección —también si eligió apagarla—.
 * Si no ha elegido nunca, se enciende cuando hay documentos indexados: quien se
 * ha molestado en subirlos quiere que se usen. Sin documentos se queda apagada,
 * porque encenderla no serviría de nada y sólo añadiría espera a cada pregunta.
 */

export interface ConfiguracionConocimiento {
  enabled: boolean
  searchTopK: number
  searchMethod: 'agentic'
  categories: string[]
}

/** Lo que el usuario eligió alguna vez, si eligió. */
export type EleccionGuardada = boolean | null | undefined

export const POR_DEFECTO: Omit<ConfiguracionConocimiento, 'enabled'> = {
  searchTopK: 3,
  searchMethod: 'agentic',
  categories: [],
}

export function configuracionInicialDeConocimiento(
  hayDocumentosIndexados: boolean,
  eleccionDelUsuario: EleccionGuardada = null,
): ConfiguracionConocimiento {
  const enabled = typeof eleccionDelUsuario === 'boolean'
    ? eleccionDelUsuario
    : hayDocumentosIndexados

  return { ...POR_DEFECTO, enabled }
}

/** La clave donde se recuerda la elección, para que sobreviva al reinicio. */
export const CLAVE_ELECCION = 'boorie.baseDeConocimiento.activada'

export function leerEleccion(almacen: Pick<Storage, 'getItem'>): EleccionGuardada {
  try {
    const guardado = almacen.getItem(CLAVE_ELECCION)
    if (guardado === 'true') return true
    if (guardado === 'false') return false
    return null
  } catch {
    // Sin almacenamiento se decide por los documentos, que es el caso normal.
    return null
  }
}

export function guardarEleccion(almacen: Pick<Storage, 'setItem'>, activada: boolean): void {
  try {
    almacen.setItem(CLAVE_ELECCION, String(activada))
  } catch {
    // Que no se pueda recordar no puede impedir usarla ahora.
  }
}
