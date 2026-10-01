import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { contenidoDesktop, instalarEntradaEscritorio } from './integracionEscritorio'

const ICONO = path.join(__dirname, '..', 'resources', 'icon.png')

describe('instalarEntradaEscritorio', () => {
  let datos: string

  beforeEach(() => { datos = fs.mkdtempSync(path.join(os.tmpdir(), 'boorie-desktop-')) })
  afterEach(() => { fs.rmSync(datos, { recursive: true, force: true }) })

  it('escribe el .desktop y el icono, y no reescribe si nada cambió', () => {
    const opciones = { appImage: '/opt/Boorie-1.43.0.AppImage', icono: ICONO, version: '1.43.0', datos }
    expect(instalarEntradaEscritorio(opciones)).toBe(true)

    const desktop = fs.readFileSync(path.join(datos, 'applications', 'boorie.desktop'), 'utf-8')
    const icono = path.join(datos, 'icons', 'hicolor', '512x512', 'apps', 'boorie.png')
    expect(desktop).toContain('StartupWMClass=boorie')
    expect(desktop).toContain(`Icon=${icono}`)
    expect(fs.readFileSync(icono).equals(fs.readFileSync(ICONO))).toBe(true)

    expect(instalarEntradaEscritorio(opciones)).toBe(false)
  })

  it('reescribe el .desktop cuando el AppImage cambia de ruta', () => {
    instalarEntradaEscritorio({ appImage: '/a/Boorie.AppImage', icono: ICONO, version: '1.43.0', datos })
    expect(instalarEntradaEscritorio({ appImage: '/b/Boorie.AppImage', icono: ICONO, version: '1.43.0', datos })).toBe(true)
    expect(fs.readFileSync(path.join(datos, 'applications', 'boorie.desktop'), 'utf-8')).toContain('Exec="/b/Boorie.AppImage"')
  })
})

describe('contenidoDesktop', () => {
  it('escapa la ruta del Exec según la especificación', () => {
    const exec = contenidoDesktop('/home/x/Mis "apps"/$Boorie.AppImage', '/i.png', '1').split('\n').find(l => l.startsWith('Exec='))
    expect(exec).toBe('Exec="/home/x/Mis \\\\"apps\\\\"/\\\\$Boorie.AppImage" --no-sandbox %U')
  })
})
