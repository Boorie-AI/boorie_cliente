/**
 * Reproyeccion geodesica real de coordenadas (#36, #48).
 *
 * Un unico motor —proj4— para toda la aplicacion. Antes cada visor tenia su
 * propia pila de heuristicas con husos codificados a mano (Cartagena, TK-Lomas,
 * rangos de X por pais) y un `else` final que asumia UTM 18N: una red de un pais
 * no contemplado se pintaba en el Caribe colombiano sin decir nada.
 *
 * La regla de este modulo es que el EPSG es un dato declarado, no adivinado.
 * `sugerirCRS` solo afirma lo que se puede demostrar mirando las coordenadas
 * (que son geograficas), y devuelve `null` en cuanto haria falta suponer.
 */

import proj4 from 'proj4'

export const WGS84 = 'EPSG:4326'

export interface LimitesProyectados {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export interface LimitesGeograficos {
  minLon: number
  maxLon: number
  minLat: number
  maxLat: number
}

export interface EntradaCatalogo {
  epsg: string
  nombre: string
  /** Codigo ISO del pais para el que este CRS es habitual. Vacio si es global. */
  pais?: string
}

/**
 * Origen del EPSG con el que se esta pintando. La interfaz lo enseña tal cual:
 * un CRS `sugerido` no debe leerse como si el ingeniero lo hubiera confirmado.
 */
export type OrigenCRS = 'declarado' | 'sugerido' | 'desconocido'

export interface CRSResuelto {
  epsg: string | null
  origen: OrigenCRS
  /** Por que se llego a este EPSG, o por que no se pudo. Texto para la interfaz. */
  motivo: string
}

/**
 * Definiciones proj4 de los sistemas que no son UTM/WGS84 (esos se generan).
 * proj4 trae de serie EPSG:4326 y EPSG:3857; el resto hay que declararlo.
 */
const DEFINICIONES: Record<string, string> = {
  'EPSG:4326': '+proj=longlat +datum=WGS84 +no_defs',
  'EPSG:3857': '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +no_defs',
  // MAGNA-SIRGAS (Colombia), origenes nacionales
  'EPSG:3115': '+proj=tmerc +lat_0=4.596200416666666 +lon_0=-77.07750791666666 +k=1 +x_0=1000000 +y_0=1000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
  'EPSG:3116': '+proj=tmerc +lat_0=4.596200416666666 +lon_0=-74.07750791666666 +k=1 +x_0=1000000 +y_0=1000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
  'EPSG:3117': '+proj=tmerc +lat_0=4.596200416666666 +lon_0=-71.07750791666666 +k=1 +x_0=1000000 +y_0=1000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
  'EPSG:3118': '+proj=tmerc +lat_0=4.596200416666666 +lon_0=-68.07750791666666 +k=1 +x_0=1000000 +y_0=1000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
  // ETRS89 / UTM (España peninsular y Baleares)
  'EPSG:25829': '+proj=utm +zone=29 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
  'EPSG:25830': '+proj=utm +zone=30 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
  'EPSG:25831': '+proj=utm +zone=31 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
  // ED50 / UTM: cartografia española anterior a ETRS89, todavia habitual en catastro
  'EPSG:23029': '+proj=utm +zone=29 +ellps=intl +towgs84=-87,-98,-121,0,0,0,0 +units=m +no_defs',
  'EPSG:23030': '+proj=utm +zone=30 +ellps=intl +towgs84=-87,-98,-121,0,0,0,0 +units=m +no_defs',
  'EPSG:23031': '+proj=utm +zone=31 +ellps=intl +towgs84=-87,-98,-121,0,0,0,0 +units=m +no_defs',
  // Mexico ITRF2008 / LCC, sistema unico nacional
  'EPSG:6372': '+proj=lcc +lat_0=12 +lon_0=-102 +lat_1=17.5 +lat_2=29.5 +x_0=2500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
}

const NOMBRES: Record<string, { nombre: string; pais?: string }> = {
  'EPSG:4326': { nombre: 'WGS 84 — longitud/latitud' },
  'EPSG:3857': { nombre: 'WGS 84 / Pseudo-Mercator (web)' },
  'EPSG:3115': { nombre: 'MAGNA-SIRGAS / Colombia Oeste', pais: 'CO' },
  'EPSG:3116': { nombre: 'MAGNA-SIRGAS / Colombia Bogotá', pais: 'CO' },
  'EPSG:3117': { nombre: 'MAGNA-SIRGAS / Colombia Este Central', pais: 'CO' },
  'EPSG:3118': { nombre: 'MAGNA-SIRGAS / Colombia Este', pais: 'CO' },
  'EPSG:25829': { nombre: 'ETRS89 / UTM 29N', pais: 'ES' },
  'EPSG:25830': { nombre: 'ETRS89 / UTM 30N', pais: 'ES' },
  'EPSG:25831': { nombre: 'ETRS89 / UTM 31N', pais: 'ES' },
  'EPSG:23029': { nombre: 'ED50 / UTM 29N', pais: 'ES' },
  'EPSG:23030': { nombre: 'ED50 / UTM 30N', pais: 'ES' },
  'EPSG:23031': { nombre: 'ED50 / UTM 31N', pais: 'ES' },
  'EPSG:6372': { nombre: 'México ITRF2008 / LCC', pais: 'MX' },
}

/** `EPSG:32618` → `{ zona: 18, sur: false }`; `null` si no es un UTM/WGS84. */
function leerZonaUTM(epsg: string): { zona: number; sur: boolean } | null {
  const m = /^EPSG:32([67])(\d{2})$/.exec(epsg)
  if (!m) return null
  const zona = Number(m[2])
  if (zona < 1 || zona > 60) return null
  return { zona, sur: m[1] === '7' }
}

export function normalizarEPSG(valor: string): string | null {
  const limpio = valor.trim().toUpperCase().replace(/\s+/g, '')
  const m = /^(?:EPSG:)?(\d{4,6})$/.exec(limpio)
  return m ? `EPSG:${m[1]}` : null
}

/**
 * Registra la definicion en proj4 la primera vez que se pide. Los 120 husos UTM
 * se generan en lugar de escribirse: la formula es la misma para todos y una
 * tabla a mano solo aporta ocasiones de equivocarse.
 */
export function definirProyeccion(epsg: string): boolean {
  if (proj4.defs(epsg)) return true

  const fija = DEFINICIONES[epsg]
  if (fija) {
    proj4.defs(epsg, fija)
    return true
  }

  const utm = leerZonaUTM(epsg)
  if (utm) {
    proj4.defs(epsg, `+proj=utm +zone=${utm.zona}${utm.sur ? ' +south' : ''} +datum=WGS84 +units=m +no_defs`)
    return true
  }

  return false
}

export function esEPSGSoportado(epsg: string): boolean {
  return definirProyeccion(epsg)
}

export function nombreCRS(epsg: string): string {
  const conocido = NOMBRES[epsg]
  if (conocido) return conocido.nombre
  const utm = leerZonaUTM(epsg)
  if (utm) return `WGS 84 / UTM ${utm.zona}${utm.sur ? 'S' : 'N'}`
  return epsg
}

/**
 * Catalogo para el selector: los sistemas con nombre propio primero y los 120
 * husos UTM despues. El selector tambien acepta cualquier otro codigo escrito a
 * mano, asi que esta lista es una comodidad, no un limite.
 */
export function catalogoCRS(): EntradaCatalogo[] {
  const nombrados = Object.keys(NOMBRES).map(epsg => ({
    epsg,
    nombre: NOMBRES[epsg].nombre,
    pais: NOMBRES[epsg].pais,
  }))

  const utm: EntradaCatalogo[] = []
  for (const sur of [false, true]) {
    for (let zona = 1; zona <= 60; zona++) {
      const epsg = `EPSG:${sur ? 327 : 326}${String(zona).padStart(2, '0')}`
      utm.push({ epsg, nombre: `WGS 84 / UTM ${zona}${sur ? 'S' : 'N'}` })
    }
  }

  return [...nombrados, ...utm]
}

export type Transformador = (x: number, y: number) => [number, number]

/**
 * Transformador del CRS dado a WGS84. Lanza si el EPSG no se puede resolver:
 * quien pinta debe enterarse, no recibir coordenadas silenciosamente falsas.
 */
export function crearTransformador(epsg: string): Transformador {
  if (!definirProyeccion(epsg)) {
    throw new Error(`Sistema de coordenadas no soportado: ${epsg}`)
  }
  if (epsg === WGS84) return (x, y) => [x, y]

  return (x, y) => {
    const [lon, lat] = proj4(epsg, WGS84, [x, y])
    return [lon, lat]
  }
}

/** Transformador inverso, de WGS84 al CRS original. Lo usa la exportacion. */
export function crearTransformadorInverso(epsg: string): Transformador {
  if (!definirProyeccion(epsg)) {
    throw new Error(`Sistema de coordenadas no soportado: ${epsg}`)
  }
  if (epsg === WGS84) return (lon, lat) => [lon, lat]

  return (lon, lat) => {
    const [x, y] = proj4(WGS84, epsg, [lon, lat])
    return [x, y]
  }
}

/**
 * Unica afirmacion que las coordenadas sostienen por si solas: si todas caen en
 * el rango lon/lat y la red abarca menos de un grado, son geograficas. Una red
 * de abastecimiento nunca mide cientos de kilometros, asi que el segundo
 * criterio descarta un proyectado que por casualidad cayera en rango.
 */
export function pareceGeografico(limites: LimitesProyectados): boolean {
  const { minX, maxX, minY, maxY } = limites
  return (
    minX >= -180 && maxX <= 180 &&
    minY >= -90 && maxY <= 90 &&
    Math.abs(maxX - minX) < 1 && Math.abs(maxY - minY) < 1
  )
}

/**
 * Sugerencia honesta: geografico se reconoce, proyectado no.
 *
 * La X de una coordenada UTM es la distancia al meridiano central de su huso, y
 * vale lo mismo en los 60 husos: 842.913 m es un punto valido en Cartagena, en
 * Valencia y en Sídney. Deducir el huso de la X es imposible, y esa imposibilidad
 * es la causa de fondo de #48. Aqui se devuelve `null` en vez de suponer.
 */
export function sugerirCRS(limites: LimitesProyectados | null): CRSResuelto {
  if (!limites) {
    return { epsg: null, origen: 'desconocido', motivo: 'La red no trae coordenadas.' }
  }
  if (pareceGeografico(limites)) {
    return {
      epsg: WGS84,
      origen: 'sugerido',
      motivo: 'Las coordenadas están en rango de longitud/latitud.',
    }
  }
  return {
    epsg: null,
    origen: 'desconocido',
    motivo:
      'Las coordenadas están proyectadas. El valor de X no identifica el huso —el mismo número es válido en los 60—, así que el sistema debe declararlo el ingeniero.',
  }
}

/**
 * CRS con el que hay que pintar: lo declarado manda sobre lo sugerido, siempre.
 */
export function resolverCRS(
  epsgDeclarado: string | null | undefined,
  limites: LimitesProyectados | null
): CRSResuelto {
  if (epsgDeclarado) {
    const normalizado = normalizarEPSG(epsgDeclarado)
    if (normalizado && esEPSGSoportado(normalizado)) {
      return {
        epsg: normalizado,
        origen: 'declarado',
        motivo: `Declarado en el proyecto: ${nombreCRS(normalizado)}.`,
      }
    }
    return {
      epsg: null,
      origen: 'desconocido',
      motivo: `El sistema declarado (${epsgDeclarado}) no se reconoce.`,
    }
  }
  return sugerirCRS(limites)
}

/**
 * Envolventes aproximadas de los paises con los que trabaja Boorie, para avisar
 * cuando la red reproyectada cae lejos del pais declarado en el proyecto. Es una
 * comprobacion de cordura, no una validacion cartografica: una envolvente incluye
 * mar y paises vecinos, asi que solo caza el error grueso (huso equivocado, que
 * desplaza la red cientos de kilometros o la manda al hemisferio contrario).
 */
const ENVOLVENTES_PAIS: Record<string, LimitesGeograficos> = {
  MX: { minLon: -118.5, maxLon: -86.5, minLat: 14.5, maxLat: 32.8 },
  CO: { minLon: -79.1, maxLon: -66.8, minLat: -4.3, maxLat: 13.5 },
  ES: { minLon: -18.2, maxLon: 4.4, minLat: 27.6, maxLat: 43.9 },
  PE: { minLon: -81.4, maxLon: -68.6, minLat: -18.4, maxLat: -0.03 },
  CL: { minLon: -75.7, maxLon: -66.4, minLat: -56.0, maxLat: -17.5 },
  AR: { minLon: -73.6, maxLon: -53.6, minLat: -55.1, maxLat: -21.8 },
  EC: { minLon: -92.0, maxLon: -75.2, minLat: -5.0, maxLat: 1.7 },
  BO: { minLon: -69.7, maxLon: -57.5, minLat: -22.9, maxLat: -9.7 },
  BR: { minLon: -74.0, maxLon: -34.8, minLat: -33.8, maxLat: 5.3 },
  CR: { minLon: -86.0, maxLon: -82.5, minLat: 8.0, maxLat: 11.3 },
  GT: { minLon: -92.3, maxLon: -88.2, minLat: 13.7, maxLat: 17.9 },
  PT: { minLon: -31.4, maxLon: -6.2, minLat: 32.4, maxLat: 42.2 },
  US: { minLon: -125.0, maxLon: -66.9, minLat: 24.4, maxLat: 49.4 },
}

export interface Cordura {
  ok: boolean
  /** Texto para la interfaz cuando algo no cuadra; vacio cuando `ok`. */
  aviso: string
}

/**
 * Validacion posterior a reproyectar: el centroide debe caer en rango terrestre
 * y, si el proyecto declara pais, dentro de su envolvente.
 */
export function validarCordura(
  centroide: [number, number],
  pais?: string | null
): Cordura {
  const [lon, lat] = centroide

  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    return { ok: false, aviso: 'La reproyección no produjo coordenadas válidas.' }
  }
  if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
    return { ok: false, aviso: 'La red reproyectada cae fuera del planeta: el sistema declarado no puede ser el correcto.' }
  }

  const codigo = pais?.trim().toUpperCase()
  if (!codigo) return { ok: true, aviso: '' }

  const envolvente = ENVOLVENTES_PAIS[codigo]
  if (!envolvente) return { ok: true, aviso: '' }

  const dentro =
    lon >= envolvente.minLon && lon <= envolvente.maxLon &&
    lat >= envolvente.minLat && lat <= envolvente.maxLat

  if (dentro) return { ok: true, aviso: '' }

  return {
    ok: false,
    aviso: `La red cae en ${lat.toFixed(4)}, ${lon.toFixed(4)}, fuera de ${codigo}, que es el país del proyecto. Revisa el sistema de coordenadas declarado.`,
  }
}

