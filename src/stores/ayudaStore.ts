import { create } from 'zustand'
import { useAppStore } from './appStore'
import type { TipoAyuda } from '@/types/feedback'

interface AyudaState {
  abierta: boolean
  tipo: TipoAyuda
  /** Dónde estaba el usuario al abrir el formulario, p. ej. «chat» o «settings:about». */
  pantalla: string
  abrir: (tipo: TipoAyuda) => Promise<void>
  cerrar: () => void
}

export function pantallaActual(): string {
  const { currentView, settingsTab } = useAppStore.getState()
  return currentView === 'settings' ? `settings:${settingsTab}` : currentView
}

/** Sin persistir: el formulario no debe reaparecer abierto al reiniciar. */
export const useAyudaStore = create<AyudaState>((set) => ({
  abierta: false,
  tipo: 'bug',
  pantalla: 'unknown',
  abrir: async (tipo) => {
    const pantalla = pantallaActual()
    // La captura, antes de pintar el modal: si no, saldría el propio formulario.
    try { await window.electronAPI?.feedback?.snapshot() } catch { /* sin captura */ }
    set({ abierta: true, tipo, pantalla })
  },
  cerrar: () => {
    window.electronAPI?.feedback?.discardSnapshot().catch(() => {})
    set({ abierta: false })
  },
}))
