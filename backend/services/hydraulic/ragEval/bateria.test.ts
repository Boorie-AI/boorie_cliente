import { describe, it, expect } from 'vitest'
import { cifrasDelTexto, cumple, estabilidad, marcador, normalizar, puntuarRespuesta, type CasoRAG } from './bateria'
import { CASOS, DOCUMENTOS } from './casos'

const caso = (id: string) => CASOS.find(c => c.id === id)!

// La tabla 2.1 tal como llega en el texto del PDF: los tramos y los intervalos en dos columnas.
const TABLA_2_1 = `14 GROUNDWATER PUMPING TESTS
Table 2.1. Time Intervals for Observation Well Measurements
Time After
Pumping Started
1-2  minutes
2-5  minutes
5-15  minutes
15-50  minutes
50-100  minutes
100 -  500 minutes
500 -  1000 minutes
1000 -  5000 minutes
5000 -  end
Time
Intervals
10 seconds
30 seconds
1 minute
5 minutes
10 minutes
30 minutes
1 hour
4 hours
1 day`

// Lo que respondió qwen2.5:7b en la primera corrida (3 oct 2026): la tabla bien,
// con la unidad del tramo en la cabecera.
const RESPUESTA_QWEN = `De acuerdo con el libro, los intervalos se muestran en la Tabla 2.1:

|Tiempo después de que comienza el bombeo (minutos)| Intervalos de tiempo (min)|
|---|---|
|1-2|10 segundos|
|2-5|30 segundos|
|5-15|1 minuto|
|15-50|5 minutos|
|50-100|10 minutos|
|100 - 500|30 minutos|
|500 - 1000|1 hora|
|1000 - 5000|4 horas|
|5000 - fin de la prueba|1 día|`

describe('cifrasDelTexto', () => {
  it('lee la coma y el punto como decimal y como separador de miles', () => {
    const valores = (t: string) => cifrasDelTexto(t).map(c => c.valor)
    expect(valores('0,23 ft')).toEqual(expect.arrayContaining([0.23]))
    expect(valores('1,000 gpm')).toEqual(expect.arrayContaining([1, 1000]))
    expect(valores('1.400 gpm')).toEqual(expect.arrayContaining([1.4, 1400]))
    expect(valores('317')).toEqual([317])
  })
})

describe('cumple', () => {
  it('normaliza espacios y mayúsculas, como sale del PDF', () => {
    expect(normalizar('s\nw\n =  CQ\n2')).toBe('s w = cq 2')
    expect(cumple('s\nw\n =  CQ\n2 (4.1)', { patron: 's w = cq 2 \\(4\\.1\\)' })).toBe(true)
  })

  it('una cifra vale con tolerancia y, si se pide, con su unidad cerca', () => {
    expect(cumple('La pérdida es de 0,23 ft.', { cifra: 0.23, tolerancia: 0.01, junto: 'ft' })).toBe(true)
    expect(cumple('La pérdida es de 0,23 m.', { cifra: 0.23, tolerancia: 0.01, junto: 'ft' })).toBe(false)
    expect(cumple('Unos 318 gpm', { cifra: 317, tolerancia: 3, junto: 'gpm' })).toBe(true)
    expect(cumple('Unos 330 gpm', { cifra: 317, tolerancia: 3, junto: 'gpm' })).toBe(false)
  })
})

