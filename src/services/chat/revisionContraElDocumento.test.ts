import { describe, it, expect } from 'vitest'
import { promptDeRevision, problemasComprobados, apartadoDeRevision } from './revisionContraElDocumento'

/** Trozos reales del libro de Walton tal como los deja pdf-parse, con su página. */
const LEIDO = `[p. 14]
A typical pumping test schedule for an artesian aquifer system is as follows: Day 1. water level measurements to establish antecedent trend Day 2. 1-hour trial test to adjust equipment followed by a 1-hour recovery period; 3-hour step-drawdown test to determine production well well loss coefficient followed by a 20-hour recovery period
[p. 78]
Values of C for pumping test production wells are gener-
ally less than 10 sec 2 /ft 5 and are often about 2.0 sec 2 /ft 5 .`

const RESPUESTA = `## 4. Precauciones
| 8 | **Recuperación completa entre escalones** (≥ 3 h o 95 % recuperación) | Evita superposición de conos |
## 6.2 Determinación de C
C₁,₂ = (s₂/Q₂ − s₁/Q₁)/(Q₁ + Q₂)`

const salida = (problemas: unknown[]) => JSON.stringify({ problemas })

describe('lo que señala el revisor y se puede comprobar', () => {
  it('pasa lo que trae la frase del documento, aunque pdf-parse la partiera', () => {
    const r = problemasComprobados(salida([
      { tipo: 'contradice', cita: 'Recuperación completa entre escalones', evidencia: '3-hour step-drawdown test to determine production well well loss coefficient followed by a 20-hour recovery period', pagina: 'p. 14', correccion: 'Los escalones van seguidos y la recuperación, de 20 h, va después.' },
      { tipo: 'omite', cita: '', evidencia: 'Values of C for pumping test production wells are generally less than 10 sec2/ft5', pagina: '78', correccion: 'C suele ser menor que 10 sec²/ft⁵ y a menudo unos 2,0.' },
    ]), LEIDO, RESPUESTA)
    expect(r.map(p => p.tipo)).toEqual(['contradice', 'omite'])
  })

  it('se descarta lo que cita una frase que no está en lo leído: es como se colaba la Tabla 2.2 mal leída', () => {
    const r = problemasComprobados(salida([
      { tipo: 'contradice', cita: 'Recuperación completa entre escalones', evidencia: 'For 300 gpm the optimum diameter is 10 in.', pagina: '20', correccion: 'Diez pulgadas.' },
    ]), LEIDO, RESPUESTA)
    expect(r).toEqual([])
  })

  it('se descarta una contradicción de algo que la respuesta no dice', () => {
    const r = problemasComprobados(salida([
      { tipo: 'contradice', cita: 'La prueba de escalones de 3 h total (1 h c/u) + recuperación', evidencia: 'followed by a 20-hour recovery period', pagina: '14', correccion: 'x' },
    ]), LEIDO, RESPUESTA)
    expect(r).toEqual([])
  })

  it('no se revisan las marcas que pone Boorie', () => {
    const conMarca = `${RESPUESTA}\n| Almacenamiento | Eq. 1.1 [no está en lo leído], p. 3 |`
    const r = problemasComprobados(salida([
      { tipo: 'contradice', cita: 'Eq. 1.1 [no está en lo leído], p. 3', evidencia: 'Values of C for pumping test production wells are generally less', pagina: '23', correccion: 'Sí está.' },
    ]), LEIDO, conMarca, '[no está en lo leído]')
    expect(r).toEqual([])
  })

  it('no falta lo que la respuesta ya dice, literal o con sus cifras en una línea', () => {
    const leido = `${LEIDO}\nAnalysis accuracies of 15% for hydraulic conductivity and 30% for storativity are commonly acceptable.`
    const respuesta = `${RESPUESTA}\n7. Reportar parámetros con incertidumbre (±15 % en K, ±30 % en S; p. 6).`
    const r = problemasComprobados(salida([
      { tipo: 'omite', cita: '', evidencia: 'Analysis accuracies of 15% for hydraulic conductivity and 30% for storativity are commonly acceptable.', pagina: '6', correccion: 'x' },
      { tipo: 'omite', cita: '', evidencia: 'Values of C for pumping test production wells are generally less than 10 sec 2 /ft 5 and are often about 2.0 sec 2 /ft 5', pagina: '78', correccion: 'C suele ser menor que 10.' },
    ]), leido, respuesta)
    expect(r.map(p => p.pagina)).toEqual(['78'])
  })

  it('basta con que la respuesta cite un trozo de la frase', () => {
    const leido = `${LEIDO}\nThe production well should be equipped with reliable power, pump, and discharge-control equipment.`
    const respuesta = `${RESPUESTA}\n| Bomba con VFD | “reliable power, pump, and discharge‑control equipment” (p. 9) |`
    const r = problemasComprobados(salida([
      { tipo: 'omite', cita: '', evidencia: 'The production well should be equipped with reliable power, pump, and discharge-control equipment.', pagina: '9', correccion: 'x' },
    ]), leido, respuesta)
    expect(r).toEqual([])
  })

  it('no es omisión que la respuesta lo diga con otras palabras, y el revisor lo confiesa', () => {
    const leido = `${LEIDO}\nThe wellhead and discharge lines should be accessible for installing, regulating, and monitoring equipment.`
    const r = problemasComprobados(salida([
      { tipo: 'omite', cita: '', evidencia: 'The wellhead and discharge lines should be accessible for installing, regulating, and monitoring equipment.', pagina: '9', correccion: 'El documento exige que la boca de pozo sea accesible; la respuesta no lo incluye como criterio textual.' },
      { tipo: 'omite', cita: '', evidencia: 'Values of C for pumping test production wells are generally less than 10 sec 2 /ft 5 and are often about 2.0 sec 2 /ft 5', pagina: '78', correccion: 'C suele ser menor que 10 sec²/ft⁵, dato que la respuesta no menciona.' },
    ]), leido, RESPUESTA)
    expect(r.map(p => p.pagina)).toEqual(['78'])
  })

  it('una omisión sin cifras no pasa: es donde el revisor confunde paráfrasis con omisión', () => {
    const leido = `${LEIDO}\nIt should be possible to measure water levels in the production well before, during, and after pumping.`
    const r = problemasComprobados(salida([
      { tipo: 'omite', cita: '', evidencia: 'It should be possible to measure water levels in the production well before, during, and after pumping.', pagina: '9', correccion: 'La respuesta no lo destaca como criterio de evaluación del sitio.' },
    ]), leido, RESPUESTA)
    expect(r).toEqual([])
  })

  it('el prompt deja claro que parafrasear no es omitir', () => {
    expect(promptDeRevision('p', LEIDO, RESPUESTA)).toContain('con otras palabras o en otro idioma, NO es una omisión')
  })

  it('una evidencia de dos palabras no demuestra nada', () => {
    const r = problemasComprobados(salida([{ tipo: 'omite', cita: '', evidencia: 'Day 1', pagina: '14', correccion: 'x' }]), LEIDO, RESPUESTA)
    expect(r).toEqual([])
  })

  it('lo que no es JSON, o viene con texto alrededor, no rompe nada', () => {
    expect(problemasComprobados('Here is a thinking process:', LEIDO, RESPUESTA)).toEqual([])
    expect(problemasComprobados('Claro: {"problemas":[]} espero que sirva', LEIDO, RESPUESTA)).toEqual([])
    expect(problemasComprobados('{"problemas": [{"tipo": "omite"}]}]}', LEIDO, RESPUESTA)).toEqual([])
  })
})

