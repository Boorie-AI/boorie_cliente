/**
 * Lo que se fija aquí (#194): que un documento adjunto nunca llega al modelo
 * más grande de lo que cabe, que de uno grande llega lo que la pregunta busca
 * —también el encabezado que da sentido a la fila— y que cuando no va entero
 * se le dice al modelo.
 */

import { describe, it, expect } from 'vitest'
import {
  estimarTokens,
  presupuestoDelAdjunto,
  seleccionarFragmentos,
  bloqueParaElModelo,
  separarDocumentoPegado,
  fuentesQueCaben,
  referenciasALaEstructura,
  relevanciaSemantica,
  trocear,
} from './adjunto'

/** Una memoria de cálculo como la de la prueba en la aplicación: 120 tramos de 15 tuberías. */
function memoria(): string {
  const lineas = ['MEMORIA DE CÁLCULO HIDRÁULICO', '']
  for (let s = 1; s <= 120; s++) {
    const t = String(s).padStart(3, '0')
    lineas.push(`${s}. Tramo de estudio T-${t}`)
    lineas.push(`El tramo T-${t} abastece a ${40 + s} viviendas con una dotación de ${s === 120 ? 150 : 200} l/hab/día.`)
    for (let p = 1; p <= 15; p++) {
      const id = `P-${t}-${String(p).padStart(2, '0')}`
      lineas.push(`  Tubería ${id}  DN ${p === 15 && s === 120 ? 250 : 110} mm  L=${100 + p} m  Q=${(p * 1.37).toFixed(2)} l/s  Pnudo=${20 + p}.5 m.c.a.`)
    }
    lineas.push('')
  }
  return lineas.join('\n')
}

describe('la estimación de tokens', () => {
  it('cuenta cada cifra: una tabla gasta mucho más que su número de palabras', () => {
    const fila = '  Tubería P-120-15  DN 250 mm  L=105 m  Q=8.51 l/s  v=0.17 m/s'
    // Ollama da 1,5 caracteres por token en filas así; contar por caracteres/4 se quedaría en la mitad.
    expect(estimarTokens(fila)).toBeGreaterThanOrEqual(Math.ceil(fila.length / 1.5))
  })

  it('en prosa no se dispara', () => {
    const prosa = 'La pérdida de carga se calcula por la fórmula de Hazen y Williams en toda la red.'
    expect(estimarTokens(prosa)).toBeLessThan(prosa.length / 2.5)
  })
})

describe('el presupuesto', () => {
  it('con Ollama sale de los 4096 tokens de contexto', () => {
    expect(presupuestoDelAdjunto('ollama', 0)).toBeLessThan(4096)
    expect(presupuestoDelAdjunto('Ollama', 500)).toBe(presupuestoDelAdjunto('ollama', 0) - 500)
  })

  it('en la nube hay mucho más sitio', () => {
    expect(presupuestoDelAdjunto('openai', 0)).toBeGreaterThan(presupuestoDelAdjunto('ollama', 0) * 5)
  })

  it('nunca es negativo', () => {
    expect(presupuestoDelAdjunto('ollama', 100_000)).toBe(0)
  })
})

describe('qué parte del documento llega', () => {
  it('uno que cabe llega entero y sin tocar', () => {
    const texto = 'Acta de prueba de presión.\nResultado: APTO.'
    expect(seleccionarFragmentos(texto, '¿Resultado?', 1000)).toEqual({ texto, completo: true, incluidos: 1, total: 1 })
  })

  it('de uno grande, la fila que se pregunta y el encabezado de su tramo', () => {
    const s = seleccionarFragmentos(memoria(), '¿Qué dotación y qué diámetro tiene la tubería P-120-15?', 1200)
    expect(s.completo).toBe(false)
    expect(s.texto).toContain('Tubería P-120-15  DN 250 mm')
    expect(s.texto).toContain('El tramo T-120 abastece a 160 viviendas con una dotación de 150')
  })

  it('no se pasa del presupuesto', () => {
    const s = seleccionarFragmentos(memoria(), '¿Qué diámetro tiene la tubería P-064-07?', 1200)
    expect(estimarTokens(s.texto)).toBeLessThanOrEqual(1200)
    expect(s.texto).toContain('P-064-07')
  })

  it('lo que no es contiguo va separado por «[…]», en el orden del documento', () => {
    const s = seleccionarFragmentos(memoria(), '¿Y las tuberías P-010-03 y P-090-03?', 1200)
    expect(s.texto).toContain('[…]')
    expect(s.texto.indexOf('P-010-03')).toBeLessThan(s.texto.indexOf('P-090-03'))
  })

  it('sin nada en común con la pregunta, se lee desde el principio', () => {
    const s = seleccionarFragmentos(memoria(), 'Resúmelo', 600)
    expect(s.texto.startsWith('MEMORIA DE CÁLCULO HIDRÁULICO')).toBe(true)
  })
})

