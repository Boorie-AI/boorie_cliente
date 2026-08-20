/**
 * Formato de intercambio de versiones entre instalaciones de Boorie (#38).
 *
 * Un paquete lleva uno o varios estados de red congelados —los mismos que guarda
 * el historial— con lo necesario para reconstruirlos en otra máquina: los datos
 * de la red, su `.inp`, su sistema de coordenadas y de dónde salieron.
 *
 * Dos cosas que el formato hace a propósito:
 *
 * 1. **Lleva su propia versión.** Un lector futuro tiene que poder reconocer un
 *    paquete que no entiende y decirlo, en lugar de leerlo a medias.
 * 2. **Lleva una suma de comprobación.** Un fichero truncado a mitad de copia o
 *    editado a mano produce una red silenciosamente distinta de la que se exportó,
 *    y eso en un modelo hidráulico no se nota hasta que alguien toma una decisión
 *    con él.
 */

import { createHash } from 'node:crypto'

/** Cambiar esto sólo cuando el formato deje de ser compatible hacia atrás. */
export const FORMATO = 'boorie.red/1'

export interface RedExportada {
  nombre: string
  filename: string
  versionNumber: number
  changeNote?: string
  creadaEl: string
  /** De dónde salió, para poder rastrearla sin reutilizar sus identificadores. */
  origen: {
    networkId: string
    versionId: string
    proyecto?: string
  }
  networkData: unknown
  fileContent: string
  coordinateSystem?: unknown
  summary: unknown
}

export interface ContenidoPaquete {
  /** Etiqueta del conjunto, p. ej. el nombre de la instantánea. */
  etiqueta?: string
  redes: RedExportada[]
}

export interface Paquete {
  formato: string
  generadoPor: string
  generadoEl: string
  suma: string
  contenido: ContenidoPaquete
}

/**
 * Suma del contenido. Se calcula sobre el JSON con las claves ordenadas: sin eso,
 * dos serializaciones del mismo contenido darían sumas distintas y la
 * comprobación fallaría por un motivo que no es el que busca.
 */
export function sumaDe(contenido: ContenidoPaquete): string {
  return createHash('sha256').update(estable(contenido)).digest('hex')
}

function estable(valor: unknown): string {
  if (valor === null || typeof valor !== 'object') return JSON.stringify(valor) ?? 'null'
  if (Array.isArray(valor)) return `[${valor.map(estable).join(',')}]`

  const objeto = valor as Record<string, unknown>
  // Las claves con `undefined` se descartan, igual que hace `JSON.stringify`.
  // Contarlas rompía la ida y vuelta: un paquete sin sistema de coordenadas se
  // guardaba sin esa clave y, al releerlo, la suma ya no cuadraba con la del
  // objeto que la tenía puesta a `undefined`.
  const claves = Object.keys(objeto).filter(k => objeto[k] !== undefined).sort()
  return `{${claves.map(k => `${JSON.stringify(k)}:${estable(objeto[k])}`).join(',')}}`
}

export function construirPaquete(
  contenido: ContenidoPaquete,
  meta: { generadoPor: string; generadoEl: string }
): Paquete {
  return {
    formato: FORMATO,
    generadoPor: meta.generadoPor,
    generadoEl: meta.generadoEl,
    suma: sumaDe(contenido),
    contenido,
  }
}

export type Validacion =
  | { ok: true; paquete: Paquete }
  | { ok: false; error: string }

/**
 * Lee y comprueba un paquete. Devuelve el motivo en lenguaje llano cuando falla,
 * porque quien importa un fichero que no vale necesita saber si está roto, si es
 * de otra versión de Boorie o si sencillamente no es un paquete.
 */
export function validarPaquete(texto: string): Validacion {
  let bruto: unknown
  try {
    bruto = JSON.parse(texto)
  } catch {
    return { ok: false, error: 'El fichero no es un paquete de Boorie: no se puede leer como JSON.' }
  }

  const p = bruto as Partial<Paquete>
  if (!p || typeof p !== 'object' || typeof p.formato !== 'string') {
    return { ok: false, error: 'El fichero no declara ser un paquete de Boorie.' }
  }

  if (p.formato !== FORMATO) {
    return {
      ok: false,
      error: `Este paquete es del formato «${p.formato}» y esta versión de Boorie lee «${FORMATO}». Actualiza Boorie para abrirlo.`,
    }
  }

  const contenido = p.contenido
  if (!contenido || !Array.isArray(contenido.redes) || contenido.redes.length === 0) {
    return { ok: false, error: 'El paquete no contiene ninguna red.' }
  }

  for (const red of contenido.redes) {
    const falta = ['nombre', 'filename', 'networkData', 'fileContent', 'summary'].find(
      c => (red as unknown as Record<string, unknown>)[c] === undefined
    )
    if (falta) {
      return { ok: false, error: `Al paquete le falta «${falta}» en la red «${red?.nombre ?? '?'}».` }
    }
    if (typeof red.versionNumber !== 'number') {
      return { ok: false, error: `La red «${red.nombre}» no declara número de versión.` }
    }
  }

  if (typeof p.suma !== 'string' || p.suma !== sumaDe(contenido)) {
    return {
      ok: false,
      error:
        'El contenido no coincide con su suma de comprobación: el fichero se ha copiado a medias o se ha editado. No se importa nada.',
    }
  }

  return { ok: true, paquete: p as Paquete }
}

/** Resumen del paquete para poder enseñar qué trae antes de importarlo. */
export function describirPaquete(p: Paquete): string {
  const n = p.contenido.redes.length
  const redes = n === 1 ? '1 red' : `${n} redes`
  const etiqueta = p.contenido.etiqueta ? `«${p.contenido.etiqueta}», ` : ''
  return `${etiqueta}${redes}, exportado por ${p.generadoPor}`
}
