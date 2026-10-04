/* eslint-disable no-console -- como el resto de ModelosRAG, a la consola del proceso principal: appLogger.info calla fuera de desarrollo, y esto es el registro de qué modelo atendió cada papel */
/**
 * Qué modelos atienden la ruta del RAG, y con qué papel (#49).
 *
 * La especificación de producto pide dos modelos Nemotron, fijos e invisibles
 * para el usuario. Lo que había era lo contrario: los tres nodos que hablan con
 * el modelo —reformular, graduar y generar— pedían el mismo modelo, elegido por
 * disponibilidad de una lista que empezaba por `llama3.2:3b`, `phi3` y
 * `mistral`; Nemotron era la quinta opción y podía no llegar a usarse nunca.
 * Además la respuesta final la generaba el modelo que el usuario hubiera
 * elegido en el desplegable del chat, incluido `meta/llama-3.1-405b-instruct`.
 *
 * Aquí se fija el reparto, que es lo que hace que la pareja sea viable:
 *
 *   - `principal`  razona sobre el contexto recuperado y redacta la respuesta.
 *                  Se llama UNA vez por pregunta, así que puede ser el grande.
 *   - `auxiliar`   reformula la consulta y gradúa la relevancia documento a
 *                  documento. Se llama una vez por fragmento —hasta veinte por
 *                  pregunta, y otras tantas por cada vuelta del ciclo—, así que
 *                  tiene que ser el pequeño o la espera se va a minutos. Es la
 *                  misma razón por la que la lista anterior prefería un 3B a un
 *                  8B: medido en local, 4 s por documento contra 20 s.
 *
 * Las dos parejas están declaradas y se elige en Configuración → IA, «Dónde se
 * procesa la búsqueda» (#224); `BOORIE_RAG_BACKEND` sigue valiendo para
 * diagnóstico y manda si está puesta. Por defecto, local: no saca los
 * documentos del cliente de su máquina. NVIDIA, además de elegirse, necesita el
 * consentimiento para NVIDIA (#225) y una clave; sin ellos se queda en local.
 *
 * En local los dos papeles los hace `nemotron-mini`, y no es por descuido. Se
 * midió `nemotron-3-nano` —el Nemotron grande que la aplicación descargaba— en
 * una máquina sin GPU utilizable (GTX 960M de 4 GB, así que inferencia por
 * CPU): 3,4 s por token y 64 s de proceso del prompt, o sea unos 45 minutos para
 * una respuesta de 800 tokens, contra los 2,5 minutos de `nemotron-mini`. El
 * chat corta a los 5 minutos y la generación del agente a los 3, así que el
 * grande no habría contestado nunca. El reparto de papeles se queda escrito
 * porque es lo que pide la especificación y porque, en una máquina que sí pueda
 * servir el grande, basta cambiar `principal` aquí.
 */

import axios from 'axios'
import { URL_NVIDIA } from '../../ai/pruebaNvidia'
import { alCambiarConsentimiento, hayConsentimiento } from '../../security/consentimientoNube'

// Los límites viven aparte porque los usa el renderer, y este fichero trae axios.
export {
  limitesDe,
  limitesDeLaNube,
  CONTEXTO_UTIL_NUBE,
  type LimitesDeModelo,
  type LimitesDeLaNube,
  type LimitesDeLaApi,
} from './limitesDeModelo'

export type RolRAG = 'principal' | 'auxiliar'

export type BackendRAG = 'ollama' | 'nvidia'

/** Para qué se llama al modelo: es lo que se anota en el registro de cada pregunta. */
export type TareaRAG = 'reformular' | 'graduar' | 'redactar' | 'consultas'

interface Pareja {
  principal: string
  auxiliar: string
}

export const PAREJAS: Record<BackendRAG, Pareja> = {
  ollama: {
    principal: 'nemotron-mini',
    auxiliar: 'nemotron-mini',
  },
  // La pareja anterior (llama-3.1-nemotron-ultra-253b y -70b) da 404 «Not
  // found for account» con la clave del equipo: el catálogo la lista, pero la
  // cuenta no puede usarla. El principal pasa de nemotron-3-super a -ultra:
  // con la misma pregunta sobre el libro de Walton y los mismos fragmentos,
  // super se equivocaba en la fórmula de C y en el criterio de eficiencia, y
  // ultra los daba bien, en 122 s frente a 68. Falta la batería del #226.
  nvidia: {
    principal: 'nvidia/nemotron-3-ultra-550b-a55b',
    auxiliar: 'nvidia/nemotron-3.5-lightning-30b-a3b',
  },
}

