/**
 * La ruta de una pregunta del chat, sin la tienda ni el IPC (#226).
 *
 * Vivía entera dentro de `chatStore.sendMessage`, y por eso no se podía medir:
 * la batería de evaluación del RAG tiene que recorrer el mismo camino que la
 * app —qué parte del adjunto se lee, cuánto cabe, qué citas se quitan y qué se
 * revisa contra el documento— sin Electron. Lo que habla con fuera (Ollama, la
 * búsqueda, el modelo que revisa) entra por parámetro.
 */

import { contextoDeConocimiento, cierreDeIdioma, hayQueTraducir, type IdiomaApp } from '@/services/contextoConocimiento'
import {
  limpiarCitasSinRespaldo,
  paginasQueAparecenEn,
  marcarReferenciasSinRespaldo,
  marcarNormasSinRespaldo,
  type RespaldoDeFuente,
} from '@/../backend/services/hydraulic/citasSinRespaldo'
import { marcarLoTraducido } from '@/services/avisoDeTraduccion'
import { limitesDe, type LimitesDeLaApi } from '@/../backend/services/hydraulic/agentic/limitesDeModelo'
import { FIN_POR_ERROR, FIN_POR_INACTIVIDAD, FIN_POR_TIEMPO } from '@/../backend/services/ai/respuestaOpenAICompat'
import { logger } from '@/utils/logger'
import {
  type Adjunto,
  type UsoDelAdjunto,
  bloqueParaElModelo,
  estimarTokens,
  fuentesQueCaben,
  presupuestoDelAdjunto,
  seleccionarFragmentos,
  separarDocumentoPegado,
} from './adjunto'
import { promptDeRevision, problemasComprobados, apartadoDeRevision, type TextosDeRevision } from './revisionContraElDocumento'
import type { ChatMessage } from './types'

/**
 * El prompt con las fuentes del RAG delante de la pregunta.
 *
 * El bloque se devuelve aparte para poder recortarlo si hay un adjunto, que
 * tiene prioridad (#201). El cierre de idioma no va aquí: va al final de todos
 * los caminos, y por aquí sólo pasa uno (#160).
 */
export function promptConFuentes(
  pregunta: string,
  fuentes: any[],
  idioma: IdiomaApp,
  opciones: { busquedaFallida: boolean; promptPropio?: string | null }
): { prompt: string; bloqueConocimiento: string } {
  const bloqueConocimiento = contextoDeConocimiento(fuentes, idioma, { busquedaFallida: opciones.busquedaFallida })
  const propio = opciones.promptPropio ? `${opciones.promptPropio}\n\n` : ''
  return { prompt: propio + bloqueConocimiento + pregunta, bloqueConocimiento }
}

export interface MensajeDelHistorial {
  role: 'user' | 'assistant' | 'system'
  content: string
  metadata?: { adjunto?: Adjunto }
}

export interface EntradaDePeticion<M extends MensajeDelHistorial> {
  pregunta: string
  idioma: IdiomaApp
  modelo: string
  proveedor: string
  /** La conversación, con el mensaje de esta pregunta ya dentro. */
  conversacion: M[]
  /** Lo que ya lleva el prompt: contexto de red y de proyecto, fuentes y pregunta. */
  prompt: string
  fuentes: any[]
  bloqueConocimiento: string
  busquedaFallida: boolean
}

export interface DependenciasDePeticion {
  /** El `num_ctx` con que se carga un modelo de Ollama (`contextoDeOllama`). */
  contextoDeOllama: (modelo: string) => Promise<number>
  /** Ventana y salida que dio la API al probar la clave, si se guardaron (`AIModel.metadata`). */
  limitesDeLaApi?: (proveedor: string, modelo: string) => Promise<LimitesDeLaApi | undefined>
  /** Un coseno por fragmento del adjunto, o nada si no se pudo (`similitudesDelAdjunto`). */
  similitudes: (texto: string, consulta: string) => Promise<number[] | undefined>
  /**
   * Consultas en el idioma del documento (`consultasEnElIdiomaDelDocumento`). Se piden con
   * cualquier proveedor: quién las escribe —Ollama, NVIDIA por IPC o sólo el glosario— lo decide
   * quien da la dependencia (#224).
   */
  consultasEnElIdioma: (a: { documento: string; pregunta: string; idiomaDeLaApp: IdiomaApp; proveedor: string; modelo: string; numCtx: number }) => Promise<string[]>
}

