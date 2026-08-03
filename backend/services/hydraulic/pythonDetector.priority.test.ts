import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  findPythonPath,
  findPythonForMilvus,
  getMissingWntrModules,
  getPythonStatus,
  resetPythonPathCache,
  savePythonPath,
} from './pythonDetector'

/**
 * Prioridad de selección del intérprete, con "pythons" simulados: scripts que
 * responden a `--version` y a `-c "import a, b"` según los módulos que digamos
 * que tienen. Así se prueba la lógica sin depender de lo que haya instalado en
 * la máquina, y de forma instantánea.
 *
 * El caso que motivó estos tests: un tester con WNTR ya instalado en su
 * sistema al que Boorie se lo apartaba en favor de su propio venv.
 */
describe.skipIf(process.platform === 'win32')('prioridad del detector de Python', () => {
  let tmp = ''
  let originalCwd = ''
  let originalHome = ''

  function fakePython(dir: string, modules: string[]): string {
    fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, 'python3')
    fs.writeFileSync(
      file,
      [
        '#!/bin/sh',
        'if [ "$1" = "--version" ]; then echo "Python 3.11.9"; exit 0; fi',
        'if [ "$1" = "-c" ]; then',
        `  available="${modules.join(' ')}"`,
        '  requested=$(echo "$2" | sed "s/^import //" | tr -d ",")',
        '  for m in $requested; do',
        '    echo "$available" | tr " " "\\n" | grep -qx "$m" || exit 1',
        '  done',
        '  exit 0',
        'fi',
        'exit 1',
      ].join('\n'),
      { mode: 0o755 },
    )
    // El detector prueba primero Scripts/python.exe y bin/python; con crear
    // bin/python3 basta para que lo encuentre en la tercera variante.
    return file
  }

  const FULL_STACK = ['wntr', 'numpy', 'scipy', 'pandas', 'networkx']

  beforeEach(() => {
    originalCwd = process.cwd()
    originalHome = process.env.HOME ?? ''
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'boorie-prio-'))
    // cwd limpio: el detector mira ./venv y ./venv-wntr relativos a él
    fs.mkdirSync(path.join(tmp, 'cwd'), { recursive: true })
    process.chdir(path.join(tmp, 'cwd'))
    // HOME limpio: si no, ~/venv o ~/.venv de la máquina real ganarían la
    // carrera y el test dependería de quién lo ejecuta.
    fs.mkdirSync(path.join(tmp, 'home'), { recursive: true })
    process.env.HOME = path.join(tmp, 'home')
    process.env.BOORIE_USER_DATA = path.join(tmp, 'userdata')
    delete process.env.PYTHON_PATH
    resetPythonPathCache()
  })

  afterEach(() => {
    process.chdir(originalCwd)
    process.env.HOME = originalHome
    delete process.env.BOORIE_USER_DATA
    resetPythonPathCache()
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('usa el venv gestionado cuando el sistema no tiene WNTR', () => {
    const managed = fakePython(path.join(tmp, 'userdata', 'venv-wntr', 'bin'), FULL_STACK)
    expect(findPythonPath()).toBe(managed)
  })

  it('prefiere el Python del sistema sobre el venv gestionado', () => {
    const system = fakePython(path.join(tmp, 'cwd', 'venv', 'bin'), FULL_STACK)
    fakePython(path.join(tmp, 'userdata', 'venv-wntr', 'bin'), FULL_STACK)

    // './venv/bin/python3' es un candidato de sistema relativo al cwd
    expect(path.resolve(findPythonPath())).toBe(path.resolve(system))
  })

  it('descarta un venv que importa wntr pero le falta el resto del stack', () => {
    const system = fakePython(path.join(tmp, 'cwd', 'venv', 'bin'), FULL_STACK)
    const incomplete = fakePython(path.join(tmp, 'userdata', 'venv-wntr', 'bin'), ['wntr', 'numpy'])

    expect(getMissingWntrModules(incomplete)).toEqual(['scipy', 'pandas', 'networkx'])
    expect(path.resolve(findPythonPath())).toBe(path.resolve(system))
  })

  it('la ruta fijada por el usuario gana a la autodetección', () => {
    fakePython(path.join(tmp, 'cwd', 'venv', 'bin'), FULL_STACK)
    const chosen = fakePython(path.join(tmp, 'elegido'), FULL_STACK)

    savePythonPath(chosen, 'user')
    resetPythonPathCache()

    expect(findPythonPath()).toBe(chosen)
    const status = getPythonStatus()
    expect(status.userConfigured).toBe(true)
    expect(status.wntrAvailable).toBe(true)
  })

  it('Milvus usa el venv gestionado aunque WNTR use el del sistema', () => {
    const system = fakePython(path.join(tmp, 'cwd', 'venv', 'bin'), FULL_STACK)
    const managed = fakePython(
      path.join(tmp, 'userdata', 'venv-wntr', 'bin'),
      [...FULL_STACK, 'milvus_lite'],
    )

    expect(path.resolve(findPythonPath())).toBe(path.resolve(system))
    expect(findPythonForMilvus()).toBe(managed)
  })

  it('informa de los módulos que faltan en el intérprete en uso', () => {
    fakePython(path.join(tmp, 'cwd', 'venv', 'bin'), ['numpy', 'pandas'])

    const status = getPythonStatus()
    expect(status.pythonFound).toBe(true)
    expect(status.wntrAvailable).toBe(false)
    expect(status.missingModules).toEqual(['wntr', 'scipy', 'networkx'])
    expect(status.instructions).toContain('pip install wntr scipy networkx')
  })
})
