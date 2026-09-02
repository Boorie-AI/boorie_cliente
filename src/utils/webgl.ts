import i18n from '@/i18n'
/**
 * Si el equipo puede con las imágenes satelitales de Mapbox (#37).
 *
 * Hasta ahora esto no se preguntaba: el visor desactivaba el satélite para todo
 * el mundo, dejaba la comprobación real comentada con un TODO y luego decía
 * «modo satélite no compatible con su sistema», que era falso —no se había
 * mirado el sistema—. Se desactivó por unas caídas con aceleración por hardware,
 * y el remedio acabó siendo permanente y universal.
 */

/**
 * Cadenas que delatan renderizado por software, donde las teselas satelitales sí
 * llegan a tumbar el proceso.
 *
 * `mesa` NO está en la lista, aunque estuvo: Mesa es la pila gráfica estándar de
 * Linux y la reporta cualquier equipo con gráficos Intel o AMD, así que excluirla
 * dejaba sin satélite a todas las máquinas Linux con aceleración de verdad. Lo
 * que hay que cazar es el renderizador por software, que se llama `llvmpipe`,
 * `swrast` o `softpipe`.
 */
const RENDERIZADO_POR_SOFTWARE = [
  /llvmpipe/i,
  /swrast/i,
  /softpipe/i,
  /software rasterizer/i,
  /microsoft basic render driver/i,
]

export interface SoporteSatelite {
  disponible: boolean
  /** Por qué no, para poder decirlo sin inventar. Vacío cuando sí. */
  motivo: string
}

export function comprobarSoporteSatelite(): SoporteSatelite {
  try {
    const lienzo = document.createElement('canvas')
    const gl = (lienzo.getContext('webgl') ||
      lienzo.getContext('experimental-webgl')) as WebGLRenderingContext | null

    if (!gl) {
      return { disponible: false, motivo: 'Este equipo no tiene WebGL disponible.' }
    }

    const info = gl.getExtension('WEBGL_debug_renderer_info')
    const renderizador = String(
      (info && gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || ''
    )

    if (RENDERIZADO_POR_SOFTWARE.some(patron => patron.test(renderizador))) {
      return {
        disponible: false,
        motivo: i18n.t('messages.softwareRendering', { motor: renderizador }),
      }
    }

    return { disponible: true, motivo: '' }
  } catch {
    return { disponible: false, motivo: 'No se pudo comprobar la capacidad gráfica del equipo.' }
  }
}
