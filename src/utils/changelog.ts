/**
 * Parser del CHANGELOG.md, que es la fuente única del historial de versiones.
 *
 * El fichero se edita a mano en cada release, así que el parser tiene que tolerar
 * formato imperfecto sin vaciar la sección: lo que no encaja se ignora y el resto
 * se muestra. Ver docs/ACERCA_DE_HISTORIAL_VERSIONES.md.
 */

export interface ChangelogEntry {
  /** Versión sin la `v`, tal como aparece en package.json (p. ej. "1.5.1"). */
  version: string
  /** ISO corta (YYYY-MM-DD) o null si la cabecera no la traía. */
  date: string | null
  /** Párrafo de resumen, pensado para el usuario final. */
  summary: string
  /** Viñetas de detalle, en el orden del fichero. */
  details: string[]
}

// ## [1.5.1] - 2026-08-08   |   ## [1.5.1]   |   ## 1.5.1 - 2026-08-08
const HEADING = /^##\s+\[?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?)\]?\s*(?:[-–]\s*(\d{4}-\d{2}-\d{2}))?\s*$/

/**
 * Extrae las entradas en el orden en que aparecen. No reordena: el fichero manda,
 * porque una fecha ausente o mal escrita no debe mover una versión de sitio.
 */
export function parseChangelog(markdown: string): ChangelogEntry[] {
  if (!markdown) return []

  const entries: ChangelogEntry[] = []
  let current: ChangelogEntry | null = null
  let summaryLines: string[] = []
  let enViñeta = false

  const flush = () => {
    if (!current) return
    current.summary = summaryLines.join(' ').replace(/\s+/g, ' ').trim()
    // Una entrada sin nada que contar no aporta y ensucia la línea de tiempo.
    if (current.summary || current.details.length) entries.push(current)
    current = null
    summaryLines = []
    enViñeta = false
  }

  for (const raw of markdown.split('\n')) {
    const line = raw.trim()
    const heading = HEADING.exec(line)

    if (heading) {
      flush()
      current = { version: heading[1], date: heading[2] ?? null, summary: '', details: [] }
      enViñeta = false
      continue
    }
    if (!current) continue

    // Una cabecera de otro nivel cierra la entrada: lo que sigue ya no le pertenece.
    if (/^#{1,2}\s/.test(line)) {
      flush()
      continue
    }
    // Una línea en blanco cierra la viñeta: lo que venga después es otra cosa.
    if (!line) {
      enViñeta = false
      continue
    }

    const bullet = /^[-*]\s+(.*)$/.exec(line)
    if (bullet) {
      current.details.push(bullet[1].trim())
      enViñeta = true
    } else if (!current.details.length) {
      // El resumen es lo que va entre la cabecera y la primera viñeta; el texto
      // posterior (notas de cierre) no se mezcla con él.
      summaryLines.push(line)
    } else if (enViñeta) {
      // Continuación de la viñeta anterior: el fichero se escribe con las líneas
      // partidas para que sea legible en el editor, y sin esto el texto se
      // truncaría en la primera línea.
      current.details[current.details.length - 1] += ' ' + line
    }
  }
  flush()

  return entries
}

/**
 * La entrada superior debe describir la versión que se está ejecutando. Si no
 * coinciden, el historial miente sobre lo que el usuario tiene instalado.
 */
export function isChangelogInSync(entries: ChangelogEntry[], appVersion: string): boolean {
  if (!entries.length || !appVersion) return false
  // La app puede correr como 1.5.1-rc.9 mientras el changelog documenta la 1.5.1.
  return entries[0].version === appVersion.replace(/-.*$/, '')
}
