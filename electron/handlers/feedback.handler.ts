import { ipcMain, shell, clipboard, app, type BrowserWindow, type NativeImage, type WebContents } from 'electron'
import { execFile } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { anonimizar } from '../../backend/utils/anonimizar'
import { registrar, ultimas } from '../../backend/services/feedback/registroReciente'
import {
  ajustarALaUrl,
  construirReporte,
  esUrlPermitida,
  normalizarFormulario,
  type Entorno,
  type Formulario,
} from '../../backend/services/feedback/plantilla'
import { findPythonPath, getManagedVenvDir } from '../../backend/services/hydraulic/pythonDetector'

/**
 * «Ayuda y comentarios» (#217). Todo el reporte se construye aquí y no en el
 * renderer: así la anonimización no depende de la interfaz y, cuando exista un
 * servidor de feedback, solo cambia el transporte de este fichero.
 */

const LINEAS_REGISTRO = 30
const LINEAS_SETUP = 15
const BYTES_COLA = 16 * 1024

interface OpcionesReporte {
  incluirTecnica: boolean
  pantalla: string
}

let versionPython: { ruta: string; version: string | null } | null = null
let captura: NativeImage | null = null

function nombreSO(): string {
  const nombres: Record<string, string> = { win32: 'Windows', darwin: 'macOS', linux: 'Linux' }
  return `${nombres[process.platform] ?? process.platform} ${os.release()}`
}

/** Asíncrono a propósito: `getPythonStatus` usa `execSync` y congelaría la ventana hasta 5 s. */
function leerVersionPython(ruta: string): Promise<string | null> {
  if (versionPython?.ruta === ruta) return Promise.resolve(versionPython.version)
  return new Promise(resolve => {
    execFile(ruta, ['--version'], { timeout: 5000, windowsHide: true }, (error, stdout, stderr) => {
      // Python 2 y algunos lanzadores escriben la versión en stderr.
      const version = error ? null : (`${stdout}`.trim() || `${stderr}`.trim() || null)
      versionPython = { ruta, version }
      resolve(version)
    })
  })
}

function colaDeFichero(fichero: string, lineas: number): string[] {
  try {
    const { size } = fs.statSync(fichero)
    const desde = Math.max(0, size - BYTES_COLA)
    const fd = fs.openSync(fichero, 'r')
    try {
      const buf = Buffer.alloc(size - desde)
      fs.readSync(fd, buf, 0, buf.length, desde)
      return buf.toString('utf-8').split(/\r?\n/).filter(l => l.trim()).slice(-lineas)
    } finally {
      fs.closeSync(fd)
    }
  } catch {
    return []
  }
}

function pantallaValida(p: unknown): string {
  return typeof p === 'string' && /^[a-z0-9:_-]{1,40}$/i.test(p) ? p : 'unknown'
}

function opcionesValidas(raw: unknown): OpcionesReporte {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return { incluirTecnica: o.incluirTecnica === true, pantalla: pantallaValida(o.pantalla) }
}

export async function recogerEntorno(userDataDir: string, pantalla: string): Promise<Entorno> {
  const home = os.homedir()
  let ruta: string | null = null
  try { ruta = findPythonPath() } catch { /* sin Python */ }
  const python = ruta ? await leerVersionPython(ruta) : null
  const venv = getManagedVenvDir()

  const registro = [
    ...ultimas(LINEAS_REGISTRO).map(e => `${e.hora} [${e.origen}] [${e.nivel}] ${e.texto}`),
    ...colaDeFichero(path.join(userDataDir, 'logs', 'setup-python.log'), LINEAS_SETUP).map(l => `[setup-python] ${l}`),
  ].map(l => anonimizar(l, { home }))

  return {
    version: app.getVersion(),
    so: nombreSO(),
    arquitectura: process.arch,
    python: python ? anonimizar(python, { home }) : null,
    venvGestionado: !!(ruta && venv && path.resolve(ruta).startsWith(path.resolve(venv))),
    pantalla,
    registro,
  }
}

