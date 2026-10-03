/**
 * El ejecutor de la batería del RAG (#226), sin Electron.
 *
 *     npm run eval:rag -- --modelo qwen2.5:7b --repeticiones 3
 *     NVIDIA_API_KEY=… npm run eval:rag -- --modelo nvidia --repeticiones 3
 *
 * Recorre la misma ruta que el chat (`rutaDelChat`): el adjunto se lee con
 * `extraerTextoDeFichero`, se elige lo que cabe con los mismos vectores y
 * consultas, y la respuesta pasa por la misma limpieza de citas y, en la nube,
 * por la misma revisión contra el documento. Lo que cambia es quién llama al
 * modelo: aquí `fetch` directo, con los mismos parámetros que la app.
 *
 * La base de conocimiento no se consulta: los casos son de documento adjunto,
 * y levantar Milvus con la colección de Luis al lado de un modelo de 7B no cabe
 * en el portátil de pruebas. Es como preguntar con el RAG apagado.
 *
 * Nunca en el CI: cuesta crédito de la API y necesita el libro, que no está en
 * el repositorio.
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import { CASOS, DOCUMENTOS } from '@/../backend/services/hydraulic/ragEval/casos'
import { cumple, puntuarRespuesta, type CasoRAG } from '@/../backend/services/hydraulic/ragEval/bateria'
import { extraerTextoDeFichero } from '@/../backend/services/textoDeFichero'
import { VectoresDeAdjunto } from '@/../backend/services/vectoresDeAdjunto'
import { modeloEmbeddingsOllama } from '@/../backend/services/modeloEmbeddings'
import { contextoDeOllama } from '@/../backend/services/contextoDeOllama'
import { componerPromptDeSistema } from '@/../backend/services/hydraulic/promptDelAgente'
import { formatearContextoRed } from '@/../backend/services/hydraulic/networkContext'
import { PAREJAS } from '@/../backend/services/hydraulic/agentic/modelosRAG'
import { URL_NVIDIA } from '@/../backend/services/ai/pruebaNvidia'
import {
  cuerpoNvidia,
  LIMITES_NVIDIA,
  MAX_CONTINUACIONES,
  leerRespuestaEnStreaming,
  pedirContinuacion,
  unirContinuacion,
} from '@/../backend/services/ai/respuestaOpenAICompat'
import es from '@/locales/es.json'
import { componerPeticion, posprocesarRespuesta, type TextosDeLaRespuesta } from '../rutaDelChat'
import { estimarTokens, trocear } from '../adjunto'
import { coseno } from '../similitudDelAdjunto'
import { consultasEnElIdiomaDelDocumento } from '../consultasDelAdjunto'
import type { ChatMessage } from '../types'
import { cerrarCaso, informeDeModelo, informeMarkdown, type InformeDeModelo, type Repeticion, type ResultadoDeCaso } from './informe'

const OLLAMA = process.env.BOORIE_EVAL_OLLAMA ?? 'http://localhost:11434'
/** El chat corta toda la pregunta a los 11 minutos (`GLOBAL_TIMEOUT_MS`). */
const TOPE_OLLAMA_MS = 660_000

const decir = (texto: string) => process.stdout.write(texto + '\n')

/**
 * Todas las peticiones, para cortarlas de golpe. Sin esto, una corrida que muere
 * deja a Ollama generando para nadie con el modelo fijado en memoria (ver
 * `agentEval/contraElModelo.ts`).
 */
const enVuelo = new AbortController()

interface Opciones {
  modelos: string[]
  repeticiones: number
  casos?: string[]
  documentos: Record<string, string>
  salida: string
}

