/**
 * Un documento adjunto al chat, ajustado a lo que cabe en el modelo (#194).
 *
 * Antes el texto entero se pegaba dentro del mensaje. Con nemotron-mini, que
 * tiene 4096 tokens de contexto, un PDF de 76 páginas llegaba a Ollama como
 * 147 121 tokens y se recortaba a 2 050, conservando el final: el modelo leía
 * menos del 2 % sin que nadie lo supiera. Además, ese mismo texto era la
 * consulta del RAG y del guardarraíl (#195) y el contenido de la burbuja y del
 * título (#196).
 *
 * Ahora el adjunto viaja aparte, en la metadata del mensaje, y en cada turno se
 * elige lo que cabe: el documento entero si entra, y si no, los fragmentos que
 * más se parecen a la pregunta, diciéndoselo al modelo y al usuario.
 */

export interface Adjunto {
  nombre: string
  texto: string
  /** El texto se leyó con OCR de un escaneado (#198). */
  ocr?: { confianza: number; paginas: number }
}

export interface SeleccionDeAdjunto {
  texto: string
  completo: boolean
  incluidos: number
  total: number
}

/** Lo que queda anotado en la respuesta para decirle al usuario cuánto se leyó. */
export interface UsoDelAdjunto {
  nombre: string
  incluidos: number
  total: number
  completo: boolean
  /** Fuentes del RAG que no entraron para dejarle sitio al adjunto (#201). */
  fuentesOmitidas?: number
}

/**
 * Tokens aproximados, pensados para no quedarse cortos.
 *
 * Los tokenizadores de estos modelos gastan un token por cifra, así que contar
 * caracteres no vale: medido con nemotron-mini, una tabla de tuberías da 1,5
 * caracteres por token, y la prosa en castellano, 3,4. Contando cifras,
 * signos, saltos de espacio y palabras (una por cada ocho letras), y con un
 * 10 % de margen, la estimación queda entre un 0 % y un 29 % por encima de lo
 * que cuenta Ollama en tablas, prosa en castellano y en inglés.
 */
export function estimarTokens(texto: string): number {
  const cifras = texto.match(/\d/g)?.length ?? 0
  const signos = texto.match(/[^\p{L}\p{N}\s]/gu)?.length ?? 0
  const espacios = texto.match(/\s{2,}|\n/g)?.length ?? 0
  const palabras = texto.match(/\p{L}+/gu) ?? []
  const deLasPalabras = palabras.reduce((n, p) => n + 1 + Math.floor(p.length / 8), 0)
  return Math.ceil(1.1 * (cifras + signos + espacios + deLasPalabras))
}

/**
 * Ollama usa 4096 tokens de contexto si no se le pasa `num_ctx`, y aquí no se
 * le pasa: subirlo cuesta memoria, y con Milvus en la misma máquina ya ha
 * llegado a cerrarse la sesión por falta de RAM. Por encima de ese tamaño no
 * recorta con cuidado: se queda con el principio y el final del prompt.
 */
const CONTEXTO_OLLAMA = 4096
/** Los proveedores en la nube admiten mucho más; esto es un tope prudente. */
const CONTEXTO_EN_LA_NUBE = 32000
/** Lo que se deja para que el modelo escriba la respuesta. */
const RESERVA_RESPUESTA = 700
/** El prompt de sistema se compone después; mide unos 600 tokens sin personalizar. */
const RESERVA_SISTEMA = 900

export function presupuestoDelAdjunto(proveedor: string, tokensDelResto: number): number {
  const contexto = proveedor.toLowerCase() === 'ollama' ? CONTEXTO_OLLAMA : CONTEXTO_EN_LA_NUBE
  return Math.max(0, contexto - RESERVA_RESPUESTA - RESERVA_SISTEMA - tokensDelResto)
}

const TOKENS_POR_FRAGMENTO = 250

