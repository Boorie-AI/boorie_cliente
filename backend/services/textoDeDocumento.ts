/**
 * Si de un fichero se ha sacado texto de verdad, o no se ha sacado nada (#157).
 *
 * Cuando la extracción fallaba o salía vacía, se guardaba un relleno **como si
 * fuera el contenido del documento**: se troceaba, se le generaban embeddings y
 * se indexaba. La subida se reportaba correcta y la ficha aparecía indexada.
 *
 * En una base real, de tres documentos subidos dos eran esto:
 *
 *     1.1 Fuentes-Superficiales   69 caracteres
 *     "PDF Document: 1.1 Fuentes-Superficiales.pdf\n(Empty content extracted)"
 *
 * Cada uno con su fragmento y su vector, compitiendo en las búsquedas. El
 * usuario cree que tiene tres documentos indexados y tiene uno. Es la peor
 * clase de fallo de los que hemos visto esta semana: la aplicación afirma que
 * algo está hecho cuando no lo está, y nada en la pantalla lo desmiente.
 *
 * El relleno venía de tres sitios distintos —el ayudante compartido, la subida
 * de un fichero y la subida de una carpeta—, cada uno con su propia frase
 * inventada. Aquí hay una sola decisión, y las tres rutas la usan.
 */

/** Por qué un fichero no ha dado texto aprovechable. */
export type MotivoSinTexto = 'vacio' | 'ilegible' | 'formato-no-soportado'

export interface TextoDeDocumento {
  /** El texto extraído. Vacío cuando hay `problema`. */
  texto: string
  /** Ausente cuando se pudo leer. */
  problema?: MotivoSinTexto
  /** El detalle técnico, para el log. Nunca se guarda como contenido. */
  detalle?: string
}

/**
 * Por debajo de esto no hay documento que indexar.
 *
 * Un PDF escaneado sin OCR devuelve entre cero y unos pocos caracteres sueltos
 * de los metadatos. Cincuenta es el listón que ya usaba la subida para avisar
 * por el log; la diferencia es que ahora decide en lugar de comentar.
 */
export const MINIMO_CARACTERES = 50

/** ¿Hay texto suficiente para que indexarlo signifique algo? */
export function hayTextoAprovechable(texto: string | null | undefined): boolean {
  return (texto ?? '').trim().length >= MINIMO_CARACTERES
}

/** Lo que se pudo leer, o el motivo por el que no. */
export function textoLeido(texto: string | null | undefined): TextoDeDocumento {
  return hayTextoAprovechable(texto)
    ? { texto: (texto as string).trim() }
    : { texto: '', problema: 'vacio' }
}

/** Lo que no se pudo leer, con su detalle para el log. */
export function textoIlegible(error: unknown): TextoDeDocumento {
  return {
    texto: '',
    problema: 'ilegible',
    detalle: error instanceof Error ? error.message : String(error),
  }
}

/** Un formato que no sabemos abrir, como el `.doc` binario. */
export function formatoNoSoportado(detalle: string): TextoDeDocumento {
  return { texto: '', problema: 'formato-no-soportado', detalle }
}

/**
 * Qué decirle a quien subió el fichero.
 *
 * En su idioma no: esto viaja por IPC hasta el renderer, que es quien traduce.
 * Aquí se devuelve la clave y el nombre del fichero.
 */
export function claveDelProblema(problema: MotivoSinTexto): string {
  return `wisdom.sinTexto.${problema}`
}

/**
 * Las frases que la versión anterior fabricaba y guardaba como si fueran el
 * documento (#157).
 *
 * Hacen falta aparte del listón de caracteres, y la razón desarma: el relleno
 * **supera** los cincuenta caracteres, porque lleva el nombre del fichero
 * dentro. «PDF Document: 1.1 Fuentes-Superficiales.pdf\n(Empty content
 * extracted)» son sesenta y nueve. Un documento vacío pasaba por documento
 * corto.
 *
 * Esta lista es histórica: son exactamente las cadenas que escribían las tres
 * rutas de extracción antes de unificarse. No se generan ya; sirven para
 * reconocer lo que quedó indexado en las bases de quien viene de antes.
 */
export const RELLENOS_DE_ANTES = [
  '(Empty content extracted)',
  'Unable to extract text content',
  'Error extracting content:',
  'Legacy binary Word formats are not supported',
  '[SYSTEM WARNING: This document appears to have little to no text content',
]

/** ¿Es esto un documento, o el relleno que se guardaba cuando no se pudo leer? */
export function esRellenoFabricado(texto: string | null | undefined): boolean {
  const t = (texto ?? '').trim()
  if (!t) return false
  return RELLENOS_DE_ANTES.some(r => t.includes(r))
}

/**
 * Lo que hay que enseñar como «indexado sin nada dentro»: lo corto y lo
 * fabricado. Es la pregunta que se hace la comprobación de salud.
 */
export function indexadoSinContenido(texto: string | null | undefined): boolean {
  return !hayTextoAprovechable(texto) || esRellenoFabricado(texto)
}

/**
 * La condición SQL que encuentra los indexados sin contenido, sin traérselos.
 *
 * Hace falta en SQL y no en JavaScript porque la comprobación de estado corre
 * a menudo y la base de un usuario real tiene 241 MB de contenido: pedirlo
 * entero para mirar su longitud costaba **935 MB de memoria** cada vez (#174).
 * Con esto se transfieren identificadores y títulos, y el trabajo lo hace
 * SQLite.
 */
export function condicionSinContenido(columna = 'content'): string {
  const cortos = `length(trim(${columna})) < ${MINIMO_CARACTERES}`
  const rellenos = RELLENOS_DE_ANTES
    .map(r => `${columna} LIKE '%${r.replace(/'/g, "''")}%'`)
    .join(' OR ')
  return `(${cortos} OR ${rellenos})`
}
