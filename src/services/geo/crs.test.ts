import { describe, it, expect } from 'vitest'
import {
  WGS84,
  calcularLimites,
  catalogoCRS,
  crearTransformador,
  crearTransformadorInverso,
  esEPSGSoportado,
  nombreCRS,
  normalizarEPSG,
  pareceGeografico,
  reproyectarLimites,
  resolverCRS,
  sugerirCRS,
  validarCordura,
} from './crs'

/**
 * Los puntos de control no salen de proj4: se derivan de la propia definicion
 * del EPSG, que fija donde cae el falso origen. Comprobar proj4 con proj4 no
 * demostraria nada.
 */
describe('reproyeccion contra puntos de control conocidos', () => {
  it('en el meridiano central de un huso UTM, X=500.000 devuelve exactamente su longitud', () => {
    // El meridiano central del huso n es -183 + 6n: el 18 es -75 y el 30 es -3.
    const utm18 = crearTransformador('EPSG:32618')
    const [lon18, lat18] = utm18(500000, 0)
    expect(lon18).toBeCloseTo(-75, 9)
    expect(lat18).toBeCloseTo(0, 9)

    const utm30 = crearTransformador('EPSG:25830')
    const [lon30] = utm30(500000, 4_500_000)
    expect(lon30).toBeCloseTo(-3, 9)
  })

  it('el falso origen de MAGNA-SIRGAS Bogotá cae en su punto de origen oficial', () => {
    // EPSG:3116 define el origen en 4°35'46.3215"N, 74°04'39.0285"W con
    // desplazamiento (1.000.000, 1.000.000).
    const [lon, lat] = crearTransformador('EPSG:3116')(1_000_000, 1_000_000)
    expect(lon).toBeCloseTo(-74.07750791666666, 7)
    expect(lat).toBeCloseTo(4.596200416666666, 7)
  })

  it('el falso este de México ITRF2008 / LCC cae en su meridiano de origen', () => {
    const [lon] = crearTransformador('EPSG:6372')(2_500_000, 2_000_000)
    expect(lon).toBeCloseTo(-102, 9)
  })
})

describe('ida y vuelta sin pérdida', () => {
  const puntos: Array<[string, number, number]> = [
    ['EPSG:32618', 842913.44, 1151987.21],
    ['EPSG:32718', 300100.5, 8_200_000.75],
    ['EPSG:25830', 728123.9, 4_373_456.1],
    ['EPSG:3116', 1_012_345.6, 998_765.4],
  ]

  it.each(puntos)('%s recupera la coordenada original con error submilimétrico', (epsg, x, y) => {
    const ida = crearTransformador(epsg)
    const vuelta = crearTransformadorInverso(epsg)
    const [x2, y2] = vuelta(...ida(x, y))
    // El criterio de aceptacion pide < 2 m; el error real del viaje es de micras.
    expect(Math.abs(x2 - x)).toBeLessThan(0.001)
    expect(Math.abs(y2 - y)).toBeLessThan(0.001)
  })
})

describe('el EPSG se declara, no se adivina', () => {
  it('unas coordenadas proyectadas no permiten sugerir ningún sistema', () => {
    // Las mismas de la red de Cartagena que motivo los casos codificados a mano.
    const sugerencia = sugerirCRS({ minX: 842000, maxX: 843500, minY: 1151000, maxY: 1152500 })
    expect(sugerencia.epsg).toBeNull()
    expect(sugerencia.origen).toBe('desconocido')
    expect(sugerencia.motivo).toMatch(/huso/i)
  })

  it('unas coordenadas en rango lon/lat sí se reconocen como geográficas', () => {
    const sugerencia = sugerirCRS({ minX: -75.52, maxX: -75.48, minY: 10.38, maxY: 10.42 })
    expect(sugerencia.epsg).toBe(WGS84)
    expect(sugerencia.origen).toBe('sugerido')
  })

  it('una red sin coordenadas se declara desconocida en vez de dibujarse', () => {
    expect(sugerirCRS(null).epsg).toBeNull()
    expect(calcularLimites([])).toBeNull()
  })

  it('lo declarado manda sobre lo que sugieren las coordenadas', () => {
    const limites = { minX: -75.52, maxX: -75.48, minY: 10.38, maxY: 10.42 }
    expect(resolverCRS('EPSG:3116', limites).epsg).toBe('EPSG:3116')
    expect(resolverCRS('EPSG:3116', limites).origen).toBe('declarado')
    expect(resolverCRS(null, limites).origen).toBe('sugerido')
  })

  it('un EPSG declarado que no se reconoce no se pinta a la brava', () => {
    const r = resolverCRS('EPSG:999999', { minX: 1, maxX: 2, minY: 1, maxY: 2 })
    expect(r.epsg).toBeNull()
    expect(r.origen).toBe('desconocido')
  })

  it('una extensión enorme en rango lon/lat no se confunde con coordenadas geográficas', () => {
    // Coordenadas locales de un modelo sintetico (metros desde un origen propio).
    expect(pareceGeografico({ minX: 0, maxX: 150, minY: 0, maxY: 90 })).toBe(false)
  })
})

