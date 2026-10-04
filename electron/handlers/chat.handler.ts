// Chat Handler - IPC handlers for chat and AI provider API calls
import { ipcMain } from 'electron'
import { createLogger } from '../../backend/utils/logger'
import { DatabaseService } from '../../backend/services'
import * as os from 'os'
import * as path from 'path'
import { promises as fs } from 'fs'
import { randomUUID } from 'crypto'
import {
  HERRAMIENTAS,
  ejecutarHerramienta,
  type ContextoHerramientas,
  type RedCompleta,
} from '../../backend/services/hydraulic/agentTools'
import { WNTRResilienceService } from '../../backend/services/hydraulic/resilienceService'
import { componerPromptDeSistema, type ModelosEnUso } from '../../backend/services/hydraulic/promptDelAgente'
import { contextoDeOllama } from '../../backend/services/contextoDeOllama'
import {
  limitesDe,
  limitesDeLaNube,
  limitesGuardados,
  type LimitesDeLaNube,
} from '../../backend/services/hydraulic/agentic/limitesDeModelo'
import { detectarIntencionEscenario, detectarIntencionEnergia } from '../../backend/services/hydraulic/intencionEscenario'
import { esLocal, hayConsentimiento, SIN_CONSENTIMIENTO } from '../../backend/services/security/consentimientoNube'

/**
 * La red activa tal como la usan las herramientas, con su identificador (#44).
 *
 * El id viaja junto a los datos porque la propuesta de escenario tiene que decir
 * sobre qué red se simularía: la interfaz registra la ejecución en esa red para
 * que la cifra sea rastreable, y adivinarla desde el renderer sería otra fuente
 * de verdad que puede discrepar de la que el agente tuvo delante.
 */
interface RedParaHerramientas {
  id: string
  datos: RedCompleta
  /** El `.inp` de esa misma red, para los motores que lo necesitan (#119). */
  inp: string
}
import { leerRedActiva } from '../../backend/services/hydraulic/redActiva'
import {
  MAX_CONTINUACIONES,
  FIN_POR_INACTIVIDAD,
  cuerpoNvidia,
  leerRespuestaEnStreaming,
  leerAnthropicEnStreaming,
  leerGoogleEnStreaming,
  pedirContinuacion,
  unirContinuacion,
  unirContinuacionParcial,
  type AlTexto,
} from '../../backend/services/ai/respuestaOpenAICompat'
import { limitarFrecuencia } from '../../backend/services/ai/limitarFrecuencia'
import { URL_NVIDIA } from '../../backend/services/ai/pruebaNvidia'
export { FIN_POR_INACTIVIDAD, leerRespuestaEnStreaming, pedirContinuacion, unirContinuacion }

import {
  esErrorDeHerramientas,
  herramientasAnthropic,
  herramientasOpenAI,
  llamadasDesdeAnthropic,
  llamadasDesdeOpenAI,
  llamadasDesdeOllama,
  proveedorSoportaHerramientas,
  mensajeResultadosAnthropic,
  mensajesResultadosOpenAI,
  textoDesdeAnthropic,
  type LlamadaHerramienta,
} from '../../backend/services/ai/toolWire'
// Import types
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface ChatResponse {
  response: string
  metadata: any
}

export interface ChatProvider {
  name: string
  supportsStreaming: boolean
  sendMessage(
    model: string,
    messages: ChatMessage[],
    apiKey: string,
    onStream?: (chunk: string) => void
  ): Promise<ChatResponse>
}

const logger = createLogger('ChatHandler')

/** El mismo motor que usan los paneles; aqui se le da de comer otra ruta. */
const resilienceService = new WNTRResilienceService()

export interface SendChatMessageParams {
  provider: string
  model: string
  /**
   * Con que modelo de embeddings se buscaron las fuentes que van en el mensaje; `null` si no se
   * consulto la base de conocimiento. Es para que el modelo que redacta pueda decirlo sin inventarlo.
   */
  modeloEmbeddings?: string | null
  messages: ChatMessage[]
  stream?: boolean
  /** Proyecto cuya red activa puede consultar el agente con herramientas (#34). */
  projectId?: string
  /**
   * La pregunta tal como la escribió el usuario, sin el contexto inyectado (#44).
   *
   * Hace falta para reconocer la intención de escenario: el último mensaje que
   * llega aquí lleva delante el resumen de la red y las fuentes del RAG, y
   * buscar identificadores de elementos en ese texto encuentra los del contexto.
   * Medido: a la pregunta «...si se pierde el control de las bombas 4 horas?» se
   * le propuso congelar la bomba «10» porque ese id aparecía en el resumen
   * inyectado, no en la pregunta.
   */
  preguntaOriginal?: string
  /**
   * Sin razonamiento previo, para una tarea acotada como la revisión de una
   * respuesta contra el documento. nemotron-3-super y -lightning gastaban los
   * 8192 tokens razonando y no llegaban a escribir el JSON; ultra tardaba 140 s
   * razonando y 25 s sin razonar, con el mismo resultado.
   */
  sinRazonar?: boolean
  /**
   * Con esto, el texto de la respuesta se manda al renderer mientras llega por
   * `chat:respuesta-parcial`, con este id para que el chat descarte lo de otra
   * petición (#223). Sin él —la revisión contra el documento— no sale nada.
   */
  idFlujo?: string
}

/** Lo que recibe el renderer mientras llega la respuesta: el texto acumulado, no el trozo. */
export interface RespuestaParcial {
  idFlujo: string
  texto: string
}

/** Cada cuánto, como mucho, se manda el texto al renderer. */
const INTERVALO_EN_VIVO_MS = 100

/**
 * Lo que se enseña de una respuesta con continuaciones mientras llega la
 * actual: lo anterior unido a ella, o sólo lo anterior mientras su principio
 * pueda ser todavía un solape que `unirContinuacion` quitará.
 */
function textoEnVivo(partes: string[], actual: string): string {
  const previo = partes.reduce(unirContinuacion, '')
  if (!previo) return actual
  return unirContinuacionParcial(previo, actual) ?? previo
}

/**
 * Tope de vueltas del bucle de herramientas. Cuatro dan de sobra para el uso
 * previsto (mirar un nudo, mirar sus tramos, responder) y acotan tanto el gasto
 * como el caso del modelo que se queda pidiendo herramientas sin concluir.
 */
