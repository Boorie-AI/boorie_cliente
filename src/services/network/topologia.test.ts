import { describe, it, expect } from 'vitest'
import { conOpacidad, construirGrafo, lecturaNudo, lecturaTramo, NUDO_BASE, tieneCoordenadasUtiles, TRAMO_BASE, valorEnPaso } from './topologia'

const RED = {
  nodes: [
    { id: 'R1', label: 'R1', type: 'reservoir', x: 0, y: 0, elevation: 100 },
    { id: 'J1', label: 'J1', type: 'junction', x: 100, y: 50, demand: 5 },
    { id: 'T1', label: 'T1', type: 'tank', x: 200, y: 0 },
  ],
  links: [
    { id: 'P1', label: 'P1', type: 'pipe', from: 'R1', to: 'J1', length: 120, diameter: 200 },
    { id: 'B1', label: 'B1', type: 'pump', from: 'J1', to: 'T1' },
  ],
}

describe('una red sin coordenadas sigue siendo visualizable', () => {
  it('sin coordenadas, deja que el visor reparta los nudos', () => {
    const sinCoords = { ...RED, nodes: RED.nodes.map(({ x: _x, y: _y, ...n }) => n) }
    const g = construirGrafo(sinCoords)

    expect(g.usaFisica).toBe(true)
    expect(g.nodes).toHaveLength(3)
    expect(g.nodes.every(n => n.x === undefined)).toBe(true)
    expect(g.motivo).toMatch(/no trae coordenadas/i)
  })

  it('con todas las coordenadas a cero tampoco las respeta: sería un ovillo en un punto', () => {
    const planas = { ...RED, nodes: RED.nodes.map(n => ({ ...n, x: 0, y: 0 })) }
    expect(tieneCoordenadasUtiles(planas.nodes)).toBe(false)
    expect(construirGrafo(planas).usaFisica).toBe(true)
  })

  it('con coordenadas útiles las respeta y las fija', () => {
    const g = construirGrafo(RED)

    expect(g.usaFisica).toBe(false)
    expect(g.nodes.every(n => typeof n.x === 'number' && n.fixed)).toBe(true)
  })

  it('una red vacía no revienta', () => {
    expect(construirGrafo(null).nodes).toEqual([])
    expect(construirGrafo({ nodes: [], links: [] }).nodes).toEqual([])
  })
})

describe('escalado al lienzo', () => {
  it('conserva la proporción sea cual sea el tamaño de la red', () => {
    // Misma forma, tres órdenes de magnitud de diferencia: el resultado debe ser
    // el mismo. El «x * 10» que había antes sólo servía para un rango concreto.
    const pequena = construirGrafo({
      nodes: [
        { id: 'A', x: 0, y: 0 },
        { id: 'B', x: 4, y: 2 },
      ],
      links: [],
    })
    const grande = construirGrafo({
      nodes: [
        { id: 'A', x: 500000, y: 1000000 },
        { id: 'B', x: 504000, y: 1002000 },
      ],
      links: [],
    })

    expect(pequena.nodes[1].x).toBeCloseTo(grande.nodes[1].x!, 6)
    expect(pequena.nodes[1].y).toBeCloseTo(grande.nodes[1].y!, 6)
  })

  it('invierte la Y, porque en el fichero crece hacia el norte y en el visor hacia abajo', () => {
    const g = construirGrafo({
      nodes: [
        { id: 'sur', x: 0, y: 0 },
        { id: 'norte', x: 0, y: 100 },
      ],
      links: [],
    })
    const sur = g.nodes.find(n => n.id === 'sur')!
    const norte = g.nodes.find(n => n.id === 'norte')!
    expect(norte.y!).toBeLessThan(sur.y!)
  })
})

