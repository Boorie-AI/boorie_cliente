/**
 * Unidades y formato de las cifras que el visor enseña (#77).
 *
 * El motor trabaja en el SI de WNTR y hasta ahora el visor volcaba ese número
 * tal cual y sin unidad: la etiqueta de un nudo decía «Cota: 0.3048» y
 * «Demanda: 0.001743182126532». Las dos cosas están mal por el mismo motivo —una
 * cifra sin unidad no es un dato, y quince decimales de un caudal son ruido de
 * coma flotante, no precisión—, así que se arreglan en el mismo sitio.
 *
 * Aquí se decide **una sola vez** en qué unidad se enseña cada magnitud y con
 * cuánta precisión, y de aquí tiran la etiqueta del esquema, la ficha del
 * elemento elegido en el mapa y la leyenda de la simbología. Antes cada una
 * decidía por su cuenta y no coincidían: la leyenda prometía «l/s» sobre valores
 * en m³/s, así que un caudal de 47 l/s se leía como «0.05 l/s».
 *
 * Módulo puro: no sabe de React ni de vis-network.
 */

export type Magnitud =
  | 'cota'
  | 'presion'
  | 'longitud'
  | 'diametro'
  | 'demanda'
  | 'caudal'
  | 'velocidad'

interface DefinicionMagnitud {
  /** Unidad en la que se enseña, que no siempre es la del motor. */
  unidad: string
  /** Multiplicador desde la unidad SI de WNTR hasta la de presentación. */
  factor: number
  /** Cifras significativas con las que se enseña. */
  cifras: number
}

/**
 * Caudal y demanda se enseñan en l/s, y el diámetro en mm, porque es como se
 * proyecta y como se habla de una red; m³/s deja la demanda de un nudo en
 * «0,00174», que no se puede comparar de un vistazo con la del nudo de al lado.
 * El resto ya está en la unidad de trabajo y sólo le faltaba el símbolo.
 *
 * Las cifras significativas salen de para qué sirve cada número: seis en caudal
 * y demanda —lo que pidió el cliente y lo que hace falta para que un consumo
 * pequeño no se convierta en cero—, y menos donde más decimales no aportan nada
 * (una presión de servicio no se decide en la centésima de metro).
 */
const MAGNITUDES: Record<Magnitud, DefinicionMagnitud> = {
  cota: { unidad: 'm', factor: 1, cifras: 6 },
  presion: { unidad: 'm', factor: 1, cifras: 4 },
  longitud: { unidad: 'm', factor: 1, cifras: 6 },
  diametro: { unidad: 'mm', factor: 1000, cifras: 4 },
  demanda: { unidad: 'l/s', factor: 1000, cifras: 6 },
  caudal: { unidad: 'l/s', factor: 1000, cifras: 6 },
  velocidad: { unidad: 'm/s', factor: 1, cifras: 3 },
}

/**
 * El formato se escribe a mano y no con `toLocaleString('es-ES')`, por lo mismo
 * que en `narrarEscenario`: en el entorno de pruebas —Node sin datos de ICU
 * completos— esa llamada devuelve «2592» y en Electron «2.592», y una cifra no
 * puede cambiar de forma según dónde se ejecute.
 */
const miles = (entera: string) => entera.replace(/\B(?=(\d{3})+(?!\d))/g, '.')

/**
 * El número con como mucho `cifras` significativas, sin ceros de relleno.
 *
 * `toPrecision` redondea bien pero devuelve el texto en inglés y, por debajo de
 * 1e-6, en notación exponencial; se vuelve a componer a mano para que el
 * resultado sea siempre legible en decimal.
 */
export function cifrasSignificativas(valor: number, cifras: number): string {
  if (!Number.isFinite(valor)) return '—'
  if (valor === 0) return '0'

  const redondeado = Number(valor.toPrecision(cifras))
  if (redondeado === 0) return '0'

  const exponente = Math.floor(Math.log10(Math.abs(redondeado)))
  const decimales = Math.max(0, Math.min(20, cifras - 1 - exponente))
  const [entera, decimal = ''] = Math.abs(redondeado).toFixed(decimales).split('.')
  const sinRelleno = decimal.replace(/0+$/, '')

  // Menos, no guion: es el signo que usa el resto de la aplicación al escribir cifras.
  const signo = redondeado < 0 ? '−' : ''
  return sinRelleno ? `${signo}${miles(entera)},${sinRelleno}` : `${signo}${miles(entera)}`
}

/** La unidad en la que se enseña una magnitud, para rotular una columna o un eje. */
export function unidadDe(magnitud: Magnitud): string {
  return MAGNITUDES[magnitud].unidad
}

/** El valor del motor (SI) convertido a la unidad de presentación, sin formatear. */
export function enUnidadDePresentacion(valor: number, magnitud: Magnitud): number {
  return valor * MAGNITUDES[magnitud].factor
}

/**
 * El valor listo para enseñar, con su unidad: `1,74318 l/s`.
 *
 * Devuelve `null` cuando no hay dato, para que quien llama omita la línea entera
 * en vez de escribir una etiqueta con un hueco.
 *
 * @param valor En la unidad SI de WNTR, que es como llega del motor.
 * @param cifras Para el sitio donde la precisión de la ficha estorba: los cortes
 *   de una leyenda se leen de un vistazo y no hacen falta seis cifras.
 */
export function formatearMagnitud(
  valor: number | undefined | null,
  magnitud: Magnitud,
  cifras?: number
): string | null {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return null
  const def = MAGNITUDES[magnitud]
  return `${cifrasSignificativas(valor * def.factor, cifras ?? def.cifras)} ${def.unidad}`
}

/** `Cota: 0,3048 m`, o `null` si no hay dato. */
export function etiquetaMagnitud(
  rotulo: string,
  valor: number | undefined | null,
  magnitud: Magnitud
): string | null {
  const texto = formatearMagnitud(valor, magnitud)
  return texto ? `${rotulo}: ${texto}` : null
}
