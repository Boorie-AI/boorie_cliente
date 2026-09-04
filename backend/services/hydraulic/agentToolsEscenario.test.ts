/**
 * La herramienta que traduce «¿y si se pierde el control de las bombas 4 horas?»
 * a una definición ejecutable (#44).
 *
 * Lo que se vigila aquí es lo que separa esta herramienta de un fallo caro: que
 * **no ejecute nada** y que valide los elementos contra la red antes de
 * proponer. Si el modelo inventa una bomba, el usuario tiene que verlo antes de
 * darle a ejecutar, no después de esperar dos simulaciones de periodo extendido.
 */

import { describe, it, expect } from 'vitest'
import { ejecutarHerramienta, HERRAMIENTAS, type RedCompleta } from './agentTools'

const red: RedCompleta = {
  nodes: [
    { id: '10', type: 'junction', demand: 0.01 },
    { id: '11', type: 'junction', demand: 0.02 },
    { id: 'R1', type: 'reservoir', total_head: 100 },
    { id: 'T1', type: 'tank' },
  ],
  links: [
    { id: 'P1', type: 'pipe', from: '10', to: '11' },
    { id: 'B1', type: 'pump', from: 'R1', to: '10' },
    { id: 'B2', type: 'pump', from: 'R1', to: '11' },
  ],
}

const proponer = (argumentos: Record<string, unknown>) =>
  ejecutarHerramienta('proponer_escenario', argumentos, { red })

describe('proponer_escenario', () => {
  it('está ofrecida al agente y dice que no ejecuta', async () => {
    const definicion = HERRAMIENTAS.find(h => h.nombre === 'proponer_escenario')
    expect(definicion).toBeDefined()
    expect(definicion!.descripcion).toContain('NO ejecuta')
  })

  it('traduce el caso del criterio de aceptación: control perdido 4 horas', async () => {
    const r = await proponer({ tipo: 'control_loss', elementos: ['B1', 'B2'], desde_h: 0, duracion_h: 4 })

    expect(r.requiere_confirmacion).toBe(true)
    const evento = (r.definicion as any).eventos[0]
    expect(evento).toMatchObject({
      tipo: 'control_loss',
      alcance: 'todos',
      congelar: ['B1', 'B2'],
      congelar_en: 'cerrado',
      desde_h: 0,
      hasta_h: 4,
    })
    expect(r.resumen).toContain('4')
  })

  it('nunca devuelve resultados de simulación: sólo la propuesta', async () => {
    const r = await proponer({ tipo: 'pump_outage', elementos: ['B1'], duracion_h: 2 })

    // Si alguna de estas claves apareciera, la herramienta habría simulado, y el
    // usuario no habría confirmado nada.
    for (const prohibida of ['unmet_demand', 'population', 'nodes_below_minimum_pressure']) {
      expect(r).not.toHaveProperty(prohibida)
    }
    expect(r.propuesta).toBe(true)
  })

  it('valida los elementos contra la red y señala los que no existen', async () => {
    const r = await proponer({ tipo: 'pump_outage', elementos: ['B1', 'B99'] })

    expect((r.definicion as any).eventos[0].elementos).toEqual(['B1'])
    expect(r.elementos_inexistentes).toEqual([
      expect.objectContaining({ id: 'B99' }),
    ])
  })

  it('si no existe ninguno, no propone nada', async () => {
    const r = await proponer({ tipo: 'pipe_break', elementos: ['no-existe'] })

    expect(r.error).toContain('Ninguno')
    expect(r.definicion).toBeUndefined()
  })

  it('acepta los ids como los escriba el modelo, sin distinguir mayúsculas', async () => {
    const r = await proponer({ tipo: 'pump_outage', elementos: ['b1'] })
    // Se devuelve el id **de la red**, no el que escribió el modelo: es el que
    // el motor va a buscar.
    expect((r.definicion as any).eventos[0].elementos).toEqual(['B1'])
  })

  it('sin elementos ofrece los candidatos de la red en vez de un error seco', async () => {
    const r = await proponer({ tipo: 'pump_outage' })

    expect(r.error).toContain('necesita al menos un elemento')
    expect(r.candidatos_en_la_red).toEqual(['B1', 'B2'])
  })

  it('la pérdida de control sí puede no llevar elementos: es la red entera', async () => {
    const r = await proponer({ tipo: 'control_loss' })

    expect(r.requiere_confirmacion).toBe(true)
    expect((r.definicion as any).eventos[0]).toMatchObject({ tipo: 'control_loss', alcance: 'todos' })
    expect((r.definicion as any).eventos[0].congelar).toBeUndefined()
  })

  it('la sobredemanda sin multiplicador usable coge el doble', async () => {
    const r = await proponer({ tipo: 'demand_surge', nudos: ['10'], multiplicador: 0.5 })
    expect((r.definicion as any).eventos[0].multiplicador).toBe(2)
  })

  it('la sequía sin factor usable baja el origen a la mitad', async () => {
    const r = await proponer({ tipo: 'source_reduction', elementos: ['R1'], factor: 3 })
    expect((r.definicion as any).eventos[0].factor).toBe(0.5)
  })

  it('sin duración el evento dura hasta el final, y así lo dice', async () => {
    const r = await proponer({ tipo: 'pump_outage', elementos: ['B1'], desde_h: 6 })

    expect((r.definicion as any).eventos[0].hasta_h).toBeUndefined()
    expect(r.resumen).toContain('hasta el final')
  })

  it('un tipo inventado se rechaza enumerando los válidos', async () => {
    const r = await proponer({ tipo: 'apagon_total', elementos: ['B1'] })
    expect(r.error).toContain('pump_outage')
  })
})
