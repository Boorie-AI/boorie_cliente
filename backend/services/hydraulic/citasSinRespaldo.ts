/**
 * Quita de la respuesta las páginas que el modelo se inventa.
 *
 * La regla de no citar una página que no esté entre las fuentes lleva escrita
 * en el prompt desde el #160, y el modelo local se la salta: medido en la
 * aplicación, con un libro cuya única fuente recuperada no traía número de
 * página, la respuesta salió citando «[Fuente: 1.4 Engineering Hydrology,
 * K. Subramanya, página X]». Una página inventada es peor que ninguna: quien
 * lee la cita va a buscarla y el dato no está ahí, así que la respuesta deja de
 * ser contrastable justo donde parecía serlo.
 *
 * Por eso esto no es más texto en el prompt. Es una comprobación después de
 * escribir, contra lo que las fuentes dicen de verdad: lo que no está
 * respaldado se borra, y la cita se queda sin ese detalle, que es exactamente
 * lo que la regla pedía.
 *
 * Es conservador a propósito. Sólo toca una referencia a página que vaya
 * seguida de un número o de una letra suelta —«página 96», «page 12»,
 * «página X»—, que es la forma en la que se citan. «En la página siguiente» o
 * «la página web» no encajan en el patrón y no se tocan: borrar prosa legítima
 * para arreglar una cita sería cambiar un error visible por uno invisible.
 */

export interface RespaldoDeFuente {
  /** La página que declara la fuente, si la declara. */
  page?: number | string | null
}

/**
 * Las páginas que las fuentes respaldan de verdad.
 *
 * Se normalizan a texto porque llegan de dos sitios —la metainformación del
 * fragmento y la base— y unas veces son número y otras cadena.
 */
function paginasConRespaldo(fuentes: RespaldoDeFuente[]): Set<string> {
  const paginas = new Set<string>()
  for (const fuente of fuentes) {
    if (fuente.page === undefined || fuente.page === null || fuente.page === '') continue
    const n = Number(fuente.page)
    // La página 0 es la de un documento mal indexado: no respalda nada, igual
    // que en `identidadDeFuente`, donde tampoco se enseña.
    if (Number.isFinite(n) && n > 0) paginas.add(String(n))
  }
  return paginas
}

/**
 * «página 96», «pág. 12», «page 4», «p. 7» y la variante que motivó todo esto:
 * «página X», con una letra suelta de hueco sin rellenar.
 *
 * Lo que va delante —una coma, un punto y coma o un paréntesis de apertura— se
 * captura para poder borrarlo con la referencia y no dejar «, ]» detrás.
 */
const REFERENCIA = /(\s*[,;]?\s*\(?\s*)(?:páginas?|págs?\.?|pages?|pp?\.)\s*([0-9]{1,5}|[A-Za-zÁÉÍÓÚÑ])\b(\s*\)?)/gi

/** Lo que queda después de borrar: puntuación huérfana y espacios de más. */
function recomponer(texto: string): string {
  return texto
    .replace(/\(\s*\)/g, '')
    .replace(/\[\s*,/g, '[')
    .replace(/,\s*([)\]])/g, '$1')
    .replace(/\s+([,;.)\]])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
}

/**
 * Devuelve el texto sin las páginas que ninguna fuente respalda, y cuáles eran.
 *
 * Se devuelven las quitadas para poder dejarlas en el log: si un modelo empieza
 * a inventarse páginas a menudo, eso se tiene que poder ver sin leerse las
 * respuestas una a una.
 */
export function limpiarCitasSinRespaldo(
  texto: string,
  fuentes: RespaldoDeFuente[]
): { texto: string; quitadas: string[] } {
  if (!texto) return { texto, quitadas: [] }

  const respaldadas = paginasConRespaldo(fuentes)
  const quitadas: string[] = []

  const limpio = texto.replace(REFERENCIA, (entera, antes: string, pagina: string, despues: string) => {
    if (respaldadas.has(String(Number(pagina)))) return entera

    quitadas.push(entera.trim())
    // Si la referencia venía entre paréntesis propios, se va con ellos; si
    // venía pegada a una coma dentro de una cita más larga, se va la coma.
    const abria = antes.includes('(')
    const cerraba = despues.includes(')')
    return abria && cerraba ? '' : (antes.includes(',') || antes.includes(';') ? '' : ' ')
  })

  return { texto: recomponer(limpio), quitadas }
}
