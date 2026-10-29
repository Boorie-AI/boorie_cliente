/**
 * Las claves de los proveedores en la nube, cifradas en la base (#225).
 *
 * El esquema decía «Encrypted API key» y la columna llevaba la clave tal cual:
 * cualquiera con el fichero —o con una de las copias de la base que se mueven
 * entre equipos— la tenía. Ahora se guarda con `safeStorage`, que la ata al
 * usuario del sistema y a la máquina (DPAPI, Keychain, libsecret/kwallet).
 *
 * Formatos de la columna `ai_providers.apiKey`:
 *
 *   - `enc:v1:<base64>`  cifrada con el llavero del sistema.
 *   - `plano:v1:<clave>` guardada sin cifrar porque el usuario lo pidió
 *                         expresamente en un equipo sin llavero (Linux).
 *   - cualquier otra cosa no vacía: una clave en claro de una versión anterior,
 *     que la migración del arranque convierte.
 *
 * El cifrador se inyecta: en la aplicación es `safeStorage` y en las pruebas un
 * doble, así que nada de aquí importa `electron`.
 */

export interface Cifrador {
  /** Si se puede cifrar de verdad, no sólo ofuscar con una clave fija. */
  disponible(): boolean
  cifrar(texto: string): Promise<Buffer>
  descifrar(cifrado: Buffer): Promise<string>
}

export type EstadoClave = 'ok' | 'ilegible' | 'sinCifrado' | 'sesion'

export interface ClaveLeida {
  /** La clave en claro, o `null` si no hay o no se puede leer. */
  clave: string | null
  /** `null` si no hay clave. */
  estado: EstadoClave | null
  /** Está en claro sin el prefijo `plano:v1:`: viene de una versión anterior. */
  heredada: boolean
}

export const PREFIJO_CIFRADA = 'enc:v1:'
export const PREFIJO_PLANO = 'plano:v1:'

interface SafeStorageMinimo {
  isAsyncEncryptionAvailable(): Promise<boolean>
  encryptStringAsync(texto: string): Promise<Buffer>
  decryptStringAsync(cifrado: Buffer): Promise<{ result: string }>
  getSelectedStorageBackend?: () => string
}

/**
 * `safeStorage` como cifrador, con su API asíncrona: la síncrona está obsoleta
 * desde Electron 45 y desaparece en la 46 (#307). Lo cifrado con una se
 * descifra con la otra; se comprobó con la clave guardada en una base real.
 *
 * La disponibilidad se mira una vez, al crearlo: después del `ready`, que es
 * cuando el llavero ya se puede consultar.
 *
 * En Linux sin llavero reconocido Electron elige `basic_text` y
 * `safeStorage` sigue diciendo que sí: cifra con una contraseña
 * fija escrita en el propio Chromium, que es ofuscar. Ahí se trata como si no
 * hubiera cifrado, para no decirle al usuario que su clave está protegida.
 * `unknown` es lo que devuelve antes del `ready`, cuando tampoco se puede.
 */
export async function cifradorDeSafeStorage(safeStorage: SafeStorageMinimo, plataforma: string = process.platform): Promise<Cifrador> {
  let disponible = false
  try {
    const backend = plataforma === 'linux' ? safeStorage.getSelectedStorageBackend?.() : undefined
    disponible = backend !== 'basic_text' && backend !== 'unknown' && await safeStorage.isAsyncEncryptionAvailable()
  } catch {
    disponible = false
  }
  return {
    disponible: () => disponible,
    cifrar: texto => safeStorage.encryptStringAsync(texto),
    descifrar: async cifrado => (await safeStorage.decryptStringAsync(cifrado)).result,
  }
}

/** Sin llavero: es lo que hay fuera de Electron y hasta que el main configura el suyo. */
export const SIN_CIFRADO: Cifrador = {
  disponible: () => false,
  cifrar: async () => { throw new Error('Cifrado no disponible') },
  descifrar: async () => { throw new Error('Cifrado no disponible') },
}

let cifradorActivo: Cifrador = SIN_CIFRADO

export function configurarCifrador(cifrador: Cifrador): void {
  cifradorActivo = cifrador
}

export function cifradorActual(): Cifrador {
  return cifradorActivo
}

/**
 * Las claves que sólo viven mientras la aplicación está abierta: en un equipo
 * sin llavero, la que el usuario pega y no pide guardar sin cifrar (D3). Por
 * nombre de proveedor en minúsculas, porque en la base conviven «openai» y
 * «OpenAI».
 */
