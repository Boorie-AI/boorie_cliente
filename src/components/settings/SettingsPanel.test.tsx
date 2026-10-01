import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('./AIConfigurationPanel', () => ({ AIConfigurationPanel: () => null }))
vi.mock('./SystemPromptPanel', () => ({ SystemPromptPanel: () => null }))
vi.mock('./MilvusInspector', () => ({ MilvusInspector: () => null }))
vi.mock('./GuardrailsPanel', () => ({ GuardrailsPanel: () => null }))
vi.mock('./tabs', () => ({ GeneralTab: () => null, AccountsTab: () => null, AboutTab: () => null }))

import { SettingsPanel } from './SettingsPanel'

describe('SettingsPanel', () => {
  it('«Ayuda y comentarios» no añade ninguna pestaña: siguen siendo siete (#217, R2)', () => {
    render(<SettingsPanel />)
    const pestañas = screen.getAllByRole('tab')
    expect(pestañas).toHaveLength(7)
    expect(pestañas.map(p => p.textContent)).not.toContain('Ayuda y comentarios')
  })
})
