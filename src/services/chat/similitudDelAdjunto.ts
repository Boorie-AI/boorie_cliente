/**
 * El parecido de la pregunta con cada fragmento del adjunto (#205).
 *
 * El documento se vectoriza al adjuntarlo, mientras se escribe la pregunta, y el
 * proceso principal lo guarda en disco. Si al preguntar no ha terminado, se
 * espera un rato; y si no llega —Ollama caído, un documento enorme— se elige
 * solo por palabras, que es como se elegía antes.
 */

import { logger } from '@/utils/logger'
import { trocear } from './adjunto'

/** Lo que se espera a los vectores al preguntar: el libro de Walton tardó 68 s. */
const ESPERA_MS = 120_000
const EN_MEMORIA = 5

const preparados = new Map<string, Promise<number[][] | null>>()

/** Empieza a vectorizar el documento, o devuelve lo que ya se está haciendo. */
export function prepararAdjunto(texto: string): Promise<number[][] | null> {
  const ya = preparados.get(texto)
  if (ya) return ya
  const trabajo = (async () => {
    const pedir = window.electronAPI?.chat?.vectoresDeAdjunto
    if (!pedir) return null
    const r = await pedir(trocear(texto))
    if (!r?.success || !r.vectores?.length) {
      logger.warn('No se pudo vectorizar el adjunto; se elige por palabras', r?.message)
      preparados.delete(texto)
      return null
    }
    return r.vectores
  })()
  preparados.set(texto, trabajo)
  // Los últimos documentos bastan: son los de las conversaciones que se tienen abiertas.
  while (preparados.size > EN_MEMORIA) preparados.delete(preparados.keys().next().value as string)
  return trabajo
}

export function coseno(a: number[], b: number[]): number {
  let ab = 0, aa = 0, bb = 0
  for (let i = 0; i < a.length; i++) { ab += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i] }
  return aa && bb ? ab / Math.sqrt(aa * bb) : 0
}

/** Un coseno por fragmento, en el orden de `trocear`; nada si no se pudo. */
export async function similitudesDelAdjunto(texto: string, pregunta: string, esperaMs = ESPERA_MS): Promise<number[] | undefined> {
  try {
    let temporizador: ReturnType<typeof setTimeout> | undefined
    const tarde = new Promise<null>(resolve => { temporizador = setTimeout(() => resolve(null), esperaMs) })
    const vectores = await Promise.race([prepararAdjunto(texto), tarde]).finally(() => clearTimeout(temporizador))
    if (!vectores) return undefined
    const r = await window.electronAPI?.chat?.vectorDeTexto?.(pregunta)
    // Con otro modelo de embeddings desde que se vectorizó, los vectores no se comparan.
    if (!r?.success || !r.vector || r.vector.length !== vectores[0].length) return undefined
    return vectores.map(v => coseno(v, r.vector!))
  } catch (error) {
    logger.warn('No se pudo comparar la pregunta con el adjunto; se elige por palabras', error)
    return undefined
  }
}
