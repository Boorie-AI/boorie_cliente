import { describe, it, expect, vi } from 'vitest'
import { componerPeticion, posprocesarRespuesta, promptConFuentes, type DependenciasDePeticion } from './rutaDelChat'
import { cierreDeIdioma, contextoDeConocimiento } from '@/services/contextoConocimiento'

const deps = (): DependenciasDePeticion & { [k: string]: any } => ({
  contextoDeOllama: vi.fn(async () => 4096),
  similitudes: vi.fn(async () => undefined),
  consultasEnElIdioma: vi.fn(async () => []),
})

const base = {
  pregunta: '¿Qué dice la tabla 2.1?',
  idioma: 'es' as const,
  modelo: 'qwen2.5:7b',
  proveedor: 'Ollama',
  fuentes: [] as any[],
  bloqueConocimiento: '',
  busquedaFallida: false,
}

const libro = (parrafos: number) =>
  Array.from({ length: parrafos }, (_, i) => `Párrafo ${i}: the step drawdown test measures well loss in the production well.`).join('\n')

describe('promptConFuentes', () => {
  it('pone el prompt propio, el bloque de las fuentes y la pregunta, y devuelve el bloque aparte', () => {
    const fuentes = [{ title: 'Walton', content: 'Table 2.1', page: 14 }]
    const r = promptConFuentes('¿Pregunta?', fuentes, 'es', { busquedaFallida: false, promptPropio: 'Sé breve.' })
    const bloque = contextoDeConocimiento(fuentes, 'es', { busquedaFallida: false })
    expect(r.bloqueConocimiento).toBe(bloque)
    expect(r.prompt).toBe(`Sé breve.\n\n${bloque}¿Pregunta?`)
  })

  it('sin prompt propio no deja líneas en blanco delante', () => {
    const r = promptConFuentes('¿P?', [], 'es', { busquedaFallida: false, promptPropio: null })
    expect(r.prompt.startsWith('\n')).toBe(false)
    expect(r.prompt.endsWith('¿P?')).toBe(true)
  })
})

