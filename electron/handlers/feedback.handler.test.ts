import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import type { BrowserWindow, WebContents } from 'electron'

interface Respuesta {
  success?: boolean
  error?: string
  cuerpo?: string
  recortado?: boolean
  entorno?: { python: string | null; venvGestionado: boolean; version: string }
}
type Handler = (evento: unknown, ...args: unknown[]) => Promise<Respuesta>
type Callback = (error: Error | null, stdout: string, stderr: string) => void
const handlers: Record<string, Handler> = {}
const openExternal = vi.fn(async (_url: string) => {})
const writeText = vi.fn()
const writeImage = vi.fn()
const execFile = vi.fn()

vi.mock('electron', () => ({
  ipcMain: { handle: (canal: string, fn: Handler) => { handlers[canal] = fn } },
  shell: { openExternal: (url: string) => openExternal(url) },
  clipboard: { writeText: (t: string) => writeText(t), writeImage: (i: unknown) => writeImage(i) },
  app: { getVersion: () => '1.44.0' },
}))

vi.mock('child_process', async (importOriginal) => {
  const real = await importOriginal<typeof import('child_process')>()
  const falso = { ...real, execFile: (...args: unknown[]) => execFile(...args) }
  return { ...falso, default: falso }
})

let rutaPython = '/home/maria/.config/boorie/venv-wntr/bin/python'
vi.mock('../../backend/services/hydraulic/pythonDetector', () => ({
  findPythonPath: () => rutaPython,
  getManagedVenvDir: () => '/home/maria/.config/boorie/venv-wntr',
}))

import { registerFeedbackHandlers, escucharConsolaDelRenderer } from './feedback.handler'
import { registrar, vaciarRegistro } from '../../backend/services/feedback/registroReciente'

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'feedback-'))
fs.mkdirSync(path.join(userData, 'logs'))
fs.writeFileSync(
  path.join(userData, 'logs', 'setup-python.log'),
  Array.from({ length: 40 }, (_, i) => `setup linea ${i} en /home/maria/x`).join('\n'),
)

const imagen = { isEmpty: () => false }
const ventana = { webContents: { capturePage: vi.fn(async () => imagen) } }
registerFeedbackHandlers(() => ventana as unknown as BrowserWindow, userData)

const BUG = {
  tipo: 'bug',
  haciendo: 'Abría C:\\Users\\maria\\Documents\\red.inp',
  paso: 'Se cerró la app; avisad a maria@cliente.es',
  esperabas: 'Que cargara la red',
  frecuencia: 'siempre',
}

const invocar = (canal: string, ...args: unknown[]) => handlers[canal]({}, ...args)

beforeEach(() => {
  vi.clearAllMocks()
  vaciarRegistro()
  execFile.mockImplementation((_r: string, _a: string[], _o: unknown, cb: Callback) => cb(null, 'Python 3.12.3\n', ''))
})

describe('feedback:open-github (R25, R19)', () => {
  it('abre solo issues/new del repositorio, con el reporte en la URL', async () => {
    const r = await invocar('feedback:open-github', BUG, { incluirTecnica: false, pantalla: 'chat' })
    expect(r).toEqual({ success: true, recortado: false })
    expect(openExternal).toHaveBeenCalledTimes(1)
    const url = new URL(openExternal.mock.calls[0][0])
    expect(url.origin + url.pathname).toBe('https://github.com/Boorie-AI/boorie_cliente/issues/new')
    expect(url.searchParams.get('body')).toContain('Se cerró la app')
  })

  it('anonimiza también el texto libre antes de que salga (R12)', async () => {
    await invocar('feedback:open-github', BUG, { incluirTecnica: false, pantalla: 'chat' })
    const body = new URL(openExternal.mock.calls[0][0]).searchParams.get('body') as string
    expect(body).not.toContain('maria')
    expect(body).toContain('C:\\Users\\<usuario>\\Documents\\red.inp')
    expect(body).toContain('<email>')
  })

  it('rechaza un formulario inválido sin abrir nada', async () => {
    const r = await invocar('feedback:open-github', { tipo: 'bug' }, {})
    expect(r).toEqual({ success: false, error: 'invalid-form' })
    expect(openExternal).not.toHaveBeenCalled()
  })

  it('si el enlace va recortado, deja el informe entero en el portapapeles', async () => {
    for (let i = 0; i < 50; i++) registrar('main', 'error', `fallo ${i} ${'z'.repeat(400)}`)
    const r = await invocar('feedback:open-github', BUG, { incluirTecnica: true, pantalla: 'chat' })
    expect(r.recortado).toBe(true)
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText.mock.calls[0][0]).toContain('fallo 20 ')
  })

  it('informa del fallo al abrir el navegador sin lanzar', async () => {
    openExternal.mockRejectedValueOnce(new Error('sin navegador'))
    expect(await invocar('feedback:open-github', BUG, { incluirTecnica: false })).toEqual({ success: false, error: 'open-failed' })
  })
})

