/**
 * El consentimiento para la nube, visto desde la interfaz (#225).
 *
 * La constancia la guarda y la hace cumplir el proceso principal: aquí sólo se
 * pregunta, se pide y se retira. Pedirlo abre el diálogo que `App` monta una
 * vez (`DialogoConsentimientoNube`) y espera a que la persona conteste.
 */
import { create } from 'zustand'
import { logger } from '@/utils/logger'
import { guardarModeloElegido, modeloElegido, refrescarModelosRAG } from '@/config/modelosRAG'

export interface EstadoConsentimiento {
  version: number
  consentimientos: Record<string, { version: number; fecha: string }>
}

export const esProveedorLocal = (proveedor: string) => proveedor.trim().toLowerCase() === 'ollama'

export async function leerConsentimientos(): Promise<EstadoConsentimiento> {
  try {
    const e = await window.electronAPI?.nube?.estado()
    if (e && typeof e.version === 'number') return { version: e.version, consentimientos: e.consentimientos ?? {} }
  } catch (error) {
    logger.warn('No se pudo leer el consentimiento para la nube:', error)
  }
  // Si no se puede leer, no consta: se volverá a preguntar.
  return { version: 1, consentimientos: {} }
}

export function estaConsentido(estado: EstadoConsentimiento, proveedor: string): boolean {
  if (esProveedorLocal(proveedor)) return true
  const c = estado.consentimientos[proveedor.trim().toLowerCase()]
  return !!c && c.version >= estado.version
}

interface Peticion {
  proveedor: string
  version: number
  responder: (acepta: boolean) => void
}

interface EstadoDialogo {
  peticion: Peticion | null
  abrir: (p: Peticion) => void
  cerrar: () => void
}

export const useDialogoConsentimiento = create<EstadoDialogo>(set => ({
  peticion: null,
  abrir: peticion => set({ peticion }),
  cerrar: () => set({ peticion: null }),
}))

/**
 * Si se puede mandar a ese proveedor. Si no consta, pregunta; `true` sólo si la
 * persona acepta y la aceptación queda guardada.
 */
export async function pedirConsentimiento(proveedor: string): Promise<boolean> {
  if (esProveedorLocal(proveedor)) return true
  const estado = await leerConsentimientos()
  if (estaConsentido(estado, proveedor)) return true

  const acepta = await new Promise<boolean>(responder => {
    useDialogoConsentimiento.getState().abrir({ proveedor, version: estado.version, responder })
  })
  useDialogoConsentimiento.getState().cerrar()
  if (!acepta) return false

  const r = await window.electronAPI?.nube?.aceptar(proveedor)
  if (!r?.success) {
    logger.error('No se pudo guardar el consentimiento para la nube:', r?.error)
    return false
  }
  refrescarModelosRAG()
  return true
}

/**
 * Al enviar una pregunta: si va a responder un proveedor externo sin
 * consentimiento, se pide. Si no acepta, se cumple lo que dice el diálogo:
 * la elección vuelve al automático y responde el modelo de este equipo.
 * `false` sólo si ni así se puede responder en local (el selector de
 * diagnóstico con un modelo externo en la conversación).
 */
export async function consentirAlEnviar(proveedorQueResponde: () => Promise<string>): Promise<boolean> {
  const previsto = await proveedorQueResponde()
  if (await pedirConsentimiento(previsto)) return true
  if (modeloElegido()?.proveedor.toLowerCase() === previsto.toLowerCase()) {
    await guardarModeloElegido(null)
  }
  return esProveedorLocal(await proveedorQueResponde())
}

/**
 * Retira el consentimiento. Si el modelo que redacta era de ese proveedor,
 * vuelve al automático: desde la siguiente pregunta responde el local.
 */
export async function retirarConsentimiento(proveedor: string): Promise<void> {
  await window.electronAPI?.nube?.retirar(proveedor)
  const elegido = modeloElegido()
  if (elegido && elegido.proveedor.toLowerCase() === proveedor.toLowerCase()) {
    await guardarModeloElegido(null)
  }
  refrescarModelosRAG()
}
