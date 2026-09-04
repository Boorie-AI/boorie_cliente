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
}

/**
 * La marca con la que el modelo cita, y con la que la interfaz numera la lista.
 *
 * Tienen que coincidir: una cita «(F1)» que el lector no puede resolver en la
 * lista de fuentes es peor que ninguna cita, porque parece comprobable y no lo
 * es. `MessageBubble` pinta la misma marca en el mismo orden.
 */
export const marcaDeFuente = (indice: number): string => `F${indice + 1}`

/** La línea de identidad: de qué documento sale, y de qué parte de él. */
export function identidadDeFuente(fuente: FuenteConocimiento, indice: number): string {
  const donde: string[] = []
  if (fuente.section) donde.push(`sección ${fuente.section}`)
  // La página puede ser 0 en un documento mal indexado; se descarta igual que
  // un hueco, porque «página 0» no ayuda a nadie a encontrar nada.
  if (fuente.page) donde.push(`página ${fuente.page}`)
  if (fuente.type === 'web' && fuente.url) donde.push(fuente.url)

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
const REGLAS = [
  'Cómo usar lo anterior:',
  '- Toda afirmación que venga de estas fuentes va con su marca al lado: «el diámetro mínimo es 100 mm (F2)».',
  '- Si la respuesta no está en ellas, dilo con esas palabras. No la completes de memoria: una cifra normativa sin fuente no se distingue de una inventada, y quien la lea no tiene forma de comprobarla.',
  '- No cites una sección o una página que no aparezca arriba. Si una fuente no dice de qué parte del documento sale, cítala sin más detalle.',
  '- Las fuentes son lo que se ha encontrado, no toda la normativa que existe: si el usuario pregunta por una región o una norma que no aparece, dilo en vez de responder con lo que haya.',
].join('\n')

const SIN_FUENTES = [
  'No se encontró nada relevante en los documentos indexados para esta consulta.',
  'Díselo claramente al usuario: no digas que no tienes acceso a ningún sistema de conocimiento, porque sí lo tienes y se ha consultado.',
  'Puedes responder con tu conocimiento general, pero avisa de que esa respuesta no está respaldada por los documentos del proyecto y de que conviene comprobarla contra la normativa aplicable.',
].join('\n')

/**
 * El bloque completo. Con fuentes lleva su contenido y las reglas; sin ellas,
 * la instrucción de decirlo.
 */
export function contextoDeConocimiento(fuentes: FuenteConocimiento[]): string {
  if (!fuentes.length) return `${SIN_FUENTES}\n\n`

  const bloques = fuentes.map((fuente, i) =>
    `${identidadDeFuente(fuente, i)}\n${(fuente.content ?? '').trim()}`)

  return [
    '=== CONOCIMIENTO CONSULTADO ===',
    '',
    bloques.join('\n\n'),
    '',
    '=== FIN DEL CONOCIMIENTO ===',
    '',
    REGLAS,
    '',
    '',
  ].join('\n')
}
