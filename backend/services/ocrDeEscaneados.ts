/**
 * Leer un PDF escaneado con OCR, sin nada instalado en el sistema (#198).
 *
 * Las páginas se dibujan con pdfjs sobre @napi-rs/canvas y las lee
 * tesseract.js, en WASM. Los datos de idioma van con la aplicación
 * (`dist/tessdata`, los copia `scripts/copy-assets.js`), así que funciona sin
 * conexión.
 *
 * Medido con cinco páginas de tablas escaneadas a 150 ppp: ~11 s por página y
 * ~400 MB de pico con castellano e inglés a la vez. Solo castellano era un 40 %
 * más rápido, pero leía «1/s» donde pone «l/s» casi el doble de veces.
 */

import * as path from 'path'
import { hayTextoAprovechable, type TextoDeDocumento } from './textoDeDocumento'

export const IDIOMAS_OCR = 'spa+eng'

/**
 * Por debajo de esto el texto no se usa.
 *
 * Una cifra mal leída y servida como dato es peor que no leer nada. En las
 * pruebas, un escaneo limpio daba 85–90 y uno con ruido y desenfoque, ~50, con
 * «Q=8:83» donde ponía «Q=8.83» y 13 de 120 filas con todas las cifras bien.
 */
export const CONFIANZA_MINIMA = 70

/** A ~11 s por página, 60 páginas son ya unos once minutos. */
export const MAXIMO_PAGINAS = 60

export interface ResultadoOcr {
  texto: string
  /** Media de las páginas con texto, ponderada por cuánto texto dio cada una. */
  confianza: number
  paginas: number
}

export type AlProgresoOcr = (pagina: number, total: number) => void

/**
 * En el paquete, lo que va fuera del asar vive en `app.asar.unpacked`. Los
 * hilos de trabajo de tesseract.js no leen dentro del asar, así que su script,
 * el núcleo WASM y los datos de idioma están en `asarUnpack`. Y también todas
 * sus dependencias: el hilo las busca desde `app.asar.unpacked/node_modules`, y
 * con solo tesseract.js fuera, el AppImage fallaba con «Cannot find module
 * 'regenerator-runtime/runtime'». Si tesseract.js cambia de dependencias, la
 * lista de `asarUnpack` tiene que cambiar con él.
 */
