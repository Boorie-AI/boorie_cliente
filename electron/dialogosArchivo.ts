/**
 * Los diálogos de abrir y guardar, abriendo en la última carpeta usada (#307).
 *
 * Desde Electron 43, un diálogo sin `defaultPath` abre en Descargas y el sistema
 * ya no recuerda dónde estuvo el usuario la vez anterior: quien carga varias
 * redes de la misma carpeta tendría que volver a ella cada vez. La recordamos
 * aquí mientras la aplicación está abierta.
 */
import path from 'path'
import { dialog, type BrowserWindow, type OpenDialogOptions, type SaveDialogOptions } from 'electron'

let ultimaCarpeta: string | undefined

/** Un `defaultPath` que sea sólo un nombre de fichero se coloca en la última carpeta. */
export function rutaInicial(defaultPath?: string): string | undefined {
  if (!ultimaCarpeta) return defaultPath
  if (!defaultPath) return ultimaCarpeta
  return path.isAbsolute(defaultPath) ? defaultPath : path.join(ultimaCarpeta, defaultPath)
}

export function recordarCarpeta(ruta: string, esCarpeta: boolean): void {
  ultimaCarpeta = esCarpeta ? ruta : path.dirname(ruta)
}

export async function elegirParaAbrir(opciones: OpenDialogOptions, ventana?: BrowserWindow | null) {
  const conRuta = { ...opciones, defaultPath: rutaInicial(opciones.defaultPath) }
  const r = ventana ? await dialog.showOpenDialog(ventana, conRuta) : await dialog.showOpenDialog(conRuta)
  if (!r.canceled && r.filePaths[0]) recordarCarpeta(r.filePaths[0], !!opciones.properties?.includes('openDirectory'))
  return r
}

export async function elegirParaGuardar(opciones: SaveDialogOptions) {
  const r = await dialog.showSaveDialog({ ...opciones, defaultPath: rutaInicial(opciones.defaultPath) })
  if (!r.canceled && r.filePath) recordarCarpeta(r.filePath, false)
  return r
}
