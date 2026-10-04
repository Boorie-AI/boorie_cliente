/**
 * La especificación pide dos Nemotron fijos, uno por papel, invisibles para el
 * usuario (#49). Aquí se prueba lo que puede desviarse de eso sin que nadie se
 * dé cuenta: que el papel elija el modelo equivocado, que la falta de un modelo
 * se convierta en un fallo mudo, y que el desplegable vuelva a aparecer solo.
 */

import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest'
import axios from 'axios'
import { inspect } from 'util'
import {
  CLAVE_MOTOR_RAG,
  FalloDeNvidia,
  LimiteDePeticiones,
  PAREJAS,
  REINTENTOS_POR_LIMITE,
  backendRAG,
  cargarMotorRAG,
  cerrarRegistroRAG,
  empezarRegistroRAG,
  esperaTrasLimite,
  estadoModelosRAG,
  guardarMotorRAG,
  llamarModeloRAG,
  olvidarModelosRAG,
  resolverModeloRAG,
  revisarMotorRAG,
  selectorModeloVisible,
  usarClaveNvidiaDe,
} from './modelosRAG'
import { aceptarConsentimiento, cargarConsentimientos, retirarConsentimiento } from '../../security/consentimientoNube'

vi.mock('axios')

const instalados = (...nombres: string[]) =>
  vi.mocked(axios.get).mockResolvedValue({ data: { models: nombres.map(name => ({ name })) } } as never)

function ajustesEnMemoria() {
  const filas = new Map<string, string>()
  return {
    appSetting: {
      findUnique: async ({ where }: { where: { key: string } }) => (filas.has(where.key) ? { value: filas.get(where.key)! } : null),
      upsert: async ({ where, create, update }: any) => { filas.set(where.key, filas.has(where.key) ? update.value : create.value) },
    },
  }
}

const peticion = { prompt: 'hola', tarea: 'redactar' as const, temperatura: 0.3, maxTokens: 100, timeoutMs: 1000 }

const localPorDefecto = { ...PAREJAS.ollama }

/**
 * La pareja local es hoy el mismo modelo en los dos papeles, porque el grande
 * no es servible por CPU. Para probar el reparto y la degradación hace falta una
 * pareja distinta: es la que habrá en cuanto haya hardware, y la lógica tiene
 * que seguir en pie cuando llegue.
 */
const conParejaDistinta = () => {
  PAREJAS.ollama.principal = 'nemotron-3-nano'
  PAREJAS.ollama.auxiliar = 'nemotron-mini'
}

