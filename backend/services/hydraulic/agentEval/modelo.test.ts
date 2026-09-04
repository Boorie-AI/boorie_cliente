import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { execFileSync } from 'child_process'
import { HERRAMIENTAS, type RedCompleta } from '../agentTools'
import { herramientasOpenAI, llamadasDesdeOllama } from '../../ai/toolWire'
import { componerPromptDeSistema } from '../promptDelAgente'
import { construirResumenRed, formatearContextoRed } from '../networkContext'
import { comprobarLlamadaDelModelo, marcadorDelModelo } from './bateria'
import { CASOS } from './casos'

/**
 * La otra mitad de la batería (#119, fase 4): **que el modelo elija bien**.
 *
 * Lo que corre en cada suite mide que la herramienta acierta, que es
 * determinista y no necesita modelo. Esto mide lo otro, y no puede correr en
 * cada suite: son una docena de llamadas a un modelo, tardan minutos y su
 * resultado depende del modelo que haya delante. Así que va detrás de una
 * variable de entorno, como la e2e de indexación:
 *
 *     BOORIE_EVAL_MODELO=llama3.1:8b npx vitest run backend/services/hydraulic/agentEval/modelo.test.ts
 *
 * Sin la variable se salta. Con ella y sin Ollama, también: medir a medias
 * daría un número peor que no tener número.
 */
const MODELO = process.env.BOORIE_EVAL_MODELO
const OLLAMA = process.env.BOORIE_EVAL_OLLAMA ?? 'http://127.0.0.1:11434'
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..')
const DB = path.join(REPO_ROOT, 'prisma', 'hydraulic.db')

const leerRedes = (): Map<string, { datos: RedCompleta; contadores: any }> => {
  const salida = execFileSync('python3', ['-c', `
import sqlite3, json, sys
c = sqlite3.connect(${JSON.stringify(DB)})
filas = [{'nombre': n, 'datos': json.loads(d), 'contadores': json.loads(s or '{}')}
         for n, d, s in c.execute('select name, networkData, summary from hydraulic_networks')]
json.dump(filas, sys.stdout)
`], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
  const m = new Map()
  for (const f of JSON.parse(salida)) if (!m.has(f.nombre)) m.set(f.nombre, f)
  return m
}

/** Lo mismo que arma el handler: sistema, resumen de la red y la pregunta. */
async function preguntar(pregunta: string, red: { datos: RedCompleta; contadores: any }, nombreRed: string) {
  const resumen = construirResumenRed({
    nombreRed, contadores: red.contadores, datos: red.datos as any,
  } as any)

  const respuesta = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODELO,
      stream: false,
      // Sin temperatura la medida no se repite dos veces igual, y una batería
      // que da un número distinto cada vez no sirve para ver si se mejora.
      options: { temperature: 0 },
      tools: herramientasOpenAI(HERRAMIENTAS),
      messages: [
        { role: 'system', content: componerPromptDeSistema() },
        { role: 'user', content: `${formatearContextoRed(resumen, true)}\n\n${pregunta}` },
      ],
    }),
  })
  if (!respuesta.ok) throw new Error(`Ollama respondió ${respuesta.status}`)
  return llamadasDesdeOllama(await respuesta.json())
}

const puedeCorrer = !!MODELO && fs.existsSync(DB)

describe.skipIf(!puedeCorrer)(`la batería contra el modelo (${MODELO ?? 'sin modelo'})`, () => {
  it('elige la herramienta que resuelve cada pregunta', { timeout: 900_000 }, async () => {
    const redes = leerRedes()
    const resultados = []

    // En serie y no en paralelo: doce peticiones a la vez a un modelo local se
    // pisan y el resultado mide la máquina, no al agente.
    for (const caso of CASOS.filter(c => !c.pendiente)) {
      const red = redes.get(caso.red)
      expect(red, `falta la red ${caso.red}`).toBeTruthy()
      const llamadas = await preguntar(caso.pregunta, red!, caso.red)
      resultados.push(comprobarLlamadaDelModelo(caso, llamadas))
    }

    const m = marcadorDelModelo(resultados)
    console.log(`\nmodelo ${MODELO}: ${m.herramientaOk}/${m.total} herramientas (${m.porcentajeHerramienta} %), ${m.argumentosOk}/${m.total} con argumentos`)
    for (const r of resultados.filter(r => r.fallos.length)) {
      console.log(`  · ${r.id}: ${r.fallos.join('; ')}`)
    }

    // No se exige el pleno: el listón lo pone el modelo que tenga delante quien
    // use Boorie, y con uno pequeño no va a ser 12 de 12. Lo que se comprueba
    // es que la medida se puede tomar y que no se ha desplomado a cero, que es
    // lo que pasaría si el catálogo dejara de llegar al proveedor.
    expect(m.herramientaOk).toBeGreaterThan(0)
  })
})