export interface Peticion<M extends MensajeDelHistorial> {
  prompt: string
  mensajes: ChatMessage[]
  /** La conversación sin el documento que pegaban los mensajes de antes de #194. */
  historial: M[]
  fuentes: any[]
  adjunto?: Adjunto
  adjuntoUsado?: UsoDelAdjunto
  /** Lo que el modelo leyó del adjunto: contra esto se comprueban citas y revisión. */
  leidoDelAdjunto: string
  paginasDelAdjunto: RespaldoDeFuente[]
  /** Sin adjunto, las fuentes del RAG que no cabían en la ventana del modelo (#223). */
  fuentesOmitidasPorContexto?: number
}

/**
 * Lo que se le manda al modelo: el adjunto vigente con lo que quepa, las
 * fuentes en lo que quede y el cierre de idioma.
 */
export async function componerPeticion<M extends MensajeDelHistorial>(
  entrada: EntradaDePeticion<M>,
  deps: DependenciasDePeticion
): Promise<Peticion<M>> {
  const { pregunta, idioma, modelo, proveedor, bloqueConocimiento, busquedaFallida } = entrada
  let prompt = entrada.prompt
  let fuentes = entrada.fuentes

  /**
   * El adjunto vigente entra con lo que quepa después de todo lo demás
   * (#194). Es el de este mensaje o el último de la conversación, para
   * que se pueda seguir preguntando por él sin volver a adjuntarlo; y
   * los fragmentos se eligen otra vez con cada pregunta.
   *
   * El historial va sin el documento que pegaban los mensajes de antes
   * de #194: con él, cada turno de esas conversaciones desbordaba el
   * contexto aunque ya no se preguntara por el documento.
   *
   * Y sin la pregunta de ahora, que es el último mensaje y ya va dentro del
   * prompt: con ella el modelo recibía dos turnos de usuario seguidos, el
   * primero sin contexto (#249).
   */
  const ultimo = entrada.conversacion[entrada.conversacion.length - 1]
  const anteriores = ultimo?.role === 'user' ? entrada.conversacion.slice(0, -1) : entrada.conversacion
  const historial = anteriores.map(msg => ({ ...msg, content: separarDocumentoPegado(msg.content).pregunta }))
  const vigente = [...entrada.conversacion].reverse().find(msg => msg.metadata?.adjunto)?.metadata?.adjunto
  let adjuntoUsado: UsoDelAdjunto | undefined
  let leidoDelAdjunto = ''
  let paginasDelAdjunto: RespaldoDeFuente[] = []
  let fuentesOmitidasPorContexto: number | undefined

  /**
   * Quita las fuentes que no caben en `espacio` y devuelve cuántas quitó. Sin
   * ninguna, el bloque se quita entero: el de «no se encontró nada» le diría
   * al modelo algo que no es verdad. Y la función de reemplazo evita que un
   * «$&» del contenido se interprete.
   */
  const dejarLasQueCaben = (espacio: number): number => {
    const caben = fuentesQueCaben(fuentes, espacio, f => contextoDeConocimiento(f, idioma, { busquedaFallida }))
    if (caben.length === fuentes.length) return 0
    const nuevo = caben.length ? contextoDeConocimiento(caben, idioma, { busquedaFallida }) : ''
    prompt = prompt.replace(bloqueConocimiento, () => nuevo)
    const quitadas = fuentes.length - caben.length
    fuentes = caben
    return quitadas
  }

  // Solo se descuenta el bloque que se puede recortar: el aviso de una
  // búsqueda fallida no tiene fuentes que quitar y se queda entero.
  const recortable = bloqueConocimiento && fuentes.length ? bloqueConocimiento : ''
  /**
   * El presupuesto hace falta con un adjunto, y también sin él cuando hay
   * fuentes: con 20 fragmentos del RAG no caben en los 4096 de un modelo
   * pequeño de Ollama, y antes se mandaban igual (#223). Sin ninguna de las
   * dos cosas no se pregunta nada al modelo ni a la API.
   */
  if (vigente || recortable) {
    const resto = estimarTokens(prompt) - (recortable ? estimarTokens(recortable) : 0)
      + historial.reduce((n, msg) => n + estimarTokens(msg.content), 0)
    const esOllama = proveedor.toLowerCase() === 'ollama'
    const modeloOllama = modelo.replace(/^ollama-/, '')
    const deLaApi = esOllama
      ? { contexto: await deps.contextoDeOllama(modeloOllama) }
      : await deps.limitesDeLaApi?.(proveedor, modelo)
    const limites = limitesDe(proveedor, esOllama ? modeloOllama : modelo, deLaApi)
    const numCtx = limites.contexto
    const presupuesto = presupuestoDelAdjunto(limites, resto)

    if (vigente) {
      /**
       * El adjunto antes que el RAG (#201): su presupuesto se calcula sin
       * contar las fuentes, y las fuentes entran después en lo que quede.
       * Es lo que el usuario ha puesto delante para esta pregunta.
       */
      // El significado y las consultas solo hacen falta si hay que elegir: un documento que cabe va entero (#205).
      const hayQueElegir = estimarTokens(vigente.texto) > presupuesto
      const [similitudes, textosDeConsultas] = hayQueElegir
        ? await Promise.all([
            deps.similitudes(vigente.texto, pregunta),
            deps.consultasEnElIdioma({
              documento: vigente.texto, pregunta, idiomaDeLaApp: idioma, proveedor,
              modelo: esOllama ? modeloOllama : modelo, numCtx,
            }),
          ])
        : [undefined, []]
      const consultas = await Promise.all(textosDeConsultas.map(async texto =>
        ({ texto, similitudes: await deps.similitudes(vigente.texto, texto) })))
      const seleccion = seleccionarFragmentos(vigente.texto, pregunta, presupuesto, { similitudes, consultas })
      const bloqueAdjunto = bloqueParaElModelo(vigente, seleccion)
      leidoDelAdjunto = seleccion.texto
      /**
       * Con las páginas marcadas, sólo valen las de lo que se leyó. Sin
       * mapa —un documento sin cabeceras—, cualquier número que aparezca
       * en lo leído, que es lo único que se puede comprobar.
       */
      paginasDelAdjunto = seleccion.paginas
        ? seleccion.paginas.map(page => ({ page }))
        : paginasQueAparecenEn(seleccion.texto)
      adjuntoUsado = {
        nombre: vigente.nombre, incluidos: seleccion.incluidos, total: seleccion.total, completo: seleccion.completo,
        ...(similitudes ? { porSignificado: true } : {}),
      }

      if (recortable) {
        const quitadas = dejarLasQueCaben(presupuesto - estimarTokens(bloqueAdjunto))
        if (quitadas) adjuntoUsado.fuentesOmitidas = quitadas
      }
      prompt = bloqueAdjunto + prompt
      if (!seleccion.completo || adjuntoUsado.fuentesOmitidas) logger.info('Adjunto ajustado al contexto', adjuntoUsado)
    } else {
      const quitadas = dejarLasQueCaben(presupuesto)
      if (quitadas) {
        fuentesOmitidasPorContexto = quitadas
        logger.info('Fuentes ajustadas al contexto del modelo', { modelo, contexto: numCtx, incluidas: fuentes.length, omitidas: quitadas })
      }
    }
  }

  // Después del adjunto, porque puede haber quitado las fuentes que pedían traducir (#201).
  prompt += cierreDeIdioma(idioma, hayQueTraducir(fuentes, idioma))

  const mensajes: ChatMessage[] = [
    ...historial.map(msg => ({ role: msg.role, content: msg.content })),
    { role: 'user', content: prompt },
  ]

  return { prompt, mensajes, historial, fuentes, adjunto: vigente, adjuntoUsado, leidoDelAdjunto, paginasDelAdjunto, fuentesOmitidasPorContexto }
}

