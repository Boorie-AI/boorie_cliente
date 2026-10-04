/**
 * El texto de la nube en pantalla mientras llega (#223), por el camino entero
 * de `sendMessage` y con un `electronAPI` falso que manda los trozos como el
 * proceso principal: limpio, sólo los de esta petición, sin restos de un
 * intento anterior, con «Revisando…» debajo y sin tirarlo si salta el límite
 * del chat.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/config/modelosRAG', () => ({
  cargarModelosRAG: async () => null,
  modeloFijadoRAG: () => ({ model: 'nemotron-3-ultra', provider: 'Nvidia' }),
  modeloElegido: () => null,
  modelosRAGEnCache: () => null,
}))
vi.mock('@/services/consentimientoNube', () => ({ consentirAlEnviar: async () => true }))

import { useChatStore } from './chatStore'
import i18n from '@/i18n'

type Espera = { proveedor: string; intento: number; total: number; segundos: number }
type Parcial = { idFlujo: string; texto: string; espera?: Espera }
type Peticion = { idFlujo: string; sinRazonar?: boolean }
type Guardado = { role: string; content: string; metadata?: Record<string, unknown> }

let guardados: Guardado[]
let oyentes: Array<(p: Parcial) => void>
let vistos: string[]
let dejarDeVer: () => void
const sendMessage = vi.fn()

const esperar = (ms: number) => new Promise(r => setTimeout(r, ms))
/** Lo que haría el proceso principal: mandar el texto acumulado a todos los que escuchan. */
const emitir = (idFlujo: string, texto: string) => oyentes.forEach(o => o({ idFlujo, texto }))
/** El aviso de espera por saturación (#266): repite el último texto y trae la espera. */
const avisar = (idFlujo: string, texto: string, espera: Espera) => oyentes.forEach(o => o({ idFlujo, texto, espera }))
const respuestaGuardada = () => guardados.filter(m => m.role === 'assistant').pop()!
const preguntar = () => useChatStore.getState().sendMessage('¿Cómo se calcula el golpe de ariete?')

beforeEach(() => {
  guardados = []
  oyentes = []
  vistos = []
  sendMessage.mockReset()
  Object.defineProperty(window, 'electronAPI', {
    writable: true,
    value: {
      database: {
        getSetting: async () => null,
        addMessageToConversation: async (_id: string, m: Guardado) => { guardados.push(m); return { success: true } },
      },
      agenticRAG: { query: async () => ({ success: true, data: { sources: [{ title: 'Manual', content: 'El golpe de ariete se calcula con Joukowsky.', page: 14 }] } }) },
      networkRepository: { context: async () => ({ success: false }) },
      chat: {
        sendMessage,
        onRespuestaParcial: (o: (p: Parcial) => void) => {
          oyentes.push(o)
          return () => { oyentes = oyentes.filter(x => x !== o) }
        },
      },
    },
  })
  useChatStore.setState({
    conversations: [{ id: 'c1', title: 'Nueva', messages: [], model: 'nemotron-3-ultra', provider: 'Nvidia', createdAt: new Date(), updatedAt: new Date() }],
    activeConversationId: 'c1',
    isLoading: false,
    streamingMessage: '',
    revisando: false,
    esperaDelProveedor: null,
    wisdomConfig: { enabled: true, categories: [], searchTopK: 3, searchMethod: 'agentic' },
  })
  dejarDeVer = useChatStore.subscribe((s, antes) => {
    if (s.streamingMessage !== antes.streamingMessage) vistos.push(s.streamingMessage.trimEnd())
  })
})

afterEach(() => {
  dejarDeVer()
  vi.useRealTimers()
})

