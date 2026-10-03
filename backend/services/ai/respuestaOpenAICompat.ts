/**
 * La respuesta de un /chat/completions compatible con OpenAI: en streaming con
 * límite por inactividad, y continuada cuando corta por longitud.
 *
 * Vivía dentro de `chat.handler.ts`; está aparte para que la batería de
 * evaluación del RAG (#226) hable con NVIDIA igual que el chat, sin Electron.
 */

/**
 * Cuántas veces se le pide al modelo que siga cuando corta por `max_tokens`.
 * Con NVIDIA el razonamiento de nemotron gasta parte del tope sin que se vea, y
 * los informes largos llegaban partidos a media frase. Es el último recurso:
 * continuar cuesta reenviar el prompt entero y la costura se nota, así que lo
 * primero es que el tope alcance (ver `sendNvidiaMessage`).
 */
export const MAX_CONTINUACIONES = 2

/**
 * Con un «sigue donde lo dejaste» a secas, nemotron abría un título
 * «Continuación del procedimiento…» y volvía a escribir media respuesta. Citarle
 * el final exacto le da un punto de enganche que no tiene que adivinar.
 */
export function pedirContinuacion(previo: string): string {
  return 'Te has quedado a medias. Tu respuesta termina exactamente así:\n\n'
    + `«…${previo.slice(-300)}»\n\n`
    + 'Escribe sólo lo que va justo después de ese final: sin título, sin introducción, sin repetir lo que ya está escrito.'
}

