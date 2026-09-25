/**
 * El esquema de arranque contra `prisma/schema.prisma`.
 *
 * En desarrollo el esquema lo pone `prisma db push`, así que una columna que
 * falte en `SENTENCIAS_ESQUEMA` no se nota aquí: se nota en la máquina de quien
 * instala o actualiza, como «no such column», y con sus datos ya dentro. Pasó con
 * la jerarquía de escenarios (#31), cuyas tres columnas de `hydraulic_networks`
 * vivieron nueve versiones fuera de esta lista.
 *
 * La prueba lee los dos ficheros y compara. No valida claves foráneas —para eso
 * está Prisma—: comprueba que la columna exista, que es lo que rompe en
 * producción. Del tipo solo mira los booleanos, porque un `INTEGER` donde Prisma
 * espera `BOOLEAN` hace que `db push` se niegue a aplicar nada sobre esa base.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { SENTENCIAS_ESQUEMA } from './esquemaProduccion'

const RAIZ = join(__dirname, '..')

/** Columnas por tabla según el esquema de Prisma, que es la fuente de verdad. */
function tablasDelEsquema(): Map<string, { campo: string; tipo: string }[]> {
  const texto = readFileSync(join(RAIZ, 'prisma', 'schema.prisma'), 'utf-8')
  const tablas = new Map<string, { campo: string; tipo: string }[]>()

  for (const modelo of texto.matchAll(/^model\s+\w+\s*\{([\s\S]*?)^\}/gm)) {
    const cuerpo = modelo[1]
    const mapeo = cuerpo.match(/@@map\("([^"]+)"\)/)
    if (!mapeo) continue // sin @@map no hay tabla que comprobar

    const columnas: { campo: string; tipo: string }[] = []
    for (const linea of cuerpo.split('\n')) {
      const l = linea.trim()
      if (!l || l.startsWith('//') || l.startsWith('@@')) continue

      const [campo, tipo] = l.split(/\s+/)
      if (!campo || !tipo) continue
      if (tipo.endsWith('[]')) continue // lado múltiple de una relación

      // Un campo de relación no es una columna; su clave foránea sí, y esa se
      // declara aparte con tipo escalar.
      const escalar = /^(String|Int|Float|Boolean|DateTime|Bytes|Decimal|BigInt|Json)\??$/.test(tipo)
      if (!escalar) continue

      columnas.push({ campo, tipo: tipo.replace('?', '') })
    }
    tablas.set(mapeo[1], columnas)
  }
  return tablas
}

/** Lo que las sentencias de arranque saben crear, tabla por tabla, con su tipo SQL. */
function tablasDeLasSentencias(): Map<string, Map<string, string>> {
  const tablas = new Map<string, Map<string, string>>()

  for (const sql of SENTENCIAS_ESQUEMA) {
    const creacion = sql.match(/CREATE TABLE IF NOT EXISTS "(\w+)"/)
    if (creacion) {
      const columnas = new Map(
        [...sql.matchAll(/"(\w+)"\s+(TEXT|INTEGER|REAL|DATETIME|BOOLEAN|BLOB)/g)].map(m => [m[1], m[2]])
      )
      tablas.set(creacion[1], columnas)
      continue
    }

    const anadido = sql.match(/ALTER TABLE "(\w+)" ADD COLUMN "(\w+)" (\w+)/)
    if (anadido) {
      const [, tabla, columna, tipo] = anadido
      if (!tablas.has(tabla)) tablas.set(tabla, new Map())
      tablas.get(tabla)!.set(columna, tipo)
    }
  }
  return tablas
}

describe('esquema de producción', () => {
  const esquema = tablasDelEsquema()
  const sentencias = tablasDeLasSentencias()

  it('crea todas las tablas del esquema', () => {
    const faltan = [...esquema.keys()].filter(t => !sentencias.has(t))
    expect(faltan, `tablas sin CREATE TABLE en SENTENCIAS_ESQUEMA: ${faltan.join(', ')}`).toEqual([])
  })

  it('cada tabla tiene todas sus columnas', () => {
    const faltan: string[] = []
    for (const [tabla, columnas] of esquema) {
      const tiene = sentencias.get(tabla)
      if (!tiene) continue // lo cubre la prueba anterior
      faltan.push(...columnas.filter(c => !tiene.has(c.campo)).map(c => `${tabla}.${c.campo}`))
    }
    expect(faltan, `columnas que no llegarían a una instalación: ${faltan.join(', ')}`).toEqual([])
  })

  it('los booleanos se declaran BOOLEAN', () => {
    // Prisma lee igual un 0/1 guardado como INTEGER, pero `db push` ve un cambio
    // de tipo con pérdida de datos y aborta el esquema entero: en desarrollo, una
    // base creada por la app empaquetada dejaba de recibir columnas nuevas.
    const malTipadas: string[] = []
    for (const [tabla, columnas] of esquema) {
      const tiene = sentencias.get(tabla)
      if (!tiene) continue
      for (const { campo, tipo } of columnas) {
        const sqlTipo = tiene.get(campo)
        if (tipo === 'Boolean' && sqlTipo && sqlTipo !== 'BOOLEAN') malTipadas.push(`${tabla}.${campo} (${sqlTipo})`)
      }
    }
    expect(malTipadas, `booleanos sin BOOLEAN: ${malTipadas.join(', ')}`).toEqual([])
  })

  it('las columnas añadidas a tablas que ya existían traen su ALTER', () => {
    // Un CREATE TABLE IF NOT EXISTS no toca una tabla que ya está, así que sin
    // ALTER la columna nunca llega a quien actualiza desde una versión anterior.
    const conAlter = new Set(
      SENTENCIAS_ESQUEMA.flatMap(sql => {
        const m = sql.match(/ALTER TABLE "(\w+)" ADD COLUMN "(\w+)"/)
        return m ? [`${m[1]}.${m[2]}`] : []
      })
    )

    // Las de la jerarquía de escenarios (#31), los ámbitos (#39) y la indexación
    // de simulaciones (#41): las tres tandas que se añadieron sobre tablas vivas.
    const exigidas = [
      'hydraulic_networks.parentId',
      'hydraulic_networks.scenarioLabel',
      'hydraulic_networks.resultsPath',
      'hydraulic_knowledge.projectId',
      'hydraulic_knowledge.simulationRunId',
      'simulation_runs.estadoIndexacion',
      'simulation_runs.errorIndexacion',
    ]
    expect(exigidas.filter(c => !conAlter.has(c))).toEqual([])
  })
})