describe('consentimiento (R10, R11, D4)', () => {
  it('sin la casilla no se recoge ni se envía nada técnico', async () => {
    registrar('main', 'error', 'error secreto')
    const r = await invocar('feedback:preview', BUG, { incluirTecnica: false, pantalla: 'chat' })
    expect(execFile).not.toHaveBeenCalled()
    for (const dato of ['1.44.0', 'Python', 'error secreto', 'setup linea', '- Screen:']) expect(r.cuerpo).not.toContain(dato)
  })

  it('una opción que no sea exactamente true cuenta como no marcada', async () => {
    const r = await invocar('feedback:preview', BUG, { incluirTecnica: 'true', pantalla: 'chat' })
    expect(r.cuerpo).not.toContain('1.44.0')
  })

  it('con la casilla incluye versión, SO, Python, pantalla y el registro, anonimizados', async () => {
    registrar('renderer', 'error', 'No se pudo leer /home/maria/redes/cliente.inp')
    const r = await invocar('feedback:preview', BUG, { incluirTecnica: true, pantalla: 'settings:about' })
    expect(r.cuerpo).toContain('- Boorie Version: 1.44.0')
    expect(r.cuerpo).toContain(`- OS: `)
    expect(r.cuerpo).toContain('- Python Version: Python 3.12.3 (Boorie managed venv)')
    expect(r.cuerpo).toContain('- Screen: settings:about')
    expect(r.cuerpo).toContain('[renderer] [error] No se pudo leer /home/<usuario>/redes/cliente.inp')
    expect(r.cuerpo).toContain('[setup-python] setup linea 39')
    expect(r.cuerpo).not.toContain('setup linea 24 ')
    expect(r.cuerpo).not.toContain('maria')
  })

  it('el informe no lleva los avisos de arranque conocidos, pero sí cualquier otro (#267)', async () => {
    registrar('main', 'warn', 'Microsoft Client ID not configured. Set MS_CLIENT_ID environment variable.')
    registrar('main', 'warn', 'Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.')
    registrar('renderer', 'warn', 'La red tiene 3 nudos sin coordenadas')
    const r = await invocar('feedback:preview', BUG, { incluirTecnica: true, pantalla: 'chat' })
    expect(r.cuerpo).not.toContain('MS_CLIENT_ID')
    expect(r.cuerpo).not.toContain('GOOGLE_CLIENT_ID')
    expect(r.cuerpo).toContain('[renderer] [warn] La red tiene 3 nudos sin coordenadas')
  })

  it('una pantalla con caracteres raros se registra como unknown', async () => {
    const r = await invocar('feedback:preview', BUG, { incluirTecnica: true, pantalla: '<img src=x>' })
    expect(r.cuerpo).toContain('- Screen: unknown')
  })
})

describe('feedback:get-environment (R11, R30)', () => {
  it('pide la versión de Python de forma asíncrona y la guarda para la siguiente vez', async () => {
    rutaPython = '/opt/python-cache/bin/python3'
    const a = await invocar('feedback:get-environment', 'settings:about')
    const b = await invocar('feedback:get-environment', 'settings:about')
    expect(a.entorno?.python).toBe('Python 3.12.3')
    expect(b.entorno?.python).toBe('Python 3.12.3')
    expect(execFile).toHaveBeenCalledTimes(1)
    expect(execFile.mock.calls[0][1]).toEqual(['--version'])
    expect(a.entorno?.venvGestionado).toBe(false)
    expect(a.entorno?.version).toBe('1.44.0')
  })

  it('sin Python responde null, no un error', async () => {
    rutaPython = '/no/existe/python'
    execFile.mockImplementation((_r: string, _a: string[], _o: unknown, cb: Callback) => cb(new Error('ENOENT'), '', ''))
    const r = await invocar('feedback:get-environment', 'chat')
    expect(r.success).toBe(true)
    expect(r.entorno?.python).toBeNull()
  })
})

describe('feedback:copy (D1)', () => {
  it('copia título y cuerpo al portapapeles', async () => {
    expect(await invocar('feedback:copy', BUG, { incluirTecnica: false })).toEqual({ success: true })
    expect(writeText.mock.calls[0][0]).toMatch(/^\[BUG\] Se cerró la app/)
    expect(writeText.mock.calls[0][0]).toContain('## 🐛 Bug Description')
  })
})

describe('captura de pantalla (R32, D9)', () => {
  it('copia al portapapeles la captura hecha antes de abrir el modal y la olvida al descartarla', async () => {
    expect(await invocar('feedback:copy-snapshot')).toEqual({ success: false, error: 'no-snapshot' })
    expect(await invocar('feedback:snapshot')).toEqual({ success: true })
    expect(ventana.webContents.capturePage).toHaveBeenCalledTimes(1)
    expect(await invocar('feedback:copy-snapshot')).toEqual({ success: true })
    expect(writeImage).toHaveBeenCalledWith(imagen)
    await invocar('feedback:discard-snapshot')
    expect(await invocar('feedback:copy-snapshot')).toEqual({ success: false, error: 'no-snapshot' })
  })
})

describe('escucharConsolaDelRenderer (D5)', () => {
  it('guarda avisos y errores del renderer, no la información', async () => {
    let oyente: (e: { level: string; message: string }) => void = () => {}
    escucharConsolaDelRenderer({ on: (_ev: string, fn: typeof oyente) => { oyente = fn } } as unknown as WebContents)
    oyente({ level: 'info', message: 'hola' })
    oyente({ level: 'warning', message: 'cuidado' })
    oyente({ level: 'error', message: 'roto' })
    const r = await invocar('feedback:preview', BUG, { incluirTecnica: true, pantalla: 'chat' })
    expect(r.cuerpo).toContain('[renderer] [warn] cuidado')
    expect(r.cuerpo).toContain('[renderer] [error] roto')
    expect(r.cuerpo).not.toContain('hola')
  })
})
