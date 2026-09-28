/**
 * Los vectores de los fragmentos de un documento adjunto al chat (#205).
 *
 * Con ellos el chat elige qué partes del documento leer también por significado,
 * que es lo que encuentra «well loss» con una pregunta por la «pérdida de carga».
 * Vectorizar el libro de Walton (542 fragmentos) llevó 68 s con granite-embedding
 * en una GTX 960M, así que se hace una vez y se guarda en disco: las preguntas
 * siguientes, y las de después de reiniciar, no vuelven a pagarlo.
 *
 * Se guardan en binario, en Float32: 1,7 MB ese libro, frente a unos 7 MB en JSON.
 * Y solo los últimos, que son los de los documentos con los que se está trabajando.
 */

import { createHash } from 'crypto'
import * as fs from 'fs/promises'
import * as path from 'path'

/** Unos cuatro minutos con esa tarjeta; con más, se elige solo por palabras. */
export const MAXIMO_FRAGMENTOS = 2000
const LOTE = 10
const GUARDADOS = 30

export type AlProgresoVectores = (hechos: number, total: number) => void

export class VectoresDeAdjunto {
  private enCurso = new Map<string, Promise<number[][]>>()

  constructor(
    private generar: (textos: string[]) => Promise<number[][]>,
    private modelo: () => string,
    private carpeta: string,
  ) {}

  private clave(fragmentos: string[]): string {
    return createHash('sha256').update(this.modelo()).update('\0').update(fragmentos.join('\0')).digest('hex')
  }

  /**
   * Los vectores, del disco si ya se hicieron. Si otra llamada los está haciendo
   * —el adjunto los pide al llegar y la pregunta puede pedirlos antes de que
   * acaben—, se espera a esa en lugar de empezar otra.
   */
  async de(fragmentos: string[], alProgreso?: AlProgresoVectores): Promise<number[][]> {
    if (fragmentos.length > MAXIMO_FRAGMENTOS) {
      throw new Error(`El documento tiene ${fragmentos.length} fragmentos; el máximo para vectorizarlo es ${MAXIMO_FRAGMENTOS}`)
    }
    const clave = this.clave(fragmentos)
    const pendiente = this.enCurso.get(clave)
    if (pendiente) return pendiente

    const trabajo = (async () => {
      const guardado = await this.leer(clave, fragmentos.length)
      if (guardado) {
        alProgreso?.(fragmentos.length, fragmentos.length)
        return guardado
      }
      const vectores: number[][] = []
      for (let i = 0; i < fragmentos.length; i += LOTE) {
        vectores.push(...await this.generar(fragmentos.slice(i, i + LOTE)))
        alProgreso?.(vectores.length, fragmentos.length)
      }
      // La clave se vuelve a calcular: el proveedor de embeddings se resuelve con
      // el primer lote, y es con ese modelo con el que se han hecho.
      await this.escribir(this.clave(fragmentos), vectores)
      return vectores
    })()
    this.enCurso.set(clave, trabajo)
    try {
      return await trabajo
    } finally {
      this.enCurso.delete(clave)
    }
  }

  private ruta(clave: string) {
    return path.join(this.carpeta, `${clave}.f32`)
  }

  private async leer(clave: string, cuantos: number): Promise<number[][] | null> {
    try {
      const datos = await fs.readFile(this.ruta(clave))
      const planos = new Float32Array(datos.buffer, datos.byteOffset, datos.byteLength / 4)
      const dimension = planos.length / cuantos
      if (!Number.isInteger(dimension) || dimension === 0) return null
      return Array.from({ length: cuantos }, (_, i) => Array.from(planos.subarray(i * dimension, (i + 1) * dimension)))
    } catch {
      return null
    }
  }

  private async escribir(clave: string, vectores: number[][]) {
    try {
      await fs.mkdir(this.carpeta, { recursive: true })
      await fs.writeFile(this.ruta(clave), Buffer.from(Float32Array.from(vectores.flat()).buffer))
      await this.podar()
    } catch (error) {
      // Sin disco se pierde la caché, no los vectores: esta respuesta los usa igual.
      console.warn('[VectoresDeAdjunto] No se pudieron guardar los vectores:', error)
    }
  }

  private async podar() {
    const ficheros = (await fs.readdir(this.carpeta)).filter(f => f.endsWith('.f32'))
    if (ficheros.length <= GUARDADOS) return
    const conFecha = await Promise.all(ficheros.map(async f => ({ f, t: (await fs.stat(path.join(this.carpeta, f))).mtimeMs })))
    conFecha.sort((a, b) => b.t - a.t)
    await Promise.all(conFecha.slice(GUARDADOS).map(({ f }) => fs.rm(path.join(this.carpeta, f), { force: true })))
  }
}