describe('lo que lee el modelo', () => {
  it('si va entero, sin avisos', () => {
    const bloque = bloqueParaElModelo({ nombre: 'acta.pdf' }, { texto: 'APTO', completo: true, incluidos: 1, total: 1 })
    expect(bloque).toBe('=== DOCUMENTO ADJUNTO: acta.pdf ===\nAPTO\n=== FIN DEL DOCUMENTO ===\n\n')
  })

  it('si no, cuánto tiene y que no lo dé por leído', () => {
    const bloque = bloqueParaElModelo({ nombre: 'informe.pdf' }, { texto: 'x', completo: false, incluidos: 6, total: 720 })
    expect(bloque).toContain('6 de sus 720 fragmentos')
    expect(bloque).toContain('no aparece en lo que has podido leer')
  })

  it('si es un escaneado, que sus cifras pueden estar mal leídas (#198)', () => {
    const bloque = bloqueParaElModelo({ nombre: 'acta.pdf', ocr: { confianza: 91, paginas: 1 } }, { texto: 'APTO', completo: true, incluidos: 1, total: 1 })
    expect(bloque).toContain('leído con OCR (confianza 91 %)')
  })

  it('si no cabe nada, que lo sepa', () => {
    const bloque = bloqueParaElModelo({ nombre: 'informe.pdf' }, { texto: '', completo: false, incluidos: 0, total: 720 })
    expect(bloque).toContain('no lo has leído')
    expect(bloque).not.toContain('=== DOCUMENTO ADJUNTO')
  })
})

describe('los mensajes guardados antes de #194', () => {
  it('se separa el documento pegado de la pregunta', () => {
    const viejo = '=== ATTACHED DOCUMENT: informe_largo.pdf ===\n\nMEMORIA\n...\n\n=== END DOCUMENT ===\n\n¿Qué diámetro tiene la P-120-15?'
    expect(separarDocumentoPegado(viejo)).toEqual({ pregunta: '¿Qué diámetro tiene la P-120-15?', nombre: 'informe_largo.pdf' })
  })

  it('un mensaje normal se queda como está', () => {
    expect(separarDocumentoPegado('Hola')).toEqual({ pregunta: 'Hola' })
  })
})

describe('las fuentes del RAG en lo que deja el adjunto (#201)', () => {
  const bloque = (fuentes: string[]) => fuentes.join('\n')
  const f = (n: number) => `fuente ${n} `.repeat(40)

  it('si caben todas, van todas', () => {
    expect(fuentesQueCaben([f(1), f(2)], 10_000, bloque)).toEqual([f(1), f(2)])
  })

  it('se quitan desde la menos relevante, que es la última', () => {
    const una = estimarTokens(bloque([f(1)]))
    expect(fuentesQueCaben([f(1), f(2), f(3)], una + 5, bloque)).toEqual([f(1)])
  })

  it('sin sitio, ninguna', () => {
    expect(fuentesQueCaben([f(1)], 3, bloque)).toEqual([])
  })
})

/**
 * Un libro con las trampas del de Walton (#204): el índice lista los capítulos
 * con el título espaciado, cada página lleva su número junto a una cabecera que
 * se repite, el capítulo empieza con el número solo y el título debajo, y dentro
 * del capítulo 5 hay una subsección en mayúsculas que también va detrás de un 5.
 */
