import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { nombreDescarga, sinExtension } from './nombreArchivo'

/**
 * Los nombres de los ficheros que Boorie deja descargar (issue #110).
 *
 * Lo reportó el Dr. Mora: el fichero de la curva de fragilidad «es .inp y
 * debería ser .csv». El nombre se componía metiendo dentro el de la red, que ya
 * trae extensión, así que salía `curva_fragilidad_PVC_Net3 2.inp.csv` y Windows
 * —que oculta las extensiones conocidas— lo enseñaba como `...Net3 2.inp`.
 */
describe('componer el nombre de una descarga', () => {
  it('el caso del informe: la extensión de la red no se cuela en el nombre', () => {
    expect(nombreDescarga(['curva_fragilidad', 'PVC', 'Net3 2.inp'], 'csv'))
      .toBe('curva_fragilidad_PVC_Net3 2.csv')
  })

  it('la extensión pedida es la única que queda', () => {
    const n = nombreDescarga(['red.inp', 'geo'], 'json')
    expect(n).toBe('red_geo.json')
    expect(n.match(/\.[a-z]+/gi)).toEqual(['.json'])
  })

  it('un nombre sin extensión se queda como está', () => {
    expect(sinExtension('villa_100_casas')).toBe('villa_100_casas')
    expect(sinExtension('villa_100_casas.inp')).toBe('villa_100_casas')
  })

  it('no confunde un número de versión con una extensión', () => {
    // `.2` no es una extensión: si se quitara, «red v1.2» perdería la versión.
    expect(sinExtension('red v1.2')).toBe('red v1.2')
  })

  it('las piezas vacías se caen, para no dejar guiones sueltos', () => {
    expect(nombreDescarga(['informe', '', null, undefined, 'red.inp'], 'csv'))
      .toBe('informe_red.csv')
  })

  it('sin ninguna pieza usable sigue saliendo un nombre válido', () => {
    expect(nombreDescarga([null, '', '  '], 'csv')).toBe('boorie.csv')
    // Una pieza que era sólo extensión no debe dejar el nombre en blanco.
    expect(nombreDescarga(['.inp'], 'csv')).toBe('boorie.csv')
  })

  it('acepta la extensión con punto o sin él', () => {
    expect(nombreDescarga(['x'], '.csv')).toBe('x.csv')
    expect(nombreDescarga(['x'], 'csv')).toBe('x.csv')
  })
})

/**
 * El guardián: que nadie vuelva a componer un nombre de descarga a mano.
 *
 * El fallo no estaba en una función, estaba en una plantilla escrita en el
 * sitio. Arreglar los tres sitios no impide que el cuarto nazca igual, así que
 * lo que se comprueba es que **toda** asignación a `download` pase por el
 * ayudante.
 */
const RAIZ = 'src'

function ficheros(dir: string): string[] {
  return readdirSync(dir).flatMap(e => {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) return ficheros(p)
    return /\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p) ? [p] : []
  })
}

/**
 * Excepciones, con su motivo. Aquí el nombre llega entero desde el proceso
 * principal —lo compone `reportService.ts` con el id del proyecto y la fecha—,
 * así que no hay ninguna extensión ajena que se pueda colar.
 */
const EXCEPCIONES = new Map([
  ['src/components/hydraulic/WNTRAnalysisPanel.tsx', 'el nombre lo compone reportService.ts'],
  ['src/components/hydraulic/WNTRSimulationWizard.tsx', 'el nombre lo compone reportService.ts'],
])

describe('nadie compone un nombre de descarga a mano', () => {
  it('toda asignación a download usa nombreDescarga()', () => {
    const infractores: string[] = []

    for (const fichero of ficheros(RAIZ)) {
      const codigo = readFileSync(fichero, 'utf8')
      codigo.split('\n').forEach((linea, i) => {
        if (!/\.download\s*=/.test(linea)) return
        if (linea.includes('nombreDescarga(')) return
        if (EXCEPCIONES.has(fichero.replace(/\\/g, '/'))) return
        infractores.push(`${fichero}:${i + 1}  ${linea.trim()}`)
      })
    }

    expect(
      infractores,
      'Componer el nombre a mano deja colarse la extensión de la red ' +
      '(issue #110). Usa nombreDescarga(), o añade una excepción con su motivo.'
    ).toEqual([])
  })

  it('las excepciones siguen existiendo, para que no se queden de adorno', () => {
    for (const fichero of EXCEPCIONES.keys()) {
      expect(readFileSync(fichero, 'utf8')).toMatch(/\.download\s*=/)
    }
  })
})