export interface ModeloResuelto {
  modelo: string
  /** Dónde se manda: lo decide el motor vigente al resolver. */
  backend: BackendRAG
  /** El papel que se acaba atendiendo, que no siempre es el pedido. */
  rolEfectivo: RolRAG
  degradado: boolean
  motivo?: string
}

/**
 * Dónde se procesa la búsqueda (#224).
 *
 * Se elige en Configuración y se guarda en `app_settings`: en la app instalada
 * no hay entorno que fijar. `BOORIE_RAG_BACKEND` sigue valiendo para
 * diagnóstico y, si está puesta, manda sobre el ajuste. Pedir NVIDIA no basta:
 * sin consentimiento para NVIDIA (#225) o sin clave, la búsqueda sigue en local
 * y el estado dice por qué, para que Configuración lo avise.
 */
export const CLAVE_MOTOR_RAG = 'rag.motorBusqueda'

export type MotivoDeLocal = 'sinConsentimiento' | 'sinClave'

export interface EstadoMotorRAG {
  /** Lo guardado en Configuración. */
  ajuste: BackendRAG
  /** Lo que se pide: la variable de entorno si está puesta y, si no, el ajuste. */
  pedido: BackendRAG
  porEntorno: boolean
  /** Dónde se procesa de verdad. */
  efectivo: BackendRAG
  motivo?: MotivoDeLocal
}

interface PrismaAjustes {
  appSetting: {
    findUnique(args: { where: { key: string } }): Promise<{ value: string } | null>
    upsert(args: {
      where: { key: string }
      create: { key: string; value: string; category?: string }
      update: { value: string }
    }): Promise<unknown>
  }
}

let ajuste: BackendRAG = 'ollama'
let motor: EstadoMotorRAG | null = null

let claveDelAlmacen: () => Promise<string | null> = async () => null

/** La clave del proveedor NVIDIA de Proveedores API, descifrada aquí: la misma que usa el chat. */
export function usarClaveNvidiaDe(fuente: () => Promise<string | null>): void {
  claveDelAlmacen = fuente
}

/** La del entorno manda si está puesta, como `BOORIE_RAG_BACKEND`; si no, la guardada. */
async function claveNvidia(): Promise<string | null> {
  return process.env.NVIDIA_API_KEY || (await claveDelAlmacen()) || null
}

export async function cargarMotorRAG(prisma: PrismaAjustes): Promise<BackendRAG> {
  const fila = await prisma.appSetting.findUnique({ where: { key: CLAVE_MOTOR_RAG } })
  ajuste = fila?.value === 'nvidia' ? 'nvidia' : 'ollama'
  motor = null
  return ajuste
}

export async function guardarMotorRAG(prisma: PrismaAjustes, nuevo: BackendRAG): Promise<EstadoMotorRAG> {
  await prisma.appSetting.upsert({
    where: { key: CLAVE_MOTOR_RAG },
    create: { key: CLAVE_MOTOR_RAG, value: nuevo, category: 'ai' },
    update: { value: nuevo },
  })
  ajuste = nuevo
  return revisarMotorRAG()
}

function pedidoPorEntorno(): BackendRAG | undefined {
  const valor = process.env.BOORIE_RAG_BACKEND?.trim()
  if (!valor) return undefined
  return valor === 'nvidia' ? 'nvidia' : 'ollama'
}

/**
 * Vuelve a mirar ajuste, entorno, consentimiento y clave. Se llama al empezar
 * cada pregunta y al consultar el estado: la clave se puede guardar o quitar en
 * cualquier momento, y no hay otro aviso de que haya cambiado.
 */
