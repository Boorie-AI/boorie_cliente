export const IDIOMAS = ['es', 'ca', 'en'] as const
export type Idioma = (typeof IDIOMAS)[number]

export const IDIOMA_POR_DEFECTO: Idioma = 'es'

export function esIdioma(valor: unknown): valor is Idioma {
  return typeof valor === 'string' && (IDIOMAS as readonly string[]).includes(valor)
}

/**
 * El primero de los idiomas del sistema que la aplicación tiene, mirando sólo
 * la raíz («ca-ES» es catalán). Si no hay ninguno, castellano.
 */
export function idiomaDelSistema(preferidos: readonly string[]): Idioma {
  for (const etiqueta of preferidos) {
    const raiz = etiqueta.toLowerCase().split(/[-_]/)[0]
    if (esIdioma(raiz)) return raiz
  }
  return IDIOMA_POR_DEFECTO
}

export function idiomasDelNavegador(): readonly string[] {
  if (typeof navigator === 'undefined') return []
  if (navigator.languages?.length) return navigator.languages
  return navigator.language ? [navigator.language] : []
}