const MAX_VUELTAS_HERRAMIENTAS = 4

type LectorSSE = (respuesta: { body: any }, controlador: AbortController, inactividadMs: number, mensaje: string, alTexto?: AlTexto) => Promise<any>

/**
 * Una petición a un proveedor externo. Devuelve la respuesta y, si fue bien,
 * sus datos ya leídos; si se corta, lanza el motivo del corte (inactividad o
 * tope), que es el mensaje que el chat sabe reintentar.
 */
async function pedirAlProveedor(
  url: string,
  init: RequestInit,
  proveedor: string,
  streaming: { inactividadMs: number; leer: LectorSSE; alTexto?: AlTexto } | null,
  timeout: number
): Promise<{ response: Response; data?: any }> {
  const controlador = new AbortController()
  const tope = setTimeout(() => controlador.abort(new Error(`${proveedor} timed out: no terminó en ${Math.round(timeout / 1000)} s`)), timeout)
  const mensajeDeInactividad = `${proveedor} timed out: ${Math.round((streaming?.inactividadMs ?? 0) / 1000)} s sin enviar nada`
  try {
    const response = await fetch(url, { ...init, signal: controlador.signal })
    if (!response.ok) return { response }
    const data = streaming
      ? await streaming.leer(response, controlador, streaming.inactividadMs, mensajeDeInactividad, streaming.alTexto)
      : await response.json()
    return { response, data }
  } catch (error) {
    const motivo = controlador.signal.reason
    throw motivo instanceof Error ? motivo : error
  } finally {
    clearTimeout(tope)
  }
}

/** Un modelo que no se deja servir en streaming (OpenAI exige verificar la organización para algunos). */
function esErrorDeStreaming(status: number, mensaje: string): boolean {
  return status === 400 && /stream/i.test(mensaje)
}

export interface IPCChatResponse {
  success: boolean
  data?: {
    response: string
    metadata: any
  }
  error?: string
}

/** Sin una clave legible para el proveedor externo: no se llama a la API. */
export const SIN_CLAVE = 'SIN_CLAVE'

export class ChatHandler {
  private databaseService: DatabaseService
  private consentido: (proveedor: string) => boolean

  constructor(databaseService: DatabaseService, consentido: (proveedor: string) => boolean = hayConsentimiento) {
    this.databaseService = databaseService
    this.consentido = consentido
    this.registerHandlers()
    logger.info('Chat handler initialized')
  }

  private registerHandlers(): void {
    // Handler for sending chat messages through backend
    ipcMain.handle('chat:send-message', async (event, params: SendChatMessageParams) => {
      const { idFlujo } = params
      const enVivo = idFlujo && event?.sender
        ? limitarFrecuencia(texto => {
            if (!event.sender.isDestroyed()) event.sender.send('chat:respuesta-parcial', { idFlujo, texto } satisfies RespuestaParcial)
          }, INTERVALO_EN_VIVO_MS)
        : null
      try {
        logger.debug('IPC: Sending chat message', {
          provider: params.provider,
          model: params.model,
          messageCount: params.messages.length
        })

        const result = await this.sendChatMessage(params, enVivo?.emitir)
        if (result.success) enVivo?.vaciar()
        else enVivo?.cancelar()

        logger.success('IPC: Chat message sent successfully', {
          provider: params.provider,
          model: params.model
        })

        return result
      } catch (error) {
        enVivo?.cancelar()
        logger.error('IPC: Failed to send chat message', error as Error, {
          provider: params.provider,
          model: params.model
        })

        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        } as IPCChatResponse
      }
    })

