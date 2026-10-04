import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Message } from '@/stores/chatStore'
import { MessageBubble } from './MessageBubble'

const respuesta = (metadata: Message['metadata']): Message =>
  ({ id: 'm1', role: 'assistant', content: 'Según la norma…', timestamp: new Date(), metadata } as Message)

describe('MessageBubble: fuentes que no cabían en la ventana del modelo (#223)', () => {
  it('dice cuántas se dejaron fuera, y no que no se encontró nada', () => {
    render(<MessageBubble message={respuesta({ ragAttempted: true, sources: [], fuentesOmitidasPorContexto: 12 })} />)
    expect(screen.getByText(/se han dejado fuera 12 fuente\(s\)/)).toBeTruthy()
    expect(screen.queryByText(/no se encontr/i)).toBeNull()
  })

  it('sin fuentes omitidas no aparece el aviso', () => {
    render(<MessageBubble message={respuesta({ ragAttempted: true, sources: [] })} />)
    expect(screen.queryByText(/se han dejado fuera/)).toBeNull()
  })
})