export function leerArgumentos(argv: string[], entorno: NodeJS.ProcessEnv = process.env): Opciones {
  const valor = (nombre: string) => {
    const i = argv.indexOf(`--${nombre}`)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const documentos: Record<string, string> = {}
  for (const [clave, { variable }] of Object.entries(DOCUMENTOS)) {
    if (entorno[variable]) documentos[clave] = entorno[variable] as string
  }
  argv.forEach((a, i) => {
    if (a !== '--documento') return
    const [clave, ...ruta] = (argv[i + 1] ?? '').split('=')
    if (clave && ruta.length) documentos[clave] = ruta.join('=')
  })
  const modelos = (valor('modelo') ?? '').split(',').map(m => m.trim()).filter(Boolean)
    .map(m => (m === 'nvidia' ? PAREJAS.nvidia.principal : m))
  return {
    modelos,
    repeticiones: Math.max(1, Number(valor('repeticiones') ?? 1) || 1),
    casos: valor('casos')?.split(',').map(c => c.trim()).filter(Boolean),
    documentos,
    salida: valor('salida') ?? path.join(process.cwd(), '.eval-rag'),
  }
}

/** Los ids de NVIDIA llevan el editor delante («nvidia/…», «meta/…»); los de Ollama no. */
export const proveedorDe = (modelo: string) => (modelo.includes('/') ? 'nvidia' : 'Ollama')

const textos: TextosDeLaRespuesta = {
  noEstaEnLoLeido: es.chat.citas.noEstaEnLoLeido,
  cortadaPorInactividad: es.chat.cortadaPorInactividad,
  revision: {
    titulo: es.chat.revision.titulo,
    contradice: es.chat.revision.contradice,
    omite: es.chat.revision.omite,
    pagina: p => es.chat.revision.pagina.replace('{{pagina}}', p),
  },
}

interface Respuesta { texto: string; entrada?: number; salida?: number; finishReason?: string }

/** Como `callOllamaAPI` del store, sin la pantalla: streaming y el mismo `num_ctx`. */
async function llamarOllama(modelo: string, mensajes: ChatMessage[]): Promise<Respuesta> {
  const tope = AbortSignal.timeout(TOPE_OLLAMA_MS)
  const r = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.any([enVuelo.signal, tope]),
    body: JSON.stringify({
      model: modelo,
      messages: mensajes,
      stream: true,
      options: { num_ctx: await contextoDeOllama(OLLAMA, modelo) },
    }),
  })
  if (!r.ok || !r.body) throw new Error(`Ollama respondió ${r.status}`)
  const lector = r.body.getReader()
  const decodificador = new TextDecoder()
  let pendiente = ''
  const salida: Respuesta = { texto: '' }
  for (;;) {
    const { done, value } = await lector.read()
    if (done) break
    pendiente += decodificador.decode(value, { stream: true })
    let salto: number
    while ((salto = pendiente.indexOf('\n')) >= 0) {
      const linea = pendiente.slice(0, salto).trim()
      pendiente = pendiente.slice(salto + 1)
      if (!linea) continue
      const datos = JSON.parse(linea)
      if (datos.error) throw new Error(`Ollama: ${datos.error}`)
      salida.texto += datos.message?.content ?? ''
      if (datos.done) {
        salida.entrada = datos.prompt_eval_count
        salida.salida = datos.eval_count
        salida.finishReason = datos.done_reason
      }
    }
  }
  return salida
}

