import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useChatStore, type Conversation } from '@/stores/chatStore'

const copiar = vi.hoisted(() => vi.fn())
vi.mock('./copiarConversacion', async (original) => ({
  ...(await original<typeof import('./copiarConversacion')>()),
  copiarAlPortapapeles: copiar,
}))
// Los selectores de la cabecera hablan con el proceso principal; aquí sobran.
vi.mock('./ModelSelector', () => ({ ModelSelector: () => null }))
vi.mock('./WisdomSelector', () => ({ WisdomSelector: () => null }))
vi.mock('./ProjectSelector', () => ({ ProjectSelector: () => null }))
vi.mock('./RedEnContexto', () => ({ RedEnContexto: () => null }))
vi.mock('@/components/nube/MarcaDeNube', () => ({ MarcaDeNube: () => null }))

import { ChatHeader } from './ChatHeader'

const conversacion = (mensajes: Conversation['messages']): Conversation => ({
  id: 'c1', title: 'Red de Pachuca', messages: mensajes, createdAt: new Date(), updatedAt: new Date(),
} as Conversation)

const mensajes: Conversation['messages'] = [
  { id: 'm1', role: 'user', content: 'Hola', timestamp: new Date() },
  { id: 'm2', role: 'assistant', content: '**Buenas**', timestamp: new Date() },
]

describe('ChatHeader: copiar la conversación (#234)', () => {
  beforeEach(() => {
    copiar.mockReset()
    useChatStore.setState({ asegurarBaseDeConocimiento: async () => {} })
  })

  it('el botón visible copia texto y HTML y avisa de que se copió', async () => {
    copiar.mockResolvedValue(undefined)
    render(<ChatHeader conversation={conversacion(mensajes)} />)
    await userEvent.click(screen.getByRole('button', { name: 'Copiar la conversación' }))

    expect(copiar).toHaveBeenCalledTimes(1)
    const { texto, html } = copiar.mock.calls[0][0]
    expect(texto).toContain('Usuario:\nHola')
    expect(html).toContain('<strong>Buenas</strong>')
    expect(await screen.findByRole('status')).toHaveTextContent('Copiado')
  })

  it('si el portapapeles falla lo dice', async () => {
    copiar.mockRejectedValue(new Error('denegado'))
    render(<ChatHeader conversation={conversacion(mensajes)} />)
    await userEvent.click(screen.getByTestId('chat-copiar-conversacion'))
    expect(await screen.findByRole('status')).toHaveTextContent('No se pudo copiar')
  })

  it('sin mensajes no hay nada que copiar', () => {
    render(<ChatHeader conversation={conversacion([])} />)
    expect(screen.getByTestId('chat-copiar-conversacion')).toBeDisabled()
  })
})
