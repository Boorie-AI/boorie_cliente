/**
 * Últimos avisos y errores del main y del renderer, solo en memoria (#217, D5).
 *
 * La aplicación no tiene log en disco —`appLogger` escribe a consola—, y volcar
 * la consola a fichero cambiaría el logging de todo el proceso. Para un reporte
 * basta con lo último que salió mal, y así no se deja nada nuevo en el equipo.
 */

export type OrigenRegistro = 'main' | 'renderer'
export type NivelRegistro = 'warn' | 'error'

export interface EntradaRegistro {
  hora: string
  origen: OrigenRegistro
  nivel: NivelRegistro
  texto: string
}

export const MAX_ENTRADAS = 50
const MAX_CARACTERES = 500

const entradas: EntradaRegistro[] = []

export function registrar(origen: OrigenRegistro, nivel: NivelRegistro, texto: string, ahora = new Date()): void {
  const limpio = texto.replace(/\s+/g, ' ').trim()
  if (!limpio) return
  entradas.push({
    hora: ahora.toISOString(),
    origen,
    nivel,
    texto: limpio.length > MAX_CARACTERES ? `${limpio.slice(0, MAX_CARACTERES)}…` : limpio,
  })
  if (entradas.length > MAX_ENTRADAS) entradas.splice(0, entradas.length - MAX_ENTRADAS)
}

export function ultimas(n = MAX_ENTRADAS): EntradaRegistro[] {
  return n <= 0 ? [] : entradas.slice(-n)
}

export function vaciarRegistro(): void {
  entradas.length = 0
}

function aTexto(args: unknown[]): string {
  return args
    .map(a => {
      if (a instanceof Error) return `${a.name}: ${a.message}`
      if (typeof a === 'string') return a
      try { return JSON.stringify(a) } catch { return String(a) }
    })
    .join(' ')
}

let instalado = false

/** Copia al búfer lo que el main manda a `console.warn` y `console.error`, sin dejar de escribirlo. */
export function capturarConsolaDelMain(consola: Pick<Console, 'warn' | 'error'> = console): void {
  if (instalado) return
  instalado = true
  const warn = consola.warn.bind(consola)
  const error = consola.error.bind(consola)
  consola.warn = (...args: unknown[]) => { registrar('main', 'warn', aTexto(args)); warn(...args) }
  consola.error = (...args: unknown[]) => { registrar('main', 'error', aTexto(args)); error(...args) }
}