describe('simbología y resultados', () => {
  it('colorea el nudo por presión cuando hay simulación', () => {
    const g = construirGrafo(RED, {
      node_results: { J1: { pressure: 5 }, T1: { pressure: 90 }, R1: { pressure: 45 } },
    })
    expect(g.nodes.find(n => n.id === 'J1')!.color).toBe('#DC2626')
    expect(g.nodes.find(n => n.id === 'T1')!.color).toBe('#F97316')
    // Presión normal: conserva el color de su tipo.
    expect(g.nodes.find(n => n.id === 'R1')!.color).toBe('#10B981')
  })

  it('lee el paso de tiempo pedido en los resultados que vienen como serie', () => {
    expect(valorEnPaso([1, 2, 3], 2)).toBe(3)
    expect(valorEnPaso([1, 2, 3])).toBe(1)
    // Fuera de rango cae al primero en lugar de dar undefined y borrar el color.
    expect(valorEnPaso([1, 2, 3], 99)).toBe(1)
    expect(valorEnPaso(7)).toBe(7)
    expect(valorEnPaso(undefined)).toBeUndefined()

    const g = construirGrafo(RED, { node_results: { J1: { pressure: [50, 5] } } }, 1)
    expect(g.nodes.find(n => n.id === 'J1')!.color).toBe('#DC2626')
  })

  it('un caudal negativo invierte la flecha en vez de mentir sobre el sentido', () => {
    const g = construirGrafo(RED, { link_results: { P1: { flowrate: -3 } } })
    const p1 = g.edges.find(e => e.id === 'P1')!
    expect(p1.from).toBe('J1')
    expect(p1.to).toBe('R1')
    expect(p1.arrows).toBe('to')
  })

  it('el grosor crece con el caudal pero tiene tope', () => {
    const flojo = construirGrafo(RED, { link_results: { P1: { flowrate: 1 } } })
    const fuerte = construirGrafo(RED, { link_results: { P1: { flowrate: 1000 } } })
    expect(fuerte.edges[0].width).toBeGreaterThan(flojo.edges[0].width)
    expect(fuerte.edges[0].width).toBeLessThanOrEqual(8)
  })
})

describe('robustez', () => {
  it('descarta el tramo que apunta a un nudo inexistente en vez de romper el visor', () => {
    const g = construirGrafo({
      nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 1, y: 1 }],
      links: [
        { id: 'ok', from: 'A', to: 'B' },
        { id: 'roto', from: 'A', to: 'FANTASMA' },
      ],
    })
    expect(g.edges.map(e => e.id)).toEqual(['ok'])
  })

  it('un tipo desconocido se dibuja como nudo normal, no desaparece', () => {
    const g = construirGrafo({ nodes: [{ id: 'X', type: 'no-existe' }], links: [] })
    expect(g.nodes).toHaveLength(1)
    expect(g.nodes[0].color).toBe('#3B82F6')
  })
})

describe('las etiquetas llevan unidad y no vuelcan la cifra en bruto (#77)', () => {
  const RED_REAL = {
    nodes: [{ id: '145', label: '145', type: 'junction', x: 1, y: 1, elevation: 0.3048, demand: 0.001743182126532 }],
    links: [{ id: 'P1', label: 'P1', type: 'pipe', from: '145', to: '145', length: 1609.344, diameter: 0.4064 }],
  }

  it('la etiqueta de un nudo dice qué es cada cifra y en qué unidad', () => {
    const g = construirGrafo(RED_REAL, {
      node_results: { '145': { pressure: 31.245678, demand: 0.001743182126532 } },
    })
    expect(g.nodes[0].title).toBe('junction: 145\nCota: 0,3048 m\nDemanda: 1,74318 l/s\nPresión: 31,25 m')
  })

  it('la demanda se recorta a seis cifras significativas', () => {
    const g = construirGrafo(RED_REAL)
    expect(g.nodes[0].title).not.toContain('0.001743182126532')
    expect(g.nodes[0].title).toContain('1,74318 l/s')
  })

  it('la etiqueta de un tramo también, con el diámetro en milímetros', () => {
    const g = construirGrafo(RED_REAL, { link_results: { P1: { flowrate: 0.0475, velocity: 1.234 } } })
    expect(g.edges[0].title).toBe('pipe: P1\nLongitud: 1.609,34 m\nDiámetro: 406,4 mm\nCaudal: 47,5 l/s\nVelocidad: 1,23 m/s')
  })

  it('con simulación la demanda es la del paso que se está viendo, no la del fichero', () => {
    // En PDA un nudo con poca presión no recibe lo que pide: la etiqueta tiene
    // que decir lo que recibe en ese instante.
    const resultados = { node_results: { '145': { demand: [0.002, 0.0005, 0] } } }

    expect(construirGrafo(RED_REAL, resultados, 0).nodes[0].title).toContain('Demanda: 2 l/s')
    expect(construirGrafo(RED_REAL, resultados, 1).nodes[0].title).toContain('Demanda: 0,5 l/s')
    expect(construirGrafo(RED_REAL, resultados, 2).nodes[0].title).toContain('Demanda: 0 l/s')
  })

  it('sin simulación se dice que la demanda es la base, en vez de hacerla pasar por la del paso', () => {
    expect(construirGrafo(RED_REAL).nodes[0].title).toContain('Demanda base: 1,74318 l/s')
  })

  it('lo que no hay no aparece como línea vacía', () => {
    const g = construirGrafo({ nodes: [{ id: 'X' }], links: [] })
    expect(g.nodes[0].title).toBe('junction: X')
  })
})

