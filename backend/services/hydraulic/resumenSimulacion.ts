/**
 * Documentos derivados de una simulación, para indexarlos en el RAG (#41).
 *
 * Indexar los resultados crudos —miles de series temporales, un valor por nudo y
 * por paso— sería caro y además inútil para la recuperación semántica: nadie
 * pregunta «¿cuál era la presión del nudo J-217 en el paso 43?», y un vector
 * calculado sobre una lista de números no se parece a ninguna pregunta en
 * lenguaje natural. Lo que se indexa son cuatro documentos escritos: qué se
 * corrió, cómo salió, qué está fuera de norma y en qué cambió respecto a la vez
 * anterior. Los números completos siguen en la base y se consultan de forma
 * estructurada.
 *
 * Módulo puro: recibe los resultados tal como los devuelve WNTR y devuelve
 * texto, sin tocar la base ni el almacén vectorial.
 */

import { compararSimulaciones, resumirDiferenciaSimulaciones, type ResultadosSimulacion } from './versionado'

/** Resultados tal como los deja `wntr_simulation_service.py` en `data`. */
export interface ResultadosWNTR extends ResultadosSimulacion {
  status?: string
  execution_time?: number
  /** Segundos desde el inicio de la simulación, un valor por paso. */
  timestamps?: number[]
  stats?: {
    pressure?: { min?: number; max?: number; mean?: number }
    flow?: { min?: number; max?: number; mean?: number }
    velocity?: { min?: number; max?: number; mean?: number }
  }
  summary?: {
    nodes?: number
    links?: number
    /** Duración total, en segundos. */
    duration?: number
    hydraulic_timestep?: number
    report_timestep?: number
  }
}

/**
 * Umbrales de aceptabilidad hidráulica.
 *
 * Los valores por defecto son los que fijó el Ing. Luis Mora al validar el issue:
 * velocidad máxima 3 m/s, presión máxima 70 m, presión mínima 14 m en ciudad y
 * 7 m en acueductos rurales. Son configurables porque la referencia normativa
 * cambia con el país.
 *
 * No hay velocidad mínima: es la única magnitud que Luis Mora dejó fuera a
 * propósito —«siempre de discusión y da problemas en casos de optimización»—, y
 * fijar un valor por defecto para ella llenaría el informe de anomalías que no
 * lo son.
 */
export interface UmbralesAnomalia {
  presionMinimaM: number
  presionMaximaM: number
  velocidadMaximaMs: number
}

export const UMBRALES_URBANOS: UmbralesAnomalia = {
  presionMinimaM: 14,
  presionMaximaM: 70,
  velocidadMaximaMs: 3,
}

export const UMBRALES_RURALES: UmbralesAnomalia = {
  presionMinimaM: 7,
  presionMaximaM: 70,
  velocidadMaximaMs: 3,
}

export type ClaseAnomalia = 'presion_baja' | 'presion_alta' | 'velocidad_alta'

export interface Anomalia {
  elemento: string
  lado: 'nudo' | 'tramo'
  clase: ClaseAnomalia
  /** El peor valor alcanzado, que es el que decide la gravedad. */
  valor: number
  umbral: number
  unidad: string
  /** Paso donde se alcanza ese peor valor. */
  paso: number
  /** Cuántos pasos incumplen, no sólo el peor. */
  pasosIncumpliendo: number
  /** Duración del incumplimiento en horas, si se conoce el paso de reporte. */
  horas: number | null
}

/** Cuánto se aparta del umbral, para poder ordenar por gravedad. */
function desviacion(a: Anomalia): number {
  return a.clase === 'presion_baja' ? a.umbral - a.valor : a.valor - a.umbral
}

function serie(v: number | number[] | undefined): number[] {
  if (Array.isArray(v)) return v.filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
  return typeof v === 'number' && Number.isFinite(v) ? [v] : []
}

/** Segundos entre pasos de reporte, para poder expresar la duración en horas. */
function segundosPorPaso(res: ResultadosWNTR): number | null {
  const t = res.timestamps
  if (t && t.length >= 2 && Number.isFinite(t[1] - t[0])) return t[1] - t[0]
  const paso = res.summary?.report_timestep
  return typeof paso === 'number' && paso > 0 ? paso : null
}

