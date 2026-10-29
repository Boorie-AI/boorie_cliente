import { describe, it, expect, vi, beforeEach } from 'vitest'

const isAsyncEncryptionAvailable = vi.fn(async () => true)
vi.mock('electron', () => ({
  safeStorage: {
    isAsyncEncryptionAvailable: () => isAsyncEncryptionAvailable(),
    encryptStringAsync: async (t: string) => Buffer.from('v11' + t.split('').reverse().join('')),
    decryptStringAsync: async (b: Buffer) => {
      const t = b.toString()
      if (!t.startsWith('v11')) throw new Error('Error while decrypting the ciphertext provided to safeStorage.decryptStringAsync.')
      return { result: t.slice(3).split('').reverse().join(''), shouldReEncrypt: false }
    },
  },
}))

let TokenSecurityService: typeof import('./token.security.service').TokenSecurityService
beforeEach(async () => {
  vi.resetModules()
  isAsyncEncryptionAvailable.mockClear()
  ;({ TokenSecurityService } = await import('./token.security.service'))
})

describe('tokens con la API asíncrona de safeStorage (#307)', () => {
  it('no pregunta por el llavero al construirse, sino al usarlo, y una sola vez', async () => {
    const servicio = new TokenSecurityService()
    expect(isAsyncEncryptionAvailable).not.toHaveBeenCalled()

    const cifrado = await servicio.encryptToken('ya29.token')
    expect(Buffer.from(cifrado, 'base64').toString()).not.toContain('ya29.token')
    expect(await servicio.decryptToken(cifrado)).toBe('ya29.token')
    expect(isAsyncEncryptionAvailable).toHaveBeenCalledTimes(1)
  })

  it('lee el token que una versión anterior dejó sólo en base64', async () => {
    const servicio = new TokenSecurityService()
    expect(await servicio.decryptToken(Buffer.from('ya29.antiguo').toString('base64'))).toBe('ya29.antiguo')
  })

  it('sin llavero, guarda y lee en base64', async () => {
    isAsyncEncryptionAvailable.mockResolvedValueOnce(false)
    const servicio = new TokenSecurityService()
    const guardado = await servicio.encryptToken('ya29.token')
    expect(Buffer.from(guardado, 'base64').toString()).toBe('ya29.token')
    expect((await servicio.getEncryptionInfo()).isAvailable).toBe(false)
  })
})