describe('el texto de la nube en pantalla mientras llega (#223)', () => {
  it('pinta lo que llega de esta petición, limpio, e ignora lo de otro idFlujo', async () => {
    sendMessage.mockImplementation(async (p: Peticion) => {
      if (p.sinRazonar) return { success: true, data: { response: '[]', metadata: {} } }
      emitir(p.idFlujo, 'Se calcula con Joukowsky (p. 999). ')
      await esperar(150)
      emitir('otra-peticion', 'TEXTO DE OTRA CONVERSACIÓN ')
      emitir(p.idFlujo, 'Se calcula con Joukowsky (p. 999). Y la celeridad (p. 14). ')
      await esperar(150)
      return {
        success: true,
        data: { response: 'Se calcula con Joukowsky (p. 999). Y la celeridad (p. 14).', metadata: { provider: 'Nvidia', finish_reason: 'stop' } },
      }
    })

    await preguntar()

    const conTexto = vistos.filter(Boolean)
    expect(conTexto).toContain('Se calcula con Joukowsky.')
    expect(conTexto).toContain('Se calcula con Joukowsky. Y la celeridad (p. 14).')
    expect(conTexto.some(v => v.includes('999'))).toBe(false)
    expect(conTexto.some(v => v.includes('OTRA'))).toBe(false)
    // El id va en la petición de la respuesta y no en la de la revisión.
    const [respuesta, revision] = sendMessage.mock.calls.map(([p]) => p)
    expect(respuesta.idFlujo).toEqual(expect.any(String))
    expect(revision.sinRazonar).toBe(true)
    expect(revision.idFlujo).toBeUndefined()
    // Y al acabar se deja de escuchar.
    expect(oyentes).toEqual([])
    expect(respuestaGuardada().content.startsWith('Se calcula con Joukowsky. Y la celeridad (p. 14).')).toBe(true)
  })

  it('«Revisando…» va debajo del texto: el texto se queda en pantalla', async () => {
    let durante: { streamingMessage: string; revisando: boolean } | null = null
    sendMessage.mockImplementation(async (p: Peticion) => {
      if (p.sinRazonar) {
        const { streamingMessage, revisando } = useChatStore.getState()
        durante = { streamingMessage, revisando }
        return { success: true, data: { response: '[]', metadata: {} } }
      }
      emitir(p.idFlujo, 'Con la fórmula de Joukowsky. ')
      return { success: true, data: { response: 'Con la fórmula de Joukowsky.', metadata: { provider: 'Nvidia', finish_reason: 'stop' } } }
    })

    await preguntar()

    expect(durante).toEqual({ streamingMessage: 'Con la fórmula de Joukowsky.', revisando: true })
    expect(vistos).not.toContain(i18n.t('chat.revision.enCurso'))
    expect(useChatStore.getState().revisando).toBe(false)
  })

  it('al reintentar, lo del intento anterior se borra de la pantalla', async () => {
    sendMessage
      .mockImplementationOnce(async (p: Peticion) => {
        emitir(p.idFlujo, 'Primer intento a medias ')
        await esperar(150)
        return { success: false, error: 'Nvidia timed out: no terminó en 600 s' }
      })
      .mockImplementation(async (p: Peticion) => {
        if (p.sinRazonar) return { success: true, data: { response: '[]', metadata: {} } }
        // Un trozo rezagado del primer intento ya no cuenta.
        emitir(sendMessage.mock.calls[0][0].idFlujo, 'Primer intento a medias y rezagado ')
        emitir(p.idFlujo, 'Segundo intento ')
        await esperar(150)
        return { success: true, data: { response: 'Segundo intento.', metadata: { provider: 'Nvidia', finish_reason: 'stop' } } }
      })

    await preguntar()

    const primero = vistos.indexOf('Primer intento a medias')
    const segundo = vistos.indexOf('Segundo intento')
    expect(primero).toBeGreaterThanOrEqual(0)
    expect(segundo).toBeGreaterThan(primero)
    expect(vistos.slice(primero + 1, segundo)).toContain('')
    expect(vistos.some(v => v.includes('rezagado'))).toBe(false)
    expect(sendMessage.mock.calls[0][0].idFlujo).not.toBe(sendMessage.mock.calls[1][0].idFlujo)
  })

  it('con herramientas: el texto retirado deja la pantalla vacía, y la respuesta final manda aunque sea otra (#251)', async () => {
    let trasRetirar: string | null = null
    sendMessage.mockImplementation(async (p: Peticion) => {
      if (p.sinRazonar) return { success: true, data: { response: '[]', metadata: {} } }
      emitir(p.idFlujo, 'Voy a mirar el bombeo. ')
      await esperar(150)
      // La vuelta acabó pidiendo herramientas: el proceso principal retira lo que había.
      emitir(p.idFlujo, '')
      await esperar(150)
      trasRetirar = useChatStore.getState().streamingMessage
      emitir(p.idFlujo, 'Ahorrarás un 23 % moviendo el bombeo. ')
      await esperar(150)
      // Y al final la sustituye la propuesta de Boorie.
      return {
        success: true,
        data: { response: 'Puedo analizar el consumo de bombeo de tu red.', metadata: { provider: 'Nvidia', finish_reason: 'stop', propuesta_energia: { red_id: 'n1' } } },
      }
    })

    await preguntar()

    expect(vistos).toContain('Voy a mirar el bombeo.')
    expect(trasRetirar).toBe('')
    const ultimoConTexto = vistos.filter(Boolean).at(-1)!
    expect(ultimoConTexto.startsWith('Puedo analizar el consumo de bombeo de tu red.')).toBe(true)
    expect(useChatStore.getState().streamingMessage).toBe('')
    expect(respuestaGuardada().content).not.toContain('23 %')
    expect(respuestaGuardada().content.startsWith('Puedo analizar el consumo de bombeo de tu red.')).toBe(true)
  })

  it('si salta el límite del chat con texto recibido, se guarda lo recibido con su aviso', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let terminar: (r: unknown) => void = () => {}
    sendMessage.mockImplementation((p: Peticion) => {
      emitir(p.idFlujo, 'La primera mitad del informe ')
      return new Promise(r => { terminar = r })
    })

    const enviando = preguntar()
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalled())
    await vi.advanceTimersByTimeAsync(661_000)
    await enviando

    const r = respuestaGuardada()
    expect(r.content).toBe(`La primera mitad del informe\n\n---\n\n*${i18n.t('chat.cortadaPorTiempo')}*`)
    expect(r.metadata?.finish_reason).toBe('tiempo_total')

    // Lo que acabe después ya no añade otra respuesta.
    terminar({ success: true, data: { response: 'La primera mitad del informe y el resto.', metadata: { finish_reason: 'stop' } } })
    await vi.advanceTimersByTimeAsync(10)
    expect(guardados.filter(m => m.role === 'assistant')).toHaveLength(1)
  })

  it('si salta sin haber recibido nada, sigue el mensaje de tiempo agotado', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    sendMessage.mockImplementation(() => new Promise(() => {}))

    const enviando = preguntar()
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalled())
    await vi.advanceTimersByTimeAsync(661_000)
    await enviando

    expect(respuestaGuardada().content).toBe(i18n.t('messages.chatTimeout'))
  })
})

