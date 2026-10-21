import { describe, it, expect } from 'vitest'
import { FLECHA_POR_NUDO, escalaFlechaEsquema, tamanoFlechaMapa, LADO_IMAGEN_FLECHA } from './flechas'

describe('las flechas de caudal se escalan con el nudo', () => {
  it('en el mapa, la flecha crece en proporción al tamaño de nudo', () => {
    expect(tamanoFlechaMapa(8) * LADO_IMAGEN_FLECHA).toBeCloseTo(8 * FLECHA_POR_NUDO)
    expect(tamanoFlechaMapa(16)).toBeCloseTo(2 * tamanoFlechaMapa(8))
  })

  it('en el esquema, la flecha mide lo mismo en un tramo fino que en uno algo más grueso', () => {
    // vis-network: largo = 15 × scaleFactor + 3 × grosor
    const largo = (radio: number, grosor: number) => 15 * escalaFlechaEsquema(radio, grosor) + 3 * grosor
    expect(largo(8, 1)).toBeCloseTo(16)
    expect(largo(8, 2)).toBeCloseTo(16)
    expect(largo(16, 2)).toBeCloseTo(32)
  })

  it('con el valor por defecto es mucho menor que la flecha fija de antes (21-39 px)', () => {
    const largo = 15 * escalaFlechaEsquema(8, 2) + 3 * 2
    expect(largo).toBeLessThan(21)
  })

  it('nunca desaparece del todo, aunque el tramo sea muy grueso', () => {
    expect(escalaFlechaEsquema(8, 8)).toBeGreaterThan(0)
  })
})
