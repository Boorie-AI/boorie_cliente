import { nudoVisible, tramoVisible, type CapasVisibles } from './capas'
import { etiquetaMagnitud } from './unidades'

/**
 * Grafo topológico de la red para el visor de vis-network (#37).
 *
 * Es la vista que sigue funcionando cuando el mapa no puede: una red sin
 * coordenadas, o con coordenadas cuyo sistema nadie ha declarado, no se puede
 * situar sobre la ortofoto (#36) pero sí se puede leer como esquema. Sin esto,
 * retirar el visor topológico dejaría esas redes sin ninguna forma de verse.
 *
 * Módulo puro: no sabe de React ni de vis-network, sólo produce la estructura
 * que el componente entrega a la librería.
 */

export interface NodoRed {
  id: string
  label?: string
  type?: string
  x?: number
  y?: number
  coordinates?: number[]
  elevation?: number
  demand?: number
  [k: string]: unknown
}

export interface TramoRed {
  id: string
  label?: string
  type?: string
  from: string
  to: string
  length?: number
  diameter?: number
  status?: string
  [k: string]: unknown
}

export interface DatosRed {
  nodes: NodoRed[]
  links: TramoRed[]
}

export interface ResultadosSimulacion {
  node_results?: Record<string, Record<string, number | number[] | undefined>>
  link_results?: Record<string, Record<string, number | number[] | undefined>>
}

export interface NodoGrafo {
  id: string
  label: string
  title: string
  color: string
  shape: string
  size: number
  x?: number
  y?: number
  fixed?: boolean
}

export interface TramoGrafo {
  id: string
  from: string
  to: string
  title: string
  color: string
  width: number
  dashes: boolean
  arrows?: string
}

export interface GrafoRed {
  nodes: NodoGrafo[]
  edges: TramoGrafo[]
  /**
   * `true` cuando la red no trae coordenadas utilizables y hay que dejar que
   * vis-network coloque los nudos por simulación física.
   */
  usaFisica: boolean
  /** Explicación del modo elegido, para que la interfaz pueda decirlo. */
  motivo: string
}

/**
 * Tamanos de referencia del esquema (#97).
 *
 * Son los que el panel trae por defecto. El esquema dibuja cada tipo con su
 * propio tamano —un deposito se ve mas grande que un nudo, y eso distingue de
 * un vistazo lo que es cada cosa—, asi que el deslizador no fija el tamano:
 * escala los de cada tipo respecto a estos. Con el valor por defecto la escala
 * es 1 y no cambia nada, que es lo que hace comprobable que sea neutra.
 *
 * `ajustesVisor.ts` los usa como valor inicial, para que no puedan separarse.
 */
export const NUDO_BASE = 8
export const TRAMO_BASE = 2

/**
 * Aplica la opacidad del panel a un color del esquema (#97).
 *
 * vis-network acepta `rgba(...)` como color, pero no tiene una propiedad de
 * opacidad aparte como las capas del mapa, asi que hay que meterla en el
 * color. Todos los colores del esquema son `#rrggbb` —las constantes por tipo,
 * el color por presion y las rampas de simbologia—, pero `escala.color` esta
 * tipada como cualquier cadena: lo que no se reconozca se devuelve intacto en
 * lugar de romper el dibujo.
 */
