/**
 * El adjunto del chat: que un documento sin texto lo diga en vez de no hacer
 * nada (#197), y que el adjunto viaje aparte de la pregunta (#194).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MessageInput } from './MessageInput'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (clave: string, valores?: Record<string, unknown>) =>
      valores ? `${clave} ${JSON.stringify(valores)}` : clave,
  }),
}))

const sendMessage = vi.fn()
vi.mock('@/stores/chatStore', () => ({
  useChatStore: () => ({ sendMessage, isLoading: false }),
}))

const pickAttachment = vi.fn()

beforeEach(() => {
  sendMessage.mockReset()
  pickAttachment.mockReset()
  ;(window as unknown as { electronAPI: unknown }).electronAPI = { chat: { pickAttachment } }
})

describe('adjuntar un documento', () => {
  it('uno sin texto dice por qué, con el nombre del fichero', async () => {
    pickAttachment.mockResolvedValue({ success: false, fileName: 'acta_escaneada.pdf', clave: 'wisdom.sinTexto.vacio' })
    render(<MessageInput />)
    await userEvent.click(screen.getByTitle('chatInput.attach'))
    expect(await screen.findByText('chatInput.adjunto.sinTexto.vacio {"fichero":"acta_escaneada.pdf"}')).toBeTruthy()
  })

  it('cancelar el diálogo no enseña ningún error', async () => {
    pickAttachment.mockResolvedValue({ success: false, message: 'No file selected' })
    const { container } = render(<MessageInput />)
    await userEvent.click(screen.getByTitle('chatInput.attach'))
    await waitFor(() => expect(pickAttachment).toHaveBeenCalled())
    expect(container.querySelector('.text-destructive')).toBeNull()
  })

  it('la pregunta y el documento se envían por separado', async () => {
    pickAttachment.mockResolvedValue({ success: true, fileName: 'informe.pdf', content: 'MEMORIA DE CÁLCULO' })
    render(<MessageInput />)
    await userEvent.click(screen.getByTitle('chatInput.attach'))
    await screen.findByText('informe.pdf')
    await userEvent.type(screen.getByRole('textbox'), '¿Qué diámetro tiene la P-120-15?{Enter}')
    expect(sendMessage).toHaveBeenCalledWith('¿Qué diámetro tiene la P-120-15?', { nombre: 'informe.pdf', texto: 'MEMORIA DE CÁLCULO' })
  })
})
