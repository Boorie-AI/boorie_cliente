/**
 * El bloque de conocimiento que se le da al modelo, y las reglas para citarlo
 * (#119, fase 2).
 *
 * Antes el prompt llevaba `[Source 1]: <título>` y el contenido, y nada más. El
 * RAG **sí** recupera la sección y la página de cada fragmento —las trae
 * `formatSources` en `agenticRAGService`—, pero se tiraban antes de que el
 * modelo las viera: no podía citar una sección porque nadie se la había dicho.
 * Y no había ninguna instrucción de citar, así que no citaba.
 *
 * Módulo puro a propósito, como `networkContext` y `agentTools`: recibe las
 * fuentes ya recuperadas y devuelve texto. Así la política de citas se puede
 * probar entera sin levantar el RAG ni hablar con ningún proveedor.
 */

export interface FuenteConocimiento {
  title?: string
  content?: string
  section?: string
  page?: number | string
  category?: string
  /** 'document' o 'web'. */
  type?: string
  url?: string
  /** Idioma del fragmento, como lo indexó el RAG ('en', 'es', 'ca'…). */
  language?: string
}

/** Los idiomas que ofrece la aplicación. */
export type IdiomaApp = 'es' | 'ca' | 'en'

/**
 * Cómo se nombra un idioma dentro del prompt (#160).
 *
 * El prompt se le escribe al modelo en castellano —es andamiaje interno, no
 * algo que el usuario lea—, así que los nombres van en castellano aunque la
 * respuesta tenga que salir en otro idioma.
 */
const NOMBRES: Record<string, string> = {
  es: 'castellano',
  ca: 'catalán',
  en: 'inglés',
  pt: 'portugués',
  fr: 'francés',
  it: 'italiano',
  de: 'alemán',
}

/** El nombre del idioma, o su código si no se conoce. */
export function nombreDeIdioma(codigo: string): string {
  return NOMBRES[codigo.toLowerCase().split('-')[0]] ?? codigo
}

/**
 * ¿Hay que traducir esta fuente para responder en `idioma`?
 *
 * Una fuente sin idioma declarado no se da por traducida: marcarla obligaría a
 * escribir «traducido del …» sin saber de qué, y una cita con una procedencia
 * inventada es peor que una cita sin adornos.
 */
function esDeOtroIdioma(fuente: FuenteConocimiento, idioma: IdiomaApp): boolean {
  if (!fuente.language) return false
  return fuente.language.toLowerCase().split('-')[0] !== idioma
}

/**
 * La marca con la que el modelo cita, y con la que la interfaz numera la lista.
 *
 * Tienen que coincidir: una cita «(F1)» que el lector no puede resolver en la
 * lista de fuentes es peor que ninguna cita, porque parece comprobable y no lo
 * es. `MessageBubble` pinta la misma marca en el mismo orden.
 */
export const marcaDeFuente = (indice: number): string => `F${indice + 1}`

/**
 * La línea de identidad: de qué documento sale, de qué parte de él y en qué
 * idioma está si no es el de la respuesta (#160).
 *
 * El idioma va aquí, pegado a la fuente, y no en una lista aparte: es lo que le
 * permite al modelo saber cuál de las citas tiene que marcar como traducida sin
 * tener que adivinarlo del contenido.
 */
export function identidadDeFuente(
  fuente: FuenteConocimiento,
  indice: number,
  idioma: IdiomaApp = 'es',
): string {
  const donde: string[] = []
  if (fuente.section) donde.push(`sección ${fuente.section}`)
  // La página puede ser 0 en un documento mal indexado; se descarta igual que
  // un hueco, porque «página 0» no ayuda a nadie a encontrar nada.
  if (fuente.page) donde.push(`página ${fuente.page}`)
  if (fuente.type === 'web' && fuente.url) donde.push(fuente.url)
  if (esDeOtroIdioma(fuente, idioma)) donde.push(`en ${nombreDeIdioma(fuente.language as string)}`)

  const titulo = fuente.title?.trim() || 'Documento sin título'
  return `[${marcaDeFuente(indice)}] ${titulo}${donde.length ? ` — ${donde.join(', ')}` : ''}`
}

/**
 * Las reglas van **después** de las fuentes y antes de la pregunta.
 *
 * Puestas antes, quedan a varios miles de caracteres de contenido de distancia
 * del momento de responder. Puestas aquí, son lo último que el modelo lee antes
 * de la pregunta.
 */
