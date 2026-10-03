/**
 * Un proveedor externo sólo está activo con una clave válida (#246).
 *
 * Había bases con OpenAI, Anthropic y NVIDIA activos y la clave vacía: el
 * arranque los creaba activos, y nada impedía encender el interruptor sin
 * clave. Además convivían dos filas por proveedor —«openai» del arranque y
 * «OpenAI» que creaba Configuración—, con el mismo id en la interfaz.
 *
 * Aquí está la regla y la corrección del arranque, que va justo después de
 * cifrar las claves (`migrarClaves`) y antes de que nada lea los proveedores.
 */

import { leerClave, type Cifrador } from './clavesProveedor'

/** El modelo que redacta, elegido en Configuración (`src/config/modelosRAG.ts`). */
export const CLAVE_MODELO_RESPUESTA = 'chat.modeloRespuesta'

export const SIN_CLAVE_VALIDADA = 'ai.activar.sinClaveValidada'

interface FilaRegla { type: string; lastTestResult?: string | null }

/**
 * Si se puede encender. Lo local no necesita clave; uno externo, una clave
 * legible y que la última prueba la haya aceptado.
 */
export function puedeActivarse(fila: FilaRegla, clave: string | null): boolean {
  if (fila.type !== 'api') return true
  return !!clave && fila.lastTestResult === 'success'
}

interface PrismaAjustes {
  appSetting: {
    findUnique(args: { where: { key: string } }): Promise<{ value: string } | null>
    update(args: { where: { key: string }; data: { value: string } }): Promise<unknown>
  }
}

/**
 * Si el modelo que redacta era de ese proveedor, vuelve al automático: un
 * proveedor apagado no puede seguir respondiendo en el chat.
 */
export async function olvidarModeloElegidoDe(prisma: PrismaAjustes, proveedor: (nombre: string) => boolean): Promise<boolean> {
  const fila = await prisma.appSetting.findUnique({ where: { key: CLAVE_MODELO_RESPUESTA } })
  if (!fila?.value) return false
  let elegido: { proveedor?: unknown } | null
  try {
    elegido = JSON.parse(fila.value)
  } catch {
    return false
  }
  const nombre = typeof elegido?.proveedor === 'string' ? elegido.proveedor.toLowerCase() : ''
  if (!nombre || nombre === 'ollama' || !proveedor(nombre)) return false
  await prisma.appSetting.update({ where: { key: CLAVE_MODELO_RESPUESTA }, data: { value: '' } })
  return true
}

interface FilaProveedor {
  id: string
  name: string
  type: string
  apiKey: string | null
  isActive: boolean
  isConnected: boolean
  lastTestResult: string | null
  lastTestMessage: string | null
  _count?: { models: number }
}

export interface PrismaCorreccion extends PrismaAjustes {
  aIProvider: {
    findMany(args: any): Promise<FilaProveedor[]>
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>
    delete(args: { where: { id: string } }): Promise<unknown>
  }
  aIModel: {
    updateMany(args: { where: { providerId: string }; data: { providerId: string } }): Promise<unknown>
  }
  $transaction<T>(fn: (tx: PrismaCorreccion) => Promise<T>): Promise<T>
  $queryRawUnsafe(sql: string): Promise<unknown>
}

export interface ResultadoCorreccion {
  /** Filas duplicadas («OpenAI» junto a «openai») unidas en la de minúsculas. */
  unidas: number
  renombradas: number
  desactivadas: string[]
  modeloElegidoOlvidado: boolean
}

interface Registro { warn(mensaje: string): void; info(mensaje: string): void }

const tieneClaveGuardada = (f: FilaProveedor) => !!f.apiKey

