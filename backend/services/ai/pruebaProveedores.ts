/**
 * «Probar» para los proveedores externos que no son NVIDIA (#246).
 *
 * Una sola petición que exige la clave valida y, de paso, trae los modelos
 * que esa clave puede usar: así la lista sale de la API y no de un catálogo
 * escrito aquí que envejece. OpenRouter es la excepción: su `/models` es
 * público y responde igual con una clave mala, así que la clave se comprueba
 * contra `/key` y los modelos se piden aparte.
 *
 * No gasta crédito, así que una clave sin saldo pasa la prueba; lo dirá el
 * chat al primer envío.
 */

import { limitesDelListado, type LimitesDeLaApi } from '../hydraulic/agentic/limitesDeModelo'

export const PROVEEDORES_CON_PRUEBA = ['anthropic', 'openai', 'google', 'openrouter'] as const
export type ProveedorConPrueba = typeof PROVEEDORES_CON_PRUEBA[number]

export function tienePrueba(nombre: string): nombre is ProveedorConPrueba {
  return (PROVEEDORES_CON_PRUEBA as readonly string[]).includes(nombre.toLowerCase())
}

/** Claves i18n: el mensaje viaja hasta la interfaz y se traduce allí. */
export const MENSAJES_PRUEBA = {
  claveNoValida: 'ai.prueba.claveNoValida',
  sinCredito: 'ai.prueba.sinCredito',
  sinRed: 'ai.prueba.sinRed',
  noDisponible: 'ai.prueba.noDisponible',
  sinModelos: 'ai.prueba.sinModelos',
} as const

export type MensajePrueba = typeof MENSAJES_PRUEBA[keyof typeof MENSAJES_PRUEBA]

export interface ModeloListado {
  modelId: string
  modelName: string
  description: string
  /** Ventana y salida que da el listado, para `limitesDe` (#223). OpenAI no las da. */
  metadata?: { limites: LimitesDeLaApi }
}

function conLimites(proveedor: ProveedorConPrueba, m: Record<string, unknown>, modelo: ModeloListado): ModeloListado {
  const limites = limitesDelListado(proveedor, m)
  return limites ? { ...modelo, metadata: { limites } } : modelo
}

export interface ResultadoPrueba {
  ok: boolean
  /** Ausente cuando todo va bien. */
  mensaje?: MensajePrueba
  modelos: ModeloListado[]
}

/** Lo que dice que la clave en sí no sirve, y no que el servicio falle: desactiva el proveedor. */
export function rechazaLaClave(mensaje: string | undefined): boolean {
  return mensaje === MENSAJES_PRUEBA.claveNoValida || mensaje === 'ai.nvidia.claveNoValida'
}

class Fallo extends Error {
  constructor(public mensaje: MensajePrueba) {
    super(mensaje)
  }
}

async function pedir(url: string, cabeceras: Record<string, string>, fetchImpl: typeof fetch): Promise<any> {
  let respuesta: Response
  try {
    respuesta = await fetchImpl(url, { headers: cabeceras, signal: AbortSignal.timeout(15000) })
  } catch {
    throw new Fallo(MENSAJES_PRUEBA.sinRed)
  }
  if (respuesta.ok) return respuesta.json().catch(() => ({}))

  const cuerpo = await respuesta.json().catch(() => ({})) as any
  const texto = JSON.stringify(cuerpo).toLowerCase()
  switch (respuesta.status) {
    case 401:
    case 403:
      throw new Fallo(MENSAJES_PRUEBA.claveNoValida)
    case 400:
      // Google responde 400 INVALID_ARGUMENT, no 401, a una clave mal pegada (comprobado contra la API).
      if (texto.includes('api_key_invalid') || texto.includes('api key not valid')) throw new Fallo(MENSAJES_PRUEBA.claveNoValida)
      if (texto.includes('credit') || texto.includes('billing')) throw new Fallo(MENSAJES_PRUEBA.sinCredito)
      throw new Fallo(MENSAJES_PRUEBA.noDisponible)
    case 402:
    case 429:
      throw new Fallo(MENSAJES_PRUEBA.sinCredito)
    default:
      throw new Fallo(MENSAJES_PRUEBA.noDisponible)
  }
}

/**
 * Los de OpenAI que no conversan. Se excluye por tipo y no se incluye por
 * nombre: una lista de «los de chat» dejaba fuera cada modelo nuevo.
 */
const OPENAI_NO_CHAT = /embed|tts|whisper|dall-e|moderation|image|audio|realtime|transcri|search|davinci|babbage|computer-use|codex|sora/i

async function listar(proveedor: ProveedorConPrueba, apiKey: string, f: typeof fetch): Promise<ModeloListado[]> {
  switch (proveedor) {
    case 'anthropic': {
      const datos = await pedir('https://api.anthropic.com/v1/models?limit=1000', {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      }, f)
      return (datos.data ?? []).map((m: any) => conLimites(proveedor, m, {
        modelId: m.id,
        modelName: m.display_name || m.id,
        description: '',
      }))
    }
    case 'openai': {
      const datos = await pedir('https://api.openai.com/v1/models', { Authorization: `Bearer ${apiKey}` }, f)
      return (datos.data ?? [])
        .filter((m: any) => typeof m.id === 'string' && !OPENAI_NO_CHAT.test(m.id))
        .map((m: any) => ({ modelId: m.id, modelName: m.id, description: '' }))
    }
    case 'google': {
      // La clave en cabecera y no en la URL, que acaba en los logs.
      const datos = await pedir('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', { 'x-goog-api-key': apiKey }, f)
      return (datos.models ?? [])
        .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m: any) => {
          const id = String(m.name).split('/').pop()!
          return conLimites(proveedor, m, { modelId: id, modelName: m.displayName || id, description: m.description || '' })
        })
    }
    case 'openrouter': {
      await pedir('https://openrouter.ai/api/v1/key', { Authorization: `Bearer ${apiKey}` }, f)
      const datos = await pedir('https://openrouter.ai/api/v1/models', { Authorization: `Bearer ${apiKey}` }, f)
      return (datos.data ?? []).map((m: any) => conLimites(proveedor, m, {
        modelId: m.id,
        modelName: m.name || m.id,
        description: m.description || '',
      }))
    }
  }
}

export async function probarClaveExterna(
  proveedor: ProveedorConPrueba,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ResultadoPrueba> {
  try {
    const modelos = await listar(proveedor, apiKey, fetchImpl)
    return modelos.length > 0 ? { ok: true, modelos } : { ok: false, mensaje: MENSAJES_PRUEBA.sinModelos, modelos }
  } catch (error) {
    if (error instanceof Fallo) return { ok: false, mensaje: error.mensaje, modelos: [] }
    throw error
  }
}
