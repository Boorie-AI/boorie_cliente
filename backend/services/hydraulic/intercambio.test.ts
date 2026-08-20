import { describe, it, expect } from 'vitest'
import {
  FORMATO,
  construirPaquete,
  describirPaquete,
  sumaDe,
  validarPaquete,
  type ContenidoPaquete,
} from './intercambio'

const RED = {
  nombre: 'Net3 2.inp',
  filename: 'Net3 2.inp',
  versionNumber: 3,
  changeNote: 'Antes de tocar la impulsión',
  creadaEl: '2026-03-15T10:00:00.000Z',
  origen: { networkId: 'n1', versionId: 'v3', proyecto: 'Net3 2' },
  networkData: { nodes: [{ id: 'J1', elevation: 100 }], links: [] },
  fileContent: '[JUNCTIONS]\n J1 100\n',
  coordinateSystem: { type: 'projected', declared_epsg: 'EPSG:32618' },
  summary: { junctions: 1, pipes: 0 },
}

const CONTENIDO: ContenidoPaquete = { etiqueta: 'Entrega de marzo', redes: [RED] }
const META = { generadoPor: 'Boorie 1.12.0', generadoEl: '2026-08-19T20:00:00.000Z' }

const empaquetar = (c: ContenidoPaquete = CONTENIDO) =>
  JSON.stringify(construirPaquete(c, META))

describe('ida y vuelta', () => {
  it('un paquete recién construido se valida y conserva lo que llevaba', () => {
    expect(validarPaquete(empaquetar())).toMatchObject({
      ok: true,
      paquete: {
        formato: FORMATO,
        contenido: {
          redes: [{ nombre: 'Net3 2.inp', fileContent: RED.fileContent, origen: { versionId: 'v3' } }],
        },
      },
    })
  })

  it('sobrevive a la ida y vuelta por fichero con campos opcionales vacíos', () => {
    // El fallo que se vio al probarlo de verdad: `JSON.stringify` descarta las
    // claves con `undefined`, así que al releer el paquete esa clave ya no está
    // y la suma calculada sobre el objeto original no cuadraba. Una red sin
    // sistema de coordenadas declarado no se podía importar en ninguna parte.
    const pelada = {
      ...RED,
      changeNote: undefined,
      coordinateSystem: undefined,
      origen: { networkId: 'n1', versionId: 'v1', proyecto: undefined },
    }
    const texto = JSON.stringify(construirPaquete({ redes: [pelada] }, META))

    expect(validarPaquete(texto).ok).toBe(true)
  })

  it('la suma no depende del orden en que se serialicen las claves', () => {
    // Sin esto, dos serializaciones del mismo contenido darían sumas distintas y
    // la comprobación fallaría por un motivo que no es el que busca.
    const a = { etiqueta: 'x', redes: [{ ...RED }] }
    const b = { redes: [{ ...RED }], etiqueta: 'x' } as ContenidoPaquete
    expect(sumaDe(a)).toBe(sumaDe(b))
  })

  it('describe lo que trae antes de importarlo', () => {
    const paquete = construirPaquete(CONTENIDO, META)
    expect(describirPaquete(paquete)).toBe('«Entrega de marzo», 1 red, exportado por Boorie 1.12.0')
  })
})

describe('lo que el formato tiene que rechazar', () => {
  it('un fichero que no es JSON', () => {
    expect(validarPaquete('esto no es un paquete')).toMatchObject({
      ok: false,
      error: expect.stringMatching(/no se puede leer como JSON/i),
    })
  })

  it('un JSON cualquiera que no dice ser un paquete', () => {
    expect(validarPaquete('{"algo": 1}')).toMatchObject({
      ok: false,
      error: expect.stringMatching(/no declara ser un paquete/i),
    })
  })

  it('un paquete de un formato posterior: lo dice, no lo lee a medias', () => {
    const p = JSON.parse(empaquetar())
    p.formato = 'boorie.red/9'

    expect(validarPaquete(JSON.stringify(p))).toMatchObject({
      ok: false,
      error: expect.stringMatching(/Actualiza Boorie/i),
    })
  })

  it('un paquete sin redes', () => {
    expect(validarPaquete(empaquetar({ redes: [] }))).toMatchObject({
      ok: false,
      error: expect.stringMatching(/ninguna red/i),
    })
  })

  it('una red a la que le falta el .inp', () => {
    const sinInp = { ...RED } as Partial<typeof RED>
    delete sinInp.fileContent
    expect(validarPaquete(empaquetar({ redes: [sinInp as never] }))).toMatchObject({
      ok: false,
      error: expect.stringMatching(/fileContent/),
    })
  })

  it('un fichero manipulado a mano', () => {
    // El caso que justifica la suma: alguien cambia un diámetro en el JSON y la
    // red importada sería silenciosamente distinta de la que se exportó.
    const p = JSON.parse(empaquetar())
    p.contenido.redes[0].networkData.nodes[0].elevation = 999

    expect(validarPaquete(JSON.stringify(p))).toMatchObject({
      ok: false,
      error: expect.stringMatching(/no coincide con su suma/i),
    })
  })

  it('un fichero truncado a mitad de copia', () => {
    const texto = empaquetar()
    expect(validarPaquete(texto.slice(0, Math.floor(texto.length * 0.8))).ok).toBe(false)
  })

  it('un paquete al que le han quitado la suma', () => {
    const p = JSON.parse(empaquetar())
    delete p.suma
    expect(validarPaquete(JSON.stringify(p))).toMatchObject({
      ok: false,
      error: expect.stringMatching(/suma de comprobación/i),
    })
  })
})