export async function revisarMotorRAG(): Promise<EstadoMotorRAG> {
  const delEntorno = pedidoPorEntorno()
  const pedido = delEntorno ?? ajuste
  let efectivo: BackendRAG = pedido
  let motivo: MotivoDeLocal | undefined
  if (pedido === 'nvidia') {
    if (!hayConsentimiento('nvidia')) motivo = 'sinConsentimiento'
    else if (!(await claveNvidia())) motivo = 'sinClave'
    if (motivo) efectivo = 'ollama'
  }
  const nuevo: EstadoMotorRAG = { ajuste, pedido, porEntorno: !!delEntorno, efectivo, ...(motivo ? { motivo } : {}) }
  const anterior = motor
  if (anterior && anterior.efectivo !== efectivo) olvidarResoluciones()
  if (!anterior || anterior.efectivo !== efectivo || anterior.motivo !== motivo) {
    const origen = delEntorno ? 'BOORIE_RAG_BACKEND' : 'Configuración'
    const porque = motivo === 'sinConsentimiento'
      ? ': sin consentimiento para NVIDIA sigue en local'
      : motivo === 'sinClave' ? ': sin clave de NVIDIA sigue en local' : ''
    const log = motivo ? console.warn : console.log
    log(`[ModelosRAG] la búsqueda se procesa en ${efectivo} (pedido ${pedido} por ${origen}${porque})`)
  }
  motor = nuevo
  return nuevo
}

async function motorVigente(): Promise<EstadoMotorRAG> {
  return motor ?? revisarMotorRAG()
}

/** Dónde se procesa la búsqueda ahora mismo. */
export async function backendRAG(): Promise<BackendRAG> {
  return (await motorVigente()).efectivo
}

function pareja(backend: BackendRAG): Pareja {
  const base = PAREJAS[backend]
  return {
    principal: process.env.BOORIE_RAG_MODELO_PRINCIPAL || base.principal,
    auxiliar: process.env.BOORIE_RAG_MODELO_AUXILIAR || base.auxiliar,
  }
}

/** Lo puesto a mano para ese papel, si lo hay. */
function aMano(rol: RolRAG): string | undefined {
  return rol === 'principal'
    ? process.env.BOORIE_RAG_MODELO_PRINCIPAL
    : process.env.BOORIE_RAG_MODELO_AUXILIAR
}

/**
 * Si el desplegable de modelos del chat se enseña.
 *
 * Oculto por defecto: mientras el usuario pueda elegir, la respuesta del RAG la
 * puede estar escribiendo un modelo no validado para hidráulica. Se recupera con
 * `BOORIE_SELECTOR_MODELO=1` para diagnóstico y para los usos no-RAG, que es
 * donde la selección multiproveedor sigue teniendo sentido.
 */
export function selectorModeloVisible(): boolean {
  return process.env.BOORIE_SELECTOR_MODELO === '1'
}

function urlOllama(): string {
  return process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434'
}

/** `nemotron-mini` y `nemotron-mini:latest` son la misma imagen. */
function coincide(pedido: string, instalado: string): boolean {
  return instalado === pedido || instalado.split(':')[0] === pedido.split(':')[0]
}

/**
 * Los modelos instalados, o `null` si no se pudo preguntar.
 *
 * La diferencia importa: lista vacía significa «Ollama está y no tiene ninguno
 * de los dos», y `null` significa «no lo sabemos». En el segundo caso no se
 * degrada nada, porque degradar a un modelo que tampoco responde sólo duplica
 * la espera de cada documento.
 *
 * Se pregunta una vez y se recuerda, como antes: hacerlo por documento
 * multiplicaría las llamadas de una fase que ya recorre veinte fragmentos.
 */
let pendiente: Promise<string[] | null> | null = null

async function instalados(backend: BackendRAG): Promise<string[] | null> {
  if (backend !== 'ollama') return null
  if (!pendiente) {
    pendiente = Promise.resolve(axios.get(`${urlOllama()}/api/tags`, { timeout: 5000 }))
      .then(r => (r.data?.models ?? []).map((m: { name: string }) => m.name).filter(Boolean))
      .catch(() => null)
  }
  return pendiente
}

let resueltos: Map<RolRAG, ModeloResuelto> = new Map()

