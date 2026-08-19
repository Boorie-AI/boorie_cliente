import { describe, it, expect } from 'vitest'
import {
  NAVEGACION,
  BLOQUES,
  itemsDelBloque,
  itemActivo,
  pendientesItem,
  requisitosItem,
  type UbicacionActual,
} from './navegacion'
import { REQUISITOS_VISTA, type Vista } from './precondiciones'
import es from '@/locales/es.json'
import en from '@/locales/en.json'
import ca from '@/locales/ca.json'

const SIN_NADA = { hayProyecto: false, hayRed: false }
const SOLO_PROYECTO = { hayProyecto: true, hayRed: false }
const TODO = { hayProyecto: true, hayRed: true }

const resolver = (dic: unknown, clave: string) =>
  clave.split('.').reduce<any>((o, p) => o?.[p], dic)

const item = (id: string) => {
  const encontrado = NAVEGACION.find(i => i.id === id)
  if (!encontrado) throw new Error(`no existe el ítem ${id}`)
  return encontrado
}

describe('modelo de navegación', () => {
  it('ninguna vista de la aplicación queda inalcanzable', () => {
    // Criterio de aceptación del issue #35. Si alguien añade una vista y olvida
    // su entrada en el menú, sólo se llegaría a ella por accidente.
    const alcanzables = new Set(NAVEGACION.map(i => i.vista))
    for (const vista of Object.keys(REQUISITOS_VISTA) as Vista[]) {
      expect(alcanzables.has(vista), `vista sin entrada de menú: ${vista}`).toBe(true)
    }
  })

  it('cada ítem pertenece a uno de los tres bloques declarados', () => {
    const bloques = BLOQUES.map(b => b.id)
    for (const i of NAVEGACION) expect(bloques).toContain(i.bloque)
    expect(itemsDelBloque('proyectos').length).toBeGreaterThan(1)
    expect(itemsDelBloque('herramientas').map(i => i.id)).toEqual(['calculator', 'chatGeneral'])
    expect(itemsDelBloque('sistema').map(i => i.id)).toEqual(['wisdom', 'settings'])
  })

  it('sólo cuelgan del proyecto los ítems del bloque de proyectos', () => {
    for (const i of NAVEGACION.filter(i => i.hijoDelProyecto)) {
      expect(i.bloque).toBe('proyectos')
    }
    // La raíz no cuelga de sí misma: es la que se puede usar sin proyecto.
    expect(item('projects').hijoDelProyecto).toBeUndefined()
    expect(pendientesItem(item('projects'), SIN_NADA)).toEqual([])
  })

  it('la calculadora y el chat general no dependen del proyecto', () => {
    // El chat general existe a propósito (criterio del Ing. Luis Mora en el
    // issue): Boorie también se usa como apoyo docente, sin proyecto delante.
    expect(pendientesItem(item('calculator'), SIN_NADA)).toEqual([])
    expect(pendientesItem(item('chatGeneral'), SIN_NADA)).toEqual([])
  })

  it('simulaciones exige red además de proyecto, y la vista de red no', () => {
    expect(pendientesItem(item('simulaciones'), SOLO_PROYECTO)).toEqual(['red'])
    expect(pendientesItem(item('simulaciones'), TODO)).toEqual([])
    // La vista de red es donde se importa el .inp: exigir red la haría
    // inalcanzable, así que el ítem hereda los requisitos de la vista (#33).
    expect(requisitosItem(item('red'))).toEqual(REQUISITOS_VISTA.wntr)
    expect(pendientesItem(item('red'), SOLO_PROYECTO)).toEqual([])
  })

  it('nunca hay dos ítems encendidos a la vez', () => {
    const ubicaciones: UbicacionActual[] = [
      { vista: 'projects', ambitoChat: 'general', seccionRed: null },
      { vista: 'chat', ambitoChat: 'general', seccionRed: null },
      { vista: 'chat', ambitoChat: 'proyecto', seccionRed: null },
      { vista: 'wntr', ambitoChat: 'general', seccionRed: null },
      { vista: 'wntr', ambitoChat: 'general', seccionRed: 'simulate' },
      { vista: 'calculator', ambitoChat: 'general', seccionRed: null },
      { vista: 'wisdom', ambitoChat: 'general', seccionRed: null },
      { vista: 'settings', ambitoChat: 'general', seccionRed: null },
    ]
    for (const donde of ubicaciones) {
      const encendidos = NAVEGACION.filter(i => itemActivo(i, donde)).map(i => i.id)
      expect(encendidos, JSON.stringify(donde)).toHaveLength(1)
    }
  })

  it('distingue los dos chats y las dos entradas a la vista de red', () => {
    const enChatGeneral: UbicacionActual = { vista: 'chat', ambitoChat: 'general', seccionRed: null }
    expect(itemActivo(item('chatGeneral'), enChatGeneral)).toBe(true)
    expect(itemActivo(item('chatProyecto'), enChatGeneral)).toBe(false)

    const enSimulaciones: UbicacionActual = { vista: 'wntr', ambitoChat: 'general', seccionRed: 'simulate' }
    expect(itemActivo(item('simulaciones'), enSimulaciones)).toBe(true)
    expect(itemActivo(item('red'), enSimulaciones)).toBe(false)
  })

  it('todas las etiquetas y títulos de bloque están en los tres idiomas', () => {
    const claves = [...NAVEGACION.map(i => i.etiqueta), ...BLOQUES.map(b => b.titulo)]
    for (const clave of claves) {
      for (const dic of [es, en, ca]) {
        expect(resolver(dic, clave), clave).toBeTruthy()
      }
    }
  })

  it('el aviso mira lo que pidió el usuario, no sólo la vista a la que llega (#46)', () => {
    // «Simulaciones» y «Red WNTR» llevan a la misma vista y sólo la primera
    // exige red. Resolviendo por vista, quien pulsaba «Simulaciones» sin red
    // aterrizaba en la pantalla de importar sin que nada lo explicara.
    const sinRed = { hayProyecto: true, hayRed: false }
    const enSimulaciones: UbicacionActual = { vista: 'wntr', ambitoChat: 'general', seccionRed: 'simulate' }

    const activo = NAVEGACION.find(i => itemActivo(i, enSimulaciones))!
    expect(activo.id).toBe('simulaciones')
    expect(pendientesItem(activo, sinRed)).toEqual(['red'])

    // La vista de red por sí misma no exige red: es donde se importa el .inp.
    const enRed: UbicacionActual = { vista: 'wntr', ambitoChat: 'general', seccionRed: null }
    const activoRed = NAVEGACION.find(i => itemActivo(i, enRed))!
    expect(activoRed.id).toBe('red')
    expect(pendientesItem(activoRed, sinRed)).toEqual([])
  })

  it('con red cargada, «Simulaciones» deja de reclamar nada', () => {
    const conRed = { hayProyecto: true, hayRed: true }
    const enSimulaciones: UbicacionActual = { vista: 'wntr', ambitoChat: 'general', seccionRed: 'simulate' }
    const activo = NAVEGACION.find(i => itemActivo(i, enSimulaciones))!
    expect(pendientesItem(activo, conRed)).toEqual([])
  })
})
