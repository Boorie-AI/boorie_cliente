import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore, migrarVista, VISTAS } from './appStore'

describe('vista de la aplicación', () => {
  beforeEach(() => {
    useAppStore.setState({ currentView: 'projects', ambitoChat: 'general', seccionRed: null })
  })

  it('arranca en Proyectos, que es la raíz de la navegación', () => {
    // Criterio de aceptación del issue #35.
    expect(useAppStore.getState().currentView).toBe('projects')
  })

  it('traduce la vista guardada por los usuarios que ya tenían «rag»', () => {
    // El enrutado la llamaba 'rag' y la etiqueta decía «Wisdom Center». Sin
    // esto, quien dejó la aplicación en el Wisdom Center arrancaría en la vista
    // por defecto sin explicación, porque su valor guardado ya no existe.
    expect(migrarVista('rag')).toBe('wisdom')
  })

  it('acepta las vistas vigentes y descarta un valor desconocido', () => {
    for (const vista of VISTAS) expect(migrarVista(vista)).toBe(vista)
    expect(migrarVista('vista-que-no-existe')).toBeNull()
  })

  it('sin proyecto, la vista restaurada que exige uno cae en Proyectos', () => {
    useAppStore.setState({ currentView: 'wntr' })
    useAppStore.getState().ajustarVistaInicial({ hayProyecto: false, hayRed: false })
    expect(useAppStore.getState().currentView).toBe('projects')
  })

  it('con proyecto, se respeta la vista que el usuario dejó abierta', () => {
    useAppStore.setState({ currentView: 'wntr' })
    useAppStore.getState().ajustarVistaInicial({ hayProyecto: true, hayRed: true })
    expect(useAppStore.getState().currentView).toBe('wntr')
  })

  it('no toca las vistas que no dependen del proyecto', () => {
    for (const vista of ['calculator', 'wisdom', 'settings', 'chat'] as const) {
      useAppStore.setState({ currentView: vista })
      useAppStore.getState().ajustarVistaInicial({ hayProyecto: false, hayRed: false })
      expect(useAppStore.getState().currentView).toBe(vista)
    }
  })
})