function anonimizarFormulario(form: Formulario): Formulario {
  const home = os.homedir()
  const a = (s: string) => anonimizar(s, { home })
  return form.tipo === 'bug'
    ? { ...form, haciendo: a(form.haciendo), paso: a(form.paso), esperabas: a(form.esperabas) }
    : { ...form, necesitas: a(form.necesitas), paraQue: a(form.paraQue), comoHoy: a(form.comoHoy) }
}

async function prepararReporte(userDataDir: string, rawForm: unknown, rawOpciones: unknown) {
  const form = normalizarFormulario(rawForm)
  if (!form) return null
  const opciones = opcionesValidas(rawOpciones)
  const entorno = opciones.incluirTecnica ? await recogerEntorno(userDataDir, opciones.pantalla) : null
  const limpio = anonimizarFormulario(form)
  return { form: limpio, entorno, completo: construirReporte(limpio, entorno), ajustado: ajustarALaUrl(limpio, entorno) }
}

const textoParaCopiar = (r: { titulo: string; cuerpo: string }) => `${r.titulo}\n\n${r.cuerpo}`

/** Lo que el renderer escribe en consola como aviso o error, al búfer del reporte. */
export function escucharConsolaDelRenderer(wc: WebContents): void {
  wc.on('console-message', (evento) => {
    if (evento.level === 'warning') registrar('renderer', 'warn', evento.message)
    else if (evento.level === 'error') registrar('renderer', 'error', evento.message)
  })
}

export function registerFeedbackHandlers(getMainWindow: () => BrowserWindow | null, userDataDir: string): void {
  ipcMain.handle('feedback:get-environment', async (_e, pantalla?: unknown) => {
    try {
      return { success: true, entorno: await recogerEntorno(userDataDir, pantallaValida(pantalla)) }
    } catch {
      return { success: false }
    }
  })

  ipcMain.handle('feedback:preview', async (_e, form: unknown, opciones: unknown) => {
    const r = await prepararReporte(userDataDir, form, opciones)
    if (!r) return { success: false, error: 'invalid-form' }
    return { success: true, titulo: r.completo.titulo, cuerpo: r.completo.cuerpo, recortado: r.ajustado.recortado }
  })

  ipcMain.handle('feedback:open-github', async (_e, form: unknown, opciones: unknown) => {
    const r = await prepararReporte(userDataDir, form, opciones)
    if (!r) return { success: false, error: 'invalid-form' }
    if (!esUrlPermitida(r.ajustado.url)) return { success: false, error: 'url-not-allowed' }
    // Lo que no cabe en el enlace no se pierde: queda entero en el portapapeles.
    if (r.ajustado.recortado) clipboard.writeText(textoParaCopiar(r.completo))
    try {
      await shell.openExternal(r.ajustado.url)
      return { success: true, recortado: r.ajustado.recortado }
    } catch {
      return { success: false, error: 'open-failed' }
    }
  })

  ipcMain.handle('feedback:copy', async (_e, form: unknown, opciones: unknown) => {
    const r = await prepararReporte(userDataDir, form, opciones)
    if (!r) return { success: false, error: 'invalid-form' }
    clipboard.writeText(textoParaCopiar(r.completo))
    return { success: true }
  })

  // La captura se toma antes de abrir el modal: si no, saldría el propio formulario.
  ipcMain.handle('feedback:snapshot', async () => {
    try {
      const win = getMainWindow()
      captura = win ? await win.webContents.capturePage() : null
      return { success: !!captura }
    } catch {
      captura = null
      return { success: false }
    }
  })

  ipcMain.handle('feedback:copy-snapshot', async () => {
    if (!captura || captura.isEmpty()) return { success: false, error: 'no-snapshot' }
    clipboard.writeImage(captura)
    return { success: true }
  })

  ipcMain.handle('feedback:discard-snapshot', async () => {
    captura = null
    return { success: true }
  })
}
