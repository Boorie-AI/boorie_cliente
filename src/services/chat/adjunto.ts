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

import { paginasDeLosFragmentos, etiquetaDePaginas } from './paginasDelAdjunto'

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
  /** Los fragmentos van agrupados por la consulta que los encontró. */
  agrupado?: boolean
  /**
   * Las páginas impresas de lo que lee el modelo, si el documento tiene
   * cabeceras de las que sacarlas (`paginasDelAdjunto`). Son las únicas que
   * puede citar con fundamento.
   */
  paginas?: number[]
  /** Cada fragmento lleva delante su página, «[p. 78]». */
  paginado?: boolean
}

/** Lo que queda anotado en la respuesta para decirle al usuario cuánto se leyó. */
export interface UsoDelAdjunto {
  nombre: string
  incluidos: number
  total: number
  completo: boolean
  /** Fuentes del RAG que no entraron para dejarle sitio al adjunto (#201). */
  fuentesOmitidas?: number
  /** Los fragmentos se eligieron también por significado (#205); si falta, solo por palabras. */
  porSignificado?: boolean
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
 * Con Ollama, el contexto es el `num_ctx` que se le pide para ese modelo
 * (`contextoDeOllama`): 8192 con qwen2.5, 4096 con nemotron-mini. Por encima
 * de ese tamaño Ollama no recorta con cuidado: se queda con el principio y el
 * final del prompt.
 */
/**
 * Los proveedores en la nube admiten mucho más; esto es un tope prudente. Era
 * 32 000, y con el libro de Walton dejaba fuera de la pregunta por la prueba
 * escalonada la ecuación 4.2, la tabla 2.1 o el criterio de C, según cómo
 * cayera el corte: los pasajes buenos estaban justo en el límite. Con 48 000
 * entran todos (medido con los vectores de granite-embedding de la app).
 */
export const CONTEXTO_EN_LA_NUBE = 48000
/**
 * Lo que se deja para que el modelo escriba la respuesta: la sexta parte del
 * contexto, y nunca menos de 700. Una pregunta que pide tablas, fórmulas y
 * procedimiento hizo escribir a qwen2.5 unos 1250 tokens.
 */
const RESERVA_RESPUESTA = 700
/** El prompt de sistema se compone después; mide unos 600 tokens sin personalizar. */
const RESERVA_SISTEMA = 900

export function presupuestoDelAdjunto(contexto: number, tokensDelResto: number): number {
  const respuesta = Math.max(RESERVA_RESPUESTA, Math.floor(contexto / 6))
  return Math.max(0, contexto - respuesta - RESERVA_SISTEMA - tokensDelResto)
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
 * Hasta dónde se mira en el fragmento siguiente para acabar la frase. Los
 * fragmentos se cortan por líneas, no por frases, y lo que queda al otro lado
 * no se parece a la pregunta por sí solo: en el libro de Walton entraba la
 * ecuación 4.2 y se quedaba fuera la frase que la sigue —«Values of C … are
 * generally less than 10 sec²/ft⁵»—, el único criterio del libro sobre el
 * estado del pozo, en el puesto 173 de 621 con 102 plazas. Los modelos se
 * inventaban el umbral.
 */
const TOKENS_PARA_ACABAR_LA_FRASE = 120

/**
 * El principio del fragmento siguiente, hasta el primer final de frase: un
 * punto seguido de espacio o de fin de línea, no el de «2.0». Si la frase no
 * acaba dentro del tope, no se añade nada.
 */
export function finDeLaFrase(siguiente: string | undefined): string {
  if (!siguiente) return ''
  const fin = /[.!?](?=\s|$)/g
  for (let m = fin.exec(siguiente); m; m = fin.exec(siguiente)) {
    const cola = siguiente.slice(0, m.index + 1)
    if (estimarTokens(cola) > TOKENS_PARA_ACABAR_LA_FRASE) return ''
    if (cola.trim()) return cola
  }
  return ''
}

/**
 * «¿De qué habla el capítulo 4?» no se responde buscando palabras (#204).
 *
 * Con el libro de Walton adjunto, «capítulo» no salía en un texto en inglés y el
 * «4» se descartaba por corto: no coincidía nada y el modelo recibía la portada.
 * Y buscar «chapter 4» tampoco lo habría encontrado, porque ahí el capítulo
 * empieza con una línea que solo dice «4» y el título debajo. Una referencia a
 * la estructura se busca como tal: su encabezado, en los tres idiomas, y lo que
 * le sigue hasta el encabezado siguiente.
 */
type TipoDeReferencia = 'capitulo' | 'seccion' | 'tabla' | 'figura' | 'anexo'

const PALABRAS: Record<TipoDeReferencia, string[]> = {
  capitulo: ['capitulo', 'capitol', 'chapter', 'cap', 'tema', 'parte', 'part', 'unidad', 'unitat', 'unit'],
  seccion: ['seccion', 'seccio', 'section', 'apartado', 'apartat', 'epigrafe'],
  tabla: ['tabla', 'taula', 'table', 'cuadro', 'quadre'],
  figura: ['figura', 'figure', 'fig', 'grafico', 'grafic'],
  anexo: ['anexo', 'annex', 'annexe', 'appendix', 'apendice', 'apendix'],
}

const ESCRITOS: Record<string, number> = Object.fromEntries([
  ['uno', 'un', 'una', 'one', 'primero', 'primer', 'first'],
  ['dos', 'two', 'segundo', 'segon', 'second'],
  ['tres', 'three', 'tercero', 'tercer', 'third'],
  ['cuatro', 'quatre', 'four', 'cuarto', 'quart', 'fourth'],
  ['cinco', 'cinc', 'five', 'quinto', 'cinque', 'fifth'],
  ['seis', 'sis', 'six', 'sexto', 'sise', 'sixth'],
  ['siete', 'set', 'seven', 'septimo', 'sete', 'seventh'],
  ['ocho', 'vuit', 'eight', 'octavo', 'vuite', 'eighth'],
  ['nueve', 'nou', 'nine', 'noveno', 'nove', 'ninth'],
  ['diez', 'deu', 'ten', 'decimo', 'dese', 'tenth'],
].flatMap((palabras, i) => palabras.map(p => [p, i + 1])))

const ROMANOS: Array<[number, string]> = [[10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']]
function aRomano(n: number): string {
  let r = ''
  for (const [valor, letras] of ROMANOS) while (n >= valor) { r += letras; n -= valor }
  return r
}
function deRomano(t: string): number | undefined {
  for (let n = 1; n <= 40; n++) if (aRomano(n) === t) return n
  return undefined
}

export interface ReferenciaALaEstructura {
  tipo: TipoDeReferencia
  /** «4», «4.2» o, en un anexo, «b». */
  numero: string
}

/** Las referencias a capítulos, secciones, tablas, figuras o anexos que hace la pregunta. */
export function referenciasALaEstructura(pregunta: string): ReferenciaALaEstructura[] {
  const todas = Object.values(PALABRAS).flat().join('|')
  const patron = new RegExp(`\\b(${todas})\\.?\\s*(?:n\\.?\\s*[ºo°]?\\.?\\s*|num(?:ero)?\\.?\\s*)?(\\d+(?:\\.\\d+)*|[ivx]+\\b|[a-z]\\b|${Object.keys(ESCRITOS).join('|')})`, 'gu')
  const refs: ReferenciaALaEstructura[] = []
  for (const [, palabra, crudo] of normalizar(pregunta).matchAll(patron)) {
    let tipo = (Object.keys(PALABRAS) as TipoDeReferencia[]).find(t => PALABRAS[t].includes(palabra))!
    const numero = ESCRITOS[crudo] ? String(ESCRITOS[crudo]) : deRomano(crudo) ? String(deRomano(crudo)) : crudo
    // Una letra suelta solo es un número en un anexo («anexo B»); en el resto es una palabra.
    if (/^[a-z]$/.test(numero) && tipo !== 'anexo') continue
    // «capítulo 4.2» es una sección.
    if (tipo === 'capitulo' && numero.includes('.')) tipo = 'seccion'
    refs.push({ tipo, numero })
  }
  return refs
}

interface Linea { fragmento: number; original: string; normal: string }

function lineasDe(fragmentos: string[]): Linea[] {
  return fragmentos.flatMap((f, fragmento) =>
    f.split('\n').map(original => ({ fragmento, original: original.trim(), normal: normalizar(original.trim()) })))
}

/** El título sin espacios, signos ni mayúsculas: «S T E P DRAWDOWN» y «Step Drawdown» son el mismo. */
const claveDeTitulo = (linea: string) => normalizar(linea).replace(/[^\p{L}]/gu, '')

/**
 * Lo que va detrás de un número para que sea un encabezado y no un número de
 * página, una frase o una fila de una tabla.
 *
 * Una línea que se repite no es un título: en el libro de Walton cada página par
 * lleva «GROUNDWATER PUMPING TESTS» junto a su número, y sin esto la página 4
 * pasaba por el capítulo 4. Después, o va en mayúsculas o con mayúscula en casi
 * todas sus palabras —la biografía del autor tras la página «IV» se quedaba
 * justo por debajo—, o el mismo título sale en otro sitio del documento, que es
 * lo que salva los títulos en minúscula del castellano: el índice los repite.
 */
function pareceTitulo(linea: string | undefined, veces: Map<string, number>, clavesVistas: Map<string, number>): boolean {
  if (!linea || linea.length < 3 || linea.length > 90 || /[.,;:]$/.test(linea)) return false
  if ((veces.get(linea) ?? 0) > 2) return false
  if (!/^\p{Lu}/u.test(linea)) return false
  const letras = linea.replace(/[^\p{L}]/gu, '')
  if (letras.length < 3 || letras.length / linea.replace(/\s/g, '').length < 0.6) return false
  const palabras = linea.split(/\s+/).filter(p => /\p{L}/u.test(p))
  if (palabras.length > 10) return false
  if ((clavesVistas.get(claveDeTitulo(linea)) ?? 0) >= 2) return true
  if (letras === letras.toUpperCase()) return true
  const conContenido = palabras.filter(p => p.replace(/[^\p{L}]/gu, '').length >= 4)
  const enMayuscula = conContenido.filter(p => /^\P{L}*\p{Lu}/u.test(p)).length
  return conContenido.length === 0 || enMayuscula / conContenido.length >= 0.75
}

/**
 * Dónde empieza cada capítulo, sección o anexo, con el número que lleva.
 *
 * Las tres formas que se buscan: la palabra con el número («Chapter 4»,
 * «Capítulo IV»), el número solo en su línea con un título debajo, y el número
 * con su título en la misma línea («4. Step Drawdown…», «4.2 Well Loss»).
 */
interface Encabezado {
  fragmento: number
  numero: string
  /** Su título sale también en otro sitio —el índice, las cabeceras de página— o lleva la palabra «capítulo». */
  confirmado: boolean
  titulo?: string
}

function encabezados(lineas: Linea[], tipo: 'capitulo' | 'seccion' | 'anexo'): Encabezado[] {
  const numero = tipo === 'seccion' ? '\\d+\\.\\d+(?:\\.\\d+)*' : tipo === 'anexo' ? '(?:\\d+|[ivx]+|[a-z])' : '(?:\\d+|[ivx]+)'
  const conPalabra = new RegExp(`^(?:${PALABRAS[tipo].join('|')})\\.?\\s*(${numero})\\b`, 'u')
  const soloNumero = new RegExp(`^(${numero})\\.?$`, 'u')
  const numeroYTitulo = new RegExp(`^(${numero})\\s*[.:)\\-–—]?\\s+`, 'u')
  const veces = new Map<string, number>()
  const claves = new Map<string, number>()
  for (const l of lineas) {
    if (!l.original) continue
    veces.set(l.original, (veces.get(l.original) ?? 0) + 1)
    const clave = claveDeTitulo(l.original)
    if (clave.length >= 6) claves.set(clave, (claves.get(clave) ?? 0) + 1)
  }

  // Primera pasada: todos los pares número–título, sin decidir todavía.
  const pares: Array<{ i: number; n: string; titulo?: string; palabra: boolean }> = []
  lineas.forEach((l, i) => {
    const n = l.normal.match(conPalabra)?.[1]
    if (n) return pares.push({ i, n, palabra: true })
    if (tipo === 'anexo') return
    const suelto = l.normal.match(soloNumero)?.[1]
    if (suelto) return pares.push({ i, n: suelto, titulo: lineas.slice(i + 1, i + 4).find(x => x.original)?.original, palabra: false })
    const inicio = l.normal.match(numeroYTitulo)
    // En la misma línea, solo si es corta: un punto de una lista larga también empieza por «4.».
    if (inicio && l.original.length <= 80) pares.push({ i, n: inicio[1], titulo: l.original.slice(inicio[0].length), palabra: false })
  })

  /**
   * Con qué números sale cada título. Uno que va con tres números distintos es
   * una cabecera de página —«4   GROUNDWATER PUMPING TESTS», que pdf-parse junta
   * en una línea— o la cabecera de una tabla —«4 / Temperature» en el apéndice—.
   * Y uno que sale dos veces con el mismo número está confirmado: el índice lo
   * repite, «4  STEP DRAWDOWN TEST ANALYSIS 77».
   */
  const numerosDe = new Map<string, string[]>()
  for (const { n, titulo } of pares) {
    if (!titulo) continue
    const clave = claveDeTitulo(titulo)
    numerosDe.set(clave, [...(numerosDe.get(clave) ?? []), n])
  }

  const salida: Encabezado[] = []
  for (const { i, n, titulo, palabra } of pares) {
    let confirmado = palabra
    if (!palabra) {
      const con = numerosDe.get(claveDeTitulo(titulo ?? '')) ?? []
      if (new Set(con).size >= 3 || !pareceTitulo(titulo, veces, claves)) continue
      confirmado = con.filter(x => x === n).length >= 2
    }
    const valor = deRomano(n) ? String(deRomano(n)) : n
    // Un libro no tiene cien capítulos: un «102» suelto es un número de página.
    if (tipo === 'capitulo' && Number(valor) > MAXIMO_CAPITULO) continue
    salida.push({ fragmento: lineas[i].fragmento, numero: valor, confirmado, titulo })
  }
  return salida
}

/** El número que viene detrás: el capítulo 4 acaba donde empieza el 5, y la sección 4.2 donde la 4.3. */
function siguienteNumero(numero: string): string {
  const partes = numero.split('.')
  const ultimo = partes.pop()!
  const siguiente = /^\d+$/.test(ultimo) ? String(Number(ultimo) + 1) : String.fromCharCode(ultimo.charCodeAt(0) + 1)
  return [...partes, siguiente].join('.')
}

/**
 * Los capítulos de verdad, uno por número, en el orden en que salen.
 *
 * El aislamiento no basta: una subsección en mayúsculas del capítulo 5 del libro
 * de Walton («5 / INDUCED STREAMBED INFILTRATION») pasaba por el capítulo 5, y
 * una fórmula numerada por el 2. Lo que los delata es el orden: los capítulos
 * reales van 1, 2, 3, 4, 5 a lo largo del documento, y los falsos rompen la
 * secuencia. Se busca la cadena de números consecutivos en orden que más pese.
 *
 * Y no todas las cadenas valen lo mismo. Con el texto que saca pdf-parse, el
 * apéndice del libro tiene su propia lista 3, 4, 5, y empataba en largo con la
 * de los capítulos: ganaba y el modelo leía el apéndice. Los títulos de los
 * capítulos se repiten —en el índice, en las cabeceras de página— y los de una
 * lista no, así que un encabezado confirmado pesa el triple. Los amontonados de
 * un índice pesan poco: están, pero no son el capítulo.
 */
function cadenaDeCapitulos(todos: Encabezado[], vecinos: (fragmento: number) => number): Map<string, Encabezado> {
  const candidatos = todos.filter(e => /^\d+$/.test(e.numero))
  const valor = (e: Encabezado) => (e.confirmado ? 3 : 1) * (vecinos(e.fragmento) < 2 ? 1 : 0.1)
  const peso = candidatos.map(valor)
  const previo = candidatos.map(() => -1)
  candidatos.forEach((c, i) => {
    for (let j = 0; j < i; j++) {
      const p = candidatos[j]
      if (Number(p.numero) === Number(c.numero) - 1 && p.fragmento < c.fragmento && peso[j] + valor(c) > peso[i]) {
        peso[i] = peso[j] + valor(c)
        previo[i] = j
      }
    }
  })
  const cadena = new Map<string, Encabezado>()
  if (!candidatos.length) return cadena
  let i = peso.indexOf(Math.max(...peso))
  while (i >= 0) {
    cadena.set(candidatos[i].numero, candidatos[i])
    i = previo[i]
  }
  return cadena
}

/**
 * El comienzo de un capítulo cuyo número no llegó al texto (#204).
 *
 * pdf-parse perdió el «2» del capítulo 2 del libro de Walton —en el PDF va en
 * otra fuente—, y el encabezado se quedó en «Design and Field Observation». El
 * índice sí lo dice: «2  DESIGN  AND  FIELD  OBSERVATION 9». Con el título del
 * índice se busca en el cuerpo una línea que sea solo ese título: las cabeceras
 * de página también lo llevan, pero con su número de página al lado.
 */
function porElIndice(lineas: Linea[], candidatos: Encabezado[], aislado: (c: Encabezado) => boolean): Encabezado | undefined {
  const delIndice = candidatos.find(c => !aislado(c) && c.titulo)
  if (!delIndice) return undefined
  const clave = claveDeTitulo(delIndice.titulo!)
  if (clave.length < 6) return undefined
  const linea = lineas.find(l => l.fragmento !== delIndice.fragmento && !/\d/.test(l.original) && claveDeTitulo(l.original) === clave)
  return linea ? { fragmento: linea.fragmento, numero: delIndice.numero, confirmado: true } : undefined
}

/** Cuánto suma cada fragmento por lo que la pregunta pide de la estructura. */
function puntosPorEstructura(fragmentos: string[], refs: ReferenciaALaEstructura[]): number[] {
  const puntos = new Array<number>(fragmentos.length).fill(0)
  if (!refs.length) return puntos
  const lineas = lineasDe(fragmentos)
  const subir = (i: number, p: number) => { if (i >= 0 && i < puntos.length) puntos[i] = Math.max(puntos[i], p) }

  for (const { tipo, numero } of refs) {
    if (tipo === 'tabla' || tipo === 'figura') {
      // El pie puede ir encima o debajo, y la tabla seguir en el fragmento siguiente.
      const patron = new RegExp(`\\b(?:${PALABRAS[tipo].join('|')})\\.?\\s*${escapar(numero)}(?![.]?\\d)`, 'u')
      for (const l of lineas) {
        if (!patron.test(l.normal)) continue
        subir(l.fragmento, PESO_ESTRUCTURA)
        subir(l.fragmento + 1, PESO_ESTRUCTURA / 2)
      }
      continue
    }
    const todos = encabezados(lineas, tipo)
    const candidatos = todos.filter(e => e.numero === numero)
    if (!candidatos.length) continue
    /**
     * El «4» sale también en el índice y en el prólogo. En el libro de Walton,
     * cuatro candidatos, y empataban con el bueno. El índice se delata porque
     * sus encabezados van amontonados; el comienzo de un capítulo tiene el suyo
     * solo. Se queda el más aislado —y, a igualdad, el último—, y ése es el que
     * se lleva lo que viene detrás.
     */
    const vecinos = (f: number) => todos.filter(e => Math.abs(e.fragmento - f) <= 1).length - 1
    const cadena = tipo === 'capitulo' ? cadenaDeCapitulos(todos, vecinos) : undefined
    const aislado = (c: Encabezado) => vecinos(c.fragmento) < 2
    const enCadena = cadena?.get(numero)
    const confirmados = candidatos.filter(c => c.confirmado && aislado(c))
    const elegido = (enCadena && enCadena.confirmado && aislado(enCadena) ? enCadena : undefined)
      ?? confirmados[0]
      ?? porElIndice(lineas, candidatos, aislado)
      ?? (enCadena && aislado(enCadena) ? enCadena : undefined)
      ?? candidatos.reduce((mejor, c) => (vecinos(c.fragmento) <= vecinos(mejor.fragmento) ? c : mejor))
    for (const c of candidatos) if (c !== elegido) subir(c.fragmento, PESO_ESTRUCTURA / 6)
    subir(elegido.fragmento, PESO_ESTRUCTURA)
    // Lo que sigue es el capítulo, hasta que empieza el siguiente.
    const fin = siguienteNumero(numero)
    for (let k = 1; k <= FRAGMENTOS_TRAS_ENCABEZADO; k++) {
      if (todos.some(e => e.numero === fin && e.fragmento === elegido.fragmento + k)) break
      subir(elegido.fragmento + k, PESO_ESTRUCTURA * (1 - k / (FRAGMENTOS_TRAS_ENCABEZADO + 1)))
    }
  }
  return puntos
}

/** Pesa más que cualquier coincidencia de palabras (que va normalizada a 1) y que el significado. */
const PESO_ESTRUCTURA = 3
const FRAGMENTOS_TRAS_ENCABEZADO = 8
const MAXIMO_CAPITULO = 60

/**
 * El parecido de cada fragmento con la pregunta, de 0 a 1 (#205).
 *
 * Los cosenos de granite-embedding se apiñan —en el libro de Walton iban de 0,60
 * a 0,83—, así que se mide contra la mediana: lo que no destaca sobre el
 * fragmento típico no suma nada, y el mejor vale 1.
 */
export function relevanciaSemantica(similitudes: number[]): number[] {
  const ordenadas = [...similitudes].sort((a, b) => a - b)
  const mediana = ordenadas[Math.floor(ordenadas.length / 2)] ?? 0
  const maximo = ordenadas[ordenadas.length - 1] ?? 0
  if (maximo <= mediana) return similitudes.map(() => 0)
  return similitudes.map(s => Math.max(0, (s - mediana) / (maximo - mediana)))
}

/**
 * Una búsqueda más dentro del adjunto, además de la pregunta: una consulta
 * corta en el idioma del documento (`consultasDelAdjunto`), con sus similitudes
 * si llegaron los vectores.
 */
export interface ConsultaDelAdjunto {
  texto: string
  similitudes?: number[]
}

/**
 * Lo que suman las palabras de una consulta en cada fragmento, de 0 a 1.
 *
 * Es la parte de la consulta que aparece, y no la proporción sobre el fragmento
 * que más coincide. Con eso, una pregunta en castellano sobre un libro en inglés
 * con dos palabras sueltas en común —«variable» y «ver», que en el libro de
 * Walton salen en el código BASIC del apéndice y en un «ver-tical» partido—
 * daba a esos fragmentos un 1, lo mismo que el mejor por significado, y se
 * llevaban el sitio.
 */
function puntosPorPalabras(normalizados: string[], consulta: string): number[] {
  const total = normalizados.length
  const puntos = new Array<number>(total).fill(0)
  let posible = 0
  for (const { termino, identificador } of terminos(consulta)) {
    const patron = new RegExp(`(^|[^\\p{L}\\p{N}])${escapar(termino)}($|[^\\p{L}\\p{N}])`, 'u')
    const con = normalizados.map(f => patron.test(f))
    const df = con.filter(Boolean).length
    const peso = Math.log((total + 1) / (df + 0.5)) * (identificador ? 3 : 1)
    posible += peso
    con.forEach((esta, i) => { if (esta) puntos[i] += peso })
  }
  return posible ? puntos.map(p => p / posible) : puntos
}

/**
 * El documento entero si cabe; si no, los fragmentos más parecidos a la
 * pregunta y a cada consulta.
 *
 * La puntuación suma tres cosas. Las palabras de la pregunta, con más peso para
 * las que salen en pocos fragmentos y mucho más para los identificadores: las
 * preguntas sobre un documento técnico suelen nombrar lo que buscan —una
 * tubería, un tramo, un artículo—. El significado, si llegan las similitudes con
 * el modelo de embeddings (#205), que es lo que encuentra «well loss» con una
 * pregunta por la «pérdida de carga». Y la estructura (#204), que pesa más que
 * las otras dos: si se pregunta por el capítulo 4, es el capítulo 4.
 *
 * Un fragmento suma además la mitad de lo que puntúe alguno de los seis
 * siguientes, porque en una tabla el encabezado —de qué tramo es, con qué
 * dotación— va unas filas por encima de la que se busca, y con cifras en cada
 * fila caben pocas en un fragmento: en el informe de prueba quedaba a cinco. Sin eso, entre ciento
 * veinte encabezados que dicen «dotación» no hay manera de saber cuál es.
 *
 * Con consultas, cada una tiene su lista y eligen por turnos. Una pregunta que
 * pide seis cosas —tabla de tiempos, escalones, equipos, fórmulas— es un solo
 * vector que no se parece a ninguna, y lo que se llevaba el sitio era lo que se
 * parecía un poco a todo. Por turnos, cada cosa que se pide trae lo suyo, y
 * llega al modelo agrupado bajo la consulta que lo encontró: con los fragmentos
 * buenos pero revueltos, qwen2.5 tomó la tabla de diámetros del pozo por la de
 * los escalones de caudal.
 */
export function seleccionarFragmentos(
  texto: string,
  pregunta: string,
  presupuesto: number,
  { similitudes, consultas = [] }: { similitudes?: number[]; consultas?: ConsultaDelAdjunto[] } = {},
): SeleccionDeAdjunto {
  const fragmentos = trocear(texto)
  const total = fragmentos.length
  const paginas = paginasDeLosFragmentos(texto, fragmentos)
  const paginasDe = (indices: number[]) => {
    const todas = new Set<number>()
    for (const i of indices) {
      const r = paginas[i]
      if (r) for (let p = r.desde; p <= r.hasta; p++) todas.add(p)
    }
    return todas.size ? { paginas: [...todas].sort((a, b) => a - b) } : {}
  }
  if (estimarTokens(texto) <= presupuesto) {
    // Entero ya lleva sus propias cabeceras dentro: no hace falta marcarlo.
    return { texto, completo: true, incluidos: total, total, ...paginasDe(fragmentos.map((_, i) => i)) }
  }

  // El separador «[…]» y el salto de línea entre fragmentos también cuentan, y
  // el final de la frase que sigue, por si el siguiente no entra.
  const colas = fragmentos.map((_, i) => finDeLaFrase(fragmentos[i + 1]))
  const etiquetas = paginas.map(r => (r ? etiquetaDePaginas(r) : ''))
  const tamanos = fragmentos.map((f, i) => estimarTokens(f) + estimarTokens(colas[i]) + estimarTokens(etiquetas[i]) + 4)
  const normalizados = fragmentos.map(normalizar)
  const estructura = puntosPorEstructura(fragmentos, referenciasALaEstructura(pregunta))
  const busquedas: ConsultaDelAdjunto[] = [{ texto: pregunta, similitudes }, ...consultas]

  const listas = busquedas.map(({ texto: consulta, similitudes: suyas }, k) => {
    // Palabras y significado en la misma escala, de 0 a 1, para poder sumarlos (#205).
    const semantica = suyas?.length === total ? relevanciaSemantica(suyas) : undefined
    const palabras = puntosPorPalabras(normalizados, consulta)
    const porContenido = palabras.map((p, i) => p + (semantica?.[i] ?? 0))
    // La estructura es de la pregunta: las consultas no nombran capítulos.
    const puntos = porContenido.map((p, i) =>
      p + 0.5 * Math.max(0, ...porContenido.slice(i + 1, i + 1 + VECINOS_POSTERIORES)) + (k === 0 ? estructura[i] : 0))
    return fragmentos.map((_, i) => i).filter(i => puntos[i] > 0).sort((a, b) => puntos[b] - puntos[a] || a - b)
  })
  // Sin nada en común con la pregunta —«resúmelo», por ejemplo— se lee desde el principio.
  if (listas.every(l => !l.length)) listas[0] = fragmentos.map((_, i) => i)

  const encabezado = (k: number) => `--- Para ${k === 0 ? 'la pregunta' : `«${busquedas[k].texto}»`} ---`
  const agrupar = listas.filter(l => l.length).length > 1
  let disponible = agrupar ? presupuesto - listas.reduce((n, l, k) => n + (l.length ? estimarTokens(encabezado(k)) + 2 : 0), 0) : presupuesto

  const de = new Map<number, number>()
  const cursores = listas.map(() => 0)
  for (let eligio = true; eligio;) {
    eligio = false
    listas.forEach((lista, k) => {
      while (cursores[k] < lista.length) {
        const i = lista[cursores[k]++]
        if (de.has(i) || tamanos[i] > disponible) continue
        de.set(i, k)
        disponible -= tamanos[i]
        eligio = true
        return
      }
    })
  }

  const juntar = (indices: number[]) => {
    let anterior = ''
    return indices.flatMap((i, n) => {
      const salto = n > 0 && indices[n - 1] !== i - 1
      // La página se repite tras un salto y cuando cambia; en lo seguido de la misma página, no.
      const etiqueta = etiquetas[i] && (salto || n === 0 || etiquetas[i] !== anterior) ? etiquetas[i] : ''
      anterior = etiquetas[i]
      const cuerpo = indices[n + 1] === i + 1 || !colas[i] ? fragmentos[i] : `${fragmentos[i]}\n${colas[i]}`
      const conEtiqueta = etiqueta ? `${etiqueta}\n${cuerpo}` : cuerpo
      return salto ? ['[…]', conEtiqueta] : [conEtiqueta]
    }).join('\n')
  }
  const todos = [...de.keys()].sort((a, b) => a - b)
  // Las páginas del final de frase añadido también se leyeron.
  const leidos = [...new Set(todos.flatMap(i => (colas[i] ? [i, i + 1] : [i])))]
  const marcado = etiquetas.some(Boolean) ? { ...paginasDe(leidos), paginado: true } : {}
  if (!agrupar) return { texto: juntar(todos), completo: false, incluidos: todos.length, total, ...marcado }

  const grupos = listas.map((_, k) => todos.filter(i => de.get(i) === k))
  const partes = grupos.flatMap((indices, k) => (indices.length ? [`${encabezado(k)}\n${juntar(indices)}`] : []))
  return {
    texto: partes.join('\n\n'),
    completo: false,
    incluidos: todos.length,
    total,
    ...(partes.length > 1 ? { agrupado: true } : {}),
    ...marcado,
  }
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
    : `El documento no cabe entero en tu contexto. Solo tienes ${seleccion.incluidos} de sus ${seleccion.total} fragmentos, los más relacionados con la pregunta; «[…]» marca lo que falta.${seleccion.agrupado ? ' Van agrupados por la búsqueda que los encontró: usa cada grupo para la parte de la pregunta a la que corresponde.' : ''} Si la respuesta no está en ellos, di que no aparece en lo que has podido leer.\n\n`
  const deLasPaginas = seleccion.paginado
    ? 'Delante de cada fragmento va, entre corchetes, la página del documento impreso en la que está: «[p. 78]» o «[pp. 76-77]». Si citas una página, copia una de esas; no cites ninguna que no veas marcada así.\n\n'
    : ''
  const deOcr = ocr
    ? `El documento es un escaneado leído con OCR (confianza ${ocr.confianza} %): puede tener cifras mal leídas. Si usas una, di que sale de un escaneado leído con OCR.\n\n`
    : ''
  return `=== DOCUMENTO ADJUNTO: ${nombre} ===\n${deOcr}${aviso}${deLasPaginas}${seleccion.texto}\n=== FIN DEL DOCUMENTO ===\n\n`
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
