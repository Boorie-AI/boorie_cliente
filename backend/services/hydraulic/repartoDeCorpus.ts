/**
 * Que un corpus no ahogue al otro en los resultados (#158).
 *
 * Boorie indexa un documento por cada ejecución de simulación —«Estadísticas de
 * la simulación X», «Anomalías de …», «Comparación con la anterior»— en el mismo
 * espacio vectorial que la documentación que sube el usuario. En una base real
 * son 362 de 817 fragmentos, escritos además en castellano, que es el idioma en
 * el que se pregunta. Preguntando por el método del hidrograma unitario, los
 * ocho primeros resultados eran estadísticas de simulación y el libro no
 * aparecía.
 *
 * Filtrar el ámbito dentro del almacén ya lo resolvió para las búsquedas
 * generales, donde los informes quedan fuera por ser de proyecto. Dentro de un
 * proyecto —que es como busca el chat cuando hay uno activo— los dos corpus
 * conviven y el problema sigue entero.
 *
 * La solución no es adivinar qué quiere el usuario. Clasificar la intención de
 * la pregunta falla justo en las mixtas («¿la presión de la última simulación
 * cumple la norma?»), que son las que más ganan teniendo los dos corpus
 * delante. Se reserva sitio para cada uno y que el modelo decida con ambos a la
 * vista.
 */

export type Corpus = 'documental' | 'simulacion'

/**
 * Los derivados de simulación se reconocen por su categoría, que la escriben
 * todas las rutas de indexado.
 */
export function corpusDe(categoria: string | null | undefined): Corpus {
  return categoria === 'simulations' ? 'simulacion' : 'documental'
}

/**
 * La expresión para pedirle al almacén un corpus u otro. Sobre el campo escalar, no sobre el
 * JSON, por lo mismo que `filtroVectorial`.
 */
export function filtroDeCorpus(corpus: Corpus): string {
  return corpus === 'simulacion'
    ? 'category == "simulations"'
    : 'not (category == "simulations")'
}

/** Une dos filtros del almacén, saltándose los que no restringen nada. */
export function unirFiltros(...filtros: (string | undefined)[]): string | undefined {
  const puestos = filtros.filter((f): f is string => Boolean(f))
  if (puestos.length === 0) return undefined
  return puestos.map(f => `(${f})`).join(' and ')
}

/**
 * Reparte las plazas entre los dos corpus sin desperdiciar ninguna.
 *
 * Cada uno tiene garantizada la mitad —redondeando a la baja, mínimo una— y lo
 * que el otro no use se reparte. Con un solo corpus presente se lleva todo, que
 * es lo que debe pasar cuando la pregunta sólo tiene respuesta en un sitio.
 *
 * El orden de salida es el de entrada, que viene por puntuación: la cuota
 * decide quién entra, no en qué orden se lee.
 */
export function repartirPorCorpus<T>(
  candidatos: T[],
  limite: number,
  corpusDelCandidato: (candidato: T) => Corpus,
): T[] {
  if (limite <= 0) return []
  if (candidatos.length <= limite) return candidatos

  const cuota = Math.max(1, Math.floor(limite / 2))
  const elegidos = new Set<number>()
  const contados: Record<Corpus, number> = { documental: 0, simulacion: 0 }

  candidatos.forEach((candidato, i) => {
    const corpus = corpusDelCandidato(candidato)
    if (contados[corpus] < cuota && elegidos.size < limite) {
      elegidos.add(i)
      contados[corpus] += 1
    }
  })

  // Las plazas que el otro corpus no ha usado no se pierden: se dan a los
  // mejores que queden, sean de donde sean.
  candidatos.forEach((_, i) => {
    if (elegidos.size >= limite) return
    if (!elegidos.has(i)) elegidos.add(i)
  })

  return candidatos.filter((_, i) => elegidos.has(i))
}

/**
 * Un fragmento, una vez.
 *
 * Los dos filtros de corpus son complementarios, así que en condiciones
 * normales no se solapan. Pero el almacén puede ignorar un filtro y devolver de
 * más —su modo de fallo es silencioso—, y entonces el mismo trozo de texto
 * entraría dos veces en el contexto del modelo, ocupando plaza dos veces y
 * pareciendo dos confirmaciones de lo mismo.
 */
export function sinRepetidos<T extends { id?: string }>(candidatos: T[]): T[] {
  const vistos = new Set<string>()
  return candidatos.filter((c, i) => {
    const clave = c?.id ?? `sin-id-${i}`
    if (vistos.has(clave)) return false
    vistos.add(clave)
    return true
  })
}
