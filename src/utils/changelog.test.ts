import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { parseChangelog, isChangelogInSync } from './changelog'

describe('parseChangelog', () => {
  it('extrae versión, fecha, resumen y detalles', () => {
    const [e] = parseChangelog(`
## [1.5.1] - 2026-08-08

Resumen de la versión.

- Primer detalle
- Segundo detalle
`)
    expect(e.version).toBe('1.5.1')
    expect(e.date).toBe('2026-08-08')
    expect(e.summary).toBe('Resumen de la versión.')
    expect(e.details).toEqual(['Primer detalle', 'Segundo detalle'])
  })

  it('conserva el orden del fichero', () => {
    const v = parseChangelog(`
## [2.0.0] - 2026-01-01
Nueva.

## [1.0.0] - 2025-01-01
Vieja.
`).map((e) => e.version)
    expect(v).toEqual(['2.0.0', '1.0.0'])
  })

  // El fichero se escribe con las líneas partidas para que sea legible en el
  // editor; sin unir las continuaciones, el detalle se truncaba en la interfaz.
  it('une las viñetas partidas en varias líneas', () => {
    const [e] = parseChangelog(`
## [1.0.0] - 2025-01-01
Resumen.

- Una viñeta larga que continúa
  en la línea siguiente y termina aquí.
- Otra viñeta corta
`)
    expect(e.details).toEqual([
      'Una viñeta larga que continúa en la línea siguiente y termina aquí.',
      'Otra viñeta corta',
    ])
  })

  it('una línea en blanco cierra la viñeta: lo que sigue no se le pega', () => {
    const [e] = parseChangelog(`
## [1.0.0] - 2025-01-01
Resumen.

- La viñeta

Nota de cierre suelta.
`)
    expect(e.details).toEqual(['La viñeta'])
  })

  it('acepta cabeceras sin corchetes y sin fecha', () => {
    const e = parseChangelog('## 1.4.0\nSin fecha ni corchetes.')
    expect(e).toHaveLength(1)
    expect(e[0].version).toBe('1.4.0')
    expect(e[0].date).toBeNull()
  })

  it('admite versiones con sufijo de pre-release', () => {
    expect(parseChangelog('## [1.5.1-rc.9] - 2026-08-08\nCandidata.')[0].version)
      .toBe('1.5.1-rc.9')
  })

  // Lo que sigue es el motivo de tener parser propio: el fichero se edita a mano.
  it('devuelve lista vacía con entrada vacía o sin cabeceras', () => {
    expect(parseChangelog('')).toEqual([])
    expect(parseChangelog('# Changelog\n\nTexto suelto sin ninguna versión.')).toEqual([])
  })

  it('ignora una versión declarada sin contenido en vez de mostrarla vacía', () => {
    const e = parseChangelog('## [1.0.1] - 2026-01-01\n\n## [1.0.0] - 2025-01-01\nCon cuerpo.')
    expect(e.map((x) => x.version)).toEqual(['1.0.0'])
  })

  it('no arrastra a la entrada el texto que va tras una cabecera de otro nivel', () => {
    const [e] = parseChangelog(`
## [1.0.0] - 2025-01-01
Resumen.
- Detalle

# Otra sección
- Esto no pertenece a la versión
`)
    expect(e.details).toEqual(['Detalle'])
  })

  it('no confunde texto posterior a las viñetas con el resumen', () => {
    const [e] = parseChangelog(`
## [1.0.0] - 2025-01-01
El resumen.
- Detalle

Nota de cierre que no es resumen.
`)
    expect(e.summary).toBe('El resumen.')
  })

  it('descarta cabeceras que no son una versión semántica', () => {
    expect(parseChangelog('## Unreleased\nAlgo.\n## [1.0.0] - 2025-01-01\nOtro.')
      .map((e) => e.version)).toEqual(['1.0.0'])
  })
})

describe('isChangelogInSync', () => {
  const entries = parseChangelog('## [1.5.1] - 2026-08-08\nResumen.')

  it('acepta la coincidencia exacta', () => {
    expect(isChangelogInSync(entries, '1.5.1')).toBe(true)
  })

  it('acepta una release candidate de la versión documentada', () => {
    expect(isChangelogInSync(entries, '1.5.1-rc.9')).toBe(true)
  })

  it('rechaza una versión distinta', () => {
    expect(isChangelogInSync(entries, '1.5.2')).toBe(false)
  })

  it('rechaza los casos degenerados', () => {
    expect(isChangelogInSync([], '1.5.1')).toBe(false)
    expect(isChangelogInSync(entries, '')).toBe(false)
  })
})

// Guarda de coherencia: es la comprobación que faltó en el rc.7, donde lo declarado
// y lo empaquetado no coincidían.
describe('CHANGELOG.md del repositorio', () => {
  const raiz = resolve(__dirname, '../..')
  const entries = parseChangelog(readFileSync(resolve(raiz, 'CHANGELOG.md'), 'utf-8'))

  it('se parsea y tiene entradas', () => {
    expect(entries.length).toBeGreaterThan(0)
  })

  it('su entrada superior coincide con la versión de package.json', () => {
    const { version } = JSON.parse(readFileSync(resolve(raiz, 'package.json'), 'utf-8'))
    expect(isChangelogInSync(entries, version)).toBe(true)
  })

  it('todas las entradas traen fecha y resumen', () => {
    for (const e of entries) {
      expect(e.date, `la versión ${e.version} no tiene fecha`).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(e.summary, `la versión ${e.version} no tiene resumen`).not.toBe('')
    }
  })
})
