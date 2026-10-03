import { describe, it, expect } from 'vitest'
import { paginasDeLosFragmentos, etiquetaDePaginas } from './paginasDelAdjunto'
import { trocear } from './adjunto'

/** Un libro con las cabeceras que deja pdf-parse: «N TÍTULO» en las pares, «CAPÍTULO N» en las impares. */
function libro(): string {
  const paginas: string[] = ['GROUNDWATER PUMPING TESTS', 'Contents', 'DESIGN AND FIELD OBSERVATION 7', 'STEP DRAWDOWN TEST ANALYSIS 77']
  for (let p = 7; p <= 30; p++) {
    if (p === 7) paginas.push('2', 'Design and Field Observation')
    else paginas.push(p % 2 === 0 ? `${p} GROUNDWATER PUMPING TESTS` : `DESIGN AND FIELD OBSERVATION ${p}`)
    for (let l = 0; l < 12; l++) paginas.push(`Texto de la página ${p}, línea ${l}: el pozo se bombea a caudal constante.`)
    if (p === 14) paginas.push('Table 2.1. Time Intervals for Observation Well Measurements')
  }
  return paginas.join('\n')
}

describe('las páginas de un adjunto', () => {
  it('cada fragmento sabe en qué página impresa está', () => {
    const texto = libro()
    const fragmentos = trocear(texto)
    const paginas = paginasDeLosFragmentos(texto, fragmentos)

    const i = fragmentos.findIndex(f => f.includes('Table 2.1'))
    expect(paginas[i]!.desde).toBeLessThanOrEqual(14)
    expect(paginas[i]!.hasta).toBeGreaterThanOrEqual(14)
    expect(paginas[i]!.hasta - paginas[i]!.desde).toBeLessThanOrEqual(1)
  })

  it('el índice no cuenta: sus números no van en orden con el cuerpo', () => {
    const texto = libro()
    const fragmentos = trocear(texto)
    const paginas = paginasDeLosFragmentos(texto, fragmentos)
    // La portada va antes de cualquier cabecera, y la «77» del índice no se cuela en el cuerpo.
    expect(paginas[0]).toBeNull()
    expect(paginas.filter(Boolean).every(r => r!.hasta <= 30)).toBe(true)
    const diez = fragmentos.findIndex(f => f.includes('página 10, línea 5'))
    expect(paginas[diez]!.desde).toBeLessThanOrEqual(10)
    expect(paginas[diez]!.hasta).toBeGreaterThanOrEqual(10)
  })

  it('un documento sin cabeceras no se marca: mejor sin página que con una equivocada', () => {
    const texto = Array.from({ length: 200 }, (_, i) => `Tramo T-${i}: 40 viviendas, 200 l/hab/día.`).join('\n')
    expect(paginasDeLosFragmentos(texto, trocear(texto)).every(p => p === null)).toBe(true)
  })

  it('la página que abre capítulo, sin cabecera, queda como rango', () => {
    const lineas: string[] = []
    for (let p = 70; p <= 86; p++) {
      if (p !== 77) lineas.push(p % 2 === 0 ? `${p} GROUNDWATER PUMPING TESTS` : `STEP DRAWDOWN ANALYSIS ${p}`)
      for (let l = 0; l < 12; l++) lineas.push(`Página ${p}, línea ${l} del texto del capítulo con su contenido.`)
    }
    const texto = lineas.join('\n')
    const fragmentos = trocear(texto)
    const paginas = paginasDeLosFragmentos(texto, fragmentos)
    const i = fragmentos.findIndex(f => f.includes('Página 77, línea 5'))
    // Sin cabecera de la 77 no se sabe dónde empieza: se marca desde la 76.
    expect(paginas[i]!.desde).toBe(76)
    expect(paginas[i]!.hasta).toBeGreaterThanOrEqual(77)
  })

  it('la etiqueta', () => {
    expect(etiquetaDePaginas({ desde: 78, hasta: 78 })).toBe('[p. 78]')
    expect(etiquetaDePaginas({ desde: 76, hasta: 77 })).toBe('[pp. 76-77]')
  })
})
