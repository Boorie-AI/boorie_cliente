import { describe, it, expect } from 'vitest'
import es from './es.json'
import en from './en.json'
import ca from './ca.json'

/**
 * Los tres idiomas se editan a mano en cada funcionalidad, así que es fácil
 * añadir una clave en español y olvidarla en catalán: la interfaz enseña
 * entonces la clave cruda («precondiciones.faltaProyecto») en lugar del texto.
 */
function claves(obj: unknown, prefijo = ''): string[] {
  if (typeof obj !== 'object' || obj === null) return [prefijo]
  return Object.entries(obj as Record<string, unknown>)
    .flatMap(([k, v]) => claves(v, prefijo ? `${prefijo}.${k}` : k))
}

describe('ficheros de idioma', () => {
  it('los tres idiomas tienen exactamente las mismas claves', () => {
    const base = claves(es).sort()
    expect(claves(en).sort()).toEqual(base)
    expect(claves(ca).sort()).toEqual(base)
  })

  it('ninguna traducción queda vacía', () => {
    for (const [nombre, dic] of [['es', es], ['en', en], ['ca', ca]] as const) {
      const vacias = claves(dic).filter(k => {
        const valor = k.split('.').reduce<any>((o, p) => o?.[p], dic)
        return typeof valor === 'string' && valor.trim() === ''
      })
      expect(vacias, `claves vacías en ${nombre}`).toEqual([])
    }
  })

  it('las precondiciones de navegación están traducidas en los tres idiomas', () => {
    for (const dic of [es, en, ca]) {
      const p = (dic as any).precondiciones
      expect(p?.faltaProyecto).toBeTruthy()
      expect(p?.tituloProyecto).toBeTruthy()
      expect(p?.accionElegirProyecto).toBeTruthy()
      expect((dic as any).sidebar?.wntr).toBeTruthy()
      expect((dic as any).onboarding?.red?.title).toBeTruthy()
    }
  })
})
