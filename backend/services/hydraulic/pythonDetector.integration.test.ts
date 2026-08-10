import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  findPythonPath,
  getPythonStatus,
  resetPythonPathCache,
  savePythonPath,
} from './pythonDetector'

/**
 * Tests con un intérprete real (el venv-wntr del repo, sin mocks). Reproducen
 * el fallo que dejaba a los usuarios de Windows con "Python/WNTR no
 * instalado": el asistente de preparación crea el venv dentro de userData,
 * pero al reiniciar la app `PYTHON_PATH` ya no existe y el detector tiene que
 * volver a encontrarlo por sí mismo.
 *
 * Se omiten si el repo no tiene venv-wntr preparado (./setup-python-wntr.sh).
 */
const REPO_VENV = path.resolve(__dirname, '..', '..', '..', 'venv-wntr')
const REPO_VENV_PYTHON = path.join(REPO_VENV, process.platform === 'win32' ? 'Scripts' : 'bin', process.platform === 'win32' ? 'python.exe' : 'python')
const hasLocalVenv = fs.existsSync(REPO_VENV_PYTHON)

/** `import wntr` arrastra pandas/scipy/matplotlib: tarda varios segundos. */
const IMPORT_WNTR_TIMEOUT = 60_000

describe.skipIf(!hasLocalVenv)('pythonDetector con intérprete real', () => {
  let userData = ''
  const savedEnv = { pythonPath: process.env.PYTHON_PATH, userData: process.env.BOORIE_USER_DATA }

  beforeEach(() => {
    userData = fs.mkdtempSync(path.join(os.tmpdir(), 'boorie-userdata-'))
    process.env.BOORIE_USER_DATA = userData
    // El escenario a cubrir es precisamente el arranque sin PYTHON_PATH
    delete process.env.PYTHON_PATH
    resetPythonPathCache()
  })

  afterEach(() => {
    if (savedEnv.pythonPath === undefined) delete process.env.PYTHON_PATH
    else process.env.PYTHON_PATH = savedEnv.pythonPath
    if (savedEnv.userData === undefined) delete process.env.BOORIE_USER_DATA
    else process.env.BOORIE_USER_DATA = savedEnv.userData
    resetPythonPathCache()
    fs.rmSync(userData, { recursive: true, force: true })
  })

  it('recupera el intérprete persistido tras reiniciar la app', () => {
    // Lo que hace setup:install al terminar
    savePythonPath(REPO_VENV_PYTHON)

    // Arranque nuevo: caché limpia y sin PYTHON_PATH en el entorno
    resetPythonPathCache()

    expect(findPythonPath()).toBe(REPO_VENV_PYTHON)

    const status = getPythonStatus()
    expect(status.pythonFound).toBe(true)
    expect(status.wntrAvailable).toBe(true)
    expect(status.instructions).toBeNull()
  }, IMPORT_WNTR_TIMEOUT)

  it('descubre el venv gestionado en userData sin configuración previa', () => {
    // Simula el venv que crea el asistente dentro de userData
    fs.symlinkSync(REPO_VENV, path.join(userData, 'venv-wntr'), 'dir')
    resetPythonPathCache()

    const expected = path.join(userData, 'venv-wntr', path.basename(path.dirname(REPO_VENV_PYTHON)), path.basename(REPO_VENV_PYTHON))
    expect(findPythonPath()).toBe(expected)
    expect(getPythonStatus().wntrAvailable).toBe(true)
  }, IMPORT_WNTR_TIMEOUT)

  it('descarta una ruta persistida que ya no existe', () => {
    savePythonPath(path.join(userData, 'venv-borrado', 'bin', 'python'))
    resetPythonPathCache()

    expect(findPythonPath()).not.toContain('venv-borrado')
  }, IMPORT_WNTR_TIMEOUT)
})
