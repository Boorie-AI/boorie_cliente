import { describe, it, expect, vi } from 'vitest'

// Cargado desde ESM, pdf-parse corre su prueba de depuración al importarse.
vi.mock('pdf-parse', () => ({ default: vi.fn() }))

import { leerArgumentos, proveedorDe, hechosSinFuenteEnElDocumento, repuntuar } from './ejecutor'
import { cerrarCaso, informeDeModelo, informeMarkdown, letra, type Repeticion } from './informe'
import { CASOS } from '@/../backend/services/hydraulic/ragEval/casos'
import { puntuarRespuesta } from '@/../backend/services/hydraulic/ragEval/bateria'
import { PAREJAS } from '@/../backend/services/hydraulic/agentic/modelosRAG'

describe('leerArgumentos', () => {
  it('lee modelos, repeticiones y casos; «nvidia» es el principal de la pareja', () => {
    const o = leerArgumentos(['--modelo', 'qwen2.5:7b,nvidia', '--repeticiones', '3', '--casos', 'a,b'], {})
    expect(o.modelos).toEqual(['qwen2.5:7b', PAREJAS.nvidia.principal])
    expect(o.repeticiones).toBe(3)
    expect(o.casos).toEqual(['a', 'b'])
  })

  it('el documento sale de la variable o del argumento, que manda', () => {
    expect(leerArgumentos([], { BOORIE_EVAL_DOC_WALTON: '/a.pdf' }).documentos).toEqual({ walton: '/a.pdf' })
    expect(leerArgumentos(['--documento', 'walton=/b=c.pdf'], { BOORIE_EVAL_DOC_WALTON: '/a.pdf' }).documentos).toEqual({ walton: '/b=c.pdf' })
  })

  it('una repetición como mínimo', () => {
    expect(leerArgumentos(['--modelo', 'x', '--repeticiones', '0'], {}).repeticiones).toBe(1)
  })
})

describe('proveedorDe', () => {
  it('los ids de NVIDIA llevan el editor delante', () => {
    expect(proveedorDe('nvidia/nemotron-3-ultra-550b-a55b')).toBe('nvidia')
    expect(proveedorDe('qwen2.5:7b')).toBe('Ollama')
  })
})

describe('hechosSinFuenteEnElDocumento', () => {
  it('no cuenta los hechos que la referencia pide y el documento no trae', () => {
    const luis = CASOS.find(c => c.id === 'luis-prueba-caudal-variable')!
    const sinFuente = hechosSinFuenteEnElDocumento(luis, '')
    expect(sinFuente).not.toContain('s-bq-cq2')
    expect(sinFuente).toContain('sw-cq2')
  })
})

describe('informe', () => {
  const caso = CASOS.find(c => c.id === 'walton-ejemplo-4-1')!
  const rep = (n: number, respuesta: string): Repeticion => ({
    n,
    estado: 'respondida',
    respuesta,
    puntuacion: puntuarRespuesta(caso, respuesta, 'average calculated value of well loss coefficient is 2.0'),
    tiempos: { componerMs: 1000, modeloMs: 9000, totalMs: 10000 },
    tokens: { entrada: 5000, salida: 300, estimadosDelPrompt: 5100 },
    adjunto: { nombre: 'walton.pdf', incluidos: 20, total: 621, completo: false, porSignificado: true },
  })

  it('separa lo no ejecutado de lo ejecutado y lo dice en el resumen', () => {
    const casos = [
      cerrarCaso(caso.id, [rep(1, 'C = 2,0 s²/ft⁵'), rep(2, 'No lo sé')]),
      { id: 'walton-tabla-2-1', estado: 'no-ejecutado' as const, motivo: 'falta NVIDIA_API_KEY en el entorno', repeticiones: [] },
    ]
    const i = informeDeModelo('qwen2.5:7b', 'Ollama', 2, casos, '2026-10-03T00:00:00Z')
    expect(i.marcador).toMatchObject({ casos: 2, ejecutados: 1, noEjecutados: 1 })
    expect(i.tiempoMedioMs).toBe(10000)
    const md = informeMarkdown([i], CASOS)
    expect(md).toContain('| qwen2.5:7b | Ollama | 2 | 1/2 | 1 |')
    expect(md).toContain('no ejecutado: falta NVIDIA_API_KEY en el entorno')
    expect(md).toContain('| C medio = 2,0 s²/ft⁵ | A | D |')
    expect(md).toContain('20/621 fragmentos, por significado')
  })

  it('un caso en el que todas las repeticiones fallan es un error, no un fallo puntuado', () => {
    const c = cerrarCaso('x', [{ n: 1, estado: 'error', error: 'Ollama respondió 500', tiempos: { componerMs: 0, modeloMs: 0, totalMs: 0 }, tokens: { estimadosDelPrompt: 0 } }])
    expect(c.estado).toBe('error')
    expect(c.estabilidad).toBeUndefined()
  })

  it('se vuelve a puntuar con los casos de ahora sin volver a preguntar', () => {
    const r = { ...rep(1, 'C = 2,0 s²/ft⁵'), leido: 'average calculated value of well loss coefficient is 2.0' }
    const viejo = informeDeModelo('qwen2.5:7b', 'Ollama', 1, [cerrarCaso(caso.id, [{ ...r, puntuacion: undefined }])])
    const [nuevo] = repuntuar([viejo])
    expect(nuevo.casos[0].repeticiones[0].puntuacion?.hechos.find(h => h.id === 'c-2-0')?.estado).toBe('acierta')
    expect(nuevo.casos[0].estado).toBe('ejecutado')
  })

  it('las letras de la tabla de hechos', () => {
    expect(letra({ id: 'a', estado: 'acierta' })).toBe('A')
    expect(letra({ id: 'a', estado: 'acierta', sinRespaldo: true })).toBe('A*')
    expect(letra({ id: 'a', estado: 'falla-recuperacion' })).toBe('R')
    expect(letra({ id: 'a', estado: 'falla-redaccion' })).toBe('D')
  })
})
