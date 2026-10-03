import { ipcMain } from 'electron'
import type { PrismaClient } from '@prisma/client'
import {
  aceptarConsentimiento,
  consentimientosActuales,
  esLocal,
  retirarConsentimiento,
  VERSION_CONSENTIMIENTO,
} from '../../backend/services/security/consentimientoNube'

/**
 * El consentimiento para la nube, desde la interfaz (#225). Sólo pasa por aquí:
 * es lo que mantiene al día la copia en memoria que consultan las salidas.
 */
export function registerNubeHandlers(prisma: PrismaClient) {
  ipcMain.handle('nube:estado', async () => ({
    version: VERSION_CONSENTIMIENTO,
    consentimientos: consentimientosActuales(),
  }))

  ipcMain.handle('nube:aceptar', async (_e, proveedor: string) => {
    if (typeof proveedor !== 'string' || !proveedor.trim() || esLocal(proveedor)) {
      return { success: false, error: 'Proveedor no válido' }
    }
    return { success: true, data: await aceptarConsentimiento(prisma, proveedor) }
  })

  ipcMain.handle('nube:retirar', async (_e, proveedor: string) => {
    if (typeof proveedor !== 'string' || !proveedor.trim()) return { success: false, error: 'Proveedor no válido' }
    await retirarConsentimiento(prisma, proveedor)
    return { success: true }
  })
}
