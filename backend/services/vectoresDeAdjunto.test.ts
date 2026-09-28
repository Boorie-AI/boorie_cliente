/**
 * Lo que se fija aquí (#205): que un documento se vectoriza una vez —y no dos
 * aunque se pida dos veces a la vez—, que se guarda en disco para después de
 * reiniciar, y que uno demasiado grande no se intenta.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { VectoresDeAdjunto, MAXIMO_FRAGMENTOS } from './vectoresDeAdjunto'

let carpeta: string
const generar = vi.fn(async (textos: string[]) => textos.map(t => [t.length, 1, 0.5]))

beforeEach(async () => {
  carpeta = await fs.mkdtemp(path.join(os.tmpdir(), 'vectores-'))
  generar.mockClear()
})
afterEach(() => fs.rm(carpeta, { recursive: true, force: true }))

const nuevo = () => new VectoresDeAdjunto(generar, () => 'granite-embedding:278m', carpeta)
const fragmentos = Array.from({ length: 25 }, (_, i) => `fragmento ${i}`)

describe('los vectores de un adjunto', () => {
  it('se hacen por lotes y avisan del progreso', async () => {
    const progreso = vi.fn()
    const v = await nuevo().de(fragmentos, progreso)
    expect(v).toHaveLength(25)
    expect(generar).toHaveBeenCalledTimes(3)
    expect(progreso).toHaveBeenLastCalledWith(25, 25)
  })

  it('se guardan en disco y sirven después de reiniciar', async () => {
    const primero = await nuevo().de(fragmentos)
    generar.mockClear()
    const despues = await nuevo().de(fragmentos)
    expect(generar).not.toHaveBeenCalled()
    expect(despues).toEqual(primero)
  })

  it('pedidos dos veces a la vez, se hacen una', async () => {
    const servicio = nuevo()
    await Promise.all([servicio.de(fragmentos), servicio.de(fragmentos)])
    expect(generar).toHaveBeenCalledTimes(3)
  })

  it('con otro modelo no se reutilizan', async () => {
    await nuevo().de(fragmentos)
    generar.mockClear()
    await new VectoresDeAdjunto(generar, () => 'bge-m3', carpeta).de(fragmentos)
    expect(generar).toHaveBeenCalled()
  })

  it('uno demasiado grande no se intenta', async () => {
    const enorme = Array.from({ length: MAXIMO_FRAGMENTOS + 1 }, (_, i) => `f${i}`)
    await expect(nuevo().de(enorme)).rejects.toThrow(/máximo/)
    expect(generar).not.toHaveBeenCalled()
  })
})