function libro(): string {
  const relleno = (tema: string, n: number) =>
    Array.from({ length: n }, (_, i) => `The ${tema} is discussed in paragraph ${i} with enough words to fill the page properly.`).join('\n')
  const capitulos = ['Introduction', 'Design and Field Observation', 'Constant Discharge Test Analysis', 'Step Drawdown Test Analysis', 'Case Studies']
  const partes = ['PUMPING TESTS', '', 'Contents', '']
  capitulos.forEach((t, i) => partes.push(String(i + 1), '', t.toUpperCase().split('').join(' ').replace(/ {3}/g, '  ')))
  partes.push('')
  capitulos.forEach((t, i) => {
    for (let pagina = 0; pagina < 6; pagina++) partes.push(String(i * 10 + pagina + 2), '', 'PUMPING TESTS', '', relleno(`topic ${i + 1}.${pagina}`, 8))
    partes.push(String(i + 1), t, `Chapter ${i + 1} opens with the ${t.toLowerCase()} and its main ideas.`, relleno(t.toLowerCase(), 30))
    if (i === 4) partes.push('5', '', 'INDUCED STREAMBED INFILTRATION', relleno('infiltration', 30))
    if (i === 3) partes.push('Table 4.1. Database for the step test', relleno('table rows', 10))
  })
  return partes.join('\n')
}

describe('las referencias a la estructura del documento (#204)', () => {
  it('se reconocen en los tres idiomas, con números romanos o escritos', () => {
    expect(referenciasALaEstructura('¿De qué habla el capítulo 4?')).toEqual([{ tipo: 'capitulo', numero: '4' }])
    expect(referenciasALaEstructura('Resume el capítulo IV')).toEqual([{ tipo: 'capitulo', numero: '4' }])
    expect(referenciasALaEstructura('i el capítol cinc?')).toEqual([{ tipo: 'capitulo', numero: '5' }])
    expect(referenciasALaEstructura('What is chapter two about?')).toEqual([{ tipo: 'capitulo', numero: '2' }])
    expect(referenciasALaEstructura('¿Qué muestra la tabla 4.1?')).toEqual([{ tipo: 'tabla', numero: '4.1' }])
    expect(referenciasALaEstructura('el capítulo 4.2')).toEqual([{ tipo: 'seccion', numero: '4.2' }])
    expect(referenciasALaEstructura('¿Qué dotación tiene la tubería P-120-15?')).toEqual([])
  })

  it('«¿de qué habla el capítulo 4?» lee el capítulo 4, no la portada', () => {
    const s = seleccionarFragmentos(libro(), 'de que habla el capitulo 4', 800)
    expect(s.texto).toContain('Step Drawdown Test Analysis\nChapter 4 opens')
    expect(s.texto).not.toContain('Contents')
  })

  it('una subsección en mayúsculas detrás de un 5 no pasa por el capítulo 5', () => {
    const s = seleccionarFragmentos(libro(), 'resume el capítulo cinco', 800)
    expect(s.texto).toContain('Case Studies\nChapter 5 opens')
  })

  it('el número de página junto a la cabecera que se repite no es un capítulo', () => {
    // La página 4 del libro va antes del capítulo 1: si contara, el capítulo 4 empezaría ahí.
    const s = seleccionarFragmentos(libro(), 'What is chapter 1 about?', 800)
    expect(s.texto).toContain('Introduction\nChapter 1 opens')
  })

  it('una tabla por su número', () => {
    const s = seleccionarFragmentos(libro(), '¿Qué muestra la tabla 4.1?', 400)
    expect(s.texto).toContain('Table 4.1. Database')
  })

  it('un título en minúscula vale si el índice lo repite', () => {
    const texto = ['Índice', '1', 'Introducción', '2', 'Diseño y observación de campo', '', 'Texto de la portada.',
      ...Array.from({ length: 200 }, (_, i) => `Párrafo ${i} de la introducción, con relleno para ocupar sitio en el documento.`),
      '2', 'Diseño y observación de campo', 'El diseño de la prueba empieza por el pozo de bombeo.',
      ...Array.from({ length: 200 }, (_, i) => `Párrafo ${i} del diseño, con relleno para ocupar sitio en el documento.`)].join('\n')
    const s = seleccionarFragmentos(texto, '¿De qué habla el capítulo 2?', 500)
    expect(s.texto).toContain('El diseño de la prueba empieza por el pozo de bombeo.')
  })
})

