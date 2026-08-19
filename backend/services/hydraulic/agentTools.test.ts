import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { execFileSync } from 'child_process'
import { HERRAMIENTAS, ejecutarHerramienta, type RedCompleta } from './agentTools'

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..')
const DB = path.join(REPO_ROOT, 'prisma', 'hydraulic.db')

const RED: RedCompleta = {
  nodes: [
    { id: 'J1', type: 'junction', elevation: 10, demand: 0.000231, pattern: 'P1', x: -71.29, y: 42.34 },
    { id: 'J2', type: 'junction', elevation: 12, demand: 0.000462 },
    { id: 'J3', type: 'junction', elevation: 8, demand: 0.000115 },
    { id: 'R1', type: 'reservoir', total_head: 0 },
    { id: 'T1', type: 'tank', elevation: 15, init_level: 2, min_level: 0.5, max_level: 3.5, diameter: 4 },
  ],
  links: [
    { id: 'P1', type: 'pipe', from: 'R1', to: 'J1', length: 200, diameter: 0.075, roughness: 100, status: 'Open' },
    { id: 'P2', type: 'pipe', from: 'J1', to: 'J2', length: 150, diameter: 0.05, roughness: 100, status: 'Open' },
    { id: 'P3', type: 'pipe', from: 'J2', to: 'J3', length: 400, diameter: 0.1, roughness: 100, status: 'Open' },
    { id: 'B1', type: 'pump', from: 'T1', to: 'J3', pump_type: 'HEAD', pump_curve: '1', speed: 1, status: 'Closed' },
  ],
}

describe('definiciones de las herramientas', () => {
  it('declaran esquema de objeto con los obligatorios marcados', () => {
    // Los tres dialectos (Anthropic, OpenAI, Google) exigen JSON Schema de tipo
    // objeto; un esquema mal formado lo rechaza la API, no el test.
    for (const h of HERRAMIENTAS) {
      expect(h.esquema.type, h.nombre).toBe('object')
      expect(Object.keys(h.esquema.properties).length, h.nombre).toBeGreaterThan(0)
      for (const obligatorio of h.esquema.required ?? []) {
        expect(h.esquema.properties, h.nombre).toHaveProperty(obligatorio)
      }
    }
  })
})

describe('consultar_elemento', () => {
  it('devuelve el nudo con los tramos que llegan a el', () => {
    const r = ejecutarHerramienta('consultar_elemento', { id: 'J1' }, RED) as any
    expect(r.encontrado).toBe(true)
    expect(r.elemento.id).toBe('J1')
    expect(r.elemento.cota_m).toBe(10)
    expect(r.tramos_conectados.map((t: any) => t.id).sort()).toEqual(['P1', 'P2'])
  })

  it('devuelve el tramo con sus dos nudos extremos', () => {
    const r = ejecutarHerramienta('consultar_elemento', { id: 'P2' }, RED) as any
    expect(r.encontrado).toBe(true)
    expect(r.elemento.desde).toBe('J1')
    expect(r.elemento.hasta).toBe('J2')
    expect(r.nudos_extremos.map((n: any) => n.id)).toEqual(['J1', 'J2'])
  })

  it('entrega diametros en mm y demandas en L/s, no en unidades de WNTR', () => {
    // WNTR normaliza a SI: 0.075 m y 0.000231 m3/s. Son numeros que el modelo
    // lee mal o redondea a cero, asi que la conversion se hace aqui.
    const nudo = ejecutarHerramienta('consultar_elemento', { id: 'J1' }, RED) as any
    expect(nudo.elemento.demanda_base_litros_por_segundo).toBe(0.231)
    const tramo = ejecutarHerramienta('consultar_elemento', { id: 'P1' }, RED) as any
    expect(tramo.elemento.diametro_mm).toBe(75)
    expect(tramo.elemento.longitud_m).toBe(200)
  })

  it('acepta el id en minusculas', () => {
    // Los modelos escriben «j3» donde el .inp pone «J3».
    const r = ejecutarHerramienta('consultar_elemento', { id: 'j3' }, RED) as any
    expect(r.encontrado).toBe(true)
    expect(r.elemento.id).toBe('J3')
  })

  it('con un id inexistente lo dice y ofrece candidatos, en vez de callar', () => {
    // El modelo necesita con que decir «ese nudo no esta en tu red». Un error
    // seco invita justo a lo que #34 quiere evitar: rellenar el hueco.
    const r = ejecutarHerramienta('consultar_elemento', { id: 'J99' }, RED) as any
    expect(r.encontrado).toBe(false)
    expect(r.error).toContain('J99')
    expect(r.ids_parecidos.length).toBeGreaterThan(0)
  })

  it('sin id devuelve error en lugar de un resultado vacio', () => {
    const r = ejecutarHerramienta('consultar_elemento', {}, RED) as any
    expect(r.error).toContain('id')
  })

  it('describe la bomba con sus campos propios', () => {
    const r = ejecutarHerramienta('consultar_elemento', { id: 'B1' }, RED) as any
    expect(r.elemento.tipo).toBe('pump')
    expect(r.elemento.tipo_bomba).toBe('HEAD')
    expect(r.elemento.estado).toBe('Closed')
    expect(r.elemento.longitud_m).toBeUndefined()
  })
})