describe('la lectura del elemento elegido sigue al paso de la simulación (#74)', () => {
  const RESULTADOS = {
    node_results: { J1: { pressure: [30, 45, 12] } },
    link_results: { P1: { flowrate: [0.1, 0.5, -0.2], velocity: [0.4, 1.8, 0.7] } },
  }

  it('un nudo da la presión del paso pedido, no la del primero', () => {
    expect(lecturaNudo(RED, RESULTADOS, 'J1', 0)?.presion).toBe(30)
    expect(lecturaNudo(RED, RESULTADOS, 'J1', 1)?.presion).toBe(45)
    expect(lecturaNudo(RED, RESULTADOS, 'J1', 2)?.presion).toBe(12)
  })

  it('un tramo da el caudal y la velocidad del paso pedido', () => {
    const paso1 = lecturaTramo(RED, RESULTADOS, 'P1', 1)
    expect(paso1?.caudal).toBe(0.5)
    expect(paso1?.velocidad).toBe(1.8)

    const paso2 = lecturaTramo(RED, RESULTADOS, 'P1', 2)
    expect(paso2?.caudal).toBe(-0.2)
    expect(paso2?.velocidad).toBe(0.7)
  })

  it('la demanda del nudo elegido también sigue al paso (#77)', () => {
    const resultados = { node_results: { J1: { demand: [0.002, 0.0005] } } }

    expect(lecturaNudo(RED, resultados, 'J1', 0)).toMatchObject({ demanda: 0.002, demandaSimulada: true })
    expect(lecturaNudo(RED, resultados, 'J1', 1)).toMatchObject({ demanda: 0.0005, demandaSimulada: true })
    // Sin simulación queda la base del fichero, y la lectura lo declara.
    expect(lecturaNudo(RED, null, 'J1')).toMatchObject({ demanda: 5, demandaSimulada: false })
  })

  it('los datos que no dependen del tiempo salen de la red', () => {
    expect(lecturaNudo(RED, RESULTADOS, 'R1', 5)).toMatchObject({
      label: 'R1',
      tipo: 'reservoir',
      cota: 100,
    })
    expect(lecturaTramo(RED, RESULTADOS, 'P1', 5)).toMatchObject({
      label: 'P1',
      tipo: 'pipe',
      longitud: 120,
      diametro: 200,
    })
  })

  it('sin resultados enseña el elemento sin cifras, en vez de nada', () => {
    expect(lecturaNudo(RED, null, 'J1')).toMatchObject({ label: 'J1', presion: undefined })
    expect(lecturaTramo(RED, null, 'P1')).toMatchObject({ label: 'P1', caudal: undefined })
  })

  it('un resultado escalar vale para cualquier paso', () => {
    const escalar = { node_results: { J1: { pressure: 22 } } }
    expect(lecturaNudo(RED, escalar, 'J1', 7)?.presion).toBe(22)
  })

  it('un elemento que ya no está en la red no da lectura', () => {
    expect(lecturaNudo(RED, RESULTADOS, 'FANTASMA')).toBeNull()
    expect(lecturaTramo(RED, RESULTADOS, 'FANTASMA')).toBeNull()
    expect(lecturaNudo(null, RESULTADOS, 'J1')).toBeNull()
  })
})

/**
 * El deslizador de tamaño llega al esquema (issue #97).
 *
 * Lo reportó el Dr. Mora: mover «Tamaño de nudo» de 2 a 20 dibujaba siempre lo
 * mismo. Los ajustes de dibujo llegaban al mapa —que aplica `nodeSize` como
 * radio del círculo— pero no al esquema, que pintaba con los tamaños fijos de
 * cada tipo. Coincidía además que el valor por defecto del panel, 8, es el
 * mismo que el tamaño del nudo de consumo, así que ni siquiera al arrancar se
 * notaba que el número no se usaba.
 */
