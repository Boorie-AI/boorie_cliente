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
  /** Consultas en el idioma del documento (`consultasEnElIdiomaDelDocumento`); sólo con Ollama. */
  consultasEnElIdioma: (a: { documento: string; pregunta: string; idiomaDeLaApp: IdiomaApp; modelo: string; numCtx: number }) => Promise<string[]>
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
   */
  const historial = entrada.conversacion.map(msg => ({ ...msg, content: separarDocumentoPegado(msg.content).pregunta }))
  const vigente = [...entrada.conversacion].reverse().find(msg => msg.metadata?.adjunto)?.metadata?.adjunto
  let adjuntoUsado: UsoDelAdjunto | undefined
  let leidoDelAdjunto = ''
  let paginasDelAdjunto: RespaldoDeFuente[] = []
  if (vigente) {
    /**
     * El adjunto antes que el RAG (#201): su presupuesto se calcula sin
     * contar las fuentes, y las fuentes entran después en lo que quede.
     * Es lo que el usuario ha puesto delante para esta pregunta.
     */
    // Solo se descuenta el bloque que se puede recortar: el aviso de una
    // búsqueda fallida no tiene fuentes que quitar y se queda entero.
    const recortable = bloqueConocimiento && fuentes.length ? bloqueConocimiento : ''
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
    // El significado y las consultas solo hacen falta si hay que elegir: un documento que cabe va entero (#205).
    const hayQueElegir = estimarTokens(vigente.texto) > presupuesto
    const [similitudes, textosDeConsultas] = hayQueElegir
      ? await Promise.all([
          deps.similitudes(vigente.texto, pregunta),
          esOllama
            ? deps.consultasEnElIdioma({
                documento: vigente.texto, pregunta, idiomaDeLaApp: idioma, modelo: modeloOllama, numCtx,
              })
            : Promise.resolve([]),
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
      const caben = fuentesQueCaben(fuentes, presupuesto - estimarTokens(bloqueAdjunto),
        f => contextoDeConocimiento(f, idioma, { busquedaFallida }))
      if (caben.length < fuentes.length) {
        // Sin ninguna, el bloque se quita entero: el de «no se encontró
        // nada» le diría al modelo algo que no es verdad. Y la función
        // de reemplazo evita que un «$&» del contenido se interprete.
        const nuevo = caben.length ? contextoDeConocimiento(caben, idioma, { busquedaFallida }) : ''
        prompt = prompt.replace(bloqueConocimiento, () => nuevo)
        adjuntoUsado.fuentesOmitidas = fuentes.length - caben.length
        fuentes = caben
      }
    }
    prompt = bloqueAdjunto + prompt
    if (!seleccion.completo || adjuntoUsado.fuentesOmitidas) logger.info('Adjunto ajustado al contexto', adjuntoUsado)
  }

  // Después del adjunto, porque puede haber quitado las fuentes que pedían traducir (#201).
  prompt += cierreDeIdioma(idioma, hayQueTraducir(fuentes, idioma))

  const mensajes: ChatMessage[] = [
    ...historial.map(msg => ({ role: msg.role, content: msg.content })),
    { role: 'user', content: prompt },
  ]

  return { prompt, mensajes, historial, fuentes, adjunto: vigente, adjuntoUsado, leidoDelAdjunto, paginasDelAdjunto }
}

/** Los textos que se añaden a la respuesta, ya traducidos: la ruta no depende de i18n. */
export interface TextosDeLaRespuesta {
  noEstaEnLoLeido: string
  cortadaPorInactividad: string
  revision: TextosDeRevision
}

export interface EntradaDePosproceso {
  pregunta: string
  /** Lo que escribió el modelo, tal cual. */
  escrita: string
  finishReason?: string
  fuentes: any[]
  paginasDelAdjunto: RespaldoDeFuente[]
  leidoDelAdjunto: string
  idioma: IdiomaApp
  hayAdjunto: boolean
  /** Con un modelo local la revisión serían minutos: sólo se pide en la nube. */
  conRevision: boolean
  textos: TextosDeLaRespuesta
}

export interface DependenciasDePosproceso {
  /** Una petición al mismo modelo, sin razonar, con el prompt de revisión. */
  pedirRevision: (prompt: string) => Promise<{ success: boolean; response?: string; error?: string }>
  alEmpezarLaRevision?: () => void
}

export interface RespuestaPosprocesada {
  texto: string
  /** El texto sin el apartado de la revisión, que cita al documento: es lo que se puntúa. */
  sinRevision: string
  /** El modelo se calló a mitad (`FIN_POR_INACTIVIDAD`, #237). */
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
    entrada.escrita,
    [...fuentes.map((f: any) => ({ page: f?.page })), ...entrada.paginasDelAdjunto]
  )
  if (quitadas.length > 0) {
    logger.warn('Se han quitado referencias a páginas sin respaldo en las fuentes:', quitadas)
  }
  // Y las ecuaciones y tablas citadas que no están en nada de lo leído.
  const leido = [entrada.leidoDelAdjunto, ...fuentes.map((f: any) => f?.content ?? '')].join('\n')
  const nota = textos.noEstaEnLoLeido
  const conReferencias = marcarReferenciasSinRespaldo(sinPaginasFalsas, leido, nota)
  const { texto: response, marcadas: normas } = marcarNormasSinRespaldo(conReferencias.texto, leido, nota)
  const marcadas = [...conReferencias.marcadas, ...normas]
  if (marcadas.length > 0) {
    logger.warn('Referencias a ecuaciones, tablas o normas que no están en lo leído:', marcadas)
  }
  /**
   * Y si lo citado venía de otro idioma, se dice (#160). La regla
   * está en el prompt y nemotron-mini la ignora, así que se
   * resuelve aquí en vez de pidiéndoselo otra vez.
   */
  const respuesta = marcarLoTraducido(response, fuentes, entrada.idioma, { hayAdjunto: entrada.hayAdjunto })
  /**
   * El modelo se calló a mitad, o el servidor mandó un error con
   * texto ya recibido, y el handler entrega lo que llegó
   * (`FIN_POR_INACTIVIDAD`, #237; `FIN_POR_ERROR`, #223). Se dice
   * justo después del texto, y no se revisa: la revisión daría por
   * omitido lo que simplemente no llegó.
   */
  const cortada = entrada.finishReason === 'inactividad' || entrada.finishReason === 'error_en_el_flujo'
  let texto = cortada ? `${respuesta}\n\n---\n\n*${textos.cortadaPorInactividad}*` : respuesta
  /**
   * La segunda pasada (`revisionContraElDocumento`): sólo en la
   * nube —con un modelo local serían minutos— y cuando hay algo
   * leído contra lo que comparar. Si falla, la respuesta sale igual.
   */
  const sinRevision = texto
  let revision: { problemas: number } | undefined
  if (entrada.conRevision && !cortada && leido.trim() && (entrada.hayAdjunto || fuentes.length)) {
    deps.alEmpezarLaRevision?.()
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
