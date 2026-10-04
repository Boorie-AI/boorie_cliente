import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { usePreferencesStore } from './preferencesStore'
import { act } from '@testing-library/react'

/** Un i18n de mentira que recuerda el idioma, para comparar interfaz y combobox. */
const i18nFalso = vi.hoisted(() => {
  const falso = {
    language: 'es',
    changeLanguage: vi.fn((idioma: string) => {
      falso.language = idioma
      return Promise.resolve()
    }),
  }
  return falso
})

// Mock database service
vi.mock('@/services/database', () => ({
  databaseService: {
    getSettings: vi.fn().mockResolvedValue([]),
    setSetting: vi.fn().mockResolvedValue({}),
  },
}))

// Mock i18n
vi.mock('@/i18n', () => ({ default: i18nFalso }))

describe('usePreferencesStore', () => {
  beforeEach(() => {
    // Reset store to defaults
    usePreferencesStore.setState({
      autoSaveConversations: true,
      showTypingIndicators: true,
      defaultModelType: 'local',
      defaultModelId: '',
      theme: 'light',
      language: 'es',
    })
  })

  it('should have default preferences', () => {
    const state = usePreferencesStore.getState()
    expect(state.theme).toBe('light')
    expect(state.language).toBe('es')
    expect(state.autoSaveConversations).toBe(true)
    expect(state.showTypingIndicators).toBe(true)
    expect(state.defaultModelType).toBe('local')
  })

  it('should update a preference', async () => {
    const store = usePreferencesStore.getState()
    await act(async () => {
      await store.updatePreference('theme', 'dark')
    })
    expect(usePreferencesStore.getState().theme).toBe('dark')
  })

  it('should change i18n language when language preference is updated', async () => {
    const i18n = (await import('@/i18n')).default
    const store = usePreferencesStore.getState()
    await act(async () => {
      await store.updatePreference('language', 'en')
    })
    expect(i18n.changeLanguage).toHaveBeenCalledWith('en')
    expect(usePreferencesStore.getState().language).toBe('en')
  })

  it('should reset preferences to defaults', async () => {
    const store = usePreferencesStore.getState()
    await act(async () => {
      await store.updatePreference('theme', 'dark')
      await store.updatePreference('language', 'ca')
    })
    expect(usePreferencesStore.getState().theme).toBe('dark')

    await act(async () => {
      await store.resetPreferences()
    })
    expect(usePreferencesStore.getState().theme).toBe('light')
    expect(usePreferencesStore.getState().language).toBe('es')
  })

  it('should load preferences from database', async () => {
    const { databaseService } = await import('@/services/database')
    vi.mocked(databaseService.getSettings).mockResolvedValueOnce([
      { key: 'theme', value: 'dark', id: '1', category: 'preferences', createdAt: new Date(), updatedAt: new Date() },
      { key: 'language', value: 'en', id: '2', category: 'preferences', createdAt: new Date(), updatedAt: new Date() },
    ])

    const store = usePreferencesStore.getState()
    await act(async () => {
      await store.loadPreferences()
    })

    expect(usePreferencesStore.getState().theme).toBe('dark')
    expect(usePreferencesStore.getState().language).toBe('en')
  })
})

