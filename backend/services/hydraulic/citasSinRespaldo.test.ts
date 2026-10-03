/**
 * Lo que se fija aquí, por orden: que la página inventada no sobrevive, que la
 * buena no se toca, y que la prosa que sólo menciona la palabra «página» sale
 * intacta (#165).
 */

import { describe, it, expect } from 'vitest'
import { limpiarCitasSinRespaldo, paginasQueAparecenEn, marcarReferenciasSinRespaldo, marcarNormasSinRespaldo } from './citasSinRespaldo'

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

describe('lo que se vio con el libro de Walton adjunto', () => {
  it('el «p.» de «cap.» no es una cita', () => {
    const original = 'Lo describe Walton (cap. 4).'
    expect(limpiarCitasSinRespaldo(original, []).texto).toBe(original)
  })

  it('un rango sin respaldo se va entero, sin dejar «‑78)» detrás', () => {
    const { texto } = limpiarCitasSinRespaldo('La ecuación de Jacob (cap. 4, pp. 77‑78) da C.', [])
    expect(texto).toBe('La ecuación de Jacob (cap. 4) da C.')
  })

  it('un rango con una de sus páginas respaldada se queda', () => {
    const original = 'La ecuación de Jacob (pp. 77-78).'
    expect(limpiarCitasSinRespaldo(original, [{ page: 78 }]).texto).toBe(original)
  })

  it('una lista de páginas es una sola cita: no deja «, 52)» suelto', () => {
    const { texto } = limpiarCitasSinRespaldo('Análisis de recuperación (pp. 38–41, 52) e imagen.', [])
    expect(texto).toBe('Análisis de recuperación e imagen.')
    const original = 'Análisis de recuperación (pp. 38–41, 52) e imagen.'
    expect(limpiarCitasSinRespaldo(original, [{ page: 52 }]).texto).toBe(original)
  })

  it('«páginas indicadas» no es el hueco «página X»', () => {
    const original = 'Las ecuaciones provienen del documento citado (páginas indicadas).'
    expect(limpiarCitasSinRespaldo(original, []).texto).toBe(original)
  })

  it('no se come el paréntesis que cierra la cita', () => {
    const { texto } = limpiarCitasSinRespaldo('El coeficiente vale 0,6 (F1, página 412).', [])
    expect(texto).toBe('El coeficiente vale 0,6 (F1).')
  })

  it('las páginas impresas en el adjunto respaldan la cita', () => {
    const leido = 'STEP DRAWDOWN TEST ANALYSIS 77 78 GROUNDWATER PUMPING TESTS s w = CQ 2 (4.1)'
    const original = 'Según Walton (p. 78), s_w = CQ².'
    expect(limpiarCitasSinRespaldo(original, paginasQueAparecenEn(leido)).texto).toBe(original)
  })

  it('con el adjunto, el hueco «página X» sigue sin pasar', () => {
    const { quitadas } = limpiarCitasSinRespaldo('Lo dice Walton (página X).', paginasQueAparecenEn('77 78'))
    expect(quitadas).toHaveLength(1)
  })
})