/** Como `sendNvidiaMessage` del handler: streaming, límite por inactividad y continuación por longitud. */
async function llamarNvidia(modelo: string, mensajes: ChatMessage[], clave: string, sinRazonar = false): Promise<Respuesta> {
  const historial: ChatMessage[] = [...mensajes]
  const partes: string[] = []
  let entrada = 0
  let salida = 0
  let fin: string | undefined
  for (let continuaciones = 0; ; continuaciones++) {
    const controlador = new AbortController()
    const tope = setTimeout(() => controlador.abort(new Error('NVIDIA: tope total agotado')), LIMITES_NVIDIA.totalMs)
    try {
      const r = await fetch(`${URL_NVIDIA}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clave}`, Accept: 'text/event-stream' },
        signal: AbortSignal.any([enVuelo.signal, controlador.signal]),
        body: JSON.stringify({
          model: modelo, messages: historial, stream: true, stream_options: { include_usage: true }, ...cuerpoNvidia(sinRazonar),
        }),
      })
      if (!r.ok) {
        const detalle = await r.json().then((d: any) => d.detail || d.title || '').catch(() => '')
        if (continuaciones > 0) break
        throw new Error(`NVIDIA respondió ${r.status}${detalle ? `: ${detalle}` : ''}`)
      }
      const datos = await leerRespuestaEnStreaming(r, controlador, LIMITES_NVIDIA.inactividadMs, `NVIDIA: ${LIMITES_NVIDIA.inactividadMs / 1000} s sin enviar nada`)
      entrada += datos.usage?.prompt_tokens ?? 0
      salida += datos.usage?.completion_tokens ?? 0
      const texto = datos.choices?.[0]?.message?.content ?? ''
      fin = datos.choices?.[0]?.finish_reason
      partes.push(texto)
      if (fin !== 'length' || continuaciones >= MAX_CONTINUACIONES) break
      historial.push({ role: 'assistant', content: texto }, { role: 'user', content: pedirContinuacion(texto) })
    } catch (error) {
      if (continuaciones === 0) throw error
      break
    } finally {
      clearTimeout(tope)
    }
  }
  return { texto: partes.reduce(unirContinuacion, ''), entrada, salida, finishReason: fin }
}

