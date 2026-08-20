/**
 * Qué modelo local usan los nodos del agente.
 *
 * Los tres nodos que hablan con Ollama —reformular, graduar y generar— tenían
 * fijado `llama3.2:3b`. Esa etiqueta no existe en una instalación cualquiera: la
 * imagen que Ollama publica se llama `llama3.2:latest`, y con la etiqueta
 * equivocada la API devuelve 404. El 404 se recoge documento a documento y se
 * traduce en «no relevante», así que el agente contestaba «No se pudo generar
 * una respuesta» sin que nada dijera que el modelo no estaba. Se comprobó en una
 * máquina con nueve modelos instalados y ninguno servía, porque ninguno se
 * llamaba así.
 *
 * Se resuelve una vez y se recuerda: preguntar a Ollama en cada documento
 * multiplicaría las llamadas de una fase que ya recorre veinte fragmentos.
 */

import axios from 'axios'

/** Lo que había fijado. Sigue siendo la respuesta si no se puede preguntar. */
const POR_DEFECTO = 'llama3.2:3b'

/**
 * Orden de preferencia, del más rápido al más capaz.
 *
 * La velocidad manda porque el graduado llama al modelo una vez por fragmento
 * recuperado: medido en local, un 3B tarda ~4 s por documento y un 8B ~20 s, que
 * para veinte fragmentos son minutos de espera por pregunta. Un modelo mayor
 * acierta más, pero se elige sólo si no hay ninguno pequeño.
 */
const PREFERIDOS = [
  'llama3.2:3b',
  'llama3.2',
  'phi3',
  'mistral',
  'nemotron-mini',
  'llama3.1:8b',
  'gemma2',
]

/** No sirven para conversar: son de embeddings o de código. */
const DESCARTADOS = /embed|codellama|starcoder|nomic/i

let pendiente: Promise<string> | null = null

function urlBase(): string {
  return process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434'
}

/** Los instalados, o lista vacía si Ollama no responde. */
async function instalados(): Promise<string[]> {
  try {
    const r = await axios.get(`${urlBase()}/api/tags`, { timeout: 5000 })
    return (r.data?.models ?? []).map((m: { name: string }) => m.name).filter(Boolean)
  } catch {
    return []
  }
}

function elegir(disponibles: string[]): string {
  if (disponibles.length === 0) return POR_DEFECTO

  for (const preferido of PREFERIDOS) {
    // Exacto primero y luego por etiqueta: quien pide `llama3.2` se conforma
    // con `llama3.2:latest`, que es la misma imagen con otro nombre.
    const exacto = disponibles.find(d => d === preferido)
    if (exacto) return exacto
    const porEtiqueta = disponibles.find(d => d.split(':')[0] === preferido.split(':')[0])
    if (porEtiqueta && !preferido.includes(':')) return porEtiqueta
  }

  return disponibles.find(d => !DESCARTADOS.test(d)) ?? POR_DEFECTO
}

/**
 * El modelo con el que hablar. `OLLAMA_MODEL` manda si está puesto: quien lo
 * configura a mano sabe lo que quiere, aunque todavía no lo haya descargado.
 */
export async function modeloLocal(): Promise<string> {
  if (process.env.OLLAMA_MODEL) return process.env.OLLAMA_MODEL
  if (!pendiente) {
    pendiente = instalados()
      .then(elegir)
      .then(m => {
        console.log(`[ModeloLocal] Los nodos del agente usarán "${m}"`)
        return m
      })
  }
  return pendiente
}

/** Para las pruebas y para después de instalar un modelo nuevo. */
export function olvidarModeloLocal(): void {
  pendiente = null
}

export const _paraPruebas = { elegir, POR_DEFECTO }
