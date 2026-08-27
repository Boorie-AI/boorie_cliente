import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useSimulationTimeline } from './useSimulationTimeline'

/**
 * La reproducción de la simulación (#45), y el fallo que la dejaba muerta.
 *
 * El avance se calcula con el reloj real, así que para probarlo hay que poder
 * mandar sobre los dos: los fotogramas y la hora. Se sustituyen los dos.
 */
let pendientes: FrameRequestCallback[] = []
let ahora = 0

const frame = (ms: number) => {
  ahora += ms
  const cbs = pendientes
  pendientes = []
  act(() => { cbs.forEach(cb => cb(ahora)) })
}

/** Una simulación de 10 pasos de una hora. */
const TIMESTAMPS = Array.from({ length: 10 }, (_, i) => i * 3600)

beforeEach(() => {
  pendientes = []
  ahora = 0
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { pendientes.push(cb); return pendientes.length })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.spyOn(performance, 'now').mockImplementation(() => ahora)
})

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

/**
 * Monta el hook reproduciendo, con el paso viviendo fuera como en el visor: lo
 * que el hook emite vuelve a entrar como propiedad. Sin esa vuelta, la prueba no
 * se parece a la aplicación —allí `onPaso` es un `setState`— y el propio avance
 * normal parecería roto.
 */
function reproductor(pasoInicial = 0) {
  let paso = pasoInicial
  let rerender: (props: { paso: number }) => void = () => {}

  const onPaso = vi.fn((siguiente: number) => {
    paso = siguiente
    rerender({ paso })
  })

  const render = renderHook(
    ({ paso: p }: { paso: number }) => useSimulationTimeline({
      timestamps: TIMESTAMPS,
      paso: p,
      reproduciendo: true,
      velocidad: 1,
      onPaso,
    }),
    { initialProps: { paso: pasoInicial } }
  )
  rerender = render.rerender

  /** Un salto del usuario: mueve el paso sin pasar por la reproducción. */
  return { onPaso, irA: (n: number) => { paso = n; act(() => rerender({ paso })) } }
}

describe('la reproducción avanza con el reloj real', () => {
  it('emite un paso por segundo a velocidad 1x', () => {
    const { onPaso } = reproductor(0)

    frame(1000)
    expect(onPaso).toHaveBeenLastCalledWith(1)

    frame(1000)
    expect(onPaso).toHaveBeenLastCalledWith(2)
  })

  it('un fotograma antes de tiempo no adelanta el paso', () => {
    const { onPaso } = reproductor(0)
    frame(300)
    expect(onPaso).not.toHaveBeenCalled()
  })
})

describe('volver a arrancar después de mover el paso a mano', () => {
  /**
   * El fallo que llegó desde la aplicación: pulsar «stop» —que lleva el paso a
   * cero— dejaba el reproductor muerto, y «play» ya no volvía a arrancarlo.
   *
   * La causa no era el botón. Al mover el paso por fuera, el último paso emitido
   * quedaba desfasado, y con él la condición que recoloca el origen del reloj se
   * cumplía en **todos** los fotogramas: recolocando siempre, no llegaba a
   * acumularse un paso entero nunca. Por eso las pruebas de aquí gastan un
   * fotograma en la recolocación y miden desde el siguiente.
   */
  it('sigue avanzando después de que el usuario lo lleve al principio', () => {
    const { onPaso, irA } = reproductor(0)

    frame(1000)
    frame(1000)
    expect(onPaso).toHaveBeenLastCalledWith(2)

    // «Stop»: el visor pone el paso a cero sin pasar por la reproducción.
    onPaso.mockClear()
    irA(0)

    frame(16)   // el fotograma que recoloca el reloj en el salto
    expect(onPaso).not.toHaveBeenCalled()

    frame(1000)
    expect(onPaso).toHaveBeenLastCalledWith(1)
  })

  it('y después de arrastrar la barra a cualquier punto', () => {
    const { onPaso, irA } = reproductor(0)

    frame(1000)
    onPaso.mockClear()
    irA(6)

    frame(16)
    frame(1000)
    expect(onPaso).toHaveBeenLastCalledWith(7)
  })

  it('el salto recoloca el reloj: no se arrastra el tiempo de antes', () => {
    const { onPaso, irA } = reproductor(0)

    // Casi un paso acumulado, y ningún salto todavía.
    frame(900)
    expect(onPaso).not.toHaveBeenCalled()

    irA(4)
    frame(16)

    // Desde el salto hace falta un segundo entero, no la décima que faltaba.
    frame(200)
    expect(onPaso).not.toHaveBeenCalled()

    frame(900)
    expect(onPaso).toHaveBeenLastCalledWith(5)
  })

  it('al llegar al final vuelve a empezar', () => {
    const { onPaso } = reproductor(9)

    frame(1000)
    expect(onPaso).toHaveBeenLastCalledWith(0)
  })
})
