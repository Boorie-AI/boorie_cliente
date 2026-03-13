import { describe, it, expect, beforeEach, vi } from 'vitest'
import { usePreferencesStore } from './preferencesStore'
import { act } from '@testing-library/react'

// Mock database service
vi.mock('@/services/database', () => ({
  databaseService: {
    getSettings: vi.fn().mockResolvedValue([]),
    setSetting: vi.fn().mockResolvedValue({}),
  },
}))

// Mock i18n
vi.mock('@/i18n', () => ({
  default: {
    changeLanguage: vi.fn(),
  },
}))

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