export async function resolverModeloRAG(rol: RolRAG): Promise<ModeloResuelto> {
  const yaResuelto = resueltos.get(rol)
  if (yaResuelto) return yaResuelto

  const { efectivo: backend } = await motorVigente()
  const { principal, auxiliar } = pareja(backend)
  const pedido = rol === 'principal' ? principal : auxiliar

  // Lo configurado a mano manda y no se comprueba: quien lo pone sabe lo que
  // quiere, aunque todavía no lo haya descargado.
  if (aMano(rol)) {
    const puesto: ModeloResuelto = { modelo: pedido, backend, rolEfectivo: rol, degradado: false }
    console.log(`[ModelosRAG] rol=${rol} backend=${backend} modelo="${pedido}" (configurado a mano)`)
    resueltos.set(rol, puesto)
    return puesto
  }

  const lista = await instalados(backend)

  let resuelto: ModeloResuelto

  if (lista === null) {
    // Sin inventario: se pide lo que toca y, si no está, el error lo dirá con
    // el nombre del Nemotron delante en vez de callarse.
    resuelto = { modelo: pedido, backend, rolEfectivo: rol, degradado: false }
  } else {
    const instalado = lista.find(m => coincide(pedido, m))
    if (instalado) {
      resuelto = { modelo: instalado, backend, rolEfectivo: rol, degradado: false }
    } else if (rol === 'principal') {
      // La degradación va en un solo sentido. Del principal al auxiliar se
      // pierde calidad de redacción y se gana una respuesta; del auxiliar al
      // principal se ganaría calidad de graduado a cambio de multiplicar por
      // veinte una llamada de treinta segundos, así que ahí no se degrada.
      const respaldo = lista.find(m => coincide(auxiliar, m))
      resuelto = respaldo
        ? {
          modelo: respaldo,
          backend,
          rolEfectivo: 'auxiliar',
          degradado: true,
          motivo: `"${principal}" no está instalado en Ollama; responde el auxiliar "${respaldo}"`,
        }
        : {
          modelo: pedido,
          backend,
          rolEfectivo: rol,
          degradado: false,
          motivo: principal === auxiliar
            ? `"${principal}" no está instalado en Ollama`
            : `Ni "${principal}" ni "${auxiliar}" están instalados en Ollama`,
        }
    } else {
      resuelto = {
        modelo: pedido,
        backend,
        rolEfectivo: rol,
        degradado: false,
        motivo: `"${auxiliar}" no está instalado en Ollama`,
      }
    }
  }

  if (resuelto.motivo) {
    console.warn(`[ModelosRAG] ${resuelto.motivo}`)
  } else {
    console.log(`[ModelosRAG] rol=${rol} backend=${backend} modelo="${resuelto.modelo}"`)
  }

  resueltos.set(rol, resuelto)
  return resuelto
}

export interface EstadoModelosRAG {
  backend: BackendRAG
  principal: string
  auxiliar: string
  /** El modelo que va a redactar la respuesta, ya sea el principal o el respaldo. */
  modeloRespuesta: string
  degradado: boolean
  motivo?: string
  selectorVisible: boolean
  /** Dónde se procesa la búsqueda y, si no es donde se pidió, por qué (#224). */
  motor: EstadoMotorRAG
}

/** Lo que necesita saber la interfaz: qué modelo responde y si está degradado. */
export async function estadoModelosRAG(): Promise<EstadoModelosRAG> {
  const estado = await revisarMotorRAG()
  const { principal, auxiliar } = pareja(estado.efectivo)
  const resuelto = await resolverModeloRAG('principal')

  return {
    backend: estado.efectivo,
    principal,
    auxiliar,
    modeloRespuesta: resuelto.modelo,
    degradado: resuelto.degradado,
    motivo: resuelto.motivo,
    selectorVisible: selectorModeloVisible(),
    motor: estado,
  }
}

/**
 * Lo que se anota de cada papel durante una pregunta, para poder decir después
 * qué modelo atendió cada uno sin llenar el log con una línea por fragmento.
 */
interface UsoDeTarea {
  backend: BackendRAG
  modelos: Set<string>
  llamadas: number
  reintentos: number
  fallidas: number
  ms: number
}

let registro: Map<TareaRAG, UsoDeTarea> | null = null

