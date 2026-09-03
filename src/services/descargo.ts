/**
 * Descargo de responsabilidad (issue #108).
 *
 * Boorie produce cifras sobre las que alguien decide dónde reforzar una red o
 * cuánto presupuestar una reparación. El descargo se acepta una vez, y esa
 * aceptación deja constancia: quién la dio no lo sabemos, pero sí qué versión
 * del texto y cuándo, que es lo que se pregunta en una auditoría.
 *
 * Se guarda en la base y no en `localStorage` a propósito: localStorage se
 * borra al limpiar los datos del navegador y volvería a pedirse, perdiendo
 * además la fecha real de la primera aceptación (decidido en el #108).
 *
 * Se usa el almacén clave/valor `AppSetting`, que ya existe y ya se usa así en
 * `networkVersions.ts`, en lugar de un modelo nuevo: no hace falta migrar el
 * esquema para guardar dos datos.
 */

/**
 * Versión del texto aceptado.
 *
 * Subir **sólo** cuando el texto cambie de forma sustancial: corregir una
 * errata no debe volver a pedir la aceptación a todo el mundo, porque un
 * diálogo que reaparece cada dos por tres deja de leerse (#108).
 */
export const VERSION_DESCARGO = 1

const CLAVE = 'descargo.aceptacion'
const CATEGORIA = 'general'

export interface AceptacionDescargo {
  version: number
  /** ISO 8601. */
  fecha: string
}

/**
 * Lo aceptado, o `null` si nunca se aceptó.
 *
 * Un valor ilegible se trata como «no aceptado»: es preferible volver a
 * preguntar que dar por buena una constancia que no se puede leer.
 */
export async function leerAceptacion(): Promise<AceptacionDescargo | null> {
  try {
    const crudo = await window.electronAPI?.database?.getSetting?.(CLAVE)
    if (!crudo) return null
    const valor = typeof crudo === 'string' ? crudo : (crudo as { value?: string }).value
    if (!valor) return null
    const dato = JSON.parse(valor) as AceptacionDescargo
    return typeof dato?.version === 'number' ? dato : null
  } catch {
    return null
  }
}

export async function guardarAceptacion(version = VERSION_DESCARGO): Promise<AceptacionDescargo> {
  const aceptacion: AceptacionDescargo = { version, fecha: new Date().toISOString() }
  await window.electronAPI?.database?.setSetting?.(CLAVE, JSON.stringify(aceptacion), CATEGORIA)
  return aceptacion
}

/**
 * Si hay que enseñar el diálogo.
 *
 * Compara con `<`, no con `!==`: quien aceptó una versión posterior —porque
 * abrió una versión más nueva de Boorie y luego volvió a ésta— no tiene que
 * volver a aceptar nada.
 */
export function hayQueAceptar(aceptacion: AceptacionDescargo | null): boolean {
  return !aceptacion || aceptacion.version < VERSION_DESCARGO
}
