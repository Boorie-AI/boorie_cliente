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
 *
 * Con un modelo de NVIDIA las escribe ese mismo modelo, pero desde el proceso
 * principal (#224): la clave no pasa al renderer.
 */

import { logger } from '@/utils/logger'
import { leerConsultas, promptDeConsultas, type Idioma } from '@/../backend/services/hydraulic/consultasEnOtroIdioma'
import { terminosDelGlosario } from './glosarioHidraulico'

export { leerConsultas, promptDeConsultas, type Idioma }

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

/**
 * Entre las del glosario y las del modelo. Con diez, a cada una le tocaban dos
 * fragmentos: el capítulo del step drawdown test llegaba a trozos y sin el que
 * tiene la ecuación de la pérdida en el pozo.
 */
const MAXIMO_EN_TOTAL = 6

/** Lo que se espera a las consultas; sin ellas se elige solo con la pregunta. */
const ESPERA_MS = 60_000

/** Quien escribe las consultas: Ollama desde aquí, o la nube por IPC. */
export type EscritorDeConsultas = (pregunta: string, idioma: Idioma) => Promise<string[]>

/**
 * Las consultas para buscar en el adjunto: las del glosario y las que escriba el
 * modelo, si hay quien las escriba. Ninguna si pregunta y documento van en el
 * mismo idioma o si no se sabe el de alguno.
 */
export async function consultasEnElIdiomaDelDocumento({
  documento, pregunta, idiomaDeLaApp, escribir,
}: {
  documento: string
  pregunta: string
  idiomaDeLaApp: string
  escribir?: EscritorDeConsultas
}): Promise<string[]> {
  const delDocumento = idiomaDelTexto(documento)
  const deLaPregunta = idiomaDelTexto(pregunta) ?? idiomaDeLaApp
  if (!delDocumento || delDocumento === deLaPregunta) return []
  // El glosario va primero: sus términos son los del libro, y no dependen de que el modelo conteste.
  const delGlosario = delDocumento === 'en' ? terminosDelGlosario(pregunta) : []
  let delModelo: string[] = []
  if (escribir && delGlosario.length < MAXIMO_EN_TOTAL) {
    try {
      delModelo = await escribir(pregunta, delDocumento)
    } catch (error) {
      logger.warn('No se pudieron escribir consultas para el adjunto; se busca con la pregunta', error)
    }
  }
  const vistas = new Set<string>()
  const consultas = [...delGlosario, ...delModelo]
    .filter(c => !vistas.has(c.toLowerCase()) && vistas.add(c.toLowerCase()))
    .slice(0, MAXIMO_EN_TOTAL)
  logger.info('Consultas para el adjunto', { idioma: delDocumento, delGlosario, delModelo })
  return consultas
}

/**
 * Las escribe un modelo de Ollama, con el mismo `num_ctx` que la respuesta:
 * con otro, Ollama recargaría el modelo dos veces por pregunta.
 */
export function consultasDeOllama(baseUrl: string, modelo: string, numCtx: number): EscritorDeConsultas {
  return async (pregunta, idioma) => {
    const r = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelo,
        stream: false,
        options: { temperature: 0, num_ctx: numCtx },
        messages: [{ role: 'user', content: promptDeConsultas(pregunta, idioma) }],
      }),
      signal: AbortSignal.timeout(ESPERA_MS),
    })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return leerConsultas((await r.json())?.message?.content ?? '')
  }
}

/**
 * Las escribe un modelo de NVIDIA desde el proceso principal, que es donde está
 * la clave (#224). Lo que vuelve son sólo las consultas.
 */
export function consultasPorIPC(proveedor: string, modelo: string): EscritorDeConsultas {
  return async (pregunta, idioma) => {
    const r = await window.electronAPI?.agenticRAG?.consultas?.({ pregunta, idioma, proveedor, modelo })
    if (!r?.success) throw new Error(r?.error ?? 'El proceso principal no contestó')
    if (r.motivo) logger.info('Sin consultas de la nube para el adjunto', { motivo: r.motivo })
    return r.consultas ?? []
  }
}

/** Quién escribe las consultas con el modelo que va a responder; nadie si su proveedor no lo hace. */
export function escritorDeConsultas(proveedor: string, modelo: string, numCtx: number, ollamaBaseUrl: string): EscritorDeConsultas | undefined {
  const nombre = proveedor.trim().toLowerCase()
  if (nombre === 'ollama') return consultasDeOllama(ollamaBaseUrl, modelo, numCtx)
  if (nombre === 'nvidia') return consultasPorIPC(proveedor, modelo)
  return undefined
}
