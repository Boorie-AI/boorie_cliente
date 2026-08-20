import { describe, it, expect } from 'vitest'
import {
  RETENCION_POR_DEFECTO,
  compararVersiones,
  resumirDiferencia,
  versionesAPodar,
} from './versionado'

const v = (n: number, marcada = false) => ({ id: `v${n}`, versionNumber: n, marcada })

describe('retención', () => {
  it('con menos versiones que el tope no poda nada', () => {
    const versiones = [v(1), v(2), v(3)]
    expect(versionesAPodar(versiones, { conservarSinMarcar: 10 })).toEqual([])
  })

  it('conserva las N más recientes sin marcar y poda el resto', () => {
    const versiones = Array.from({ length: 15 }, (_, i) => v(i + 1))
    const podar = versionesAPodar(versiones, { conservarSinMarcar: 10 })

    expect(podar).toHaveLength(5)
    // Se van las cinco más antiguas, no cinco cualesquiera.
    expect(podar.sort()).toEqual(['v1', 'v2', 'v3', 'v4', 'v5'].sort())
  })

  it('una versión marcada como hito no se poda por vieja que sea', () => {
    const versiones = [v(1, true), ...Array.from({ length: 14 }, (_, i) => v(i + 2))]
    const podar = versionesAPodar(versiones, { conservarSinMarcar: 10 })

    expect(podar).not.toContain('v1')
    expect(podar).toHaveLength(4)
  })

  it('con todo marcado no se poda nada, aunque haya cien versiones', () => {
    const versiones = Array.from({ length: 100 }, (_, i) => v(i + 1, true))
    expect(versionesAPodar(versiones, { conservarSinMarcar: 3 })).toEqual([])
  })

  it('la más reciente se conserva siempre, aunque la política sea cero', () => {
    // Quedarse sin ninguna version convertiria la retencion en una forma de
    // perder el historial entero.
    const versiones = [v(1), v(2), v(3)]
    const podar = versionesAPodar(versiones, { conservarSinMarcar: 0 })

    expect(podar).not.toContain('v3')
    expect(podar.sort()).toEqual(['v1', 'v2'])
  })

  it('sin versiones no hay nada que podar', () => {
    expect(versionesAPodar([], RETENCION_POR_DEFECTO)).toEqual([])
  })

  it('no depende del orden en que lleguen', () => {
    const desordenadas = [v(3), v(1), v(15), v(2)]
    expect(versionesAPodar(desordenadas, { conservarSinMarcar: 2 }).sort()).toEqual(['v1', 'v2'])
  })
})

describe('comparación entre versiones', () => {
  const ANTES = {
    nodes: [
      { id: 'J1', type: 'junction', elevation: 100, demand: 5 },
      { id: 'J2', type: 'junction', elevation: 110, demand: 3 },
      { id: 'T1', type: 'tank', elevation: 150 },
    ],
    links: [
      { id: 'P1', type: 'pipe', from: 'J1', to: 'J2', diameter: 200, length: 500 },
      { id: 'P2', type: 'pipe', from: 'J2', to: 'T1', diameter: 150, length: 300 },
    ],
  }

  it('una red idéntica a sí misma no tiene cambios', () => {
    const d = compararVersiones(ANTES, ANTES)
    expect(d.sinCambios).toBe(true)
    expect(resumirDiferencia(d)).toBe('Sin cambios en la red')
  })

  it('detecta lo añadido, lo eliminado y lo modificado', () => {
    const despues = {
      nodes: [
        { id: 'J1', type: 'junction', elevation: 100, demand: 8 },
        { id: 'T1', type: 'tank', elevation: 150 },
        { id: 'J3', type: 'junction', elevation: 120, demand: 2 },
      ],
      links: [
        { id: 'P1', type: 'pipe', from: 'J1', to: 'J3', diameter: 250, length: 500 },
        { id: 'P2', type: 'pipe', from: 'J3', to: 'T1', diameter: 150, length: 300 },
      ],
    }
    const d = compararVersiones(ANTES, despues)

    expect(d.nudos.anadidos).toEqual(['J3'])
    expect(d.nudos.eliminados).toEqual(['J2'])
    expect(d.nudos.modificados).toEqual([{ id: 'J1', campos: ['demand'] }])
    expect(d.tramos.modificados.find(m => m.id === 'P1')!.campos.sort()).toEqual(['diameter', 'to'])
    expect(d.sinCambios).toBe(false)
  })

  it('«100» y «100.0» no son un cambio de diámetro', () => {
    // Un .inp reescrito cambia el formato de los números; marcarlo como cambio
    // llenaría el diff de ruido que esconde lo que sí cambió.
    const despues = {
      ...ANTES,
      links: [
        { id: 'P1', type: 'pipe', from: 'J1', to: 'J2', diameter: '200.0', length: '500' },
        ANTES.links[1],
      ],
    }
    expect(compararVersiones(ANTES, despues).sinCambios).toBe(true)
  })

  it('no mira los resultados de simulación que vengan dentro del nudo', () => {
    // El diff de una red habla de la red, no de lo que se calculó sobre ella.
    const despues = {
      ...ANTES,
      nodes: ANTES.nodes.map(n => ({ ...n, pressure: 42, head: 99 })),
    }
    expect(compararVersiones(ANTES, despues).sinCambios).toBe(true)
  })

  it('una red vaciada dice que se eliminó todo, no que no hay cambios', () => {
    const d = compararVersiones(ANTES, { nodes: [], links: [] })
    expect(d.nudos.eliminados).toHaveLength(3)
    expect(d.tramos.eliminados).toHaveLength(2)
    expect(d.sinCambios).toBe(false)
  })

  it('resume en singular y en plural, sin listar lo que no ocurrió', () => {
    const d = compararVersiones(ANTES, {
      nodes: [...ANTES.nodes, { id: 'J9', type: 'junction', elevation: 1 }],
      links: ANTES.links,
    })
    expect(resumirDiferencia(d)).toBe('1 nudo añadido')
  })

  it('aguanta una versión sin nudos ni tramos declarados', () => {
    expect(compararVersiones({}, {}).sinCambios).toBe(true)
    expect(compararVersiones({}, ANTES).nudos.anadidos).toHaveLength(3)
  })
})
