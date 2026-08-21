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
 * Las dos parejas están declaradas y se elige con `BOORIE_RAG_BACKEND`, porque
 * la decisión entre API y local (conectividad, coste, privacidad del dato del
 * cliente) es de negocio y no estaba tomada al arreglar esto. Por defecto,
 * local: es lo que usan los guardrails y no saca los documentos del cliente de
 * su máquina.
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

export type RolRAG = 'principal' | 'auxiliar'

export type BackendRAG = 'ollama' | 'nvidia'

interface Pareja {
  principal: string
  auxiliar: string
}

export const PAREJAS: Record<BackendRAG, Pareja> = {
  ollama: {
    principal: 'nemotron-mini',
    auxiliar: 'nemotron-mini',
  },
  nvidia: {
    principal: 'nvidia/llama-3.1-nemotron-ultra-253b-v1',
    auxiliar: 'nvidia/llama-3.1-nemotron-70b-instruct',
  },
}

export interface ModeloResuelto {
  modelo: string
  /** El papel que se acaba atendiendo, que no siempre es el pedido. */
  rolEfectivo: RolRAG
  degradado: boolean
  motivo?: string
}

export function backendRAG(): BackendRAG {
  return process.env.BOORIE_RAG_BACKEND === 'nvidia' ? 'nvidia' : 'ollama'
}

function pareja(): Pareja {
  const base = PAREJAS[backendRAG()]
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

async function instalados(): Promise<string[] | null> {
  if (backendRAG() !== 'ollama') return null
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

  const { principal, auxiliar } = pareja()
  const pedido = rol === 'principal' ? principal : auxiliar

  // Lo configurado a mano manda y no se comprueba: quien lo pone sabe lo que
  // quiere, aunque todavía no lo haya descargado.
  if (aMano(rol)) {
    const puesto: ModeloResuelto = { modelo: pedido, rolEfectivo: rol, degradado: false }
    console.log(`[ModelosRAG] rol=${rol} backend=${backendRAG()} modelo="${pedido}" (configurado a mano)`)
    resueltos.set(rol, puesto)
    return puesto
  }

  const lista = await instalados()

  let resuelto: ModeloResuelto

  if (lista === null) {
    // Sin inventario: se pide lo que toca y, si no está, el error lo dirá con
    // el nombre del Nemotron delante en vez de callarse.
    resuelto = { modelo: pedido, rolEfectivo: rol, degradado: false }
  } else {
    const instalado = lista.find(m => coincide(pedido, m))
    if (instalado) {
      resuelto = { modelo: instalado, rolEfectivo: rol, degradado: false }
    } else if (rol === 'principal') {
      // La degradación va en un solo sentido. Del principal al auxiliar se
      // pierde calidad de redacción y se gana una respuesta; del auxiliar al
      // principal se ganaría calidad de graduado a cambio de multiplicar por
      // veinte una llamada de treinta segundos, así que ahí no se degrada.
      const respaldo = lista.find(m => coincide(auxiliar, m))
      resuelto = respaldo
        ? {
          modelo: respaldo,
          rolEfectivo: 'auxiliar',
          degradado: true,
          motivo: `"${principal}" no está instalado en Ollama; responde el auxiliar "${respaldo}"`,
        }
        : {
          modelo: pedido,
          rolEfectivo: rol,
          degradado: false,
          motivo: principal === auxiliar
            ? `"${principal}" no está instalado en Ollama`
            : `Ni "${principal}" ni "${auxiliar}" están instalados en Ollama`,
        }
    } else {
      resuelto = {
        modelo: pedido,
        rolEfectivo: rol,
        degradado: false,
        motivo: `"${auxiliar}" no está instalado en Ollama`,
      }
    }
  }

  if (resuelto.motivo) {
    console.warn(`[ModelosRAG] ${resuelto.motivo}`)
  } else {
    console.log(`[ModelosRAG] rol=${rol} backend=${backendRAG()} modelo="${resuelto.modelo}"`)
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
}

/** Lo que necesita saber la interfaz: qué modelo responde y si está degradado. */
export async function estadoModelosRAG(): Promise<EstadoModelosRAG> {
  const { principal, auxiliar } = pareja()
  const resuelto = await resolverModeloRAG('principal')

  return {
    backend: backendRAG(),
    principal,
    auxiliar,
    modeloRespuesta: resuelto.modelo,
    degradado: resuelto.degradado,
    motivo: resuelto.motivo,
    selectorVisible: selectorModeloVisible(),
  }
}

interface PeticionRAG {
  rol: RolRAG
  prompt: string
  temperatura: number
  maxTokens: number
  timeoutMs: number
  penalizacionRepeticion?: number
}

async function ejecutar(modelo: string, p: PeticionRAG): Promise<string> {
  if (backendRAG() === 'nvidia') {
    const baseUrl = process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1'
    const respuesta = await axios.post(
      `${baseUrl}/chat/completions`,
      {
        model: modelo,
        messages: [{ role: 'user', content: p.prompt }],
        temperature: p.temperatura,
        top_p: 0.9,
        max_tokens: p.maxTokens,
        stream: false,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.NVIDIA_API_KEY || ''}`,
          'Content-Type': 'application/json',
        },
        timeout: p.timeoutMs,
      },
    )
    return respuesta.data?.choices?.[0]?.message?.content ?? ''
  }

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
  return respuesta.data.response
}

/**
 * Una llamada al modelo del papel que se pida, con el registro y la degradación
 * en un solo sitio.
 *
 * El registro cumple el criterio de poder saber a posteriori qué modelo atendió
 * cada respuesta sin enseñarlo en la interfaz. Sólo se anota la del principal:
 * la del auxiliar se dispara una vez por fragmento y llenaría el log de ruido,
 * así que ahí sólo se anota lo que se sale de lo previsto.
 */
export async function llamarModeloRAG(p: PeticionRAG): Promise<string> {
  const resuelto = await resolverModeloRAG(p.rol)
  const inicio = Date.now()

  try {
    const texto = await ejecutar(resuelto.modelo, p)
    if (p.rol === 'principal') {
      console.log(
        `[ModelosRAG] respuesta rol=${p.rol} efectivo=${resuelto.rolEfectivo} ` +
        `modelo="${resuelto.modelo}" ms=${Date.now() - inicio}`,
      )
    }
    return texto
  } catch (error) {
    const { auxiliar } = pareja()
    const lista = await instalados()
    const respaldo = p.rol === 'principal' && lista
      ? lista.find(m => coincide(auxiliar, m))
      : undefined

    if (!respaldo || respaldo === resuelto.modelo) throw error

    console.warn(
      `[ModelosRAG] "${resuelto.modelo}" falló (${error instanceof Error ? error.message : error}); ` +
      `se reintenta con el auxiliar "${respaldo}"`,
    )
    resueltos.set(p.rol, {
      modelo: respaldo,
      rolEfectivo: 'auxiliar',
      degradado: true,
      motivo: `"${resuelto.modelo}" falló al responder; responde el auxiliar "${respaldo}"`,
    })
    const texto = await ejecutar(respaldo, p)
    console.log(`[ModelosRAG] respuesta rol=${p.rol} efectivo=auxiliar modelo="${respaldo}" ms=${Date.now() - inicio}`)
    return texto
  }
}

/** Para las pruebas y para después de instalar o descargar un modelo. */
export function olvidarModelosRAG(): void {
  pendiente = null
  resueltos = new Map()
}
