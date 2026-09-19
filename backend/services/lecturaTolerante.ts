/**
 * Leer documentos sin que uno ilegible se lleve por delante a los demás (#174).
 *
 * Un usuario no pudo reindexar tras actualizar a la v1.37.0:
 *
 *     Invalid `prismaClient.hydraulicKnowledge.findMany()` invocation
 *     Failed to convert rust `String` into napi `string`
 *
 * En su base hay al menos una cadena que no es UTF-8 válido —las extracciones
 * de PDF anteriores al #157 guardaban lo que saliera—, el motor de Prisma no
 * puede convertirla y **aborta la consulta completa**. No es que se pierda ese
 * documento: es que no se lee ninguno.
 *
 * Y no era un sitio, eran tres. Medido sobre una copia de una base real con un
 * sustituto suelto metido a mano:
 *
 *     reindexado (findMany con include)        ROMPE
 *     salud del RAG (select con content)       ROMPE
 *     búsqueda del RAG (findMany por ids)      ROMPE
 *     lista del panel (select sin content)     funciona
 *     recuento de fragmentos (groupBy)         funciona
 *
 * El patrón que los separa es claro: **rompe todo lo que pida `content`**. Y
 * mientras quede un documento así en la base, cada consulta nueva que lo pida
 * es otra mina. Por eso esto está en un sitio y no repetido en tres.
 *
 * ## Cómo
 *
 * Se intenta la consulta de golpe, que es lo barato y lo normal. Si revienta,
 * se repite documento a documento: los que se puedan leer se devuelven y los
 * que no se nombran, para poder decirle al usuario cuáles borrar. Una base sana
 * paga una consulta; una rota paga N, y sólo cuando está rota.
 */

export interface DocumentoIlegible {
  id: string
  title: string
  motivo: string
}

export interface LecturaTolerante<T> {
  documentos: T[]
  ilegibles: DocumentoIlegible[]
}

/**
 * Lee de golpe y, si falla, uno a uno.
 *
 * Se le pasan las dos formas de leer en lugar del cliente de Prisma para poder
 * probarlo sin base delante: aquí lo que importa es la política, no el SQL.
 */
export async function leerTolerando<T>(
  deGolpe: () => Promise<T[]>,
  listar: () => Promise<{ id: string; title: string }[]>,
  unoAUno: (id: string) => Promise<T | null>,
): Promise<LecturaTolerante<T>> {
  try {
    return { documentos: await deGolpe(), ilegibles: [] }
  } catch (error) {
    console.warn(
      '[LecturaTolerante] La consulta de golpe falló; se reintenta documento a documento:',
      error instanceof Error ? error.message : String(error),
    )
  }

  const documentos: T[] = []
  const ilegibles: DocumentoIlegible[] = []

  // Si ni siquiera la lista de identificadores se puede leer, no hay nada que
  // salvar: se propaga, porque entonces el problema es otro.
  for (const { id, title } of await listar()) {
    try {
      const doc = await unoAUno(id)
      if (doc !== null) documentos.push(doc)
    } catch (error) {
      ilegibles.push({
        id,
        title,
        motivo: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return { documentos, ilegibles }
}

/** Lo que se le dice al usuario sobre los que no se pudieron leer. */
export function avisoDeIlegibles(ilegibles: DocumentoIlegible[]): string | null {
  if (ilegibles.length === 0) return null
  return (
    `${ilegibles.length} documento(s) no se pudieron leer de la base —su texto no es UTF-8 válido, ` +
    `probablemente de una extracción de PDF antigua—: ${ilegibles.map(d => d.title).join(', ')}. ` +
    `El resto funciona con normalidad; bórrelos desde la lista para que dejen de estorbar.`
  )
}
