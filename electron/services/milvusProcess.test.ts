import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'

const { log, spawn, hijos } = vi.hoisted(() => ({
  log: { info: vi.fn(), warn: vi.fn() },
  spawn: vi.fn(),
  hijos: [] as any[],
}))

vi.mock('electron-log', () => ({ default: log }))
vi.mock('child_process', () => ({ spawn, default: { spawn } }))
vi.mock('fs', async (original) => ({ ...(await original<typeof import('fs')>()), existsSync: () => true }))

import { startMilvusServer, stopMilvusServer } from './milvusProcess'

function hijoFalso() {
  const hijo: any = new EventEmitter()
  hijo.stdout = new EventEmitter()
  hijo.stderr = new EventEmitter()
  hijo.killed = false
  hijo.kill = vi.fn(() => { hijo.killed = true })
  hijos.push(hijo)
  return hijo
}

describe('milvusProcess', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hijos.length = 0
    spawn.mockImplementation(hijoFalso)
  })

  it('la salida de start_milvus.py llega al log en disco', () => {
    startMilvusServer('python', '/datos')
    hijos[0].stdout.emit('data', Buffer.from('[milvus] no se pudo arrancar el servidor Milvus Lite\n'))
    hijos[0].stderr.emit('data', Buffer.from('ModuleNotFoundError: No module named pymilvus\n'))

    const lineas = log.info.mock.calls.map(c => c[0])
    expect(lineas).toContain('[Milvus] [milvus] no se pudo arrancar el servidor Milvus Lite')
    expect(lineas).toContain('[Milvus] ModuleNotFoundError: No module named pymilvus')
    stopMilvusServer()
  })

  it('una salida inesperada es un aviso con su código', () => {
    startMilvusServer('python', '/datos')
    hijos[0].emit('exit', 1, null)
    expect(log.warn).toHaveBeenCalledWith('[Milvus] process exited with code 1')
  })

  it('pararlo al salir de Boorie no es un aviso', () => {
    startMilvusServer('python', '/datos')
    stopMilvusServer()
    hijos[0].emit('exit', null, 'SIGTERM')
    expect(log.warn).not.toHaveBeenCalled()
  })

  it('si Python no se puede lanzar, se dice por qué', () => {
    startMilvusServer('C:\\no\\existe\\python.exe', '/datos')
    hijos[0].emit('error', new Error('spawn ENOENT'))
    expect(log.warn).toHaveBeenCalledWith('[Milvus] failed to start process: spawn ENOENT')
  })
})
