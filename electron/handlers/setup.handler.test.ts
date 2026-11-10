import { describe, it, expect, vi } from 'vitest'
import { spawnSync } from 'child_process'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() }, app: { getPath: vi.fn() } }))

import { comprobacionDeImport, REQUIRED_PACKAGES } from './setup.handler'

const python = ['python3', 'python'].find(p => spawnSync(p, ['--version']).status === 0)

function ejecutar(codigo: string) {
  const r = spawnSync(python!, ['-c', codigo], { encoding: 'utf8' })
  return { ok: r.status === 0, stderr: r.stderr }
}

describe('REQUIRED_PACKAGES', () => {
  // wntr importa six sin declararlo; desde python-dateutil 4.0.0 nadie lo trae (#318).
  it('instala six como obligatorio', () => {
    const six = REQUIRED_PACKAGES.find(p => p.name === 'six')
    expect(six).toMatchObject({ importName: 'six' })
    expect(six?.optional).toBeFalsy()
  })
})

describe('comprobacionDeImport', () => {
  it('sin versión mínima sólo importa', () => {
    expect(comprobacionDeImport({ name: 'wntr', importName: 'wntr' })).toBe('import wntr')
  })

  // pip viene con cualquier Python: sirve de paquete instalado con versión conocida.
  describe.skipIf(!python)('con Python', () => {
    it('una versión suficiente pasa', () => {
      expect(ejecutar(comprobacionDeImport({ name: 'pip', importName: 'pip', minVersion: '1.0' })).ok).toBe(true)
    })

    it('una versión vieja falla y dice cuál tiene', () => {
      const r = ejecutar(comprobacionDeImport({ name: 'pip', importName: 'pip', minVersion: '999.2.2' }))
      expect(r.ok).toBe(false)
      expect(r.stderr).toMatch(/AssertionError: pip [\d.]+ es anterior a la 999\.2\.2/)
    })

    it('compara por números, no como texto', () => {
      // Como texto, '10.0' < '9.0'.
      const r = ejecutar(comprobacionDeImport({ name: 'pip', importName: 'pip', minVersion: '9.0' }))
      expect(r.ok).toBe(true)
    })
  })
})