describe('modelos de la ruta del RAG', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    olvidarModelosRAG()
    delete process.env.BOORIE_RAG_BACKEND
    delete process.env.BOORIE_RAG_MODELO_PRINCIPAL
    delete process.env.BOORIE_RAG_MODELO_AUXILIAR
    delete process.env.BOORIE_SELECTOR_MODELO
    delete process.env.NVIDIA_API_KEY
    usarClaveNvidiaDe(async () => null)
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    PAREJAS.ollama = { ...localPorDefecto }
  })

  it('los dos papeles los atiende un Nemotron', async () => {
    instalados('nemotron-mini:latest', 'llama3.2:latest')

    expect((await resolverModeloRAG('principal')).modelo).toBe('nemotron-mini:latest')
    expect((await resolverModeloRAG('auxiliar')).modelo).toBe('nemotron-mini:latest')
  })

  it('con pareja distinta, el grande redacta y el pequeño gradúa, no al revés', async () => {
    conParejaDistinta()
    instalados('nemotron-3-nano:latest', 'nemotron-mini:latest', 'llama3.2:latest')

    expect((await resolverModeloRAG('principal')).modelo).toBe('nemotron-3-nano:latest')
    expect((await resolverModeloRAG('auxiliar')).modelo).toBe('nemotron-mini:latest')
  })

  it('no se cuela nada que no sea Nemotron aunque esté instalado', async () => {
    // Antes se elegía por una lista que empezaba por llama3.2, phi3 y mistral.
    instalados('llama3.2:latest', 'phi3:latest', 'mistral:latest')

    const principal = await resolverModeloRAG('principal')
    expect(principal.modelo).toContain('nemotron')
    expect(principal.motivo).toMatch(/no está instalado/)
  })

  it('sin el principal responde el auxiliar, y se dice', async () => {
    conParejaDistinta()
    instalados('nemotron-mini:latest')

    const resuelto = await resolverModeloRAG('principal')
    expect(resuelto.modelo).toBe('nemotron-mini:latest')
    expect(resuelto.rolEfectivo).toBe('auxiliar')
    expect(resuelto.degradado).toBe(true)
    expect(resuelto.motivo).toBeTruthy()
  })

  it('la degradación no va en el otro sentido: graduar con el grande son minutos', async () => {
    conParejaDistinta()
    instalados('nemotron-3-nano:latest')

    const resuelto = await resolverModeloRAG('auxiliar')
    expect(resuelto.modelo).not.toBe('nemotron-3-nano:latest')
    expect(resuelto.degradado).toBe(false)
  })

  it('con Ollama caído no se degrada a un modelo que tampoco está', async () => {
    // Degradar aquí sólo duplicaría la espera de cada documento.
    vi.mocked(axios.get).mockRejectedValue(new Error('ECONNREFUSED'))

    const resuelto = await resolverModeloRAG('principal')
    expect(resuelto.modelo).toBe(PAREJAS.ollama.principal)
    expect(resuelto.degradado).toBe(false)
  })

  it('se pregunta el inventario una vez, no una por documento', async () => {
    instalados('nemotron-mini:latest')
    await Promise.all([
      resolverModeloRAG('auxiliar'),
      resolverModeloRAG('auxiliar'),
      resolverModeloRAG('principal'),
    ])

    expect(axios.get).toHaveBeenCalledTimes(1)
  })

  it('lo configurado a mano manda, aunque no esté descargado', async () => {
    process.env.BOORIE_RAG_MODELO_PRINCIPAL = 'un-nemotron-mio'
    instalados('nemotron-mini:latest')

    expect((await resolverModeloRAG('principal')).modelo).toBe('un-nemotron-mio')
    expect(axios.get).not.toHaveBeenCalled()
  })

  it('si el principal falla al responder, contesta el auxiliar en vez de nadie', async () => {
    conParejaDistinta()
    instalados('nemotron-3-nano:latest', 'nemotron-mini:latest')
    vi.mocked(axios.post)
      .mockRejectedValueOnce(new Error('500 Internal Server Error'))
      .mockResolvedValueOnce({ data: { response: 'respuesta del auxiliar' } } as never)

    expect(await llamarModeloRAG({ ...peticion, rol: 'principal' })).toBe('respuesta del auxiliar')

    const [, cuerpo] = vi.mocked(axios.post).mock.calls[1] as [string, any]
    expect(cuerpo.model).toBe('nemotron-mini:latest')
    expect((await estadoModelosRAG()).degradado).toBe(true)
  })

  it('el tope va con el nombre que Ollama entiende', async () => {
    instalados('nemotron-mini:latest')
    vi.mocked(axios.post).mockResolvedValue({ data: { response: '{}' } } as never)

    await llamarModeloRAG({ ...peticion, rol: 'auxiliar', maxTokens: 200 })

    const [url, cuerpo] = vi.mocked(axios.post).mock.calls[0] as [string, any]
    expect(url).toContain('/api/generate')
    expect(cuerpo.options.num_predict).toBe(200)
    expect(cuerpo.options.max_tokens).toBeUndefined()
  })

  it('con el backend de NVIDIA se habla su API y con su pareja', async () => {
    process.env.BOORIE_RAG_BACKEND = 'nvidia'
    const ajustes = ajustesEnMemoria()
    await cargarConsentimientos(ajustes)
    await aceptarConsentimiento(ajustes, 'nvidia')
    usarClaveNvidiaDe(async () => 'nvapi-FAKErag0123456789abcdefghijklmnop')
    vi.mocked(axios.post).mockResolvedValue(
      { data: { choices: [{ message: { content: 'respuesta' } }] } } as never,
    )

    expect(await backendRAG()).toBe('nvidia')
    expect(await llamarModeloRAG({ ...peticion, rol: 'principal' })).toBe('respuesta')

    const [url, cuerpo] = vi.mocked(axios.post).mock.calls[0] as [string, any]
    expect(url).toContain('/chat/completions')
    expect(cuerpo.model).toBe('nvidia/nemotron-3-ultra-550b-a55b')
    // Y no se pregunta a Ollama por un inventario que no pinta nada aquí.
    expect(axios.get).not.toHaveBeenCalled()
    // La clave es la del proveedor NVIDIA, no una variable de entorno (#225).
    expect((vi.mocked(axios.post).mock.calls[0][2] as any).headers.Authorization).toBe('Bearer nvapi-FAKErag0123456789abcdefghijklmnop')
    await retirarConsentimiento(ajustes, 'nvidia')
  })

  it('con BOORIE_RAG_BACKEND=nvidia pero sin consentimiento, la pareja local (#225, R20)', async () => {
    process.env.BOORIE_RAG_BACKEND = 'nvidia'
    await cargarConsentimientos(ajustesEnMemoria())
    instalados('nemotron-mini')
    vi.mocked(axios.post).mockResolvedValue({ data: { response: 'local' } } as never)

    expect(await backendRAG()).toBe('ollama')
    expect(await llamarModeloRAG({ ...peticion, rol: 'principal' })).toBe('local')
    expect(vi.mocked(axios.post).mock.calls[0][0]).toContain('/api/generate')
  })

  it('el desplegable de modelos está oculto salvo que se pida a mano', () => {
    expect(selectorModeloVisible()).toBe(false)

    process.env.BOORIE_SELECTOR_MODELO = '1'
    expect(selectorModeloVisible()).toBe(true)
  })
})

