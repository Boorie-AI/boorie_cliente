/**
 * Quita de la respuesta las páginas que el modelo se inventa (#165).
 *
 * La regla de no citar una página que no esté entre las fuentes lleva escrita
 * en el prompt desde el #160, y el modelo local se la salta: medido en la
 * aplicación, con un libro cuya única fuente recuperada no traía número de
 * página, la respuesta salió citando «[Fuente: 1.4 Engineering Hydrology,
 * K. Subramanya, página X]». Una página inventada es peor que ninguna: quien
 * lee la cita va a buscarla y el dato no está ahí, así que la respuesta deja de
 * ser contrastable justo donde parecía serlo.
 *
 * Por eso esto no es más texto en el prompt. Es una comprobación después de
 * escribir, contra lo que las fuentes dicen de verdad: lo que no está
 * respaldado se borra, y la cita se queda sin ese detalle, que es exactamente
 * lo que la regla pedía.
 *
 * Es conservador a propósito. Sólo toca una referencia a página que vaya
 * seguida de un número o de una letra suelta —«página 96», «page 12»,
 * «página X»—, que es la forma en la que se citan. «En la página siguiente» o
 * «la página web» no encajan en el patrón y no se tocan: borrar prosa legítima
 * para arreglar una cita sería cambiar un error visible por uno invisible.
 */

export interface RespaldoDeFuente {
  /** La página que declara la fuente, si la declara. */
  page?: number | string | null
}

/**
 * Las páginas que las fuentes respaldan de verdad.
 *
 * Se normalizan a texto porque llegan de dos sitios —la metainformación del
 * fragmento y la base— y unas veces son número y otras cadena.
 */
function paginasConRespaldo(fuentes: RespaldoDeFuente[]): Set<string> {
  const paginas = new Set<string>()
  for (const fuente of fuentes) {
    if (fuente.page === undefined || fuente.page === null || fuente.page === '') continue
    const n = Number(fuente.page)
    // La página 0 es la de un documento mal indexado: no respalda nada, igual
    // que en `identidadDeFuente`, donde tampoco se enseña.
    if (Number.isFinite(n) && n > 0) paginas.add(String(n))
  }
  return paginas
}

/**
 * Los números que aparecen sueltos en un texto, como si fueran páginas.
 *
 * Es el respaldo de un adjunto: su texto no trae marcas de página, sólo los
 * números impresos en cabeceras y pies, así que no hay forma de saber en qué
 * página cae cada fragmento. Sin esto, todas las páginas que el modelo citaba
 * de un adjunto se daban por inventadas —también las buenas: las 77-78 de la
 * ecuación de Jacob en el libro de Walton—. Es permisivo a propósito: deja
 * pasar una página que el modelo pudo ver impresa, y sigue quitando el hueco
 * «página X» y las que no aparecen en nada de lo que leyó.
 */
export function paginasQueAparecenEn(texto: string): RespaldoDeFuente[] {
  return [...new Set(texto.match(/\b[0-9]{1,4}\b/g) ?? [])].map(page => ({ page }))
}

/**
 * «página 96», «pág. 12», «page 4», «p. 7», los rangos «pp. 77-78» y la
 * variante que motivó todo esto: «página X», con una letra suelta de hueco sin
 * rellenar.
 *
 * Lo que va delante —una coma, un punto y coma o un paréntesis de apertura— se
 * captura para poder borrarlo con la referencia y no dejar «, ]» detrás. El
 * límite de palabra delante evita leer el «p.» de «cap. 4» como una cita: sin
 * él, «(cap. 4, pp. 77‑78)» se quedaba en «(ca‑78)». Y la palabra tiene que
 * acabar ahí: «(páginas indicadas)» se leía como «página» más la letra suelta
 * «s», el hueco «página X», y se borraba. Una lista, «(pp. 38–41, 52)», es
 * una sola cita: quitando sólo el rango quedaba «, 52)» suelto.
 */
