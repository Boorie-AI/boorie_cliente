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

/**
 * El modelo que redacta, elegido en Configuración → IA.
 *
 * El #49 lo dejó fijo y sin forma de cambiarlo salvo con variables de entorno, que en una
 * instalación de Windows no son algo que se le pueda pedir a quien la usa. Lo que se elige aquí
 * manda sobre el automático; el auxiliar, que gradúa fragmento a fragmento, sigue siendo local.
 */
export interface ModeloElegido {
  /** El id del proveedor en `ai_providers`, para encontrar su clave. */
  proveedorId: string
  proveedor: string
  modelo: string
}

export const CLAVE_MODELO_RESPUESTA = 'chat.modeloRespuesta'

let cache: ModelosRAG | null = null
let elegido: ModeloElegido | null = null
let pendiente: Promise<ModelosRAG | null> | null = null

function leerElegido(valor: unknown): ModeloElegido | null {
  if (typeof valor !== 'string' || !valor.trim()) return null
  try {
    const e = JSON.parse(valor)
    return e && typeof e.modelo === 'string' && e.modelo && typeof e.proveedor === 'string' && e.proveedor
      ? { proveedorId: String(e.proveedorId ?? ''), proveedor: e.proveedor, modelo: e.modelo }
      : null
  } catch {
    return null
  }
}

export async function cargarModelosRAG(): Promise<ModelosRAG | null> {
  if (cache) return cache
  if (!pendiente) {
    const ajuste = Promise.resolve(window.electronAPI.database?.getSetting?.(CLAVE_MODELO_RESPUESTA))
      .then(leerElegido)
      .catch(() => null)
    pendiente = Promise.all([window.electronAPI.agenticRAG.modelos(), ajuste])
      .then(([r, e]: [{ success: boolean; data?: ModelosRAG }, ModeloElegido | null]) => {
        elegido = e
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

/** Lo elegido en Configuración, o `null` si se deja en automático. */
export function modeloElegido(): ModeloElegido | null {
  return elegido
}

/** Guarda la elección; `null` vuelve al automático. Vale desde la siguiente pregunta. */
export async function guardarModeloElegido(nuevo: ModeloElegido | null): Promise<void> {
  await window.electronAPI.database.setSetting(CLAVE_MODELO_RESPUESTA, nuevo ? JSON.stringify(nuevo) : '', 'ai')
  elegido = nuevo
}

/**
 * El modelo y el proveedor con los que hay que responder cuando el usuario no
 * elige, o `null` si sí elige (o si todavía no se sabe y hay que respetar lo
 * que la conversación tuviera guardado).
 */
export function modeloFijadoRAG(): { model: string; provider: string; providerId?: string } | null {
  // Con el desplegable de diagnóstico a la vista, manda lo que se elija en cada conversación.
  if (cache?.selectorVisible) return null
  if (elegido) return { model: elegido.modelo, provider: elegido.proveedor, providerId: elegido.proveedorId }
  if (!cache) return null
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