describe('lo que se añade a la respuesta', () => {
  const T = { titulo: 'Revisión contra el documento', contradice: 'El documento dice otra cosa sobre', omite: 'Falta:', pagina: (p: string) => `(p. ${p})` }

  it('cada problema con la frase del documento, para comprobarlo', () => {
    const apartado = apartadoDeRevision([
      { tipo: 'omite', cita: '', evidencia: 'Values of C ... are often about 2.0 sec 2 /ft 5', pagina: 'p. 78', correccion: 'C suele ser menor que 10.' },
    ], T)
    expect(apartado).toContain('### Revisión contra el documento')
    expect(apartado).toContain('- **Falta:** C suele ser menor que 10. (p. 78)')
    expect(apartado).toContain('  > Values of C ... are often about 2.0 sec 2 /ft 5')
  })

  it('sin problemas no se añade nada', () => {
    expect(apartadoDeRevision([], T)).toBe('')
  })

  it('el prompt lleva la pregunta, lo leído y la respuesta', () => {
    const p = promptDeRevision('¿Cómo planifico la prueba?', LEIDO, RESPUESTA)
    expect(p).toContain('=== FRAGMENTOS ===\n[p. 14]')
    expect(p).toContain('copiada LITERALMENTE')
    expect(p).toContain('Recuperación completa entre escalones')
  })
})
