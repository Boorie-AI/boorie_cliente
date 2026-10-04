import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import i18n from '@/i18n'
import { MessageList } from './MessageList'

describe('MessageList: la revisión contra el documento (#223)', () => {
  it('va debajo de la respuesta, que sigue en pantalla', () => {
    render(<MessageList messages={[]} isLoading streamingMessage="Con la fórmula de Joukowsky." revisando />)
    const texto = screen.getByText('Con la fórmula de Joukowsky.')
    const estado = screen.getByRole('status')
    expect(estado.textContent).toBe(i18n.t('chat.revision.enCurso'))
    expect(texto.compareDocumentPosition(estado) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('sin revisión no hay estado', () => {
    render(<MessageList messages={[]} isLoading streamingMessage="Llegando…" />)
    expect(screen.queryByRole('status')).toBeNull()
  })
})
