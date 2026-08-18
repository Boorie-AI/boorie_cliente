import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useProjectStore } from './projectStore'

// El store llama a window.electronAPI.hydraulic.* y sincroniza con wntrStore.
const getProject = vi.fn()
const deleteProject = vi.fn()

vi.mock('./wntrStore', () => ({
  useWNTRStore: {
    getState: () => ({
      syncWithProject: vi.fn(),
      loadNetworkFromProject: vi.fn().mockResolvedValue(true),
    }),
  },
}))

const proyecto = (id: string) => ({
  id, name: `Proyecto ${id}`, type: 'analysis', status: 'design',
  location: {}, regulations: [], calculations: [], documents: [], team: [],
  timeline: {}, createdAt: new Date(), updatedAt: new Date(),
})

describe('projectStore — proyecto activo global', () => {
  beforeEach(() => {
    getProject.mockReset()
    deleteProject.mockReset()
    Object.defineProperty(window, 'electronAPI', {
      value: { hydraulic: { getProject, deleteProject } },
      writable: true,
    })
    useProjectStore.setState({ currentProject: null, currentProjectId: null, error: null })
    localStorage.clear()
  })

  it('selectProject fija el proyecto y su id', async () => {
    getProject.mockResolvedValue({ success: true, data: proyecto('p1') })

    expect(await useProjectStore.getState().selectProject('p1')).toBe(true)
    expect(useProjectStore.getState().currentProjectId).toBe('p1')
    expect(useProjectStore.getState().currentProject?.id).toBe('p1')
  })

  it('no fija el id si la carga falla', async () => {
    getProject.mockResolvedValue({ success: false, error: 'no existe' })

    expect(await useProjectStore.getState().selectProject('fantasma')).toBe(false)
    expect(useProjectStore.getState().currentProjectId).toBeNull()
    expect(useProjectStore.getState().error).toBe('no existe')
  })

  it('clearProject olvida también el id persistido', async () => {
    getProject.mockResolvedValue({ success: true, data: proyecto('p1') })
    await useProjectStore.getState().selectProject('p1')

    useProjectStore.getState().clearProject()
    expect(useProjectStore.getState().currentProjectId).toBeNull()
    expect(useProjectStore.getState().currentProject).toBeNull()
  })

  // Sólo se guarda el id: guardar el objeto serviría datos obsoletos si el
  // proyecto cambió de nombre o de contenido entre sesiones.
  it('persiste únicamente el id del proyecto activo', async () => {
    getProject.mockResolvedValue({ success: true, data: proyecto('p1') })
    await useProjectStore.getState().selectProject('p1')

    const guardado = JSON.parse(localStorage.getItem('project-store') || '{}')
    expect(guardado.state).toEqual({ currentProjectId: 'p1' })
  })

  describe('restoreActiveProject', () => {
    it('rehidrata el proyecto desde la base de datos a partir del id', async () => {
      useProjectStore.setState({ currentProjectId: 'p1', currentProject: null })
      getProject.mockResolvedValue({ success: true, data: proyecto('p1') })

      expect(await useProjectStore.getState().restoreActiveProject()).toBe(true)
      expect(getProject).toHaveBeenCalledWith('p1')
      expect(useProjectStore.getState().currentProject?.name).toBe('Proyecto p1')
    })

    it('descarta el id si el proyecto ya no existe, en vez de dejarlo colgando', async () => {
      useProjectStore.setState({ currentProjectId: 'borrado', currentProject: null })
      getProject.mockResolvedValue({ success: false, error: 'not found' })

      expect(await useProjectStore.getState().restoreActiveProject()).toBe(false)
      expect(useProjectStore.getState().currentProjectId).toBeNull()
      expect(useProjectStore.getState().error).toBeNull()
    })

    it('no hace nada si no hay id persistido', async () => {
      expect(await useProjectStore.getState().restoreActiveProject()).toBe(false)
      expect(getProject).not.toHaveBeenCalled()
    })

    it('no recarga si el proyecto ya está cargado', async () => {
      useProjectStore.setState({ currentProjectId: 'p1', currentProject: proyecto('p1') as never })

      expect(await useProjectStore.getState().restoreActiveProject()).toBe(false)
      expect(getProject).not.toHaveBeenCalled()
    })
  })

  it('borrar el proyecto activo olvida el id, para no restaurar un borrado al reabrir', async () => {
    getProject.mockResolvedValue({ success: true, data: proyecto('p1') })
    await useProjectStore.getState().selectProject('p1')
    deleteProject.mockResolvedValue({ success: true })

    await useProjectStore.getState().deleteProject('p1')
    expect(useProjectStore.getState().currentProjectId).toBeNull()
  })

  it('borrar otro proyecto no toca el activo', async () => {
    getProject.mockResolvedValue({ success: true, data: proyecto('p1') })
    await useProjectStore.getState().selectProject('p1')
    deleteProject.mockResolvedValue({ success: true })

    await useProjectStore.getState().deleteProject('otro')
    expect(useProjectStore.getState().currentProjectId).toBe('p1')
  })
})
