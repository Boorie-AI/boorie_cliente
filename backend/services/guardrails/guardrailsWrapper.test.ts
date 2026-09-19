/**
 * Que el rail de entrada obedezca a la pantalla de ajustes (#170).
 *
 * La regla de dominio se escribió primero en el renderer, por delante del rail,
 * y así los dos interruptores de Configuración → Guardrails habrían mentido:
 * apagar «Input rail» no habría dejado pasar nada, y el «Modo aviso» —que
 * promete registrar sin bloquear— habría bloqueado igual. Por eso la regla vive
 * ahora dentro de `validateInput`, después del interruptor y antes del envío a
 * Python, y por eso esto se prueba.
 *
 * No se levanta el proceso de Python: los casos que importan se resuelven antes
 * de hablar con él, y el que no —una pregunta del dominio— se comprueba viendo
 * que llega hasta el envío.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { guardrailsWrapper } from './guardrailsWrapper'

const FUERA = 'Cuantas hamburguesas puedo preparar con un kilo de carne?'
const DENTRO = '¿Qué presión mínima exige la norma en un nudo de consumo?'

/** El envío a Python, espiado: nunca debería ocurrir en los casos de dominio. */
const espiarEnvio = () =>
  vi.spyOn(guardrailsWrapper as unknown as { send: (c: string, p: unknown) => Promise<unknown> }, 'send')

beforeEach(() => {
  vi.restoreAllMocks()
  guardrailsWrapper.configure({ enabled: { input: true, retrieval: true, output: true, execution: true }, advisoryMode: false })
})

describe('el rail de entrada y los ajustes', () => {
  it('bloquea lo que no es del dominio, sin preguntarle a Python', async () => {
    const send = espiarEnvio()

    const v = await guardrailsWrapper.validateInput(FUERA)

    expect(v.allow).toBe(false)
    expect(v.reason).toContain('hamburguesas')
    expect(v.judge_model).toBe('regla-de-dominio')
    expect(send).not.toHaveBeenCalled()
  })

  it('con el rail apagado no bloquea nada: el interruptor manda', async () => {
    guardrailsWrapper.configure({ enabled: { input: false, retrieval: true, output: true, execution: true } })

    expect((await guardrailsWrapper.validateInput(FUERA)).allow).toBe(true)
  })

  it('en modo aviso registra pero deja pasar, como dice la pantalla', async () => {
    guardrailsWrapper.configure({ advisoryMode: true })

    const v = await guardrailsWrapper.validateInput(FUERA)

    expect(v.allow).toBe(true)
    // El prefijo es lo que hace que la auditoría lo guarde como violación no
    // bloqueante en lugar de descartarlo.
    expect(v.reason.startsWith('[advisory]')).toBe(true)
    expect(v.reason).toContain('hamburguesas')
  })

  it('una pregunta del dominio sí llega al juez', async () => {
    const send = espiarEnvio().mockResolvedValue({
      allow: true, reason: 'ok', severity: 'low', judge_model: 'nemotron-mini', judge_provider: 'ollama',
    })

    const v = await guardrailsWrapper.validateInput(DENTRO)

    expect(send).toHaveBeenCalledWith('validate_input', { text: DENTRO })
    expect(v.allow).toBe(true)
  })

  it('y si el juez no está, la pregunta pasa igual', async () => {
    espiarEnvio().mockRejectedValue(new Error('Python no responde'))

    const v = await guardrailsWrapper.validateInput(DENTRO)

    expect(v.allow).toBe(true)
    expect(v.reason).toContain('fail-open')
  })
})
