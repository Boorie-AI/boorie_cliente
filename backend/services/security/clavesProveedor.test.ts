import { describe, it, expect, afterEach } from 'vitest'
import {
  cifradorDeSafeStorage,
  claveUtilizable,
  estadoPublico,
  guardarClaveDeSesion,
  leerClave,
  olvidarClavesDeSesion,
  valorParaGuardar,
  SIN_CIFRADO,
} from './clavesProveedor'
import { cifradorDePrueba } from './cifradorDePrueba'

const CLAVE = 'nvapi-FAKE0123456789abcdefghijklmnop'

afterEach(() => olvidarClavesDeSesion())

describe('cifrar la clave de un proveedor (#225, R1)', () => {
  it('se guarda con el prefijo y sin la clave en claro', () => {
    const valor = valorParaGuardar(CLAVE, { cifrador: cifradorDePrueba() })!
    expect(valor.startsWith('enc:v1:')).toBe(true)
    expect(valor).not.toContain(CLAVE)
    expect(Buffer.from(valor.slice(7), 'base64').toString('utf8')).not.toContain(CLAVE)
  })

  it('y se lee igual que se guardó', () => {
    const c = cifradorDePrueba()
    expect(leerClave(valorParaGuardar(CLAVE, { cifrador: c }), c)).toEqual({ clave: CLAVE, estado: 'ok', heredada: false })
  })

  it('una clave vacía no se cifra', () => {
    expect(valorParaGuardar('', { cifrador: cifradorDePrueba() })).toBe('')
  })
})

describe('sin llavero (R4, D3)', () => {
  it('no se guarda nada salvo que se pida sin cifrar', () => {
    expect(valorParaGuardar(CLAVE, { cifrador: SIN_CIFRADO })).toBeNull()
    expect(valorParaGuardar(CLAVE, { cifrador: SIN_CIFRADO, permitirSinCifrar: true })).toBe(`plano:v1:${CLAVE}`)
  })

  it('lo guardado sin cifrar se lee y se marca como tal', () => {
    expect(leerClave(`plano:v1:${CLAVE}`, SIN_CIFRADO)).toEqual({ clave: CLAVE, estado: 'sinCifrado', heredada: false })
  })

  it('la de la sesión se usa y se dice que es de la sesión', () => {
    guardarClaveDeSesion('NVIDIA', CLAVE)
    expect(claveUtilizable('nvidia', '', SIN_CIFRADO)).toBe(CLAVE)
    expect(estadoPublico('nvidia', '', SIN_CIFRADO)).toEqual({ tieneClave: true, estadoClave: 'sesion', finClave: 'mnop' })
  })

  it('en Linux con basic_text no hay cifrado aunque Electron diga que sí', () => {
    const safe = (backend: string) => ({
      isEncryptionAvailable: () => true,
      encryptString: (t: string) => Buffer.from(t),
      decryptString: (b: Buffer) => b.toString(),
      getSelectedStorageBackend: () => backend,
    })
    expect(cifradorDeSafeStorage(safe('basic_text'), 'linux').disponible()).toBe(false)
    expect(cifradorDeSafeStorage(safe('unknown'), 'linux').disponible()).toBe(false)
    expect(cifradorDeSafeStorage(safe('gnome_libsecret'), 'linux').disponible()).toBe(true)
    expect(cifradorDeSafeStorage(safe('basic_text'), 'win32').disponible()).toBe(true)
  })

  it('si Electron dice que no, no hay', () => {
    const safe = { isEncryptionAvailable: () => false, encryptString: () => Buffer.alloc(0), decryptString: () => '' }
    expect(cifradorDeSafeStorage(safe, 'darwin').disponible()).toBe(false)
  })
})

describe('una base copiada de otro equipo (R4b)', () => {
  it('la clave queda ilegible: ni se usa ni se pierde', () => {
    const valor = valorParaGuardar(CLAVE, { cifrador: cifradorDePrueba('equipo-a') })
    const otro = cifradorDePrueba('equipo-b')
    expect(leerClave(valor, otro)).toEqual({ clave: null, estado: 'ilegible', heredada: false })
    expect(claveUtilizable('nvidia', valor, otro)).toBeNull()
    expect(estadoPublico('nvidia', valor, otro)).toEqual({ tieneClave: false, estadoClave: 'ilegible', finClave: null })
  })

  it('si se vuelve a pegar sin llavero, manda la de la sesión', () => {
    const valor = valorParaGuardar(CLAVE, { cifrador: cifradorDePrueba('equipo-a') })
    guardarClaveDeSesion('nvidia', 'nvapi-FAKEnuevaclave0000000000001234')
    expect(claveUtilizable('nvidia', valor, SIN_CIFRADO)).toBe('nvapi-FAKEnuevaclave0000000000001234')
    expect(estadoPublico('nvidia', valor, SIN_CIFRADO).estadoClave).toBe('sesion')
  })
})

describe('lo que sale hacia la interfaz (D2)', () => {
  it('no lleva la clave: sólo si hay, su estado y los cuatro últimos', () => {
    const c = cifradorDePrueba()
    const publico = estadoPublico('nvidia', valorParaGuardar(CLAVE, { cifrador: c }), c)
    expect(publico).toEqual({ tieneClave: true, estadoClave: 'ok', finClave: 'mnop' })
    expect(JSON.stringify(publico)).not.toContain(CLAVE)
  })

  it('una heredada en claro se dice sin cifrar', () => {
    expect(estadoPublico('nvidia', CLAVE, cifradorDePrueba())).toEqual({ tieneClave: true, estadoClave: 'sinCifrado', finClave: 'mnop' })
  })

  it('sin clave, nada', () => {
    expect(estadoPublico('openai', null, cifradorDePrueba())).toEqual({ tieneClave: false, estadoClave: null, finClave: null })
  })
})
