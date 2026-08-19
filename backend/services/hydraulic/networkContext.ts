/**
 * Resumen de la red activa para el agente del chat (issue #34).
 *
 * Antes el contexto del proyecto decía «Network model: loaded (EPANET .inp data
 * available for this project)» y ni una cifra más. Eso es peor que no decir
 * nada: el modelo sabe que existe una red, no tiene ningún dato sobre ella, y
 * nada le impide rellenar el hueco con generalidades presentadas como propias
 * de la red del usuario.
 *
 * Módulo puro a propósito: recibe lo que ya está guardado y devuelve texto, sin
 * tocar la base ni Electron, para poder contrastarlo contra redes reales.
 */

/** Contadores tal como los guarda `HydraulicNetwork.summary`. */
export interface ContadoresRed {
  junctions?: number
  tanks?: number
  reservoirs?: number
  pipes?: number
  pumps?: number
  valves?: number
  patterns?: number
  curves?: number
}

/** Subconjunto de `HydraulicNetwork.networkData` que se necesita. */
export interface DatosRed {
  nodes?: Array<{ demand?: number | null }>
  links?: Array<{ length?: number | null; diameter?: number | null }>
  coordinate_system?: { type?: string; units?: string; epsg?: number | null }
}

export interface SimulacionCitada {
  nombre: string
  fecha: Date | string
}

export interface EntradaResumen {
  nombreRed: string
  contadores: ContadoresRed
  datos: DatosRed
  /** Última simulación guardada para esta red, si la hay. */
  ultimaSimulacion?: SimulacionCitada | null
}

export interface ResumenRed {
  nombre: string
  junctions: number
  tanks: number
  reservoirs: number
  pipes: number
  pumps: number
  valves: number
  /** Suma de longitudes de tramo, en metros. */
  longitudTotalM: number
  /** Suma de demandas base positivas, en m3/s. */
  demandaTotalM3s: number
  diametroMinMm: number | null
  diametroMaxMm: number | null
  sistemaCoordenadas: string | null
  ultimaSimulacion: SimulacionCitada | null
}

/**
 * WNTR normaliza a SI al cargar el .inp, así que las longitudes vienen en
 * metros, los diámetros en metros y las demandas en m3/s aunque el fichero
 * original estuviera en pies o en galones.
 */
export function construirResumenRed(entrada: EntradaResumen): ResumenRed {
  const { contadores, datos } = entrada
  const links = datos.links ?? []
  const nodes = datos.nodes ?? []

  const longitudTotalM = links.reduce((total, l) => total + (l.length ?? 0), 0)

  // Sólo las demandas positivas: una demanda base negativa modela una entrada
  // de agua, no un consumo, y sumarla restaría del total (mismo caso que en
  // docs/POBLACION_AFECTADA_PDA.md).
  const demandaTotalM3s = nodes.reduce((total, n) => {
    const d = n.demand ?? 0
    return d > 0 ? total + d : total
  }, 0)

  const diametros = links
    .map(l => l.diameter)
    .filter((d): d is number => typeof d === 'number' && d > 0)

  const cs = datos.coordinate_system
  let sistemaCoordenadas: string | null = null
  if (cs?.epsg) {
    sistemaCoordenadas = `EPSG:${cs.epsg}`
  } else if (cs?.type) {
    // El epsg viene a null en las redes reales, así que se dice lo que se sabe
    // (geográficas o proyectadas) en lugar de inventar un código.
    sistemaCoordenadas = cs.type === 'geographic' ? 'geográficas (lat/lon)' : `proyectadas${cs.units ? ` (${cs.units})` : ''}`
  }

  return {
    nombre: entrada.nombreRed,
    junctions: contadores.junctions ?? 0,
    tanks: contadores.tanks ?? 0,
    reservoirs: contadores.reservoirs ?? 0,
    pipes: contadores.pipes ?? 0,
    pumps: contadores.pumps ?? 0,
    valves: contadores.valves ?? 0,
    longitudTotalM,
    demandaTotalM3s,
    diametroMinMm: diametros.length ? Math.round(Math.min(...diametros) * 1000) : null,
    diametroMaxMm: diametros.length ? Math.round(Math.max(...diametros) * 1000) : null,
    sistemaCoordenadas,
    ultimaSimulacion: entrada.ultimaSimulacion ?? null,
  }
}