/**
 * Elementos que incumplen algún umbral, con el peor valor de toda la serie.
 *
 * Se recorre la serie completa y no sólo el primer paso: una red puede estar
 * perfecta a las 3 de la madrugada y caer por debajo de la presión mínima en la
 * punta de la mañana, que es justo el momento que interesa. Reportar el paso
 * cero habría dado un informe limpio de una red que falla.
 *
 * `nudosDeConsumo` acota qué nudos se juzgan por presión. WNTR devuelve una
 * serie por cada nodo, embalses y depósitos incluidos, y en ellos la presión es
 * cero o próxima a cero por definición —su carga es el nivel de agua, no la
 * presión—, así que sin este filtro el informe abre denunciando que el embalse
 * del que se abastece la red está en déficit. Se comprobó contra Net3: «River»
 * y «Lake» salían como los peores problemas de la red. Si no se conoce la
 * topología se juzgan todos, que es preferible a callar anomalías reales.
 */
export function detectarAnomalias(
  res: ResultadosWNTR,
  umbrales: UmbralesAnomalia,
  nudosDeConsumo?: string[] | null
): Anomalia[] {
  const anomalias: Anomalia[] = []
  const segundos = segundosPorPaso(res)

  const horasDe = (pasos: number) => (segundos === null ? null : (pasos * segundos) / 3600)

  const registrar = (
    elemento: string,
    lado: 'nudo' | 'tramo',
    clase: ClaseAnomalia,
    valores: number[],
    umbral: number,
    unidad: string,
    incumple: (v: number) => boolean,
    peorQue: (a: number, b: number) => boolean
  ) => {
    let peor: number | null = null
    let pasoPeor = 0
    let cuenta = 0

    valores.forEach((v, paso) => {
      if (!incumple(v)) return
      cuenta++
      if (peor === null || peorQue(v, peor)) {
        peor = v
        pasoPeor = paso
      }
    })

    if (peor === null) return
    anomalias.push({
      elemento,
      lado,
      clase,
      valor: peor,
      umbral,
      unidad,
      paso: pasoPeor,
      pasosIncumpliendo: cuenta,
      horas: horasDe(cuenta),
    })
  }

  const juzgables = nudosDeConsumo && nudosDeConsumo.length > 0 ? new Set(nudosDeConsumo) : null

  for (const [nudo, magnitudes] of Object.entries(res.node_results ?? {})) {
    if (juzgables && !juzgables.has(nudo)) continue

    const presiones = serie(magnitudes?.pressure)
    if (presiones.length === 0) continue

    registrar(
      nudo, 'nudo', 'presion_baja', presiones, umbrales.presionMinimaM, 'm',
      v => v < umbrales.presionMinimaM,
      (a, b) => a < b
    )
    registrar(
      nudo, 'nudo', 'presion_alta', presiones, umbrales.presionMaximaM, 'm',
      v => v > umbrales.presionMaximaM,
      (a, b) => a > b
    )
  }

  for (const [tramo, magnitudes] of Object.entries(res.link_results ?? {})) {
    const velocidades = serie(magnitudes?.velocity)
    if (velocidades.length === 0) continue

    registrar(
      tramo, 'tramo', 'velocidad_alta', velocidades, umbrales.velocidadMaximaMs, 'm/s',
      v => v > umbrales.velocidadMaximaMs,
      (a, b) => a > b
    )
  }

  return anomalias.sort((a, b) => desviacion(b) - desviacion(a))
}

// --- Documentos indexables ------------------------------------------------

export type ClaseDocumento = 'ejecutivo' | 'estadistico' | 'anomalias' | 'comparacion' | 'crudo'

export interface DocumentoSimulacion {
  clase: ClaseDocumento
  titulo: string
  contenido: string
  palabrasClave: string[]
}

/** Una ejecución anterior de la misma red, para poder decir en qué cambió. */
export interface EjecucionPrevia {
  simulationRunId: string
  fecha: Date | string
  versionNumber: number
  resultados: ResultadosWNTR
}

export interface EjecucionIndexable {
  simulationRunId: string
  networkVersionId: string
  versionNumber: number
  nombreRed: string
  /** Cómo la llamó quien la lanzó: «Simulación Hidráulica», «Calidad del Agua»… */
  tipo: string
  fecha: Date | string
  parametros?: unknown
  resultados: ResultadosWNTR
  previa?: EjecucionPrevia | null
  /** Nudos de consumo de la red; sin ellos se juzgan también embalses y depósitos. */
  nudosDeConsumo?: string[] | null
  umbrales?: UmbralesAnomalia
  /**
   * Indexar además las series completas (#41, petición de Luis Mora para
   * Cliente frente a Platform: hace falta el crudo para etapas de ajuste fino).
   * Va aparte porque es caro y no mejora la recuperación semántica.
   */
  incluirCrudos?: boolean
}

function fechaLegible(f: Date | string): string {
  const d = f instanceof Date ? f : new Date(f)
  return Number.isNaN(d.getTime()) ? String(f) : d.toISOString().slice(0, 16).replace('T', ' ')
}