/**
 * Las fuentes del RAG que caben en lo que deja el adjunto (#201).
 *
 * El adjunto va primero porque es lo que el usuario ha puesto delante para esta
 * pregunta; con 4096 tokens, tres fuentes de libros que no venían a cuento
 * dejaban sitio para 1 de los 41 fragmentos de un escaneado. Llegan ordenadas
 * de más a menos relevante, así que se quitan desde el final. Se mide el bloque
 * compuesto y no las fuentes sueltas porque las reglas que lo acompañan también
 * ocupan.
 */
export function fuentesQueCaben<T>(fuentes: T[], presupuesto: number, bloque: (caben: T[]) => string): T[] {
  for (let n = fuentes.length; n > 0; n--) {
    if (estimarTokens(bloque(fuentes.slice(0, n))) <= presupuesto) return fuentes.slice(0, n)
  }
  return []
}

/** Trozos de unos 250 tokens, cortados por líneas para no partir una fila de tabla. */
export function trocear(texto: string): string[] {
  const fragmentos: string[] = []
  let actual: string[] = []
  let tokens = 0
  for (const linea of texto.split('\n')) {
    const suyos = estimarTokens(linea) + 1
    if (tokens + suyos > TOKENS_POR_FRAGMENTO && actual.length) {
      fragmentos.push(actual.join('\n'))
      actual = []
      tokens = 0
    }
    actual.push(linea)
    tokens += suyos
  }
  if (actual.join('').trim()) fragmentos.push(actual.join('\n'))
  return fragmentos.filter(f => f.trim())
}

const normalizar = (t: string) => t.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')

const VACIAS = new Set([
  'que', 'qué', 'cual', 'cuál', 'cuales', 'como', 'cómo', 'donde', 'dónde', 'para', 'por', 'con', 'sin',
  'del', 'los', 'las', 'una', 'uno', 'unos', 'unas', 'este', 'esta', 'esto', 'ese', 'esa', 'segun', 'tiene',
  'tienen', 'hay', 'son', 'documento', 'adjunto', 'the', 'and', 'what', 'which', 'how', 'with',
  'from', 'this', 'that', 'document', 'attached', 'quin', 'quina', 'amb', 'dels', 'les',
].map(normalizar))

/**
 * Los términos de la pregunta que merece la pena buscar. Un identificador como
 * «P-120-15» se busca entero: sus partes sueltas («120», «15») salen en medio
 * documento y no distinguen nada.
 */
function terminos(pregunta: string): Array<{ termino: string; identificador: boolean }> {
  const vistos = new Map<string, boolean>()
  for (const t of normalizar(pregunta).match(/[\p{L}\p{N}]+(?:[-_./][\p{L}\p{N}]+)*/gu) ?? []) {
    const identificador = /\d/.test(t) && /[-_./]|\p{L}/u.test(t)
    if (!identificador && (t.length < 3 || VACIAS.has(t))) continue
    vistos.set(t, identificador)
  }
  return [...vistos].map(([termino, identificador]) => ({ termino, identificador }))
}

const escapar = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const VECINOS_POSTERIORES = 6

/**
 * El documento entero si cabe; si no, los fragmentos más parecidos a la
 * pregunta, en el orden en que aparecen.
 *
 * La puntuación es por palabras, con más peso para las que salen en pocos
 * fragmentos, y mucho más para los identificadores. Es deliberadamente léxica:
 * las preguntas sobre un documento técnico suelen nombrar lo que buscan
 * —una tubería, un tramo, un artículo—, y el modelo de embeddings, con 512
 * tokens de contexto, tampoco podría comparar trozos mayores.
 *
 * Un fragmento suma además la mitad de lo que puntúe alguno de los seis
 * siguientes, porque en una tabla el encabezado —de qué tramo es, con qué
 * dotación— va unas filas por encima de la que se busca, y con cifras en cada
 * fila caben pocas en un fragmento: en el informe de prueba quedaba a cinco. Sin eso, entre ciento
 * veinte encabezados que dicen «dotación» no hay manera de saber cuál es.
 */
