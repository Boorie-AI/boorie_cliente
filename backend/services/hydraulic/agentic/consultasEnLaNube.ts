/* eslint-disable no-console -- como el resto de ModelosRAG, a la consola del proceso principal: appLogger.info calla fuera de desarrollo, y esto es el registro de qué modelo atendió cada papel */
/**
 * Las consultas en el idioma del adjunto, escritas en la nube (#224).
 *
 * Con Ollama las escribe el modelo que va a responder, desde el renderer. Con
 * NVIDIA no puede ser allí: la clave sólo se descifra en el proceso principal y
 * no sale de él. Se usa el mismo modelo que redacta, como en local: medido con
 * tres preguntas de la batería, Ultra nombra «step drawdown test» o «well loss
 * coefficient units» en unos 2 s, y Lightning, el auxiliar, devuelve dos o
 * tres consultas genéricas («pumping test requirements»).
 *
 * Sólo sale la pregunta: el documento no va en el prompt.
 */

import { hayConsentimiento } from '../../security/consentimientoNube'
import { leerConsultas, promptDeConsultas, type Idioma } from '../consultasEnOtroIdioma'
import { llamarNvidia } from './modelosRAG'

const ESPERA_MS = 60_000

/** Lo común a la app y a la batería: sin comprobar consentimiento, que en la batería no hay. */
export async function escribirConsultasEnLaNube(pregunta: string, idioma: Idioma, modelo: string): Promise<string[]> {
  const texto = await llamarNvidia({
    modelo,
    prompt: promptDeConsultas(pregunta, idioma),
    temperatura: 0,
    maxTokens: 300,
    timeoutMs: ESPERA_MS,
    tarea: 'consultas',
    sinRazonar: true,
  })
  return leerConsultas(texto)
}

export interface PeticionDeConsultas {
  pregunta: string
  idioma: Idioma
  proveedor: string
  modelo: string
}

/**
 * Lo que pide el chat por IPC. Sólo NVIDIA, que es el proveedor en la nube del
 * RAG; para los demás no hay consultas del modelo y quedan las del glosario.
 * Sin consentimiento no sale nada, aunque la interfaz lo hubiera pedido.
 */
export async function consultasEnLaNube(p: PeticionDeConsultas): Promise<{ consultas: string[]; motivo?: string }> {
  if (p.proveedor.trim().toLowerCase() !== 'nvidia') return { consultas: [], motivo: `${p.proveedor} no escribe consultas` }
  if (!hayConsentimiento('nvidia')) return { consultas: [], motivo: 'sin consentimiento para NVIDIA' }
  try {
    const consultas = await escribirConsultasEnLaNube(p.pregunta, p.idioma, p.modelo)
    console.log(`[ModelosRAG] consultas en ${p.idioma} escritas por nvidia "${p.modelo}": ${consultas.length}`)
    return { consultas }
  } catch (error) {
    const motivo = error instanceof Error ? error.message : String(error)
    console.warn(`[ModelosRAG] no se pudieron escribir consultas en la nube; se busca con la pregunta: ${motivo}`)
    return { consultas: [], motivo }
  }
}
