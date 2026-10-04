import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MotorDeBusqueda } from './MotorDeBusqueda'
import { DialogoConsentimientoNube } from '@/components/nube/DialogoConsentimientoNube'
import type { EstadoMotorRAG } from '@/config/modelosRAG'
import { useDialogoConsentimiento } from '@/services/consentimientoNube'

let consentimientos: Record<string, { version: number; fecha: string }> = {}
let estado: EstadoMotorRAG
let hayClave = true

/** Lo que haría el proceso principal: guardar el ajuste y decir dónde se procesa de verdad. */
function calcular(ajuste: 'ollama' | 'nvidia'): EstadoMotorRAG {
  if (ajuste === 'ollama') return { ajuste, pedido: 'ollama', porEntorno: false, efectivo: 'ollama' }
  if (!consentimientos.nvidia) return { ajuste, pedido: 'nvidia', porEntorno: false, efectivo: 'ollama', motivo: 'sinConsentimiento' }
  if (!hayClave) return { ajuste, pedido: 'nvidia', porEntorno: false, efectivo: 'ollama', motivo: 'sinClave' }
  return { ajuste, pedido: 'nvidia', porEntorno: false, efectivo: 'nvidia' }
}

const api = () => window.electronAPI as unknown as { agenticRAG: Record<string, unknown>; nube: Record<string, unknown> }
const conDialogo = () => render(<><MotorDeBusqueda /><DialogoConsentimientoNube /></>)
const selector = () => screen.getByRole('combobox', { name: 'Dónde se procesa la búsqueda' })

describe('«Dónde se procesa la búsqueda» en Configuración (#224)', () => {
  beforeEach(() => {
    useDialogoConsentimiento.setState({ peticion: null })
    consentimientos = {}
    hayClave = true
    estado = calcular('ollama')
    api().agenticRAG = {
      modelos: vi.fn().mockResolvedValue({ success: false }),
      motor: vi.fn(async () => ({ success: true, data: estado })),
      guardarMotor: vi.fn(async (motor: 'ollama' | 'nvidia') => { estado = calcular(motor); return { success: true, data: estado } }),
    }
    api().nube = {
      estado: vi.fn(async () => ({ version: 1, consentimientos })),
      aceptar: vi.fn(async (p: string) => { consentimientos[p.toLowerCase()] = { version: 1, fecha: '2026-10-04T10:00:00.000Z' }; return { success: true } }),
      retirar: vi.fn(),
    }
  })

  it('por defecto, en este equipo y sin avisos', async () => {
    conDialogo()
    await waitFor(() => expect(selector()).not.toBeDisabled())
    expect(selector()).toHaveValue('ollama')
    expect(screen.getAllByRole('option').map(o => o.textContent)).toEqual(['En este equipo (Ollama)', 'NVIDIA (en la nube)'])
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('elegir NVIDIA pide el consentimiento, lo guarda en el proceso principal y avisa de lo que sale', async () => {
    conDialogo()
    await waitFor(() => expect(selector()).not.toBeDisabled())

    fireEvent.change(selector(), { target: { value: 'nvidia' } })
    expect(await screen.findByRole('dialog')).toHaveTextContent('como motor de la búsqueda')
    fireEvent.click(screen.getByRole('button', { name: 'Acepto enviar estos datos a NVIDIA' }))

    expect(await screen.findByText(/salen de este equipo hacia NVIDIA para reformularla/)).toBeInTheDocument()
    expect(api().agenticRAG.guardarMotor).toHaveBeenCalledWith('nvidia')
    expect(selector()).toHaveValue('nvidia')
    expect(screen.getByText('Guardado. Se aplica desde la próxima pregunta.')).toBeInTheDocument()
  })

  it('si no se acepta el consentimiento, no se guarda nada y sigue en local', async () => {
    conDialogo()
    await waitFor(() => expect(selector()).not.toBeDisabled())

    fireEvent.change(selector(), { target: { value: 'nvidia' } })
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: 'No, seguir en local' }))

    expect(await screen.findByText(/sin tu consentimiento no se envía nada a NVIDIA/)).toBeInTheDocument()
    expect(api().agenticRAG.guardarMotor).not.toHaveBeenCalled()
    expect(selector()).toHaveValue('ollama')
  })

  it('con NVIDIA elegido y sin clave, avisa de que la búsqueda sigue en este equipo', async () => {
    consentimientos.nvidia = { version: 1, fecha: '2026-10-04T10:00:00.000Z' }
    hayClave = false
    estado = calcular('nvidia')
    conDialogo()

    expect(await screen.findByRole('alert')).toHaveTextContent('No hay una clave de NVIDIA válida en «Proveedores API»: la búsqueda sigue en este equipo.')
    expect(selector()).toHaveValue('nvidia')
    expect(screen.queryByText(/salen de este equipo hacia NVIDIA/)).not.toBeInTheDocument()
  })

  it('con el consentimiento retirado, lo dice y deja volver a darlo', async () => {
    estado = calcular('nvidia')
    conDialogo()

    expect(await screen.findByRole('alert')).toHaveTextContent('Sin tu consentimiento para NVIDIA no se envía nada')
    fireEvent.click(screen.getByRole('button', { name: 'Revisar el consentimiento para NVIDIA' }))
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: 'Acepto enviar estos datos a NVIDIA' }))

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(screen.getByText(/salen de este equipo hacia NVIDIA/)).toBeInTheDocument()
  })

  it('si lo fija el entorno, lo dice', async () => {
    estado = { ajuste: 'ollama', pedido: 'nvidia', porEntorno: true, efectivo: 'nvidia' }
    conDialogo()
    expect(await screen.findByText(/BOORIE_RAG_BACKEND, que manda sobre este ajuste: NVIDIA \(en la nube\)/)).toBeInTheDocument()
  })
})
