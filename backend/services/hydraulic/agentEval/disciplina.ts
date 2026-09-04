/**
 * Puntuar la **respuesta escrita**, no la llamada a la herramienta (#119, fase 5).
 *
 * La fase 4 mide si el modelo elige bien. Lo que quedaba sin medir es si
 * *obedece* la disciplina de `promptDelAgente.ts`: que toda cifra lleve su
 * unidad, que no dé impacto sin simular, y que cite con la marca de la fase 2.
 *
 * Estaba anotado como «pide o un humano o un modelo juez». Dos de las tres no
 * lo piden: se leen del propio texto. Y la de las citas es además el riesgo que
 * la fase 2 dejó escrito y nadie comprueba —«una cita (F1) que el lector no
 * puede resolver es peor que ninguna cita, porque parece comprobable y no lo
 * es»—, así que va aquí, determinista y dentro de `npm test`.
 *
 * Módulo puro, como el resto del contexto del agente: recibe el texto de la
 * respuesta y devuelve fallos. Se puede probar entero sin modelo delante.
 *
 * **Conservador a propósito.** Un medidor que grita donde no hay falta da un
 * número peor que no tener número: es la misma razón por la que la batería del
 * modelo se salta sin modelo en vez de medir a medias. Así que sólo se mira
 * donde el propio texto dice qué es la cifra —«la presión es de 45,2»—, y no
 * cada número que aparezca: «el nudo 101», «5 tuberías» o «página 4» no llevan
 * unidad porque no son magnitudes.
 */

interface Magnitud {
  nombre: string
  /** Cómo la nombra el texto. Sin tilde también: el modelo no siempre la pone. */
  palabras: string[]
  /** Las unidades que le corresponden, símbolo y palabra. */
  unidades: string[]
}

const MAGNITUDES: Magnitud[] = [
  {
    nombre: 'presión',
    palabras: ['presión', 'presion', 'presiones'],
    unidades: ['mca', 'm.c.a.', 'mH2O', 'bar', 'bares', 'kPa', 'Pa', 'psi', 'm', 'metros'],
  },
  {
    nombre: 'caudal',
    palabras: ['caudal', 'demanda', 'consumo'],
    unidades: ['l/s', 'L/s', 'm³/s', 'm3/s', 'm³/h', 'm3/h', 'gpm', 'litros por segundo'],
  },
  {
    nombre: 'diámetro',
    palabras: ['diámetro', 'diametro', 'diámetros', 'diametros'],
    unidades: ['mm', 'cm', 'm', 'in', 'pulgadas', 'milímetros', 'milimetros', 'metros'],
  },
  {
    nombre: 'longitud',
    palabras: ['longitud', 'longitudes'],
    unidades: ['m', 'km', 'mm', 'ft', 'metros', 'kilómetros', 'kilometros'],
  },
  {
    nombre: 'cota',
    palabras: ['cota', 'elevación', 'elevacion'],
    unidades: ['m', 'msnm', 'metros'],
  },
  {
    nombre: 'velocidad',
    palabras: ['velocidad', 'velocidades'],
    unidades: ['m/s', 'ft/s', 'km/h'],
  },
  {
    nombre: 'pérdida de carga',
    palabras: ['pérdida de carga', 'perdida de carga'],
    unidades: ['m', 'mca', 'm.c.a.', 'kPa', 'bar', 'metros'],
  },
  {
    nombre: 'potencia',
    palabras: ['potencia'],
    unidades: ['kW', 'W', 'CV', 'HP', 'hp', 'kilovatios'],
  },
  {
    nombre: 'energía',
    palabras: ['energía', 'energia'],
    unidades: ['kWh', 'MWh', 'J', 'kJ'],
  },
]

/** Todas las que el medidor sabe reconocer, para distinguir «sin unidad» de «con otra». */
const TODAS_LAS_UNIDADES = [
  ...new Set(MAGNITUDES.flatMap(m => m.unidades)),
  // Las que no pertenecen a ninguna magnitud de la tabla pero son unidad igual:
  // si aparecen, la cifra no está desnuda.
  '%', 'g', 'h', 's', 'min', '°C', 'm²', 'cm²', 'm³', 'km²', 'años', 'año',
]

const escapar = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Alternancia con las largas primero: `m³/s` tiene que ganarle a `m`. */
const alternancia = (unidades: string[]) =>
  [...unidades].sort((a, b) => b.length - a.length).map(escapar).join('|')

