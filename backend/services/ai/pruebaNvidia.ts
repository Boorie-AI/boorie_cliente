/**
 * Prueba de la clave de NVIDIA (build.nvidia.com) contra la API (#222).
 *
 * `GET /v1/models` no sirve para esto: responde igual sin clave, así que una
 * clave mal pegada pasaría la prueba. Lo único que la valida es pedir algo a un
 * modelo, y de paso dice si la clave tiene acceso a él, que no está garantizado
 * aunque el modelo aparezca en el catálogo. Se pide un solo token por modelo.
 */

export const URL_NVIDIA = 'https://integrate.api.nvidia.com/v1'

/** Claves i18n: el mensaje viaja hasta la interfaz y se traduce allí. */
export const MENSAJES_NVIDIA = {
  claveNoValida: 'ai.nvidia.claveNoValida',
  sinCredito: 'ai.nvidia.sinCredito',
  sinRed: 'ai.nvidia.sinRed',
  noDisponible: 'ai.nvidia.noDisponible',
  sinAccesoATodos: 'ai.nvidia.sinAccesoATodos',
  sinPrincipal: 'ai.nvidia.sinPrincipal',
  sinAuxiliar: 'ai.nvidia.sinAuxiliar',
} as const

export type MensajeNvidia = typeof MENSAJES_NVIDIA[keyof typeof MENSAJES_NVIDIA]

type EstadoModelo = 'acceso' | 'sinAcceso'

export interface ResultadoPruebaNvidia {
  /** Si la clave sirve para al menos uno de los modelos. */
  ok: boolean
  modelos: Record<string, EstadoModelo>
  /** Lo que hay que enseñar; ausente cuando todo va bien. */
  mensaje?: MensajeNvidia
}

class FalloDeClave extends Error {
  constructor(public mensaje: MensajeNvidia) {
    super(mensaje)
  }
}

async function probarModelo(apiKey: string, modelo: string, fetchImpl: typeof fetch): Promise<EstadoModelo> {
  let respuesta: Response
  try {
    respuesta = await fetchImpl(`${URL_NVIDIA}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ model: modelo, messages: [{ role: 'user', content: 'ok' }], max_tokens: 1, stream: false }),
      // Un modelo grande en frío puede tardar en servir aunque sea un token.
      signal: AbortSignal.timeout(30000),
    })
  } catch {
    throw new FalloDeClave(MENSAJES_NVIDIA.sinRed)
  }

  if (respuesta.ok) return 'acceso'
  switch (respuesta.status) {
    case 401:
    case 403:
      throw new FalloDeClave(MENSAJES_NVIDIA.claveNoValida)
    case 402:
    case 429:
      throw new FalloDeClave(MENSAJES_NVIDIA.sinCredito)
    // Un id que no está en el catálogo da 404 antes incluso de mirar la clave
    // (comprobado contra la API), así que un 404 no dice nada de la clave.
    case 400:
    case 404:
    case 422:
      return 'sinAcceso'
    default:
      throw new FalloDeClave(MENSAJES_NVIDIA.noDisponible)
  }
}

export async function probarClaveNvidia(
  apiKey: string,
  pareja: { principal: string; auxiliar: string },
  fetchImpl: typeof fetch = fetch,
): Promise<ResultadoPruebaNvidia> {
  const ids = [...new Set([pareja.principal, pareja.auxiliar])]
  const modelos: Record<string, EstadoModelo> = {}

  try {
    // En serie: la primera respuesta ya dice si la clave vale, y una clave
    // mala no gasta una segunda petición.
    for (const id of ids) modelos[id] = await probarModelo(apiKey, id, fetchImpl)
  } catch (error) {
    if (error instanceof FalloDeClave) return { ok: false, modelos, mensaje: error.mensaje }
    throw error
  }

  const conAcceso = ids.filter(id => modelos[id] === 'acceso')
  if (conAcceso.length === 0) return { ok: false, modelos, mensaje: MENSAJES_NVIDIA.sinAccesoATodos }
  if (modelos[pareja.principal] !== 'acceso') return { ok: true, modelos, mensaje: MENSAJES_NVIDIA.sinPrincipal }
  if (modelos[pareja.auxiliar] !== 'acceso') return { ok: true, modelos, mensaje: MENSAJES_NVIDIA.sinAuxiliar }
  return { ok: true, modelos }
}
