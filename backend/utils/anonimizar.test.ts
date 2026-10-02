import { describe, it, expect } from 'vitest'
import { anonimizar } from './anonimizar'

describe('anonimizar (#217, R12)', () => {
  it('quita el usuario de las rutas de Windows, con las dos barras', () => {
    expect(anonimizar('C:\\Users\\maria.lopez\\AppData\\Roaming\\boorie\\x.log'))
      .toBe('C:\\Users\\<usuario>\\AppData\\Roaming\\boorie\\x.log')
    expect(anonimizar('c:/users/maria/Documents/red.inp')).toBe('c:/users/<usuario>/Documents/red.inp')
  })

  it('quita el usuario de las rutas de Linux y macOS', () => {
    expect(anonimizar('/home/rayne/.config/boorie/logs/main.log')).toBe('/home/<usuario>/.config/boorie/logs/main.log')
    expect(anonimizar('/Users/ana/Library/Application Support/boorie')).toBe('/Users/<usuario>/Library/Application Support/boorie')
  })

  it('sustituye la carpeta personal real aunque no siga el patrón habitual', () => {
    expect(anonimizar('D:\\Perfiles\\jperez\\OneDrive - Empresa\\red.inp', { home: 'D:\\Perfiles\\jperez' }))
      .toBe('~\\OneDrive - Empresa\\red.inp')
    expect(anonimizar('d:/perfiles/jperez/x', { home: 'D:\\Perfiles\\jperez\\' })).toBe('~/x')
  })

  it('quita los emails, también los que escribe el usuario', () => {
    expect(anonimizar('Escribidme a maria.lopez@aguas-cliente.es o a x@y.co'))
      .toBe('Escribidme a <email> o a <email>')
  })

  it('quita claves y tokens con formato conocido', () => {
    const t = anonimizar(
      'sk-ant-api03-abcdefghijklmnop ghp_abcdefghijklmnopqrstuvwxyz123456 ' +
      'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc api_key=supersecreto123',
    )
    expect(t).not.toMatch(/abcdefghijklmnop|eyJhbGci|supersecreto/)
    expect(t.match(/<clave>/g)).toHaveLength(4)
  })

  it('deja intacto lo que no es personal', () => {
    const linea = '[error] Milvus no responde en 127.0.0.1:19530 (WNTR 1.1.0, red villa_100_casas.inp)'
    expect(anonimizar(linea)).toBe(linea)
  })

  it('limpia una línea real del log del actualizador', () => {
    const real = "[2026-10-01 10:54:54.852] [info]  Checking for update in /home/rayne/.config/boorie"
    expect(anonimizar(real)).not.toContain('rayne')
  })
})