export function empezarRegistroRAG(): void {
  registro = new Map()
}

function anotar(tarea: TareaRAG, backend: BackendRAG, modelo: string, cambios: { ms?: number; reintentos?: number; fallida?: boolean }): void {
  if (!registro) return
  const uso = registro.get(tarea) ?? { backend, modelos: new Set<string>(), llamadas: 0, reintentos: 0, fallidas: 0, ms: 0 }
  uso.modelos.add(modelo)
  uso.reintentos += cambios.reintentos ?? 0
  if (cambios.ms !== undefined) {
    uso.llamadas++
    uso.ms += cambios.ms
  }
  if (cambios.fallida) uso.fallidas++
  registro.set(tarea, uso)
}

/**
 * Cierra el registro de la pregunta y lo escribe en una línea: qué modelo
 * atendió cada papel, cuántas llamadas, cuántos reintentos por el límite de
 * peticiones y cuántas fallaron. `redacta` es para cuando la respuesta la
 * escribe el chat y no este módulo.
 */
export function cerrarRegistroRAG(opciones: { redacta?: string } = {}): string {
  const uso = registro ?? new Map<TareaRAG, UsoDeTarea>()
  registro = null
  const describir = (tarea: TareaRAG, sinUso: string) => {
    const u = uso.get(tarea)
    if (!u) return `${tarea}=${sinUso}`
    const extra = [
      `${u.llamadas} llamada${u.llamadas === 1 ? '' : 's'}`,
      `${(u.ms / 1000).toFixed(1)} s`,
      ...(u.reintentos ? [`${u.reintentos} reintentos por 429`] : []),
      ...(u.fallidas ? [`${u.fallidas} fallidas`] : []),
    ]
    return `${tarea}=${u.backend} "${[...u.modelos].join('", "')}" (${extra.join(', ')})`
  }
  const linea = [
    describir('reformular', 'no hizo falta'),
    describir('graduar', 'no hubo fragmentos'),
    uso.has('redactar') ? describir('redactar', '') : `redactar=${opciones.redacta ?? 'no se redactó'}`,
  ].join(' · ')
  console.log(`[ModelosRAG] papeles de la pregunta: ${linea}`)
  return linea
}

/**
 * Un fallo de NVIDIA sin la petición dentro. El error de axios lleva la
 * petición entera, cabeceras incluidas, y quien lo escribía en el log escribía
 * la clave: pasó en la batería con un 503 (#224).
 */
export class FalloDeNvidia extends Error {
  constructor(public readonly status: number | undefined, mensaje: string) {
    super(`NVIDIA: ${mensaje}`)
    this.name = 'FalloDeNvidia'
  }
}

const QUE_DICE: Record<number, string> = { 429: 'límite de peticiones', 503: 'servicio saturado' }

/**
 * La API siguió respondiendo 429 (o 503) hasta agotar los reintentos. Quien
 * llama decide qué hacer con lo que no se pudo evaluar, pero tiene que poder
 * distinguirlo de un fallo cualquiera para decirlo.
 */
export class LimiteDePeticiones extends FalloDeNvidia {
  constructor(status: number, public readonly reintentos: number) {
    super(status, `sigue respondiendo ${status} (${QUE_DICE[status] ?? 'error'}) tras ${reintentos} reintentos`)
    this.name = 'LimiteDePeticiones'
  }
}

/** Lo que se reintenta esperando: el límite de peticiones y el «Service temporarily overloaded» que NVIDIA da a ratos. */
const REINTENTABLES = new Set([429, 503])

export const REINTENTOS_POR_LIMITE = 4
const ESPERA_MAXIMA_MS = 60_000

/**
 * Cuánto esperar tras un 429. `Retry-After` manda si viene, en segundos o como
 * fecha. Medido con la clave del equipo, NVIDIA no lo manda: 12 de 40 llamadas
 * con 20 a la vez dieron 429 sin la cabecera, así que lo normal es la espera
 * exponencial (2, 4, 8 y 16 s), con algo de azar para que las peticiones que
 * fallaron juntas no vuelvan juntas.
 */