const NUMERO = '-?\\d+(?:[.,]\\d+)*'

/**
 * La unidad va pegada o separada del número, y detrás no puede seguir una letra
 * —`45 metros` sí, `45 metálicas` no— para que `m` no se coma media palabra.
 */
const unidadTras = (unidades: string[]) =>
  `\\s*(?:${alternancia(unidades)})(?![\\p{L}\\d])`

export interface FalloDisciplina {
  regla: 'unidades' | 'citas' | 'impacto'
  detalle: string
}

/**
 * Cifras de una magnitud que el texto nombra, escritas sin su unidad o con la
 * unidad de otra magnitud.
 *
 * Es la familia de fallos que más ha reaparecido en el producto: l/s donde
 * había m³/s en el comparador (v1.25.0) y en energía (v1.27.0), la fracción
 * mostrada como porcentaje (v1.26.0), las tres cifras sin rótulo.
 */
export function fallosDeUnidades(respuesta: string): FalloDisciplina[] {
  const fallos: FalloDisciplina[] = []

  for (const magnitud of MAGNITUDES) {
    // Entre la magnitud y su cifra sólo se admiten enlaces —«es de», «media
    // de», «:»— y nunca otro sustantivo, que sería su dueño: en «la presión en
    // el nudo 101» el 101 es del nudo, no de la presión.
    const enlace = '(?:\\s+(?:es|son|de|del|media|medio|máxima|maxima|mínima|minima|total|base|resultante|estimada|aproximada))*\\s*(?:de|:|=)?\\s*'
    const patron = new RegExp(
      `(?:${alternancia(magnitud.palabras)})${enlace}(${NUMERO})(${unidadTras(TODAS_LAS_UNIDADES)})?`,
      'giu'
    )

    for (const m of respuesta.matchAll(patron)) {
      const cifra = m[1]
      const unidad = m[2]?.trim()

      if (!unidad) {
        fallos.push({
          regla: 'unidades',
          detalle: `«${magnitud.nombre} ... ${cifra}» sin unidad`,
        })
        continue
      }

      const propia = new RegExp(`^(?:${alternancia(magnitud.unidades)})$`, 'iu').test(unidad)
      if (!propia) {
        fallos.push({
          regla: 'unidades',
          detalle: `${magnitud.nombre} en ${unidad}: no es unidad de ${magnitud.nombre} (${cifra} ${unidad})`,
        })
      }
    }
  }

  return fallos
}

/**
 * Citas que el lector no puede resolver.
 *
 * `marcaDeFuente` numera desde 1 y `MessageBubble` pinta la lista en el mismo
 * orden, así que una marca fuera de ese rango apunta a una fuente que no
 * existe. Es el fallo que la fase 2 dejó nombrado sin nada que lo comprobara.
 */
export function fallosDeCitas(respuesta: string, numeroDeFuentes: number): FalloDisciplina[] {
  const marcas = [...respuesta.matchAll(/\bF(\d+)\b/g)].map(m => Number(m[1]))

  return [...new Set(marcas)]
    .filter(n => n < 1 || n > numeroDeFuentes)
    .map(n => ({
      regla: 'citas' as const,
      detalle: numeroDeFuentes
        ? `cita (F${n}) y sólo hay ${numeroDeFuentes} fuente(s)`
        : `cita (F${n}) sin que se le haya dado ninguna fuente`,
    }))
}

/**
 * Vocabulario de impacto: servicio y presión, que es lo que la disciplina
 * prohíbe cifrar sin simular. **No** entra aquí cuántas tuberías fallan: eso
 * sale de `curva_fragilidad`, que es una herramienta y no una simulación.
 */
const IMPACTO = [
  'sin servicio', 'sin suministro', 'sin agua', 'sin abastecimiento',
  'pierde presión', 'pierden presión', 'pérdida de presión', 'perdida de presion',
  'caída de presión', 'caida de presion', 'presión resultante', 'presion resultante',
  'nudos afectados', 'población afectada', 'poblacion afectada',
]

/**
 * Lo que dice una respuesta que **está obedeciendo** la regla.
 *
 * «No puedo decirte cuántos de los 92 nudos se quedarían sin servicio sin
 * simular» lleva cifra y vocabulario de impacto, y es exactamente la respuesta
 * que la disciplina pide. Sin esta salvedad, el medidor castigaría el acierto
 * —y un medidor que castiga el acierto empuja en la dirección contraria—.
 */
