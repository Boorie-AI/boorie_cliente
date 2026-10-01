import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Sidebar } from './Sidebar'
import { useAppStore } from '@/stores/appStore'
import { useAyudaStore } from '@/stores/ayudaStore'

/** El acceso fijo a «Ayuda y comentarios» al pie de la barra lateral (#217, R3). */
describe('Sidebar: Ayuda y comentarios', () => {
  beforeEach(() => {
    useAyudaStore.setState({ abierta: false, tipo: 'mejora', pantalla: 'unknown' })
    const api = window.electronAPI as unknown as Record<string, unknown>
    api.feedback = { snapshot: vi.fn().mockResolvedValue({ success: true }), discardSnapshot: vi.fn().mockResolvedValue({}) }
  })

  it.each(['chat', 'wntr', 'settings'] as const)('desde %s abre el formulario sin cambiar de vista', async (vista) => {
    useAppStore.setState({ currentView: vista, sidebarCollapsed: false, settingsTab: 'general' })
    render(<Sidebar />)
    await userEvent.click(screen.getByRole('button', { name: 'Ayuda y comentarios' }))
    await waitFor(() => expect(useAyudaStore.getState().abierta).toBe(true))
    expect(useAyudaStore.getState().tipo).toBe('bug')
    expect(useAyudaStore.getState().pantalla).toBe(vista === 'settings' ? 'settings:general' : vista)
    expect(useAppStore.getState().currentView).toBe(vista)
  })

  it('con la barra contraída queda el icono, con nombre accesible', () => {
    useAppStore.setState({ currentView: 'projects', sidebarCollapsed: true })
    render(<Sidebar />)
    const boton = screen.getByTestId('sidebar-ayuda')
    expect(boton.getAttribute('aria-label')).toBe('Ayuda y comentarios')
    expect(boton.textContent).toBe('')
  })
})
