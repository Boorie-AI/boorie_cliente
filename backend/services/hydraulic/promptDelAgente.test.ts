import { describe, it, expect } from 'vitest'
import { componerPromptDeSistema, DISCIPLINA, PAPEL } from './promptDelAgente'

describe('el prompt de sistema del agente', () => {
  it('lleva la disciplina aunque no haya nada guardado', () => {
    // Es el caso de una instalación recién hecha, donde la fila `system_prompt`
    // no existe: antes el mensaje se enviaba sin ningún sistema.
    const p = componerPromptDeSistema()
    expect(p).toContain(PAPEL)
    expect(p).toContain(DISCIPLINA)

    for (const vacio of [null, undefined, '', '   ']) {
      expect(componerPromptDeSistema(vacio), JSON.stringify(vacio)).toContain(DISCIPLINA)
    }
  })

  it('lo del usuario se añade y va al final, no sustituye', () => {
    const p = componerPromptDeSistema('Responde siempre en catalán y de forma breve.')
    expect(p).toContain(DISCIPLINA)
    expect(p).toContain('Responde siempre en catalán y de forma breve.')
    // Suyo es lo último que se lee, así que puede afinar el tono; lo que no
    // puede es quitar lo de arriba, porque no está escrito ahí.
    expect(p.indexOf('Responde siempre en catalán')).toBeGreaterThan(p.indexOf(DISCIPLINA))
  })

  it('un prompt propio sin contenido no deja rastro', () => {
    expect(componerPromptDeSistema('   ')).not.toContain('Indicaciones de quien usa Boorie')
  })
})

describe('con qué modelos funciona', () => {
  // Con un prompt propio que pedía decirlo siempre, qwen2.5 y qwen3 respondían «GPT-4» en Ollama.
  it('lleva los nombres reales del que redacta y del de embeddings', () => {
    const p = componerPromptDeSistema('Expresa siempre qué modelo de embeddings usas y cuál de IA.', {
      redaccion: { proveedor: 'Ollama', modelo: 'qwen2.5:7b' },
      embeddings: 'granite-embedding:278m',
    })

    expect(p).toContain('qwen2.5:7b')
    expect(p).toContain('Ollama')
    expect(p).toContain('granite-embedding:278m')
    expect(p).toContain('no digas que eres otro modelo')
    // Van antes de lo del usuario, que es quien pide decirlos.
    expect(p.indexOf('granite-embedding:278m')).toBeLessThan(p.indexOf('Expresa siempre'))
  })

  it('sin consulta a la base de conocimiento dice que no interviene ningún modelo de embeddings', () => {
    const p = componerPromptDeSistema(null, { redaccion: { proveedor: 'anthropic', modelo: 'claude-sonnet-5' }, embeddings: null })

    expect(p).toContain('claude-sonnet-5')
    expect(p).toContain('no se ha consultado la base de conocimiento')
  })

  it('si no se sabe con qué funciona, le dice que no lo sabe en vez de dejarle suponer', () => {
    expect(componerPromptDeSistema()).toContain('No sabes que modelo eres')
    expect(componerPromptDeSistema(null, {})).toContain('No sabes que modelo eres')
  })
})

describe('las reglas que no se negocian', () => {
  it('exigen unidad en toda cifra, también en los pasos', () => {
    // La familia de fallos que más ha reaparecido: l/s frente a m³/s en el
    // comparador (v1.25.0) y en energía (v1.27.0), y la fracción mostrada como
    // porcentaje (v1.26.0).
    expect(DISCIPLINA).toMatch(/lleva su unidad, siempre/)
    expect(DISCIPLINA).toMatch(/pasos intermedios/)
    expect(DISCIPLINA).toMatch(/No conviertas unidades por tu cuenta/)
    expect(DISCIPLINA).toMatch(/porcentaje se escribe como porcentaje/)
  })

  it('prohíben dar impacto sin simular y exigen decir de qué simulación sale', () => {
    expect(DISCIPLINA).toMatch(/No des cifras de impacto/)
    expect(DISCIPLINA).toMatch(/Proponer no es simular/)
    expect(DISCIPLINA).toMatch(/di de cual/)
  })

  it('mandan consultar la red en vez de responder de memoria', () => {
    // El #34 nació de responder cómo se limpia una junta mecánica a una
    // pregunta sobre el nudo J3 de la red que tenía delante.
    expect(DISCIPLINA).toMatch(/consultalo con las herramientas/)
    expect(DISCIPLINA).toMatch(/No te inventes identificadores/)
  })

  it('explican por qué un análisis se propone, para que la espera no parezca un fallo', () => {
    expect(DISCIPLINA).toMatch(/se proponen y los ejecuta el usuario/)
  })

  it('no fijan un idioma: el agente responde en el que le escriban', () => {
    // La aplicación va en tres idiomas; clavar uno aquí los rompería dos.
    expect(DISCIPLINA).toMatch(/en el idioma en el que te escriban/)
  })
})
