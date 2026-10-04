import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import axios from 'axios'
import { consultasEnLaNube } from './consultasEnLaNube'
import { olvidarModelosRAG, usarClaveNvidiaDe } from './modelosRAG'
import { aceptarConsentimiento, cargarConsentimientos } from '../../security/consentimientoNube'

vi.mock('axios')

/** Lo que se le pasa a `axios.post`: la URL, el cuerpo y las opciones con la clave. */
type LlamadaNvidia = [string, { model: string; messages: Array<{ content: string }>; chat_template_kwargs?: unknown }, { headers: Record<string, string> }]
const llamada = (n: number) => vi.mocked(axios.post).mock.calls[n] as unknown as LlamadaNvidia

function ajustes() {
  const filas = new Map<string, string>()
  return {
    appSetting: {
      findUnique: async ({ where }: { where: { key: string } }) => (filas.has(where.key) ? { value: filas.get(where.key)! } : null),
      upsert: async ({ where, create, update }: { where: { key: string }; create: { value: string }; update: { value: string } }) => { filas.set(where.key, filas.has(where.key) ? update.value : create.value) },
    },
  }
}

const peticion = {
  pregunta: '¿Cómo calcula Walton la pérdida de carga en el pozo?',
  idioma: 'en' as const,
  proveedor: 'nvidia',
  modelo: 'nvidia/nemotron-3-ultra-550b-a55b',
}

describe('consultas en el idioma del adjunto, escritas en la nube (#224)', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    olvidarModelosRAG()
    delete process.env.NVIDIA_API_KEY
    usarClaveNvidiaDe(async () => 'nvapi-FAKEconsultas0123456789abcdefghijk')
    await cargarConsentimientos(ajustes())
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    usarClaveNvidiaDe(async () => null)
  })

  it('las escribe el modelo que redacta, sin razonar, con la clave guardada, y sólo con la pregunta', async () => {
    const a = ajustes()
    await cargarConsentimientos(a)
    await aceptarConsentimiento(a, 'nvidia')
    vi.mocked(axios.post).mockResolvedValue({ data: { choices: [{ message: { content: 'Walton well loss equation\nwell loss coefficient units\n¿Qué es esto?' } }] } } as never)

    const r = await consultasEnLaNube(peticion)

    expect(r.consultas).toEqual(['Walton well loss equation', 'well loss coefficient units'])
    const [, cuerpo, opciones] = llamada(0)
    expect(cuerpo.model).toBe('nvidia/nemotron-3-ultra-550b-a55b')
    expect(cuerpo.chat_template_kwargs).toEqual({ enable_thinking: false })
    expect(cuerpo.messages[0].content).toContain('escrito en inglés')
    expect(opciones.headers.Authorization).toBe('Bearer nvapi-FAKEconsultas0123456789abcdefghijk')
  })

  it('sin consentimiento para NVIDIA no sale nada', async () => {
    const r = await consultasEnLaNube(peticion)
    expect(r).toEqual({ consultas: [], motivo: 'sin consentimiento para NVIDIA' })
    expect(axios.post).not.toHaveBeenCalled()
  })

  it('otro proveedor no las escribe aquí', async () => {
    const r = await consultasEnLaNube({ ...peticion, proveedor: 'Anthropic' })
    expect(r.consultas).toEqual([])
    expect(axios.post).not.toHaveBeenCalled()
  })

  it('si NVIDIA falla, ninguna consulta y el motivo, en vez de un error', async () => {
    const a = ajustes()
    await cargarConsentimientos(a)
    await aceptarConsentimiento(a, 'nvidia')
    vi.mocked(axios.post).mockRejectedValue(new Error('timeout of 60000ms exceeded'))

    expect(await consultasEnLaNube(peticion)).toEqual({ consultas: [], motivo: 'NVIDIA: timeout of 60000ms exceeded' })
  })
})
