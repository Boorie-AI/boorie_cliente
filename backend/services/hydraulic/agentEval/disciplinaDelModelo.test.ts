import { afterAll, describe, it, expect } from 'vitest'
import { marcadorDeDisciplina, puntuarRespuesta } from './disciplina'
import { MODELO, cortarPeticiones, conversar, leerRedes, puedeMedirDisciplina } from './contraElModelo'
import { CASOS } from './casos'

/**
 * La fase 5 del #119: que el agente **obedezca** la disciplina de
 * `promptDelAgente.ts`, no sólo que elija bien la herramienta.
 *
 *     BOORIE_EVAL_MODELO=llama3.1:8b npx vitest run backend/services/hydraulic/agentEval/disciplinaDelModelo.test.ts
 *
 * Estaba anotado como «pide o un humano o un modelo juez». Dos de las tres
 * reglas que quedaban no lo piden —la unidad y la cita se leen del texto—, y la
 * tercera se resuelve sabiendo que en la batería ninguna herramienta simula:
 * cualquier cifra de servicio o de presión es, por construcción, una cifra sin
 * nada detrás. De ahí que el medidor sea determinista y viva en
 * `disciplina.ts`, con sus propias pruebas dentro de `npm test`.
 *
 * Lo que sí necesita modelo es esto: **tomar** la medida.
 *
 * Y sale caro. Cada caso son dos peticiones —la primera de ~2.900 tokens,
 * porque el catálogo de herramientas ya son 2.000; la segunda barata, porque
 * Ollama reutiliza el prefijo ya procesado— y en CPU eso es un minuto por
 * petición. Doce casos, media hora. Por eso está en su propio fichero y con su
 * propio tope: con las dos medidas juntas, ésta se comía el presupuesto y
 * moría por tiempo sin dar número.
 */
describe.skipIf(!puedeMedirDisciplina)(`la disciplina en lo que escribe (${MODELO ?? 'sin modelo'})`, () => {
  it('escribe las cifras con su unidad, sin impacto sin simular y sin citas que no resuelven',
    { timeout: 3_600_000 }, async () => {
    const redes = leerRedes([...new Set(CASOS.filter(c => !c.pendiente).map(c => c.red))])
    const resultados = []
    const textos: string[] = []

    for (const caso of CASOS.filter(c => !c.pendiente)) {
      const red = redes.get(caso.red)
      expect(red, `falta la red ${caso.red}`).toBeTruthy()

      const { texto, usadas } = await conversar(caso, red!, caso.red)
      // Sin fuentes: la batería no pasa por el RAG, así que cualquier marca
      // «(F1)» que aparezca no puede resolverse contra nada.
      const r = puntuarRespuesta(caso.id, texto, { fuentes: 0 })
      resultados.push(r)
      textos.push(`  · ${caso.id} [${usadas.join(', ') || 'sin herramientas'}] (${r.cifrasMiradas} cifras): ${texto.slice(0, 400)}`)
    }

    const m = marcadorDeDisciplina(resultados)
    console.log(`\nmodelo ${MODELO}: ${m.cumplen}/${m.total} respuestas sin faltas (${m.porcentaje} %)`)
    // Sin este número el porcentaje engaña: un pleno a base de disculpas no se
    // distingue de un pleno de verdad.
    console.log(`  con cifra que medir: ${m.conCifras}/${m.total}`)
    console.log(`  unidades: ${m.porRegla.unidades} · citas: ${m.porRegla.citas} · impacto: ${m.porRegla.impacto}`)
    for (const r of resultados.filter(r => r.fallos.length)) {
      console.log(`  · ${r.id}: ${r.fallos.map(f => f.detalle).join('; ')}`)
    }
    console.log(`\nlo que escribió:\n${textos.join('\n')}`)

    // No se exige el pleno, por lo mismo que en la otra mitad: el listón lo
    // pone el modelo que tenga delante quien use Boorie. Lo que se comprueba es
    // que la medida se puede tomar y que el agente escribe algo, que es lo que
    // dejaría de pasar si el prompt de sistema volviera a no llegar.
    expect(m.total).toBe(CASOS.filter(c => !c.pendiente).length)
    expect(resultados.every(r => r.id)).toBe(true)
  })
})

// Aunque la medida muera por tiempo: si no, Ollama sigue escribiendo para nadie.
afterAll(cortarPeticiones)