describe('componerPeticion', () => {
  it('sin adjunto: el prompt con el cierre de idioma, detrás del historial, y sin llamar a nada', async () => {
    const d = deps()
    const conversacion = [
      { role: 'user' as const, content: 'Hola' },
      { role: 'assistant' as const, content: 'Hola, ¿en qué te ayudo?' },
      { role: 'user' as const, content: base.pregunta },
    ]
    const p = await componerPeticion({ ...base, conversacion, prompt: base.pregunta }, d)
    expect(p.prompt).toBe(base.pregunta + cierreDeIdioma('es', false))
    // La pregunta va una sola vez, dentro del prompt (#249).
    expect(p.mensajes).toEqual([
      { role: 'user', content: 'Hola' },
      { role: 'assistant', content: 'Hola, ¿en qué te ayudo?' },
      { role: 'user', content: p.prompt },
    ])
    expect(p.historial.map(m => m.content)).toEqual(['Hola', 'Hola, ¿en qué te ayudo?'])
    expect(p.adjunto).toBeUndefined()
    expect(p.leidoDelAdjunto).toBe('')
    expect(d.contextoDeOllama).not.toHaveBeenCalled()
  })

  it('un adjunto que cabe va entero, sin buscar por significado', async () => {
    const d = deps()
    const adjunto = { nombre: 'nota.txt', texto: 'Table 2.1. Time Intervals for Observation Well Measurements' }
    const p = await componerPeticion({
      ...base, prompt: base.pregunta,
      conversacion: [{ role: 'user', content: base.pregunta, metadata: { adjunto } }],
    }, d)
    expect(p.adjunto).toBe(adjunto)
    expect(p.mensajes).toEqual([{ role: 'user', content: p.prompt }])
    expect(p.adjuntoUsado).toMatchObject({ nombre: 'nota.txt', completo: true })
    expect(p.leidoDelAdjunto).toContain('Table 2.1')
    expect(p.prompt).toContain('nota.txt')
    expect(p.prompt.indexOf('Table 2.1')).toBeLessThan(p.prompt.indexOf(base.pregunta))
    expect(d.contextoDeOllama).toHaveBeenCalledWith('qwen2.5:7b')
    expect(d.similitudes).not.toHaveBeenCalled()
  })

  it('el adjunto vigente es el último de la conversación, aunque esta pregunta no traiga ninguno', async () => {
    const adjunto = { nombre: 'walton.pdf', texto: 'well loss coefficient' }
    const p = await componerPeticion({
      ...base, prompt: base.pregunta,
      conversacion: [
        { role: 'user', content: 'primera', metadata: { adjunto } },
        { role: 'assistant', content: 'respuesta' },
        { role: 'user', content: base.pregunta },
      ],
    }, deps())
    expect(p.adjunto).toBe(adjunto)
  })

  it('con Ollama y un documento que no cabe, pide significado y consultas en el idioma del documento', async () => {
    const d = deps()
    d.consultasEnElIdioma = vi.fn(async () => ['step drawdown test'])
    const adjunto = { nombre: 'walton.pdf', texto: libro(800) }
    const p = await componerPeticion({
      ...base, modelo: 'ollama-qwen2.5:7b', prompt: base.pregunta,
      conversacion: [{ role: 'user', content: base.pregunta, metadata: { adjunto } }],
    }, d)
    expect(d.contextoDeOllama).toHaveBeenCalledWith('qwen2.5:7b')
    expect(d.consultasEnElIdioma).toHaveBeenCalledWith(expect.objectContaining({ modelo: 'qwen2.5:7b', numCtx: 4096, idiomaDeLaApp: 'es' }))
    // Una vez por la pregunta y otra por la consulta.
    expect(d.similitudes).toHaveBeenCalledTimes(2)
    expect(p.adjuntoUsado?.completo).toBe(false)
    expect(p.leidoDelAdjunto.length).toBeLessThan(adjunto.texto.length)
  })

  it('en la nube usa el contexto de la nube y no pide consultas al modelo local', async () => {
    const d = deps()
    const adjunto = { nombre: 'walton.pdf', texto: libro(8000) }
    await componerPeticion({
      ...base, proveedor: 'Nvidia', modelo: 'nvidia/nemotron', prompt: base.pregunta,
      conversacion: [{ role: 'user', content: base.pregunta, metadata: { adjunto } }],
    }, d)
    expect(d.contextoDeOllama).not.toHaveBeenCalled()
    expect(d.consultasEnElIdioma).not.toHaveBeenCalled()
    expect(d.similitudes).toHaveBeenCalledTimes(1)
  })

  it('en la nube, la ventana que dio la API manda sobre la tabla', async () => {
    const adjunto = { nombre: 'walton.pdf', texto: libro(8000) }
    const entrada = {
      ...base, proveedor: 'openrouter', modelo: 'openai/gpt-4o', prompt: base.pregunta,
      conversacion: [{ role: 'user' as const, content: base.pregunta, metadata: { adjunto } }],
    }
    const conLaTabla = await componerPeticion(entrada, deps())
    const d = { ...deps(), limitesDeLaApi: vi.fn(async () => ({ contexto: 8192, salida: 2048 })) }
    const conLaApi = await componerPeticion(entrada, d)
    expect(d.limitesDeLaApi).toHaveBeenCalledWith('openrouter', 'openai/gpt-4o')
    expect(conLaApi.adjuntoUsado!.incluidos).toBeLessThan(conLaTabla.adjuntoUsado!.incluidos)
  })

  it('las fuentes del RAG que no caben junto al adjunto se quitan del prompt y se cuentan', async () => {
    const fuentes = Array.from({ length: 6 }, (_, i) => ({ title: `Doc ${i}`, content: libro(40), page: i + 1 }))
    const { prompt, bloqueConocimiento } = promptConFuentes(base.pregunta, fuentes, 'es', { busquedaFallida: false })
    const adjunto = { nombre: 'walton.pdf', texto: libro(60) }
    const p = await componerPeticion({
      ...base, prompt, fuentes, bloqueConocimiento,
      conversacion: [{ role: 'user', content: base.pregunta, metadata: { adjunto } }],
    }, deps())
    expect(p.fuentes.length).toBeLessThan(fuentes.length)
    expect(p.adjuntoUsado?.fuentesOmitidas).toBe(fuentes.length - p.fuentes.length)
    expect(p.prompt).not.toContain(bloqueConocimiento)
  })

  describe('sin adjunto, las fuentes caben en la ventana del modelo (#223)', () => {
    // 20 fragmentos de ~1000 caracteres, como un searchTopK alto.
    const veinte = Array.from({ length: 20 }, (_, i) => ({ title: `Norma ${i}`, content: libro(9), page: i + 1 }))
    const conFuentes = () => {
      const { prompt, bloqueConocimiento } = promptConFuentes(base.pregunta, veinte, 'es', { busquedaFallida: false })
      return { ...base, prompt, fuentes: veinte, bloqueConocimiento, conversacion: [{ role: 'user' as const, content: base.pregunta }] }
    }

    it('con un modelo pequeño de Ollama se quitan las que no caben y se cuentan', async () => {
      const d = deps()
      d.contextoDeOllama = vi.fn(async () => 4096)
      const p = await componerPeticion({ ...conFuentes(), modelo: 'nemotron-mini' }, d)
      expect(d.contextoDeOllama).toHaveBeenCalledWith('nemotron-mini')
      expect(p.fuentes.length).toBeGreaterThan(0)
      expect(p.fuentes.length).toBeLessThan(veinte.length)
      expect(p.fuentesOmitidasPorContexto).toBe(veinte.length - p.fuentes.length)
      expect(p.adjuntoUsado).toBeUndefined()
      // Lo que va al modelo cabe en su ventana.
      expect(Math.ceil(p.prompt.length / 4)).toBeLessThan(4096)
      expect(p.prompt).toContain(base.pregunta)
    })

    it('en la nube, con 48k de contexto útil, entran todas', async () => {
      const d = deps()
      const p = await componerPeticion({ ...conFuentes(), proveedor: 'nvidia', modelo: 'nvidia/nemotron-3-ultra-550b-a55b' }, d)
      expect(p.fuentes).toHaveLength(veinte.length)
      expect(p.fuentesOmitidasPorContexto).toBeUndefined()
      expect(d.contextoDeOllama).not.toHaveBeenCalled()
    })

    it('sin fuentes no se calcula nada ni se pregunta a nadie', async () => {
      const d = deps()
      const p = await componerPeticion({ ...base, prompt: base.pregunta, conversacion: [{ role: 'user', content: base.pregunta }] }, d)
      expect(p.fuentesOmitidasPorContexto).toBeUndefined()
      expect(d.contextoDeOllama).not.toHaveBeenCalled()
    })
  })
})