/** Lo que se le pasa a `axios.post`: la URL, el cuerpo y las opciones con la clave. */
type LlamadaNvidia = [string, { model: string; messages: Array<{ content: string }>; chat_template_kwargs?: unknown }, { headers: Record<string, string> }]
const llamada = (n: number) => vi.mocked(axios.post).mock.calls[n] as unknown as LlamadaNvidia

const CLAVE_GUARDADA = 'nvapi-GUARDADAfake0123456789abcdefghijklmn'
const respuestaNvidia = (content: string) => ({ data: { choices: [{ message: { content } }] } })
const error429 = (retryAfter?: string) => Object.assign(new Error('Request failed with status code 429'), {
  response: { status: 429, headers: retryAfter ? { 'retry-after': retryAfter } : {} },
})

describe('dónde se procesa la búsqueda, desde Configuración (#224)', () => {
  let ajustes: ReturnType<typeof ajustesEnMemoria>
  let registros: MockInstance
  let avisos: MockInstance

  /** La base de la app instalada: el ajuste, el consentimiento y la clave guardada; nada en el entorno. */
  async function instalada({ motor = 'nvidia', consentido = true, clave = CLAVE_GUARDADA }: { motor?: string; consentido?: boolean; clave?: string | null } = {}) {
    ajustes = ajustesEnMemoria()
    await ajustes.appSetting.upsert({ where: { key: CLAVE_MOTOR_RAG }, create: { key: CLAVE_MOTOR_RAG, value: motor }, update: { value: motor } })
    await cargarConsentimientos(ajustes)
    if (consentido) await aceptarConsentimiento(ajustes, 'nvidia')
    usarClaveNvidiaDe(async () => clave)
    await cargarMotorRAG(ajustes)
  }

  beforeEach(() => {
    vi.clearAllMocks()
    olvidarModelosRAG()
    for (const v of ['BOORIE_RAG_BACKEND', 'BOORIE_RAG_MODELO_PRINCIPAL', 'BOORIE_RAG_MODELO_AUXILIAR', 'NVIDIA_API_KEY']) delete process.env[v]
    registros = vi.spyOn(console, 'log').mockImplementation(() => {})
    avisos = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(async () => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    await cargarConsentimientos(ajustesEnMemoria())
    await cargarMotorRAG(ajustesEnMemoria())
    usarClaveNvidiaDe(async () => null)
  })

  it('con el ajuste en NVIDIA y la clave guardada, sin entorno, reformular y graduar van a NVIDIA con la clave del almacén', async () => {
    await instalada()
    vi.mocked(axios.post).mockResolvedValue(respuestaNvidia('{"relevant": true}') as never)

    const estado = await revisarMotorRAG()
    expect(estado).toEqual({ ajuste: 'nvidia', pedido: 'nvidia', porEntorno: false, efectivo: 'nvidia' })

    await llamarModeloRAG({ ...peticion, rol: 'auxiliar', tarea: 'graduar' })
    const [url, cuerpo, opciones] = llamada(0)
    expect(url).toBe('https://integrate.api.nvidia.com/v1/chat/completions')
    expect(cuerpo.model).toBe(PAREJAS.nvidia.auxiliar)
    // Lightning razona si no se le dice: con 200 tokens devolvía el razonamiento cortado y ningún JSON.
    expect(cuerpo.chat_template_kwargs).toEqual({ enable_thinking: false })
    expect(opciones.headers.Authorization).toBe(`Bearer ${CLAVE_GUARDADA}`)
    expect(axios.get).not.toHaveBeenCalled()
  })

  it('guardar el ajuste lo deja en la base y cambia el motor sin reiniciar', async () => {
    await instalada({ motor: 'ollama' })
    expect(await backendRAG()).toBe('ollama')

    const estado = await guardarMotorRAG(ajustes, 'nvidia')
    expect(estado.efectivo).toBe('nvidia')
    expect(await ajustes.appSetting.findUnique({ where: { key: CLAVE_MOTOR_RAG } })).toEqual({ value: 'nvidia' })
    expect(await backendRAG()).toBe('nvidia')
  })

  it('la variable de entorno manda sobre el ajuste, en los dos sentidos', async () => {
    await instalada({ motor: 'nvidia' })
    process.env.BOORIE_RAG_BACKEND = 'ollama'
    expect(await revisarMotorRAG()).toMatchObject({ ajuste: 'nvidia', pedido: 'ollama', porEntorno: true, efectivo: 'ollama' })

    await instalada({ motor: 'ollama' })
    process.env.BOORIE_RAG_BACKEND = 'nvidia'
    expect(await revisarMotorRAG()).toMatchObject({ ajuste: 'ollama', pedido: 'nvidia', porEntorno: true, efectivo: 'nvidia' })
  })

  it('NVIDIA_API_KEY en el entorno manda sobre la clave guardada', async () => {
    await instalada()
    process.env.NVIDIA_API_KEY = 'nvapi-DELENTORNOfake0123456789abcdefghijk'
    vi.mocked(axios.post).mockResolvedValue(respuestaNvidia('ok') as never)

    await llamarModeloRAG({ ...peticion, rol: 'auxiliar', tarea: 'reformular' })
    expect(llamada(0)[2].headers.Authorization).toBe('Bearer nvapi-DELENTORNOfake0123456789abcdefghijk')
  })

  it('sin clave de NVIDIA la búsqueda sigue en local y el estado dice por qué', async () => {
    await instalada({ clave: null })
    instalados('nemotron-mini:latest')
    vi.mocked(axios.post).mockResolvedValue({ data: { response: 'local' } } as never)

    expect(await revisarMotorRAG()).toMatchObject({ pedido: 'nvidia', efectivo: 'ollama', motivo: 'sinClave' })
    expect((await estadoModelosRAG()).motor.motivo).toBe('sinClave')
    expect(await llamarModeloRAG({ ...peticion, rol: 'auxiliar', tarea: 'graduar' })).toBe('local')
    expect(vi.mocked(axios.post).mock.calls[0][0]).toContain('/api/generate')
  })

  it('sin consentimiento para NVIDIA la búsqueda sigue en local aunque haya clave', async () => {
    await instalada({ consentido: false })
    instalados('nemotron-mini:latest')
    vi.mocked(axios.post).mockResolvedValue({ data: { response: 'local' } } as never)

    expect(await revisarMotorRAG()).toMatchObject({ efectivo: 'ollama', motivo: 'sinConsentimiento' })
    await llamarModeloRAG({ ...peticion, rol: 'auxiliar', tarea: 'graduar' })
    expect(vi.mocked(axios.post).mock.calls[0][0]).toContain('/api/generate')
  })

  it('al guardar la clave después, la siguiente pregunta ya va a NVIDIA', async () => {
    let clave: string | null = null
    await instalada()
    usarClaveNvidiaDe(async () => clave)
    expect((await revisarMotorRAG()).efectivo).toBe('ollama')

    clave = CLAVE_GUARDADA
    expect((await revisarMotorRAG()).efectivo).toBe('nvidia')
    expect((await resolverModeloRAG('auxiliar')).modelo).toBe(PAREJAS.nvidia.auxiliar)
  })

  it('un 429 espera lo que dice Retry-After y reintenta, sin perder la respuesta', async () => {
    await instalada()
    vi.useFakeTimers()
    vi.mocked(axios.post)
      .mockRejectedValueOnce(error429('3'))
      .mockResolvedValueOnce(respuestaNvidia('{"relevant": true}') as never)
    empezarRegistroRAG()

    const llamada = llamarModeloRAG({ ...peticion, rol: 'auxiliar', tarea: 'graduar' })
    await vi.advanceTimersByTimeAsync(2999)
    expect(axios.post).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(await llamada).toBe('{"relevant": true}')
    expect(axios.post).toHaveBeenCalledTimes(2)
    expect(cerrarRegistroRAG()).toMatch(/graduar=nvidia ".*lightning.*" \(1 llamada, .*1 reintentos por 429\)/)
  })

  it('si el 429 no cesa, se deja de esperar con un error que lo dice', async () => {
    await instalada()
    vi.useFakeTimers()
    vi.mocked(axios.post).mockRejectedValue(error429())

    const llamada = llamarModeloRAG({ ...peticion, rol: 'auxiliar', tarea: 'graduar' }).catch(e => e)
    await vi.advanceTimersByTimeAsync(120_000)
    const error = await llamada
    expect(error).toBeInstanceOf(LimiteDePeticiones)
    expect(axios.post).toHaveBeenCalledTimes(REINTENTOS_POR_LIMITE + 1)
    expect(avisos).toHaveBeenCalledWith(expect.stringContaining('429'))
  })

  it('el «Service temporarily overloaded» (503) también se espera y se reintenta', async () => {
    await instalada()
    vi.useFakeTimers()
    vi.mocked(axios.post)
      .mockRejectedValueOnce(Object.assign(new Error('Request failed with status code 503'), { response: { status: 503, headers: {} } }))
      .mockResolvedValueOnce(respuestaNvidia('ok') as never)

    const llamada = llamarModeloRAG({ ...peticion, rol: 'auxiliar', tarea: 'graduar' })
    await vi.advanceTimersByTimeAsync(3000)
    expect(await llamada).toBe('ok')
    expect(axios.post).toHaveBeenCalledTimes(2)
  })

  it('un fallo de NVIDIA se puede escribir en el log sin sacar la clave', async () => {
    await instalada()
    // Así es el error de axios: con la petición dentro, y en ella la cabecera con la clave.
    vi.mocked(axios.post).mockRejectedValue(Object.assign(new Error('Request failed with status code 400'), {
      config: { headers: { Authorization: `Bearer ${CLAVE_GUARDADA}` } },
      request: { _header: `POST /v1/chat/completions HTTP/1.1\r\nAuthorization: Bearer ${CLAVE_GUARDADA}` },
      response: { status: 400, headers: {} },
    }))

    const error = await llamarModeloRAG({ ...peticion, rol: 'auxiliar', tarea: 'graduar' }).catch(e => e)
    expect(error).toBeInstanceOf(FalloDeNvidia)
    expect(error.status).toBe(400)
    expect(inspect(error, { depth: 10 })).not.toContain(CLAVE_GUARDADA)
  })

  it('la espera tras un 429: Retry-After en segundos o como fecha, y si no viene, exponencial con tope', () => {
    expect(esperaTrasLimite('7', 0)).toBe(7000)
    expect(esperaTrasLimite('Sat, 04 Oct 2026 10:00:05 GMT', 0, Date.parse('Sat, 04 Oct 2026 10:00:00 GMT'))).toBe(5000)
    expect(esperaTrasLimite('3600', 0)).toBe(60_000)
    const primera = esperaTrasLimite(undefined, 0)
    const tercera = esperaTrasLimite(undefined, 2)
    expect(primera).toBeGreaterThanOrEqual(2000)
    expect(primera).toBeLessThanOrEqual(2500)
    expect(tercera).toBeGreaterThanOrEqual(8000)
    expect(tercera).toBeLessThanOrEqual(10_000)
  })

  it('el registro de la pregunta dice qué modelo atendió cada papel', async () => {
    await instalada()
    vi.mocked(axios.post).mockResolvedValue(respuestaNvidia('ok') as never)
    empezarRegistroRAG()
    await llamarModeloRAG({ ...peticion, rol: 'auxiliar', tarea: 'reformular' })
    await llamarModeloRAG({ ...peticion, rol: 'auxiliar', tarea: 'graduar' })
    await llamarModeloRAG({ ...peticion, rol: 'auxiliar', tarea: 'graduar' })

    const linea = cerrarRegistroRAG({ redacta: 'el modelo del chat' })
    expect(linea).toContain(`reformular=nvidia "${PAREJAS.nvidia.auxiliar}" (1 llamada`)
    expect(linea).toContain(`graduar=nvidia "${PAREJAS.nvidia.auxiliar}" (2 llamadas`)
    expect(linea).toContain('redactar=el modelo del chat')
    expect(registros).toHaveBeenCalledWith(expect.stringContaining('[ModelosRAG] papeles de la pregunta'))
  })
})
