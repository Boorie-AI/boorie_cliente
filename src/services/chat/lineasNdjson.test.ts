import { describe, it, expect } from 'vitest'
import { lineasNdjson } from './lineasNdjson'

const lector = (trozos: Array<string | Uint8Array>) => {
  const cola = trozos.map(t => (typeof t === 'string' ? new TextEncoder().encode(t) : t))
  return { read: async () => (cola.length ? { done: false, value: cola.shift() } : { done: true, value: undefined }) }
}

const todas = async (trozos: Array<string | Uint8Array>) => {
  const salida: string[] = []
  for await (const linea of lineasNdjson(lector(trozos))) salida.push(linea)
  return salida
}

const linea = (contenido: string) => JSON.stringify({ message: { content: contenido } }) + '\n'

describe('lineasNdjson (#252)', () => {
  it('una línea JSON partida entre dos lecturas llega entera', async () => {
    const l = linea('la pérdida en el pozo')
    const r = await todas([l.slice(0, 20), l.slice(20) + linea(' es de 0,77 ft')])
    expect(r.map(x => JSON.parse(x).message.content).join('')).toBe('la pérdida en el pozo es de 0,77 ft')
  })

  it('un carácter de varios bytes partido entre dos lecturas no se rompe', async () => {
    const bytes = new TextEncoder().encode(linea('s²/ft⁵, año'))
    const corte = bytes.indexOf(0xc2) + 1 // dentro de «²»
    const r = await todas([bytes.slice(0, corte), bytes.slice(corte)])
    expect(JSON.parse(r[0]).message.content).toBe('s²/ft⁵, año')
  })

  it('varias líneas en una lectura, líneas en blanco y la última sin salto final', async () => {
    const r = await todas([linea('uno') + '\n' + linea('dos'), JSON.stringify({ done: true, eval_count: 9 })])
    expect(r).toHaveLength(3)
    expect(JSON.parse(r[2])).toEqual({ done: true, eval_count: 9 })
  })
})