function fueraDelAsar(ruta: string): string {
  return ruta.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`)
}

export function rutaDeTessdata(): string {
  return fueraDelAsar(path.join(__dirname, '..', '..', 'tessdata'))
}

// pdfjs-dist solo se publica como ESM y el proceso principal compila a
// CommonJS: tsc convertiría un import() normal en un require(), que no carga .mjs.
const importarEsm = new Function('m', 'return import(m)') as (m: string) => Promise<typeof import('pdfjs-dist')>

/** El documento y la tarea que lo abrió, que es la que se destruye al terminar. */
async function abrir(pdfBuffer: Buffer) {
  const { getDocument } = await importarEsm('pdfjs-dist/legacy/build/pdf.mjs')
  const tarea = getDocument({ data: new Uint8Array(pdfBuffer), verbosity: 0 })
  return { pdf: await tarea.promise, cerrar: () => tarea.destroy() }
}

/** Cuántas páginas tiene, sin dibujar ninguna. */
export async function contarPaginas(pdfBuffer: Buffer): Promise<number> {
  const { pdf, cerrar } = await abrir(pdfBuffer)
  const n = pdf.numPages
  await cerrar()
  return n
}

export function confianzaMedia(paginas: Array<{ texto: string; confianza: number }>): number {
  const conTexto = paginas.filter(p => p.texto.trim())
  const caracteres = conTexto.reduce((n, p) => n + p.texto.length, 0)
  if (!caracteres) return 0
  return Math.round(conTexto.reduce((n, p) => n + p.confianza * p.texto.length, 0) / caracteres)
}

/**
 * Las páginas de una en una y con un solo hilo de tesseract: dibujar y leer en
 * paralelo multiplica la memoria, y con Milvus en la misma máquina ya se ha
 * llegado a cerrar la sesión por falta de RAM.
 */
export async function leerConOcr(pdfBuffer: Buffer, alProgreso?: AlProgresoOcr): Promise<ResultadoOcr> {
  const [{ createWorker }, { createCanvas }] = await Promise.all([
    import('tesseract.js'),
    import('@napi-rs/canvas'),
  ])
  const { pdf, cerrar } = await abrir(pdfBuffer)
  const worker = await createWorker(IDIOMAS_OCR, 1, {
    langPath: rutaDeTessdata(),
    workerPath: fueraDelAsar(require.resolve('tesseract.js/src/worker-script/node/index.js')),
    // Los datos ya están en disco: sin esto tesseract.js copia cada idioma
    // descomprimido al directorio de trabajo.
    cacheMethod: 'none',
  })

  try {
    const paginas: Array<{ texto: string; confianza: number }> = []
    for (let n = 1; n <= pdf.numPages; n++) {
      alProgreso?.(n, pdf.numPages)
      const pagina = await pdf.getPage(n)
      // A escala 2 una página A4 queda en ~1200 × 1700 px, unos 144 ppp: lo que
      // tesseract necesita para no confundir cifras, sin disparar la memoria.
      const vista = pagina.getViewport({ scale: 2 })
      const lienzo = createCanvas(Math.ceil(vista.width), Math.ceil(vista.height))
      // pdfjs tipa el contexto con el del DOM; el de @napi-rs/canvas sirve igual.
      // `never` compila con la lib DOM (el renderer, que lo ve por la batería del
      // RAG) y sin ella (el proceso principal).
      await pagina.render({ canvas: null, canvasContext: lienzo.getContext('2d') as never, viewport: vista }).promise
      const { data } = await worker.recognize(await lienzo.encode('png'))
      paginas.push({ texto: data.text, confianza: data.confidence })
      pagina.cleanup()
    }
    return {
      texto: paginas.map(p => p.texto.trim()).filter(Boolean).join('\n\n'),
      confianza: confianzaMedia(paginas),
      paginas: pdf.numPages,
    }
  } finally {
    await worker.terminate()
    await cerrar()
  }
}

/**
 * Lo que sale de un PDF sin capa de texto: el texto del OCR con su confianza,
 * o por qué no se usa.
 *
 * Si el OCR falla por su cuenta —falta un dato de idioma, el PDF no se deja
 * dibujar— se queda en «sin texto», que es lo que había antes de #198: el
 * usuario recibe el aviso de pasarle OCR él mismo, no un error nuevo.
 */
export async function leerEscaneado(
  pdfBuffer: Buffer,
  alProgreso?: AlProgresoOcr,
  leer: typeof leerConOcr = leerConOcr,
  paginasDe: typeof contarPaginas = contarPaginas,
): Promise<TextoDeDocumento> {
  try {
    const paginas = await paginasDe(pdfBuffer)
    if (paginas > MAXIMO_PAGINAS) {
      return { texto: '', problema: 'escaneado-largo', datos: { paginas, maximo: MAXIMO_PAGINAS } }
    }
    const ocr = await leer(pdfBuffer, alProgreso)
    if (!hayTextoAprovechable(ocr.texto)) return { texto: '', problema: 'vacio' }
    if (ocr.confianza < CONFIANZA_MINIMA) {
      return { texto: '', problema: 'ocr-dudoso', datos: { confianza: ocr.confianza, minima: CONFIANZA_MINIMA } }
    }
    return { texto: ocr.texto.trim(), ocr: { confianza: ocr.confianza, paginas: ocr.paginas } }
  } catch (error) {
    console.warn('[OCR] No se pudo leer el escaneado:', error)
    return { texto: '', problema: 'vacio', detalle: error instanceof Error ? error.message : String(error) }
  }
}