const deSesion = new Map<string, string>()

export function guardarClaveDeSesion(proveedor: string, clave: string | null): void {
  const nombre = proveedor.toLowerCase()
  if (clave) deSesion.set(nombre, clave)
  else deSesion.delete(nombre)
}

export function claveDeSesion(proveedor: string): string | null {
  return deSesion.get(proveedor.toLowerCase()) ?? null
}

export function olvidarClavesDeSesion(): void {
  deSesion.clear()
}

/** Lo que va a la columna para una clave, o `null` si no se puede guardar (queda para la sesión). */
export async function valorParaGuardar(
  clave: string,
  opciones: { cifrador?: Cifrador; permitirSinCifrar?: boolean } = {}
): Promise<string | null> {
  const cifrador = opciones.cifrador ?? cifradorActivo
  if (!clave) return ''
  if (cifrador.disponible()) return PREFIJO_CIFRADA + (await cifrador.cifrar(clave)).toString('base64')
  return opciones.permitirSinCifrar ? PREFIJO_PLANO + clave : null
}

/**
 * Lee lo guardado en la columna.
 *
 * Una clave cifrada en otra máquina —una base copiada— no se puede descifrar:
 * queda `ilegible`, no se envía a ningún sitio y no se borra, para que
 * Configuración pida volver a pegarla sin perder nada si la base vuelve a su
 * equipo.
 */
export async function leerClave(valor: string | null | undefined, cifrador: Cifrador = cifradorActivo): Promise<ClaveLeida> {
  if (!valor) return { clave: null, estado: null, heredada: false }
  if (valor.startsWith(PREFIJO_CIFRADA)) {
    try {
      const clave = await cifrador.descifrar(Buffer.from(valor.slice(PREFIJO_CIFRADA.length), 'base64'))
      return clave ? { clave, estado: 'ok', heredada: false } : { clave: null, estado: 'ilegible', heredada: false }
    } catch {
      return { clave: null, estado: 'ilegible', heredada: false }
    }
  }
  if (valor.startsWith(PREFIJO_PLANO)) {
    const clave = valor.slice(PREFIJO_PLANO.length)
    return clave ? { clave, estado: 'sinCifrado', heredada: false } : { clave: null, estado: null, heredada: false }
  }
  return { clave: valor, estado: 'sinCifrado', heredada: true }
}

/** Los cuatro últimos caracteres, para que el usuario reconozca cuál tiene puesta. */
export function finDeClave(clave: string | null): string | null {
  return clave && clave.length > 8 ? clave.slice(-4) : null
}

export interface EstadoPublicoClave {
  tieneClave: boolean
  estadoClave: EstadoClave | null
  finClave: string | null
}

/**
 * Lo único de la clave que sale del proceso principal (D2). El renderer no la
 * necesita: el chat la busca aquí, y el input de Configuración es de sólo
 * escritura.
 */
export async function estadoPublico(proveedor: string, valor: string | null | undefined, cifrador: Cifrador = cifradorActivo): Promise<EstadoPublicoClave> {
  const leida = await leerClave(valor, cifrador)
  const sesion = claveDeSesion(proveedor)
  // La de la sesión es la que se acaba de pegar: manda sobre una ilegible.
  if (!leida.clave && sesion) return { tieneClave: true, estadoClave: 'sesion', finClave: finDeClave(sesion) }
  if (leida.estado === null) return { tieneClave: false, estadoClave: null, finClave: null }
  return { tieneClave: leida.clave !== null, estadoClave: leida.estado, finClave: finDeClave(leida.clave) }
}

/** La clave utilizable de un proveedor: la de la base y, si no hay, la de la sesión. */
export async function claveUtilizable(proveedor: string, valor: string | null | undefined, cifrador: Cifrador = cifradorActivo): Promise<string | null> {
  return (await leerClave(valor, cifrador)).clave ?? claveDeSesion(proveedor)
}

const oyentesDeClave = new Set<(proveedor: string) => void>()

/** Para lo que tiene la clave cargada fuera de la base, como el proceso del juez de guardrails. */
export function alCambiarClave(oyente: (proveedor: string) => void): () => void {
  oyentesDeClave.add(oyente)
  return () => oyentesDeClave.delete(oyente)
}

export function avisarCambioDeClave(proveedor: string): void {
  for (const oyente of oyentesDeClave) oyente(proveedor.toLowerCase())
}
