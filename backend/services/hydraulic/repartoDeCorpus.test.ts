/**
 * Lo que se fija aquí (#158): que ningún corpus se lleve todas las plazas
 * cuando hay candidatos de los dos, y que no se desperdicie ninguna cuando sólo
 * hay de uno.
 */

import { describe, it, expect } from 'vitest'
import { corpusDe, filtroDeCorpus, repartirPorCorpus, unirFiltros, type Corpus } from './repartoDeCorpus'

/** Un candidato es su corpus y su puesto, que es todo lo que mira el reparto. */
const doc = (n: number) => ({ id: `d${n}`, corpus: 'documental' as Corpus })
const sim = (n: number) => ({ id: `s${n}`, corpus: 'simulacion' as Corpus })
const cual = (c: { corpus: Corpus }) => c.corpus
const ids = (xs: { id: string }[]) => xs.map(x => x.id)

describe('de qué corpus es cada fragmento', () => {
  it('los derivados de simulación por su categoría, el resto es documentación', () => {
    expect(corpusDe('simulations')).toBe('simulacion')
    expect(corpusDe('hydraulics')).toBe('documental')
    expect(corpusDe('regulations')).toBe('documental')
    expect(corpusDe(null)).toBe('documental')
    expect(corpusDe(undefined)).toBe('documental')
  })
})

describe('el reparto de plazas', () => {
  it('el corpus que copa la búsqueda no se lleva todas', () => {
    // El caso del issue: ocho informes de simulación por delante del manual.
    const candidatos = [sim(1), sim(2), sim(3), sim(4), sim(5), sim(6), doc(1), doc(2)]
    const salida = repartirPorCorpus(candidatos, 4, cual)

    expect(salida).toHaveLength(4)
    expect(salida.filter(x => x.corpus === 'documental')).toHaveLength(2)
    expect(ids(salida)).toEqual(['s1', 's2', 'd1', 'd2'])
  })

  it('y al revés: la documentación tampoco ahoga a los informes', () => {
    const candidatos = [doc(1), doc(2), doc(3), doc(4), sim(1)]
    const salida = repartirPorCorpus(candidatos, 4, cual)
    expect(salida.filter(x => x.corpus === 'simulacion')).toHaveLength(1)
  })

  it('con un solo corpus presente se lleva todas las plazas', () => {
    // Una pregunta cuya respuesta sólo está en un sitio no tiene por qué
    // quedarse con la mitad del contexto.
    const salida = repartirPorCorpus([sim(1), sim(2), sim(3), sim(4)], 3, cual)
    expect(ids(salida)).toEqual(['s1', 's2', 's3'])
  })

  it('no reordena: la cuota decide quién entra, no en qué orden se lee', () => {
    const candidatos = [sim(1), doc(1), sim(2), doc(2)]
    // Con límite 3 la cuota es 1 por corpus: entran s1 y d1, y la plaza que
    // sobra va al mejor de los que quedan, que es s2. Sale en orden de entrada.
    expect(ids(repartirPorCorpus(candidatos, 3, cual))).toEqual(['s1', 'd1', 's2'])
  })

  it('si caben todos, no se toca nada', () => {
    const candidatos = [sim(1), doc(1)]
    expect(repartirPorCorpus(candidatos, 5, cual)).toEqual(candidatos)
  })

  it('un límite de uno se lo lleva el mejor, sin inventarse una cuota', () => {
    expect(ids(repartirPorCorpus([sim(1), doc(1)], 1, cual))).toEqual(['s1'])
  })

  it('sin límite no hay resultados', () => {
    expect(repartirPorCorpus([sim(1)], 0, cual)).toEqual([])
  })
})

describe('los filtros del almacén', () => {
  it('cada corpus pide lo suyo, y son complementarios', () => {
    expect(filtroDeCorpus('simulacion')).toBe('category == "simulations"')
    expect(filtroDeCorpus('documental')).toBe('not (category == "simulations")')
  })

  it('se combinan con el del ámbito, que es el que garantiza la confidencialidad', () => {
    expect(unirFiltros('projectId == ""', filtroDeCorpus('documental')))
      .toBe('(projectId == "") and (not (category == "simulations"))')
  })

  it('sin nada que restringir no se inventa una expresión', () => {
    expect(unirFiltros(undefined, undefined)).toBeUndefined()
    expect(unirFiltros(undefined, 'a == 1')).toBe('(a == 1)')
  })
})
