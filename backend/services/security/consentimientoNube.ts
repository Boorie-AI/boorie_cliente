/**
 * El consentimiento para mandar datos a un proveedor en la nube (#225).
 *
 * Uno por proveedor y por versión del texto, para toda la instalación, con la
 * fecha en que se dio: es la constancia que pide el issue y que un simple aviso
 * no deja. Se guarda en `app_settings`, como el descargo (#108).
 *
 * Lo consulta el proceso principal en cada salida a la nube —el chat, la
 * revisión contra el documento, el juez de guardrails, los embeddings de OpenAI
 * y el RAG con `BOORIE_RAG_BACKEND=nvidia`—, no sólo la interfaz. Varias de esas
 * salidas no pueden esperar a leer la base (deciden de forma síncrona qué motor
 * usar), así que se lee al arrancar y se mantiene en memoria; sólo cambia por
 * los canales de este módulo.
 */

/**
 * Versión del texto que se acepta (`nube.consentimiento.*` en los locales).
 * Subirla vuelve a pedir el consentimiento a todos; una errata no lo merece.
 */
export const VERSION_CONSENTIMIENTO = 1

export const CLAVE_CONSENTIMIENTO = 'nube.consentimiento'

export interface Consentimiento {
  version: number
  /** ISO 8601. */
  fecha: string
}

export type Consentimientos = Record<string, Consentimiento>

interface PrismaAjustes {
  appSetting: {
    findUnique(args: { where: { key: string } }): Promise<{ value: string } | null>
    upsert(args: {
      where: { key: string }
      create: { key: string; value: string; category?: string }
      update: { value: string }
    }): Promise<unknown>
  }
}

/** Los proveedores que no salen del equipo. */
export function esLocal(proveedor: string): boolean {
  return proveedor.trim().toLowerCase() === 'ollama'
}

const nombre = (proveedor: string) => proveedor.trim().toLowerCase()

let enMemoria: Consentimientos = {}
const oyentes = new Set<() => void>()

function interpretar(valor: string | null | undefined): Consentimientos {
  if (!valor) return {}
  try {
    const dato = JSON.parse(valor)
    if (!dato || typeof dato !== 'object') return {}
    const limpio: Consentimientos = {}
    for (const [p, c] of Object.entries(dato as Record<string, unknown>)) {
      const v = c as Partial<Consentimiento>
      if (typeof v?.version === 'number' && typeof v?.fecha === 'string') limpio[nombre(p)] = { version: v.version, fecha: v.fecha }
    }
    return limpio
  } catch {
    // Ilegible es «no consta»: mejor volver a preguntar que dar por buena una constancia rota.
    return {}
  }
}

export async function cargarConsentimientos(prisma: PrismaAjustes): Promise<Consentimientos> {
  const fila = await prisma.appSetting.findUnique({ where: { key: CLAVE_CONSENTIMIENTO } })
  enMemoria = interpretar(fila?.value)
  return enMemoria
}

/** Si se puede mandar a ese proveedor. Los locales no necesitan permiso. */
export function hayConsentimiento(proveedor: string): boolean {
  if (esLocal(proveedor)) return true
  const c = enMemoria[nombre(proveedor)]
  return !!c && c.version >= VERSION_CONSENTIMIENTO
}

export function consentimientosActuales(): Consentimientos {
  return { ...enMemoria }
}

async function guardar(prisma: PrismaAjustes, siguiente: Consentimientos): Promise<void> {
  const value = JSON.stringify(siguiente)
  await prisma.appSetting.upsert({
    where: { key: CLAVE_CONSENTIMIENTO },
    create: { key: CLAVE_CONSENTIMIENTO, value, category: 'privacidad' },
    update: { value },
  })
  enMemoria = siguiente
  for (const oyente of oyentes) oyente()
}

export async function aceptarConsentimiento(prisma: PrismaAjustes, proveedor: string, ahora: Date = new Date()): Promise<Consentimiento> {
  const c: Consentimiento = { version: VERSION_CONSENTIMIENTO, fecha: ahora.toISOString() }
  await guardar(prisma, { ...enMemoria, [nombre(proveedor)]: c })
  return c
}

export async function retirarConsentimiento(prisma: PrismaAjustes, proveedor: string): Promise<void> {
  const siguiente = { ...enMemoria }
  delete siguiente[nombre(proveedor)]
  await guardar(prisma, siguiente)
}

/** Para lo que tiene que reiniciarse al cambiar (el juez de guardrails, el motor del RAG). */
export function alCambiarConsentimiento(oyente: () => void): () => void {
  oyentes.add(oyente)
  return () => oyentes.delete(oyente)
}

export const SIN_CONSENTIMIENTO = 'SIN_CONSENTIMIENTO'
