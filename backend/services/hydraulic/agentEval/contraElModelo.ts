/**
 * Lo que hace falta para medir **contra un modelo de verdad** (#119, fases 4 y 5).
 *
 * Vive fuera de los dos `.test.ts` que lo usan porque las dos medidas son dos
 * corridas distintas y hay que poder tomar una sin pagar la otra: juntas son
 * cuarenta minutos, y la segunda hacía cola detrás de la primera.
 *
 *     BOORIE_EVAL_MODELO=llama3.1:8b npx vitest run backend/services/hydraulic/agentEval/modelo.test.ts
 *     BOORIE_EVAL_MODELO=llama3.1:8b npx vitest run backend/services/hydraulic/agentEval/disciplinaDelModelo.test.ts
 *
 * Sin la variable se saltan las dos. Con ella y sin modelo accesible, también:
 * medir a medias da un número peor que no tener número.
 */
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { execFileSync } from 'child_process'
import { randomUUID } from 'crypto'
import {
  ejecutarHerramienta,
  HERRAMIENTAS,
  type ContextoHerramientas,
  type RedCompleta,
} from '../agentTools'
import {
  herramientasOpenAI,
  llamadasDesdeOllama,
  mensajesResultadosOpenAI,
} from '../../ai/toolWire'
import { getPythonStatus } from '../pythonDetector'
import { WNTRResilienceService } from '../resilienceService'
import { componerPromptDeSistema } from '../promptDelAgente'
import { construirResumenRed, formatearContextoRed } from '../networkContext'

export const MODELO = process.env.BOORIE_EVAL_MODELO
const OLLAMA = process.env.BOORIE_EVAL_OLLAMA ?? 'http://127.0.0.1:11434'
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..')
const DB = path.join(REPO_ROOT, 'prisma', 'hydraulic.db')

export interface RedGuardada { datos: RedCompleta; contadores: any; inp: string }

/**
 * Sólo las redes que los casos nombran.
 *
 * Se cargaban las ocho guardadas, con su `networkData` y su `.inp` parseados en
 * memoria, y la batería usa dos. Una de las que no usa pesa 2 MB. Importa
 * porque la medida corre al lado de un modelo de 8B que ocupa 7 GB: la corrida
 * de la fase 5 se la llevó el matarratas de memoria en el caso 10 de 12.
 */
export const leerRedes = (nombres: string[]): Map<string, RedGuardada> => {
  const huecos = nombres.map(() => '?').join(',')
  const salida = execFileSync('python3', ['-c', `
import sqlite3, json, sys
c = sqlite3.connect(${JSON.stringify(DB)})
filas = [{'nombre': n, 'datos': json.loads(d), 'contadores': json.loads(s or '{}'), 'inp': i}
         for n, d, s, i in c.execute(
             'select name, networkData, summary, fileContent from hydraulic_networks where name in (${huecos})',
             sys.argv[1:])]
json.dump(filas, sys.stdout)
`, ...nombres], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  const m = new Map<string, RedGuardada>()
  for (const f of JSON.parse(salida)) if (!m.has(f.nombre)) m.set(f.nombre, f)
  return m
}

/** El mismo contexto que usa `bateria.test.ts`: el motor de verdad, no un doble. */
const contexto = (red: RedGuardada): ContextoHerramientas => ({
  red: red.datos,
  motores: {
    curvaFragilidad: async (opciones) => {
      const ruta = path.join(os.tmpdir(), `boorie-disciplina-${randomUUID()}.inp`)
      await fs.promises.writeFile(ruta, red.inp, 'utf8')
      try {
        const r = await new WNTRResilienceService().generateFragilityCurve(ruta, opciones as never)
        return r.success && r.data
          ? (r.data as unknown as Record<string, unknown>)
          : { error: r.error ?? 'sin resultados' }
      } finally {
        await fs.promises.unlink(ruta).catch(() => {})
      }
    },
  },
})

/** Lo mismo que arma el handler: sistema, resumen de la red y la pregunta. */
function mensajesIniciales(pregunta: string, red: RedGuardada, nombreRed: string) {
  const resumen = construirResumenRed({
    nombreRed, contadores: red.contadores, datos: red.datos as any,
  } as any)

  return [
    { role: 'system', content: componerPromptDeSistema() },
    { role: 'user', content: `${formatearContextoRed(resumen, true)}\n\n${pregunta}` },
  ] as any[]
}

/**
 * Todas las peticiones de una corrida, para poder cortarlas de golpe.
 *
 * Sin esto, una medida que muere —por tiempo, o porque el matarratas de memoria
 * de Linux se lleva el proceso— deja la petición en vuelo, y Ollama la sigue
 * generando para un cliente que ya no existe: mantiene el modelo fijado en
 * memoria, no lo suelta ni con `ollama stop`, y encola las siguientes. Tomando
 * la fase 5 se llegó a tener un `llama-server` con 7,4 GB y 351 % de CPU
 * escribiendo para nadie, y la única salida fue reiniciar el servicio.
 */
const enVuelo = new AbortController()

/** Corta lo que quede pidiéndose. Se llama al acabar la medida, pase lo que pase. */
export const cortarPeticiones = () => enVuelo.abort()

async function pedirA(mensajes: any[], conHerramientas: boolean) {
  const respuesta = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST',
    signal: enVuelo.signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODELO,
      stream: false,
      // Sin temperatura la medida no se repite dos veces igual, y una batería
      // que da un número distinto cada vez no sirve para ver si se mejora.
      options: { temperature: 0 },
      ...(conHerramientas ? { tools: herramientasOpenAI(HERRAMIENTAS) } : {}),
      messages: mensajes,
    }),
  })
  if (!respuesta.ok) throw new Error(`Ollama respondió ${respuesta.status}`)
  return respuesta.json() as any
}

