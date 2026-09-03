/**
 * Nombres de los ficheros que Boorie deja descargar (issue #110).
 *
 * Lo reportó el Dr. Mora: el fichero de la curva de fragilidad «es .inp y
 * debería ser .csv». Y lo era: el nombre se componía metiendo dentro el de la
 * red, que **ya trae su extensión** —las redes se llaman `Net3 2.inp`—, así que
 * salía `curva_fragilidad_PVC_Net3 2.inp.csv`. Windows oculta por defecto las
 * extensiones conocidas, de modo que en su pantalla ponía
 * `curva_fragilidad_PVC_Net3 2.inp`: un fichero que dice ser lo que no es.
 *
 * El fichero abría bien —la extensión de verdad es la última—, pero eso es
 * peor, no mejor: nadie duda de un nombre que abre.
 */

/** Sólo letras: `red v1.2` no lleva extensión, `Net3 2.inp` sí. */
const EXTENSION = /\.[a-z]{1,5}$/i

/** `Net3 2.inp` → `Net3 2`. Lo que no tenga extensión se devuelve igual. */
export function sinExtension(nombre: string): string {
  return nombre.replace(EXTENSION, '')
}

/**
 * Compone el nombre de una descarga a partir de sus piezas.
 *
 * A cada pieza se le quita la extensión, así que da igual que una venga del
 * nombre de una red: la única extensión del resultado es la que se pide.
 * Las piezas vacías se caen, para no dejar guiones sueltos.
 */
export function nombreDescarga(piezas: (string | null | undefined)[], extension: string): string {
  const limpias = piezas
    .map(p => (p ?? '').trim())
    .filter(p => p.length > 0)
    .map(sinExtension)
    .filter(p => p.length > 0)

  const base = limpias.length > 0 ? limpias.join('_') : 'boorie'
  return `${base}.${extension.replace(/^\./, '')}`
}
