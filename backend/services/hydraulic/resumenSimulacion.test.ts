import { describe, it, expect } from 'vitest'
import {
  detectarAnomalias,
  documentosDeSimulacion,
  UMBRALES_RURALES,
  UMBRALES_URBANOS,
  type EjecucionIndexable,
  type ResultadosWNTR,
} from './resumenSimulacion'

/** Una hora entre pasos, cuatro pasos: el reloj con el que se leen las duraciones. */
const HORA = 3600

function resultados(parcial: Partial<ResultadosWNTR> = {}): ResultadosWNTR {
  return {
    status: 'Completed',
    execution_time: 1.5,
    timestamps: [0, HORA, 2 * HORA, 3 * HORA],
    node_results: {
      'J-1': { pressure: [40, 42, 41, 39], demand: [0.01, 0.01, 0.01, 0.01] },
      'J-2': { pressure: [30, 25, 12, 28], demand: [0.02, 0.02, 0.02, 0.02] },
    },
    link_results: {
      'P-1': { flowrate: [0.03, 0.03, 0.03, 0.03], velocity: [1.2, 1.3, 1.2, 1.1] },
      'P-2': { flowrate: [0.05, 0.06, 0.07, 0.05], velocity: [2.9, 3.4, 4.1, 2.8] },
    },
    stats: {
      pressure: { min: 12, max: 42, mean: 32 },
      velocity: { min: 1.1, max: 4.1, mean: 2.1 },
      flow: { min: 0.03, max: 0.07, mean: 0.045 },
    },
    summary: { nodes: 2, links: 2, duration: 4 * HORA, hydraulic_timestep: HORA, report_timestep: HORA },
    ...parcial,
  }
}

function ejecucion(parcial: Partial<EjecucionIndexable> = {}): EjecucionIndexable {
  return {
    simulationRunId: 'run-1',
    networkVersionId: 'ver-1',
    versionNumber: 3,
    nombreRed: 'Red Norte',
    tipo: 'Simulación Hidráulica',
    fecha: new Date('2026-08-20T10:30:00Z'),
    resultados: resultados(),
    ...parcial,
  }
}

describe('detección de anomalías', () => {
  it('encuentra el peor valor de toda la serie, no el del primer paso', () => {
    // J-2 arranca a 30 m, dentro de norma, y sólo cae a 12 m en el tercer paso.
    // Mirar únicamente el paso cero habría dado una red impecable.
    const anomalias = detectarAnomalias(resultados(), UMBRALES_URBANOS)
    const j2 = anomalias.find(a => a.elemento === 'J-2')

    expect(j2).toBeDefined()
    expect(j2!.clase).toBe('presion_baja')
    expect(j2!.valor).toBe(12)
    expect(j2!.paso).toBe(2)
  })

  it('cuenta cuántos pasos incumplen y los traduce a horas', () => {
    const p2 = detectarAnomalias(resultados(), UMBRALES_URBANOS).find(a => a.elemento === 'P-2')

    expect(p2!.clase).toBe('velocidad_alta')
    expect(p2!.pasosIncumpliendo).toBe(2)
    expect(p2!.horas).toBe(2)
  })

  it('no denuncia lo que está dentro de umbral', () => {
    const anomalias = detectarAnomalias(resultados(), UMBRALES_URBANOS)
    expect(anomalias.map(a => a.elemento)).not.toContain('J-1')
    expect(anomalias.map(a => a.elemento)).not.toContain('P-1')
  })

  it('los umbrales rurales admiten presiones que los urbanos rechazan', () => {
    // 12 m es déficit en ciudad (mínimo 14) y aceptable en acueducto rural
    // (mínimo 7). Es el motivo de que los umbrales sean configurables.
    const urbanas = detectarAnomalias(resultados(), UMBRALES_URBANOS)
    const rurales = detectarAnomalias(resultados(), UMBRALES_RURALES)

    expect(urbanas.some(a => a.elemento === 'J-2' && a.clase === 'presion_baja')).toBe(true)
    expect(rurales.some(a => a.elemento === 'J-2' && a.clase === 'presion_baja')).toBe(false)
  })

  it('ordena por gravedad, no por orden de aparición', () => {
    const anomalias = detectarAnomalias(resultados(), UMBRALES_URBANOS)
    // J-2 se aparta 2 m del umbral de presión; P-2 se aparta 1,1 m/s del de
    // velocidad. La lista empieza por lo más grave para que el recorte de los
    // veinte primeros no deje fuera lo importante.
    expect(anomalias[0].elemento).toBe('J-2')
  })

  it('no juzga la presión de embalses ni depósitos', () => {
    // Salió al correr Net3: «River» y «Lake» encabezaban la lista de problemas
    // de la red. Su presión es cero por definición —su carga es el nivel de
    // agua—, así que denunciarlos tapa las anomalías que sí lo son.
    const res = resultados({
      node_results: {
        'J-2': { pressure: [30, 25, 12, 28] },
        Lake: { pressure: [0, 0, 0, 0] },
        River: { pressure: [0, 0, 0, 0] },
      },
    })

    const nudos = (as: ReturnType<typeof detectarAnomalias>) =>
      as.filter(a => a.lado === 'nudo').map(a => a.elemento).sort()

    // El filtro es de nudos: los tramos se siguen juzgando por velocidad.
    const conTopologia = detectarAnomalias(res, UMBRALES_URBANOS, ['J-2'])
    expect(nudos(conTopologia)).toEqual(['J-2'])
    expect(conTopologia.some(a => a.elemento === 'P-2')).toBe(true)

    // Sin saber qué es cada nudo se juzgan todos: callar anomalías reales sería
    // peor que dar de más.
    expect(nudos(detectarAnomalias(res, UMBRALES_URBANOS))).toEqual(['J-2', 'Lake', 'River'])
  })

  it('sobrevive a resultados vacíos o con huecos', () => {
    expect(detectarAnomalias({}, UMBRALES_URBANOS)).toEqual([])
    expect(detectarAnomalias({ node_results: { 'J-1': {} } }, UMBRALES_URBANOS)).toEqual([])
    expect(
      detectarAnomalias({ node_results: { 'J-1': { pressure: [NaN, null as any, 5] } } }, UMBRALES_URBANOS)
    ).toHaveLength(1)
  })
})