/**
 * Cabecera común a todos los documentos.
 *
 * Se repite en cada uno a propósito: el RAG recupera fragmentos sueltos, y un
 * fragmento que dice «12 nudos por debajo de la presión mínima» sin decir de qué
 * red ni de qué ejecución es exactamente el tipo de dato que el agente acabaría
 * atribuyendo a la red equivocada.
 */
function cabecera(e: EjecucionIndexable): string {
  return [
    `Red: ${e.nombreRed} (versión ${e.versionNumber})`,
    `Ejecución: ${e.tipo}`,
    `Fecha: ${fechaLegible(e.fecha)}`,
    `Identificador de la simulación: ${e.simulationRunId}`,
  ].join('\n')
}

function horas(segundos: number | undefined): string {
  if (typeof segundos !== 'number' || !Number.isFinite(segundos)) return 'desconocida'
  return `${(segundos / 3600).toFixed(1)} h`
}

function num(v: number | undefined, decimales = 2): string {
  return typeof v === 'number' && Number.isFinite(v) ? v.toFixed(decimales) : 'n/d'
}

function documentoEjecutivo(e: EjecucionIndexable): DocumentoSimulacion {
  const s = e.resultados.summary ?? {}
  const pasos = e.resultados.timestamps?.length ?? 0

  return {
    clase: 'ejecutivo',
    titulo: `Simulación ${e.tipo} — ${e.nombreRed} v${e.versionNumber}`,
    contenido: [
      cabecera(e),
      '',
      'RESUMEN DE LA EJECUCIÓN',
      `Estado: ${e.resultados.status ?? 'desconocido'}`,
      `Duración simulada: ${horas(s.duration)}`,
      `Paso hidráulico: ${horas(s.hydraulic_timestep)} · Paso de reporte: ${horas(s.report_timestep)}`,
      `Pasos de tiempo calculados: ${pasos}`,
      `Elementos: ${s.nodes ?? 'n/d'} nudos, ${s.links ?? 'n/d'} tramos`,
      typeof e.resultados.execution_time === 'number'
        ? `Tiempo de cálculo: ${e.resultados.execution_time.toFixed(1)} s`
        : '',
      e.parametros && Object.keys(e.parametros as object).length > 0
        ? `Parámetros: ${JSON.stringify(e.parametros)}`
        : 'Parámetros: los del modelo, sin sobrescribir',
    ].filter(Boolean).join('\n'),
    palabrasClave: ['simulación', e.tipo, e.nombreRed, 'resumen', 'ejecución'],
  }
}

function documentoEstadistico(e: EjecucionIndexable): DocumentoSimulacion {
  const st = e.resultados.stats ?? {}

  return {
    clase: 'estadistico',
    titulo: `Estadísticas de la simulación ${e.tipo} — ${e.nombreRed} v${e.versionNumber}`,
    contenido: [
      cabecera(e),
      '',
      'RANGOS DE LAS MAGNITUDES HIDRÁULICAS',
      `Presión (m): mínima ${num(st.pressure?.min)}, máxima ${num(st.pressure?.max)}, media ${num(st.pressure?.mean)}`,
      `Velocidad (m/s): mínima ${num(st.velocity?.min)}, máxima ${num(st.velocity?.max)}, media ${num(st.velocity?.mean)}`,
      `Caudal (m³/s): mínimo ${num(st.flow?.min, 4)}, máximo ${num(st.flow?.max, 4)}, medio ${num(st.flow?.mean, 4)}`,
    ].join('\n'),
    palabrasClave: ['presión', 'velocidad', 'caudal', 'estadísticas', e.nombreRed],
  }
}

const NOMBRE_ANOMALIA: Record<ClaseAnomalia, string> = {
  presion_baja: 'presión por debajo de la mínima',
  presion_alta: 'presión por encima de la máxima',
  velocidad_alta: 'velocidad excesiva',
}

/** Cuántas anomalías se enumeran una a una antes de pasar al recuento. */
const ANOMALIAS_DETALLADAS = 20

