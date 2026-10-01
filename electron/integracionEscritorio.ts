import fs from 'fs'
import os from 'os'
import path from 'path'

// GNOME 45+ ignora el icono que publica la ventana: el dock solo lo toma de un
// .desktop instalado cuyo nombre o StartupWMClass coincida con el WM_CLASS. El
// que trae el AppImage dentro no se instala si no hay AppImageLauncher o similar,
// así que la app lo instala ella misma. El nombre sigue a `desktopName` de
// package.json, que es de donde Electron saca el WM_CLASS y el app_id de Wayland.
const ID = 'boorie'

interface Opciones {
  appImage: string
  icono: string
  version: string
  datos?: string
}

// Exec entre comillas: el AppImage suele estar en rutas con espacios.
function rutaParaExec(ruta: string): string {
  return `"${ruta.replace(/[\\"`$]/g, c => `\\${c}`).replace(/\\/g, '\\\\')}"`
}

export function contenidoDesktop(appImage: string, icono: string, version: string): string {
  return [
    '[Desktop Entry]',
    'Name=Boorie',
    `Exec=${rutaParaExec(appImage)} --no-sandbox %U`,
    'Terminal=false',
    'Type=Application',
    `Icon=${icono}`,
    `StartupWMClass=${ID}`,
    `X-AppImage-Version=${version}`,
    'Comment=Boorie - Advanced AI Desktop Client with comprehensive productivity features',
    'Categories=Utility;',
    ''
  ].join('\n')
}

function escribirSiCambia(destino: string, contenido: Buffer | string): boolean {
  const nuevo = Buffer.isBuffer(contenido) ? contenido : Buffer.from(contenido)
  if (fs.existsSync(destino) && fs.readFileSync(destino).equals(nuevo)) return false
  fs.mkdirSync(path.dirname(destino), { recursive: true })
  fs.writeFileSync(destino, nuevo)
  return true
}

/** Devuelve true si ha escrito algo. */
export function instalarEntradaEscritorio({ appImage, icono, version, datos }: Opciones): boolean {
  const base = datos || process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share')
  const destinoIcono = path.join(base, 'icons', 'hicolor', '512x512', 'apps', `${ID}.png`)
  const destinoDesktop = path.join(base, 'applications', `${ID}.desktop`)

  // readFileSync y no copyFileSync: el icono de origen está dentro de app.asar.
  const iconoCambiado = escribirSiCambia(destinoIcono, fs.readFileSync(icono))
  const desktopCambiado = escribirSiCambia(destinoDesktop, contenidoDesktop(appImage, destinoIcono, version))
  return iconoCambiado || desktopCambiado
}