const REFERENCIA = /(\s*[,;]?\s*\(?\s*)(?<![A-Za-zÀ-ÿ])(?:páginas?|págs?\.?|pages?|pp?\.)(?![A-Za-zÀ-ÿ])\s*([0-9]{1,5}(?:\s*[-‐‑–—]\s*[0-9]{1,5})?(?:\s*(?:,|y|and)\s*[0-9]{1,5}(?:\s*[-‐‑–—]\s*[0-9]{1,5})?)*|[A-Za-zÁÉÍÓÚÑ])\b(\s*\)?)/gi

/** Lo que queda después de borrar: puntuación huérfana y espacios de más. */
function recomponer(texto: string): string {
  return texto
    .replace(/\(\s*\)/g, '')
    .replace(/\[\s*,/g, '[')
    .replace(/,\s*([)\]])/g, '$1')
    .replace(/\s+([,;.)\]])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
}

/**
 * Devuelve el texto sin las páginas que ninguna fuente respalda, y cuáles eran.
 *
 * Se devuelven las quitadas para poder dejarlas en el log: si un modelo empieza
 * a inventarse páginas a menudo, eso se tiene que poder ver sin leerse las
 * respuestas una a una.
 */
export function limpiarCitasSinRespaldo(
  texto: string,
  fuentes: RespaldoDeFuente[]
): { texto: string; quitadas: string[] } {
  if (!texto) return { texto, quitadas: [] }

  const respaldadas = paginasConRespaldo(fuentes)
  const quitadas: string[] = []

  const limpio = texto.replace(REFERENCIA, (entera, antes: string, pagina: string, despues: string) => {
    // De un rango o una lista basta con que una esté respaldada.
    const extremos = pagina.split(/[^0-9A-Za-zÁÉÍÓÚÑ]+/).filter(p => p && p !== 'y' && p !== 'and')
    if (extremos.some(p => respaldadas.has(String(Number(p))))) return entera

    quitadas.push(entera.trim())
    // Si la referencia venía entre paréntesis propios, se va con ellos; si
    // venía pegada a una coma dentro de una cita más larga, se va la coma, y el
    // paréntesis que cierra la cita se queda.
    const abria = antes.includes('(')
    const cerraba = despues.includes(')')
    if (abria && cerraba) return ''
    const cierre = cerraba ? ')' : ''
    return (antes.includes(',') || antes.includes(';') ? '' : ' ') + cierre
  })

  return { texto: recomponer(limpio), quitadas }
}

/**
 * «Ec. 4.2», «Tabla 2.1», «Figura 3.8» que no están en lo que el modelo leyó.
 *
 * Con las páginas no basta: nemotron-3-ultra citaba «Ec. 1.1, p. 3» de un
 * fragmento que no tenía delante. La ecuación existe en el libro, pero si no
 * está en lo leído, el modelo la cita de memoria y nadie lo ha comprobado. No
 * se borra —la referencia puede ser buena y quitarla deja la frase coja—: se
 * marca con `nota`, para que quien lea sepa que eso no sale de lo leído.
 *
 * Sólo numeraciones con punto, como las de un libro o una norma («4.2»,
 * «2.11»). Un «Tabla 1» suele ser una tabla de la propia respuesta.
 */
const REFERENCIA_NUMERADA = /\b(ec\.|ecuaci[oó]n(?:es)?|eq\.|equations?|f[oó]rmula|tablas?|tables?|cuadro|taula|figuras?|figures?|fig\.)\s*\(?(\d{1,2}\.\d{1,3})(?:\s*[-‐‑–—y]\s*(\d{1,2}\.\d{1,3}))?\)?/gi

function estaEnLoLeido(tipo: string, numero: string, leido: string): boolean {
  const n = numero.replace('.', '\\.')
  const t = tipo.toLowerCase()
  // Basta con que lo leído la nombre: «From Equation 1.1 with r c = 0.2 ft…»
  // es del libro aunque la ecuación esté en otra página.
  if (/^(ec|ecuaci|eq|equation|f[oó]rmula)/.test(t)) {
    return new RegExp(`\\(\\s*${n}\\s*\\)|\\b(?:equations?|eq\\.|ecuaci[oó]n(?:es)?)\\s*${n}(?!\\.?\\d)`, 'i').test(leido)
  }
  if (/^(tabla|table|cuadro|taula)/.test(t)) return new RegExp(`\\b(?:table|tabla|cuadro|taula)\\s*${n}(?!\\.?\\d)`, 'i').test(leido)
  return new RegExp(`\\b(?:figure|figura|fig\\.)\\s*${n}(?!\\.?\\d)`, 'i').test(leido)
}