const SALVEDADES = [
  // «no se» a secas no vale: aparece en «no se recuperan hasta las 6 h», y
  // taparía la falta de la misma frase que la comete.
  'no puedo', 'no sé', 'no se puede', 'no se sabe', 'no dispongo', 'no tengo',
  'sin simular', 'habría que simular', 'habria que simular', 'hay que simular',
  'no se ha simulado', 'requiere simular', 'requiere una simulación',
  'necesita una simulación', 'necesita una simulacion', 'tras confirmar',
  'una vez ejecut', 'hay que ejecutar', 'para saberlo',
]

/**
 * Los sustantivos que son dueños del número que llevan detrás. En «la tubería
 * 329 deja sin servicio» el 329 es el nombre de la tubería, no una cifra de
 * impacto; en «23 nudos sin servicio» sí lo es, y ahí el número va delante.
 */
const IDENTIFICADORES = [
  'nudo', 'nudos', 'junction', 'tubería', 'tuberia', 'tuberías', 'tuberias',
  'válvula', 'valvula', 'bomba', 'bombas', 'depósito', 'deposito',
  'sección', 'seccion', 'página', 'pagina', 'F',
]

/**
 * Cifras de impacto sin nada detrás.
 *
 * En la batería **ninguna** herramienta simula: `curva_fragilidad` evalúa una
 * lognormal y `calcular` es la calculadora; los dos análisis que sí simularían
 * —`proponer_analisis`, `proponer_escenario`— sólo proponen, y los ejecuta el
 * usuario. De modo que una cifra de servicio o de presión en la respuesta no
 * puede venir de ninguna parte.
 */
export function fallosDeImpacto(respuesta: string): FalloDisciplina[] {
  // El `(?<![\\d.,])` no es adorno: sin él el motor retrocede y casa «29» dentro
  // de «tubería 329», donde lo que precede al 29 es un 3 y no el sustantivo.
  const noEsIdentificador = `(?<!(?:${alternancia(IDENTIFICADORES)})\\s)(?<![\\d.,])`
  const patron = new RegExp(
    `(?:${noEsIdentificador}(${NUMERO})[^.;\\n]{0,60}?(?:${alternancia(IMPACTO)})`
    + `|(?:${alternancia(IMPACTO)})[^.;\\n]{0,60}?${noEsIdentificador}(${NUMERO}))`,
    'giu'
  )
  const salvedad = new RegExp(alternancia(SALVEDADES), 'iu')

  // La salvedad se busca en la frase entera, no en lo que casó: «no puedo» está
  // al principio y el vocabulario de impacto, al final.
  const frases = respuesta.split(/(?<=[.;!?\n])/)
  const fraseDe = (posicion: number): string => {
    let desde = 0
    for (const frase of frases) {
      if (posicion < desde + frase.length) return frase
      desde += frase.length
    }
    return respuesta
  }

  return [...respuesta.matchAll(patron)]
    .filter(m => !salvedad.test(fraseDe(m.index ?? 0)))
    .map(m => ({
      regla: 'impacto' as const,
      detalle: `cifra de impacto sin simular: «${m[0].trim()}»`,
    }))
}
export interface ResultadoDisciplina {
  id: string
  cumple: boolean
  fallos: FalloDisciplina[]
}

export function puntuarRespuesta(
  id: string,
  respuesta: string,
  opciones: { fuentes?: number } = {}
): ResultadoDisciplina {
  const fallos = [
    ...fallosDeUnidades(respuesta),
    ...fallosDeCitas(respuesta, opciones.fuentes ?? 0),
    ...fallosDeImpacto(respuesta),
  ]
  return { id, cumple: fallos.length === 0, fallos }
}

export interface MarcadorDisciplina {
  total: number
  cumplen: number
  porcentaje: number
  /** Cuántas respuestas incumplen cada regla, para saber por dónde empezar. */
  porRegla: Record<FalloDisciplina['regla'], number>
}

export function marcadorDeDisciplina(resultados: ResultadoDisciplina[]): MarcadorDisciplina {
  const cumplen = resultados.filter(r => r.cumple).length
  const porRegla = { unidades: 0, citas: 0, impacto: 0 }

  for (const r of resultados) {
    for (const regla of new Set(r.fallos.map(f => f.regla))) porRegla[regla]++
  }

  return {
    total: resultados.length,
    cumplen,
    porcentaje: resultados.length ? Math.round((cumplen / resultados.length) * 1000) / 10 : 0,
    porRegla,
  }
}