/** Un encabezado de «Continuación…» con el que el modelo retoma aunque se le pida que no. */
const ENCABEZADO_DE_CONTINUACION = /^\s*(?:#{1,6}\s*)?[*_([]*\s*(?:continuaci[oó]n?|continuing|continued)\b[^\n]*\n+/i

/** El `finish_reason` de una respuesta que se cortó porque el servidor dejó de mandar datos. */
export const FIN_POR_INACTIVIDAD = 'inactividad'

/**
 * Una respuesta de /chat/completions recibida en streaming, con un límite por
 * inactividad en lugar de uno total.
 *
 * Con el límite total de 240 s, nemotron-3-ultra se cortaba a punto de acabar:
 * la misma pregunta sobre el libro de Walton tardó 122 s por la mañana y 250 s
 * por la tarde, con datos llegando desde el segundo 3 —el razonamiento hasta el
 * 96 y el texto después—. Lo que hay que vigilar es que el servidor siga
 * mandando algo, no cuánto tarda en total. El tope total queda como red por si
 * el servidor no para nunca.
 *
 * Devuelve lo mismo que la respuesta sin streaming, para que el resto del
 * bucle —continuación, tokens, metadatos— no cambie.
 *
 * Si se calla después de haber mandado texto, lo recibido se entrega con
 * `finish_reason: FIN_POR_INACTIVIDAD` en vez de lanzar: con una respuesta
 * larga, tirarla y repetir la pregunta entera era perder minutos para volver
 * a esperar lo mismo (#237). Sin texto —sólo razonamiento o nada— sigue
 * lanzando, y el chat reintenta.
 */
export async function leerRespuestaEnStreaming(
  respuesta: { body: any },
  controlador: AbortController,
  inactividadMs: number,
  mensajeDeInactividad: string
): Promise<any> {
  let contenido = ''
  let fin: string | undefined
  let usage: any
  let modelo: string | undefined
  let creado: number | undefined
  const callado = await leerEventos(respuesta, controlador, inactividadMs, mensajeDeInactividad, evento => {
    modelo = evento.model ?? modelo
    creado = evento.created ?? creado
    if (evento.usage) usage = evento.usage
    const eleccion = evento.choices?.[0]
    if (eleccion?.delta?.content) contenido += eleccion.delta.content
    if (eleccion?.finish_reason) fin = eleccion.finish_reason
  }, () => !!contenido)
  return {
    model: modelo,
    created: creado,
    usage: usage ?? {},
    choices: [{ finish_reason: callado ? FIN_POR_INACTIVIDAD : fin, message: { role: 'assistant', content: contenido } }],
  }
}

/**
 * Lo mismo para `POST /v1/messages` de Anthropic con `stream: true` (#246).
 * Devuelve la forma de la respuesta sin streaming, con sólo los bloques de
 * texto: el streaming va en las vueltas sin herramientas.
 */
export async function leerAnthropicEnStreaming(
  respuesta: { body: any },
  controlador: AbortController,
  inactividadMs: number,
  mensajeDeInactividad: string
): Promise<any> {
  let texto = ''
  let fin: string | undefined
  let modelo: string | undefined
  const usage = { input_tokens: 0, output_tokens: 0 }
  const callado = await leerEventos(respuesta, controlador, inactividadMs, mensajeDeInactividad, evento => {
    switch (evento.type) {
      case 'message_start':
        modelo = evento.message?.model ?? modelo
        usage.input_tokens = evento.message?.usage?.input_tokens ?? 0
        break
      case 'content_block_delta':
        if (evento.delta?.type === 'text_delta') texto += evento.delta.text ?? ''
        break
      case 'message_delta':
        fin = evento.delta?.stop_reason ?? fin
        usage.output_tokens = evento.usage?.output_tokens ?? usage.output_tokens
        break
      case 'error':
        throw new Error(`Anthropic stream error: ${evento.error?.message ?? evento.error?.type ?? 'unknown'}`)
    }
  }, () => !!texto)
  return {
    model: modelo,
    stop_reason: callado ? FIN_POR_INACTIVIDAD : fin,
    usage,
    content: [{ type: 'text', text: texto }],
  }
}

/** Y para `:streamGenerateContent?alt=sse` de Google (#246). */
export async function leerGoogleEnStreaming(
  respuesta: { body: any },
  controlador: AbortController,
  inactividadMs: number,
  mensajeDeInactividad: string
): Promise<any> {
  let texto = ''
  let fin: string | undefined
  let usageMetadata: any
  const callado = await leerEventos(respuesta, controlador, inactividadMs, mensajeDeInactividad, evento => {
    const candidato = evento.candidates?.[0]
    for (const parte of candidato?.content?.parts ?? []) {
      // Las partes de razonamiento no son respuesta.
      if (typeof parte.text === 'string' && !parte.thought) texto += parte.text
    }
    if (candidato?.finishReason) fin = candidato.finishReason
    if (evento.usageMetadata) usageMetadata = evento.usageMetadata
  }, () => !!texto)
  return {
    candidates: [{ finishReason: callado ? FIN_POR_INACTIVIDAD : fin, content: { parts: [{ text: texto }] } }],
    usageMetadata: usageMetadata ?? {},
  }
}

/**
 * El bucle común de las tres: lee las líneas `data:` de un SSE con un límite
 * por inactividad y devuelve si se cortó por silencio con texto ya recibido.
 */
async function leerEventos(
  respuesta: { body: any },
  controlador: AbortController,
  inactividadMs: number,
  mensajeDeInactividad: string,
  alEvento: (evento: any) => void,
  hayTexto: () => boolean
): Promise<boolean> {
  let temporizador: ReturnType<typeof setTimeout> | undefined
  let callado = false
  const vigilar = () => {
    clearTimeout(temporizador)
    temporizador = setTimeout(() => {
      callado = true
      controlador.abort(new Error(mensajeDeInactividad))
    }, inactividadMs)
  }
  vigilar()
  const lector = respuesta.body.getReader()
  const decodificador = new TextDecoder()
  let pendiente = ''
  try {
    for (;;) {
      const { done, value } = await lector.read()
      if (done) break
      vigilar()
      pendiente += decodificador.decode(value, { stream: true })
      let salto: number
      while ((salto = pendiente.indexOf('\n')) >= 0) {
        const linea = pendiente.slice(0, salto).trim()
        pendiente = pendiente.slice(salto + 1)
        if (!linea.startsWith('data:')) continue
        const datos = linea.slice(5).trim()
        if (datos === '[DONE]') continue
        let evento: any
        try { evento = JSON.parse(datos) } catch { continue }
        alEvento(evento)
      }
    }
    return false
  } catch (error) {
    // Sólo el silencio del servidor conserva lo parcial; el tope total y un
    // fallo de red siguen como antes: error, y el chat reintenta.
    if (!callado || !hayTexto()) {
      // El lector rechaza con el motivo del abort; ese es el mensaje que sirve.
      const motivo = controlador.signal.reason
      throw motivo instanceof Error ? motivo : error
    }
    return true
  } finally {
    clearTimeout(temporizador)
  }
}

/**
 * Une un trozo con el siguiente. Aunque se le pide que no repita, el modelo
 * suele retomar con unos puntos suspensivos y las últimas palabras del trozo
 * anterior —«potencia,…medidor de potencia,»—, o con un título de
 * «Continuación», así que se quitan. El solape mínimo es de unos caracteres
 * para no comerse una coincidencia casual.
 */
export function unirContinuacion(previo: string, siguiente: string): string {
  const sinPuntos = siguiente.replace(ENCABEZADO_DE_CONTINUACION, '').replace(/^\s*(?:…|\.{3})/, '')
  for (let k = Math.min(sinPuntos.length, previo.length, 400); k >= 8; k--) {
    if (previo.endsWith(sinPuntos.slice(0, k))) return previo + sinPuntos.slice(k)
  }
  return previo + sinPuntos
}

/**
 * Lo que se le pide a NVIDIA para redactar, igual en el chat y en la batería.
 *
 * Medido con nemotron-3-super: 4096 tokens en 56 s. Con 4096 las respuestas
 * largas se cortaban y había que continuar, y la costura se notaba; 8192 caben
 * de sobra en 240 s. La temperatura baja de 0,5 a 0,2 porque aquí se responde
 * sobre documentos y normas, no se redacta: con más, nemotron-3-ultra rellenaba
 * con páginas y referencias de memoria. `/no_think` en el sistema no hace nada
 * con nemotron-3; `enable_thinking: false` sí (comprobado: 0 tokens de
 * razonamiento).
 */
export function cuerpoNvidia(sinRazonar?: boolean): Record<string, unknown> {
  return {
    max_tokens: 8192, temperature: 0.2, top_p: 1,
    ...(sinRazonar ? { chat_template_kwargs: { enable_thinking: false } } : {}),
  }
}

/** En streaming `totalMs` es sólo la red de seguridad; lo que corta es la inactividad. */
export const LIMITES_NVIDIA = { totalMs: 600000, inactividadMs: 90000 }
