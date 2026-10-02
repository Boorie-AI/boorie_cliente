import type { Cifrador } from './clavesProveedor'

/**
 * Un cifrador para las pruebas que se comporta como `safeStorage` en lo que
 * importa: lo cifrado no contiene el texto, y lo cifrado en otra «máquina» no
 * se puede descifrar.
 */
export function cifradorDePrueba(maquina = 'equipo-a', disponible = true): Cifrador {
  const marca = `${maquina}|`
  return {
    disponible: () => disponible,
    cifrar: texto => Buffer.from(marca + Buffer.from(texto, 'utf8').toString('hex').split('').reverse().join(''), 'utf8'),
    descifrar: cifrado => {
      const t = cifrado.toString('utf8')
      if (!t.startsWith(marca)) throw new Error('Error while decrypting the ciphertext provided to safeStorage.decryptString.')
      return Buffer.from(t.slice(marca.length).split('').reverse().join(''), 'hex').toString('utf8')
    },
  }
}