async function embeddingsOllama(textos: string[]): Promise<number[][]> {
  const r = await fetch(`${OLLAMA}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: enVuelo.signal,
    body: JSON.stringify({ model: modeloEmbeddingsOllama(), input: textos }),
  })
  if (!r.ok) throw new Error(`Ollama respondió ${r.status} a los embeddings`)
  return ((await r.json()) as { embeddings: number[][] }).embeddings
}

async function modelosDeOllama(): Promise<string[] | null> {
  try {
    const r = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(5000) })
    return ((await r.json()) as { models: Array<{ name: string }> }).models.map(m => m.name)
  } catch {
    return null
  }
}

/** Por qué no se puede ejecutar este modelo, o nada si se puede. No es un fallo. */
async function motivoParaNoEjecutar(modelo: string): Promise<string | undefined> {
  if (proveedorDe(modelo) === 'nvidia') {
    return process.env.NVIDIA_API_KEY ? undefined : 'falta NVIDIA_API_KEY en el entorno'
  }
  const disponibles = await modelosDeOllama()
  if (!disponibles) return `Ollama no responde en ${OLLAMA}`
  return disponibles.some(n => n === modelo || n === `${modelo}:latest`) ? undefined : `${modelo} no está en Ollama`
}

/** Hechos cuyo `enFuente` no aparece ni en el documento entero: el caso está mal escrito, no el modelo. */
export function hechosSinFuenteEnElDocumento(caso: CasoRAG, documento: string): string[] {
  return caso.hechos.filter(h => !h.fueraDelDocumento && !h.enFuente.every(c => cumple(documento, c))).map(h => h.id)
}

async function ejecutarRepeticion(
  n: number, caso: CasoRAG, modelo: string, documento: { nombre: string; texto: string }, vectores: VectoresDeAdjunto
): Promise<Repeticion> {
  const proveedor = proveedorDe(modelo)
  const clave = process.env.NVIDIA_API_KEY ?? ''
  const t0 = Date.now()
  const peticion = await componerPeticion({
    pregunta: caso.pregunta,
    idioma: 'es',
    modelo,
    proveedor,
    conversacion: [{ role: 'user', content: caso.pregunta, metadata: { adjunto: documento } }],
    // Sin proyecto el chat antepone siempre el contexto de «chat general».
    prompt: formatearContextoRed(null) + caso.pregunta,
    fuentes: [],
    bloqueConocimiento: '',
    busquedaFallida: false,
  }, {
    contextoDeOllama: m => contextoDeOllama(OLLAMA, m),
    similitudes: async (texto, consulta) => {
      try {
        const deLosFragmentos = await vectores.de(trocear(texto))
        const [deLaConsulta] = await embeddingsOllama([consulta])
        if (!deLosFragmentos.length || deLaConsulta.length !== deLosFragmentos[0].length) return undefined
        return deLosFragmentos.map(v => coseno(v, deLaConsulta))
      } catch {
        return undefined
      }
    },
    consultasEnElIdioma: a => consultasEnElIdiomaDelDocumento({ ...a, baseUrl: OLLAMA }),
  })
  const sistema: ChatMessage = { role: 'system', content: componerPromptDeSistema(null, { redaccion: { proveedor, modelo }, embeddings: null }) }
  const t1 = Date.now()
  const estimadosDelPrompt = estimarTokens(peticion.prompt)
  try {
    const respuesta = proveedor === 'Ollama'
      // Como `callOllamaAPI`: los diez últimos del historial y el prompt.
      ? await llamarOllama(modelo, [sistema, ...peticion.historial.slice(-10).map(m => ({ role: m.role, content: m.content })), { role: 'user', content: peticion.prompt }])
      : await llamarNvidia(modelo, [sistema, ...peticion.mensajes], clave)
    const t2 = Date.now()
    let revisionMs: number | undefined
    const final = await posprocesarRespuesta({
      pregunta: caso.pregunta,
      escrita: respuesta.texto,
      finishReason: respuesta.finishReason,
      fuentes: peticion.fuentes,
      paginasDelAdjunto: peticion.paginasDelAdjunto,
      leidoDelAdjunto: peticion.leidoDelAdjunto,
      idioma: 'es',
      hayAdjunto: true,
      conRevision: proveedor !== 'Ollama',
      textos,
    }, {
      pedirRevision: async prompt => {
        const inicio = Date.now()
        try {
          const r = await llamarNvidia(modelo, [sistema, { role: 'user', content: prompt }], clave, true)
          return { success: true, response: r.texto }
        } catch (error) {
          return { success: false, error: String(error) }
        } finally {
          revisionMs = Date.now() - inicio
        }
      },
    })
    const leido = [peticion.leidoDelAdjunto, ...peticion.fuentes.map((f: any) => f?.content ?? '')].join('\n')
    return {
      n,
      estado: 'respondida',
      respuesta: final.sinRevision,
      leido,
      puntuacion: puntuarRespuesta(caso, final.sinRevision, leido),
      tiempos: { componerMs: t1 - t0, modeloMs: t2 - t1, ...(revisionMs !== undefined ? { revisionMs } : {}), totalMs: Date.now() - t0 },
      tokens: { entrada: respuesta.entrada, salida: respuesta.salida, estimadosDelPrompt },
      adjunto: peticion.adjuntoUsado,
      revision: final.revision,
      finishReason: respuesta.finishReason,
    }
  } catch (error) {
    return {
      n,
      estado: 'error',
      error: error instanceof Error ? error.message : String(error),
      tiempos: { componerMs: t1 - t0, modeloMs: Date.now() - t1, totalMs: Date.now() - t0 },
      tokens: { estimadosDelPrompt },
      adjunto: peticion.adjuntoUsado,
    }
  }
}

/**
 * Sin modelo: que la fuente de cada hecho esté en el documento entero. Si no
 * está, el caso daría siempre «fallo de recuperación» por una expresión mal
 * escrita. Es lo primero que hay que correr al añadir o cambiar un caso.
 */
async function comprobarCasos(opciones: Opciones): Promise<number> {
  let mal = 0
  for (const caso of CASOS.filter(c => !opciones.casos || opciones.casos.includes(c.id))) {
    const ruta = opciones.documentos[caso.documento]
    if (!ruta) { decir(`${caso.id}: falta el documento «${caso.documento}»`); continue }
    const r = await extraerTextoDeFichero(ruta)
    if (r.problema) { decir(`${caso.id}: no se pudo leer ${ruta}: ${r.problema}`); continue }
    const sinFuente = hechosSinFuenteEnElDocumento(caso, r.texto)
    mal += sinFuente.length
    decir(`${caso.id}: ${sinFuente.length ? `sin fuente en el documento: ${sinFuente.join(', ')}` : 'todas las fuentes están en el documento'}`)
  }
  return mal ? 1 : 0
}

async function escribirInforme(base: string, informes: InformeDeModelo[], casos: CasoRAG[], avisos: string[]) {
  await fs.writeFile(`${base}.json`, JSON.stringify({ avisos, casos, informes }, null, 2))
  await fs.writeFile(`${base}.md`, informeMarkdown(informes, casos) + (avisos.length ? `\n## Avisos\n\n${avisos.map(a => `- ${a}`).join('\n')}\n` : ''))
}

/**
 * Vuelve a puntuar un informe con los casos de ahora, sin volver a preguntar.
 * Al revisar una referencia con Luis cambian las expresiones, no las
 * respuestas: no hace falta otra hora de modelo ni otro gasto de crédito.
 */
export function repuntuar(informes: InformeDeModelo[], casos: CasoRAG[] = CASOS): InformeDeModelo[] {
  return informes.map(i => informeDeModelo(i.modelo, i.proveedor, i.repeticiones, i.casos.map(c => {
    const caso = casos.find(x => x.id === c.id)
    if (!caso || c.estado === 'no-ejecutado') return c
    return cerrarCaso(c.id, c.repeticiones.map(r =>
      r.estado === 'respondida' && r.leido !== undefined ? { ...r, puntuacion: puntuarRespuesta(caso, r.respuesta ?? '', r.leido) } : r))
  }), i.fecha))
}

const AYUDA = `Uso: npm run eval:rag -- --modelo <id>[,<id>…] [--repeticiones N] [--casos a,b] [--documento clave=ruta] [--salida carpeta]

  --modelo        Modelo de Ollama (qwen2.5:7b) o de NVIDIA (nvidia/…); «nvidia» es el principal de la pareja.
  --repeticiones  Veces que se pregunta cada caso (1 por defecto).
  --casos         Sólo estos casos, por id.
  --documento     Ruta de un documento; también con ${Object.values(DOCUMENTOS).map(d => d.variable).join(', ')}.
  --salida        Carpeta del informe (.eval-rag/ por defecto, ignorada por git).
  --comprobar-casos  Sin modelo: comprueba que la fuente de cada hecho está en el documento.
  --repuntuar f.json Sin modelo: vuelve a puntuar un informe con los casos de ahora.

Casos: ${CASOS.map(c => c.id).join(', ')}`

export async function main(argv: string[]): Promise<number> {
  const opciones = leerArgumentos(argv)
  if (argv.includes('--comprobar-casos')) return comprobarCasos(opciones)
  const aRepuntuar = argv[argv.indexOf('--repuntuar') + 1]
  if (argv.includes('--repuntuar') && aRepuntuar) {
    const { informes, avisos } = JSON.parse(await fs.readFile(aRepuntuar, 'utf8')) as { informes: InformeDeModelo[]; avisos?: string[] }
    const ids = new Set(informes.flatMap(i => i.casos.map(c => c.id)))
    const base = aRepuntuar.replace(/\.json$/, '') + '-repuntuado'
    await escribirInforme(base, repuntuar(informes), CASOS.filter(c => ids.has(c.id)), avisos ?? [])
    decir(`Informe: ${base}.md`)
    return 0
  }
  if (!opciones.modelos.length || argv.includes('--ayuda') || argv.includes('--help')) {
    decir(AYUDA)
    return opciones.modelos.length ? 0 : 2
  }
  const casos = opciones.casos ? CASOS.filter(c => opciones.casos!.includes(c.id)) : CASOS
  if (opciones.casos && casos.length !== opciones.casos.length) {
    decir(`Casos desconocidos: ${opciones.casos.filter(id => !CASOS.some(c => c.id === id)).join(', ')}`)
    return 2
  }

  const parar = () => { enVuelo.abort(); decir('\nInterrumpido: se guarda lo que haya.') }
  process.once('SIGINT', parar)

  await fs.mkdir(opciones.salida, { recursive: true })
  const sello = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const base = path.join(opciones.salida, `rag-${sello}`)
  const vectores = new VectoresDeAdjunto(embeddingsOllama, modeloEmbeddingsOllama, path.join(opciones.salida, 'vectores'))
  const documentos = new Map<string, { nombre: string; texto: string } | string>()
  const avisos: string[] = []

  /** El documento leído como lo lee la app, o el motivo por el que no se puede. */
  const documento = async (clave: string) => {
    if (documentos.has(clave)) return documentos.get(clave)!
    const ruta = opciones.documentos[clave]
    let leido: { nombre: string; texto: string } | string
    if (!ruta) {
      leido = `falta el documento «${clave}» (${DOCUMENTOS[clave]?.variable ?? '--documento'})`
    } else {
      const r = await extraerTextoDeFichero(ruta)
      leido = r.problema ? `no se pudo leer ${ruta}: ${r.problema}` : { nombre: path.basename(ruta), texto: r.texto }
    }
    documentos.set(clave, leido)
    return leido
  }

  const informes: InformeDeModelo[] = []
  const ponerInforme = (i: InformeDeModelo) => {
    const ya = informes.findIndex(x => x.modelo === i.modelo)
    if (ya >= 0) informes[ya] = i
    else informes.push(i)
  }
  const guardar = () => escribirInforme(base, informes, casos, avisos)

  try {
    for (const modelo of opciones.modelos) {
      const proveedor = proveedorDe(modelo)
      const noSePuede = await motivoParaNoEjecutar(modelo)
      const resultados: ResultadoDeCaso[] = []
      decir(`\n== ${modelo} (${proveedor})${noSePuede ? `: no se ejecuta, ${noSePuede}` : ''}`)
      for (const caso of casos) {
        if (enVuelo.signal.aborted) break
        const doc = noSePuede ? noSePuede : await documento(caso.documento)
        if (typeof doc === 'string') {
          resultados.push({ id: caso.id, estado: 'no-ejecutado', motivo: doc, repeticiones: [] })
          decir(`  ${caso.id}: no ejecutado (${doc})`)
          continue
        }
        const sinFuente = hechosSinFuenteEnElDocumento(caso, doc.texto)
        const aviso = `${caso.id}: el documento entero no contiene la fuente de ${sinFuente.join(', ')}`
        if (sinFuente.length && !avisos.includes(aviso)) avisos.push(aviso)
        const repeticiones: Repeticion[] = []
        for (let n = 1; n <= opciones.repeticiones && !enVuelo.signal.aborted; n++) {
          const r = await ejecutarRepeticion(n, caso, modelo, doc, vectores)
          repeticiones.push(r)
          decir(r.estado === 'error'
            ? `  ${caso.id} #${n}: error (${r.error})`
            : `  ${caso.id} #${n}: ${r.puntuacion!.aciertos}/${r.puntuacion!.total} en ${Math.round(r.tiempos.totalMs / 1000)} s${r.puntuacion!.prohibidos.length ? `, dice lo prohibido: ${r.puntuacion!.prohibidos.join(', ')}` : ''}`)
        }
        resultados.push(cerrarCaso(caso.id, repeticiones))
        // Tras cada caso: si la corrida muere a medias, lo hecho queda escrito.
        ponerInforme(informeDeModelo(modelo, proveedor, opciones.repeticiones, [...resultados]))
        await guardar()
      }
      ponerInforme(informeDeModelo(modelo, proveedor, opciones.repeticiones, resultados))
      await guardar()
    }
  } finally {
    enVuelo.abort()
    process.off('SIGINT', parar)
  }

  decir(`\nInforme: ${base}.md\nDatos:   ${base}.json`)
  return 0
}
