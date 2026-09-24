import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ProjectDashboard } from './ProjectDashboard'

/**
 * El botón de importar (#77). Eran dos cosas distintas —un proyecto exportado y
 * una red— detrás de un mismo rótulo, y la rama de la red no importaba nada:
 * creaba el proyecto vacío y mandaba al usuario a elegir otra vez el fichero.
 */
const props = (parcial: Record<string, unknown> = {}) => ({
  projects: [],
  onSelectProject: vi.fn(),
  onOpenProject: vi.fn(),
  onCreateProject: vi.fn(),
  onImportNetwork: vi.fn(),
  onDeleteProject: vi.fn(),
  ...parcial,
})

describe('la raíz de proyectos', () => {
  it('separa importar una red de importar un proyecto', () => {
    render(<ProjectDashboard {...props()} />)

    expect(screen.getByRole('button', { name: /Importar red \(\.inp\)/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Importar proyecto \(\.json\)/ })).toBeInTheDocument()
  })

  /**
   * La lista tarda lo que tarde la base en responder, y hasta entonces llega
   * vacía. Contra la base de un usuario con siete proyectos la raíz anunciaba
   * «0 proyectos / no hay proyectos todavía» hasta que resolvía listProjects.
   */
  it('mientras carga no dice que no hay proyectos', () => {
    render(<ProjectDashboard {...props({ isLoading: true })} />)

    expect(screen.queryByText(/No hay proyectos todavía/)).not.toBeInTheDocument()
    expect(screen.getByText(/Cargando proyectos/)).toBeInTheDocument()
  })

  it('al terminar de cargar sin ninguno sí lo dice', () => {
    render(<ProjectDashboard {...props({ isLoading: false })} />)

    expect(screen.getByText(/No hay proyectos todavía/)).toBeInTheDocument()
  })

  it('importar una red se lo pide a quien sabe cargarla, en vez de crear un proyecto vacío', () => {
    const p = props()
    render(<ProjectDashboard {...p} />)

    fireEvent.click(screen.getByRole('button', { name: /Importar red \(\.inp\)/ }))

    expect(p.onImportNetwork).toHaveBeenCalledTimes(1)
    expect(p.onCreateProject).not.toHaveBeenCalled()
  })
})
