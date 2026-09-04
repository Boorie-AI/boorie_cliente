/**
 * La regla con la que se mide al agente (#119, fase 0).
 *
 * Un agente «entrenado» sin una medida de acierto no se puede ni afirmar ni
 * desmentir. Lo que ya existía —`ragQualityValidator` y `agentic-rag-metrics`—
 * puntúa lo *recuperado* y la operación: relevancia, densidad técnica, latencia.
 * Ninguna de las dos dice si la cifra que el agente da es la que sale del motor.
 *
 * Esto sí. Cada caso declara la pregunta en lenguaje natural, la herramienta que
 * debería resolverla, sus argumentos y el valor que tiene que salir. Los valores
 * esperados **no son de opinión**: se obtuvieron ejecutando los motores reales
 * sobre las redes guardadas, y cada caso dice de dónde viene el suyo.
 *
 * Dos comprobaciones distintas, y conviene no mezclarlas:
 *
 * - **La herramienta acierta.** Determinista, sin modelo por medio. Si la
 *   herramienta miente, el agente miente por mucho que elija bien.
 * - **El agente elige bien.** Depende del modelo y de un proveedor con clave.
 *   El caso ya declara `herramienta` y `argumentos` para poder puntuarlo cuando
 *   se enchufe, pero es otra corrida y otro coste.
 */

/** Una comprobación sobre el resultado de la herramienta. */
export interface Esperado {
  /**
   * Ruta con puntos dentro del resultado, con índices numéricos para las
   * listas: `elementos.0.id`. Se escribe la ruta y no un comparador entero
   * para que el informe de un fallo pueda decir qué campo falló.
   */
  ruta: string
  valor: unknown
  /**
   * Tolerancia **absoluta**, en la unidad del propio campo. Absoluta y no
   * relativa a propósito: en hidráulica el margen que se admite se piensa en
   * la unidad —medio metro de cota, una décima de l/s—, no en un porcentaje.
   * Sin tolerancia, la comparación es exacta.
   */
  tolerancia?: number
}

export interface CasoAgente {
  id: string
  /** Tal como la escribiría el usuario. Es lo que se le dará al modelo. */
  pregunta: string
  /** Nombre de la red guardada, en la base. */
  red: string
  herramienta: string
  argumentos: Record<string, unknown>
  espera: Esperado[]
  /** De dónde sale el valor esperado. Sin esto un número es una creencia. */
  origen: string
  /**
   * Cuando la herramienta todavía no existe. El caso se declara igual —es el
   * objetivo de la fase 1— y la batería lo cuenta aparte en vez de darlo por
   * fallado, que sería ruido rojo permanente.
   */
  pendiente?: string
}

export interface FalloCaso {
  ruta: string
  esperado: unknown
  obtenido: unknown
}

export interface ResultadoCaso {
  id: string
  estado: 'acierta' | 'falla' | 'pendiente'
  fallos: FalloCaso[]
}

export function valorEnRuta(objeto: unknown, ruta: string): unknown {
  return ruta.split('.').reduce<unknown>((actual, tramo) => {
    if (actual === null || actual === undefined) return undefined
    if (Array.isArray(actual)) return actual[Number(tramo)]
    if (typeof actual === 'object') return (actual as Record<string, unknown>)[tramo]
    return undefined
  }, objeto)
}

function coincide(obtenido: unknown, esperado: Esperado): boolean {
  if (typeof esperado.tolerancia === 'number') {
    return typeof obtenido === 'number'
      && typeof esperado.valor === 'number'
      && Math.abs(obtenido - esperado.valor) <= esperado.tolerancia
  }
  return JSON.stringify(obtenido) === JSON.stringify(esperado.valor)
}

/** Comprueba un caso contra el resultado que devolvió su herramienta. */
export function comprobarCaso(caso: CasoAgente, resultado: unknown): ResultadoCaso {
  if (caso.pendiente) return { id: caso.id, estado: 'pendiente', fallos: [] }

  const fallos = caso.espera
    .map(e => ({ ruta: e.ruta, esperado: e.valor, obtenido: valorEnRuta(resultado, e.ruta), e }))
    .filter(f => !coincide(f.obtenido, f.e))
    .map(({ ruta, esperado, obtenido }) => ({ ruta, esperado, obtenido }))

  return { id: caso.id, estado: fallos.length ? 'falla' : 'acierta', fallos }
}

export interface Marcador {
  total: number
  aciertan: number
  fallan: number
  pendientes: number
  /** Sobre los que se pueden correr hoy; los pendientes no cuentan. */
  porcentaje: number
}

export function marcador(resultados: ResultadoCaso[]): Marcador {
  const aciertan = resultados.filter(r => r.estado === 'acierta').length
  const fallan = resultados.filter(r => r.estado === 'falla').length
  const pendientes = resultados.filter(r => r.estado === 'pendiente').length
  const corridos = aciertan + fallan
  return {
    total: resultados.length,
    aciertan,
    fallan,
    pendientes,
    porcentaje: corridos ? Math.round((aciertan / corridos) * 1000) / 10 : 0,
  }
}
