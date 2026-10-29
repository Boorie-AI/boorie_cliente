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
  it('se guarda con el prefijo y sin la clave en claro', async () => {
    const valor = (await valorParaGuardar(CLAVE, { cifrador: cifradorDePrueba() }))!
    expect(valor.startsWith('enc:v1:')).toBe(true)
    expect(valor).not.toContain(CLAVE)
    expect(Buffer.from(valor.slice(7), 'base64').toString('utf8')).not.toContain(CLAVE)
  })

  it('y se lee igual que se guardó', async () => {
    const c = cifradorDePrueba()
    expect(await leerClave(await valorParaGuardar(CLAVE, { cifrador: c }), c)).toEqual({ clave: CLAVE, estado: 'ok', heredada: false })
  })

  it('una clave vacía no se cifra', async () => {
    expect(await valorParaGuardar('', { cifrador: cifradorDePrueba() })).toBe('')
  })
})

describe('sin llavero (R4, D3)', () => {
  it('no se guarda nada salvo que se pida sin cifrar', async () => {
    expect(await valorParaGuardar(CLAVE, { cifrador: SIN_CIFRADO })).toBeNull()
    expect(await valorParaGuardar(CLAVE, { cifrador: SIN_CIFRADO, permitirSinCifrar: true })).toBe(`plano:v1:${CLAVE}`)
  })

  it('lo guardado sin cifrar se lee y se marca como tal', async () => {
    expect(await leerClave(`plano:v1:${CLAVE}`, SIN_CIFRADO)).toEqual({ clave: CLAVE, estado: 'sinCifrado', heredada: false })
  })

  it('la de la sesión se usa y se dice que es de la sesión', async () => {
    guardarClaveDeSesion('NVIDIA', CLAVE)
    expect(await claveUtilizable('nvidia', '', SIN_CIFRADO)).toBe(CLAVE)
    expect(await estadoPublico('nvidia', '', SIN_CIFRADO)).toEqual({ tieneClave: true, estadoClave: 'sesion', finClave: 'mnop' })
  })

  it('en Linux con basic_text no hay cifrado aunque Electron diga que sí', async () => {
    const safe = (backend: string) => ({
      isAsyncEncryptionAvailable: async () => true,
      encryptStringAsync: async (t: string) => Buffer.from(t),
      decryptStringAsync: async (b: Buffer) => ({ result: b.toString() }),
      getSelectedStorageBackend: () => backend,
    })
    expect((await cifradorDeSafeStorage(safe('basic_text'), 'linux')).disponible()).toBe(false)
    expect((await cifradorDeSafeStorage(safe('unknown'), 'linux')).disponible()).toBe(false)
    expect((await cifradorDeSafeStorage(safe('gnome_libsecret'), 'linux')).disponible()).toBe(true)
    expect((await cifradorDeSafeStorage(safe('basic_text'), 'win32')).disponible()).toBe(true)
  })

  it('cifra y descifra con la API asíncrona de safeStorage (#307)', async () => {
    const safe = {
      isAsyncEncryptionAvailable: async () => true,
      encryptStringAsync: async (t: string) => Buffer.from(t.split('').reverse().join('')),
      decryptStringAsync: async (b: Buffer) => ({ result: b.toString().split('').reverse().join(''), shouldReEncrypt: false }),
    }
    const c = await cifradorDeSafeStorage(safe, 'win32')
    const valor = await valorParaGuardar(CLAVE, { cifrador: c })
    expect(valor).not.toContain(CLAVE)
    expect((await leerClave(valor, c)).clave).toBe(CLAVE)
  })

  it('si Electron dice que no, no hay', async () => {
    const safe = { isAsyncEncryptionAvailable: async () => false, encryptStringAsync: async () => Buffer.alloc(0), decryptStringAsync: async () => ({ result: '' }) }
    expect((await cifradorDeSafeStorage(safe, 'darwin')).disponible()).toBe(false)
  })
})

describe('una base copiada de otro equipo (R4b)', () => {
  it('la clave queda ilegible: ni se usa ni se pierde', async () => {
    const valor = await valorParaGuardar(CLAVE, { cifrador: cifradorDePrueba('equipo-a') })
    const otro = cifradorDePrueba('equipo-b')
    expect(await leerClave(valor, otro)).toEqual({ clave: null, estado: 'ilegible', heredada: false })
    expect(await claveUtilizable('nvidia', valor, otro)).toBeNull()
    expect(await estadoPublico('nvidia', valor, otro)).toEqual({ tieneClave: false, estadoClave: 'ilegible', finClave: null })
  })

  it('si se vuelve a pegar sin llavero, manda la de la sesión', async () => {
    const valor = await valorParaGuardar(CLAVE, { cifrador: cifradorDePrueba('equipo-a') })
    guardarClaveDeSesion('nvidia', 'nvapi-FAKEnuevaclave0000000000001234')
    expect(await claveUtilizable('nvidia', valor, SIN_CIFRADO)).toBe('nvapi-FAKEnuevaclave0000000000001234')
    expect((await estadoPublico('nvidia', valor, SIN_CIFRADO)).estadoClave).toBe('sesion')
  })
})

describe('lo que sale hacia la interfaz (D2)', () => {
  it('no lleva la clave: sólo si hay, su estado y los cuatro últimos', async () => {
    const c = cifradorDePrueba()
    const publico = await estadoPublico('nvidia', await valorParaGuardar(CLAVE, { cifrador: c }), c)
    expect(publico).toEqual({ tieneClave: true, estadoClave: 'ok', finClave: 'mnop' })
    expect(JSON.stringify(publico)).not.toContain(CLAVE)
  })

  it('una heredada en claro se dice sin cifrar', async () => {
    expect(await estadoPublico('nvidia', CLAVE, cifradorDePrueba())).toEqual({ tieneClave: true, estadoClave: 'sinCifrado', finClave: 'mnop' })
  })

  it('sin clave, nada', async () => {
    expect(await estadoPublico('openai', null, cifradorDePrueba())).toEqual({ tieneClave: false, estadoClave: null, finClave: null })
  })
})