describe('aviso de espera por saturación (#266)', () => {
  const espera = { proveedor: 'NVIDIA', intento: 2, total: 4, segundos: 8 }

  it('sale con el aviso de esta petición, no toca el texto y se quita en cuanto llega texto', async () => {
    const visto: Record<string, unknown> = {}
    sendMessage.mockImplementation(async (p: Peticion) => {
      if (p.sinRazonar) {
        visto.enLaRevision = useChatStore.getState().esperaDelProveedor
        return { success: true, data: { response: '[]', metadata: {} } }
      }
      avisar('otra-peticion', '', espera)
      visto.deOtra = useChatStore.getState().esperaDelProveedor
      emitir(p.idFlujo, 'Con la fórmula ')
      await esperar(150)
      const antes = Date.now()
      avisar(p.idFlujo, 'Con la fórmula ', espera)
      visto.aviso = useChatStore.getState().esperaDelProveedor
      visto.textoConAviso = useChatStore.getState().streamingMessage
      visto.margen = [antes + 8000, Date.now() + 8000]
      emitir(p.idFlujo, 'Con la fórmula de Joukowsky. ')
      visto.trasTexto = useChatStore.getState().esperaDelProveedor
      await esperar(150)
      return { success: true, data: { response: 'Con la fórmula de Joukowsky.', metadata: { provider: 'Nvidia', finish_reason: 'stop' } } }
    })

    await preguntar()

    expect(visto.deOtra).toBeNull()
    expect(visto.aviso).toMatchObject({ proveedor: 'NVIDIA', intento: 2, total: 4 })
    const [desde, hasta] = visto.margen as number[]
    const { hasta: vuelve } = visto.aviso as { hasta: number }
    expect(vuelve).toBeGreaterThanOrEqual(desde)
    expect(vuelve).toBeLessThanOrEqual(hasta)
    expect((visto.textoConAviso as string).trimEnd()).toBe('Con la fórmula')
    expect(visto.trasTexto).toBeNull()
    expect(visto.enLaRevision).toBeNull()
    expect(useChatStore.getState().esperaDelProveedor).toBeNull()
  })

  it('sin texto nuevo tras el aviso, se va al terminar la petición', async () => {
    let enLaRevision: unknown = 'sin mirar'
    sendMessage.mockImplementation(async (p: Peticion) => {
      if (p.sinRazonar) {
        enLaRevision = useChatStore.getState().esperaDelProveedor
        return { success: true, data: { response: '[]', metadata: {} } }
      }
      avisar(p.idFlujo, '', espera)
      return { success: true, data: { response: 'Respuesta entera.', metadata: { provider: 'Nvidia', finish_reason: 'stop' } } }
    })

    await preguntar()

    expect(enLaRevision).toBeNull()
    expect(useChatStore.getState().esperaDelProveedor).toBeNull()
  })

  it('si la petición falla, tampoco se queda', async () => {
    sendMessage.mockImplementation(async (p: Peticion) => {
      avisar(p.idFlujo, '', espera)
      return { success: false, error: 'Service temporarily overloaded' }
    })

    await preguntar()

    expect(useChatStore.getState().esperaDelProveedor).toBeNull()
  })
})