/** Los textos que se añaden a la respuesta, ya traducidos: la ruta no depende de i18n. */
export interface TextosDeLaRespuesta {
  noEstaEnLoLeido: string
  cortadaPorInactividad: string
  /** Se acabaron los tokens de salida y las continuaciones (#223). */
  cortadaPorLongitud: string
  /** Llegó el tope total de la petición, o el del chat, con texto ya recibido (#223). */
  cortadaPorTiempo: string
  revision: TextosDeRevision
}

/** Contra qué se comprueba lo que escribe el modelo: lo mismo mientras llega que al final. */
export interface ContextoDeLaRespuesta {
  fuentes: any[]
  paginasDelAdjunto: RespaldoDeFuente[]
  leidoDelAdjunto: string
  idioma: IdiomaApp
  hayAdjunto: boolean
  textos: TextosDeLaRespuesta
}

export interface EntradaDePosproceso extends ContextoDeLaRespuesta {
  pregunta: string
  /** Lo que escribió el modelo, tal cual. */
  escrita: string
  finishReason?: string
  /** Con un modelo local la revisión serían minutos: sólo se pide en la nube. */
  conRevision: boolean
}

export interface DependenciasDePosproceso {
  /** Una petición al mismo modelo, sin razonar, con el prompt de revisión. */
  pedirRevision: (prompt: string) => Promise<{ success: boolean; response?: string; error?: string }>
  /** Con el texto ya limpio, que es lo que se queda en pantalla mientras se revisa. */
  alEmpezarLaRevision?: (texto: string) => void
}

