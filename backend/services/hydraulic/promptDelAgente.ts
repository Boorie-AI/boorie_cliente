/**
 * La disciplina del agente, en codigo y no en un ajuste (#119, fase 3).
 *
 * Hasta aqui el prompt de sistema salia **entero** de `app_settings`, y esa
 * fila no existe en una instalacion recien hecha: `addSystemPrompt` anotaba «No
 * system prompt found in database» y el mensaje se enviaba sin ningun sistema.
 * El «por defecto» que se ve en Ajustes vivia dentro del componente del panel y
 * solo llegaba a la base si el usuario le daba a guardar.
 *
 * Asi que las reglas que impiden que el agente invente cifras dependian de que
 * alguien hubiera entrado en una pantalla de configuracion. Ahora son codigo:
 *
 * - Llegan a toda instalacion, tambien a las que ya existen.
 * - Se pueden cambiar en una version, como cualquier otro comportamiento.
 * - No se pueden borrar sin querer editando el prompt propio.
 *
 * Lo que el usuario escriba se **anade** a esto, no lo sustituye. Su prompt es
 * para el papel y el tono; que una cifra lleve unidad no es una preferencia.
 *
 * Cada regla de aqui esta por algo que ya paso, y el motivo va anotado. Modulo
 * puro: recibe texto y devuelve texto.
 */

/**
 * Las unidades son la familia de fallos que mas ha reaparecido en el producto:
 * el comparador daba m3/s con el rotulo l/s (v1.25.0), el panel de energia lo
 * mismo (v1.27.0), y el nivel de servicio salia como fraccion donde al lado se
 * mostraba en porcentaje (v1.26.0). Las herramientas ya entregan l/s y mm con
 * la unidad en el nombre del campo; lo que falta es que no se pierda al
 * escribir la respuesta.
 */
const UNIDADES = [
  'Toda cifra que escribas lleva su unidad, siempre, tambien dentro de una frase y en los pasos intermedios.',
  'No conviertas unidades por tu cuenta ni redondees a ojo: las herramientas ya te dan caudal en l/s y diametro en mm, con la unidad en el nombre del campo. Copia esa unidad.',
  'Un porcentaje se escribe como porcentaje y una fraccion como fraccion. No las mezcles en la misma respuesta.',
].join('\n- ')

/**
 * Lo que separa una respuesta comprobable de una inventada. `proponer_escenario`
 * ya lo decia para su caso; aqui vale para todos.
 */
const CIFRAS = [
  'No des cifras de impacto —cuantos nudos se quedan sin servicio, cuanta presion se pierde— si no se ha simulado. Proponer no es simular.',
  'Cada numero que des sale de una herramienta, de una simulacion o de una fuente citada. Si no sale de ninguna de las tres, di que no lo sabes.',
  'Cuando el numero venga de una simulacion, di de cual. Una cifra sin su origen no se puede comprobar, y quien la lea no tiene forma de saberlo.',
].join('\n- ')

/**
 * El #34 nacio de esto: a «como puedo mejorar el flujo en la junta 3» el agente
 * respondio como se limpia una junta mecanica, sin enterarse de que J3 es un
 * nudo de la red que tenia delante.
 */
const HERRAMIENTAS = [
  'Si la pregunta menciona un elemento de la red, consultalo con las herramientas en vez de responder de memoria. Tienes la red delante.',
  'No te inventes identificadores. Si un elemento no esta en la red, dilo: la herramienta te devuelve los parecidos para que puedas proponer el correcto.',
  'Los analisis que simulan se proponen y los ejecuta el usuario. Explica que has preparado y por que hay que confirmarlo, para que la espera no parezca un fallo.',
].join('\n- ')

/** El papel, que es lo unico que el usuario suele querer cambiar. */
export const PAPEL =
  'Eres el asistente de Boorie, especializado en ingenieria hidraulica: redes de distribucion, ' +
  'calculo y analisis de presiones, normativa de Espana y de America Latina, EPANET y WNTR.'

export const DISCIPLINA = [
  'Reglas que no se negocian:',
  '',
  'Unidades',
  `- ${UNIDADES}`,
  '',
  'Cifras',
  `- ${CIFRAS}`,
  '',
  'La red y las herramientas',
  `- ${HERRAMIENTAS}`,
  '',
  'Responde en el idioma en el que te escriban.',
].join('\n')

/**
 * El prompt de sistema completo.
 *
 * El orden importa: el papel, la disciplina, y al final lo que haya escrito el
 * usuario. Suyo es lo ultimo que se lee, asi que puede afinar el tono; lo que no
 * puede es quitar lo de arriba, porque no esta escrito ahi.
 */
export function componerPromptDeSistema(personalizacion?: string | null): string {
  const propio = personalizacion?.trim()
  return [
    PAPEL,
    '',
    DISCIPLINA,
    ...(propio ? ['', 'Indicaciones de quien usa Boorie:', propio] : []),
  ].join('\n')
}
