/**
 * Un corte por inactividad con NVIDIA, por el camino entero de `sendMessage`
 * (#237): si el handler entrega lo que llegó, se muestra con el aviso y no se
 * repite la pregunta; si no llegó nada, se reintenta como antes.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/config/modelosRAG', () => ({
  cargarModelosRAG: async () => null,
  modeloFijadoRAG: () => ({ model: 'nemotron-3-ultra', provider: 'Nvidia' }),
  modeloElegido: () => null,
  modelosRAGEnCache: () => null,
}))
vi.mock('@/services/consentimientoNube', () => ({ consentirAlEnviar: async () => true }))

import { useChatStore } from './chatStore'
import i18n from '@/i18n'

let guardados: any[]
const sendMessage = vi.fn()

beforeEach(() => {
  guardados = []
  sendMessage.mockReset()
  Object.defineProperty(window, 'electronAPI', {
    writable: true,
    value: {
      database: {
        getSetting: async () => null,
        addMessageToConversation: async (_id: string, m: any) => { guardados.push(m); return { success: true } },
      },
      // Con fuentes, para que la revisión contra lo leído tuviera motivo para ejecutarse.
      agenticRAG: { query: async () => ({ success: true, data: { sources: [{ title: 'Manual', content: 'El golpe de ariete se calcula con Joukowsky.' }] } }) },
      networkRepository: { context: async () => ({ success: false }) },
      chat: { sendMessage },
    },
  })
  useChatStore.setState({
    conversations: [{ id: 'c1', title: 'Nueva', messages: [], model: 'nemotron-3-ultra', provider: 'Nvidia', createdAt: new Date(), updatedAt: new Date() }],
    activeConversationId: 'c1',
    isLoading: false,
    wisdomConfig: { enabled: true, categories: [], searchTopK: 3 } as any,
  })
})

const respuestaGuardada = () => guardados.filter(m => m.role === 'assistant').pop()

describe('un corte por inactividad con NVIDIA (#237)', () => {
  it('lo que llegó se muestra con el aviso, sin repetir la pregunta ni revisarla', async () => {
    sendMessage.mockResolvedValue({
      success: true,
      data: { response: 'El golpe de ariete se calcula con la fórmula de', metadata: { provider: 'Nvidia', finish_reason: 'inactividad' } },
    })

    await useChatStore.getState().sendMessage('¿Cómo se calcula el golpe de ariete?')

    expect(sendMessage).toHaveBeenCalledTimes(1)
    const r = respuestaGuardada()
    expect(r.content.startsWith('El golpe de ariete se calcula con la fórmula de')).toBe(true)
    expect(r.content).toContain(i18n.t('chat.cortadaPorInactividad'))
    expect(r.metadata.finish_reason).toBe('inactividad')
  })

  it('una respuesta completa no lleva el aviso', async () => {
    sendMessage.mockResolvedValue({
      success: true,
      data: { response: 'Con la fórmula de Joukowsky.', metadata: { provider: 'Nvidia', finish_reason: 'stop' } },
    })

    await useChatStore.getState().sendMessage('¿Cómo se calcula el golpe de ariete?')

    expect(respuestaGuardada().content).not.toContain(i18n.t('chat.cortadaPorInactividad'))
    // Y sí se revisa: es lo que hace significativo que la cortada no lo haga.
    expect(sendMessage.mock.calls.filter(([p]) => p.sinRazonar)).toHaveLength(1)
  })

  it('si no llegó nada, se reintenta como antes', async () => {
    sendMessage
      .mockResolvedValueOnce({ success: false, error: 'Nvidia timed out: 90 s sin enviar nada' })
      .mockResolvedValue({
        success: true,
        data: { response: 'Con la fórmula de Joukowsky.', metadata: { provider: 'Nvidia', finish_reason: 'stop' } },
      })

    await useChatStore.getState().sendMessage('¿Cómo se calcula el golpe de ariete?')

    // El reintento y, ya con respuesta completa, la revisión contra lo leído.
    expect(sendMessage.mock.calls.filter(([p]) => !p.sinRazonar)).toHaveLength(2)
    expect(respuestaGuardada().content).toContain('Joukowsky')
  })
})
