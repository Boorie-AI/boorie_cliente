import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { execFileSync } from 'child_process'
import { construirResumenRed, formatearContextoRed, type EntradaResumen } from './networkContext'

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..')
const DB = path.join(REPO_ROOT, 'prisma', 'hydraulic.db')

const VILLA: EntradaResumen = {
  nombreRed: 'villa_100_casas.inp',
  contadores: { junctions: 5, tanks: 1, reservoirs: 1, pipes: 6, pumps: 0, valves: 0 },
  datos: {
    nodes: [{ demand: 0.000231 }, { demand: 0.000231 }, { demand: 0.000231 }, { demand: 0.000231 }, { demand: 0.000231 }],
    links: [
      { length: 200, diameter: 0.1 }, { length: 150, diameter: 0.075 },
      { length: 180, diameter: 0.075 }, { length: 200, diameter: 0.05 },
      { length: 150, diameter: 0.05 }, { length: 150, diameter: 0.05 },
    ],
    coordinate_system: { type: 'geographic', epsg: null },
  },
}

describe('resumen de la red para el agente', () => {
  it('suma longitudes y demandas de la red', () => {
    const r = construirResumenRed(VILLA)
    expect(r.longitudTotalM).toBe(1030)
    expect(r.demandaTotalM3s).toBeCloseTo(0.001155, 6)
    expect(r.diametroMinMm).toBe(50)
    expect(r.diametroMaxMm).toBe(100)
  })

  it('ignora las demandas negativas', () => {
    // Una demanda base negativa modela una entrada de agua, no un consumo:
    // sumarla restaría del total y daría una demanda menor que la real.
    const r = construirResumenRed({
      ...VILLA,
      datos: { ...VILLA.datos, nodes: [{ demand: 0.01 }, { demand: -0.008 }, { demand: 0.002 }] },
    })
    expect(r.demandaTotalM3s).toBeCloseTo(0.012, 6)
  })

  it('no inventa un EPSG que la red no trae', () => {
    // En las redes reales el epsg viene a null; decir «EPSG:null» o suponer uno
    // sería peor que declarar simplemente que son geográficas.
    expect(construirResumenRed(VILLA).sistemaCoordenadas).toBe('geográficas (lat/lon)')
    const proyectada = construirResumenRed({
      ...VILLA,
      datos: { ...VILLA.datos, coordinate_system: { type: 'projected', units: 'feet', epsg: null } },
    })
    expect(proyectada.sistemaCoordenadas).toBe('proyectadas (feet)')
    const conEpsg = construirResumenRed({
      ...VILLA,
      datos: { ...VILLA.datos, coordinate_system: { type: 'projected', epsg: 25831 } },
    })
    expect(conEpsg.sistemaCoordenadas).toBe('EPSG:25831')
  })

  it('sin proyecto, declara el chat general y acota lo que puede responder', () => {
    // Sin proyecto no es un estado degradado sino el chat general: responde de
    // forma general y con la base de conocimiento, pero no sobre redes que no
    // tiene delante.
    const texto = formatearContextoRed(null)
    expect(texto).toContain('=== CHAT GENERAL ===')
    expect(texto).toContain('esto es el chat general')
    expect(texto).toContain('base de conocimiento')
    expect(texto).toContain('No describas ninguna red concreta')
    expect(texto).toContain('ingeniería hidráulica y redes de agua')
    expect(texto).not.toMatch(/Nudos de consumo/)
  })

  it('sin red, prohíbe también los ejemplos numéricos', () => {
    // Con el texto anterior, llama3.2 pedía más datos pero soltaba un «Ejemplo»
    // con 5 tuberías y 500 metros, que un usuario distraído puede leer como su
    // red.
    expect(formatearContextoRed(null)).toContain('tampoco inventes ejemplos numéricos')
  })

  it('el texto lleva las cifras que se le pasan, en unidades legibles', () => {
    const texto = formatearContextoRed(construirResumenRed(VILLA))
    expect(texto).toContain('Red: villa_100_casas.inp')
    expect(texto).toContain('1.03 km')     // 1030 m
    expect(texto).toContain('1.16 L/s')    // 0.001155 m3/s
    expect(texto).toContain('Nudos de consumo: 5')
    expect(texto).toContain('Tuberías: 6')
  })

  it('cita la última simulación cuando existe, y lo dice cuando no', () => {
    const con = formatearContextoRed(construirResumenRed({
      ...VILLA,
      ultimaSimulacion: { nombre: 'Interrupción de Servicio (PDA): P2', fecha: '2026-08-18T22:16:36.000Z' },
    }))
    expect(con).toContain('Interrupción de Servicio (PDA): P2')
    expect(con).toContain('2026-08-18')
    expect(formatearContextoRed(construirResumenRed(VILLA))).toContain('ninguna todavía')
  })
})

/**
 * Contraste contra las redes realmente guardadas: el criterio de aceptación
 * pide que las cifras del agente coincidan con las de la red, así que se
 * comprueban contra la base de datos y no sólo contra un objeto inventado.
 */
describe.skipIf(!fs.existsSync(DB))('contraste con las redes guardadas', () => {
  const leerRedes = () => {
    const salida = execFileSync('python3', ['-c', `
import sqlite3, json, sys
c = sqlite3.connect(${JSON.stringify(DB)})
filas = []
for name, summary, nd in c.execute('select name, summary, networkData from hydraulic_networks'):
    filas.append({'nombreRed': name, 'contadores': json.loads(summary), 'datos': json.loads(nd)})
json.dump(filas, sys.stdout)
`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    return JSON.parse(salida) as EntradaResumen[]
  }

  it('los contadores del resumen son los que guarda la red', () => {
    for (const red of leerRedes()) {
      const r = construirResumenRed(red)
      expect(r.pipes, red.nombreRed).toBe(red.contadores.pipes ?? 0)
      expect(r.junctions, red.nombreRed).toBe(red.contadores.junctions ?? 0)
      expect(r.pumps, red.nombreRed).toBe(red.contadores.pumps ?? 0)
    }
  })

  it('longitud y demanda salen positivas y coherentes con el número de tramos', () => {
    for (const red of leerRedes()) {
      const r = construirResumenRed(red)
      expect(r.longitudTotalM, red.nombreRed).toBeGreaterThan(0)
      expect(r.demandaTotalM3s, red.nombreRed).toBeGreaterThanOrEqual(0)
      // Cada tramo aporta longitud: el total no puede ser menor que el mayor.
      const maxTramo = Math.max(...(red.datos.links ?? []).map(l => l.length ?? 0))
      expect(r.longitudTotalM, red.nombreRed).toBeGreaterThanOrEqual(maxTramo)
    }
  })
})
