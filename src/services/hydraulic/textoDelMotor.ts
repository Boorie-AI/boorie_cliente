/**
 * Un texto que produce el motor, dicho en el idioma de quien lo lee (#96).
 *
 * El motor corre en el proceso principal y no sabe —ni debe saber— en qué
 * idioma está la interfaz: devuelve la clave del diccionario y los datos que
 * van dentro. Aquí se convierte en una frase.
 *
 * `listas` existe para el único caso que lo necesita: una recomendación que
 * enumera varias bombas. Cada trozo es a su vez un texto del motor, se traduce
 * igual y se pegan con `; `, que es como se leía antes de traducirlo.
 */
export interface TextoDelMotor {
  clave: string
  datos?: Record<string, string | number>
  listas?: Record<string, TextoDelMotor[]>
}

type Traductor = (clave: string, datos?: Record<string, unknown>) => string

export function decirTexto(t: Traductor, texto: TextoDelMotor): string {
  const datos: Record<string, unknown> = { ...(texto.datos ?? {}) }
  for (const [nombre, trozos] of Object.entries(texto.listas ?? {})) {
    datos[nombre] = trozos.map(trozo => decirTexto(t, trozo)).join('; ')
  }
  return t(texto.clave, datos)
}