export interface RedReproyectada {
  transformar: Transformador
  limites: LimitesGeograficos
  centroide: [number, number]
}

/**
 * Reproyecta las esquinas y el centro de la red para obtener el encuadre. No
 * recorre todos los nudos a proposito: el mapa transforma cada uno al pintarlo y
 * duplicar el trabajo en redes de decenas de miles de nudos se nota.
 */
export function reproyectarLimites(
  limites: LimitesProyectados,
  epsg: string
): RedReproyectada {
  const transformar = crearTransformador(epsg)

  const esquinas: Array<[number, number]> = [
    transformar(limites.minX, limites.minY),
    transformar(limites.maxX, limites.minY),
    transformar(limites.minX, limites.maxY),
    transformar(limites.maxX, limites.maxY),
  ]

  const lons = esquinas.map(c => c[0])
  const lats = esquinas.map(c => c[1])

  if (lons.some(v => !Number.isFinite(v)) || lats.some(v => !Number.isFinite(v))) {
    throw new Error(`La reproyección desde ${epsg} produjo coordenadas no finitas`)
  }

  return {
    transformar,
    limites: {
      minLon: Math.min(...lons),
      maxLon: Math.max(...lons),
      minLat: Math.min(...lats),
      maxLat: Math.max(...lats),
    },
    centroide: transformar(
      (limites.minX + limites.maxX) / 2,
      (limites.minY + limites.maxY) / 2
    ),
  }
}

/** Limites de una lista de nudos con coordenadas en el CRS original. */
export function calcularLimites(
  puntos: Array<{ x?: number; y?: number; coordinates?: number[] }>
): LimitesProyectados | null {
  const xs: number[] = []
  const ys: number[] = []

  for (const p of puntos) {
    const x = p.x ?? p.coordinates?.[0]
    const y = p.y ?? p.coordinates?.[1]
    if (typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)) {
      xs.push(x)
      ys.push(y)
    }
  }

  if (xs.length === 0) return null

  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  }
}