describe('documentos indexables', () => {
  it('genera los tres documentos base sin ejecución previa', () => {
    const clases = documentosDeSimulacion(ejecucion()).map(d => d.clase)
    expect(clases).toEqual(['ejecutivo', 'estadistico', 'anomalias'])
  })

  it('todos llevan la cita: red, versión e identificador de la ejecución', () => {
    // Un fragmento recuperado sin esto es un dato huérfano que el agente puede
    // acabar atribuyendo a otra red.
    for (const doc of documentosDeSimulacion(ejecucion())) {
      expect(doc.contenido).toContain('Red Norte')
      expect(doc.contenido).toContain('versión 3')
      expect(doc.contenido).toContain('run-1')
    }
  })

  it('el documento de anomalías nombra los elementos y su duración', () => {
    const doc = documentosDeSimulacion(ejecucion()).find(d => d.clase === 'anomalias')!

    expect(doc.contenido).toContain('J-2')
    expect(doc.contenido).toContain('P-2')
    expect(doc.contenido).toContain('2.0 h')
  })

  it('dice explícitamente que no hay problemas cuando no los hay', () => {
    // El silencio no se recupera: sin una frase que lo diga, preguntar «¿hubo
    // problemas?» no encontraría nada y el agente lo interpretaría como que no
    // se indexó, no como que la red está bien.
    const limpia = ejecucion({
      resultados: resultados({
        node_results: { 'J-1': { pressure: [40, 41] } },
        link_results: { 'P-1': { velocity: [1.2, 1.1] } },
      }),
    })
    const doc = documentosDeSimulacion(limpia).find(d => d.clase === 'anomalias')!

    expect(doc.contenido).toContain('Ninguna')
  })

  it('añade la comparación sólo si hay ejecución anterior', () => {
    const conPrevia = ejecucion({
      previa: {
        simulationRunId: 'run-0',
        fecha: new Date('2026-08-19T10:00:00Z'),
        versionNumber: 2,
        resultados: resultados({
          node_results: {
            'J-1': { pressure: [40, 42, 41, 39] },
            'J-2': { pressure: [30, 30, 30, 30] },
          },
        }),
      },
    })
    const doc = documentosDeSimulacion(conPrevia).find(d => d.clase === 'comparacion')

    expect(doc).toBeDefined()
    expect(doc!.contenido).toContain('run-0')
    expect(doc!.contenido).toContain('J-2')
  })

  it('el crudo sólo se indexa si el proyecto lo pide', () => {
    expect(documentosDeSimulacion(ejecucion()).some(d => d.clase === 'crudo')).toBe(false)

    const crudo = documentosDeSimulacion(ejecucion({ incluirCrudos: true })).find(d => d.clase === 'crudo')!
    expect(crudo.contenido).toContain('"J-1"')
  })
})