export function esperaTrasLimite(retryAfter: string | undefined | null, intento: number, ahora = Date.now()): number {
  if (retryAfter) {
    const segundos = Number(retryAfter)
    if (Number.isFinite(segundos) && segundos >= 0) return Math.min(segundos * 1000, ESPERA_MAXIMA_MS)
    const fecha = Date.parse(retryAfter)
    if (!Number.isNaN(fecha)) return Math.min(Math.max(0, fecha - ahora), ESPERA_MAXIMA_MS)
  }
  return Math.min(2000 * 2 ** intento * (1 + Math.random() * 0.25), ESPERA_MAXIMA_MS)
}

const esperar = (ms: number) => new Promise<void>(resolver => setTimeout(resolver, ms))

function estadoHttp(error: unknown): { status?: number; retryAfter?: string } {
  const r = (error as { response?: { status?: number; headers?: Record<string, unknown> } })?.response
  const cabecera = r?.headers?.['retry-after']
  return { status: r?.status, retryAfter: typeof cabecera === 'string' ? cabecera : undefined }
}

export interface PeticionNvidia {
  modelo: string
  prompt: string
  temperatura: number
  maxTokens: number
  timeoutMs: number
  tarea: TareaRAG
  /**
   * Los Nemotron 3 razonan antes de contestar si no se les dice lo contrario.
   * Lightning, con los 200 tokens del graduado, se los gastaba enteros
   * pensando y devolvía el razonamiento cortado en lugar del JSON (medido).
   */
  sinRazonar?: boolean
}

/**
 * Una llamada a NVIDIA con la clave guardada y el 429 tratado: espera y
 * reintenta. Lo que lanza es siempre un `FalloDeNvidia`, que se puede escribir
 * en el log sin sacar la clave.
 */
export async function llamarNvidia(p: PeticionNvidia): Promise<string> {
  const clave = await claveNvidia()
  if (!clave) throw new Error('No hay clave de NVIDIA en Proveedores API')
  const baseUrl = process.env.NVIDIA_BASE_URL || URL_NVIDIA
  const inicio = Date.now()
  for (let intento = 0; ; intento++) {
    try {
      const respuesta = await axios.post(
        `${baseUrl}/chat/completions`,
        {
          model: p.modelo,
          messages: [{ role: 'user', content: p.prompt }],
          temperature: p.temperatura,
          top_p: 0.9,
          max_tokens: p.maxTokens,
          stream: false,
          ...(p.sinRazonar ? { chat_template_kwargs: { enable_thinking: false } } : {}),
        },
        {
          headers: {
            Authorization: `Bearer ${clave}`,
            'Content-Type': 'application/json',
          },
          timeout: p.timeoutMs,
        },
      )
      anotar(p.tarea, 'nvidia', p.modelo, { ms: Date.now() - inicio })
      return respuesta.data?.choices?.[0]?.message?.content ?? ''
    } catch (error) {
      const { status, retryAfter } = estadoHttp(error)
      if (status === undefined || !REINTENTABLES.has(status)) {
        anotar(p.tarea, 'nvidia', p.modelo, { ms: Date.now() - inicio, fallida: true })
        throw new FalloDeNvidia(status, error instanceof Error ? error.message : String(error))
      }
      if (intento >= REINTENTOS_POR_LIMITE) {
        anotar(p.tarea, 'nvidia', p.modelo, { ms: Date.now() - inicio, fallida: true })
        console.warn(`[ModelosRAG] ${p.tarea}: NVIDIA sigue en ${status} tras ${REINTENTOS_POR_LIMITE} reintentos; se deja de esperar`)
        throw new LimiteDePeticiones(status, REINTENTOS_POR_LIMITE)
      }
      const ms = esperaTrasLimite(retryAfter, intento)
      anotar(p.tarea, 'nvidia', p.modelo, { reintentos: 1 })
      console.warn(
        `[ModelosRAG] ${p.tarea}: NVIDIA responde ${status} (${QUE_DICE[status]}); se espera ${(ms / 1000).toFixed(1)} s` +
        `${retryAfter ? ' (Retry-After)' : ''} y se reintenta (${intento + 1}/${REINTENTOS_POR_LIMITE})`,
      )
      await esperar(ms)
    }
  }
}

