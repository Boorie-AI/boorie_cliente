/**
 * Qué puede abrir y adónde puede ir la ventana principal (#264).
 *
 * La ventana tiene el preload, es decir, `window.electronAPI`, y muestra
 * contenido que no controlamos: respuestas del modelo en Markdown, documentos
 * indexados, fuentes del RAG. Un enlace ahí no puede llevar la ventana a una web
 * externa (que heredaría la API) ni abrir fuera un `file://` o el esquema de
 * otra aplicación. Es lo que pide la checklist de seguridad de Electron:
 * limitar la navegación, limitar las ventanas nuevas y no pasar contenido sin
 * filtrar a `shell.openExternal`.
 */

/** Los esquemas que se pueden abrir en el navegador o el cliente de correo del sistema. */
const ESQUEMAS_EXTERNOS = new Set(['https:', 'http:', 'mailto:'])

export function urlExternaPermitida(url: string): boolean {
  try {
    const u = new URL(url)
    return ESQUEMAS_EXTERNOS.has(u.protocol) && u.username === '' && u.password === ''
  } catch {
    return false
  }
}

/**
 * Si la URL es de la propia app: el mismo origen que el servidor de Vite en
 * desarrollo, o un fichero dentro de la carpeta del paquete.
 */
export function esDeLaApp(url: string, origenApp: string): boolean {
  try {
    const u = new URL(url)
    const app = new URL(origenApp)
    if (app.protocol === 'file:') {
      const carpeta = app.pathname.endsWith('/') ? app.pathname : app.pathname + '/'
      return u.protocol === 'file:' && (u.pathname === app.pathname || u.pathname.startsWith(carpeta))
    }
    return u.origin === app.origin
  } catch {
    return false
  }
}

interface ContenidoDeVentana {
  setWindowOpenHandler(handler: (detalles: { url: string }) => { action: 'deny' }): void
  on(evento: 'will-navigate' | 'will-redirect', escuchar: (evento: { preventDefault(): void }, url: string) => void): void
}

export function protegerNavegacion(
  contenido: ContenidoDeVentana,
  opciones: { origenApp: string; abrirFuera: (url: string) => unknown; avisar: (mensaje: string, url: string) => void }
): void {
  const { origenApp, abrirFuera, avisar } = opciones
  const abrirSiSePuede = (url: string) => {
    if (urlExternaPermitida(url)) void Promise.resolve(abrirFuera(url)).catch(() => avisar('No se pudo abrir fuera', url))
    else avisar('Enlace bloqueado: esquema no permitido', url)
  }

  contenido.setWindowOpenHandler(({ url }) => {
    abrirSiSePuede(url)
    return { action: 'deny' }
  })

  const quedarseEnLaApp = (evento: { preventDefault(): void }, url: string) => {
    if (esDeLaApp(url, origenApp)) return
    evento.preventDefault()
    abrirSiSePuede(url)
  }
  contenido.on('will-navigate', quedarseEnLaApp)
  contenido.on('will-redirect', quedarseEnLaApp)
}
