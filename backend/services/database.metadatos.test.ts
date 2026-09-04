import { describe, it, expect } from 'vitest'
import { conMetadatosLeidos } from './database.service'

/**
 * `Message.metadata` viaja a la base como texto JSON y nadie lo deshacía al
 * leerlo. Se veía abriendo una conversación vieja: el mensaje salía y **sus
 * fuentes no**, porque `metadata.sources` sobre una cadena es `undefined`.
 *
 * Con las citas de la fase 2 (#119) eso deja de ser incómodo y pasa a estar
 * roto: una respuesta que dice «(F1)» sin la lista de fuentes al lado es una
 * cita que el lector no puede resolver.
 */
describe('los metadatos de un mensaje se leen al cargarlo', () => {
  const conFuentes = JSON.stringify({
    model: 'nemotron-mini',
    sources: [{ title: 'NOM-013', section: '4.2', page: 17 }],
  })

  it('devuelve las fuentes como objeto, no como cadena', () => {
    const c = conMetadatosLeidos({ id: 'c1', messages: [{ role: 'assistant', metadata: conFuentes }] })
    expect(c.messages[0].metadata.sources).toHaveLength(1)
    expect(c.messages[0].metadata.sources[0].section).toBe('4.2')
  })

  it('no toca lo que ya viene parseado ni lo que no tiene metadatos', () => {
    const ya = { sources: [] }
    const c = conMetadatosLeidos({
      messages: [{ metadata: ya }, { metadata: null }, { role: 'user' }],
    })
    expect(c.messages[0].metadata).toBe(ya)
    expect(c.messages[1].metadata).toBeNull()
    expect(c.messages[2].metadata).toBeUndefined()
  })

  it('un JSON malo pierde ese metadato y no la conversación entera', () => {
    // Hay filas escritas por versiones anteriores: que una tumbe la lista de
    // conversaciones sería mucho peor que perder el metadato de un mensaje.
    const c = conMetadatosLeidos({
      messages: [{ metadata: '{roto' }, { metadata: conFuentes }],
    })
    expect(c.messages[0].metadata).toBeNull()
    expect(c.messages[1].metadata.sources).toHaveLength(1)
  })

  it('una conversación sin mensajes pasa tal cual', () => {
    const vacia = { id: 'c2' }
    expect(conMetadatosLeidos(vacia)).toBe(vacia)
    expect(conMetadatosLeidos(null)).toBeNull()
  })
})