describe('validación de cordura tras reproyectar', () => {
  const cartagenaUTM = { minX: 842000, maxX: 843500, minY: 1151000, maxY: 1152500 }

  it('acepta la red cuando el huso declarado la sitúa en el país del proyecto', () => {
    const { centroide } = reproyectarLimites(cartagenaUTM, 'EPSG:32618')
    expect(validarCordura(centroide, 'CO').ok).toBe(true)
  })

  it('caza el huso equivocado: el mismo X en el huso 14 se va fuera de Colombia', () => {
    const { centroide } = reproyectarLimites(cartagenaUTM, 'EPSG:32614')
    const cordura = validarCordura(centroide, 'CO')
    expect(cordura.ok).toBe(false)
    expect(cordura.aviso).toMatch(/CO/)
  })

  it('caza el hemisferio equivocado', () => {
    const { centroide } = reproyectarLimites(cartagenaUTM, 'EPSG:32718')
    expect(validarCordura(centroide, 'CO').ok).toBe(false)
  })

  it('sin país declarado en el proyecto no inventa un aviso', () => {
    const { centroide } = reproyectarLimites(cartagenaUTM, 'EPSG:32614')
    expect(validarCordura(centroide, null).ok).toBe(true)
    expect(validarCordura(centroide, '').ok).toBe(true)
  })
})

describe('catálogo y normalización', () => {
  it('cubre los 120 husos UTM además de los sistemas con nombre propio', () => {
    const catalogo = catalogoCRS()
    const epsgs = catalogo.map(c => c.epsg)
    expect(epsgs).toContain('EPSG:32601')
    expect(epsgs).toContain('EPSG:32660')
    expect(epsgs).toContain('EPSG:32701')
    expect(epsgs).toContain('EPSG:32760')
    expect(epsgs).toContain('EPSG:25830')
    expect(new Set(epsgs).size).toBe(epsgs.length)
  })

  it('todo lo que ofrece el catálogo se puede usar de verdad', () => {
    for (const { epsg } of catalogoCRS()) {
      expect(esEPSGSoportado(epsg), epsg).toBe(true)
    }
  })

  it('acepta el código con o sin prefijo y rechaza lo que no es un EPSG', () => {
    expect(normalizarEPSG('32618')).toBe('EPSG:32618')
    expect(normalizarEPSG(' epsg:32618 ')).toBe('EPSG:32618')
    expect(normalizarEPSG('UTM 18N')).toBeNull()
    expect(normalizarEPSG('')).toBeNull()
  })

  it('nombra los husos sin necesidad de tenerlos en una tabla', () => {
    expect(nombreCRS('EPSG:32618')).toBe('WGS 84 / UTM 18N')
    expect(nombreCRS('EPSG:32718')).toBe('WGS 84 / UTM 18S')
    expect(nombreCRS('EPSG:3116')).toMatch(/MAGNA-SIRGAS/)
  })

  it('un EPSG no soportado falla al crear el transformador en vez de devolver algo falso', () => {
    expect(() => crearTransformador('EPSG:999999')).toThrow(/no soportado/i)
  })
})

describe('límites de la red', () => {
  it('lee las coordenadas tanto de x/y como de coordinates', () => {
    const limites = calcularLimites([
      { x: 10, y: 20 },
      { coordinates: [30, 5] },
      { x: undefined, y: undefined },
    ])
    expect(limites).toEqual({ minX: 10, maxX: 30, minY: 5, maxY: 20 })
  })
})
