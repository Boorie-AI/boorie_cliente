/**
 * Lo que decide si una cita se marca como traducida (#160). El idioma guardado
 * en la base no sirve: los 301 documentos de una base real declaran castellano,
 * incluido el libro que está entero en inglés.
 */

import { describe, it, expect } from 'vitest'
import { idiomaDelTexto } from './idiomaDelTexto'

// Párrafos reales del corpus, recortados.
const INGLES = `The method of deriving a unit hydrograph involves selecting isolated storm
runoff caused by short spells of rainfall excess. For each of these storm hydrographs, the base
flow is separated by adopting one of the methods indicated in Sec. 6.4. The area under each
direct runoff hydrograph is evaluated and the volume of the direct runoff obtained is divided by
the catchment area to obtain the depth of effective rainfall.`

const CASTELLANO = `Este informe recoge los resultados de la simulación hidráulica de la red,
con los nudos que quedan por debajo del umbral de presión y las tuberías cuyo caudal supera el
valor recomendado. Para cada uno de ellos se indica el instante en que se detectó el problema y
la magnitud, según los criterios de la normativa aplicable sobre redes de distribución.`

const CATALAN = `Aquest informe recull els resultats de la simulació hidràulica de la xarxa, amb
els nusos que queden per sota del llindar de pressió i les canonades amb un cabal per sobre del
valor recomanat. Per a cadascun d'ells també s'indica quan es va detectar el problema, però
sobre els criteris de la normativa aplicable cap altra dada.`

describe('el idioma de un fragmento', () => {
  it('reconoce los tres idiomas de la aplicación', () => {
    expect(idiomaDelTexto(INGLES)).toBe('en')
    expect(idiomaDelTexto(CASTELLANO)).toBe('es')
    expect(idiomaDelTexto(CATALAN)).toBe('ca')
  })

  it('no decide con un texto demasiado corto', () => {
    expect(idiomaDelTexto('unit hydrograph')).toBeUndefined()
    expect(idiomaDelTexto('')).toBeUndefined()
    expect(idiomaDelTexto(undefined)).toBeUndefined()
  })

  it('no decide sobre una tabla de números y nombres propios', () => {
    // Ante la duda no se responde: marcar una cita como «traducida del …»
    // equivocándose de idioma es peor que no marcarla.
    const tabla = `Node J-101 J-102 J-103 J-104 J-105 J-106 J-107 J-108 J-109 J-110
      45.2 41.8 39.7 52.1 48.6 44.4 40.9 51.7 47.3 43.8 39.2 50.6 46.1 42.5 38.8 49.4`
    expect(idiomaDelTexto(tabla)).toBeUndefined()
  })

  it('no confunde castellano con catalán, que comparten mucho', () => {
    expect(idiomaDelTexto(CASTELLANO)).not.toBe('ca')
    expect(idiomaDelTexto(CATALAN)).not.toBe('es')
  })
})