describe('ecuaciones y tablas que no están en lo leído', () => {
  const LEIDO = 'Well loss may be represented by s w = CQ 2 (4.1) ... C = (s 2 /Q 2 - s 1 /Q 1)/(Q 1 + Q 2) (4.2)\nTable 2.1. Time Intervals for Observation Well Measurements'
  const NOTA = '[no está en lo leído]'

  it('la que está, se queda como estaba', () => {
    const original = 'Según la Ec. 4.2 y la Tabla 2.1 del documento.'
    expect(marcarReferenciasSinRespaldo(original, LEIDO, NOTA).texto).toBe(original)
  })

  it('la que no está se marca, sin borrarla', () => {
    const { texto, marcadas } = marcarReferenciasSinRespaldo('Verificar t_s (Ec. 1.1, p. 3).', LEIDO, NOTA)
    expect(texto).toBe('Verificar t_s (Ec. 1.1 [no está en lo leído], p. 3).')
    expect(marcadas).toEqual(['Ec. 1.1'])
  })

  it('una vez por referencia, no en cada mención', () => {
    const { texto } = marcarReferenciasSinRespaldo('La tabla 3.5 da S. Con la tabla 3.5 se obtiene T.', LEIDO, NOTA)
    expect(texto.split(NOTA)).toHaveLength(2)
  })

  it('basta con que lo leído nombre la ecuación', () => {
    const original = 'El almacenamiento en el pozo se estima con la Ec. 1.1.'
    expect(marcarReferenciasSinRespaldo(original, 'From Equation 1.1 with r c = 0.2 ft, well storage capacity impacts could be appreciable', NOTA).texto).toBe(original)
  })

  it('de un rango basta con un extremo', () => {
    const original = 'Ecuaciones 4.1-4.3 del documento.'
    expect(marcarReferenciasSinRespaldo(original, LEIDO, NOTA).texto).toBe(original)
  })

  it('«Tabla 1» es una tabla de la respuesta, no del documento', () => {
    const original = 'Tabla 1. Escalones de caudal propuestos.'
    expect(marcarReferenciasSinRespaldo(original, LEIDO, NOTA).texto).toBe(original)
  })

  it('un apartado de la propia respuesta no es una fórmula del documento', () => {
    const original = '### 6.3 Eficiencia del pozo\nE = BQ/(BQ+CQ²)\n\n| E al Q de diseño | Fórmula 6.3 |'
    expect(marcarReferenciasSinRespaldo(original, LEIDO, NOTA).texto).toBe(original)
  })

  it('sin nada leído no se marca nada: no hay contra qué comprobar', () => {
    const original = 'Ver la Ec. 7.3.'
    expect(marcarReferenciasSinRespaldo(original, '', NOTA).texto).toBe(original)
  })
})

describe('normas que no están en lo leído', () => {
  const NOTA = '[no está en lo leído]'
  const LEIDO = 'Step drawdown test analysis (4.2). Según la NOM-003-CONAGUA-1996, los pozos ...'

  it('se marcan las que se vieron con Walton adjunto, una vez cada una', () => {
    const { texto, marcadas } = marcarNormasSinRespaldo(
      'En España (RD 849/1986) y en Chile (NCh 3341), México (NMX-AA-147) y Colombia (RAS 2010). Arena según API RP 13C. Otra vez el RD 849/1986.',
      LEIDO, NOTA)
    expect(marcadas).toEqual(['RD 849/1986', 'NCh 3341', 'NMX-AA-147', 'RAS 2010', 'API RP 13C'])
    expect(texto.split(NOTA)).toHaveLength(6)
  })

  it('la que sí está en lo leído se queda como está, escrita como sea', () => {
    const original = 'Lo exige la NOM 003 CONAGUA 1996.'
    expect(marcarNormasSinRespaldo('Lo exige la NOM-003-CONAGUA-1996.', LEIDO, NOTA).marcadas).toEqual([])
    expect(marcarNormasSinRespaldo(original, LEIDO, NOTA).texto).toBe(original)
  })

  it('«Real Decreto» y «RD» son la misma', () => {
    const leido = 'Real Decreto 3/2023, de 10 de enero, criterios técnico-sanitarios'
    expect(marcarNormasSinRespaldo('Según el RD 3/2023.', leido, NOTA).marcadas).toEqual([])
  })

  it('sin nada leído no se marca nada', () => {
    const original = 'Según la UNE-EN 805.'
    expect(marcarNormasSinRespaldo(original, '', NOTA).texto).toBe(original)
  })

  it('no confunde prosa con normas', () => {
    const original = 'Con un ISO de referencia y la API del proveedor, el diámetro DN 150 basta.'
    expect(marcarNormasSinRespaldo(original, LEIDO, NOTA).texto).toBe(original)
  })
})
