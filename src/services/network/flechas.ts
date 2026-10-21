/**
 * Tamaño de las flechas de sentido del caudal (#280, #282).
 *
 * Tenían tamaño fijo: en el esquema, la flecha por defecto de vis-network mide
 * 21-39 px frente a los 8 px de radio de un nudo, y con miles de tramos tapaba
 * la red entera; en el mapa no había ninguna. Se ligan al tamaño de nudo del
 * panel, así que el mismo deslizador agranda o achica nudos y flechas a la vez.
 */

/** Largo de la flecha en relación al tamaño (radio) del nudo: el diámetro. */
export const FLECHA_POR_NUDO = 2

/**
 * Lado lógico en px de la imagen de la flecha que se registra en Mapbox. Se
 * dibuja al doble (`pixelRatio: 2`) para que no salga borrosa al escalarla.
 */
export const LADO_IMAGEN_FLECHA = 32

/**
 * `icon-size` de Mapbox: el radio de los nudos del mapa es `nodeSize` px, y la
 * flecha mide `FLECHA_POR_NUDO` veces eso.
 */
export function tamanoFlechaMapa(nodeSize: number): number {
  return (FLECHA_POR_NUDO * nodeSize) / LADO_IMAGEN_FLECHA
}

/**
 * `scaleFactor` de vis-network. Allí el largo es `15 × scaleFactor + 3 × grosor`,
 * así que se descuenta el grosor del tramo para que la flecha mida lo mismo en
 * un tramo fino que en uno grueso, salvo cuando el propio grosor ya la supera.
 */
export function escalaFlechaEsquema(radioNudo: number, grosorTramo: number): number {
  const largo = FLECHA_POR_NUDO * radioNudo
  return Math.max(0.1, (largo - 3 * grosorTramo) / 15)
}