const REGLAS = (idioma: IdiomaApp, hayTraduccion: boolean) => [
  'Cómo usar lo anterior:',
  /**
   * El idioma lo manda el usuario, no las fuentes (#160). Sin esta línea, el
   * modelo responde en el idioma de los fragmentos que le han tocado: medido en
   * la aplicación, la misma sesión en castellano contestaba en inglés a una
   * pregunta y en castellano a la siguiente, según el idioma de lo recuperado.
   */
  `- Responde en ${nombreDeIdioma(idioma)}, aunque las fuentes estén en otro idioma. Es el idioma que el usuario tiene puesto en la aplicación.`,
  ...(hayTraduccion
    /**
     * Y si traduce, que lo diga. Una cifra sacada de un texto en inglés y
     * servida en castellano sin avisar es una cita que el lector no puede
     * contrastar contra lo que el documento dice de verdad.
     */
    ? [`- Las fuentes marcadas «en <idioma>» arriba no están en ${nombreDeIdioma(idioma)}. Cuando cites una, traduce lo que uses y dilo en la propia cita: «el diámetro mínimo es 100 mm (F2, traducido del inglés)».`]
    : []),
  '- Toda afirmación que venga de estas fuentes va con su marca al lado: «el diámetro mínimo es 100 mm (F2)».',
  '- Si la respuesta no está en ellas, dilo con esas palabras. No la completes de memoria: una cifra normativa sin fuente no se distingue de una inventada, y quien la lea no tiene forma de comprobarla.',
  '- No cites una sección o una página que no aparezca arriba. Si una fuente no dice de qué parte del documento sale, cítala sin más detalle.',
  '- Las fuentes son lo que se ha encontrado, no toda la normativa que existe: si el usuario pregunta por una región o una norma que no aparece, dilo en vez de responder con lo que haya.',
].join('\n')

// Sin fuentes también hay que fijar el idioma: el modelo responde de su propio
// conocimiento, y ahí tira por el idioma en el que se entrenó (#160).
const SIN_FUENTES = (idioma: IdiomaApp) => [
  'No se encontró nada relevante en los documentos indexados para esta consulta.',
  'Díselo claramente al usuario: no digas que no tienes acceso a ningún sistema de conocimiento, porque sí lo tienes y se ha consultado.',
  'Puedes responder con tu conocimiento general, pero avisa de que esa respuesta no está respaldada por los documentos del proyecto y de que conviene comprobarla contra la normativa aplicable.',
  `Responde en ${nombreDeIdioma(idioma)}, que es el idioma que el usuario tiene puesto en la aplicación.`,
].join('\n')

/**
 * Sin fuentes porque la búsqueda no respondió. Decirle que no había nada sería
 * falso: la documentación puede tratar la pregunta y no se llegó a mirar.
 */
const BUSQUEDA_FALLIDA = (idioma: IdiomaApp) => [
  'No se pudo consultar la documentación indexada: la búsqueda no respondió, ni tras reintentarla.',
  'Díselo claramente al usuario: no digas que la documentación no trata el tema, porque no se ha llegado a mirar, y sugiérele volver a preguntar.',
  'Puedes responder con tu conocimiento general, pero avisa de que esa respuesta no está respaldada por los documentos del proyecto y de que conviene comprobarla contra la normativa aplicable.',
  `Responde en ${nombreDeIdioma(idioma)}, que es el idioma que el usuario tiene puesto en la aplicación.`,
].join('\n')

/**
 * El bloque completo. Con fuentes lleva su contenido y las reglas; sin ellas,
 * la instrucción de decirlo, que no es la misma si la búsqueda falló.
 */
export function contextoDeConocimiento(
  fuentes: FuenteConocimiento[],
  idioma: IdiomaApp = 'es',
  opciones: { busquedaFallida?: boolean } = {},
): string {
  if (!fuentes.length) {
    return `${opciones.busquedaFallida ? BUSQUEDA_FALLIDA(idioma) : SIN_FUENTES(idioma)}\n\n`
  }

  const bloques = fuentes.map((fuente, i) =>
    `${identidadDeFuente(fuente, i, idioma)}\n${(fuente.content ?? '').trim()}`)

  // La regla de traducir sólo se escribe si hay algo que traducir: una
  // instrucción que no aplica a ninguna de las fuentes de delante es ruido que
  // compite por la atención del modelo con las que sí aplican.
  const hayTraduccion = fuentes.some(f => esDeOtroIdioma(f, idioma))

  return [
    '=== CONOCIMIENTO CONSULTADO ===',
    '',
    bloques.join('\n\n'),
    '',
    '=== FIN DEL CONOCIMIENTO ===',
    '',
    REGLAS(idioma, hayTraduccion),
    '',
    '',
  ].join('\n')
}

/**
 * La última línea del prompt, después de la pregunta (#160).
 *
 * Las reglas de arriba ya dicen en qué idioma responder, y con `nemotron-mini`
 * no basta: medido en la aplicación, con las tres fuentes marcadas «en inglés» y
 * la instrucción escrita, contestaba en inglés igualmente. La regla no estaba
 * mal; estaba lejos. Lo que el modelo lee justo antes de empezar a escribir es
 * lo que más pesa, y eso es el final del prompt, no el final de las reglas.
 *
 * Va aparte y no dentro de `contextoDeConocimiento` porque ese bloque se monta
 * antes de la pregunta y éste tiene que ir después: son dos posiciones, no dos
 * textos.
 */
export function cierreDeIdioma(idioma: IdiomaApp = 'es', hayTraduccion = false): string {
  const enIdioma = `Responde en ${nombreDeIdioma(idioma)}.`
  return hayTraduccion
    ? `\n\n${enIdioma} Las fuentes están en otro idioma: tradúcelas, y en cada cita di de qué idioma la has traducido.`
    : `\n\n${enIdioma}`
}

/** Si alguna de las fuentes hay que traducirla para responder en `idioma`. */
export function hayQueTraducir(fuentes: FuenteConocimiento[], idioma: IdiomaApp = 'es'): boolean {
  return fuentes.some(f => esDeOtroIdioma(f, idioma))
}
