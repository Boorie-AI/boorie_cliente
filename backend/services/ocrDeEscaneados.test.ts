/**
 * Lo que se fija aquí (#198): que el texto de un escaneado solo se usa si el
 * OCR lo leyó con confianza suficiente, que uno demasiado largo no se lee, y
 * que un fallo del OCR se queda en el «sin texto» de siempre en vez de romper
 * la subida.
 *
 * La lectura de verdad se inyecta: pasarle tesseract a un PDF lleva segundos
 * por página y no es lo que se prueba aquí.
 */

import { describe, it, expect, vi } from 'vitest'
import { leerEscaneado, confianzaMedia, CONFIANZA_MINIMA, MAXIMO_PAGINAS } from './ocrDeEscaneados'

const PDF = Buffer.from('%PDF-1.4')
const TEXTO = 'ACTA DE PRUEBA DE PRESIÓN — TUBERÍA DN 200. Presión de prueba: 15 bar durante 2 horas.'
const paginas = (n: number) => async () => n

describe('un escaneado bien leído', () => {
  it('da su texto, con la confianza y las páginas', async () => {
    const leer = vi.fn(async () => ({ texto: TEXTO, confianza: 91, paginas: 2 }))
    expect(await leerEscaneado(PDF, undefined, leer, paginas(2)))
      .toEqual({ texto: TEXTO, ocr: { confianza: 91, paginas: 2 } })
  })

  it('pasa el progreso a quien lo pidió', async () => {
    const alProgreso = vi.fn()
    const leer = vi.fn(async (_b: Buffer, p?: (a: number, b: number) => void) => {
      p?.(1, 1)
      return { texto: TEXTO, confianza: 91, paginas: 1 }
    })
    await leerEscaneado(PDF, alProgreso, leer, paginas(1))
    expect(alProgreso).toHaveBeenCalledWith(1, 1)
  })
})

describe('cuándo no se usa', () => {
  it('por debajo de la confianza mínima, aunque haya texto', async () => {
    // Es el caso del escaneo con ruido: «Q=8:83» donde pone «Q=8.83».
    const leer = async () => ({ texto: TEXTO, confianza: CONFIANZA_MINIMA - 1, paginas: 1 })
    expect(await leerEscaneado(PDF, undefined, leer, paginas(1))).toEqual({
      texto: '',
      problema: 'ocr-dudoso',
      datos: { confianza: CONFIANZA_MINIMA - 1, minima: CONFIANZA_MINIMA },
    })
  })

  it('demasiado largo: ni se empieza a leer', async () => {
    const leer = vi.fn()
    const r = await leerEscaneado(PDF, undefined, leer, paginas(MAXIMO_PAGINAS + 1))
    expect(r.problema).toBe('escaneado-largo')
    expect(r.datos).toEqual({ paginas: MAXIMO_PAGINAS + 1, maximo: MAXIMO_PAGINAS })
    expect(leer).not.toHaveBeenCalled()
  })

  it('si el OCR no encuentra texto, es un documento sin texto', async () => {
    const leer = async () => ({ texto: '  ', confianza: 0, paginas: 1 })
    expect((await leerEscaneado(PDF, undefined, leer, paginas(1))).problema).toBe('vacio')
  })

  it('si el OCR falla, se queda en «sin texto» con el detalle para el log', async () => {
    const leer = async () => { throw new Error('falta spa.traineddata') }
    expect(await leerEscaneado(PDF, undefined, leer, paginas(1)))
      .toEqual({ texto: '', problema: 'vacio', detalle: 'falta spa.traineddata' })
  })
})

describe('la confianza de un documento', () => {
  it('pesa más la página que más texto da', () => {
    expect(confianzaMedia([{ texto: 'x'.repeat(900), confianza: 90 }, { texto: 'x'.repeat(100), confianza: 40 }])).toBe(85)
  })

  it('una página en blanco no la baja', () => {
    expect(confianzaMedia([{ texto: 'texto', confianza: 90 }, { texto: '', confianza: 0 }])).toBe(90)
  })
})

describe('el paquete (#198)', () => {
  it('saca del asar tesseract.js y todo lo que su hilo de trabajo carga', async () => {
    // El hilo corre desde `app.asar.unpacked` y busca ahí sus dependencias: la
    // que se quede dentro del asar rompe el OCR solo en el paquete, no en desarrollo.
    const fs = await import('fs')
    const path = await import('path')
    const raiz = path.resolve(__dirname, '..', '..')
    const fuera: string[] = JSON.parse(fs.readFileSync(path.join(raiz, 'package.json'), 'utf8')).build.asarUnpack
    const vistas = new Set<string>()
    const recorrer = (nombre: string) => {
      if (vistas.has(nombre)) return
      vistas.add(nombre)
      const pkg = JSON.parse(fs.readFileSync(path.join(raiz, 'node_modules', nombre, 'package.json'), 'utf8'))
      Object.keys(pkg.dependencies ?? {}).forEach(recorrer)
    }
    recorrer('tesseract.js')
    const faltan = [...vistas].filter(n => !fuera.includes(`node_modules/${n}/**/*`))
    expect(faltan).toEqual([])
  })
})