export async function preguntar(pregunta: string, red: RedGuardada, nombreRed: string) {
  return llamadasDesdeOllama(await pedirA(mensajesIniciales(pregunta, red, nombreRed), true))
}

/**
 * La conversación entera, hasta el texto escrito.
 *
 * Mide otra cosa que `preguntar`: la disciplina no se lee de una llamada a
 * herramienta sino de la prosa, y para que haya prosa hay que devolverle el
 * resultado de la herramienta y dejarle escribir. Es el mismo bucle que
 * `chat.handler.ts` corre en producción —resultado por mensaje `role: 'tool'`,
 * con tope de vueltas— para no medir un camino que nadie recorre.
 */
const MAX_VUELTAS = 3

export async function conversar(caso: { pregunta: string }, red: RedGuardada, nombreRed: string) {
  const mensajes = mensajesIniciales(caso.pregunta, red, nombreRed)
  const usadas: string[] = []

  for (let vuelta = 0; vuelta <= MAX_VUELTAS; vuelta++) {
    const data = await pedirA(mensajes, vuelta < MAX_VUELTAS)
    const llamadas = vuelta < MAX_VUELTAS ? llamadasDesdeOllama(data) : []

    if (!llamadas.length) {
      return { texto: String(data?.message?.content ?? '').trim(), usadas }
    }

    mensajes.push(data.message)
    const resultados = []
    for (const llamada of llamadas) {
      usadas.push(llamada.nombre)
      // El error se le devuelve tal cual, que es lo que hace el handler: cómo
      // escribe el agente cuando una herramienta falla también es disciplina.
      const salida = await ejecutarHerramienta(llamada.nombre, llamada.argumentos, contexto(red))
        .catch((e: Error) => ({ error: e.message }))
      resultados.push({ llamada, salida })
    }
    mensajes.push(...mensajesResultadosOpenAI(resultados))
  }

  return { texto: '', usadas }
}

export const puedeCorrer = !!MODELO && fs.existsSync(DB)

/**
 * La disciplina se mide sobre la prosa, y para escribirla el agente necesita el
 * resultado de la herramienta. El de fragilidad sale de WNTR: sin Python, los
 * casos que lo usan le devolverían un error y se estaría midiendo cómo escribe
 * un fallo, no cómo escribe una cifra. Así que se salta.
 */
export const puedeMedirDisciplina = puedeCorrer && getPythonStatus().wntrAvailable

/**
 * Un salto tiene que decir por qué.
 *
 * Sin la variable, saltarse es lo normal y no hace falta anunciarlo. Pero con
 * la variable puesta, quien la puso está pidiendo una medida: si no se toma,
 * enterarse por un «1 skipped» no basta. Pasó midiendo la fase 5 —la detección
 * de Python arranca un intérprete, con la máquina saturada se cayó, y el bloque
 * se saltó igual que si WNTR no estuviera instalado—.
 */
if (MODELO && !puedeCorrer) {
  console.warn(`[eval] BOORIE_EVAL_MODELO=${MODELO}, pero no hay base de datos en ${DB}: no se mide.`)
} else if (MODELO && !puedeMedirDisciplina) {
  console.warn('[eval] hay modelo y base, pero no WNTR: se puede medir qué elige y no lo que escribe.')
}
