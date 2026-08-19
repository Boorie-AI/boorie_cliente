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
  escala?: { aplicaA: 'nudos' | 'tramos'; parametro: string; color: (v: number | undefined) => string | null } | null
): GrafoRed {
  if (!datos || datos.nodes.length === 0) {
    return { nodes: [], edges: [], usaFisica: false, motivo: 'La red no tiene nudos.' }
  }

  const conCoordenadas = tieneCoordenadasUtiles(datos.nodes)
  const proyectar = conCoordenadas ? escalar(datos.nodes) : null

  const nodes: NodoGrafo[] = datos.nodes.map(n => {
    const tipo = String(n.type ?? 'junction')
    const estilo = COLOR_POR_TIPO[tipo] ?? COLOR_POR_TIPO.junction

    const res = resultados?.node_results?.[n.id]
    const presion = valorEnPaso(res?.pressure, paso)
    const porEscala =
      escala?.aplicaA === 'nudos'
        ? escala.color(valorEnPaso(res?.[escala.parametro === 'presion' ? 'pressure' : 'demand'], paso))
        : null

    const detalles = [`${tipo}: ${n.label ?? n.id}`]
    if (typeof n.elevation === 'number') detalles.push(`Cota: ${n.elevation}`)
    if (typeof n.demand === 'number') detalles.push(`Demanda: ${n.demand}`)
    if (typeof presion === 'number') detalles.push(`Presión: ${presion.toFixed(2)} m`)

    const punto = proyectar ? coordenadas(n) : null
    const xy = punto && proyectar ? proyectar(punto[0], punto[1]) : null

    return {
      id: n.id,
      label: String(n.label ?? n.id),
      title: detalles.join('\n'),
      color: porEscala ?? colorPorPresion(presion, estilo.color),
      shape: estilo.shape,
      size: estilo.size,
      ...(xy ? { x: xy[0], y: xy[1], fixed: true } : {}),
    }
  })

  // Un tramo que apunta a un nudo que no existe rompe vis-network en lugar de
  // dibujarse a medias, asi que se descarta: pasa con .inp recortados a mano.
  const ids = new Set(datos.nodes.map(n => n.id))

  const edges: TramoGrafo[] = datos.links
    .filter(l => ids.has(l.from) && ids.has(l.to))
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

      const detalles = [`${tipo}: ${l.label ?? l.id}`]
      if (typeof l.length === 'number') detalles.push(`Longitud: ${l.length}`)
      if (typeof l.diameter === 'number') detalles.push(`Diámetro: ${l.diameter}`)
      if (typeof caudal === 'number') detalles.push(`Caudal: ${caudal.toFixed(4)}`)
      if (typeof velocidad === 'number') detalles.push(`Velocidad: ${velocidad.toFixed(2)} m/s`)

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
        color: porEscalaTramo ?? estilo.color,
        width: grosor,
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
