/**
 * Lo que admite cada modelo y cuánto se le espera, en un solo sitio (#223).
 *
 * Antes eran constantes repartidas por el handler, la composición del adjunto y
 * la batería: 8192 tokens de salida para todos los modelos en la nube, 48 000 de
 * contexto, 90 s de silencio. A un modelo que admite 4096 de salida
 * (claude-3-haiku, gpt-4-turbo) la API le rechazaba la petición entera.
 *
 * El orden es: lo que dice la API del proveedor —guardado en la metadata del
 * modelo al probar la clave—, luego la tabla, luego el valor por defecto. Para
 * Ollama «la API» es `/api/show`, que ya lee `contextoDeOllama`.
 *
 * Sin dependencias: lo importan el proceso principal, la ruta del chat del
 * renderer y la batería.
 */

import { CONTEXTO_OLLAMA_POR_DEFECTO } from '../../contextoDeOllama'

export type FuenteDeLimites = 'api' | 'tabla' | 'defecto'

export interface LimitesDeLaApi {
  contexto?: number
  salida?: number
}

export interface LimitesDeModelo {
  /** La ventana del modelo: entrada y salida juntas. */
  contexto: number
  /** Lo que se le llega a mandar de entrada; en la nube, un tope prudente por debajo de la ventana. */
  contextoUtil: number
  /** El `max_tokens` que se pide. `null` con Ollama, que no se topa. */
  salida: number | null
  /** En streaming, lo que se espera sin recibir nada. `null` si no hay streaming. */
  inactividadMs: number | null
  totalMs: number
  /** El total de una vuelta con herramientas, que va sin streaming. */
  totalConHerramientasMs: number
  fuente: FuenteDeLimites
}

/** En la nube siempre hay tope de salida y streaming. */
export interface LimitesDeLaNube extends LimitesDeModelo {
  salida: number
  inactividadMs: number
}

/**
 * El contexto útil en la nube. Era 32 000, y con el libro de Walton dejaba
 * fuera de la pregunta por la prueba escalonada la ecuación 4.2, la tabla 2.1 o
 * el criterio de C, según cómo cayera el corte: los pasajes buenos estaban justo
 * en el límite. Con 48 000 entran todos (medido con los vectores de
 * granite-embedding de la app). No se sube sin medir: más entrada es más espera
 * y más gasto.
 */
export const CONTEXTO_UTIL_NUBE = 48000

/**
 * Un modelo en la nube que no está en la tabla ni trae límites de la API. La
 * salida es la de antes de #223; la ventana, 32 768 y no 32 000, para que el
 * recorte a la cuarta parte no la baje de 8192.
 */
const NUBE_POR_DEFECTO = { contexto: 32768, salida: 8192 }

/**
 * En streaming lo que corta es la inactividad, y el total sólo es una red por
 * si el servidor no para nunca (#232, #246). Sin streaming —las vueltas con
 * herramientas de Anthropic— el total es lo único que hay. OpenAI, OpenRouter y
 * NVIDIA usan `totalMs` también en esas vueltas, como antes de #223.
 */
const ESPERAS_NUBE = {
  inactividadMs: 90000,
  totalMs: 600000,
  totalConHerramientasMs: 180000,
}

/**
 * Un modelo local tarda lo suyo, y con herramientas cada respuesta cuesta dos
 * inferencias completas. Con 120 s, llama3.1:8b sobre Net3 se pasaba en la
 * primera vuelta; el margen ancho sólo va con herramientas, porque sin ellas el
 * límite corto es el aviso útil de que Ollama no responde.
 */
const ESPERAS_OLLAMA = {
  inactividadMs: null,
  totalMs: 120000,
  totalConHerramientasMs: 300000,
}

/**
 * Por patrón sobre el id sin el editor delante («openai/gpt-4o» → «gpt-4o») ni
 * la variante de OpenRouter («:free»). Va de lo particular a lo general: la
 * primera que case manda. Las familias (`claude-`, `gemini-`) llevan la salida
 * de antes, 8192, y la ventana más pequeña de la familia.
 */
const TABLA: Array<{ patron: RegExp; contexto: number; salida: number }> = [
  // Decidido en #223: la salida de Ultra sube a 16 384.
  { patron: /^nemotron-3-ultra-550b-a55b/, contexto: 131072, salida: 16384 },
  { patron: /^nemotron-3\.5-lightning/, contexto: 131072, salida: 8192 },
  { patron: /^claude-3-(haiku|opus|sonnet)(-|$)/, contexto: 200000, salida: 4096 },
  { patron: /^claude-3-5-sonnet/, contexto: 200000, salida: 8192 },
  { patron: /^claude-/, contexto: 200000, salida: 8192 },
  { patron: /^gpt-5/, contexto: 400000, salida: 128000 },
  { patron: /^gpt-4\.1/, contexto: 1047576, salida: 32768 },
  // La primera versión de gpt-4o daba 4096 de salida; las siguientes, 16384.
  { patron: /^gpt-4o-2024-05-13/, contexto: 128000, salida: 4096 },
  { patron: /^gpt-4o/, contexto: 128000, salida: 16384 },
  { patron: /^gpt-4-(turbo|\d{4}-preview)/, contexto: 128000, salida: 4096 },
  { patron: /^gpt-4(-\d{4})?$/, contexto: 8192, salida: 8192 },
  { patron: /^gpt-3\.5-turbo/, contexto: 16385, salida: 4096 },
  { patron: /^gemini-/, contexto: 1048576, salida: 8192 },
]