/**
 * Lo que se quita y se marca de lo escrito: las páginas sin respaldo, las
 * ecuaciones, tablas y normas que no están en lo leído y lo traducido. Es
 * igual mientras llega (`vistaParcial`) que al final (`posprocesarRespuesta`),
 * para que lo que se ve sea lo que queda.
 */
function limpiarLoEscrito(escrita: string, ctx: ContextoDeLaRespuesta) {
  const { fuentes, textos } = ctx
  /**
   * Las páginas que el modelo se invente no salen de aquí (#165).
   *
   * El chat no usa la respuesta que escribe el RAG —pide sólo las
   * fuentes, con `soloRecuperacion`— así que la limpieza que hace
   * el nodo de generación no le llega: la respuesta se escribe en
   * esta misma ruta y hay que comprobarla aquí, contra las
   * fuentes que de verdad se recuperaron.
   */
  const { texto: sinPaginasFalsas, quitadas } = limpiarCitasSinRespaldo(
    escrita,
    [...fuentes.map((f: any) => ({ page: f?.page })), ...ctx.paginasDelAdjunto]
  )
  // Y las ecuaciones y tablas citadas que no están en nada de lo leído.
  const leido = [ctx.leidoDelAdjunto, ...fuentes.map((f: any) => f?.content ?? '')].join('\n')
  const nota = textos.noEstaEnLoLeido
  const conReferencias = marcarReferenciasSinRespaldo(sinPaginasFalsas, leido, nota)
  const { texto: response, marcadas: normas } = marcarNormasSinRespaldo(conReferencias.texto, leido, nota)
  /**
   * Y si lo citado venía de otro idioma, se dice (#160). La regla
   * está en el prompt y nemotron-mini la ignora, así que se
   * resuelve aquí en vez de pidiéndoselo otra vez.
   */
  const texto = marcarLoTraducido(response, fuentes, ctx.idioma, { hayAdjunto: ctx.hayAdjunto })
  return { texto, leido, quitadas, marcadas: [...conReferencias.marcadas, ...normas] }
}

/**
 * El aviso de una respuesta que no llegó entera, o nada si llegó (#237, #223).
 *
 * El modelo se calló a mitad, el servidor mandó un error con texto ya
 * recibido, se acabaron los tokens de salida después de las continuaciones
 * o llegó el tope de tiempo. En todos, lo recibido se entrega con el aviso.
 */