const MARCA_INICIO = '=== RED HIDRÁULICA ACTIVA ==='
const MARCA_FIN = '=== FIN RED HIDRÁULICA ==='
const MARCA_GLOBAL_INICIO = '=== CHAT GENERAL ==='
const MARCA_GLOBAL_FIN = '=== FIN CHAT GENERAL ==='

/**
 * Texto que se inyecta en el prompt de sistema. Incluye la instrucción de no
 * inventar: el criterio del issue es que sin red el agente lo diga, en lugar de
 * responder generalidades como si fueran de la red del usuario.
 */
export function formatearContextoRed(resumen: ResumenRed | null): string {
  if (!resumen) {
    // Sin proyecto seleccionado esto es el chat general de Boorie. No es un
    // estado degradado: es un modo con sus propias reglas, y hay que decirlas,
    // porque callar deja la respuesta a merced de la disposición del modelo.
    return [
      MARCA_GLOBAL_INICIO,
      'No hay ningún proyecto ni red hidráulica cargados: esto es el chat general.',
      'Responde con conocimiento general de ingeniería hidráulica y con la documentación',
      'de la base de conocimiento cuando venga adjunta al mensaje.',
      'No describas ninguna red concreta ni des cifras de «la red del usuario»: no hay ninguna',
      'a la vista, y tampoco inventes ejemplos numéricos que puedan confundirse con ella.',
      'Si preguntan por su red, por sus nudos o por sus resultados, dilo con claridad e',
      'indícales que abran un proyecto e importen su archivo .inp para poder responder con datos.',
      'Mantente dentro del ámbito de la aplicación: ingeniería hidráulica y redes de agua.',
      MARCA_GLOBAL_FIN,
      '',
    ].join('\n')
  }

  const km = (resumen.longitudTotalM / 1000).toFixed(2)
  const ls = (resumen.demandaTotalM3s * 1000).toFixed(2)

  const lineas = [
    MARCA_INICIO,
    `Red: ${resumen.nombre}`,
    `Nudos de consumo: ${resumen.junctions} · Depósitos: ${resumen.tanks} · Embalses: ${resumen.reservoirs}`,
    `Tuberías: ${resumen.pipes} · Bombas: ${resumen.pumps} · Válvulas: ${resumen.valves}`,
    `Longitud total de tubería: ${km} km`,
    `Demanda base total: ${ls} L/s`,
  ]

  if (resumen.diametroMinMm !== null && resumen.diametroMaxMm !== null) {
    lineas.push(`Diámetros: de ${resumen.diametroMinMm} a ${resumen.diametroMaxMm} mm`)
  }
  if (resumen.sistemaCoordenadas) {
    lineas.push(`Coordenadas: ${resumen.sistemaCoordenadas}`)
  }
  if (resumen.ultimaSimulacion) {
    const f = new Date(resumen.ultimaSimulacion.fecha)
    const fecha = isNaN(f.getTime()) ? String(resumen.ultimaSimulacion.fecha) : f.toISOString().slice(0, 10)
    lineas.push(`Última simulación guardada: «${resumen.ultimaSimulacion.nombre}» (${fecha})`)
  } else {
    lineas.push('Última simulación guardada: ninguna todavía.')
  }

  lineas.push(
    'Estas cifras vienen de la red cargada. Cíñete a ellas y no las completes con supuestos:',
    'si te preguntan algo que no está aquí, dilo y ofrece ejecutar la simulación o el análisis que haga falta.',
    MARCA_FIN,
    '',
  )

  return lineas.join('\n')
}
