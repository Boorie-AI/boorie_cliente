import { describe, it, expect } from 'vitest'
import { ONBOARDING_STEPS } from './onboardingPasos'
import es from '@/locales/es.json'
import en from '@/locales/en.json'
import ca from '@/locales/ca.json'

const resolver = (dic: unknown, clave: string) =>
  clave.split('.').reduce<any>((o, p) => o?.[p], dic)

/**
 * El recorrido de primer uso terminaba en la calculadora y dejaba al usuario
 * nuevo sin proyecto ni red, que es lo que el resto de la aplicación necesita
 * (criterio de aceptación del issue #33).
 */
describe('recorrido de primer uso', () => {
  it('termina conduciendo a crear proyecto e importar red', () => {
    const ultimo = ONBOARDING_STEPS[ONBOARDING_STEPS.length - 1]
    expect(ultimo.action).toBe('wntr')
    expect(ultimo.title).toBe('onboarding.red.title')
  })

  it('pasa por proyectos antes de la red', () => {
    const acciones: (string | undefined)[] = ONBOARDING_STEPS.map(paso => paso.action)
    expect(acciones.indexOf('projects')).toBeGreaterThan(-1)
    expect(acciones.indexOf('projects')).toBeLessThan(acciones.indexOf('wntr'))
  })

  it('todos los pasos apuntan a una vista real de la aplicación', () => {
    const vistas = ['chat', 'settings', 'wisdom', 'projects', 'calculator', 'wntr']
    for (const paso of ONBOARDING_STEPS) {
      if (paso.action) expect(vistas).toContain(paso.action)
    }
  })

  it('todos los textos existen en los tres idiomas', () => {
    for (const paso of ONBOARDING_STEPS) {
      for (const dic of [es, en, ca]) {
        expect(resolver(dic, paso.title), paso.title).toBeTruthy()
        expect(resolver(dic, paso.description), paso.description).toBeTruthy()
      }
    }
  })
})
