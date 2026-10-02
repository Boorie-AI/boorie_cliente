/**
 * Una segunda pasada que compara la respuesta con lo que el modelo leyó.
 *
 * Las comprobaciones de `citasSinRespaldo` miran la forma —una página, una
 * ecuación, una norma— y no el fondo. Con el libro de Walton adjunto,
 * nemotron-3-ultra pedía «recuperación completa entre escalones» cuando la
 * prueba escalonada va seguida, y no daba el criterio del libro para C aunque
 * lo tenía delante. Eso sólo lo ve alguien que lea la respuesta contra los
 * fragmentos.
 *
 * El revisor también se equivoca: en la primera medida, la mitad de lo que
 * señaló era falso —una Tabla 2.2 mal leída, una ecuación que decía ver y no
 * estaba—. Por eso cada problema tiene que traer la frase literal de los
 * fragmentos que lo demuestra, y lo que no la trae, o trae una que no está, se
 * descarta aquí, sin preguntarle a nadie. Con ese filtro pasaron los dos
 * problemas de verdad y ninguno de los falsos.
 */

export interface ProblemaDeLaRespuesta {
  tipo: 'contradice' | 'omite'
  cita: string
  evidencia: string
  pagina: string
  correccion: string
}

const MAXIMO_PROBLEMAS = 6
/** Una evidencia más corta que esto coincide en cualquier texto. */
const EVIDENCIA_MINIMA = 20

export function promptDeRevision(pregunta: string, leido: string, respuesta: string): string {
  return `Eres revisor técnico. Tienes la PREGUNTA de un usuario, los FRAGMENTOS de un documento que se usaron para responderla y la RESPUESTA que se le dio. Si los fragmentos llevan su página impresa entre corchetes, úsala.

Busca en la respuesta, comparando SOLO con los fragmentos:
- "contradice": algo que los fragmentos dicen de otra manera.
- "omite": una cifra o un valor de los fragmentos —un umbral, una duración, un rango típico— importante para la pregunta que la respuesta no da en ninguna parte. Si la respuesta lo dice con otras palabras o en otro idioma, NO es una omisión: no se pide citar el documento literalmente.
No juzgues lo que la respuesta presenta como práctica general o conocimiento propio, ni el estilo, ni las marcas «[no está en lo que se ha leído del documento]».

Cada problema tiene que llevar la "evidencia": una frase copiada LITERALMENTE de los fragmentos, en su idioma original, que lo demuestre. Si no encuentras esa frase en los fragmentos, no es un problema: no lo incluyas.

Devuelve SOLO un JSON, sin texto alrededor:
{"problemas":[{"tipo":"contradice|omite","cita":"frase copiada EXACTA de la respuesta (vacía si es omite)","evidencia":"frase literal de los fragmentos","pagina":"la página del fragmento de la evidencia, o vacía","correccion":"qué dice el documento, en una frase en el idioma de la pregunta"}]}
Como mucho ${MAXIMO_PROBLEMAS}, los más importantes. Si no hay ninguno: {"problemas":[]}

=== PREGUNTA ===
${pregunta}

=== FRAGMENTOS ===
${leido}

=== RESPUESTA ===
${respuesta}`
}

/** Sin espacios, guiones ni puntuación: pdf-parse parte palabras («gener- ally») y el modelo las une. */
const normal = (t: string) => t.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]/g, '')

function leerJSON(texto: string): unknown {
  const inicio = texto.indexOf('{')
  const fin = texto.lastIndexOf('}')
  if (inicio < 0 || fin <= inicio) return null
  try {
    return JSON.parse(texto.slice(inicio, fin + 1))
  } catch {
    return null
  }
}

/** Las cifras de dos o más dígitos de un texto, con la coma decimal como punto. */
const cifras = (t: string) => [...new Set((t.match(/\d+(?:[.,]\d+)?/g) ?? []).map(c => c.replace(',', '.')).filter(c => c.replace('.', '').length >= 2))]

/**
 * Una omisión que no lo es: un tramo de la frase ya está en la respuesta, o sus cifras van
 * juntas en una misma línea. Ultra dio por omitidos «reliable power, pump, and
 * discharge-control equipment», que la respuesta citaba literal, y la precisión
 * del 15 % y el 30 %, que la respuesta daba como «±15 % en K, ±30 % en S».
 */
const TRAMO_CITADO = 30

