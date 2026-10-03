/**
 * Al arrancar, las claves en claro de versiones anteriores pasan a cifradas y
 * la de guardrails se une a la del proveedor NVIDIA (#225, D4).
 *
 * Es idempotente: lo ya cifrado no se toca y una segunda pasada no escribe
 * nada. Lo que no sabe cifrar —un equipo sin llavero— lo deja como estaba, y se
 * cifra en el primer arranque en que haya llavero; tampoco toca una clave
 * ilegible, que puede ser de otro equipo.
 */

import { PREFIJO_CIFRADA, leerClave, valorParaGuardar, type Cifrador } from './clavesProveedor'

export interface ResultadoMigracion {
  cifradas: number
  /** La de guardrails pasó al proveedor NVIDIA. */
  guardrailsMovida: boolean
  /** La de guardrails se tiró porque el proveedor ya tenía una. */
  guardrailsDescartada: boolean
}

interface FilaProveedor { id: string; name: string; apiKey: string | null }

export interface PrismaMigracion {
  aIProvider: {
    findMany(args?: { select?: Record<string, boolean> }): Promise<FilaProveedor[]>
    update(args: { where: { id: string }; data: { apiKey: string } }): Promise<unknown>
  }
  appSetting: {
    findUnique(args: { where: { key: string } }): Promise<{ value: string } | null>
    update(args: { where: { key: string }; data: { value: string } }): Promise<unknown>
  }
  $transaction<T>(fn: (tx: PrismaMigracion) => Promise<T>): Promise<T>
  $queryRawUnsafe(sql: string): Promise<unknown>
}

interface Registro { warn(mensaje: string): void; info(mensaje: string): void }

const CLAVE_GUARDRAILS = 'guardrails_settings'

export async function migrarClaves(prisma: PrismaMigracion, cifrador: Cifrador, log: Registro = console): Promise<ResultadoMigracion> {
  const resultado: ResultadoMigracion = { cifradas: 0, guardrailsMovida: false, guardrailsDescartada: false }

  const ajusteGuardrails = await prisma.appSetting.findUnique({ where: { key: CLAVE_GUARDRAILS } })
  let ajustes: Record<string, unknown> | null = null
  try {
    ajustes = ajusteGuardrails ? JSON.parse(ajusteGuardrails.value) : null
  } catch {
    ajustes = null
  }
  const claveGuardrails = typeof ajustes?.nvidiaApiKey === 'string' ? ajustes.nvidiaApiKey.trim() : ''
  const hayCampoGuardrails = !!ajustes && 'nvidiaApiKey' in ajustes

  const filas = await prisma.aIProvider.findMany({ select: { id: true, name: true, apiKey: true } })
  const cambios: Array<{ id: string; apiKey: string }> = []

  for (const fila of filas) {
    if (!fila.apiKey || fila.apiKey.startsWith(PREFIJO_CIFRADA)) continue
    if (!cifrador.disponible()) continue
    const { clave } = leerClave(fila.apiKey, cifrador)
    if (!clave) continue
    cambios.push({ id: fila.id, apiKey: valorParaGuardar(clave, { cifrador })! })
  }

  if (claveGuardrails) {
    const nvidia = filas.find(f => f.name.toLowerCase() === 'nvidia')
    const yaTiene = nvidia && (leerClave(nvidia.apiKey, cifrador).estado !== null)
    if (nvidia && !yaTiene) {
      const valor = valorParaGuardar(claveGuardrails, { cifrador })
      if (valor) {
        cambios.push({ id: nvidia.id, apiKey: valor })
        resultado.guardrailsMovida = true
      }
    } else if (nvidia) {
      resultado.guardrailsDescartada = true
      log.warn('[Claves] Guardrails tenía su propia clave de NVIDIA y el proveedor ya tiene una: se usa la del proveedor y la de guardrails se descarta.')
    }
  }

  // Sin llavero, la de guardrails se queda donde está hasta que se pueda cifrar.
  const quitarDeGuardrails = hayCampoGuardrails && (!claveGuardrails || resultado.guardrailsMovida || resultado.guardrailsDescartada)

  if (cambios.length === 0 && !quitarDeGuardrails) return resultado

  await prisma.$transaction(async tx => {
    await tx.$queryRawUnsafe('PRAGMA secure_delete=ON')
    for (const c of cambios) await tx.aIProvider.update({ where: { id: c.id }, data: { apiKey: c.apiKey } })
    if (quitarDeGuardrails && ajustes) {
      const resto = { ...ajustes }
      delete resto.nvidiaApiKey
      await tx.appSetting.update({ where: { key: CLAVE_GUARDRAILS }, data: { value: JSON.stringify(resto) } })
    }
  })
  try {
    await prisma.$queryRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE)')
  } catch (error) {
    log.warn(`[Claves] No se pudo vaciar el diario tras cifrar: ${error instanceof Error ? error.message : error}`)
  }

  resultado.cifradas = cambios.length - (resultado.guardrailsMovida ? 1 : 0)
  if (resultado.cifradas) log.info(`[Claves] ${resultado.cifradas} clave(s) en claro cifradas con el llavero del sistema`)
  if (resultado.guardrailsMovida) log.info('[Claves] La clave de NVIDIA de guardrails pasa al proveedor NVIDIA')
  return resultado
}