describe('los ajustes de dibujo llegan al esquema', () => {
  const nudo = (g: ReturnType<typeof construirGrafo>, id: string) =>
    g.nodes.find(n => n.id === id)!
  const tramo = (g: ReturnType<typeof construirGrafo>, id: string) =>
    g.edges.find(e => e.id === id)!

  it('con el valor por defecto no cambia nada, así que la escala es neutra', () => {
    const base = construirGrafo(RED)
    const conDefecto = construirGrafo(RED, null, 0, null, null, {
      nodeSize: NUDO_BASE, linkWidth: TRAMO_BASE,
    })
    expect(conDefecto.nodes.map(n => n.size)).toEqual(base.nodes.map(n => n.size))
    expect(conDefecto.edges.map(e => e.width)).toEqual(base.edges.map(e => e.width))
  })

  it('el tamaño de nudo escala, y mantiene la diferencia entre tipos', () => {
    const g = construirGrafo(RED, null, 0, null, null, { nodeSize: NUDO_BASE * 2 })
    const base = construirGrafo(RED)

    expect(nudo(g, 'J1').size).toBe(nudo(base, 'J1').size * 2)
    expect(nudo(g, 'T1').size).toBe(nudo(base, 'T1').size * 2)
    // Un depósito se sigue viendo más grande que un nudo de consumo: el
    // deslizador escala los tamaños de cada tipo, no los iguala.
    expect(nudo(g, 'T1').size).toBeGreaterThan(nudo(g, 'J1').size)
  })

  it('los dos extremos del deslizador dan tamaños bien distintos', () => {
    const minimo = construirGrafo(RED, null, 0, null, null, { nodeSize: 2 })
    const maximo = construirGrafo(RED, null, 0, null, null, { nodeSize: 20 })
    // El caso del informe: de 2 a 20 salía lo mismo.
    expect(nudo(maximo, 'J1').size).toBeGreaterThan(nudo(minimo, 'J1').size * 5)
  })

  it('el grosor de tramo escala igual', () => {
    const base = construirGrafo(RED)
    const g = construirGrafo(RED, null, 0, null, null, { linkWidth: TRAMO_BASE * 3 })
    expect(tramo(g, 'P1').width).toBe(tramo(base, 'P1').width * 3)
    // La bomba se dibuja más gruesa que la tubería, y lo sigue siendo.
    expect(tramo(g, 'B1').width).toBeGreaterThan(tramo(g, 'P1').width)
  })

  it('sin ajustes se comporta como antes del arreglo', () => {
    const g = construirGrafo(RED, null, 0, null, null, null)
    expect(g.nodes.map(n => n.size)).toEqual(construirGrafo(RED).nodes.map(n => n.size))
  })
})

describe('la opacidad del panel llega al esquema', () => {
  it('opacidad 1 deja el color tal cual', () => {
    expect(conOpacidad('#3B82F6', 1)).toBe('#3B82F6')
    const g = construirGrafo(RED, null, 0, null, null, { opacity: 1 })
    expect(g.nodes[0].color).toBe(construirGrafo(RED).nodes[0].color)
  })

  it('por debajo de 1 pasa el color a rgba', () => {
    expect(conOpacidad('#3B82F6', 0.5)).toBe('rgba(59, 130, 246, 0.5)')
    // Forma corta, que también aparece en CSS.
    expect(conOpacidad('#fff', 0.25)).toBe('rgba(255, 255, 255, 0.25)')
  })

  it('lo que no sea hex se devuelve intacto en vez de romper el dibujo', () => {
    // `escala.color` está tipada como cualquier cadena: si alguna rampa
    // devolviera un nombre o un rgb(), no debe salir un color inválido.
    expect(conOpacidad('red', 0.5)).toBe('red')
    expect(conOpacidad('rgb(1, 2, 3)', 0.5)).toBe('rgb(1, 2, 3)')
  })

  it('nudos y tramos se atenúan los dos', () => {
    const g = construirGrafo(RED, null, 0, null, null, { opacity: 0.4 })
    expect(g.nodes.every(n => n.color.startsWith('rgba('))).toBe(true)
    expect(g.edges.every(e => e.color.startsWith('rgba('))).toBe(true)
  })
})
