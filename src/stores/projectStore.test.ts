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

  // Reconciliación al abrir una conversación de otro proyecto. Vive en el store
  // porque hay cinco sitios en la interfaz que abren conversaciones.
  describe('notifyConversationOpened', () => {
    beforeEach(() => {
      useProjectStore.setState({
        currentProjectId: 'p1',
        currentProject: proyecto('p1') as never,
        projects: [proyecto('p1'), proyecto('p2')] as never,
        projectMismatch: null,
      })
    })

    it('avisa cuando la conversación es de otro proyecto', async () => {
      await useProjectStore.getState().notifyConversationOpened('c1', 'p2')

      const m = useProjectStore.getState().projectMismatch
      expect(m).toMatchObject({
        conversationId: 'c1',
        conversationProjectId: 'p2',
        conversationProjectName: 'Proyecto p2',
        activeProjectName: 'Proyecto p1',
      })
    })

    it('no avisa si la conversación es del proyecto activo', async () => {
      await useProjectStore.getState().notifyConversationOpened('c1', 'p1')
      expect(useProjectStore.getState().projectMismatch).toBeNull()
    })

    // Una conversación general se puede leer desde cualquier proyecto: no hay
    // nada que reconciliar y preguntar sería puro ruido.
    it('no avisa si la conversación no tiene proyecto', async () => {
      await useProjectStore.getState().notifyConversationOpened('c1', undefined)
      expect(useProjectStore.getState().projectMismatch).toBeNull()
    })

    it('limpia un aviso previo al abrir una conversación coherente', async () => {
      await useProjectStore.getState().notifyConversationOpened('c1', 'p2')
      expect(useProjectStore.getState().projectMismatch).not.toBeNull()

      await useProjectStore.getState().notifyConversationOpened('c2', 'p1')
      expect(useProjectStore.getState().projectMismatch).toBeNull()
    })

    // La app real nunca puebla `projects` del store: la vista WNTR usa su propio
    // catálogo. Sembrarlo en los tests ocultó que el nombre se resolvía mal.
    it('resuelve el nombre por base de datos cuando el catálogo del store está vacío', async () => {
      useProjectStore.setState({ projects: [] })
      getProject.mockResolvedValue({ success: true, data: proyecto('p2') })

      await useProjectStore.getState().notifyConversationOpened('c1', 'p2')

      expect(getProject).toHaveBeenCalledWith('p2')
      const m = useProjectStore.getState().projectMismatch
      expect(m?.conversationProjectName).toBe('Proyecto p2')
      expect(m?.activeProjectName).toBe('Proyecto p1')
    })

    it('muestra el id, no un nombre equivocado, si no se puede resolver', async () => {
      useProjectStore.setState({ projects: [] })
      getProject.mockRejectedValue(new Error('sin base de datos'))

      await useProjectStore.getState().notifyConversationOpened('c1', 'p2')

      const m = useProjectStore.getState().projectMismatch
      expect(m?.conversationProjectName).toBe('p2')
      expect(m?.activeProjectName).toBe('Proyecto p1')
    })

    it('avisa también sin proyecto activo, dejando vacío el nombre del activo', async () => {
      useProjectStore.setState({ currentProjectId: null, currentProject: null })
      await useProjectStore.getState().notifyConversationOpened('c1', 'p2')

      expect(useProjectStore.getState().projectMismatch?.activeProjectName).toBe('')
    })
  })

  describe('resolveProjectMismatch', () => {
    beforeEach(async () => {
      useProjectStore.setState({
        currentProjectId: 'p1',
        currentProject: proyecto('p1') as never,
        projects: [proyecto('p1'), proyecto('p2')] as never,
        projectMismatch: null,
      })
      await useProjectStore.getState().notifyConversationOpened('c1', 'p2')
    })

    it('«switch» conmuta al proyecto de la conversación', async () => {
      getProject.mockResolvedValue({ success: true, data: proyecto('p2') })

      await useProjectStore.getState().resolveProjectMismatch('switch')
      expect(useProjectStore.getState().currentProjectId).toBe('p2')
      expect(useProjectStore.getState().projectMismatch).toBeNull()
    })

    it('«keep» mantiene el proyecto activo y no consulta la base de datos', async () => {
      await useProjectStore.getState().resolveProjectMismatch('keep')

      expect(useProjectStore.getState().currentProjectId).toBe('p1')
      expect(useProjectStore.getState().projectMismatch).toBeNull()
      expect(getProject).not.toHaveBeenCalled()
    })

    // Si el aviso siguiera visible mientras selectProject carga, parecería que
    // el clic no hizo nada.
    it('quita el aviso antes de esperar la carga', async () => {
      let resolver: (v: unknown) => void = () => {}
      getProject.mockReturnValue(new Promise(r => { resolver = r }))

      const pendiente = useProjectStore.getState().resolveProjectMismatch('switch')
      expect(useProjectStore.getState().projectMismatch).toBeNull()

      resolver({ success: true, data: proyecto('p2') })
      await pendiente
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
