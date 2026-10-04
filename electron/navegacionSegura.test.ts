import { describe, it, expect, vi } from 'vitest'
import { esDeLaApp, protegerNavegacion, urlExternaPermitida } from './navegacionSegura'

describe('urlExternaPermitida (#264)', () => {
  it.each([
    'https://build.nvidia.com/nvidia/nemotron-3-ultra-550b-a55b',
    'http://www.conagua.gob.mx/normas',
    'mailto:soporte@example.com',
  ])('deja abrir fuera %s', url => expect(urlExternaPermitida(url)).toBe(true))

  it.each([
    'file:///etc/passwd',
    'smb://servidor/compartida',
    'javascript:alert(1)',
    'vscode://file/home/x',
    'ms-msdt:/id PCWDiagnostic',
    'https://usuario:clave@example.com/',
    'esto no es una url',
  ])('no deja abrir fuera %s', url => expect(urlExternaPermitida(url)).toBe(false))
})

describe('esDeLaApp', () => {
  it('en desarrollo vale el origen de Vite y nada más', () => {
    expect(esDeLaApp('http://localhost:3000/#/chat', 'http://localhost:3000')).toBe(true)
    expect(esDeLaApp('http://localhost:3001/', 'http://localhost:3000')).toBe(false)
    expect(esDeLaApp('https://example.com/', 'http://localhost:3000')).toBe(false)
  })

  it('en el paquete vale un fichero dentro de su carpeta, no otro del disco', () => {
    const app = 'file:///opt/Boorie/resources/app.asar/dist'
    expect(esDeLaApp('file:///opt/Boorie/resources/app.asar/dist/index.html', app)).toBe(true)
    expect(esDeLaApp('file:///opt/Boorie/resources/app.asar/dist/index.html#/ajustes', app)).toBe(true)
    expect(esDeLaApp('file:///opt/Boorie/resources/app.asar/distinto/x.html', app)).toBe(false)
    expect(esDeLaApp('file:///home/rayne/informe.html', app)).toBe(false)
    expect(esDeLaApp('https://example.com/', app)).toBe(false)
  })
})

describe('protegerNavegacion', () => {
  const montar = () => {
    const oyentes: Record<string, (e: { preventDefault(): void }, url: string) => void> = {}
    let abrirVentana: (d: { url: string }) => { action: 'deny' } = () => ({ action: 'deny' })
    const contenido = {
      setWindowOpenHandler: (h: typeof abrirVentana) => { abrirVentana = h },
      on: (ev: 'will-navigate' | 'will-redirect', fn: (e: { preventDefault(): void }, url: string) => void) => { oyentes[ev] = fn },
    }
    const abrirFuera = vi.fn(async () => {})
    const avisar = vi.fn()
    protegerNavegacion(contenido, { origenApp: 'http://localhost:3000', abrirFuera, avisar })
    const navegar = (ev: 'will-navigate' | 'will-redirect', url: string) => {
      const e = { preventDefault: vi.fn() }
      oyentes[ev](e, url)
      return e.preventDefault
    }
    return { abrirVentana: (url: string) => abrirVentana({ url }), navegar, abrirFuera, avisar }
  }

  it('una ventana nueva nunca se crea: lo permitido se abre fuera y lo demás se bloquea y se avisa', () => {
    const v = montar()
    expect(v.abrirVentana('https://example.com/norma.pdf')).toEqual({ action: 'deny' })
    expect(v.abrirFuera).toHaveBeenCalledWith('https://example.com/norma.pdf')
    expect(v.abrirVentana('file:///etc/passwd')).toEqual({ action: 'deny' })
    expect(v.abrirFuera).toHaveBeenCalledTimes(1)
    expect(v.avisar).toHaveBeenCalledWith(expect.stringContaining('bloqueado'), 'file:///etc/passwd')
  })

  it('la ventana no navega a una web externa: se abre fuera y se impide', () => {
    const v = montar()
    const impedida = v.navegar('will-navigate', 'https://atacante.example/')
    expect(impedida).toHaveBeenCalled()
    expect(v.abrirFuera).toHaveBeenCalledWith('https://atacante.example/')
  })

  it('una redirección a fuera también se impide', () => {
    const v = montar()
    expect(v.navegar('will-redirect', 'https://otra.example/')).toHaveBeenCalled()
  })

  it('navegar dentro de la app (recargar, rutas) sigue funcionando', () => {
    const v = montar()
    expect(v.navegar('will-navigate', 'http://localhost:3000/#/ajustes')).not.toHaveBeenCalled()
    expect(v.abrirFuera).not.toHaveBeenCalled()
  })

  it('un esquema no permitido en la navegación se impide y no se abre fuera', () => {
    const v = montar()
    expect(v.navegar('will-navigate', 'smb://servidor/x')).toHaveBeenCalled()
    expect(v.abrirFuera).not.toHaveBeenCalled()
  })
})
