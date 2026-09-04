import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { execFileSync } from 'child_process'
import { randomUUID } from 'crypto'
import { getPythonStatus } from '../pythonDetector'
import { ejecutarHerramienta, HERRAMIENTAS, type ContextoHerramientas, type RedCompleta } from '../agentTools'
import { WNTRResilienceService } from '../resilienceService'
import { comprobarCaso, marcador, valorEnRuta } from './bateria'
import { CASOS } from './casos'

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..')
const DB = path.join(REPO_ROOT, 'prisma', 'hydraulic.db')

/**
 * Las redes viven en SQLite, no en disco, igual que en `agentTools.test.ts`.
 *
 * **La lectura va dentro del `it`, no en el cuerpo del `describe`.** `skipIf`
 * sólo marca saltados los tests: el cuerpo del bloque se ejecuta igual, para
 * recolectarlos. Leyendo ahí, en un runner sin base —el CI— se ejecutaba el
 * `sqlite3.connect`, que **crea el fichero vacío**, y la consulta moría con «no
 * such table» durante la recolección: el fichero entero contaba como fallado en
 * vez de saltarse. Y de paso dejaba una `hydraulic.db` de cero bytes en el
 * repositorio, que hace que el `existsSync` de los otros tests mienta.
 */
interface RedGuardada { datos: RedCompleta; inp: string }

const leerDeLaBase = (): Map<string, RedGuardada> => {
  const salida = execFileSync('python3', ['-c', `
import sqlite3, json, sys
c = sqlite3.connect(${JSON.stringify(DB)})
filas = [{'nombre': n, 'datos': json.loads(d), 'inp': i}
         for n, d, i in c.execute('select name, networkData, fileContent from hydraulic_networks')]
json.dump(filas, sys.stdout)
`], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
  const m = new Map<string, RedGuardada>()
  for (const f of JSON.parse(salida) as Array<{ nombre: string; datos: RedCompleta; inp: string }>) {
    if (!m.has(f.nombre)) m.set(f.nombre, { datos: f.datos, inp: f.inp })
  }
  return m
}

/**
 * El contexto con el **motor de verdad** detrás.
 *
 * Podría inyectarse un doble y la batería correría en cualquier sitio, pero
 * entonces mediría que la herramienta llama bien a algo, no que la cifra que
 * llega al agente es la del motor. Que es justo lo que hay que medir, así que
 * el bloque se salta donde no haya Python con WNTR en lugar de fingirlo.
 */
const contexto = (red: RedGuardada): ContextoHerramientas => ({
  red: red.datos,
  motores: {
    curvaFragilidad: async (opciones) => {
      // Uno por llamada: los casos se resuelven en paralelo, y con un nombre
      // compartido una llamada borraba el .inp que otra estaba leyendo. Salia
      // sólo con la suite entera, que es la peor forma de salir.
      const ruta = path.join(os.tmpdir(), `boorie-bateria-${randomUUID()}.inp`)
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

describe('la batería está bien formada', () => {
  it('no repite identificadores', () => {
    const ids = CASOS.map(c => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('cada caso dice de dónde sale su valor esperado', () => {
    // Sin procedencia, un número aquí es una creencia con aspecto de prueba.
    for (const c of CASOS) expect(c.origen, c.id).toMatch(/\S/)
  })

  it('los casos pendientes nombran herramientas que de verdad no existen', () => {
    const declaradas = new Set(HERRAMIENTAS.map(h => h.nombre))
    for (const c of CASOS) {
      // Si una pendiente ya existe, el caso hay que activarlo: quedarse
      // pendiente por inercia es perder la comprobación sin enterarse.
      expect(declaradas.has(c.herramienta), `${c.id} (${c.herramienta})`).toBe(!c.pendiente)
    }
  })
})

describe('comprobarCaso', () => {
  const caso = CASOS[0]

  it('acierta con el resultado bueno y falla señalando el campo', () => {
    const bueno = {
      encontrado: true,
      elemento: { tipo: 'junction', cota_m: 12.8016, demanda_base_litros_por_segundo: 11.984 },
      tramos_conectados: [{ id: '101' }],
    }
    expect(comprobarCaso(caso, bueno).estado).toBe('acierta')

    const malo = { ...bueno, elemento: { ...bueno.elemento, cota_m: 30 } }
    const r = comprobarCaso(caso, malo)
    expect(r.estado).toBe('falla')
    expect(r.fallos.map(f => f.ruta)).toEqual(['elemento.cota_m'])
    expect(r.fallos[0].obtenido).toBe(30)
  })

  it('la tolerancia es absoluta, en la unidad del campo', () => {
    expect(valorEnRuta({ a: [{ b: 2 }] }, 'a.0.b')).toBe(2)
    const dentro = comprobarCaso(
      { ...caso, espera: [{ ruta: 'x', valor: 10, tolerancia: 0.5 }] }, { x: 10.4 })
    const fuera = comprobarCaso(
      { ...caso, espera: [{ ruta: 'x', valor: 10, tolerancia: 0.5 }] }, { x: 10.6 })
    expect(dentro.estado).toBe('acierta')
    expect(fuera.estado).toBe('falla')
  })
})

// El motor de fragilidad corre en Python: sin él, la batería no puede medir lo
// que dice medir, así que se salta entera en vez de medir a medias.
const puedeCorrer = fs.existsSync(DB) && getPythonStatus().wntrAvailable

describe.skipIf(!puedeCorrer)('la batería contra las herramientas reales', { timeout: 120_000 }, () => {
  let cache: Map<string, RedGuardada> | null = null
  const leerRedes = () => (cache ??= leerDeLaBase())

  it('todos los casos ejecutables aciertan', async () => {
    const redes = leerRedes()
    const resultados = await Promise.all(CASOS.map(async caso => {
      if (caso.pendiente) return comprobarCaso(caso, null)
      const red = redes.get(caso.red)
      // Una red que falte no puede pasar por acierto silencioso.
      expect(red, `falta la red ${caso.red} en la base`).toBeTruthy()
      return comprobarCaso(caso, await ejecutarHerramienta(caso.herramienta, caso.argumentos, contexto(red!)))
    }))

    const fallan = resultados.filter(r => r.estado === 'falla')
    expect(fallan.map(f => `${f.id}: ${f.fallos.map(x =>
      `${x.ruta} esperaba ${JSON.stringify(x.esperado)} y dio ${JSON.stringify(x.obtenido)}`).join('; ')}`))
      .toEqual([])

    const m = marcador(resultados)
    expect(m.aciertan + m.pendientes).toBe(m.total)
    console.log(`batería del agente: ${m.aciertan}/${m.aciertan + m.fallan} (${m.porcentaje} %) · ${m.pendientes} pendientes de la fase 1`)
  })
})
