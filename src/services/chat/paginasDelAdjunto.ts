/**
 * La página impresa en la que cae cada parte de un adjunto.
 *
 * El texto que saca pdf-parse no trae marcas de página, así que el modelo
 * deducía la página de una cita, y la deducía mal: con el libro de Walton,
 * nemotron-3-ultra acertaba la de las ecuaciones y fallaba por una o por doce
 * la de los párrafos —«tendencia antecedente (p. 31)», que está en la 14—. Lo
 * que sí trae el texto son las cabeceras de cada página: «14 GROUNDWATER
 * PUMPING TESTS» en las pares y «DESIGN AND FIELD OBSERVATION 19» en las
 * impares. Una cabecera es una línea con un número y un título que se repite a
 * lo largo del documento con números distintos, y de ahí sale el mapa.
 *
 * Un documento sin cabeceras —un informe, un escaneado— se queda sin mapa, y
 * entonces no se marca nada: es mejor que el modelo no tenga página a que
 * tenga una equivocada.
 */

export interface RangoDePaginas {
  desde: number
  hasta: number
}

interface Marca {
  posicion: number
  pagina: number
}

/** Un título se toma por cabecera si sale al menos en tantas páginas. */
const REPETICIONES_DE_CABECERA = 3
/** Con menos marcas que esto no hay mapa fiable. */
const MARCAS_MINIMAS = 5
/** Entre dos cabeceras seguidas no faltan más páginas que estas: las que abren capítulo no la llevan. */
const SALTO_MAXIMO = 4

const NUMERO_Y_TITULO = /^\s*(\d{1,4})\s+(\S.*\S)\s*$/
const TITULO_Y_NUMERO = /^\s*(\S.*\S)\s+(\d{1,4})\s*$/

const clave = (titulo: string) => titulo.toUpperCase().replace(/[^A-ZÁÉÍÓÚÑÜ]+/g, ' ').trim()

function marcasDePagina(texto: string): Marca[] {
  const candidatas: Array<Marca & { titulo: string }> = []
  let posicion = 0
  for (const linea of texto.split('\n')) {
    const m = NUMERO_Y_TITULO.exec(linea) ?? TITULO_Y_NUMERO.exec(linea)
    if (m) {
      const [numero, titulo] = /^\d+$/.test(m[1]) ? [m[1], m[2]] : [m[2], m[1]]
      // Un título de cabecera tiene letras; «12 15 20» es una fila de tabla.
      if (/[A-Za-zÁÉÍÓÚÑ]{3}/.test(titulo)) candidatas.push({ posicion, pagina: Number(numero), titulo: clave(titulo) })
    }
    posicion += linea.length + 1
  }

  const paginasPorTitulo = new Map<string, Set<number>>()
  for (const c of candidatas) {
    if (!paginasPorTitulo.has(c.titulo)) paginasPorTitulo.set(c.titulo, new Set())
    paginasPorTitulo.get(c.titulo)!.add(c.pagina)
  }
  const cabeceras = candidatas.filter(c => (paginasPorTitulo.get(c.titulo)?.size ?? 0) >= REPETICIONES_DE_CABECERA)

  // El índice repite los títulos con números que no van en orden: se queda la
  // secuencia creciente más larga, que es la del cuerpo del libro.
  const largo = cabeceras.map(() => 1)
  const previa = cabeceras.map(() => -1)
  for (let i = 0; i < cabeceras.length; i++) {
    for (let j = 0; j < i; j++) {
      const salto = cabeceras[i].pagina - cabeceras[j].pagina
      if (salto > 0 && salto <= SALTO_MAXIMO && largo[j] + 1 > largo[i]) {
        largo[i] = largo[j] + 1
        previa[i] = j
      }
    }
  }
  let fin = largo.indexOf(Math.max(0, ...largo))
  const secuencia: Marca[] = []
  for (; fin >= 0; fin = previa[fin]) secuencia.unshift({ posicion: cabeceras[fin].posicion, pagina: cabeceras[fin].pagina })
  if (secuencia.length < MARCAS_MINIMAS) return []

  // Un capítulo corto pone su título en una sola cabecera —«STEP DRAWDOWN TEST
  // ANALYSIS 79» en el de Walton— y no llega a repetirse. Con la secuencia ya
  // fijada, vale si cae justo en su hueco: entre las cabeceras de la 78 y de la
  // 82, una 79 que va entre las dos.
  const huecos = candidatas.filter(c => {
    const i = secuencia.findIndex(m => m.posicion > c.posicion)
    const antes = secuencia[i < 0 ? secuencia.length - 1 : i - 1]
    const despues = i < 0 ? undefined : secuencia[i]
    return antes && antes.posicion < c.posicion && c.pagina > antes.pagina && (!despues || c.pagina < despues.pagina)
      && c.pagina - antes.pagina <= SALTO_MAXIMO
  })
  return [...secuencia, ...huecos.map(({ posicion, pagina }) => ({ posicion, pagina }))]
    .sort((a, b) => a.posicion - b.posicion)
    .filter((m, k, todas) => k === 0 || m.pagina > todas[k - 1].pagina)
}

/**
 * Las páginas de cada fragmento, en el orden de `trocear`, o `null` si el
 * documento no tiene mapa o el fragmento cae antes de la primera cabecera.
 *
 * Una cabecera va arriba de su página, así que lo que hay entre la de la 76 y
 * la de la 78 es de la 76 o de la 77 —la 77 abre capítulo y no la lleva—, y
 * queda marcado como «76-77» en vez de adivinar.
 */
export function paginasDeLosFragmentos(texto: string, fragmentos: string[]): Array<RangoDePaginas | null> {
  const marcas = marcasDePagina(texto)
  if (!marcas.length) return fragmentos.map(() => null)

  const rango = (posicion: number): RangoDePaginas | null => {
    let i = -1
    for (let lo = 0, hi = marcas.length - 1; lo <= hi;) {
      const mid = (lo + hi) >> 1
      if (marcas[mid].posicion <= posicion) { i = mid; lo = mid + 1 } else hi = mid - 1
    }
    if (i < 0) return null
    const siguiente = marcas[i + 1]
    return { desde: marcas[i].pagina, hasta: siguiente ? siguiente.pagina - 1 : marcas[i].pagina }
  }

  let cursor = 0
  return fragmentos.map(fragmento => {
    const inicio = texto.indexOf(fragmento, cursor)
    if (inicio < 0) return null
    cursor = inicio + fragmento.length
    const primera = rango(inicio)
    const ultima = rango(inicio + fragmento.length - 1)
    if (!primera || !ultima) return null
    return { desde: primera.desde, hasta: Math.max(primera.desde, ultima.hasta) }
  })
}

export function etiquetaDePaginas({ desde, hasta }: RangoDePaginas): string {
  return desde === hasta ? `[p. ${desde}]` : `[pp. ${desde}-${hasta}]`
}