describe('puntuarRespuesta', () => {
  it('la tabla de qwen acierta todas las filas de la tabla 2.1', () => {
    const p = puntuarRespuesta(caso('walton-tabla-2-1'), RESPUESTA_QWEN, TABLA_2_1)
    expect(p.hechos.filter(h => h.estado !== 'acierta')).toEqual([])
    expect(p.aciertos).toBe(p.total)
  })

  it('separa lo que no estaba en lo leído (recuperación) de lo que estaba y no usó (redacción)', () => {
    const c = caso('walton-tabla-2-1')
    const sinTabla = puntuarRespuesta(c, 'No lo sé.', 'otro capítulo del libro')
    expect(new Set(sinTabla.hechos.map(h => h.estado))).toEqual(new Set(['falla-recuperacion']))

    const conTabla = puntuarRespuesta(c, 'No lo sé.', TABLA_2_1)
    expect(new Set(conTabla.hechos.map(h => h.estado))).toEqual(new Set(['falla-redaccion']))
  })

  it('marca lo que dice sin tenerlo delante: acierta, pero de memoria', () => {
    const p = puntuarRespuesta(caso('walton-tabla-2-1'), RESPUESTA_QWEN, '')
    expect(p.hechos.every(h => h.estado === 'acierta' && h.sinRespaldo)).toBe(true)
  })

  it('una fila con el intervalo de la siguiente no cuenta', () => {
    const cambiada = RESPUESTA_QWEN.replace('|1-2|10 segundos|', '|1-2|30 segundos|')
    const p = puntuarRespuesta(caso('walton-tabla-2-1'), cambiada, TABLA_2_1)
    expect(p.hechos.find(h => h.id === '1-2-min-10-s')?.estado).toBe('falla-redaccion')
  })

  it('el calendario de qwen, con «etapas» y «prueba continua», acierta los cinco días', () => {
    const respuesta = `Día 1: Realizar mediciones del nivel de agua para establecer tendencias antecedentes.
Día 2:
- Prueba piloto de 1 hora con ajuste del equipo, seguida por una recuperación de 1 hora.
- Prueba en etapas de descenso constante a un ritmo de bombeo que determine el coeficiente de pérdida. Este periodo de prueba suele durar 3 horas y se acompaña de una recuperación de 20 horas.
Día 3: Prueba continua durante 24 horas para determinar las características hidráulicas.
Día 4: Prueba de recuperación durante 24 horas con el fin de verificar las características.`
    const p = puntuarRespuesta(caso('walton-calendario-4-dias'), respuesta, '')
    expect(p.aciertos).toBe(p.total)
  })

  it('cuenta aparte lo que no debe decir', () => {
    const p = puntuarRespuesta(caso('walton-tabla-2-2-pozo-16'), '20 l/s equivalen a 45,9 gpm', '')
    expect(p.prohibidos).toEqual(['20-ls-45-gpm'])
    const bien = puntuarRespuesta(caso('walton-tabla-2-2-pozo-16'), '20 l/s son unos 317 gpm', '')
    expect(bien.prohibidos).toEqual([])
    expect(bien.hechos.find(h => h.id === '20-ls-317-gpm')?.estado).toBe('acierta')
  })

  it('reconoce la ecuación 4.1 en las notaciones habituales', () => {
    const c = caso('walton-ecuacion-4-1')
    for (const r of ['s_w = CQ²', 's_w = C·Q^2', '\\(s_{w} = C Q^{2}\\)', 'sw = CQ2']) {
      expect(puntuarRespuesta(c, r, '').hechos.find(h => h.id === 'sw-cq2')?.estado, r).toBe('acierta')
    }
  })

  it('el ejemplo 4.1: C = 2,0 s²/ft⁵ y 0,23 ft a 151 gpm', () => {
    const p = puntuarRespuesta(caso('walton-ejemplo-4-1'),
      'Con s_w = CQ², C = 2,0 s²/ft⁵ y la pérdida a 151 gpm es de 0,23 ft (unos 0,07 m).', '')
    expect(p.aciertos).toBe(p.total)
  })
})

describe('estabilidad y marcador', () => {
  const c: CasoRAG = {
    id: 'x', pregunta: '', documento: 'walton', prohibidos: [], revision: '',
    hechos: [
      { id: 'a', descripcion: '', enRespuesta: [{ patron: 'alfa' }], enFuente: [], origen: '' },
      { id: 'b', descripcion: '', enRespuesta: [{ patron: 'beta' }], enFuente: [{ patron: 'beta' }], origen: '' },
    ],
  }

  it('cuenta los hechos que dan lo mismo en todas las repeticiones', () => {
    const e = estabilidad([puntuarRespuesta(c, 'alfa', ''), puntuarRespuesta(c, 'alfa beta', 'beta'), puntuarRespuesta(c, 'alfa', '')])
    expect(e.aciertosPorRepeticion).toEqual([1, 2, 1])
    expect(e.porHecho).toEqual({ a: 3, b: 1 })
    expect(e.hechosEstables).toBe(1)
  })

  it('los no ejecutados no cuentan como fallo', () => {
    const m = marcador([
      { estado: 'ejecutado', puntuaciones: [puntuarRespuesta(c, 'alfa', 'beta')] },
      { estado: 'no-ejecutado', puntuaciones: [] },
    ])
    expect(m).toMatchObject({ casos: 2, ejecutados: 1, noEjecutados: 1, porcentaje: 50, fallosDeRedaccion: 1, fallosDeRecuperacion: 0 })
  })
})

describe('los casos', () => {
  it('son al menos diez, con ids únicos y un documento conocido', () => {
    expect(CASOS.length).toBeGreaterThanOrEqual(10)
    expect(new Set(CASOS.map(c => c.id)).size).toBe(CASOS.length)
    for (const c of CASOS) expect(DOCUMENTOS[c.documento], c.id).toBeDefined()
  })

  it('cada hecho dice de dónde sale y tiene con qué separar búsqueda de redacción', () => {
    for (const c of CASOS) {
      expect(new Set(c.hechos.map(h => h.id)).size, c.id).toBe(c.hechos.length)
      for (const h of c.hechos) {
        expect(h.origen, `${c.id}/${h.id}`).not.toBe('')
        expect(h.enRespuesta.length, `${c.id}/${h.id}`).toBeGreaterThan(0)
        expect(h.enFuente.length, `${c.id}/${h.id}`).toBeGreaterThan(0)
      }
    }
  })

  it('todas las expresiones compilan', () => {
    const todas = CASOS.flatMap(c => [...c.hechos.flatMap(h => [...h.enRespuesta, ...h.enFuente]), ...c.prohibidos.flatMap(p => p.comprobaciones)])
    const invalidas = todas.filter(c => {
      try {
        cumple('', c)
        cumple('1', c)
        return false
      } catch {
        return true
      }
    })
    expect(invalidas).toEqual([])
  })
})