interface PeticionRAG {
  rol: RolRAG
  tarea: TareaRAG
  prompt: string
  temperatura: number
  maxTokens: number
  timeoutMs: number
  penalizacionRepeticion?: number
}

async function ejecutar(resuelto: ModeloResuelto, modelo: string, p: PeticionRAG): Promise<string> {
  if (resuelto.backend === 'nvidia') {
    return llamarNvidia({
      modelo,
      prompt: p.prompt,
      temperatura: p.temperatura,
      maxTokens: p.maxTokens,
      timeoutMs: p.timeoutMs,
      tarea: p.tarea,
      sinRazonar: resuelto.rolEfectivo === 'auxiliar',
    })
  }

  const inicio = Date.now()
  try {
    const respuesta = await axios.post(
      `${urlOllama()}/api/generate`,
      {
        model: modelo,
        prompt: p.prompt,
        stream: false,
        options: {
          temperature: p.temperatura,
          top_p: 0.9,
          // Ollama ignora `max_tokens`: su opción es `num_predict`. Sin el tope
          // aplicado de verdad, el modelo escribía más allá de la espera y la
          // respuesta terminada se perdía en el `catch`, que devolvía el texto de
          // «no encontré nada» aunque hubiera documentos. Medido en la
          // generación: 106 s antes, 36 s con el tope.
          num_predict: p.maxTokens,
          ...(p.penalizacionRepeticion ? { repeat_penalty: p.penalizacionRepeticion } : {}),
        },
      },
      { timeout: p.timeoutMs },
    )
    anotar(p.tarea, 'ollama', modelo, { ms: Date.now() - inicio })
    return respuesta.data.response
  } catch (error) {
    anotar(p.tarea, 'ollama', modelo, { ms: Date.now() - inicio, fallida: true })
    throw error
  }
}

/**
 * Una llamada al modelo del papel que se pida, con el registro y la degradación
 * en un solo sitio.
 *
 * Por llamada sólo se escribe la del principal: la del auxiliar se dispara una
 * vez por fragmento y llenaría el log de ruido. Lo de cada papel queda en el
 * registro de la pregunta (`cerrarRegistroRAG`).
 */
export async function llamarModeloRAG(p: PeticionRAG): Promise<string> {
  const resuelto = await resolverModeloRAG(p.rol)
  const inicio = Date.now()

  try {
    const texto = await ejecutar(resuelto, resuelto.modelo, p)
    if (p.rol === 'principal') {
      console.log(
        `[ModelosRAG] respuesta rol=${p.rol} efectivo=${resuelto.rolEfectivo} backend=${resuelto.backend} ` +
        `modelo="${resuelto.modelo}" ms=${Date.now() - inicio}`,
      )
    }
    return texto
  } catch (error) {
    const { auxiliar } = pareja(resuelto.backend)
    const lista = await instalados(resuelto.backend)
    const respaldo = p.rol === 'principal' && lista
      ? lista.find(m => coincide(auxiliar, m))
      : undefined

    if (!respaldo || respaldo === resuelto.modelo) throw error

    console.warn(
      `[ModelosRAG] "${resuelto.modelo}" falló (${error instanceof Error ? error.message : error}); ` +
      `se reintenta con el auxiliar "${respaldo}"`,
    )
    const degradado: ModeloResuelto = {
      modelo: respaldo,
      backend: resuelto.backend,
      rolEfectivo: 'auxiliar',
      degradado: true,
      motivo: `"${resuelto.modelo}" falló al responder; responde el auxiliar "${respaldo}"`,
    }
    resueltos.set(p.rol, degradado)
    const texto = await ejecutar(degradado, respaldo, p)
    console.log(`[ModelosRAG] respuesta rol=${p.rol} efectivo=auxiliar modelo="${respaldo}" ms=${Date.now() - inicio}`)
    return texto
  }
}

function olvidarResoluciones(): void {
  pendiente = null
  resueltos = new Map()
}

/** Para las pruebas y para después de instalar o descargar un modelo. */
export function olvidarModelosRAG(): void {
  olvidarResoluciones()
  motor = null
}

// Lo resuelto depende del motor, y el motor del consentimiento.
alCambiarConsentimiento(olvidarModelosRAG)