    logger.success('Chat IPC handlers registered successfully')
  }

  private async sendChatMessage(params: SendChatMessageParams, alTexto?: AlTexto): Promise<IPCChatResponse> {
    const { provider, model, messages, projectId, preguntaOriginal, modeloEmbeddings, sinRazonar } = params

    /**
     * La puerta de la nube (#225). Está aquí y no sólo en la interfaz porque por
     * aquí pasa todo lo que el chat manda fuera —la respuesta y la revisión
     * contra el documento—, y la clave se busca aquí: no viaja desde el renderer.
     */
    let apiKey = ''
    if (!esLocal(provider)) {
      if (!this.consentido(provider)) {
        logger.warn('Mensaje no enviado: falta el consentimiento para el proveedor', { provider })
        return { success: false, error: SIN_CONSENTIMIENTO }
      }
      apiKey = (await this.databaseService.claveDeProveedor(provider)) ?? ''
      if (!apiKey) {
        logger.warn('Mensaje no enviado: el proveedor no tiene una clave legible', { provider })
        return { success: false, error: SIN_CLAVE }
      }
    }

    try {
      // Get system prompt from database and add it to messages if not already present
      logger.info('Processing chat message', { provider, model, messageCount: messages.length })
      const messagesWithSystemPrompt = await this.addSystemPrompt(messages, {
        redaccion: { proveedor: provider, modelo: model },
        embeddings: modeloEmbeddings,
      })
      logger.info('Messages after system prompt processing', { messageCount: messagesWithSystemPrompt.length })

      // La red solo se carga si el proveedor sabe usar herramientas, con la
      // misma funcion que consulta `network-repo:context` para redactar el
      // prompt. Asi el texto que promete la consulta y el codigo que la ofrece
      // no pueden decir cosas distintas.
      const red = proveedorSoportaHerramientas(provider)
        ? await this.cargarRedActiva(projectId)
        : null

      let result: ChatResponse
      const nube = esLocal(provider) ? limitesDeLaNube(model) : await this.limitesDeLaNubePara(provider, model)

      const pregunta = preguntaOriginal
        ?? [...messages].reverse().find(m => m.role === 'user')?.content
        ?? ''
      /**
       * Si la pregunta es de escenario o de energía, la respuesta del modelo
       * puede acabar sustituida por la propuesta de Boorie (abajo), y enseñarla
       * mientras llega sería enseñar justo las cifras sin simular que esa
       * sustitución existe para tapar (#251). Se sabe antes de preguntar
       * —depende sólo de la pregunta y de la red—, así que esa respuesta no
       * sale en vivo; si al final el modelo propone por su cuenta y no se
       * sustituye, aparece de golpe, como antes del #223.
       */
      const puedeSustituirse = !!red && (!!detectarIntencionEscenario(pregunta, red.datos) || detectarIntencionEnergia(pregunta))
      const enVivo = puedeSustituirse ? undefined : alTexto

      switch (provider.toLowerCase()) {
        case 'anthropic':
          result = await this.sendAnthropicMessage(model, messagesWithSystemPrompt, apiKey, nube, red, enVivo)
          break
        case 'openai':
          result = await this.sendOpenAIMessage(model, messagesWithSystemPrompt, apiKey, nube, red, enVivo)
          break
        case 'google':
          result = await this.sendGoogleMessage(model, messagesWithSystemPrompt, apiKey, nube, enVivo)
          break
        case 'openrouter':
          result = await this.sendOpenRouterMessage(model, messagesWithSystemPrompt, apiKey, nube, red, enVivo)
          break
        case 'ollama':
          result = await this.sendOllamaMessage(model, messagesWithSystemPrompt, '', red)
          break
        case 'nvidia':
          result = await this.sendNvidiaMessage(model, messagesWithSystemPrompt, apiKey, nube, red, sinRazonar, enVivo)
          break
        default:
          throw new Error(`Unsupported chat provider: ${provider}`)
      }

      /**
       * Red de seguridad para las preguntas de escenario (#44).
       *
       * Medido con la pregunta del criterio de aceptación, `nemotron-mini`
       * respondió «10» sin llamar a ninguna herramienta: una cifra inventada,
       * que es justo lo que esta funcionalidad existe para impedir. Si la
       * pregunta era claramente condicional sobre un fallo y el modelo no
       * propuso nada, Boorie propone el escenario y **se queda con la palabra**:
       * la respuesta del modelo no se enseña, porque cualquier cifra que traiga
       * no está simulada.
       */
      if (red && !result.metadata?.propuesta_escenario) {
        const intencion = detectarIntencionEscenario(pregunta, red.datos)
        if (intencion) {
          const propuesta = await ejecutarHerramienta('proponer_escenario', { ...intencion }, { red: red.datos })
          if (propuesta.requiere_confirmacion === true) {
            result = {
              response:
                `He entendido que quieres simular este escenario: ${propuesta.resumen}\n\n` +
                'Confírmalo y lo ejecuto sobre tu red. No te doy cifras todavía porque no se ha simulado nada: ' +
                'las que salgan vendrán de la simulación, no de mí.',
              metadata: {
                ...result.metadata,
                propuesta_escenario: { ...propuesta, red_id: red.id },
                escenario_detectado_en_codigo: true,
              },
            }
          }
        }
      }

      /**
       * Y lo mismo para las preguntas de eficiencia energética (#42): el modelo
       * puesto a responder de memoria da cifras de ahorro inventadas, que es lo
       * que el issue prohíbe expresamente. Se le ofrece analizar y verificar, y
       * las cifras llegan de la simulación.
       */
      if (red && !result.metadata?.propuesta_escenario && !result.metadata?.propuesta_energia) {
        if (detectarIntencionEnergia(pregunta)) {
          result = {
            response:
              'Puedo analizar el consumo de bombeo de tu red y proponerte medidas, pero **simulando cada una** ' +
              'para decirte lo que ahorra de verdad. Confírmalo y lo hago; no te doy cifras de ahorro sin haberlas ' +
              'simulado.',
            metadata: {
              ...result.metadata,
              // El proyecto va con la propuesta porque **su tarifa manda**: sin
              // él se calcula con la general y, medido, eso hacía desaparecer
              // las candidatas —sin bloque de punta no hay hora cara que evitar.
              propuesta_energia: { red_id: red.id, project_id: projectId ?? null },
              escenario_detectado_en_codigo: true,
            },
          }
        }
      }

      return {
        success: true,
        data: {
          response: result.response,
          metadata: result.metadata
        }
      }
    } catch (error) {
      logger.error('Chat message failed', error as Error, { provider, model })

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * Los límites del modelo con lo que dijo la API al probar la clave, si se
   * guardó (#223). Sin esa fila —un modelo añadido a mano, una base sin
   * migrar— valen la tabla o el valor por defecto.
   */
  private async limitesDeLaNubePara(proveedor: string, modelo: string): Promise<LimitesDeLaNube> {
    try {
      const filas = await this.databaseService.prisma.aIModel.findMany({
        where: { modelId: modelo },
        select: { metadata: true, provider: { select: { name: true } } },
      })
      const fila = filas.find(f => f.provider.name.toLowerCase() === proveedor.toLowerCase())
      return limitesDeLaNube(modelo, limitesGuardados(fila?.metadata))
    } catch (error) {
      logger.warn('No se pudieron leer los límites guardados del modelo; van los de la tabla', { proveedor, modelo, error: String(error) })
      return limitesDeLaNube(modelo)
    }
  }

  /**
   * La red que el agente puede consultar. Sin proyecto no hay red, y entonces
   * no se ofrecen herramientas: el prompt de chat general ya le dice que no
   * hable de redes que no tiene delante.
   */
  private async cargarRedActiva(projectId?: string): Promise<RedParaHerramientas | null> {
    if (!projectId) return null
    try {
      const red = await leerRedActiva(this.databaseService.prisma, projectId)
      return red ? { id: red.id, datos: red.datos, inp: red.inp } : null
    } catch (error) {
      // Quedarse sin herramientas degrada la respuesta; tumbar el mensaje del
      // usuario por no poder leer la red seria peor.
      logger.warn('No se pudo cargar la red activa para las herramientas', { error: (error as Error).message })
      return null
    }
  }

  /**
   * La propuesta de escenario que el agente haya construido, si la hay (#44).
   *
   * Viaja en la metadata de la respuesta porque la confirmación es del usuario y
   * vive en la interfaz: la herramienta no puede ejecutar el escenario, y el
   * proceso principal no puede preguntar. Sin este canal, el agente describiría
   * un escenario que nadie puede lanzar.
   */
  private propuestaDeEscenario(
    resultados: Array<{ llamada: LlamadaHerramienta; salida: Record<string, unknown> }>,
    redId?: string
  ): Record<string, unknown> | null {
    for (const { llamada, salida } of resultados) {
      if (llamada.nombre === 'proponer_escenario' && salida?.requiere_confirmacion === true) {
        return redId ? { ...salida, red_id: redId } : salida
      }
    }
    return null
  }

  /**
   * El contexto de las herramientas, con los motores ya inyectados (#119).
   *
   * `agentTools` sigue sin saber de Python ni de Electron: recibe funciones. El
   * `.inp` se escribe en un temporal porque el servicio de WNTR come rutas, y
   * sale del `fileContent` de **la red activa del proyecto**, no del global que
   * pone el visor: si no, el agente podria calcular sobre una red distinta de
   * la que describe su propio resumen.
   */
  private contextoDeHerramientas(red: RedParaHerramientas): ContextoHerramientas {
    return {
      red: red.datos,
      motores: {
        curvaFragilidad: async (opciones) => {
          if (!red.inp) {
            return { error: 'La red activa no tiene guardado su fichero .inp, asi que no se puede calcular la curva.' }
          }
          // Un temporal por llamada, no por red: `ejecutarLlamadas` resuelve las
          // herramientas de un turno en paralelo, asi que dos curvas sobre la
          // misma red compartirian fichero y una borraria el que la otra esta
          // leyendo. Sale como un error del motor sin causa visible.
          const ruta = path.join(os.tmpdir(), `boorie-agente-${red.id}-${randomUUID()}.inp`)
          await fs.writeFile(ruta, red.inp, 'utf8')
          try {
            const r = await resilienceService.generateFragilityCurve(ruta, opciones as never)
            return r.success && r.data
              ? (r.data as unknown as Record<string, unknown>)
              : { error: r.error ?? 'El motor de fragilidad no devolvio resultados.' }
          } finally {
            // El temporal no se queda: es una copia de datos del proyecto.
            await fs.unlink(ruta).catch(() => {})
          }
        },
      },
    }
  }

  private async ejecutarLlamadas(llamadas: LlamadaHerramienta[], red: RedParaHerramientas) {
    const contexto = this.contextoDeHerramientas(red)
    return Promise.all(llamadas.map(async llamada => {
      logger.debug('Herramienta solicitada por el agente', { nombre: llamada.nombre, argumentos: llamada.argumentos })
      try {
        return { llamada, salida: await ejecutarHerramienta(llamada.nombre, llamada.argumentos, contexto) }
      } catch (error) {
        // El error se le devuelve al modelo como resultado, no se lanza: puede
        // reformular la llamada o explicar que no ha podido consultarlo.
        return { llamada, salida: { error: (error as Error).message } }
      }
    }))
  }

  private async addSystemPrompt(messages: ChatMessage[], modelos?: ModelosEnUso): Promise<ChatMessage[]> {
    try {
      // Check if there's already a system message
      const hasSystemMessage = messages.some(msg => msg.role === 'system')
      if (hasSystemMessage) {
        logger.info('System message already present in conversation')
        return messages
      }

      /**
       * La disciplina va siempre; lo del usuario se le añade (#119, fase 3).
       *
       * Antes el prompt salía **entero** de `app_settings`, y esa fila no
       * existe en una instalación recién hecha: se anotaba «No system prompt
       * found in database» y el mensaje se enviaba sin ningún sistema. Las
       * reglas que impiden inventar cifras dependían de que alguien hubiera
       * entrado en una pantalla de configuración y le hubiera dado a guardar.
       */
      const propio = await this.databaseService.prisma.appSetting.findUnique({
        where: { key: 'system_prompt' }
      })

      const contenido = componerPromptDeSistema(propio?.value, modelos)
      logger.info('Adding system prompt to conversation', {
        promptLength: contenido.length,
        conPersonalizacion: !!propio?.value?.trim(),
      })
      return [{ role: 'system', content: contenido }, ...messages]
    } catch (error) {
      // Que no se pueda leer la personalizacion no puede dejar al agente sin
      // reglas: se envia la disciplina sola, que es lo que no es opcional.
      logger.warn('No se pudo leer el prompt propio; va la disciplina sola', error as Error)
      return [{ role: 'system', content: componerPromptDeSistema(null, modelos) }, ...messages]
    }
  }

  /**
   * Anthropic como NVIDIA (#246): streaming con límite por inactividad, lo
   * recibido se conserva si se calla, y si corta por `max_tokens` se le pide
   * que siga. Las vueltas con herramientas también van en streaming (#251), y
   * el texto en pantalla se comporta como en `enviarOpenAICompat`.
   */
  private async sendAnthropicMessage(
    model: string,
    messages: ChatMessage[],
    apiKey: string,
    limites: LimitesDeLaNube,
    red?: RedParaHerramientas | null,
    alTexto?: AlTexto
  ): Promise<ChatResponse> {
    const { system, historial } = this.convertToAnthropicFormat(messages)

    let usarHerramientas = !!red
    /** La propuesta de escenario pendiente de confirmar, si el agente la construye (#44). */
    let propuestaEscenario: Record<string, unknown> | null = null
    let vueltas = 0
    let entrada = 0
    let salida = 0
    let ultima: any = null
    const partes: string[] = []
    let continuaciones = 0
    const alTrozo = alTexto && ((t: string) => alTexto(textoEnVivo(partes, t)))

    for (;;) {
      const requestBody: any = {
        model: model,
        max_tokens: limites.salida,
        messages: historial,
        stream: true,
      }
      if (system) requestBody.system = system
      if (usarHerramientas) requestBody.tools = herramientasAnthropic(HERRAMIENTAS)

      logger.debug('Anthropic API Request via backend', {
        model,
        messagesCount: historial.length,
        herramientas: usarHerramientas,
      })

      let response: Response
      let data: any
      try {
        ({ response, data } = await pedirAlProveedor('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            Accept: 'text/event-stream',
          },
          body: JSON.stringify(requestBody),
        }, 'Anthropic', { inactividadMs: limites.inactividadMs, leer: leerAnthropicEnStreaming, alTexto: alTrozo }, limites.totalMs))
      } catch (error) {
        if (continuaciones === 0) throw error
        logger.warn('Anthropic falla al continuar la respuesta, se entrega lo que hay', { model, error: String(error) })
        break
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as any
        const errorMessage = errorData.error?.message || 'Unknown error'

        // Reintento sin herramientas antes de dar el error por bueno: el modelo
        // puede no soportarlas, y una respuesta sin datos de red es mejor que
        // un error en la cara del usuario.
        if (usarHerramientas && esErrorDeHerramientas(response.status, errorMessage)) {
          logger.warn('Anthropic rechaza las herramientas, se reintenta sin ellas', { model, errorMessage })
          usarHerramientas = false
          continue
        }

        if (continuaciones > 0) {
          logger.warn('Anthropic falla al continuar la respuesta, se entrega lo que hay', { model, errorMessage })
          break
        }

        this.lanzarErrorAnthropic(response.status, errorMessage, model)
      }

      ultima = data
      entrada += data.usage?.input_tokens || 0
      salida += data.usage?.output_tokens || 0

      const llamadas = usarHerramientas ? llamadasDesdeAnthropic(data) : []
      if (llamadas.length === 0) {
        const texto = textoDesdeAnthropic(data)
        partes.push(texto)
        alTexto?.(partes.reduce(unirContinuacion, ''))
        if (data.stop_reason !== 'max_tokens' || continuaciones >= MAX_CONTINUACIONES) break

        continuaciones++
        logger.info('Anthropic cortó por longitud, se le pide que siga', { model, continuaciones })
        usarHerramientas = false
        historial.push({ role: 'assistant', content: texto }, { role: 'user', content: pedirContinuacion(texto) })
        continue
      }

      historial.push({ role: 'assistant', content: data.content })
      const resultados = await this.ejecutarLlamadas(llamadas, red!)
      propuestaEscenario = this.propuestaDeEscenario(resultados, red?.id) ?? propuestaEscenario
      historial.push(mensajeResultadosAnthropic(resultados))

      // Al agotar las vueltas no se corta en seco: se responden las llamadas
      // pendientes (Anthropic exige un tool_result por cada tool_use) y se pide
      // la respuesta final ya sin herramientas.
      if (++vueltas >= MAX_VUELTAS_HERRAMIENTAS) {
        logger.warn('Tope de vueltas de herramientas alcanzado', { model, vueltas })
        usarHerramientas = false
      }
    }

    return {
      response: partes.reduce(unirContinuacion, '') || 'No response from Anthropic',
      metadata: {
        model: ultima?.model || model,
        provider: 'Anthropic',
        tokens: entrada + salida,
        usage: {
          prompt_tokens: entrada,
          completion_tokens: salida,
          total_tokens: entrada + salida,
        },
        finish_reason: ultima?.stop_reason,
        vueltas_herramientas: vueltas,
        ...(continuaciones > 0 ? { continuaciones } : {}),
        ...(propuestaEscenario ? { propuesta_escenario: propuestaEscenario } : {}),
        created_at: new Date().toISOString(),
      }
    }
  }

  private lanzarErrorAnthropic(status: number, errorMessage: string, model: string): never {
    // Provide specific error messages based on status code
    switch (status) {
      case 400:
        if (errorMessage.toLowerCase().includes('credit') || errorMessage.toLowerCase().includes('billing') || errorMessage.toLowerCase().includes('balance')) {
          throw new Error('\u{1F4B3} Insufficient Anthropic credits. Please go to Plans & Billing in your Anthropic account to add credits or upgrade your plan.')
        }
        throw new Error(`Bad request to Anthropic: ${errorMessage}`)

      case 401:
        throw new Error('\u{1F511} Invalid Anthropic API key. Please check your API key in settings.')

      case 402:
        throw new Error('\u{1F4B3} Insufficient Anthropic credits. Please go to Plans & Billing in your Anthropic account to add credits or upgrade your plan.')

      case 403:
        if (errorMessage.toLowerCase().includes('credit') || errorMessage.toLowerCase().includes('billing') || errorMessage.toLowerCase().includes('balance')) {
          throw new Error('\u{1F4B3} Insufficient Anthropic credits. Please go to Plans & Billing in your Anthropic account to add credits or upgrade your plan.')
        }
        throw new Error('\u{1F6AB} Access denied to Anthropic API. Please check your account permissions.')

      case 404:
        throw new Error(`Anthropic model "${model}" not found. Please select a different model.`)

      case 429:
        throw new Error('Too many requests to Anthropic. Please try again later.')

      case 500:
      case 502:
      case 503:
      case 504:
      case 529:
        throw new Error('Anthropic API is temporarily unavailable. Please try again in a few moments.')

      default:
        throw new Error(`Anthropic API error (${status}): ${errorMessage}`)
    }
  }

  /** El sistema va en su campo, no pegado al primer mensaje del usuario. */
  private convertToAnthropicFormat(messages: ChatMessage[]): { system: string; historial: any[] } {
    const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n')
    const historial = messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role, content: m.content }))
    return { system, historial }
  }

  /**
   * Nucleo compartido por OpenAI, OpenRouter y NVIDIA: los tres exponen
   * /chat/completions y hablan el mismo dialecto de herramientas. Solo cambian
   * la URL, las cabeceras, algun parametro del cuerpo y como nombran los
   * errores, asi que eso es lo que entra por configuracion.
   */
  private async enviarOpenAICompat(
    cfg: {
      url: string
      proveedor: string
      cabeceras: Record<string, string>
      cuerpoExtra: Record<string, unknown>
      timeout: number
      extraerError: (errorData: any, status: number) => string
      lanzarError: (status: number, errorMessage: string) => never
      modeloDeLaRespuesta: boolean
      /**
       * Con esto, las vueltas van en streaming —también las de herramientas
       * (#251)— y `timeout` pasa a ser el tope total: sólo se corta si el
       * servidor deja de mandar datos este tiempo (`leerRespuestaEnStreaming`).
       */
      inactividadMs?: number
    },
    model: string,
    messages: ChatMessage[],
    red?: RedParaHerramientas | null,
    alTexto?: AlTexto
  ): Promise<ChatResponse> {
    const historial: any[] = [...messages]

    let usarHerramientas = !!red
    /** La propuesta de escenario pendiente de confirmar, si el agente la construye (#44). */
    let propuestaEscenario: Record<string, unknown> | null = null
    let vueltas = 0
    let ultima: any = null
    let tokens = 0
    const partes: string[] = []
    let continuaciones = 0
    let sinStreaming = false
    /**
     * El texto en pantalla con herramientas (#251). Cada vuelta manda su texto
     * mientras llega, unido a lo de las vueltas anteriores con
     * `textoEnVivo`. Una vuelta que acaba pidiendo herramientas no deja nada:
     * el lector, al ver la primera llamada, manda `''`, que aquí se convierte
     * en lo que ya había antes de esta vuelta, y deja de mandar texto. Lo
     * habitual —NVIDIA, OpenAI— son vueltas de herramientas sin texto, que no
     * enseñan nada, y una vuelta final de texto, que es la que se ve crecer.
     * Con Anthropic, el «Lo miro.» que suele preceder a la herramienta se ve un
     * momento y se quita.
     */
    const alTrozo = alTexto && ((t: string) => alTexto(textoEnVivo(partes, t)))

    for (;;) {
      const requestBody: any = {
        model: model,
        messages: historial,
        stream: false,
        ...cfg.cuerpoExtra,
      }
      if (usarHerramientas) requestBody.tools = herramientasOpenAI(HERRAMIENTAS)
      const enStreaming = !!cfg.inactividadMs && !sinStreaming
      if (enStreaming) {
        requestBody.stream = true
        requestBody.stream_options = { include_usage: true }
      }

      logger.debug(`${cfg.proveedor} API Request via backend`, {
        model,
        messagesCount: historial.length,
        herramientas: usarHerramientas,
        streaming: enStreaming,
      })

      let response: Response
      let data: any
      try {
        ({ response, data } = await pedirAlProveedor(cfg.url, {
          method: 'POST',
          headers: { ...cfg.cabeceras, ...(enStreaming ? { Accept: 'text/event-stream' } : {}) },
          body: JSON.stringify(requestBody),
        }, cfg.proveedor, enStreaming ? { inactividadMs: cfg.inactividadMs!, leer: leerRespuestaEnStreaming, alTexto: alTrozo } : null, cfg.timeout))
      } catch (error) {
        // Como con un error HTTP más abajo: lanzar aquí tiraba también los trozos ya recibidos.
        if (continuaciones === 0) throw error
        logger.warn(`${cfg.proveedor} falla al continuar la respuesta, se entrega lo que hay`, { model, error: String(error) })
        break
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as any
        const errorMessage = cfg.extraerError(errorData, response.status)

        // Antes que el de herramientas: un «no streaming with tools» nombra las
        // dos cosas, y sin streaming se conservan los datos de la red (#251).
        if (enStreaming && esErrorDeStreaming(response.status, errorMessage)) {
          logger.warn(`${cfg.proveedor} no sirve este modelo en streaming, se pide sin él`, { model, errorMessage })
          sinStreaming = true
          continue
        }

        // Ni OpenRouter ni NVIDIA garantizan herramientas en todos los modelos
        // que sirven, y una lista de cuales las soportan envejeceria mal: se
        // detecta el rechazo y se reintenta sin ellas.
        if (usarHerramientas && esErrorDeHerramientas(response.status, errorMessage)) {
          logger.warn(`${cfg.proveedor} rechaza las herramientas, se reintenta sin ellas`, { model, errorMessage })
          usarHerramientas = false
          continue
        }

        // Si falla una continuación, mejor la respuesta cortada que ninguna.
        if (continuaciones > 0) {
          logger.warn(`${cfg.proveedor} falla al continuar la respuesta, se entrega lo que hay`, { model, errorMessage })
          break
        }

        cfg.lanzarError(response.status, errorMessage)
      }

      ultima = data
      tokens += data.usage?.total_tokens || 0

      const llamadas = usarHerramientas ? llamadasDesdeOpenAI(data) : []
      if (llamadas.length === 0) {
        const texto = data.choices?.[0]?.message?.content || ''
        partes.push(texto)
        alTexto?.(partes.reduce(unirContinuacion, ''))
        // Un corte por inactividad no se continúa: sería reenviar el prompt
        // entero a un servidor que acaba de callarse, y esperar otros 90 s.
        if (data.choices?.[0]?.finish_reason !== 'length' || continuaciones >= MAX_CONTINUACIONES) break

        continuaciones++
        logger.info(`${cfg.proveedor} cortó por longitud, se le pide que siga`, { model, continuaciones })
        usarHerramientas = false
        historial.push({ role: 'assistant', content: texto }, { role: 'user', content: pedirContinuacion(texto) })
        continue
      }

      historial.push(data.choices[0].message)
      const resultados = await this.ejecutarLlamadas(llamadas, red!)
      propuestaEscenario = this.propuestaDeEscenario(resultados, red?.id) ?? propuestaEscenario
      historial.push(...mensajesResultadosOpenAI(resultados))

      if (++vueltas >= MAX_VUELTAS_HERRAMIENTAS) {
        logger.warn('Tope de vueltas de herramientas alcanzado', { model, vueltas })
        usarHerramientas = false
      }
    }

    return {
      response: partes.reduce(unirContinuacion, '') || `No response from ${cfg.proveedor}`,
      metadata: {
        model: cfg.modeloDeLaRespuesta ? (ultima?.model || model) : model,
        provider: cfg.proveedor,
        tokens: tokens,
        usage: ultima?.usage || {},
        finish_reason: ultima?.choices?.[0]?.finish_reason,
        vueltas_herramientas: vueltas,
        ...(continuaciones > 0 ? { continuaciones } : {}),
        ...(propuestaEscenario ? { propuesta_escenario: propuestaEscenario } : {}),
        created_at: ultima?.created ? new Date(ultima.created * 1000).toISOString() : new Date().toISOString(),
      }
    }
  }

  private async sendOpenAIMessage(
    model: string,
    messages: ChatMessage[],
    apiKey: string,
    limites: LimitesDeLaNube,
    red?: RedParaHerramientas | null,
    alTexto?: AlTexto
  ): Promise<ChatResponse> {
    return this.enviarOpenAICompat({
      url: 'https://api.openai.com/v1/chat/completions',
      proveedor: 'OpenAI',
      cabeceras: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      // `max_completion_tokens` y sin temperatura: los modelos de razonamiento
      // (o-series, gpt-5) rechazan `max_tokens` y cualquier temperatura que no
      // sea la suya, y la lista de modelos ya sale de la API (#246).
      cuerpoExtra: { max_completion_tokens: limites.salida },
      timeout: limites.totalMs,
      inactividadMs: limites.inactividadMs,
      modeloDeLaRespuesta: false,
      extraerError: (errorData) => errorData.error?.message || 'Unknown error',
      lanzarError: (status, errorMessage) => {
        switch (status) {
          case 401:
            throw new Error('\u{1F511} Invalid OpenAI API key. Please check your API key in settings.')
          case 403:
            throw new Error('\u{1F6AB} Access denied to OpenAI API. Please check your account permissions.')
          case 429:
            if (errorMessage.toLowerCase().includes('quota') || errorMessage.toLowerCase().includes('billing')) {
              throw new Error('\u{1F4B3} OpenAI quota exceeded. Please check your billing and usage limits.')
            }
            throw new Error('Too many requests to OpenAI. Please try again later.')
          case 500:
          case 502:
          case 503:
          case 504:
            throw new Error('OpenAI API is temporarily unavailable. Please try again in a few moments.')
          default:
            throw new Error(`OpenAI API error (${status}): ${errorMessage}`)
        }
      },
    }, model, messages, red, alTexto)
  }

  /**
   * Google como NVIDIA (#246) salvo las herramientas, cuyo dialecto no está
   * implementado: streaming con límite por inactividad, lo recibido se
   * conserva, y si corta por `MAX_TOKENS` se le pide que siga.
   */
  private async sendGoogleMessage(model: string, messages: ChatMessage[], apiKey: string, limites: LimitesDeLaNube, alTexto?: AlTexto): Promise<ChatResponse> {
    const { contents, systemInstruction } = this.convertToGoogleFormat(messages)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`

    let ultima: any = null
    let entrada = 0
    let salida = 0
    const partes: string[] = []
    let continuaciones = 0

    for (;;) {
      const requestBody = {
        contents,
        ...(systemInstruction ? { systemInstruction } : {}),
        generationConfig: { maxOutputTokens: limites.salida, temperature: 0.7 },
      }

      logger.debug('Google AI API Request via backend', { model, messagesCount: contents.length, continuaciones })
      const alTrozo = alTexto && ((t: string) => alTexto(textoEnVivo(partes, t)))

      let response: Response
      let data: any
      try {
        ({ response, data } = await pedirAlProveedor(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify(requestBody),
        }, 'Google AI', { inactividadMs: limites.inactividadMs, leer: leerGoogleEnStreaming, alTexto: alTrozo }, limites.totalMs))
      } catch (error) {
        if (continuaciones === 0) throw error
        logger.warn('Google AI falla al continuar la respuesta, se entrega lo que hay', { model, error: String(error) })
        break
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as any
        const errorMessage = errorData.error?.message || 'Unknown error'
        if (continuaciones > 0) {
          logger.warn('Google AI falla al continuar la respuesta, se entrega lo que hay', { model, errorMessage })
          break
        }
        this.lanzarErrorGoogle(response.status, errorMessage, JSON.stringify(errorData))
      }

      ultima = data
      // El lector se queda con el último `usageMetadata`, que ya es el total de la petición.
      entrada += data.usageMetadata?.promptTokenCount || 0
      salida += data.usageMetadata?.candidatesTokenCount || 0
      const texto: string = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
      partes.push(texto)
      alTexto?.(partes.reduce(unirContinuacion, ''))
      if (data.candidates?.[0]?.finishReason !== 'MAX_TOKENS' || continuaciones >= MAX_CONTINUACIONES) break

      continuaciones++
      logger.info('Google AI cortó por longitud, se le pide que siga', { model, continuaciones })
      contents.push(
        { role: 'model', parts: [{ text: texto }] },
        { role: 'user', parts: [{ text: pedirContinuacion(texto) }] },
      )
    }

    return {
      response: partes.reduce(unirContinuacion, '') || 'No response from Google AI',
      metadata: {
        model: model,
        provider: 'Google AI',
        tokens: entrada + salida,
        usage: {
          prompt_tokens: entrada,
          completion_tokens: salida,
          total_tokens: entrada + salida,
        },
        finish_reason: ultima?.candidates?.[0]?.finishReason,
        ...(continuaciones > 0 ? { continuaciones } : {}),
        created_at: new Date().toISOString(),
      }
    }
  }

  private lanzarErrorGoogle(status: number, errorMessage: string, cuerpo: string): never {
    switch (status) {
      case 400:
        // Una clave mala es un 400 INVALID_ARGUMENT, no un 401.
        if (/API_KEY_INVALID|API key not valid/i.test(cuerpo)) {
          throw new Error('🔑 Invalid Google AI API key. Please check your API key in settings.')
        }
        throw new Error(`Bad request to Google AI: ${errorMessage}`)
      case 401:
      case 403:
        throw new Error('🔑 Invalid Google AI API key. Please check your API key in settings.')
      case 429:
        throw new Error('Too many requests to Google AI. Please try again later.')
      case 500:
      case 502:
      case 503:
      case 504:
        throw new Error('Google AI API is temporarily unavailable. Please try again in a few moments.')
      default:
        throw new Error(`Google AI API error (${status}): ${errorMessage}`)
    }
  }

  private convertToGoogleFormat(messages: ChatMessage[]) {
    const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = []
    const sistema = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n')
    for (const message of messages) {
      if (message.role === 'system') continue
      contents.push({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: message.content }]
      })
    }
    return { contents, systemInstruction: sistema ? { parts: [{ text: sistema }] } : null }
  }

  private async sendOpenRouterMessage(
    model: string,
    messages: ChatMessage[],
    apiKey: string,
    limites: LimitesDeLaNube,
    red?: RedParaHerramientas | null,
    alTexto?: AlTexto
  ): Promise<ChatResponse> {
    return this.enviarOpenAICompat({
      url: 'https://openrouter.ai/api/v1/chat/completions',
      proveedor: 'OpenRouter',
      cabeceras: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://boorie.app', // Required by OpenRouter
        'X-Title': 'Boorie', // Required by OpenRouter
      },
      // OpenRouter specific parameters
      cuerpoExtra: { max_tokens: limites.salida, temperature: 0.7, top_p: 1, frequency_penalty: 0, presence_penalty: 0 },
      timeout: limites.totalMs,
      inactividadMs: limites.inactividadMs,
      modeloDeLaRespuesta: true,
      extraerError: (errorData) => errorData.error?.message || 'Unknown error',
      lanzarError: (status, errorMessage) => {
        switch (status) {
          case 401:
            throw new Error('\u{1F511} Invalid OpenRouter API key. Please check your API key in settings.')
          case 402:
            throw new Error('\u{1F4B3} Insufficient OpenRouter credits. Please add credits to your OpenRouter account.')
          case 403:
            throw new Error('\u{1F6AB} Access denied to OpenRouter API. Please check your account permissions.')
          case 429:
            throw new Error('Too many requests to OpenRouter. Please try again later.')
          case 500:
          case 502:
          case 503:
          case 504:
            throw new Error('OpenRouter API is temporarily unavailable. Please try again in a few moments.')
          default:
            throw new Error(`OpenRouter API error (${status}): ${errorMessage}`)
        }
      },
    }, model, messages, red, alTexto)
  }

  private async sendOllamaMessage(
    model: string,
    messages: ChatMessage[],
    _apiKey: string,
    red?: RedParaHerramientas | null
  ): Promise<ChatResponse> {
    // Get Ollama base URL from provider config
    const providers = await this.databaseService.prisma.aIProvider.findMany({
      where: { type: 'ollama', isActive: true }
    })
    const ollamaProvider = providers[0]
    const baseUrl = ollamaProvider?.config ? JSON.parse(ollamaProvider.config).baseUrl : 'http://127.0.0.1:11434'

    // Convert messages to Ollama format
    const historial: any[] = messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }))

    const limites = limitesDe('ollama', model, { contexto: await contextoDeOllama(baseUrl, model) })

    let usarHerramientas = !!red
    /** La propuesta de escenario pendiente de confirmar, si el agente la construye (#44). */
    let propuestaEscenario: Record<string, unknown> | null = null
    let vueltas = 0
    let entrada = 0
    let salida = 0
    let ultima: any = null

    try {
      for (;;) {
        const requestBody: any = {
          model: model,
          messages: historial,
          stream: false,
          options: { num_ctx: limites.contexto },
        }
        if (usarHerramientas) requestBody.tools = herramientasOpenAI(HERRAMIENTAS)

        logger.debug('Ollama API Request', {
          model,
          messagesCount: historial.length,
          baseUrl,
          herramientas: usarHerramientas,
        })

        const response = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(usarHerramientas ? limites.totalConHerramientasMs : limites.totalMs)
        })

        if (!response.ok) {
          const errorData = await response.text()

          // Muchos modelos locales no traen plantilla de herramientas y Ollama
          // responde 400. Se reintenta sin ellas antes de dar error.
          if (usarHerramientas && esErrorDeHerramientas(response.status, errorData)) {
            logger.warn('Ollama rechaza las herramientas, se reintenta sin ellas', { model })
            usarHerramientas = false
            continue
          }

          logger.error('Ollama API error', new Error(errorData), { status: response.status })

          switch (response.status) {
            case 404:
              throw new Error(`Ollama model "${model}" not found. Please pull the model first: ollama pull ${model}`)
            case 500:
              throw new Error('Ollama internal error. Please check if Ollama is running.')
            default:
              throw new Error(`Ollama API error (${response.status}): ${errorData}`)
          }
        }

        const data = await response.json() as any
        ultima = data
        entrada += data.prompt_eval_count || 0
        salida += data.eval_count || 0

        const llamadas = usarHerramientas ? llamadasDesdeOllama(data) : []
        if (llamadas.length === 0) break

        historial.push(data.message)
        const resultados = await this.ejecutarLlamadas(llamadas, red!)
        propuestaEscenario = this.propuestaDeEscenario(resultados, red?.id) ?? propuestaEscenario
        historial.push(...mensajesResultadosOpenAI(resultados))

        if (++vueltas >= MAX_VUELTAS_HERRAMIENTAS) {
          logger.warn('Tope de vueltas de herramientas alcanzado', { model, vueltas })
          usarHerramientas = false
        }
      }

      return {
        // Al pedir herramientas, nemotron devuelve content=" ": si se toma tal
        // cual, el chat ensena una respuesta en blanco.
        response: ultima?.message?.content?.trim() || 'No response from Ollama',
        metadata: {
          model: model,
          provider: 'Ollama',
          tokens: entrada + salida,
          usage: {
            prompt_tokens: entrada,
            completion_tokens: salida,
            total_tokens: entrada + salida,
          },
          vueltas_herramientas: vueltas,
          ...(propuestaEscenario ? { propuesta_escenario: propuestaEscenario } : {}),
          created_at: new Date().toISOString(),
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request to Ollama timed out. The model may be too large or slow.')
      }

      // Check if Ollama is running - check both FetchError cause and message content
      if (error instanceof Error) {
        const cause = (error as any).cause
        if ((cause && (cause.code === 'ECONNREFUSED' || cause.code === 'ETIMEDOUT')) ||
          error.message.includes('fetch failed') ||
          error.message.includes('ECONNREFUSED')) {
          throw new Error(`Cannot connect to Ollama at ${baseUrl}. Please verify:
1. Ollama is running on the server (ollama serve)
2. The URL ${baseUrl} is accessible
3. Check firewall settings if using a remote Ollama server
4. Verify the model "${model}" is available (ollama pull ${model})`)
        }
      }

      throw error
    }
  }

  private async sendNvidiaMessage(
    model: string,
    messages: ChatMessage[],
    apiKey: string,
    limites: LimitesDeLaNube,
    red?: RedParaHerramientas | null,
    sinRazonar?: boolean,
    alTexto?: AlTexto
  ): Promise<ChatResponse> {
    return this.enviarOpenAICompat({
      url: `${URL_NVIDIA}/chat/completions`,
      proveedor: 'Nvidia',
      cabeceras: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
      },
      cuerpoExtra: cuerpoNvidia(limites.salida, sinRazonar),
      timeout: limites.totalMs,
      inactividadMs: limites.inactividadMs,
      modeloDeLaRespuesta: true,
      extraerError: (errorData, status) => errorData.detail || errorData.title || `Error ${status}`,
      lanzarError: (status, errorMessage) => {
        switch (status) {
          case 401:
            throw new Error('\u{1F511} Invalid Nvidia API key. Please check your API key in settings.')
          case 402:
            throw new Error('\u{1F4B3} Insufficient Nvidia credits.')
          case 403:
            throw new Error('\u{1F6AB} Access denied to Nvidia API. Please check your account permissions.')
          case 429:
            throw new Error('Too many requests to Nvidia. Please try again later.')
          default:
            throw new Error(`Nvidia API error (${status}): ${errorMessage}`)
        }
      },
    }, model, messages, red, alTexto)
  }

  unregisterHandlers(): void {
    ipcMain.removeAllListeners('chat:send-message')
    logger.info('Chat IPC handlers unregistered')
  }
}