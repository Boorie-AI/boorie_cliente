/**
 * Reglas del versionado inmutable (#38): qué se conserva y qué cambió.
 *
 * Módulo puro, sin Prisma: la política de retención y la comparación entre
 * versiones son decisiones que conviene poder probar sin base de datos delante,
 * porque de ellas depende que no se borre lo que no se debe.
 */

/** Lo mínimo que hace falta de una versión para decidir si se conserva. */
export interface VersionRetenible {
  id: string
  versionNumber: number
  marcada: boolean
  /**
   * Sujeta por una instantánea de proyecto. Podarla dejaría la instantánea
   * apuntando al vacío, así que cuenta como intocable igual que un hito, pero
   * por un motivo distinto: el hito lo decide el ingeniero, esto lo impone la
   * integridad de otra cosa que sí quiso conservar.
   */
  enSnapshot?: boolean
}

export interface PoliticaRetencion {
  /**
   * Cuántas versiones sin marcar se conservan, de la más reciente hacia atrás.
   * Las marcadas como hito no cuentan y no se podan nunca.
   */
  conservarSinMarcar: number
}

export const RETENCION_POR_DEFECTO: PoliticaRetencion = { conservarSinMarcar: 10 }

/**
 * Versiones que sobran según la política. Devuelve ids, no las borra.
 *
 * Nunca se poda una marcada como hito, ni una sujeta por una instantánea de
 * proyecto, ni la más reciente —aunque no esté marcada y la política sea cero—:
 * quedarse sin ninguna versión de una red convertiría la retención en una forma
 * de perder el historial entero.
 */
export function versionesAPodar(
  versiones: VersionRetenible[],
  politica: PoliticaRetencion = RETENCION_POR_DEFECTO
): string[] {
  if (versiones.length === 0) return []

  const recientesPrimero = [...versiones].sort((a, b) => b.versionNumber - a.versionNumber)
  const conservar = new Set<string>([recientesPrimero[0].id])

  let sinMarcar = 0
  for (const v of recientesPrimero) {
    if (v.marcada || v.enSnapshot) {
      conservar.add(v.id)
      continue
    }
    if (sinMarcar < Math.max(0, politica.conservarSinMarcar)) {
      conservar.add(v.id)
      sinMarcar++
    }
  }

  return recientesPrimero.filter(v => !conservar.has(v.id)).map(v => v.id)
}

// --- Comparación entre dos versiones -------------------------------------

export interface ElementoRed {
  id: string
  [campo: string]: unknown
}

export interface DatosVersion {
  nodes?: ElementoRed[]
  links?: ElementoRed[]
}

export interface CambioElemento {
  id: string
  campos: string[]
}

export interface DiferenciaLado {
  anadidos: string[]
  eliminados: string[]
  modificados: CambioElemento[]
}

export interface DiferenciaRed {
  nudos: DiferenciaLado
  tramos: DiferenciaLado
  sinCambios: boolean
}

/**
 * Campos que se comparan. La lista es explícita a propósito: comparar el objeto
 * entero marcaría como «modificado» cualquier nudo cuyo resultado de simulación
 * viniera dentro, y el diff de una red debe hablar de la red, no de lo que se
 * calculó sobre ella.
 */
const CAMPOS_NUDO = ['type', 'elevation', 'demand', 'x', 'y', 'pattern', 'initialLevel', 'diameter']
const CAMPOS_TRAMO = ['type', 'from', 'to', 'length', 'diameter', 'roughness', 'status', 'minorLoss']

function comparar(
  antes: ElementoRed[] | undefined,
  despues: ElementoRed[] | undefined,
  campos: string[]
): DiferenciaLado {
  const mapaAntes = new Map((antes ?? []).map(e => [e.id, e]))
  const mapaDespues = new Map((despues ?? []).map(e => [e.id, e]))

  const anadidos: string[] = []
  const modificados: CambioElemento[] = []

  for (const [id, elemento] of mapaDespues) {
    const previo = mapaAntes.get(id)
    if (!previo) {
      anadidos.push(id)
      continue
    }
    const cambiados = campos.filter(c => !mismoValor(previo[c], elemento[c]))
    if (cambiados.length > 0) modificados.push({ id, campos: cambiados })
  }

  const eliminados = [...mapaAntes.keys()].filter(id => !mapaDespues.has(id))

  return { anadidos, eliminados, modificados }
}

/**
 * Dos valores son el mismo si lo son numéricamente. Un `.inp` reescrito puede
 * traer `100` donde antes ponía `100.0`, y marcar eso como un cambio de diámetro
 * llenaría el diff de ruido que esconde los cambios de verdad.
 */
function mismoValor(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a == null || b == null) return a == null && b == null
  const na = Number(a)
  const nb = Number(b)
  if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb
  return String(a) === String(b)
}

export function compararVersiones(antes: DatosVersion, despues: DatosVersion): DiferenciaRed {
  const nudos = comparar(antes.nodes, despues.nodes, CAMPOS_NUDO)
  const tramos = comparar(antes.links, despues.links, CAMPOS_TRAMO)

  const sinCambios =
    nudos.anadidos.length === 0 && nudos.eliminados.length === 0 && nudos.modificados.length === 0 &&
    tramos.anadidos.length === 0 && tramos.eliminados.length === 0 && tramos.modificados.length === 0

  return { nudos, tramos, sinCambios }
}