describe('listar_elementos', () => {
  it('cuenta y devuelve los elementos de un tipo', () => {
    const r = ejecutarHerramienta('listar_elementos', { tipo: 'junction' }, RED) as any
    expect(r.total).toBe(3)
    expect(r.elementos).toHaveLength(3)
  })

  it('ordena de mayor a menor por defecto', () => {
    const r = ejecutarHerramienta('listar_elementos', { tipo: 'pipe', ordenar_por: 'length' }, RED) as any
    expect(r.elementos.map((e: any) => e.id)).toEqual(['P3', 'P1', 'P2'])
  })

  it('ordena al reves cuando se pide', () => {
    const r = ejecutarHerramienta(
      'listar_elementos',
      { tipo: 'pipe', ordenar_por: 'length', descendente: false },
      RED
    ) as any
    expect(r.elementos.map((e: any) => e.id)).toEqual(['P2', 'P1', 'P3'])
  })

  it('avisa cuando recorta, para que no presente una parte como el todo', () => {
    // Sin el aviso, el modelo ensena dos tuberias como si fueran las tres.
    const r = ejecutarHerramienta('listar_elementos', { tipo: 'pipe', limite: 2 }, RED) as any
    expect(r.devueltos).toBe(2)
    expect(r.total).toBe(3)
    expect(r.aviso).toContain('2 de 3')
  })

  it('no deja pedir mas de 50 elementos aunque se pidan', () => {
    const muchos: RedCompleta = {
      nodes: Array.from({ length: 200 }, (_, i) => ({ id: `J${i}`, type: 'junction', demand: i / 1000 })),
      links: [],
    }
    const r = ejecutarHerramienta('listar_elementos', { tipo: 'junction', limite: 500 }, muchos) as any
    expect(r.devueltos).toBe(50)
    expect(r.total).toBe(200)
  })

  it('rechaza ordenar nudos por una magnitud de tramo', () => {
    const r = ejecutarHerramienta('listar_elementos', { tipo: 'junction', ordenar_por: 'length' }, RED) as any
    expect(r.error).toContain('length')
  })

  it('rechaza un tipo que no existe', () => {
    const r = ejecutarHerramienta('listar_elementos', { tipo: 'hidrante' }, RED) as any
    expect(r.error).toContain('hidrante')
  })
})

it('una herramienta desconocida se responde con error, no lanza', () => {
  // El error viaja al modelo como resultado: puede rectificar o explicarlo.
  const r = ejecutarHerramienta('borrar_red', {}, RED) as any
  expect(r.error).toContain('borrar_red')
})

/**
 * Contraste con las redes guardadas: `Net3 2.inp` tiene 92 nudos y 117 tramos,
 * que es el caso que justifica las herramientas (no cabe en el resumen).
 */
describe.skipIf(!fs.existsSync(DB))('contraste con las redes guardadas', () => {
  const leerRedes = (): Array<{ nombre: string; datos: RedCompleta }> => {
    const salida = execFileSync('python3', ['-c', `
import sqlite3, json, sys
c = sqlite3.connect(${JSON.stringify(DB)})
filas = [{'nombre': n, 'datos': json.loads(d)} for n, d in c.execute('select name, networkData from hydraulic_networks')]
json.dump(filas, sys.stdout)
`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    return JSON.parse(salida)
  }

  it('todo id de la red se puede consultar y se encuentra', () => {
    for (const { nombre, datos } of leerRedes()) {
      for (const n of datos.nodes ?? []) {
        const r = ejecutarHerramienta('consultar_elemento', { id: n.id }, datos) as any
        expect(r.encontrado, `${nombre} / ${n.id}`).toBe(true)
      }
      for (const l of datos.links ?? []) {
        const r = ejecutarHerramienta('consultar_elemento', { id: l.id }, datos) as any
        expect(r.encontrado, `${nombre} / ${l.id}`).toBe(true)
      }
    }
  })

  it('el listado nunca supera el tope aunque la red sea grande', () => {
    for (const { nombre, datos } of leerRedes()) {
      const r = ejecutarHerramienta('listar_elementos', { tipo: 'pipe', limite: 999 }, datos) as any
      expect(r.devueltos, nombre).toBeLessThanOrEqual(50)
      expect(r.total, nombre).toBe((datos.links ?? []).filter(l => l.type === 'pipe').length)
    }
  })

  it('el resultado de una consulta cabe holgadamente en el prompt', () => {
    // Un nudo de Net3 con todos sus tramos no puede acercarse al tamano de la
    // red entera: si lo hiciera, las herramientas no resolverian nada.
    for (const { nombre, datos } of leerRedes()) {
      for (const n of datos.nodes ?? []) {
        const r = ejecutarHerramienta('consultar_elemento', { id: n.id }, datos)
        expect(JSON.stringify(r).length, `${nombre} / ${n.id}`).toBeLessThan(4000)
      }
    }
  })
})
