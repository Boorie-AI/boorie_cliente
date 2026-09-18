/**
 * Decir que una cita viene traducida, sin pedírselo al modelo (#160).
 *
 * La instrucción está escrita en las reglas del contexto desde que se arregló
 * el idioma de la respuesta, y con `nemotron-mini` no basta: medido en la
 * aplicación, con las tres fuentes marcadas «en inglés» y la regla delante, la
 * respuesta salía en castellano y sin una palabra sobre que el original no lo
 * estaba. Pedírselo más fuerte compite por la atención con las reglas que sí
 * cumple, así que esto se resuelve después de escribir.
 *
 * Importa porque una cifra sacada de un texto en inglés y servida en castellano
 * sin avisar es una cita que el lector no puede contrastar: va al documento
 * buscando esas palabras y no están.
 *
 * Dos formas de decirlo, por orden de preferencia:
 *
 *  1. Pegado a la marca de la fuente —«(F2, traducido del inglés)»— cuando el
 *     modelo ha usado la marca, que es donde el lector la va a leer.
 *  2. Y si no la ha usado —cosa que hace la mitad de las veces: cita por el
 *     título del libro y se olvida de la marca—, una línea al final. Menos fina,
 *     pero dicha.
 */

import type { FuenteConocimiento, IdiomaApp } from './contextoConocimiento'
import { marcaDeFuente, nombreDeIdioma } from './contextoConocimiento'

/** El idioma de la fuente, si difiere del de la respuesta. */
function idiomaAjeno(fuente: FuenteConocimiento, idioma: IdiomaApp): string | undefined {
  if (!fuente.language) return undefined
  const suyo = fuente.language.toLowerCase().split('-')[0]
  return suyo === idioma ? undefined : suyo
}

/**
 * Ya lo dice el propio texto.
 *
 * Si el modelo sí obedeció —pasa con los modelos grandes— no se le añade una
 * segunda advertencia encima de la suya.
 */
function yaAvisa(texto: string): boolean {
  return /\btraduci/i.test(texto)
}

export function marcarLoTraducido(
  texto: string,
  fuentes: FuenteConocimiento[],
  idioma: IdiomaApp = 'es',
): string {
  if (!texto) return texto

  const ajenas = fuentes
    .map((fuente, i) => ({ marca: marcaDeFuente(i), lengua: idiomaAjeno(fuente, idioma) }))
    .filter((f): f is { marca: string; lengua: string } => Boolean(f.lengua))

  if (ajenas.length === 0 || yaAvisa(texto)) return texto

  let salida = texto
  let algunaMarcada = false

  for (const { marca, lengua } of ajenas) {
    const nota = `traducido del ${nombreDeIdioma(lengua)}`
    // Sólo la primera aparición de cada marca: repetir la coletilla en cada
    // cita convierte el aviso en ruido y deja de leerse.
    const entreParentesis = new RegExp(`\\(([^()]*\\b${marca}\\b[^()]*)\\)`)
    if (entreParentesis.test(salida)) {
      salida = salida.replace(entreParentesis, (_, dentro: string) => `(${dentro}, ${nota})`)
      algunaMarcada = true
      continue
    }

    const suelta = new RegExp(`\\b${marca}\\b`)
    if (suelta.test(salida)) {
      salida = salida.replace(suelta, `${marca} (${nota})`)
      algunaMarcada = true
    }
  }

  if (algunaMarcada) return salida

  // Nadie usó las marcas: se dice una vez al final, nombrando los idiomas que
  // haya —lo normal es uno— para que el aviso sea concreto y no un genérico.
  const lenguas = [...new Set(ajenas.map(a => nombreDeIdioma(a.lengua)))]
  return `${salida.trimEnd()}\n\nLas fuentes consultadas están en ${lenguas.join(' y ')}: lo anterior es traducción.`
}
