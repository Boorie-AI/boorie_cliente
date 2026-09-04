import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { execFileSync } from 'child_process'
import { ejecutarHerramienta, HERRAMIENTAS, type RedCompleta } from '../agentTools'
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
const leerDeLaBase = (): Map<string, RedCompleta> => {
  const salida = execFileSync('python3', ['-c', `
import sqlite3, json, sys
c = sqlite3.connect(${JSON.stringify(DB)})
filas = [{'nombre': n, 'datos': json.loads(d)} for n, d in c.execute('select name, networkData from hydraulic_networks')]
json.dump(filas, sys.stdout)
`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  const m = new Map<string, RedCompleta>()
  for (const f of JSON.parse(salida) as Array<{ nombre: string; datos: RedCompleta }>) {
    if (!m.has(f.nombre)) m.set(f.nombre, f.datos)
  }
  return m
}

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

describe.skipIf(!fs.existsSync(DB))('la batería contra las herramientas reales', { timeout: 60_000 }, () => {
  let cache: Map<string, RedCompleta> | null = null
  const leerRedes = () => (cache ??= leerDeLaBase())

  it('todos los casos ejecutables aciertan', () => {
    const redes = leerRedes()
    const resultados = CASOS.map(caso => {
      if (caso.pendiente) return comprobarCaso(caso, null)
      const red = redes.get(caso.red)
      // Una red que falte no puede pasar por acierto silencioso.
      expect(red, `falta la red ${caso.red} en la base`).toBeTruthy()
      return comprobarCaso(caso, ejecutarHerramienta(caso.herramienta, caso.argumentos, red!))
    })

    const fallan = resultados.filter(r => r.estado === 'falla')
    expect(fallan.map(f => `${f.id}: ${f.fallos.map(x =>
      `${x.ruta} esperaba ${JSON.stringify(x.esperado)} y dio ${JSON.stringify(x.obtenido)}`).join('; ')}`))
      .toEqual([])

    const m = marcador(resultados)
    expect(m.aciertan + m.pendientes).toBe(m.total)
    console.log(`batería del agente: ${m.aciertan}/${m.aciertan + m.fallan} (${m.porcentaje} %) · ${m.pendientes} pendientes de la fase 1`)
  })
})
