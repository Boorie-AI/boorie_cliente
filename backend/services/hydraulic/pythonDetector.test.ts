import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as path from 'path'
import * as fs from 'fs'
import { findPythonPath, resetPythonPathCache, savePythonPath, getManagedVenvDir } from './pythonDetector'

// Mock fs and child_process
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal() as any
  const mocks = {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  }
  return { ...actual, default: { ...actual.default, ...mocks }, ...mocks }
})

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal() as any
  return {
    ...actual,
    execSync: vi.fn().mockImplementation(() => { throw new Error('not found') }),
  }
})

const USER_DATA = path.join('/tmp', 'boorie-userdata')
const CONFIG_FILE = path.join(USER_DATA, 'python-path.json')

describe('pythonDetector', () => {
  beforeEach(() => {
    resetPythonPathCache()
    vi.unstubAllEnvs()
    delete process.env.PYTHON_PATH
    delete process.env.BOORIE_USER_DATA
    vi.mocked(fs.existsSync).mockReturnValue(false)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should use PYTHON_PATH env variable when set', () => {
    vi.stubEnv('PYTHON_PATH', '/custom/python3')
    const result = findPythonPath()
    expect(result).toBe('/custom/python3')
  })

  it('should cache the result after first call', () => {
    vi.stubEnv('PYTHON_PATH', '/cached/python3')
    const first = findPythonPath()
    vi.stubEnv('PYTHON_PATH', '/different/python3')
    const second = findPythonPath()
    expect(first).toBe(second)
    expect(second).toBe('/cached/python3')
  })

  it('should reset cache when resetPythonPathCache is called', () => {
    vi.stubEnv('PYTHON_PATH', '/first/python3')
    const first = findPythonPath()
    resetPythonPathCache()
    vi.stubEnv('PYTHON_PATH', '/second/python3')
    const second = findPythonPath()
    expect(first).toBe('/first/python3')
    expect(second).toBe('/second/python3')
  })

  // Es el unico test que deja sondear el sistema de verdad, y sondear cuesta:
  // el detector lanza execSync por cada candidato con timeouts propios de 5 s y
  // de 30 s, asi que con los 5 s por defecto de vitest una sola sonda lenta ya
  // se pasa de largo. En CI tardaba 4,07 s -de 5- antes de que un fichero de
  // test mas de carga en paralelo lo tumbara. El limite va por encima de lo que
  // el propio detector se permite; lo que se comprueba aqui no es la rapidez.
  it('should return a string path when no PYTHON_PATH is set', () => {
    const result = findPythonPath()
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  }, 60_000)

  it('resolves the managed venv directory inside userData', () => {
    vi.stubEnv('BOORIE_USER_DATA', USER_DATA)
    expect(getManagedVenvDir()).toBe(path.join(USER_DATA, 'venv-wntr'))
  })

  it('has no managed venv directory outside Electron', () => {
    expect(getManagedVenvDir()).toBeNull()
  })

  it('persists the python path under userData', () => {
    vi.stubEnv('BOORIE_USER_DATA', USER_DATA)
    savePythonPath(path.join(USER_DATA, 'venv-wntr', 'bin', 'python'))

    expect(vi.mocked(fs.writeFileSync)).toHaveBeenCalledWith(
      CONFIG_FILE,
      expect.stringContaining(path.join(USER_DATA, 'venv-wntr', 'bin', 'python')),
      'utf-8',
    )
  })

  it('ignores a persisted path that no longer exists on disk', () => {
    vi.stubEnv('BOORIE_USER_DATA', USER_DATA)
    vi.mocked(fs.existsSync).mockImplementation(((p: string) => String(p) === CONFIG_FILE) as any)
    vi.mocked(fs.readFileSync).mockImplementation(((p: string) => {
      if (String(p) === CONFIG_FILE) return JSON.stringify({ pythonPath: '/deleted/venv/bin/python' })
      throw new Error(`unexpected read: ${p}`)
    }) as any)

    expect(findPythonPath()).not.toBe('/deleted/venv/bin/python')
  })
})