function documentoAnomalias(e: EjecucionIndexable, anomalias: Anomalia[], umbrales: UmbralesAnomalia): DocumentoSimulacion {
  const porClase = (c: ClaseAnomalia) => anomalias.filter(a => a.clase === c)
  const cuerpo: string[] = [
    cabecera(e),
    '',
    'PROBLEMAS DETECTADOS',
    `Umbrales aplicados: presión entre ${umbrales.presionMinimaM} y ${umbrales.presionMaximaM} m, velocidad máxima ${umbrales.velocidadMaximaMs} m/s.`,
    '',
  ]

  if (anomalias.length === 0) {
    cuerpo.push('Ninguna. Todos los nudos y tramos se mantienen dentro de los umbrales durante toda la simulación.')
  } else {
    cuerpo.push(
      `Total: ${anomalias.length} elementos fuera de umbral.`,
      `Nudos con presión baja: ${porClase('presion_baja').length}`,
      `Nudos con presión alta: ${porClase('presion_alta').length}`,
      `Tramos con velocidad excesiva: ${porClase('velocidad_alta').length}`,
      '',
      'Los más graves:',
      ...anomalias.slice(0, ANOMALIAS_DETALLADAS).map(a => {
        const duracion = a.horas === null
          ? `${a.pasosIncumpliendo} paso(s)`
          : `${a.horas.toFixed(1)} h`
        return `- ${a.lado === 'nudo' ? 'Nudo' : 'Tramo'} ${a.elemento}: ${NOMBRE_ANOMALIA[a.clase]}, ` +
          `hasta ${a.valor.toFixed(2)} ${a.unidad} (umbral ${a.umbral} ${a.unidad}), durante ${duracion}.`
      })
    )
    if (anomalias.length > ANOMALIAS_DETALLADAS) {
      cuerpo.push(`… y ${anomalias.length - ANOMALIAS_DETALLADAS} más, consultables en los resultados de la simulación.`)
    }
  }

  return {
    clase: 'anomalias',
    titulo: `Anomalías de la simulación ${e.tipo} — ${e.nombreRed} v${e.versionNumber}`,
    contenido: cuerpo.join('\n'),
    palabrasClave: ['anomalías', 'problemas', 'presión insuficiente', 'velocidad excesiva', e.nombreRed],
  }
}

function documentoComparacion(e: EjecucionIndexable, previa: EjecucionPrevia): DocumentoSimulacion {
  const diferencia = compararSimulaciones(previa.resultados, e.resultados)

  return {
    clase: 'comparacion',
    titulo: `Comparación con la simulación anterior — ${e.nombreRed} v${e.versionNumber}`,
    contenido: [
      cabecera(e),
      '',
      'COMPARACIÓN CON LA EJECUCIÓN ANTERIOR',
      `Anterior: ${fechaLegible(previa.fecha)} (versión ${previa.versionNumber}, identificador ${previa.simulationRunId})`,
      `En una línea: ${resumirDiferenciaSimulaciones(diferencia)}`,
      '',
      ...diferencia.magnitudes.flatMap(m => [
        `${m.magnitud} (${m.unidad}): ${m.comparados} elementos comparados, ` +
        `cambio medio ${m.deltaMedio.toFixed(3)}, máximo ${m.deltaMaximo.toFixed(3)}; ` +
        `${m.subieron} suben, ${m.bajaron} bajan, ${m.igual} sin cambio.`,
        ...m.mayores.map(c => `  - ${c.id}: ${c.antes.toFixed(2)} → ${c.despues.toFixed(2)} (${c.delta >= 0 ? '+' : ''}${c.delta.toFixed(2)})`),
      ]),
      diferencia.soloEnA.length > 0 || diferencia.soloEnB.length > 0
        ? `La red cambió entre las dos ejecuciones: ${diferencia.soloEnA.length} elementos desaparecieron y ${diferencia.soloEnB.length} son nuevos.`
        : '',
    ].filter(Boolean).join('\n'),
    palabrasClave: ['comparación', 'cambios', 'ejecución anterior', e.nombreRed],
  }
}

function documentoCrudo(e: EjecucionIndexable): DocumentoSimulacion {
  return {
    clase: 'crudo',
    titulo: `Series completas de la simulación ${e.tipo} — ${e.nombreRed} v${e.versionNumber}`,
    contenido: [
      cabecera(e),
      '',
      'SERIES TEMPORALES COMPLETAS',
      JSON.stringify({
        timestamps: e.resultados.timestamps ?? [],
        node_results: e.resultados.node_results ?? {},
        link_results: e.resultados.link_results ?? {},
      }),
    ].join('\n'),
    palabrasClave: ['series temporales', 'resultados crudos', e.nombreRed],
  }
}

/**
 * Los documentos que se indexan de una ejecución.
 *
 * El de comparación sólo existe si hay ejecución anterior con la que comparar, y
 * el crudo sólo si el proyecto lo pide expresamente.
 */
export function documentosDeSimulacion(e: EjecucionIndexable): DocumentoSimulacion[] {
  const umbrales = e.umbrales ?? UMBRALES_URBANOS
  const anomalias = detectarAnomalias(e.resultados, umbrales, e.nudosDeConsumo)

  const documentos = [
    documentoEjecutivo(e),
    documentoEstadistico(e),
    documentoAnomalias(e, anomalias, umbrales),
  ]

  if (e.previa) documentos.push(documentoComparacion(e, e.previa))
  if (e.incluirCrudos) documentos.push(documentoCrudo(e))

  return documentos
}
