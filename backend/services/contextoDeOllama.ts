/**
 * El contexto que se le pide a Ollama para cada modelo (`num_ctx`).
 *
 * Sin pedirlo, Ollama carga cualquier modelo con 4096 tokens. Con qwen2.5:7b y
 * un libro adjunto eso dejaba sitio para 9 de sus 621 fragmentos, ninguno de los
 * que respondían, y la respuesta salía genérica. qwen2.5 admite 32 768, y su
 * caché de contexto es pequeña —unos 56 KB por token, 470 MB con 8192—, así que
 * se le piden 8192. Más no: el prompt se procesa en CPU en muchas máquinas y
 * cada token de entrada se nota en la espera. Un modelo que admite menos, como
 * nemotron-mini (4096), se queda en lo suyo: por encima de lo que se entrenó
 * no responde mejor, sino peor.
 *
 * Se pide siempre el mismo valor para un mismo modelo porque Ollama recarga el
 * modelo entero cada vez que cambia `num_ctx`.
 */

export const CONTEXTO_OLLAMA_POR_DEFECTO = 4096
export const TOPE_CONTEXTO_OLLAMA = 8192

export function contextoParaModelo(longitudDelModelo: number | undefined): number {
  if (!longitudDelModelo || longitudDelModelo <= 0) return CONTEXTO_OLLAMA_POR_DEFECTO
  return Math.min(TOPE_CONTEXTO_OLLAMA, longitudDelModelo)
}

const conocidos = new Map<string, Promise<number>>()

/** Lo que dice `/api/show` del modelo, recortado al tope; si no contesta, lo de siempre. */
export function contextoDeOllama(baseUrl: string, modelo: string): Promise<number> {
  const clave = `${baseUrl}\0${modelo}`
  const ya = conocidos.get(clave)
  if (ya) return ya
  const consulta = (async () => {
    try {
      const r = await fetch(`${baseUrl}/api/show`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelo }),
        signal: AbortSignal.timeout(10_000),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const info = ((await r.json()) as { model_info?: Record<string, unknown> }).model_info ?? {}
      const longitud = Object.entries(info).find(([k]) => k.endsWith('.context_length'))?.[1]
      return contextoParaModelo(typeof longitud === 'number' ? longitud : undefined)
    } catch {
      conocidos.delete(clave)
      return CONTEXTO_OLLAMA_POR_DEFECTO
    }
  })()
  conocidos.set(clave, consulta)
  return consulta
}
