import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
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

describe('MessageList: la espera por un servicio saturado (#266)', () => {
  afterEach(() => { vi.useRealTimers() })
  const espera = (segundos: number) => ({ proveedor: 'NVIDIA', intento: 2, total: 4, hasta: Date.now() + segundos * 1000 })

  it('va como estado debajo del texto, con cuenta atrás, y al acabarla dice que se reintenta', () => {
    vi.useFakeTimers()
    render(<MessageList messages={[]} isLoading streamingMessage="Con la fórmula" esperaDelProveedor={espera(8)} />)
    const texto = screen.getByText('Con la fórmula')
    const estado = screen.getByRole('status')
    expect(estado.textContent).toBe(i18n.t('chat.esperaProveedor.cuentaAtras', { proveedor: 'NVIDIA', segundos: 8, intento: 2, total: 4 }))
    expect(texto.compareDocumentPosition(estado) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    act(() => { vi.advanceTimersByTime(3000) })
    expect(estado.textContent).toBe(i18n.t('chat.esperaProveedor.cuentaAtras', { proveedor: 'NVIDIA', segundos: 5, intento: 2, total: 4 }))

    act(() => { vi.advanceTimersByTime(5000) })
    expect(estado.textContent).toBe(i18n.t('chat.esperaProveedor.reintentando', { proveedor: 'NVIDIA', intento: 2, total: 4 }))
  })

  it('también sin texto todavía, debajo de «pensando»', () => {
    render(<MessageList messages={[]} isLoading streamingMessage="" esperaDelProveedor={espera(8)} />)
    expect(screen.getByRole('status').textContent).toContain('NVIDIA')
  })

  it('sin espera, o ya sin cargar, no hay estado', () => {
    const { rerender } = render(<MessageList messages={[]} isLoading streamingMessage="Llegando…" esperaDelProveedor={null} />)
    expect(screen.queryByRole('status')).toBeNull()
    rerender(<MessageList messages={[]} isLoading={false} streamingMessage="" esperaDelProveedor={espera(8)} />)
    expect(screen.queryByRole('status')).toBeNull()
  })
})
