/**
 * Simbología: qué magnitud colorea la red y con qué escala (#45, rescate de #37).
 *
 * Los dos visores que se retiraron ofrecían más parámetros que el canónico
 * —presión, demanda, caudal y velocidad—, y esa capacidad sí merecía volver. Lo
 * que no vuelve es cómo la calculaban: sus escalas eran máximos fijos escritos a
 * mano (caudal 0-200 L/s, velocidad 0-2 m/s, demanda 0-50 L/s). Es el mismo
 * defecto que los husos codificados del #48: funciona con las redes con las que
 * se probó y satura en el color más alto para cualquier red mayor.
 *
 * Aquí la escala sale de los datos del paso que se está mostrando.
 */

import { valorEnPaso, type DatosRed, type ResultadosSimulacion } from './topologia'

export type Simbologia = 'ninguna' | 'presion' | 'demanda' | 'caudal' | 'velocidad'

export interface TramoLeyenda {
  color: string
  /** Texto ya formateado para la leyenda. */
  etiqueta: string
}

export interface Escala {
  parametro: Exclude<Simbologia, 'ninguna'>
  /** Sobre qué se aplica el color. */
  aplicaA: 'nudos' | 'tramos'
  unidad: string
  min: number
  max: number
  /** `true` cuando los cortes son absolutos y no dependen de la red. */
  absoluta: boolean
  color: (valor: number | undefined) => string | null
  leyenda: TramoLeyenda[]
}

const PARAMETROS: Record<Exclude<Simbologia, 'ninguna'>, {
  aplicaA: 'nudos' | 'tramos'
  clave: string
  unidad: string
  rampa: string[]
}> = {
  presion: { aplicaA: 'nudos', clave: 'pressure', unidad: 'm', rampa: [] },
  demanda: {
    aplicaA: 'nudos',
    clave: 'demand',
    unidad: 'L/s',
    rampa: ['#f0f0f0', '#9ecae1', '#6baed6', '#3182bd', '#08519c'],
  },
  caudal: {
    aplicaA: 'tramos',
    clave: 'flowrate',
    unidad: 'L/s',
    rampa: ['#fee5d9', '#fcae91', '#fb6a4a', '#de2d26', '#a50f15'],
  },
  velocidad: {
    aplicaA: 'tramos',
    clave: 'velocity',
    unidad: 'm/s',
    rampa: ['#f7fbff', '#deebf7', '#c6dbef', '#6baed6', '#2171b5'],
  },
}

/**
 * Cortes de presión, los únicos absolutos. La presión tiene un criterio de
 * servicio que no depende de la red —por debajo de 20 m el suministro es
 * insuficiente—, así que escalarla al máximo de cada modelo escondería
 * justamente lo que hay que ver. El resto de magnitudes no tienen un umbral
 * universal y se escalan a los datos.
 */
const PRESION_BAJA = 20
const PRESION_ALTA = 80
const COLOR_PRESION = { baja: '#DC2626', normal: '#3B82F6', alta: '#F97316' }

function formatear(valor: number, unidad: string): string {
  const decimales = Math.abs(valor) >= 100 ? 0 : Math.abs(valor) >= 10 ? 1 : 2
  return `${valor.toFixed(decimales)} ${unidad}`
}

/** Valores del parámetro en el paso pedido, para todos los elementos. */
function valores(
  datos: DatosRed,
  resultados: ResultadosSimulacion,
  parametro: Exclude<Simbologia, 'ninguna'>,
  paso: number
): number[] {
  const { aplicaA, clave } = PARAMETROS[parametro]
  const elementos = aplicaA === 'nudos' ? datos.nodes : datos.links
  const tabla = aplicaA === 'nudos' ? resultados.node_results : resultados.link_results
  if (!tabla) return []

  const salida: number[] = []
  for (const e of elementos) {
    const v = valorEnPaso(tabla[e.id]?.[clave], paso)
    // El caudal circula en los dos sentidos; para colorear importa la magnitud.
    if (typeof v === 'number' && Number.isFinite(v)) salida.push(Math.abs(v))
  }
  return salida
}

export function construirEscala(
  simbologia: Simbologia,
  datos: DatosRed | null | undefined,
  resultados: ResultadosSimulacion | null | undefined,
  paso = 0
): Escala | null {
  if (simbologia === 'ninguna' || !datos || !resultados) return null

  const def = PARAMETROS[simbologia]

  if (simbologia === 'presion') {
    const v = valores(datos, resultados, 'presion', paso)
    if (v.length === 0) return null
    return {
      parametro: 'presion',
      aplicaA: 'nudos',
      unidad: def.unidad,
      min: Math.min(...v),
      max: Math.max(...v),
      absoluta: true,
      color: valor => {
        if (typeof valor !== 'number' || !Number.isFinite(valor)) return null
        if (valor < PRESION_BAJA) return COLOR_PRESION.baja
        if (valor > PRESION_ALTA) return COLOR_PRESION.alta
        return COLOR_PRESION.normal
      },
      leyenda: [
        { color: COLOR_PRESION.baja, etiqueta: `Menos de ${PRESION_BAJA} m` },
        { color: COLOR_PRESION.normal, etiqueta: `Entre ${PRESION_BAJA} y ${PRESION_ALTA} m` },
        { color: COLOR_PRESION.alta, etiqueta: `Más de ${PRESION_ALTA} m` },
      ],
    }
  }

  const v = valores(datos, resultados, simbologia, paso)
  if (v.length === 0) return null

  const min = Math.min(...v)
  const max = Math.max(...v)
  const rampa = def.rampa
  // Una red con todos los valores iguales —o un solo elemento— no tiene rango
  // que repartir: se pinta de un color y la leyenda dice el valor, en lugar de
  // dividir por cero y devolver colores al azar.
  const rango = max - min

  const color = (valor: number | undefined): string | null => {
    if (typeof valor !== 'number' || !Number.isFinite(valor)) return null
    if (rango === 0) return rampa[rampa.length - 1]
    const normalizado = (Math.abs(valor) - min) / rango
    const indice = Math.min(rampa.length - 1, Math.floor(normalizado * rampa.length))
    return rampa[Math.max(0, indice)]
  }

  const leyenda: TramoLeyenda[] =
    rango === 0
      ? [{ color: rampa[rampa.length - 1], etiqueta: formatear(min, def.unidad) }]
      : rampa.map((c, i) => ({
          color: c,
          etiqueta: `${formatear(min + (rango * i) / rampa.length, def.unidad)} – ${formatear(
            min + (rango * (i + 1)) / rampa.length,
            def.unidad
          )}`,
        }))

  return {
    parametro: simbologia,
    aplicaA: def.aplicaA,
    unidad: def.unidad,
    min,
    max,
    absoluta: false,
    color,
    leyenda,
  }
}

export const ETIQUETAS_SIMBOLOGIA: Array<{ valor: Simbologia; texto: string }> = [
  { valor: 'ninguna', texto: 'Por tipo de elemento' },
  { valor: 'presion', texto: 'Presión en los nudos' },
  { valor: 'demanda', texto: 'Demanda en los nudos' },
  { valor: 'caudal', texto: 'Caudal en los tramos' },
  { valor: 'velocidad', texto: 'Velocidad en los tramos' },
]
