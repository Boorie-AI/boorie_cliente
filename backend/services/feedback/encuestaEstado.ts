import * as fs from 'fs'
import * as path from 'path'
import { marcaDeEncuesta } from './encuestaUso'

/**
 * Si la encuesta de uso está completada. Abrir GitHub no basta: el usuario
 * puede cerrar la pestaña sin publicar. Cada envío lleva una referencia en el
 * cuerpo, y sólo cuenta como completada cuando un issue con ella existe.
 */

const FICHERO = 'encuesta-uso.json'
const API_ISSUES = 'https://api.github.com/repos/Boorie-AI/boorie_cliente/issues'
const PAGINAS = 3
const PLAZO_MS = 4000
// Por si el reloj del equipo va adelantado respecto al de GitHub.
const MARGEN_RELOJ_MS = 24 * 3600 * 1000

export interface EstadoEncuesta {
  completada?: string
  issue?: number
  envios?: { ref: string; abierta: string }[]
}

/** 'pedir' con `noPublicada` cuando se abrió GitHub pero el issue no aparece. 'aplazar': sin conexión, no se sabe. */
export type Comprobacion =
  | { decision: 'completada'; issue?: number }
  | { decision: 'pedir'; noPublicada: boolean }
  | { decision: 'aplazar' }

type Fetch = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) =>
  Promise<{ ok: boolean; json: () => Promise<unknown> }>

export function leerEstado(dir: string): EstadoEncuesta {
  try {
    const e = JSON.parse(fs.readFileSync(path.join(dir, FICHERO), 'utf-8'))
    return e && typeof e === 'object' ? e : {}
  } catch {
    return {}
  }
}

function guardar(dir: string, e: EstadoEncuesta): void {
  fs.writeFileSync(path.join(dir, FICHERO), JSON.stringify(e, null, 2))
}

export function registrarEnvio(dir: string, ref: string, ahora = new Date()): void {
  const e = leerEstado(dir)
  guardar(dir, { ...e, envios: [...(e.envios ?? []), { ref, abierta: ahora.toISOString() }] })
}

/** null si no se pudo consultar. `since` filtra por actualización, que nunca es anterior a la creación. */
export async function buscarIssue(envios: { ref: string; abierta: string }[], f: Fetch = fetch as unknown as Fetch): Promise<number | null | 'no'> {
  const desde = new Date(Date.parse(envios.map(e => e.abierta).sort()[0]) - MARGEN_RELOJ_MS).toISOString()
  const marcas = envios.map(e => marcaDeEncuesta(e.ref))
  try {
    for (let pagina = 1; pagina <= PAGINAS; pagina++) {
      const q = new URLSearchParams({ state: 'all', since: desde, per_page: '100', page: String(pagina) })
      const r = await f(`${API_ISSUES}?${q}`, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Boorie' },
        signal: AbortSignal.timeout(PLAZO_MS),
      })
      if (!r.ok) return null
      const issues = await r.json() as { number: number; body?: string | null; pull_request?: unknown }[]
      if (!Array.isArray(issues)) return null
      const hallado = issues.find(i => !i.pull_request && marcas.some(m => i.body?.includes(m)))
      if (hallado) return hallado.number
      if (issues.length < 100) break
    }
    return 'no'
  } catch {
    return null
  }
}

export async function comprobarEncuesta(dir: string, f?: Fetch): Promise<Comprobacion> {
  const e = leerEstado(dir)
  if (e.completada) return { decision: 'completada', issue: e.issue }
  if (!e.envios?.length) return { decision: 'pedir', noPublicada: false }
  const r = await buscarIssue(e.envios, f)
  if (r === null) return { decision: 'aplazar' }
  if (r === 'no') return { decision: 'pedir', noPublicada: true }
  guardar(dir, { ...e, completada: new Date().toISOString(), issue: r })
  return { decision: 'completada', issue: r }
}
