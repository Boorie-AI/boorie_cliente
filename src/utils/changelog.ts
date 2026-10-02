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

export interface TrozoEnLinea {
  tipo: 'texto' | 'negrita' | 'cursiva' | 'codigo'
  texto: string
}

// El CHANGELOG usa **negrita**, *cursiva* y `código` dentro de las viñetas. Pintado
// como texto plano, el historial enseñaba los asteriscos. Lo que no cierra se deja
// tal cual: es preferible un asterisco suelto a perder texto.
const EN_LINEA = /\*\*([^*]+?)\*\*|`([^`]+)`|\*([^*\s][^*]*?)\*/g

export function trocearEnLinea(texto: string): TrozoEnLinea[] {
  const trozos: TrozoEnLinea[] = []
  let ultimo = 0
  for (const m of texto.matchAll(EN_LINEA)) {
    const inicio = m.index ?? 0
    if (inicio > ultimo) trozos.push({ tipo: 'texto', texto: texto.slice(ultimo, inicio) })
    if (m[1] !== undefined) trozos.push({ tipo: 'negrita', texto: m[1] })
    else if (m[2] !== undefined) trozos.push({ tipo: 'codigo', texto: m[2] })
    else trozos.push({ tipo: 'cursiva', texto: m[3] })
    ultimo = inicio + m[0].length
  }
  if (ultimo < texto.length) trozos.push({ tipo: 'texto', texto: texto.slice(ultimo) })
  return trozos
}

/**
 * `new Date('2026-10-01')` es la medianoche UTC, y al pintarla en una zona al oeste
 * de Greenwich sale el día anterior: la v1.44.0 aparecía como «30 sept». Una fecha
 * sin hora se construye en la zona local.
 */
export function fechaDeChangelog(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(iso)
}