describe('el idioma del combobox y el de la interfaz coinciden (#265)', () => {
  const sistemaEn = (idiomas: string[]) => {
    Object.defineProperty(window.navigator, 'languages', { value: idiomas, configurable: true })
    Object.defineProperty(window.navigator, 'language', { value: idiomas[0], configurable: true })
  }

  /** Arranque de la aplicación: el store se crea y se rehidrata de `localStorage`. */
  const arrancar = async () => {
    vi.resetModules()
    return (await import('./preferencesStore')).usePreferencesStore
  }

  const guardadoEnLocal = () =>
    JSON.parse(localStorage.getItem('preferences-store') ?? 'null')?.state?.language

  beforeEach(() => {
    localStorage.clear()
    i18nFalso.language = 'es'
    i18nFalso.changeLanguage.mockClear()
  })

  afterEach(() => {
    sistemaEn(['es-ES', 'es'])
    localStorage.clear()
  })

  it('cargar «ca» de la base con la interfaz en castellano deja los dos en catalán', async () => {
    const { databaseService } = await import('@/services/database')
    vi.mocked(databaseService.getSettings).mockResolvedValueOnce([
      { key: 'language', value: 'ca', id: '1', category: 'preferences', createdAt: new Date(), updatedAt: new Date() },
    ])
    expect(i18nFalso.language).toBe('es')

    await act(async () => {
      await usePreferencesStore.getState().loadPreferences()
    })

    expect(usePreferencesStore.getState().language).toBe('ca')
    expect(i18nFalso.language).toBe('ca')
  })

  it('si la base no tiene idioma, se queda el que se ve y se guarda en la base', async () => {
    const { databaseService } = await import('@/services/database')
    vi.mocked(databaseService.getSettings).mockResolvedValueOnce([])
    vi.mocked(databaseService.setSetting).mockClear()
    usePreferencesStore.setState({ language: 'en' })
    i18nFalso.language = 'en'

    await act(async () => {
      await usePreferencesStore.getState().loadPreferences()
    })

    expect(usePreferencesStore.getState().language).toBe('en')
    expect(i18nFalso.language).toBe('en')
    expect(databaseService.setSetting).toHaveBeenCalledWith('language', 'en', 'preferences')
  })

  it('un idioma desconocido en la base no se aplica', async () => {
    const { databaseService } = await import('@/services/database')
    vi.mocked(databaseService.getSettings).mockResolvedValueOnce([
      { key: 'language', value: 'fr', id: '1', category: 'preferences', createdAt: new Date(), updatedAt: new Date() },
    ])
    usePreferencesStore.setState({ language: 'ca' })
    i18nFalso.language = 'ca'

    await act(async () => {
      await usePreferencesStore.getState().loadPreferences()
    })

    expect(usePreferencesStore.getState().language).toBe('ca')
    expect(i18nFalso.language).toBe('ca')
  })

  it('al rehidratar, la interfaz pasa al idioma guardado', async () => {
    localStorage.setItem('preferences-store', JSON.stringify({ state: { language: 'ca' }, version: 0 }))
    sistemaEn(['en-US', 'en'])

    const store = await arrancar()

    expect(store.getState().language).toBe('ca')
    expect(i18nFalso.language).toBe('ca')
  })

  it('instalación nueva con el sistema en inglés: los dos en inglés, y queda guardado', async () => {
    sistemaEn(['en-US', 'en'])

    const store = await arrancar()

    expect(store.getState().language).toBe('en')
    expect(i18nFalso.language).toBe('en')
    expect(guardadoEnLocal()).toBe('en')
  })

  it('instalación nueva con el sistema en catalán de Andorra: catalán', async () => {
    sistemaEn(['ca-AD'])

    const store = await arrancar()

    expect(store.getState().language).toBe('ca')
    expect(i18nFalso.language).toBe('ca')
  })

  it('instalación nueva con un idioma no soportado: castellano', async () => {
    sistemaEn(['fr-FR', 'de'])
    i18nFalso.language = 'fr-FR'

    const store = await arrancar()

    expect(store.getState().language).toBe('es')
    expect(i18nFalso.language).toBe('es')
    expect(guardadoEnLocal()).toBe('es')
  })

  it('cambiar desde el combobox sigue cambiando la interfaz y se mantiene al rearrancar', async () => {
    const store = await arrancar()
    expect(i18nFalso.language).toBe('es')

    await act(async () => {
      await store.getState().updatePreference('language', 'ca')
    })

    expect(store.getState().language).toBe('ca')
    expect(i18nFalso.language).toBe('ca')
    expect(guardadoEnLocal()).toBe('ca')

    sistemaEn(['en-US'])
    const otraVez = await arrancar()
    expect(otraVez.getState().language).toBe('ca')
    expect(i18nFalso.language).toBe('ca')
  })

  it('restablecer las preferencias también devuelve la interfaz al castellano', async () => {
    usePreferencesStore.setState({ language: 'en' })
    i18nFalso.language = 'en'

    await act(async () => {
      await usePreferencesStore.getState().resetPreferences()
    })

    expect(usePreferencesStore.getState().language).toBe('es')
    expect(i18nFalso.language).toBe('es')
  })
})