export function conOpacidad(color: string, opacidad: number): string {
  if (opacidad >= 1) return color
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim())
  if (!m) return color
  const h = m[1].length === 3 ? m[1].replace(/./g, c => c + c) : m[1]
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16))
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, opacidad)})`
}

const COLOR_POR_TIPO: Record<string, { color: string; shape: string; size: number }> = {
  tank: { color: '#EF4444', shape: 'square', size: 14 },
  reservoir: { color: '#10B981', shape: 'triangle', size: 16 },
  junction: { color: '#3B82F6', shape: 'dot', size: 8 },
}

const COLOR_POR_TIPO_TRAMO: Record<string, { color: string; width: number }> = {
  pump: { color: '#DC2626', width: 4 },
  valve: { color: '#0891B2', width: 3 },
  pipe: { color: '#6B7280', width: 2 },
}

/** Extrae el valor de un resultado que puede venir como escalar o como serie. */
export function valorEnPaso(
  valor: number | number[] | undefined,
  paso = 0
): number | undefined {
  if (Array.isArray(valor)) return valor[paso] ?? valor[0]
  return valor
}

export interface LecturaNudo {
  id: string
  label: string
  tipo: string
  cota?: number
  /**
   * En m³/s, como todo lo que viene del motor. Es la del paso vigente cuando hay
   * simulación, y la base del fichero cuando no.
   */
  demanda?: number
  /** `false` cuando la demanda que se da es la base y no la del paso simulado. */
  demandaSimulada: boolean
  presion?: number
}

export interface LecturaTramo {
  id: string
  label: string
  tipo: string
  longitud?: number
  diametro?: number
  caudal?: number
  velocidad?: number
}

/**
 * Lo que enseña el cuadro de un elemento elegido, leído en el paso vigente.
 *
 * El cuadro no puede quedarse con las cifras del momento del clic: presión,
 * caudal y velocidad cambian con el paso de la simulación, y guardarlas las
 * congelaba (#74). Se resuelven aquí, contra la red y los resultados, para que
 * el visor sólo tenga que recordar qué elemento está elegido.
 */
export function lecturaNudo(
  datos: DatosRed | null | undefined,
  resultados: ResultadosSimulacion | null | undefined,
  id: string,
  paso = 0
): LecturaNudo | null {
  const n = datos?.nodes.find(x => x.id === id)
  if (!n) return null

  const demandaDelPaso = valorEnPaso(resultados?.node_results?.[id]?.demand, paso)

  return {
    id,
    label: String(n.label ?? n.id),
    tipo: String(n.type ?? 'junction'),
    cota: typeof n.elevation === 'number' ? n.elevation : undefined,
    demanda: demandaDelPaso ?? (typeof n.demand === 'number' ? n.demand : undefined),
    demandaSimulada: typeof demandaDelPaso === 'number',
    presion: valorEnPaso(resultados?.node_results?.[id]?.pressure, paso),
  }
}

export function lecturaTramo(
  datos: DatosRed | null | undefined,
  resultados: ResultadosSimulacion | null | undefined,
  id: string,
  paso = 0
): LecturaTramo | null {
  const l = datos?.links.find(x => x.id === id)
  if (!l) return null

  const res = resultados?.link_results?.[id]

  return {
    id,
    label: String(l.label ?? l.id),
    tipo: String(l.type ?? 'pipe'),
    longitud: typeof l.length === 'number' ? l.length : undefined,
    diametro: typeof l.diameter === 'number' ? l.diameter : undefined,
    caudal: valorEnPaso(res?.flowrate, paso),
    velocidad: valorEnPaso(res?.velocity, paso),
  }
}

function coordenadas(n: NodoRed): [number, number] | null {
  const x = n.x ?? n.coordinates?.[0]
  const y = n.y ?? n.coordinates?.[1]
  if (typeof x !== 'number' || typeof y !== 'number') return null
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return [x, y]
}

/**
 * Si la red trae coordenadas que sirven para dibujar. Un `.inp` sin sección
 * [COORDINATES] deja los nudos sin ellas, y hay ficheros que las traen todas a
 * cero: en los dos casos respetarlas daría un ovillo en un punto, así que es
 * preferible que vis-network reparta los nudos.
 */
export function tieneCoordenadasUtiles(nodes: NodoRed[]): boolean {
  const puntos = nodes.map(coordenadas).filter((c): c is [number, number] => c !== null)
  if (puntos.length < 2) return false

  const xs = puntos.map(p => p[0])
  const ys = puntos.map(p => p[1])
  const anchura = Math.max(...xs) - Math.min(...xs)
  const altura = Math.max(...ys) - Math.min(...ys)

  return anchura > 0 || altura > 0
}

/** Lienzo de destino en unidades de vis-network. */
const LIENZO = 1000

/**
 * Escala las coordenadas al lienzo conservando la proporción. Sin esto, una red
 * de 40 unidades de lado saldría del tamaño de un sello y otra de 3.000 metros
 * desbordaría: el `x * 10` que había antes sólo funcionaba para el rango con el
 * que se probó.
 */
function escalar(nodes: NodoRed[]) {
  const puntos = nodes.map(coordenadas).filter((c): c is [number, number] => c !== null)
  const xs = puntos.map(p => p[0])
  const ys = puntos.map(p => p[1])
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const anchura = Math.max(...xs) - minX
  const altura = Math.max(...ys) - minY
  const escala = LIENZO / Math.max(anchura, altura, 1e-9)

  // La Y se invierte porque en vis-network crece hacia abajo y en un .inp hacia
  // el norte: sin invertirla, la red saldría reflejada.
  return (x: number, y: number): [number, number] => [
    (x - minX) * escala,
    -(y - minY) * escala,
  ]
}

function colorPorPresion(presion: number | undefined, base: string): string {
  if (typeof presion !== 'number') return base
  if (presion < 20) return '#DC2626'
  if (presion > 80) return '#F97316'
  return base
}

export function construirGrafo(
  datos: DatosRed | null | undefined,
  resultados?: ResultadosSimulacion | null,
  paso = 0,
  /**
   * Escala de color vigente. Se pasa desde fuera para que el esquema y el mapa
   * pinten la misma magnitud: si el esquema coloreara siempre por presión
   * mientras el panel dice «velocidad», estaría mintiendo (#37).
   */
  escala?: { aplicaA: 'nudos' | 'tramos'; parametro: string; color: (v: number | undefined) => string | null } | null,
  /**
   * Tipos de elemento visibles. En el esquema, ocultar un tipo de nudo se lleva
   * tambien los tramos que lo tocan: un tramo necesita sus dos extremos para
   * poder dibujarse. En el mapa no pasa, porque alli cada tramo tiene su propia
   * geometria.
   */
  capas?: CapasVisibles | null,
  /**
   * Tamano de nudo y grosor de tramo del panel (#97). El Dr. Mora reporto que
   * el deslizador no hacia nada en el esquema: los ajustes de dibujo llegaban
   * al mapa pero no aqui, asi que el esquema pintaba siempre con los tamanos
   * fijos de cada tipo.
   */
  dibujo?: { nodeSize?: number; linkWidth?: number; opacity?: number } | null
): GrafoRed {
  const escalaNudo = (dibujo?.nodeSize ?? NUDO_BASE) / NUDO_BASE
  const escalaTramo = (dibujo?.linkWidth ?? TRAMO_BASE) / TRAMO_BASE
  const opacidad = dibujo?.opacity ?? 1

  if (!datos || datos.nodes.length === 0) {
    return { nodes: [], edges: [], usaFisica: false, motivo: 'La red no tiene nudos.' }
  }

  const nodosVisibles = capas ? datos.nodes.filter(n => nudoVisible(n, capas)) : datos.nodes
  if (nodosVisibles.length === 0) {
    return { nodes: [], edges: [], usaFisica: false, motivo: 'No hay ningún tipo de elemento visible.' }
  }

  const conCoordenadas = tieneCoordenadasUtiles(nodosVisibles)
  const proyectar = conCoordenadas ? escalar(nodosVisibles) : null

  const nodes: NodoGrafo[] = nodosVisibles.map(n => {
    const tipo = String(n.type ?? 'junction')
    const estilo = COLOR_POR_TIPO[tipo] ?? COLOR_POR_TIPO.junction

    const res = resultados?.node_results?.[n.id]
    const presion = valorEnPaso(res?.pressure, paso)
    // Con simulación, la demanda que interesa es la del paso que se está viendo,
    // no la base del fichero: en PDA un nudo con poca presión no recibe lo que
    // pide, y la etiqueta tiene que decir lo que recibe en ese instante.
    const demandaDelPaso = valorEnPaso(res?.demand, paso)
    const porEscala =
      escala?.aplicaA === 'nudos'
        ? escala.color(valorEnPaso(res?.[escala.parametro === 'presion' ? 'pressure' : 'demand'], paso))
        : null

    // Cada cifra con su unidad y sin los quince decimales con los que sale del
    // motor: la etiqueta decía «Demanda: 0.001743182126532», que no dice si son
    // litros, metros cúbicos o por segundo, y de la que sólo el principio es
    // dato (#77).
    const detalles = [
      `${tipo}: ${n.label ?? n.id}`,
      etiquetaMagnitud('Cota', n.elevation, 'cota'),
      typeof demandaDelPaso === 'number'
        ? etiquetaMagnitud('Demanda', demandaDelPaso, 'demanda')
        : etiquetaMagnitud('Demanda base', n.demand, 'demanda'),
      etiquetaMagnitud('Presión', presion, 'presion'),
    ].filter((d): d is string => d !== null)

    const punto = proyectar ? coordenadas(n) : null
    const xy = punto && proyectar ? proyectar(punto[0], punto[1]) : null

    return {
      id: n.id,
      label: String(n.label ?? n.id),
      title: detalles.join('\n'),
      color: conOpacidad(porEscala ?? colorPorPresion(presion, estilo.color), opacidad),
      shape: estilo.shape,
      size: estilo.size * escalaNudo,
      ...(xy ? { x: xy[0], y: xy[1], fixed: true } : {}),
    }
  })

  // Un tramo que apunta a un nudo que no existe rompe vis-network en lugar de
  // dibujarse a medias, asi que se descarta: pasa con .inp recortados a mano.
  const ids = new Set(nodosVisibles.map(n => n.id))

  const edges: TramoGrafo[] = datos.links
    .filter(l => (!capas || tramoVisible(l, capas)) && ids.has(l.from) && ids.has(l.to))
    .map(l => {
      const tipo = String(l.type ?? 'pipe')
      const estilo = COLOR_POR_TIPO_TRAMO[tipo] ?? COLOR_POR_TIPO_TRAMO.pipe

      const res = resultados?.link_results?.[l.id]
      const caudal = valorEnPaso(res?.flowrate, paso)
      const velocidad = valorEnPaso(res?.velocity, paso)

      const porEscalaTramo =
        escala?.aplicaA === 'tramos'
          ? escala.color(valorEnPaso(res?.[escala.parametro === 'caudal' ? 'flowrate' : 'velocity'], paso))
          : null

      const detalles = [
        `${tipo}: ${l.label ?? l.id}`,
        etiquetaMagnitud('Longitud', l.length, 'longitud'),
        etiquetaMagnitud('Diámetro', l.diameter, 'diametro'),
        etiquetaMagnitud('Caudal', caudal, 'caudal'),
        etiquetaMagnitud('Velocidad', velocidad, 'velocidad'),
      ].filter((d): d is string => d !== null)

      const grosor =
        typeof caudal === 'number'
          ? Math.min(Math.abs(caudal) * 2 + estilo.width, estilo.width * 4)
          : estilo.width

      // Caudal negativo significa que circula al reves de como esta declarado el
      // tramo; la flecha lo dice en lugar de mentir sobre el sentido.
      const invertido = typeof caudal === 'number' && caudal < 0

      return {
        id: l.id,
        from: invertido ? l.to : l.from,
        to: invertido ? l.from : l.to,
        title: detalles.join('\n'),
        color: conOpacidad(porEscalaTramo ?? estilo.color, opacidad),
        width: grosor * escalaTramo,
        dashes: tipo === 'valve' && String(l.status ?? '').toUpperCase() === 'CLOSED',
        ...(typeof caudal === 'number' || tipo === 'pump' ? { arrows: 'to' } : {}),
      }
    })

  return {
    nodes,
    edges,
    usaFisica: !conCoordenadas,
    motivo: conCoordenadas
      ? 'Esquema con las coordenadas del fichero, sin georreferenciar.'
      : 'La red no trae coordenadas utilizables: el esquema lo reparte el propio visor.',
  }
}
