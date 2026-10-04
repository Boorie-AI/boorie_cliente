/**
 * Las líneas de una respuesta NDJSON en streaming (la de `/api/chat` de Ollama),
 * ya enteras.
 *
 * La red no respeta los saltos de línea: una línea JSON puede llegar partida
 * entre dos lecturas, y un carácter de varios bytes («ñ», «²») también. Partir
 * cada lectura por su cuenta perdía las dos mitades (#252). Lo que queda tras
 * el último salto espera a la lectura siguiente, y al terminar se vacía.
 */
export async function* lineasNdjson(lector: { read(): Promise<{ done: boolean; value?: Uint8Array }> }): AsyncGenerator<string> {
  const decodificador = new TextDecoder()
  let pendiente = ''
  for (;;) {
    const { done, value } = await lector.read()
    if (done) break
    pendiente += decodificador.decode(value, { stream: true })
    let salto: number
    while ((salto = pendiente.indexOf('\n')) >= 0) {
      const linea = pendiente.slice(0, salto).trim()
      pendiente = pendiente.slice(salto + 1)
      if (linea) yield linea
    }
  }
  pendiente += decodificador.decode()
  for (const linea of pendiente.split('\n')) if (linea.trim()) yield linea.trim()
}