/**
 * Los números de los apartados de la propia respuesta. nemotron-3-ultra
 * escribió «Fórmula 6.3» refiriéndose a su apartado «### 6.3 Eficiencia del
 * pozo», y se marcó como si fuera del documento.
 */
function apartadosPropios(texto: string): Set<string> {
  const propios = new Set<string>()
  for (const m of texto.matchAll(/^\s*(?:#{1,6}\s*)?\**\s*(\d{1,2}\.\d{1,3})\.?\s/gm)) propios.add(m[1])
  return propios
}

export function marcarReferenciasSinRespaldo(
  texto: string,
  leido: string,
  nota: string
): { texto: string; marcadas: string[] } {
  if (!texto || !leido) return { texto, marcadas: [] }
  const marcadas: string[] = []
  const vistas = new Set<string>()
  const propios = apartadosPropios(texto)
  const marcado = texto.replace(REFERENCIA_NUMERADA, (entera, tipo: string, desde: string, hasta?: string) => {
    if ([desde, hasta].some(n => n && (estaEnLoLeido(tipo, n, leido) || propios.has(n)))) return entera
    // Una vez por referencia: repetir la nota en cada mención la hace ruido.
    const clave = `${tipo.toLowerCase().slice(0, 3)}${desde}`
    if (vistas.has(clave)) return entera
    vistas.add(clave)
    marcadas.push(entera)
    return `${entera} ${nota}`
  })
  return { texto: marcado, marcadas }
}

/**
 * Normas citadas que no están en lo que el modelo leyó.
 *
 * La regla de no citar normas que no se tienen delante está en el prompt
 * (`DOCUMENTOS` en promptDelAgente) y nemotron-3-ultra se la saltó con el libro
 * de Walton adjunto: «RD 849/1986, NCh 3341, NMX-AA-147, RAS 2010» como si
 * exigieran la prueba escalonada, y la «API RP 13C» —fluidos de perforación—
 * para medir arena. Igual que con las ecuaciones: no se borran, se marcan, y
 * una norma que sí salga en lo leído —un documento de normativa del RAG— se
 * queda como está.
 */
const NORMA = new RegExp([
  String.raw`\b(?:RD|R\.D\.|Real\s+Decreto)\s*\d{1,4}\s*\/\s*\d{4}`,
  String.raw`\bResoluci[oó]n\s+(?:N[º°o.]\s*)?\d{1,5}\s+de\s+\d{4}`,
  String.raw`\b(?:NOM|NMX)-[A-Z0-9]{1,6}(?:-[A-Z0-9]{1,6}){1,4}`,
  String.raw`\b(?:NCh|NTC|NBR|UNE(?:-EN)?(?:\s+ISO)?|ISO|DIN|ASTM|AWWA|API(?:\s+(?:RP|Std))?|RAS)\s*[A-Z]?\d{1,6}(?:[-.:]\d{1,5})*[A-Z]?`,
].join('|'), 'g')

const sinSeparadores = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, '')

export function marcarNormasSinRespaldo(
  texto: string,
  leido: string,
  nota: string
): { texto: string; marcadas: string[] } {
  if (!texto || !leido) return { texto, marcadas: [] }
  const enLoLeido = sinSeparadores(leido)
  const marcadas: string[] = []
  const vistas = new Set<string>()
  const marcado = texto.replace(NORMA, entera => {
    const clave = sinSeparadores(entera).replace(/^(realdecreto|rd)/, 'rd')
    // «Real Decreto 849/1986» y «RD 849/1986» son la misma: se busca su número.
    const numero = clave.replace(/^[a-z]+/, '')
    if (enLoLeido.includes(clave) || (numero.length >= 4 && enLoLeido.includes(numero))) return entera
    if (vistas.has(clave)) return entera
    vistas.add(clave)
    marcadas.push(entera)
    return `${entera} ${nota}`
  })
  return { texto: marcado, marcadas }
}