/**
 * El revisor confiesa cuando la omisión es sólo de forma: con el libro de
 * Walton dio por omitidos tres criterios que la respuesta tenía, en castellano,
 * y lo justificó con «la respuesta no lo cita textualmente» o «no lo reproduce
 * como criterio». Los embeddings no lo distinguen —una omisión real y una
 * paráfrasis salían a 0,745 y 0,77 de la respuesta—; su propia frase, sí.
 */
const SOLO_FALTA_LA_CITA = /textual|literal|no lo (?:cita|reproduce)|no (?:se )?cita(?:do)? (?:expl[ií]citamente|como)|verbatim|word for word/i

function yaLoDice(evidencia: string, respuesta: string): boolean {
  // La respuesta suele citar un trozo de la frase, no la frase entera.
  const ev = normal(evidencia)
  const resp = normal(respuesta)
  for (let i = 0; i + TRAMO_CITADO <= ev.length; i += 5) {
    if (resp.includes(ev.slice(i, i + TRAMO_CITADO))) return true
  }
  const suyas = cifras(evidencia)
  if (suyas.length < 2) return false
  return respuesta.split('\n').some(linea => {
    const enLinea = cifras(linea)
    return suyas.every(c => enLinea.includes(c))
  })
}

/** Lo que el revisor señaló y se puede comprobar: evidencia en lo leído y, si contradice, cita en la respuesta. */
export function problemasComprobados(salida: string, leido: string, respuesta: string, notaDeBoorie = ''): ProblemaDeLaRespuesta[] {
  const datos = leerJSON(salida) as { problemas?: unknown } | null
  if (!datos || !Array.isArray(datos.problemas)) return []
  const enLoLeido = normal(leido)
  const enLaRespuesta = normal(respuesta)
  const vistos = new Set<string>()
  const buenos: ProblemaDeLaRespuesta[] = []
  for (const p of datos.problemas as Array<Record<string, unknown>>) {
    const tipo = p?.tipo === 'contradice' || p?.tipo === 'omite' ? p.tipo : undefined
    const texto = (k: string) => (typeof p?.[k] === 'string' ? (p[k] as string).trim() : String(p?.[k] ?? '').trim())
    const evidencia = texto('evidencia')
    const cita = texto('cita')
    const correccion = texto('correccion')
    if (!tipo || !correccion) continue
    const ev = normal(evidencia)
    if (ev.length < EVIDENCIA_MINIMA || !enLoLeido.includes(ev)) continue
    if (tipo === 'contradice' && (normal(cita).length < 8 || !enLaRespuesta.includes(normal(cita)))) continue
    // Las marcas las pone Boorie, no el modelo: no hay nada que revisar en ellas.
    if (notaDeBoorie && cita.includes(notaDeBoorie)) continue
    // Sólo se dan por omitidos datos con cifras: los criterios cualitativos que
    // la respuesta parafrasea son justo los que el revisor da por omitidos sin
    // serlo, y los que valían algo —el umbral de C, las 20 h de recuperación,
    // la duración de 8 h a 5 días— llevan número.
    if (tipo === 'omite' && (!/\d/.test(evidencia) || yaLoDice(evidencia, respuesta) || SOLO_FALTA_LA_CITA.test(correccion))) continue
    if (vistos.has(ev)) continue
    vistos.add(ev)
    buenos.push({ tipo, cita: tipo === 'omite' ? '' : cita, evidencia, pagina: texto('pagina'), correccion })
    if (buenos.length >= MAXIMO_PROBLEMAS) break
  }
  return buenos
}

export interface TextosDeRevision {
  titulo: string
  contradice: string
  omite: string
  pagina: (p: string) => string
}

/** El apartado que se añade al final de la respuesta, con la frase del documento para que se pueda comprobar. */
export function apartadoDeRevision(problemas: ProblemaDeLaRespuesta[], t: TextosDeRevision): string {
  if (!problemas.length) return ''
  const lineas = problemas.map(p => {
    const donde = p.pagina ? ` ${t.pagina(p.pagina.replace(/^p{1,2}\.\s*/i, ''))}` : ''
    const que = p.tipo === 'contradice' ? `**${t.contradice}** «${p.cita}»: ${p.correccion}` : `**${t.omite}** ${p.correccion}`
    return `- ${que}${donde}\n  > ${p.evidencia}`
  })
  return `\n\n---\n\n### ${t.titulo}\n\n${lineas.join('\n')}`
}
