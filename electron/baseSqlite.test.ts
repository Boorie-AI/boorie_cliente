import { describe, it, expect, vi } from 'vitest'
import { urlConEspera, activarWAL } from './baseSqlite'

describe('la URL de la base', () => {
  it('a una de SQLite se le alarga la espera', () => {
    expect(urlConEspera('file:/home/u/.config/boorie/hydraulic.db')).toBe('file:/home/u/.config/boorie/hydraulic.db?socket_timeout=20')
    expect(urlConEspera('file:./dev.db?connection_limit=1')).toBe('file:./dev.db?connection_limit=1&socket_timeout=20')
  })

  it('la que ya trae su espera, o no es de SQLite, se queda como está', () => {
    expect(urlConEspera('file:./dev.db?socket_timeout=60')).toBe('file:./dev.db?socket_timeout=60')
    expect(urlConEspera('postgresql://u:p@localhost:5432/boorie')).toBe('postgresql://u:p@localhost:5432/boorie')
  })
})

describe('el modo WAL', () => {
  it('se pide al conectar y se devuelve el modo en que queda', async () => {
    const cliente = { $queryRawUnsafe: vi.fn().mockResolvedValue([{ journal_mode: 'wal' }]) }
    expect(await activarWAL(cliente, 'file:./hydraulic.db')).toBe('wal')
    expect(cliente.$queryRawUnsafe).toHaveBeenCalledWith('PRAGMA journal_mode=WAL')
  })

  it('si falla, la aplicación arranca igual', async () => {
    const cliente = { $queryRawUnsafe: vi.fn().mockRejectedValue(new Error('database is locked')) }
    expect(await activarWAL(cliente, 'file:./hydraulic.db')).toBeNull()
  })

  it('con PostgreSQL no se toca nada', async () => {
    const cliente = { $queryRawUnsafe: vi.fn() }
    expect(await activarWAL(cliente, 'postgresql://localhost/boorie')).toBeNull()
    expect(cliente.$queryRawUnsafe).not.toHaveBeenCalled()
  })
})
