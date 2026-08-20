/**
 * Ámbitos del Wisdom Center (#39).
 *
 * El conocimiento vive en dos ámbitos: **general** —normativa, buenas prácticas,
 * el catálogo preindexado, compartido entre proyectos— y **de proyecto**, que son
 * los documentos internos de un cliente concreto.
 *
 * La herencia es de un solo sentido y es un requisito de confidencialidad, no de
 * comodidad: un proyecto ve lo general, y lo general **nunca** ve lo de un
 * proyecto. Un documento del proyecto A no puede aparecer en ninguna búsqueda
 * del proyecto B, en ningún modo.
 *
 * Módulo puro: esta regla se puede equivocar de una forma que no se nota hasta
 * que alguien ve el documento de otro cliente, así que se prueba sin base de
 * datos delante.
 */

export type Ambito = 'general' | 'proyecto' | 'ambos'

/** `null` representa el ámbito general: un documento sin proyecto dueño. */
export type DuenoDocumento = string | null

/**
 * Proyectos cuyos documentos pueden entrar en una búsqueda.
 *
 * Devolver la lista y filtrar por ella —en lugar de excluir lo prohibido— hace
 * que el caso por defecto sea no ver nada: si el ámbito o el proyecto llegan mal,
 * se ve de menos, nunca de más.
 */
export function duenosPermitidos(ambito: Ambito, projectId?: string | null): DuenoDocumento[] {
  // Sin proyecto activo no hay ámbito de proyecto que valga: cualquier petición
  // se resuelve como general, que es lo único que se puede servir sin saber de
  // quién son los documentos.
  if (!projectId) return [null]

  switch (ambito) {
    case 'general':
      return [null]
    case 'proyecto':
      return [projectId]
    case 'ambos':
      return [null, projectId]
  }
}

/** Si un documento concreto puede verse desde un ámbito dado. */
export function documentoVisible(
  duenoDelDocumento: DuenoDocumento,
  ambito: Ambito,
  projectId?: string | null
): boolean {
  return duenosPermitidos(ambito, projectId).includes(duenoDelDocumento ?? null)
}

export type Origen = 'general' | 'proyecto'

/** De dónde viene un resultado, para poder decirlo junto a la cita. */
export function origenDe(duenoDelDocumento: DuenoDocumento): Origen {
  return duenoDelDocumento ? 'proyecto' : 'general'
}

/**
 * Filtro para el almacén vectorial.
 *
 * Es una **optimización**, no la garantía: el almacén puede fallar en silencio,
 * devolver de más o ignorar el filtro, y por eso la última palabra la tiene la
 * consulta a la base de datos, que es la autoridad sobre de quién es cada
 * documento. Devuelve `undefined` cuando no hay nada que restringir.
 */
export function filtroVectorial(permitidos: DuenoDocumento[]): string | undefined {
  const proyectos = permitidos.filter((p): p is string => p !== null)

  // El general incluye documentos indexados antes de que existiera el ámbito,
  // cuya metainformación no trae `projectId`. Una expresión que exija que el
  // campo exista los dejaría fuera, así que en ese caso no se filtra aquí y se
  // resuelve en la base de datos.
  if (permitidos.includes(null)) return undefined
  if (proyectos.length === 0) return undefined

  return proyectos.map(p => `metadata["projectId"] == "${p}"`).join(' or ')
}

/**
 * Condición para la consulta a la base, que es la que garantiza el ámbito.
 *
 * No vale `{ projectId: { in: permitidos } }`: Prisma **rechaza `null` dentro de
 * un `in`** —«Argument in: Invalid value provided. Expected Null, provided
 * (Null)»— y como el ámbito general es el valor por defecto, esa consulta
 * habría fallado en el caso más común. El nulo se expresa aparte.
 *
 * Con la lista vacía devuelve una condición que no acepta nada: si algo va mal
 * se ve de menos, nunca de más.
 */
export function filtroPrisma(permitidos: DuenoDocumento[]): Record<string, unknown> {
  const proyectos = permitidos.filter((p): p is string => p !== null)
  const incluyeGeneral = permitidos.includes(null)

  if (incluyeGeneral && proyectos.length === 0) return { projectId: null }
  if (!incluyeGeneral) return { projectId: { in: proyectos } }

  return { OR: [{ projectId: null }, { projectId: { in: proyectos } }] }
}
