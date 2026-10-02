/**
 * Quita de un texto lo que identifica a la persona antes de que salga del
 * equipo (#217). Los reportes van a issues de un repositorio público, así que
 * aquí se pasa todo: el log, el entorno y también lo que escribe el usuario.
 */

export interface OpcionesAnonimizar {
  /** Carpeta personal real (`os.homedir()`), por si no sigue el patrón habitual. */
  home?: string
}

const USUARIO = '<usuario>'

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function anonimizar(texto: string, opciones: OpcionesAnonimizar = {}): string {
  let r = texto

  // La carpeta personal exacta primero: cubre perfiles fuera de C:\Users o /home
  // (dominios, discos secundarios) que las reglas genéricas no reconocen.
  const home = opciones.home?.replace(/[\\/]+$/, '')
  if (home && home.length > 3) {
    const variantes = new Set([home, home.replace(/\\/g, '/'), home.replace(/\//g, '\\')])
    for (const v of variantes) r = r.replace(new RegExp(escaparRegex(v), 'gi'), '~')
  }

  r = r
    .replace(/([A-Za-z]:[\\/]+(?:Users|Documents and Settings)[\\/]+)[^\\/\s"'<>:|]+/gi, `$1${USUARIO}`)
    .replace(/(\/(?:home|Users)\/)[^/\s"'<>:]+/g, `$1${USUARIO}`)
    .replace(/(\\\\[^\\\s]+\\Users\\)[^\\\s"'<>]+/gi, `$1${USUARIO}`)
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<email>')
    .replace(/\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}/g, '<clave>')
    .replace(/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/g, '<clave>')
    .replace(/\bgithub_pat_[A-Za-z0-9_]{20,}/g, '<clave>')
    .replace(/\bAIza[0-9A-Za-z_-]{30,}/g, '<clave>')
    .replace(/\bnvapi-[A-Za-z0-9_-]{20,}/g, '<clave>')
    // Las de la columna `apiKey` (#225): la cifrada no se puede usar fuera de su equipo, pero tampoco tiene por qué salir.
    .replace(/\b(?:enc|plano):v1:[^\s"',}]{6,}/g, '<clave>')
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, '$1<clave>')
    .replace(/((?:api[_-]?key|token|password|secret)["']?\s*[:=]\s*["']?)[^\s"',}]{6,}/gi, '$1<clave>')

  return r
}
