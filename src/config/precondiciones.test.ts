import { describe, it, expect } from 'vitest'
import {
  REQUISITOS_VISTA,
  requisitosPendientes,
  vistaDisponible,
  claveMotivo,
  type Vista,
} from './precondiciones'

const SIN_NADA = { hayProyecto: false, hayRed: false }
const SOLO_PROYECTO = { hayProyecto: true, hayRed: false }
const TODO = { hayProyecto: true, hayRed: true }

describe('precondiciones de navegación', () => {
  it('deja pasar a chat, proyectos, wisdom y ajustes sin nada cargado', () => {
    for (const vista of ['chat', 'projects', 'wisdom', 'settings'] as Vista[]) {
      expect(vistaDisponible(vista, SIN_NADA)).toBe(true)
    }
  })

  it('mantiene la calculadora autónoma', () => {
    // Criterio explícito del issue: exigir proyecto añadiría fricción a un uso
    // legítimo, así que esto no es un descuido de la tabla.
    expect(REQUISITOS_VISTA.calculator).toEqual([])
    expect(vistaDisponible('calculator', SIN_NADA)).toBe(true)
  })

  it('exige proyecto para la red WNTR', () => {
    expect(vistaDisponible('wntr', SIN_NADA)).toBe(false)
    expect(requisitosPendientes('wntr', SIN_NADA)).toEqual(['proyecto'])
    expect(vistaDisponible('wntr', SOLO_PROYECTO)).toBe(true)
  })

  it('no exige red para entrar en la vista de red', () => {
    // Es donde se carga el .inp: pedirla para entrar dejaría el módulo
    // inalcanzable.
    expect(REQUISITOS_VISTA.wntr).not.toContain('red')
    expect(vistaDisponible('wntr', SOLO_PROYECTO)).toBe(true)
  })

  it('con todo cargado no queda ninguna vista bloqueada', () => {
    for (const vista of Object.keys(REQUISITOS_VISTA) as Vista[]) {
      expect(vistaDisponible(vista, TODO)).toBe(true)
    }
  })

  it('explica primero el requisito más básico', () => {
    expect(claveMotivo(['proyecto', 'red'])).toBe('precondiciones.faltaProyecto')
    expect(claveMotivo(['red'])).toBe('precondiciones.faltaRed')
    expect(claveMotivo([])).toBeNull()
  })

  it('cubre todas las vistas declaradas en el store', () => {
    // Si alguien añade una vista nueva y olvida su fila, la tabla deja de ser
    // la fuente única y volvemos a las guardas dispersas.
    const vistas: Vista[] = ['chat', 'settings', 'wisdom', 'projects', 'calculator', 'wntr']
    for (const vista of vistas) {
      expect(REQUISITOS_VISTA[vista]).toBeDefined()
    }
    expect(Object.keys(REQUISITOS_VISTA).sort()).toEqual([...vistas].sort())
  })
})