/** Resumen de una diferencia en una línea, para listas y avisos. */
export function resumirDiferencia(d: DiferenciaRed): string {
  if (d.sinCambios) return 'Sin cambios en la red'

  const partes: string[] = []
  const contar = (n: number, singular: string, plural: string) =>
    n > 0 ? `${n} ${n === 1 ? singular : plural}` : null

  const nudos = [
    contar(d.nudos.anadidos.length, 'nudo añadido', 'nudos añadidos'),
    contar(d.nudos.eliminados.length, 'nudo eliminado', 'nudos eliminados'),
    contar(d.nudos.modificados.length, 'nudo modificado', 'nudos modificados'),
  ].filter(Boolean)

  const tramos = [
    contar(d.tramos.anadidos.length, 'tramo añadido', 'tramos añadidos'),
    contar(d.tramos.eliminados.length, 'tramo eliminado', 'tramos eliminados'),
    contar(d.tramos.modificados.length, 'tramo modificado', 'tramos modificados'),
  ].filter(Boolean)

  partes.push(...(nudos as string[]), ...(tramos as string[]))
  return partes.join(', ')
}

// --- Comparación entre dos ejecuciones de simulación ---------------------

export interface ResultadosSimulacion {
  node_results?: Record<string, Record<string, number | number[] | undefined>>
  link_results?: Record<string, Record<string, number | number[] | undefined>>
}

export interface CambioMagnitud {
  id: string
  antes: number
  despues: number
  delta: number
}

export interface DiferenciaMagnitud {
  magnitud: string
  unidad: string
  /** Elementos comparables, es decir, presentes en las dos ejecuciones. */
  comparados: number
  /** Los que más se mueven, ordenados por magnitud del cambio. */
  mayores: CambioMagnitud[]
  deltaMedio: number
  deltaMaximo: number
  subieron: number
  bajaron: number
  igual: number
}

export interface DiferenciaSimulaciones {
  magnitudes: DiferenciaMagnitud[]
  /** Ids presentes en una ejecución y no en la otra: la red cambió entremedias. */
  soloEnA: string[]
  soloEnB: string[]
}

const MAGNITUDES: Array<{ clave: string; nombre: string; unidad: string; lado: 'nudos' | 'tramos' }> = [
  { clave: 'pressure', nombre: 'Presión', unidad: 'm', lado: 'nudos' },
  { clave: 'demand', nombre: 'Demanda', unidad: 'L/s', lado: 'nudos' },
  { clave: 'flowrate', nombre: 'Caudal', unidad: 'L/s', lado: 'tramos' },
  { clave: 'velocity', nombre: 'Velocidad', unidad: 'm/s', lado: 'tramos' },
]

/** Toma el valor de un paso concreto, o el escalar si no es una serie. */
function enPaso(v: number | number[] | undefined, paso: number): number | undefined {
  if (Array.isArray(v)) return v[paso] ?? v[0]
  return typeof v === 'number' ? v : undefined
}

/**
 * Compara dos ejecuciones sobre el mismo paso de tiempo.
 *
 * Sólo se comparan los elementos presentes en las dos: si entre una ejecución y
 * otra se añadieron nudos, esos no tienen con qué compararse, y contarlos como
 * «cambio cero» falsearía las medias. Se listan aparte.
 */
export function compararSimulaciones(
  a: ResultadosSimulacion,
  b: ResultadosSimulacion,
  paso = 0,
  cuantosMayores = 5
): DiferenciaSimulaciones {
  const magnitudes: DiferenciaMagnitud[] = []
  const idsA = new Set([...Object.keys(a.node_results ?? {}), ...Object.keys(a.link_results ?? {})])
  const idsB = new Set([...Object.keys(b.node_results ?? {}), ...Object.keys(b.link_results ?? {})])

  for (const m of MAGNITUDES) {
    const tablaA = m.lado === 'nudos' ? a.node_results : a.link_results
    const tablaB = m.lado === 'nudos' ? b.node_results : b.link_results
    if (!tablaA || !tablaB) continue

    const cambios: CambioMagnitud[] = []
    for (const id of Object.keys(tablaA)) {
      const antes = enPaso(tablaA[id]?.[m.clave], paso)
      const despues = enPaso(tablaB[id]?.[m.clave], paso)
      if (typeof antes !== 'number' || typeof despues !== 'number') continue
      cambios.push({ id, antes, despues, delta: despues - antes })
    }
    if (cambios.length === 0) continue

    const absolutos = cambios.map(c => Math.abs(c.delta))
    magnitudes.push({
      magnitud: m.nombre,
      unidad: m.unidad,
      comparados: cambios.length,
      mayores: [...cambios]
        .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))
        .slice(0, cuantosMayores),
      deltaMedio: absolutos.reduce((s, v) => s + v, 0) / cambios.length,
      deltaMaximo: Math.max(...absolutos),
      subieron: cambios.filter(c => c.delta > 0).length,
      bajaron: cambios.filter(c => c.delta < 0).length,
      igual: cambios.filter(c => c.delta === 0).length,
    })
  }

  return {
    magnitudes,
    soloEnA: [...idsA].filter(id => !idsB.has(id)),
    soloEnB: [...idsB].filter(id => !idsA.has(id)),
  }
}

/** Resumen en una línea, para la lista de simulaciones. */
export function resumirDiferenciaSimulaciones(d: DiferenciaSimulaciones): string {
  if (d.magnitudes.length === 0) return 'No hay magnitudes comparables entre las dos ejecuciones'

  const partes = d.magnitudes
    .filter(m => m.deltaMaximo > 0)
    .map(m => `${m.magnitud}: hasta ${m.deltaMaximo.toFixed(2)} ${m.unidad}`)

  if (partes.length === 0) return 'Resultados idénticos'
  return partes.join(' · ')
}
