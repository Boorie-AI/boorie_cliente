import { describe, it, expect } from 'vitest'
import {
  construirLineaTiempo,
  duracionTotal,
  etiquetaCorta,
  etiquetaPaso,
  marcasEje,
} from './lineaTiempo'

/** 24 h reportando cada 15 min: 96 pasos más el instante inicial. */
const CADA_15_MIN = Array.from({ length: 97 }, (_, i) => i * 900)
const OPCIONES_15 = { duration: 86400, report_timestep: 900, start_clocktime: 0 }

describe('el eje sale de los datos, no de constantes', () => {
  it('un modelo que reporta cada 15 minutos avanza 15 minutos por paso', () => {
    // El caso del issue: antes cada paso sumaba una hora fija, así que el reloj
    // corría cuatro veces más rápido que la simulación.
    const linea = construirLineaTiempo(CADA_15_MIN, OPCIONES_15)

    expect(linea.pasos).toBe(97)
    expect(linea.intervalo).toBe(900)
    expect(etiquetaPaso(linea, 1, OPCIONES_15)).toBe('+00:15:00')
    expect(etiquetaPaso(linea, 4, OPCIONES_15)).toBe('+01:00:00')
    expect(etiquetaPaso(linea, 96, OPCIONES_15)).toBe('+24:00:00')
  })

  it('el reloj coincide con los 96 pasos de WNTR, uno a uno', () => {
    const linea = construirLineaTiempo(CADA_15_MIN, OPCIONES_15)
    for (let i = 0; i < linea.pasos; i++) {
      const segundos = i * 900
      const h = String(Math.floor(segundos / 3600)).padStart(2, '0')
      const m = String(Math.floor((segundos % 3600) / 60)).padStart(2, '0')
      expect(etiquetaPaso(linea, i, OPCIONES_15)).toBe(`+${h}:${m}:00`)
    }
  })

  it('respeta un paso de reporte cualquiera, no sólo los redondos', () => {
    const cada7 = [0, 420, 840, 1260]
    const linea = construirLineaTiempo(cada7, { report_timestep: 420 })
    expect(linea.intervalo).toBe(420)
    expect(etiquetaPaso(linea, 3, {})).toBe('+00:21:00')
  })

  it('sin timestamps reconstruye el eje con la duración y el paso del modelo', () => {
    const linea = construirLineaTiempo([], { duration: 3600, report_timestep: 1800 })
    expect(linea.segundos).toEqual([0, 1800, 3600])
  })

  it('sin nada de lo anterior no inventa un eje', () => {
    const linea = construirLineaTiempo(null, null)
    expect(linea.pasos).toBe(1)
    expect(linea.estacionaria).toBe(true)
  })
})

describe('la hora la declara el .inp, no Boorie', () => {
  it('sin hora declarada muestra tiempo transcurrido, con su signo', () => {
    const linea = construirLineaTiempo(CADA_15_MIN, OPCIONES_15)
    expect(linea.conReloj).toBe(false)
    expect(etiquetaPaso(linea, 0, OPCIONES_15)).toBe('+00:00:00')
  })

  it('con hora declarada muestra la hora del reloj', () => {
    // START CLOCKTIME 6:00 en el .inp.
    const opciones = { ...OPCIONES_15, start_clocktime: 6 * 3600 }
    const linea = construirLineaTiempo(CADA_15_MIN, opciones)

    expect(linea.conReloj).toBe(true)
    expect(etiquetaPaso(linea, 0, opciones)).toBe('06:00:00')
    expect(etiquetaPaso(linea, 1, opciones)).toBe('06:15:00')
  })

  it('al pasar de medianoche dice qué día es, en vez de repetir la hora', () => {
    const opciones = { ...OPCIONES_15, start_clocktime: 22 * 3600 }
    const linea = construirLineaTiempo(CADA_15_MIN, opciones)
    expect(etiquetaPaso(linea, 8, opciones)).toBe('00:00:00 (día 2)')
  })

  it('un cero en start_clocktime es «nadie puso hora», no medianoche', () => {
    const linea = construirLineaTiempo(CADA_15_MIN, { ...OPCIONES_15, start_clocktime: 0 })
    expect(linea.conReloj).toBe(false)
    expect(etiquetaPaso(linea, 4, OPCIONES_15)).toBe('+01:00:00')
  })
})

describe('estado estacionario', () => {
  it('una simulación de un solo paso se marca como estacionaria', () => {
    // Es lo que devuelve WNTR para el modo `single`: timestamps = [0].
    const linea = construirLineaTiempo([0], { report_timestep: 3600 })
    expect(linea.estacionaria).toBe(true)
    expect(linea.pasos).toBe(1)
    expect(marcasEje(linea, 12)).toHaveLength(1)
  })
})

describe('marcas del eje', () => {
  it('nunca miente sobre los extremos', () => {
    const linea = construirLineaTiempo(CADA_15_MIN, OPCIONES_15)
    const marcas = marcasEje(linea, 12, OPCIONES_15)

    expect(marcas[0].paso).toBe(0)
    expect(marcas[marcas.length - 1].paso).toBe(96)
    expect(marcas[marcas.length - 1].texto).toBe('+24:00')
    expect(marcas.length).toBeLessThanOrEqual(12)
  })

  it('no pide más marcas que pasos hay', () => {
    const linea = construirLineaTiempo([0, 3600, 7200], { report_timestep: 3600 })
    expect(marcasEje(linea, 12, {}).length).toBeLessThanOrEqual(3)
  })

  it('la etiqueta corta se queda en horas y minutos', () => {
    const linea = construirLineaTiempo(CADA_15_MIN, OPCIONES_15)
    expect(etiquetaCorta(linea, 1, OPCIONES_15)).toBe('+00:15')
  })

  it('una simulación de días también pierde los segundos en el eje', () => {
    // 168 h son tres dígitos de hora: con el recorte anterior el eje mezclaba
    // «+21:00» con «+105:00:00».
    const semana = Array.from({ length: 673 }, (_, i) => i * 900)
    const linea = construirLineaTiempo(semana, { report_timestep: 900 })

    expect(etiquetaCorta(linea, 672)).toBe('+168:00')
    expect(marcasEje(linea, 9).every(m => !/:\d{2}:\d{2}$/.test(m.texto))).toBe(true)
  })

  it('la duración total sale del último paso, no de la opción declarada', () => {
    // Una simulación que se corta antes de tiempo debe decir lo que duró.
    const linea = construirLineaTiempo([0, 3600, 7200], { duration: 86400 })
    expect(duracionTotal(linea)).toBe('02:00:00')
  })
})