const textos = {
  noEstaEnLoLeido: 'no está en lo leído',
  cortadaPorInactividad: 'Respuesta incompleta',
  revision: { titulo: 'Revisión', contradice: 'Contradice', omite: 'Omite', pagina: (p: string) => `p. ${p}` },
}

const posproceso = {
  pregunta: '¿Qué intervalo a los 3 minutos?',
  fuentes: [] as any[],
  paginasDelAdjunto: [{ page: 14 }],
  leidoDelAdjunto: 'Table 2.1 Time Intervals 2-5 minutes 30 seconds',
  idioma: 'es' as const,
  hayAdjunto: true,
  conRevision: false,
  textos,
}

describe('posprocesarRespuesta', () => {
  it('quita las páginas que no respalda lo leído y deja las que sí', async () => {
    const r = await posprocesarRespuesta({
      ...posproceso,
      escrita: 'Cada 30 segundos (p. 14). También lo dice la p. 203.',
    }, { pedirRevision: vi.fn() })
    expect(r.texto).toContain('p. 14')
    expect(r.texto).not.toContain('203')
    expect(r.quitadas.length).toBe(1)
  })

  it('con un modelo local no pide revisión', async () => {
    const pedirRevision = vi.fn()
    const r = await posprocesarRespuesta({ ...posproceso, escrita: 'Cada 30 segundos.' }, { pedirRevision })
    expect(pedirRevision).not.toHaveBeenCalled()
    expect(r.revision).toBeUndefined()
  })

  it('en la nube revisa contra lo leído y añade el apartado', async () => {
    const alEmpezarLaRevision = vi.fn()
    const pedirRevision = vi.fn(async (_prompt: string) => ({ success: true, response: '[]' }))
    const r = await posprocesarRespuesta(
      { ...posproceso, conRevision: true, escrita: 'Cada 30 segundos.' },
      { pedirRevision, alEmpezarLaRevision }
    )
    expect(alEmpezarLaRevision).toHaveBeenCalled()
    expect(pedirRevision.mock.calls[0][0]).toContain('Table 2.1')
    expect(r.revision).toEqual({ problemas: 0 })
  })

  it('devuelve aparte el texto sin el apartado de la revisión', async () => {
    const pedirRevision = async () => ({
      success: true,
      response: JSON.stringify([{ tipo: 'omite', sobre: 'intervalo', documento: 'Table 2.1 Time Intervals 2-5 minutes 30 seconds' }]),
    })
    const r = await posprocesarRespuesta({ ...posproceso, conRevision: true, escrita: 'Cada minuto.' }, { pedirRevision })
    expect(r.sinRevision).toBe('Cada minuto.')
    expect(r.texto.startsWith(r.sinRevision)).toBe(true)
  })

  it('si la revisión falla, la respuesta sale igual', async () => {
    const r = await posprocesarRespuesta(
      { ...posproceso, conRevision: true, escrita: 'Cada 30 segundos.' },
      { pedirRevision: async () => { throw new Error('red') } }
    )
    expect(r.texto).toContain('Cada 30 segundos.')
    expect(r.revision).toBeUndefined()
  })

  it.each(['inactividad', 'error_en_el_flujo'])('una respuesta cortada (%s) lo dice y no se revisa', async finishReason => {
    const pedirRevision = vi.fn()
    const r = await posprocesarRespuesta(
      { ...posproceso, conRevision: true, finishReason, escrita: 'Cada 30' },
      { pedirRevision }
    )
    expect(r.cortada).toBe(true)
    expect(r.texto).toContain('Respuesta incompleta')
    expect(pedirRevision).not.toHaveBeenCalled()
  })
})