export function seleccionarFragmentos(texto: string, pregunta: string, presupuesto: number): SeleccionDeAdjunto {
  const fragmentos = trocear(texto)
  const total = fragmentos.length
  if (estimarTokens(texto) <= presupuesto) {
    return { texto, completo: true, incluidos: total, total }
  }

  // El separador «[…]» y el salto de línea entre fragmentos también cuentan.
  const tamanos = fragmentos.map(f => estimarTokens(f) + 4)
  const normalizados = fragmentos.map(normalizar)
  const puntos = new Array<number>(total).fill(0)
  for (const { termino, identificador } of terminos(pregunta)) {
    const patron = new RegExp(`(^|[^\\p{L}\\p{N}])${escapar(termino)}($|[^\\p{L}\\p{N}])`, 'u')
    const con = normalizados.map(f => patron.test(f))
    const df = con.filter(Boolean).length
    if (!df) continue
    const peso = Math.log((total + 1) / (df + 0.5)) * (identificador ? 3 : 1)
    con.forEach((esta, i) => { if (esta) puntos[i] += peso })
  }

  const conCercania = puntos.map((p, i) => p + 0.5 * Math.max(0, ...puntos.slice(i + 1, i + 1 + VECINOS_POSTERIORES)))

  // Sin nada en común con la pregunta —«resúmelo», por ejemplo— se lee desde el principio.
  const orden = puntos.some(p => p > 0)
    ? fragmentos.map((_, i) => i).filter(i => conCercania[i] > 0).sort((a, b) => conCercania[b] - conCercania[a] || a - b)
    : fragmentos.map((_, i) => i)

  const elegidos = new Set<number>()
  let usados = 0
  for (const i of orden) {
    if (usados + tamanos[i] > presupuesto) continue
    elegidos.add(i)
    usados += tamanos[i]
  }

  const indices = [...elegidos].sort((a, b) => a - b)
  const partes: string[] = []
  indices.forEach((i, n) => {
    if (n > 0 && indices[n - 1] !== i - 1) partes.push('[…]')
    partes.push(fragmentos[i])
  })
  return { texto: partes.join('\n'), completo: false, incluidos: indices.length, total }
}

/**
 * Lo que lee el modelo. Si el documento no va entero, se le dice para que no lo
 * dé por leído; y si sale de un escaneado, que sus cifras pueden estar mal leídas.
 */
export function bloqueParaElModelo({ nombre, ocr }: Pick<Adjunto, 'nombre' | 'ocr'>, seleccion: SeleccionDeAdjunto): string {
  if (!seleccion.incluidos) {
    return `El usuario ha adjuntado el documento «${nombre}», pero no cabe ningún fragmento en tu contexto: no lo has leído. Díselo si la pregunta es sobre él.\n\n`
  }
  const aviso = seleccion.completo
    ? ''
    : `El documento no cabe entero en tu contexto. Solo tienes ${seleccion.incluidos} de sus ${seleccion.total} fragmentos, los más relacionados con la pregunta; «[…]» marca lo que falta. Si la respuesta no está en ellos, di que no aparece en lo que has podido leer.\n\n`
  const deOcr = ocr
    ? `El documento es un escaneado leído con OCR (confianza ${ocr.confianza} %): puede tener cifras mal leídas. Si usas una, di que sale de un escaneado leído con OCR.\n\n`
    : ''
  return `=== DOCUMENTO ADJUNTO: ${nombre} ===\n${deOcr}${aviso}${seleccion.texto}\n=== FIN DEL DOCUMENTO ===\n\n`
}

/**
 * Los mensajes guardados antes de #194 llevan el documento pegado delante de
 * la pregunta. Se separa para enseñarlos y, sobre todo, para que al volver a
 * esas conversaciones el historial no desborde el contexto en cada turno.
 */
const PEGADO = /^=== ATTACHED DOCUMENT: (.*?) ===\n[\s\S]*?\n=== END DOCUMENT ===\n*/

export function separarDocumentoPegado(contenido: string): { pregunta: string; nombre?: string } {
  const m = contenido.match(PEGADO)
  if (!m) return { pregunta: contenido }
  return { pregunta: contenido.slice(m[0].length), nombre: m[1] }
}
