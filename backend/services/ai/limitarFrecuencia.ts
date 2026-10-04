/**
 * El texto de una respuesta mientras llega, como mucho una vez cada
 * `intervaloMs` (#223). Un modelo rápido manda decenas de trozos por segundo y
 * cada uno es un mensaje IPC y un repintado del markdown entero; con 10 por
 * segundo se lee igual de fluido.
 *
 * Siempre se manda el último texto recibido: los intermedios que caen dentro
 * del intervalo se saltan, no se encolan.
 */
export interface Limitador {
  /** Lo que hay ahora; sale enseguida o al acabar el intervalo. */
  emitir: (texto: string) => void
  /** Manda ya lo pendiente: al terminar, para que lo último no se quede esperando. */
  vaciar: () => void
  /** Descarta lo pendiente sin mandar nada más. */
  cancelar: () => void
}

export function limitarFrecuencia(enviar: (texto: string) => void, intervaloMs = 100): Limitador {
  let ultimoEnvio = -Infinity
  let ultimoTexto = ''
  let pendiente: string | null = null
  let temporizador: ReturnType<typeof setTimeout> | undefined

  const parar = () => {
    clearTimeout(temporizador)
    temporizador = undefined
  }
  const soltar = () => {
    parar()
    if (pendiente === null) return
    const texto = pendiente
    pendiente = null
    // Lo mismo dos veces no se manda, y un '' antes de haber mandado nada tampoco.
    if (texto === ultimoTexto) return
    ultimoEnvio = Date.now()
    ultimoTexto = texto
    enviar(texto)
  }

  return {
    emitir(texto) {
      pendiente = texto
      if (temporizador) return
      const espera = ultimoEnvio + intervaloMs - Date.now()
      if (espera <= 0) soltar()
      else temporizador = setTimeout(soltar, espera)
    },
    vaciar: soltar,
    cancelar() {
      parar()
      pendiente = null
    },
  }
}
