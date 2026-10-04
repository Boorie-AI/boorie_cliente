import { describe, it, expect } from 'vitest'
import { esIdioma, idiomaDelSistema } from './idioma'

describe('idiomaDelSistema', () => {
  it('se queda con la raíz del primer idioma que la aplicación tiene', () => {
    expect(idiomaDelSistema(['ca-ES', 'es'])).toBe('ca')
    expect(idiomaDelSistema(['EN_gb'])).toBe('en')
    expect(idiomaDelSistema(['fr-FR', 'en-US'])).toBe('en')
  })

  it('sin ninguno soportado, o sin idiomas, castellano', () => {
    expect(idiomaDelSistema(['fr-FR', 'de'])).toBe('es')
    expect(idiomaDelSistema([])).toBe('es')
  })

  it('esIdioma sólo acepta los códigos exactos', () => {
    expect(esIdioma('ca')).toBe(true)
    expect(esIdioma('ca-ES')).toBe(false)
    expect(esIdioma(undefined)).toBe(false)
  })
})
