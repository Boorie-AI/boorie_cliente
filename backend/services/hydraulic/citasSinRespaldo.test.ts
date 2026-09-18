/**
 * Lo que se fija aquí, por orden: que la página inventada no sobrevive, que la
 * buena no se toca, y que la prosa que sólo menciona la palabra «página» sale
 * intacta (#165).
 */

import { describe, it, expect } from 'vitest'
import { limpiarCitasSinRespaldo } from './citasSinRespaldo'

describe('páginas que el modelo se inventa', () => {
  it('quita el hueco sin rellenar, que es el caso que se vio en la aplicación', () => {
    const { texto, quitadas } = limpiarCitasSinRespaldo(
      '[Fuente: 1.4 Engineering Hydrology, K. Subramanya, página X]',
      [{ page: null }]
    )

    expect(texto).toBe('[Fuente: 1.4 Engineering Hydrology, K. Subramanya]')
    expect(quitadas).toHaveLength(1)
  })

  it('quita una página que ninguna fuente respalda', () => {
    const { texto } = limpiarCitasSinRespaldo(
      'El coeficiente vale 0,6 (F1, página 412).',
      [{ page: 96 }]
    )

    expect(texto).not.toContain('412')
    expect(texto).toContain('0,6')
  })

  it('no toca la página que la fuente sí declara', () => {
    const original = 'El coeficiente vale 0,6 (F1, página 96).'
    expect(limpiarCitasSinRespaldo(original, [{ page: 96 }]).texto).toBe(original)
  })

  it('la página llega como número o como texto, y da igual', () => {
    const original = 'Según el manual (página 78) …'
    expect(limpiarCitasSinRespaldo(original, [{ page: '78' }]).texto).toBe(original)
  })

  it('la página 0 no respalda nada: es la de un documento mal indexado', () => {
    const { quitadas } = limpiarCitasSinRespaldo('Lo dice la página 0.', [{ page: 0 }])
    expect(quitadas).toHaveLength(1)
  })
})

describe('lo que no se puede romper', () => {
  it('no se come la prosa que sólo nombra una página', () => {
    // Borrar texto legítimo para arreglar una cita cambia un error visible por
    // uno invisible, que es peor.
    for (const frase of [
      'El desarrollo continúa en la página siguiente.',
      'Está publicado en la página web del organismo.',
      'La tabla ocupa media página.',
    ]) {
      expect(limpiarCitasSinRespaldo(frase, []).texto).toBe(frase)
    }
  })

  it('sin fuentes con página, una respuesta sin citas sale igual que entró', () => {
    const original = 'No he encontrado nada sobre eso en los documentos indexados.'
    expect(limpiarCitasSinRespaldo(original, []).texto).toBe(original)
  })

  it('el texto vacío no revienta', () => {
    expect(limpiarCitasSinRespaldo('', [{ page: 3 }])).toEqual({ texto: '', quitadas: [] })
  })

  it('varias citas a la vez: se va la falsa y se queda la buena', () => {
    const { texto, quitadas } = limpiarCitasSinRespaldo(
      'Primero (F1, página 96) y después (F2, página 999).',
      [{ page: 96 }]
    )

    expect(texto).toContain('96')
    expect(texto).not.toContain('999')
    expect(quitadas).toHaveLength(1)
  })
})
