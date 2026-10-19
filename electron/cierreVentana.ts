export const CANAL_SOLICITUD_CIERRE = 'window:solicitud-cierre'
export const CANAL_AVISO_CIERRE_MOSTRADO = 'window:aviso-cierre-mostrado'
export const CANAL_CONFIRMAR_CIERRE = 'window:confirmar-cierre'

// Si el renderer no acusa el aviso en este tiempo (pantalla de error, página
// a medio cargar, React roto), se cierra sin preguntar: preferimos perder la
// confirmación a dejar una ventana que no se puede cerrar.
export const ESPERA_AVISO_MS = 2000

// 'forzar': el renderer está colgado o caído. Un close() normal esperaría a
// que contestase y no llegaría nunca; hay que destruir la ventana.
export type DecisionCierre = 'permitir' | 'preguntar' | 'forzar'

interface Temporizador {
  poner: (fn: () => void, ms: number) => unknown
  quitar: (id: unknown) => void
}

const temporizadorReal: Temporizador = {
  poner: (fn, ms) => setTimeout(fn, ms),
  quitar: id => clearTimeout(id as ReturnType<typeof setTimeout>)
}

/**
 * Decide si un intento de cerrar la ventana principal sigue adelante o se
 * para para preguntar al usuario. No sabe nada de Electron: main.ts lo
 * conecta a los eventos de la ventana y al IPC.
 */
export class ControlCierre {
  private confirmado = false
  private rendererCaido = false
  private espera: unknown = null

  constructor(
    private readonly forzarSalida: () => void,
    private readonly temporizador: Temporizador = temporizadorReal
  ) {}

  alIntentarCerrar(): DecisionCierre {
    if (this.confirmado) return 'permitir'
    if (this.rendererCaido) return 'forzar'
    this.cancelarEspera()
    this.espera = this.temporizador.poner(() => {
      this.espera = null
      this.confirmado = true
      this.forzarSalida()
    }, ESPERA_AVISO_MS)
    return 'preguntar'
  }

  avisoMostrado(): void {
    this.cancelarEspera()
  }

  confirmar(): void {
    this.cancelarEspera()
    this.confirmado = true
  }

  rendererNoResponde(): void {
    this.rendererCaido = true
  }

  rendererResponde(): void {
    this.rendererCaido = false
  }

  private cancelarEspera(): void {
    if (this.espera !== null) {
      this.temporizador.quitar(this.espera)
      this.espera = null
    }
  }
}
