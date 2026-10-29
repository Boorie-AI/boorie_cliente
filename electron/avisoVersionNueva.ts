/**
 * En Mac, avisar de que hay versión nueva en vez de intentar instalarla (#310).
 *
 * electron-updater instala en macOS desde un `.zip` firmado, y las releases
 * sólo publican el `.dmg`, sin firmar: la actualización automática no ha
 * funcionado nunca ahí y quien usa Boorie en Mac no se enteraba de que había
 * otra versión. Aquí sólo se comprueba, sin descargar nada, y la interfaz
 * enseña un aviso con el enlace a la release.
 *
 * La comprobación puede terminar antes de que el renderer se suscriba, así que
 * la versión se guarda y el renderer también la pide al montarse.
 */

export const CANAL_VERSION_NUEVA = 'actualizacion:version-nueva'
export const CANAL_VERSION_PENDIENTE = 'actualizacion:version-pendiente'

const RELEASES = 'https://github.com/Boorie-AI/boorie_cliente/releases/tag/v'

export interface VersionNueva {
  version: string
  url: string
}

interface Actualizador {
  autoDownload: boolean
  on(evento: 'update-available', escuchar: (info: { version: string }) => void): unknown
  checkForUpdates(): Promise<unknown>
}

export function avisarDeVersionNueva(
  actualizador: Actualizador,
  enviar: (nueva: VersionNueva) => void,
  avisarError: (error: unknown) => void
): () => VersionNueva | null {
  let nueva: VersionNueva | null = null
  actualizador.autoDownload = false
  actualizador.on('update-available', ({ version }) => {
    nueva = { version, url: RELEASES + encodeURIComponent(version) }
    enviar(nueva)
  })
  actualizador.checkForUpdates().catch(avisarError)
  return () => nueva
}