describe('el significado (#205)', () => {
  it('se mide contra la mediana: el mejor vale 1 y lo típico no suma', () => {
    expect(relevanciaSemantica([0.6, 0.62, 0.61, 0.83, 0.7])).toEqual([0, 0, 0, 1, expect.closeTo(0.38, 2)])
    expect(relevanciaSemantica([0.5, 0.5, 0.5])).toEqual([0, 0, 0])
  })

  it('con una pregunta en otro idioma, sin palabras en común, elige lo que se parece', () => {
    // Es el caso que resolvía mal: «pérdida de carga» no aparece en un texto en inglés.
    const texto = Array.from({ length: 60 }, (_, i) => `Paragraph ${i}. ${i === 41 ? 'The well loss coefficient may be estimated with the Jacob equation.' : 'Aquifer tests are described here.'} `.repeat(12)).join('\n')
    const fragmentos = trocear(texto)
    const similitudes = fragmentos.map(f => (f.includes('well loss') ? 0.76 : 0.6))
    const s = seleccionarFragmentos(texto, '¿Cómo se estima la pérdida de carga en el pozo?', 300, { similitudes })
    expect(s.texto).toContain('The well loss coefficient')
  })

  it('sin similitudes, o con otra longitud, se elige como antes', () => {
    const texto = Array.from({ length: 60 }, (_, i) => `Paragraph ${i} about aquifers. `.repeat(12)).join('\n')
    const sin = seleccionarFragmentos(texto, 'pérdida de carga', 300)
    const mal = seleccionarFragmentos(texto, 'pérdida de carga', 300, { similitudes: [0.9] })
    expect(mal).toEqual(sin)
  })
})

/**
 * El mismo libro como lo saca pdf-parse, que es lo que usa la aplicación: el
 * índice en una línea por capítulo con su página, el número de página pegado a
 * la cabecera, el capítulo 2 sin su número —se pierde en el PDF— y, en el
 * apéndice, tablas con un «4» suelto encima de «Temperature».
 */
function libroDePdfParse(): string {
  const relleno = (tema: string, n: number) =>
    Array.from({ length: n }, (_, i) => `The ${tema} is discussed in paragraph ${i} with enough words to fill the page.`).join('\n')
  const capitulos = ['Introduction', 'Design and Field Observation', 'Constant Discharge Test Analysis', 'Step Drawdown Test Analysis', 'Case Studies']
  const partes = ['Contents']
  capitulos.forEach((t, i) => partes.push(`${i + 1}  ${t.toUpperCase().replace(/ /g, '  ')} ${i * 20 + 1}`))
  capitulos.forEach((t, i) => {
    partes.push(`${i * 20 + 2}   GROUNDWATER PUMPING TESTS`, relleno(`page ${i}`, 12))
    if (i !== 1) partes.push(String(i + 1))
    partes.push(t, `Chapter ${i + 1} opens with the ${t.toLowerCase()}.`, relleno(t.toLowerCase(), 25))
    partes.push(`${t.toUpperCase()}   ${i * 20 + 5}`, relleno(`more ${i}`, 12))
  })
  for (let tabla = 0; tabla < 3; tabla++) partes.push('Appendix', `${tabla + 3}`, 'Temperature', relleno(`table ${tabla}`, 15))
  return partes.join('\n')
}

describe('las referencias a la estructura, con el texto de pdf-parse (#204)', () => {
  it('el capítulo 4 no es la tabla del apéndice que lleva un 4 encima', () => {
    expect(seleccionarFragmentos(libroDePdfParse(), 'de que haba el capitulo 4', 600).texto).toContain('Chapter 4 opens')
  })

  it('un capítulo que perdió su número se encuentra por el título del índice', () => {
    expect(seleccionarFragmentos(libroDePdfParse(), 'de que habla el capítulo 2', 600).texto).toContain('Chapter 2 opens')
  })

  it('la cabecera de página con su número no pasa por capítulo', () => {
    expect(seleccionarFragmentos(libroDePdfParse(), 'resume el capítulo 1', 600).texto).toContain('Chapter 1 opens')
  })
})
