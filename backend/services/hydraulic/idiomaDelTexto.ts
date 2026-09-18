/**
 * En qué idioma está un fragmento, mirando el fragmento (#160).
 *
 * No se mira lo que dice la base porque lo que dice la base es mentira: la
 * subida guarda `options.language || 'es'` sin comprobar nada, así que en una
 * base real los 301 documentos declaran castellano —incluido un libro de
 * hidrología de 950 000 caracteres escrito entero en inglés—. Y los fragmentos
 * ni siquiera llevan el idioma hasta el almacén vectorial: el nodo de
 * recuperación acaba rellenándolo con el idioma de *la pregunta*, que es
 * justamente el dato que no sirve para decidir si hay que traducir.
 *
 * Se cuentan palabras vacías, que es lo bastante para separar los tres idiomas
 * de la aplicación sobre un fragmento de mil caracteres y no cuesta ni una
 * llamada a un modelo. Ante la duda no se responde: marcar una cita como
 * «traducida del …» equivocándose de idioma es peor que no marcarla.
 */

/** Palabras que separan, no las más frecuentes: «de», «la» o «en» las comparten. */
const VACIAS: Record<string, string[]> = {
  en: ['the', 'of', 'and', 'is', 'to', 'in', 'for', 'that', 'with', 'are', 'be', 'this', 'which', 'as', 'by', 'from', 'it', 'or', 'was', 'at'],
  es: ['que', 'los', 'una', 'por', 'con', 'para', 'del', 'como', 'más', 'pero', 'sus', 'este', 'esta', 'son', 'sobre', 'entre', 'cuando', 'según'],
  ca: ['els', 'les', 'amb', 'per', 'aquesta', 'aquest', 'però', 'més', 'seva', 'seus', 'també', 'quan', 'sobre', 'entre', 'són', 'això', 'fins', 'cap'],
}

/**
 * Cuántas apariciones de más tiene que sacar el ganador sobre el segundo.
 *
 * Castellano y catalán comparten mucho vocabulario, y un texto técnico va lleno
 * de nombres propios y fórmulas que no son de ningún idioma. Sin margen, un
 * fragmento de tablas se resolvía a cara o cruz.
 */
const MARGEN = 3

/** Por debajo de esto no hay texto suficiente para decidir nada. */
const MINIMO_PALABRAS = 20

export function idiomaDelTexto(texto: string | undefined): string | undefined {
  if (!texto) return undefined

  const palabras = texto.toLowerCase().match(/[\p{L}àèéíòóúïüç]+/gu) ?? []
  if (palabras.length < MINIMO_PALABRAS) return undefined

  const cuenta = new Map<string, number>()
  for (const palabra of palabras) {
    for (const [idioma, vacias] of Object.entries(VACIAS)) {
      if (vacias.includes(palabra)) cuenta.set(idioma, (cuenta.get(idioma) ?? 0) + 1)
    }
  }

  const orden = [...cuenta.entries()].sort((a, b) => b[1] - a[1])
  if (orden.length === 0) return undefined

  const [mejor, suyas] = orden[0]
  const segundas = orden[1]?.[1] ?? 0
  return suyas - segundas >= MARGEN ? mejor : undefined
}