const valido = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0

function deLaTabla(modelo: string): { contexto: number; salida: number } | undefined {
  const id = modelo.slice(modelo.lastIndexOf('/') + 1).replace(/:.*$/, '').toLowerCase()
  return TABLA.find(f => f.patron.test(id))
}

export function limitesDe(proveedor: string, modelo: string, deLaApi?: LimitesDeLaApi): LimitesDeModelo {
  if (proveedor.toLowerCase() !== 'ollama') return limitesDeLaNube(modelo, deLaApi)
  const contextoApi = deLaApi?.contexto
  const contexto = valido(contextoApi) ? contextoApi : CONTEXTO_OLLAMA_POR_DEFECTO
  return {
    contexto,
    contextoUtil: contexto,
    salida: null,
    ...ESPERAS_OLLAMA,
    fuente: valido(contextoApi) ? 'api' : 'defecto',
  }
}

export function limitesDeLaNube(modelo: string, deLaApi?: LimitesDeLaApi): LimitesDeLaNube {
  const contextoApi = deLaApi?.contexto
  const salidaApi = deLaApi?.salida
  const tabla = deLaTabla(modelo)
  const base = tabla ?? NUBE_POR_DEFECTO
  const contexto = valido(contextoApi) ? contextoApi : base.contexto
  const salida = valido(salidaApi) ? salidaApi : base.salida
  return {
    contexto,
    contextoUtil: Math.min(contexto, CONTEXTO_UTIL_NUBE),
    // Que la respuesta no se coma la ventana: gpt-4 admite 8192 de salida en 8192 de ventana.
    salida: Math.min(salida, Math.floor(contexto / 4)),
    ...ESPERAS_NUBE,
    fuente: valido(contextoApi) || valido(salidaApi) ? 'api' : tabla ? 'tabla' : 'defecto',
  }
}

/**
 * Los límites que trae la API al listar modelos, en la forma que se guarda en
 * `AIModel.metadata.limites`. Anthropic: `max_input_tokens`/`max_tokens`;
 * Google: `inputTokenLimit`/`outputTokenLimit`; OpenRouter: `context_length` y
 * `top_provider.max_completion_tokens`. OpenAI no los da.
 */
export function limitesDelListado(proveedor: string, m: Record<string, unknown>): LimitesDeLaApi | undefined {
  let contexto: unknown
  let salida: unknown
  switch (proveedor.toLowerCase()) {
    case 'anthropic':
      contexto = m.max_input_tokens
      salida = m.max_tokens
      break
    case 'google':
      contexto = m.inputTokenLimit
      salida = m.outputTokenLimit
      break
    case 'openrouter':
      contexto = m.context_length
      salida = (m.top_provider as Record<string, unknown> | undefined)?.max_completion_tokens
      break
  }
  const limites: LimitesDeLaApi = {
    ...(valido(contexto) ? { contexto } : {}),
    ...(valido(salida) ? { salida } : {}),
  }
  return Object.keys(limites).length ? limites : undefined
}

/**
 * Lo guardado en `AIModel.metadata`. La metadata llega a veces codificada dos
 * o tres veces —el renderer la serializa y la base otra vez al guardar—, así
 * que se desenvuelve mientras sea texto.
 */
export function limitesGuardados(metadata: unknown): LimitesDeLaApi | undefined {
  let valor = metadata
  for (let i = 0; i < 4 && typeof valor === 'string'; i++) {
    try {
      valor = JSON.parse(valor)
    } catch {
      return undefined
    }
  }
  const limites = (valor as { limites?: Record<string, unknown> } | null)?.limites
  if (!limites || typeof limites !== 'object') return undefined
  const resultado: LimitesDeLaApi = {
    ...(valido(limites.contexto) ? { contexto: limites.contexto } : {}),
    ...(valido(limites.salida) ? { salida: limites.salida } : {}),
  }
  return Object.keys(resultado).length ? resultado : undefined
}

/**
 * La metadata que se escribe al guardar un modelo: una sola vez serializada, y
 * sin perder los límites de la API si quien guarda no los trae (marcar un
 * modelo, añadir uno a mano desde la configuración).
 */
export function metadataParaGuardar(nueva: unknown, anterior: string | null | undefined): string | null {
  let valor = nueva
  for (let i = 0; i < 4 && typeof valor === 'string'; i++) {
    try {
      valor = JSON.parse(valor)
    } catch {
      break
    }
  }
  const limites = limitesGuardados(anterior)
  if (valor === null || valor === undefined || valor === '') {
    return limites ? JSON.stringify({ limites }) : null
  }
  if (typeof valor !== 'object' || Array.isArray(valor)) return JSON.stringify(valor)
  const objeto = valor as Record<string, unknown>
  return JSON.stringify(limites && !objeto.limites ? { ...objeto, limites } : objeto)
}