export async function corregirProveedores(prisma: PrismaCorreccion, cifrador: Cifrador, log: Registro = console): Promise<ResultadoCorreccion> {
  const resultado: ResultadoCorreccion = { unidas: 0, renombradas: 0, desactivadas: [], modeloElegidoOlvidado: false }
  let tocaClaves = false

  await prisma.$transaction(async tx => {
    // Antes de borrar nada: una fila duplicada puede llevar una clave dentro.
    await tx.$queryRawUnsafe('PRAGMA secure_delete=ON')
    const filas = await tx.aIProvider.findMany({ include: { _count: { select: { models: true } } } })

    const grupos = new Map<string, FilaProveedor[]>()
    for (const f of filas) grupos.set(f.name.toLowerCase(), [...(grupos.get(f.name.toLowerCase()) ?? []), f])

    const vigentes: FilaProveedor[] = []
    for (const [nombre, grupo] of grupos) {
      // Manda la de minúsculas: es la que crea el arranque y la que usan el
      // chat, el consentimiento y guardrails para buscar la clave.
      const canonica = { ...(grupo.find(f => f.name === nombre) ?? grupo[0]) }
      if (canonica.name !== nombre) {
        await tx.aIProvider.update({ where: { id: canonica.id }, data: { name: nombre } })
        canonica.name = nombre
        resultado.renombradas++
      }
      for (const otra of grupo.filter(f => f.id !== canonica.id)) {
        // De la duplicada se rescata la clave si la buena no tiene, y los
        // modelos si la buena no tiene ninguno; lo demás se va con la fila.
        if (!tieneClaveGuardada(canonica) && tieneClaveGuardada(otra)) {
          const rescate = {
            apiKey: otra.apiKey, isActive: otra.isActive, isConnected: otra.isConnected,
            lastTestResult: otra.lastTestResult, lastTestMessage: otra.lastTestMessage,
          }
          await tx.aIProvider.update({ where: { id: canonica.id }, data: rescate })
          Object.assign(canonica, rescate)
        } else if (tieneClaveGuardada(otra)) {
          log.warn(`[Proveedores] «${otra.name}» duplicaba a «${nombre}» con otra clave: se queda la de «${nombre}».`)
        }
        if (!canonica._count?.models && otra._count?.models) {
          await tx.aIModel.updateMany({ where: { providerId: otra.id }, data: { providerId: canonica.id } })
          canonica._count = { models: otra._count.models }
        }
        if (tieneClaveGuardada(otra)) tocaClaves = true
        await tx.aIProvider.delete({ where: { id: otra.id } })
        resultado.unidas++
      }
      vigentes.push(canonica)
    }

    for (const f of vigentes) {
      if (f.type !== 'api' || !f.isActive) continue
      // Sin clave o con una ilegible (base de otro equipo): apagado. La
      // ilegible no se borra; vuelve a valer si la base vuelve a su equipo.
      if (leerClave(f.apiKey, cifrador).clave) continue
      await tx.aIProvider.update({ where: { id: f.id }, data: { isActive: false, isConnected: false } })
      f.isActive = false
      resultado.desactivadas.push(f.name)
    }

    const apagados = new Set(vigentes.filter(f => f.type === 'api' && !f.isActive).map(f => f.name))
    const existentes = new Set(vigentes.map(f => f.name))
    resultado.modeloElegidoOlvidado = await olvidarModeloElegidoDe(tx, n => apagados.has(n) || !existentes.has(n))
  })

  // Una fila borrada con una clave dentro deja sus bytes en el diario.
  if (tocaClaves) {
    try {
      await prisma.$queryRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE)')
    } catch (error) {
      log.warn(`[Proveedores] No se pudo vaciar el diario: ${error instanceof Error ? error.message : error}`)
    }
  }

  if (resultado.unidas || resultado.renombradas) log.info(`[Proveedores] ${resultado.unidas} fila(s) duplicada(s) unida(s), ${resultado.renombradas} renombrada(s)`)
  if (resultado.desactivadas.length) log.info(`[Proveedores] Desactivados por no tener una clave utilizable: ${resultado.desactivadas.join(', ')}`)
  if (resultado.modeloElegidoOlvidado) log.info('[Proveedores] El modelo que redacta era de un proveedor apagado: vuelve al automático')
  return resultado
}
