import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'

const { log, spawn, hijos, rmSync } = vi.hoisted(() => ({
  log: { info: vi.fn(), warn: vi.fn() },
  spawn: vi.fn(),
  hijos: [] as any[],
  rmSync: vi.fn(),
}))

vi.mock('electron-log', () => ({ default: log }))
vi.mock('child_process', () => ({ spawn, default: { spawn } }))
vi.mock('fs', async (original) => {
  const real = await original<typeof import('fs')>()
  const fs = { ...real, existsSync: () => true, rmSync }
  return { ...fs, default: fs }
})

import { PLAZO_PARADA_MS, ESPERA_RELANZAR_MS, MAX_RELANZAMIENTOS } from './milvusProcess'

// Cada test con el módulo recién cargado: el tope de relanzamientos cuenta para toda la sesión.
let m: typeof import('./milvusProcess')

function hijoFalso() {
  const hijo: any = new EventEmitter()
  hijo.pid = 1000 + hijos.length
  hijo.exitCode = null
  hijo.signalCode = null
  hijo.stdout = new EventEmitter()
  hijo.stderr = new EventEmitter()
  hijo.stdin = Object.assign(new EventEmitter(), { end: vi.fn() })
  hijo.kill = vi.fn()
  hijos.push(hijo)
  return hijo
}

function muere(hijo: any, code: number | null, signal: string | null = null) {
  hijo.exitCode = code
  hijo.signalCode = signal
  hijo.emit('exit', code, signal)
}

// Cada test deja el módulo sin proceso: si no, el siguiente esperaría a que pare.
async function pararElUltimo() {
  const parada = m.stopMilvusServer()
  const ultimo = hijos[hijos.length - 1]
  if (ultimo && ultimo.exitCode === null) muere(ultimo, 0)
  await parada
}

describe('milvusProcess', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    hijos.length = 0
    spawn.mockImplementation(hijoFalso)
    vi.resetModules()
    m = await import('./milvusProcess')
  })

  afterEach(async () => {
    vi.useRealTimers()
    await pararElUltimo()
  })

  it('la salida de start_milvus.py llega al log en disco', async () => {
    await m.startMilvusServer('python', '/datos')
    hijos[0].stdout.emit('data', Buffer.from('[milvus] no se pudo arrancar el servidor Milvus Lite\n'))
    hijos[0].stderr.emit('data', Buffer.from('Fatal Python error: Aborted\n'))

    const lineas = log.info.mock.calls.map(c => c[0])
    expect(lineas).toContain('[Milvus] [milvus] no se pudo arrancar el servidor Milvus Lite')
    expect(lineas).toContain('[Milvus] Fatal Python error: Aborted')
  })

  it('le pide que pare por la entrada, y borra el puerto del anterior antes de lanzar', async () => {
    await m.startMilvusServer('python', '/datos')
    expect(spawn.mock.calls[0][2].env.BOORIE_MILVUS_PARAR_CON_STDIN).toBe('1')
    expect(rmSync).toHaveBeenCalledWith(expect.stringMatching(/boorie-milvus[\\/]port$/), { force: true })
  })

  it('pararlo cierra su entrada y espera a que salga, sin matarlo', async () => {
    await m.startMilvusServer('python', '/datos')
    let parado = false
    const parada = m.stopMilvusServer().then(() => { parado = true })

    expect(hijos[0].stdin.end).toHaveBeenCalled()
    await Promise.resolve()
    expect(parado).toBe(false)

    muere(hijos[0], 0)
    await parada
    expect(hijos[0].kill).not.toHaveBeenCalled()
    expect(log.warn).not.toHaveBeenCalled()
  })

  it('si no para a tiempo, se mata', async () => {
    vi.useFakeTimers()
    await m.startMilvusServer('python', '/datos')
    const parada = m.stopMilvusServer()

    vi.advanceTimersByTime(PLAZO_PARADA_MS)
    expect(hijos[0].kill).toHaveBeenCalled()
    muere(hijos[0], null, 'SIGTERM')
    await parada
  })

  it('no lanza el nuevo hasta que el anterior ha soltado la base', async () => {
    await m.startMilvusServer('python', '/datos')
    const segundo = m.startMilvusServer('python', '/datos')
    await Promise.resolve()
    expect(spawn).toHaveBeenCalledTimes(1)

    muere(hijos[0], 0)
    await segundo
    expect(spawn).toHaveBeenCalledTimes(2)
  })

  it('avisa en cada arranque, para que el cliente olvide el puerto viejo', async () => {
    const alArrancar = vi.fn()
    m.alArrancarMilvus(alArrancar)
    await m.startMilvusServer('python', '/datos')
    expect(alArrancar).toHaveBeenCalledTimes(1)
  })

  it('pararlo al salir de Boorie cancela un relanzamiento pendiente', async () => {
    vi.useFakeTimers()
    await m.startMilvusServer('python', '/datos')
    muere(hijos[0], 1)
    expect(log.info).toHaveBeenCalledWith(expect.stringContaining('se relanza en'))
    await m.stopMilvusServer()
    await vi.advanceTimersByTimeAsync(ESPERA_RELANZAR_MS)
    expect(spawn).toHaveBeenCalledTimes(1)
  })

  it(`una caída se avisa con su código y se relanza, hasta ${MAX_RELANZAMIENTOS} veces`, async () => {
    vi.useFakeTimers()
    await m.startMilvusServer('python', '/datos')

    for (let i = 0; i < MAX_RELANZAMIENTOS; i++) {
      muere(hijos[i], 3221226505)
      await vi.advanceTimersByTimeAsync(ESPERA_RELANZAR_MS)
    }
    expect(spawn).toHaveBeenCalledTimes(MAX_RELANZAMIENTOS + 1)
    expect(log.warn).toHaveBeenCalledWith('[Milvus] process exited with code 3221226505')

    muere(hijos[MAX_RELANZAMIENTOS], 3221226505)
    await vi.advanceTimersByTimeAsync(ESPERA_RELANZAR_MS)
    expect(spawn).toHaveBeenCalledTimes(MAX_RELANZAMIENTOS + 1)
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('no se relanza más'))
  })

  it('si Python no se puede lanzar, se dice por qué', async () => {
    await m.startMilvusServer('C:\\no\\existe\\python.exe', '/datos')
    hijos[0].emit('error', new Error('spawn ENOENT'))
    expect(log.warn).toHaveBeenCalledWith('[Milvus] failed to start process: spawn ENOENT')
  })
})
