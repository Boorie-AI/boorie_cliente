/**
 * El campo `content` de las colecciones de Milvus admite 8192 (`max_length`
 * en `crearColeccion`). Una respuesta larga de NVIDIA pasa de 20 000
 * caracteres y Milvus rechazaba la inserción entera, así que el mensaje se
 * quedaba fuera de la memoria de conversaciones.
 */
export const LIMITE_CONTENT_MILVUS = 8192

const bytes = (texto: string) => Buffer.byteLength(texto, 'utf8')

/**
 * Parte el texto por párrafos en trozos que caben en el campo. Se mide en
 * bytes y no en caracteres porque el Milvus de servidor cuenta bytes, y una
 * respuesta con tildes y fórmulas ocupa bastante más de lo que mide.
 */
export function fragmentosParaMilvus(texto: string, limite = LIMITE_CONTENT_MILVUS): string[] {
  if (bytes(texto) <= limite) return [texto]

  const trozos: string[] = []
  let actual = ''
  const cerrar = () => {
    if (actual.trim()) trozos.push(actual)
    actual = ''
  }

  for (const parrafo of texto.split(/\n{2,}/)) {
    const conSeparador = actual ? `${actual}\n\n${parrafo}` : parrafo
    if (bytes(conSeparador) <= limite) {
      actual = conSeparador
      continue
    }
    cerrar()
    if (bytes(parrafo) <= limite) {
      actual = parrafo
      continue
    }
    // Un párrafo que no cabe solo se corta por caracteres, sin partir uno de
    // varios bytes por la mitad.
    for (const caracter of parrafo) {
      if (bytes(actual) + bytes(caracter) > limite) cerrar()
      actual += caracter
    }
  }
  cerrar()
  return trozos
}
