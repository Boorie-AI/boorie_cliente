/**
 * Qué modelo responde en el chat, según el proceso principal (#49).
 *
 * La interfaz no elige modelo: lo pregunta. Quien decide es
 * `backend/services/hydraulic/agentic/modelosRAG.ts`, que es también quien
 * conoce las variables de entorno y qué hay instalado en Ollama. Aquí sólo se
 * guarda la respuesta, porque hace falta en tres sitios —el desplegable, el
 * envío del mensaje y el pie de cada respuesta— y dos de ellos no pueden
 * esperar a una llamada asíncrona.
 */

import { logger } from '@/utils/logger'

export interface ModelosRAG {
  backend: 'ollama' | 'nvidia'
  principal: string
  auxiliar: string
  /** El que redacta la respuesta: el principal, o el auxiliar si aquél falta. */
  modeloRespuesta: string
  degradado: boolean
  motivo?: string
  selectorVisible: boolean
}

let cache: ModelosRAG | null = null
let pendiente: Promise<ModelosRAG | null> | null = null

export async function cargarModelosRAG(): Promise<ModelosRAG | null> {
  if (cache) return cache
  if (!pendiente) {
    pendiente = window.electronAPI.agenticRAG
      .modelos()
      .then((r: { success: boolean; data?: ModelosRAG }) => {
        cache = r?.success && r.data ? r.data : null
        return cache
      })
      .catch((error: unknown) => {
        logger.warn('No se pudo consultar el modelo del RAG:', error)
        pendiente = null
        return null
      })
  }
  return pendiente
}

/** Lo ya consultado, para los sitios que renderizan y no pueden esperar. */
export function modelosRAGEnCache(): ModelosRAG | null {
  return cache
}

/**
 * El modelo y el proveedor con los que hay que responder cuando el usuario no
 * elige, o `null` si sí elige (o si todavía no se sabe y hay que respetar lo
 * que la conversación tuviera guardado).
 */
export function modeloFijadoRAG(): { model: string; provider: string } | null {
  if (!cache || cache.selectorVisible) return null
  return {
    model: cache.modeloRespuesta,
    provider: cache.backend === 'nvidia' ? 'nvidia' : 'Ollama',
  }
}

/**
 * Si el usuario puede elegir modelo en el chat.
 *
 * Mientras no se sepa, se dice que no: enseñar el desplegable y quitarlo un
 * instante después es peor que no enseñarlo, y el caso normal es que esté
 * oculto.
 */
export function selectorModeloVisible(): boolean {
  return cache?.selectorVisible === true
}
