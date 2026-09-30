/**
 * Consultas en el idioma del adjunto cuando la pregunta viene en otro.
 *
 * Luis preguntó en castellano por el libro de Walton, que está en inglés, y en
 * la selección no entró nada útil: las palabras de la pregunta no salen en el
 * libro y granite-embedding empareja mal una pregunta larga en castellano con
 * texto técnico en inglés. Con consultas como «step drawdown test» o «time
 * intervals water level measurements», en cambio, entraban la tabla de tiempos
 * y el capítulo de pérdidas en el pozo. Se le pide al mismo modelo que va a
 * responder que las escriba: qwen2.5 lo hace en unos 20 s. nemotron-mini, en
 * lugar de consultas, se pone a responder; lo que devuelve no pasa el filtro y
 * se sigue solo con la pregunta, como antes.
 */

import { logger } from '@/utils/logger'
import { terminosDelGlosario } from './glosarioHidraulico'

export type Idioma = 'es' | 'ca' | 'en'

const VACIAS: Record<Idioma, string[]> = {
  es: ['de', 'la', 'que', 'el', 'en', 'los', 'del', 'las', 'por', 'con', 'una', 'para', 'es', 'se'],
  ca: ['de', 'la', 'que', 'el', 'els', 'les', 'amb', 'per', 'una', 'del', 'es', 'és', 'són', 'aquest'],
  en: ['the', 'of', 'and', 'to', 'in', 'is', 'that', 'for', 'with', 'as', 'are', 'by', 'this', 'be'],
}

/**
 * El idioma de un texto por sus palabras vacías, o nada si no está claro.
 * Castellano y catalán comparten muchas; las que no comparten deciden.
 */
export function idiomaDelTexto(texto: string): Idioma | undefined {
  const palabras = texto.slice(0, 20_000).toLowerCase().match(/\p{L}+/gu) ?? []
  const cuenta = (idioma: Idioma) => {
    const suyas = new Set(VACIAS[idioma])
    return palabras.filter(p => suyas.has(p)).length
  }
  const [primero, segundo] = (Object.keys(VACIAS) as Idioma[])
    .map(idioma => ({ idioma, n: cuenta(idioma) }))
    .sort((a, b) => b.n - a.n)
  if (primero.n < 3 || primero.n < segundo.n * 1.2) return undefined
  return primero.idioma
}

const NOMBRE: Record<Idioma, string> = { es: 'castellano', ca: 'catalán', en: 'inglés' }

const EJEMPLO: Record<Idioma, string[]> = {
  en: ['pipe diameter selection discharge', 'head loss calculation', 'PVC roughness coefficient'],
  es: ['selección del diámetro de tubería', 'cálculo de la pérdida de carga', 'coeficiente de rugosidad del PVC'],
  ca: ['selecció del diàmetre de canonada', 'càlcul de la pèrdua de càrrega', 'coeficient de rugositat del PVC'],
}

export function promptDeConsultas(pregunta: string, idiomaDelDocumento: Idioma): string {
  const idioma = NOMBRE[idiomaDelDocumento]
  return `Una persona pregunta sobre un documento escrito en ${idioma}. Para encontrar en él las partes que responden, escribe consultas de búsqueda en ${idioma}: cortas (de 2 a 6 palabras) y una por cada cosa distinta que pide la pregunta. Entre 3 y 8, una por línea, sin numerar ni explicar.
- Nombra cada ensayo, método o concepto con el término técnico que usaría un libro en ${idioma}, no traduciendo palabra por palabra.
- Busca lo que se pide (tablas, procedimientos, fórmulas, criterios), no los datos del caso: profundidades, diámetros o caudales concretos no están en el documento.

Ejemplo
Pregunta: ¿Qué diámetro de tubería necesito para 50 l/s y cuánta pérdida de carga tendrá? ¿Qué rugosidad uso para PVC?
Consultas:
${EJEMPLO[idiomaDelDocumento].join('\n')}

Pregunta: ${pregunta}
Consultas:`
}

const MAXIMO_CONSULTAS = 8
/**
 * Entre las del glosario y las del modelo. Con diez, a cada una le tocaban dos
 * fragmentos: el capítulo del step drawdown test llegaba a trozos y sin el que
 * tiene la ecuación de la pérdida en el pozo.
 */
const MAXIMO_EN_TOTAL = 6

/** Las líneas que son consultas: cortas, sin preguntas ni explicaciones. */
export function leerConsultas(respuesta: string): string[] {
  const vistas = new Set<string>()
  return respuesta
    .split('\n')
    .map(l => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').replace(/^["«]|["»]$/g, '').trim())
    .filter(l => {
      const palabras = l.split(/\s+/).filter(Boolean).length
      if (palabras < 1 || palabras > 8 || /[?:]|\.$/.test(l) || vistas.has(l.toLowerCase())) return false
      vistas.add(l.toLowerCase())
      return true
    })
    .slice(0, MAXIMO_CONSULTAS)
}

/** Lo que se espera a las consultas; sin ellas se elige solo con la pregunta. */
const ESPERA_MS = 60_000

/**
 * Las consultas para buscar en el adjunto: las del glosario y las que escriba el
 * modelo. Ninguna si pregunta y documento van en el mismo idioma o si no se sabe
 * el de alguno.
 *
 * Con el mismo `num_ctx` que la respuesta: con otro, Ollama recargaría el
 * modelo dos veces por pregunta.
 */
export async function consultasEnElIdiomaDelDocumento({
  documento, pregunta, idiomaDeLaApp, baseUrl, modelo, numCtx,
}: {
  documento: string
  pregunta: string
  idiomaDeLaApp: string
  baseUrl: string
  modelo: string
  numCtx: number
}): Promise<string[]> {
  const delDocumento = idiomaDelTexto(documento)
  const deLaPregunta = idiomaDelTexto(pregunta) ?? idiomaDeLaApp
  if (!delDocumento || delDocumento === deLaPregunta) return []
  // El glosario va primero: sus términos son los del libro, y no dependen de que el modelo conteste.
  const delGlosario = delDocumento === 'en' ? terminosDelGlosario(pregunta) : []
  const delModelo = delGlosario.length < MAXIMO_EN_TOTAL ? await consultasDelModelo(pregunta, delDocumento, baseUrl, modelo, numCtx) : []
  const vistas = new Set<string>()
  const consultas = [...delGlosario, ...delModelo]
    .filter(c => !vistas.has(c.toLowerCase()) && vistas.add(c.toLowerCase()))
    .slice(0, MAXIMO_EN_TOTAL)
  logger.info('Consultas para el adjunto', { idioma: delDocumento, delGlosario, delModelo })
  return consultas
}

async function consultasDelModelo(pregunta: string, delDocumento: Idioma, baseUrl: string, modelo: string, numCtx: number): Promise<string[]> {
  try {
    const r = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelo,
        stream: false,
        options: { temperature: 0, num_ctx: numCtx },
        messages: [{ role: 'user', content: promptDeConsultas(pregunta, delDocumento) }],
      }),
      signal: AbortSignal.timeout(ESPERA_MS),
    })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return leerConsultas((await r.json())?.message?.content ?? '')
  } catch (error) {
    logger.warn('No se pudieron escribir consultas para el adjunto; se busca con la pregunta', error)
    return []
  }
}
