/**
 * Traduccion entre las herramientas de Boorie y el formato de cable de cada
 * proveedor (#34).
 *
 * Son dos dialectos y medio, no cinco: Anthropic tiene el suyo; OpenAI,
 * OpenRouter y NVIDIA comparten el de OpenAI porque los tres exponen
 * /chat/completions; y Ollama habla ese mismo con dos desvios. Se aisla aqui
 * para que el bucle de `chat.handler` no se llene de ramas por proveedor y para
 * poder contrastar la traduccion en tests, sin red.
 */

import type { DefinicionHerramienta } from '../hydraulic/agentTools'

/** Una peticion de herramienta ya normalizada, venga del proveedor que venga. */
export interface LlamadaHerramienta {
  /** Identificador que el proveedor asigna, y que hay que devolverle tal cual. */
  id: string
  nombre: string
  argumentos: Record<string, unknown>
}

/**
 * Proveedores cuyo dialecto de herramientas esta implementado. Es la unica
 * fuente de verdad: la usa el despacho de `chat.handler` para decidir si
 * cargar la red, y `network-repo:context` para no prometer en el prompt una
 * consulta que ese proveedor no puede hacer.
 *
 * Google falta a proposito: usa functionDeclarations, otro dialecto.
 */
const PROVEEDORES_CON_HERRAMIENTAS = new Set(['anthropic', 'openai', 'openrouter', 'nvidia', 'ollama'])

export function proveedorSoportaHerramientas(proveedor?: string | null): boolean {
  return !!proveedor && PROVEEDORES_CON_HERRAMIENTAS.has(proveedor.trim().toLowerCase())
}

export function herramientasAnthropic(defs: DefinicionHerramienta[]) {
  return defs.map(d => ({
    name: d.nombre,
    description: d.descripcion,
    input_schema: d.esquema,
  }))
}

export function herramientasOpenAI(defs: DefinicionHerramienta[]) {
  return defs.map(d => ({
    type: 'function' as const,
    function: {
      name: d.nombre,
      description: d.descripcion,
      parameters: d.esquema,
    },
  }))
}

/**
 * Algunos modelos vuelven a envolver los argumentos dentro de otro sobre con la
 * forma de la llamada entera. nemotron-mini emite esto en vez de {"id":"121"}:
 *
 *   {"type": "consultar_elemento", "arguments": {"id": "121"}}
 *
 * Sin deshacerlo, la herramienta recibe un objeto sin `id` y responde que falta
 * el argumento, con el modelo convencido de que lo mando. Se pela el sobre solo
 * cuando es inequivoco: una clave `arguments` que contiene un objeto, y nada
 * mas de sustancia al lado.
 */
function desenvolver(args: Record<string, unknown>): Record<string, unknown> {
  const dentro = args.arguments
  if (!dentro || typeof dentro !== 'object' || Array.isArray(dentro)) return args
  const alLado = Object.keys(args).filter(k => k !== 'arguments' && k !== 'type' && k !== 'name')
  return alLado.length === 0 ? (dentro as Record<string, unknown>) : args
}

/**
 * Los argumentos llegan como objeto en Anthropic y como cadena JSON en OpenAI.
 * Un modelo puede emitir JSON invalido, y eso no debe tumbar la conversacion:
 * se devuelve un objeto vacio y la herramienta respondera que falta el
 * argumento, que el modelo sabe corregir en la vuelta siguiente.
 */
function parsearArgumentos(bruto: unknown): Record<string, unknown> {
  if (bruto && typeof bruto === 'object') return desenvolver(bruto as Record<string, unknown>)
  if (typeof bruto === 'string' && bruto.trim()) {
    try {
      const parsed = JSON.parse(bruto)
      if (parsed && typeof parsed === 'object') return desenvolver(parsed as Record<string, unknown>)
    } catch {
      return {}
    }
  }
  return {}
}

export function llamadasDesdeAnthropic(data: any): LlamadaHerramienta[] {
  if (!Array.isArray(data?.content)) return []
  return data.content
    .filter((b: any) => b?.type === 'tool_use')
    .map((b: any) => ({
      id: String(b.id),
      nombre: String(b.name),
      argumentos: parsearArgumentos(b.input),
    }))
}

export function llamadasDesdeOpenAI(data: any): LlamadaHerramienta[] {
  const llamadas = data?.choices?.[0]?.message?.tool_calls
  if (!Array.isArray(llamadas)) return []
  return llamadas.map((c: any) => ({
    id: String(c.id),
    nombre: String(c.function?.name ?? ''),
    argumentos: parsearArgumentos(c.function?.arguments),
  }))
}

/**
 * Ollama es casi el dialecto de OpenAI, con dos diferencias que hay que tratar:
 * la respuesta cuelga de `message` y no de `choices[0].message`, y los
 * argumentos llegan ya como objeto en vez de como cadena JSON. Ademas no toda
 * version rellena el `id` de la llamada, asi que se fabrica uno estable por
 * posicion: si no, el tool_call_id de vuelta iria vacio.
 */
export function llamadasDesdeOllama(data: any): LlamadaHerramienta[] {
  const llamadas = data?.message?.tool_calls
  if (!Array.isArray(llamadas)) return []
  return llamadas.map((c: any, i: number) => ({
    id: String(c.id || `call_${i}`),
    nombre: String(c.function?.name ?? ''),
    argumentos: parsearArgumentos(c.function?.arguments),
  }))
}

/**
 * Anthropic quiere todos los resultados en un unico mensaje de usuario, con un
 * bloque tool_result por llamada; mandar uno por mensaje da 400. OpenAI quiere
 * lo contrario: un mensaje role:'tool' por cada tool_call.
 */
export function mensajeResultadosAnthropic(
  resultados: Array<{ llamada: LlamadaHerramienta; salida: unknown }>
) {
  return {
    role: 'user' as const,
    content: resultados.map(({ llamada, salida }) => ({
      type: 'tool_result' as const,
      tool_use_id: llamada.id,
      content: JSON.stringify(salida),
    })),
  }
}

export function mensajesResultadosOpenAI(
  resultados: Array<{ llamada: LlamadaHerramienta; salida: unknown }>
) {
  return resultados.map(({ llamada, salida }) => ({
    role: 'tool' as const,
    tool_call_id: llamada.id,
    content: JSON.stringify(salida),
  }))
}

/** Texto de la respuesta, ignorando los bloques que no son texto. */
export function textoDesdeAnthropic(data: any): string {
  if (!Array.isArray(data?.content)) return ''
  return data.content
    .filter((b: any) => b?.type === 'text')
    .map((b: any) => b.text)
    .join('')
}

/**
 * Un 400 por herramientas no soportadas no se puede prever con una lista de
 * modelos: OpenRouter y NVIDIA sirven cientos, y la lista envejeceria mal. Se
 * detecta el fallo y se reintenta sin herramientas, que es peor respuesta pero
 * no un error en la cara del usuario.
 */
export function esErrorDeHerramientas(status: number, mensaje: string): boolean {
  if (status !== 400 && status !== 404 && status !== 422) return false
  const m = mensaje.toLowerCase()
  return m.includes('tool') || m.includes('function')
}
