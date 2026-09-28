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
