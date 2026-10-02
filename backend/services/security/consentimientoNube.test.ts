import { describe, it, expect, beforeEach } from 'vitest'
import {
  aceptarConsentimiento,
  alCambiarConsentimiento,
  cargarConsentimientos,
  CLAVE_CONSENTIMIENTO,
  consentimientosActuales,
  hayConsentimiento,
  retirarConsentimiento,
  VERSION_CONSENTIMIENTO,
} from './consentimientoNube'

function base() {
  const filas = new Map<string, string>()
  return {
    filas,
    appSetting: {
      findUnique: async ({ where }: { where: { key: string } }) => (filas.has(where.key) ? { value: filas.get(where.key)! } : null),
      upsert: async ({ where, create, update }: any) => { filas.set(where.key, filas.has(where.key) ? update.value : create.value) },
    },
  }
}

let prisma: ReturnType<typeof base>

beforeEach(async () => {
  prisma = base()
  await cargarConsentimientos(prisma)
})

describe('el consentimiento por proveedor (#225, R5, R9)', () => {
  it('sin aceptar no hay, y se guarda con versión y fecha', async () => {
    expect(hayConsentimiento('nvidia')).toBe(false)
    await aceptarConsentimiento(prisma, 'NVIDIA', new Date('2026-10-02T10:00:00Z'))
    expect(hayConsentimiento('nvidia')).toBe(true)
    expect(JSON.parse(prisma.filas.get(CLAVE_CONSENTIMIENTO)!)).toEqual({
      nvidia: { version: VERSION_CONSENTIMIENTO, fecha: '2026-10-02T10:00:00.000Z' },
    })
  })

  it('sobrevive a reiniciar: se lee de la base', async () => {
    await aceptarConsentimiento(prisma, 'openai')
    await cargarConsentimientos({ appSetting: { ...prisma.appSetting } })
    expect(hayConsentimiento('OpenAI')).toBe(true)
  })

  it('una versión anterior del texto ya no vale', async () => {
    prisma.filas.set(CLAVE_CONSENTIMIENTO, JSON.stringify({ nvidia: { version: VERSION_CONSENTIMIENTO - 1, fecha: '2026-01-01T00:00:00Z' } }))
    await cargarConsentimientos(prisma)
    expect(hayConsentimiento('nvidia')).toBe(false)
  })

  it('una constancia ilegible es que no consta', async () => {
    prisma.filas.set(CLAVE_CONSENTIMIENTO, 'esto no es json')
    await cargarConsentimientos(prisma)
    expect(consentimientosActuales()).toEqual({})
    prisma.filas.set(CLAVE_CONSENTIMIENTO, JSON.stringify({ nvidia: { fecha: 'hoy' } }))
    await cargarConsentimientos(prisma)
    expect(hayConsentimiento('nvidia')).toBe(false)
  })

  it('se retira por proveedor, sin tocar los demás (R7)', async () => {
    await aceptarConsentimiento(prisma, 'nvidia')
    await aceptarConsentimiento(prisma, 'anthropic')
    await retirarConsentimiento(prisma, 'NVIDIA')
    expect(hayConsentimiento('nvidia')).toBe(false)
    expect(hayConsentimiento('anthropic')).toBe(true)
  })

  it('avisa a quien tenga que reiniciarse', async () => {
    let avisos = 0
    const quitar = alCambiarConsentimiento(() => { avisos++ })
    await aceptarConsentimiento(prisma, 'nvidia')
    await retirarConsentimiento(prisma, 'nvidia')
    quitar()
    await aceptarConsentimiento(prisma, 'nvidia')
    expect(avisos).toBe(2)
  })
})
