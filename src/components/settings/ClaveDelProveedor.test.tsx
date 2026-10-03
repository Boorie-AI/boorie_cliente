import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ClaveDelProveedor } from './ClaveDelProveedor'

const base = { id: 'nvidia', name: 'nvidia', tieneClave: true, estadoClave: 'ok' as const, finClave: 'mnop' }

describe('la clave de un proveedor en Configuración (#225)', () => {
  it('de sólo escritura: no enseña la guardada, sólo su estado y los cuatro últimos', () => {
    render(<ClaveDelProveedor provider={base} cifradoDisponible onGuardar={vi.fn()} />)
    expect((screen.getByLabelText('Clave API') as HTMLInputElement).value).toBe('')
    expect(screen.getByTestId('estado-clave-nvidia')).toHaveTextContent('Guardada y cifrada con el llavero del sistema · termina en …mnop')
  })

  it('se guarda al pulsar, no con cada tecla, y el campo se vacía', async () => {
    const onGuardar = vi.fn().mockResolvedValue(true)
    render(<ClaveDelProveedor provider={base} cifradoDisponible onGuardar={onGuardar} />)
    const campo = screen.getByLabelText('Clave API') as HTMLInputElement
    fireEvent.change(campo, { target: { value: ' nvapi-FAKEnueva0123456789abcdefghij ' } })
    expect(onGuardar).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(onGuardar).toHaveBeenCalledWith('nvapi-FAKEnueva0123456789abcdefghij', {}))
    await waitFor(() => expect(campo.value).toBe(''))
  })

  it('una clave de otro equipo pide pegarla otra vez', () => {
    render(<ClaveDelProveedor provider={{ ...base, tieneClave: false, estadoClave: 'ilegible', finClave: null }} cifradoDisponible onGuardar={vi.fn()} />)
    expect(screen.getByTestId('estado-clave-nvidia')).toHaveTextContent('no se puede leer en este equipo')
  })

  it('sin llavero lo dice, la usa en la sesión y sólo la guarda sin cifrar si se confirma el riesgo (R4, D3)', async () => {
    const onGuardar = vi.fn().mockResolvedValue(true)
    render(<ClaveDelProveedor provider={{ ...base, tieneClave: false, estadoClave: null, finClave: null }} cifradoDisponible={false} onGuardar={onGuardar} />)
    expect(screen.getByText(/no tiene un llavero del sistema disponible/)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Clave API'), { target: { value: 'nvapi-FAKEsesion0123456789abcdefghij' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar sin cifrar en este equipo' }))
    expect(screen.getByRole('alert')).toHaveTextContent('quedará escrita tal cual')
    expect(onGuardar).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Entiendo el riesgo: guardarla sin cifrar' }))
    await waitFor(() => expect(onGuardar).toHaveBeenCalledWith('nvapi-FAKEsesion0123456789abcdefghij', { permitirSinCifrar: true }))
  })

  it('las de la sesión y las guardadas sin cifrar se avisan', () => {
    const { rerender } = render(<ClaveDelProveedor provider={{ ...base, estadoClave: 'sesion' }} cifradoDisponible={false} onGuardar={vi.fn()} />)
    expect(screen.getByTestId('estado-clave-nvidia')).toHaveTextContent('Sólo para esta sesión')
    rerender(<ClaveDelProveedor provider={{ ...base, estadoClave: 'sinCifrado' }} cifradoDisponible={false} onGuardar={vi.fn()} />)
    expect(screen.getByTestId('estado-clave-nvidia')).toHaveTextContent('Guardada SIN cifrar')
  })
})