export function avisoDeCorte(finishReason: string | undefined, textos: TextosDeLaRespuesta): string | null {
  switch (finishReason) {
    case FIN_POR_INACTIVIDAD:
    case FIN_POR_ERROR:
      return textos.cortadaPorInactividad
    case FIN_POR_TIEMPO:
      return textos.cortadaPorTiempo
    // OpenAI, OpenRouter y NVIDIA; Anthropic; Google.
    case 'length':
    case 'max_tokens':
    case 'MAX_TOKENS':
      return textos.cortadaPorLongitud
    default:
      return null
  }
}

/**
 * Lo que se pinta de una respuesta mientras llega (#223), con la misma
 * limpieza que al final.
 *
 * La última palabra se guarda hasta que llegue el espacio que la cierra: a
 * medias, «p. 2» de un «p. 203» sin respaldo se vería un instante antes de
 * que la limpieza la reconociera y la quitara.
 */
export function vistaParcial(escrita: string, ctx: ContextoDeLaRespuesta): string {
  const cerrada = /\s$/.test(escrita) ? escrita : escrita.slice(0, escrita.search(/\S*$/))
  return limpiarLoEscrito(cerrada, ctx).texto
}

export interface RespuestaPosprocesada {
  texto: string
  /** El texto sin el apartado de la revisión, que cita al documento: es lo que se puntúa. */
  sinRevision: string
  /** No llegó entera: se calló, se acabaron los tokens o el tiempo (`avisoDeCorte`). */
  cortada: boolean
  revision?: { problemas: number }
  /** Páginas citadas sin respaldo, ya quitadas del texto. */
  quitadas: unknown[]
  /** Ecuaciones, tablas o normas citadas que no están en lo leído, marcadas en el texto. */
  marcadas: unknown[]
}

export async function posprocesarRespuesta(
  entrada: EntradaDePosproceso,
  deps: DependenciasDePosproceso
): Promise<RespuestaPosprocesada> {
  const { fuentes, textos } = entrada
  const { texto: respuesta, leido, quitadas, marcadas } = limpiarLoEscrito(entrada.escrita, entrada)
  if (quitadas.length > 0) {
    logger.warn('Se han quitado referencias a páginas sin respaldo en las fuentes:', quitadas)
  }
  if (marcadas.length > 0) {
    logger.warn('Referencias a ecuaciones, tablas o normas que no están en lo leído:', marcadas)
  }
  const nota = textos.noEstaEnLoLeido
  /**
   * Si no llegó entera, se dice justo después del texto, y no se
   * revisa: la revisión daría por omitido lo que simplemente no llegó.
   */
  const aviso = avisoDeCorte(entrada.finishReason, textos)
  const cortada = aviso !== null
  let texto = aviso ? `${respuesta}\n\n---\n\n*${aviso}*` : respuesta
  /**
   * La segunda pasada (`revisionContraElDocumento`): sólo en la
   * nube —con un modelo local serían minutos— y cuando hay algo
   * leído contra lo que comparar. Si falla, la respuesta sale igual.
   */
  const sinRevision = texto
  let revision: { problemas: number } | undefined
  if (entrada.conRevision && !cortada && leido.trim() && (entrada.hayAdjunto || fuentes.length)) {
    deps.alEmpezarLaRevision?.(texto)
    try {
      const r = await deps.pedirRevision(promptDeRevision(entrada.pregunta, leido, respuesta))
      if (r?.success) {
        const problemas = problemasComprobados(r.response ?? '', leido, respuesta, nota)
        texto += apartadoDeRevision(problemas, textos.revision)
        revision = { problemas: problemas.length }
      } else {
        logger.warn('La revisión contra el documento falló:', r?.error)
      }
    } catch (error) {
      logger.warn('La revisión contra el documento falló:', error)
    }
  }

  return { texto, sinRevision, cortada, revision, quitadas, marcadas }
}
