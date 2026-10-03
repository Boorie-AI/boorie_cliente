/**
 * La regla con la que se miden las respuestas del RAG (#226).
 *
 * `agentEval` mide las herramientas del agente sobre redes; `ragQualityValidator`
 * puntúa lo recuperado. Ninguno dice si la respuesta a una pregunta sobre un
 * documento contiene las cifras y fórmulas que el documento da. Esto sí.
 *
 * Cada caso declara hechos atómicos que la respuesta tiene que contener, y para
 * cada uno qué tiene que estar en el material que recibió el modelo. Con las
 * dos cosas, un fallo se puede atribuir:
 *
 * - **de recuperación**: el hecho no estaba en lo que se le pasó al modelo; por
 *   bien que redacte, no podía decirlo;
 * - **de redacción**: estaba delante y no lo usó, o lo contradijo.
 *
 * Y lo que **no** debe decir —una conversión mal hecha, una fórmula inventada—
 * se cuenta aparte: una respuesta puede acertar todos los hechos y aun así
 * llevar un error que la invalida.
 */

/**
 * Una comprobación sobre un texto. Las expresiones se buscan sin distinguir
 * mayúsculas y con los espacios normalizados, porque el texto de un PDF trae
 * saltos de línea en mitad de las fórmulas.
 */
export type Comprobacion =
  | { patron: string }
  /**
   * Una cifra, con tolerancia **absoluta** en su unidad. `unidad` es una
   * expresión que tiene que ir justo detrás del número. Se probó con «cerca»
   * (60 caracteres a cada lado) y daba por bueno «C ≈ 0,557» porque había un
   * «Q_2» al lado: un «2» suelto aparece en cualquier respuesta.
   */
  | { cifra: number; tolerancia: number; unidad?: string }

export interface Hecho {
  id: string
  /** En palabras, para el informe y para quien revise el caso. */
  descripcion: string
  /** Basta con que se cumpla una: sinónimos, otra unidad, otra notación. */
  enRespuesta: Comprobacion[]
  /**
   * Tienen que cumplirse todas en lo que leyó el modelo para que el hecho
   * estuviera a su alcance. Es lo que separa búsqueda de redacción.
   */
  enFuente: Comprobacion[]
  /** Página, tabla o ecuación del documento de la que sale. Sin esto un número es una creencia. */
  origen: string
  /**
   * La referencia lo pide y el documento no lo trae: criterio de experto. Su
   * fallo será siempre de recuperación, y eso es lo que se quiere ver.
   */
  fueraDelDocumento?: true
}

export interface Prohibido {
  id: string
  descripcion: string
  /** Basta con que se cumpla una para que cuente. */
  comprobaciones: Comprobacion[]
}

export interface CasoRAG {
  id: string
  /** Tal como la escribiría el usuario. */
  pregunta: string
  /** Clave del documento adjunto (`DOCUMENTOS`). */
  documento: string
  hechos: Hecho[]
  prohibidos: Prohibido[]
  /** Quién redactó la referencia y en qué estado está. */
  revision: string
}

export type EstadoHecho = 'acierta' | 'falla-recuperacion' | 'falla-redaccion'

export interface ResultadoHecho {
  id: string
  estado: EstadoHecho
  /** Lo dijo sin que estuviera en lo leído: de memoria, aunque acierte. */
  sinRespaldo?: boolean
}

export interface PuntuacionRespuesta {
  hechos: ResultadoHecho[]
  /** Los prohibidos que dijo. */
  prohibidos: string[]
  aciertos: number
  total: number
}

export function normalizar(texto: string): string {
  return texto
    .normalize('NFC')
    // «2.0 \, \text{seg}^2/\text{ft}^5», como lo escribe un modelo en LaTeX.
    .replace(/\\(?:text|mathrm|mbox)\{([^}]*)\}/g, '$1')
    .replace(/\\[,;! ]/g, ' ')
    .replace(/[‐-―−]/g, '-')
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

/**
 * Todas las lecturas posibles de cada número del texto.
 *
 * «0,23» y «1,000» no se distinguen sin saber el idioma, y las respuestas
 * mezclan castellano con cifras copiadas de un libro en inglés. Se aceptan las
 * dos lecturas: la tolerancia y la unidad ya acotan lo suficiente.
 */
export function cifrasDelTexto(texto: string): Array<{ valor: number; posicion: number; fin: number }> {
  const salida: Array<{ valor: number; posicion: number; fin: number }> = []
  for (const m of texto.matchAll(/\d+(?:[.,]\d+)*/g)) {
    const crudo = m[0]
    const lecturas = new Set<number>()
    const separadores = crudo.match(/[.,]/g) ?? []
    if (!separadores.length) {
      lecturas.add(Number(crudo))
    } else {
      // El último separador como decimal, los demás como miles.
      const ultimo = Math.max(crudo.lastIndexOf('.'), crudo.lastIndexOf(','))
      lecturas.add(Number(crudo.slice(0, ultimo).replace(/[.,]/g, '') + '.' + crudo.slice(ultimo + 1)))
      // Todo como miles.
      lecturas.add(Number(crudo.replace(/[.,]/g, '')))
    }
    const posicion = m.index ?? 0
    for (const valor of lecturas) if (Number.isFinite(valor)) salida.push({ valor, posicion, fin: posicion + crudo.length })
  }
  return salida
}

export function cumple(texto: string, comprobacion: Comprobacion): boolean {
  const t = normalizar(texto)
  if ('patron' in comprobacion) return new RegExp(comprobacion.patron, 'iu').test(t)
  const { cifra, tolerancia, unidad } = comprobacion
  // El «2» de «Q_2» o de «Q^{2}» no es un 2.
  return cifrasDelTexto(t).some(({ valor, posicion, fin }) => {
    if (Math.abs(valor - cifra) > tolerancia) return false
    if (/[\d_^{]$/.test(t.slice(0, posicion))) return false
    // Entre la cifra y la unidad sólo caben espacios, negritas y delimitadores: «10 \(\text{sec}^2…».
    return !unidad || new RegExp(`^[\\s*$\\\\(]{0,5}(?:${unidad})`, 'iu').test(t.slice(fin))
  })
}

/**
 * Puntúa una respuesta contra un caso. `leido` es todo lo que el modelo tuvo
 * delante: lo seleccionado del adjunto y el contenido de las fuentes del RAG.
 */
export function puntuarRespuesta(caso: CasoRAG, respuesta: string, leido: string): PuntuacionRespuesta {
  const hechos = caso.hechos.map((h): ResultadoHecho => {
    const dicho = h.enRespuesta.some(c => cumple(respuesta, c))
    const alAlcance = h.enFuente.every(c => cumple(leido, c))
    if (dicho) return alAlcance ? { id: h.id, estado: 'acierta' } : { id: h.id, estado: 'acierta', sinRespaldo: true }
    return { id: h.id, estado: alAlcance ? 'falla-redaccion' : 'falla-recuperacion' }
  })
  return {
    hechos,
    prohibidos: caso.prohibidos.filter(p => p.comprobaciones.some(c => cumple(respuesta, c))).map(p => p.id),
    aciertos: hechos.filter(h => h.estado === 'acierta').length,
    total: hechos.length,
  }
}

export interface EstabilidadCaso {
  repeticiones: number
  /** Aciertos de cada repetición, en orden. */
  aciertosPorRepeticion: number[]
  /** Hechos que dieron lo mismo en todas las repeticiones, sobre el total. */
  hechosEstables: number
  /** Por hecho, en cuántas repeticiones acertó. */
  porHecho: Record<string, number>
}

/**
 * Cómo de repetible es la respuesta. La variabilidad entre ejecuciones es parte
 * del problema que se mide: qwen2.5:7b daba un resultado distinto cada vez con
 * el mismo material.
 */
export function estabilidad(puntuaciones: PuntuacionRespuesta[]): EstabilidadCaso {
  const porHecho: Record<string, number> = {}
  for (const p of puntuaciones) {
    for (const h of p.hechos) porHecho[h.id] = (porHecho[h.id] ?? 0) + (h.estado === 'acierta' ? 1 : 0)
  }
  const n = puntuaciones.length
  return {
    repeticiones: n,
    aciertosPorRepeticion: puntuaciones.map(p => p.aciertos),
    hechosEstables: Object.values(porHecho).filter(v => v === 0 || v === n).length,
    porHecho,
  }
}

export interface Marcador {
  casos: number
  ejecutados: number
  noEjecutados: number
  /** Aciertos sobre hechos puntuados, en las repeticiones que llegaron a responder. */
  porcentaje: number
  fallosDeRecuperacion: number
  fallosDeRedaccion: number
  prohibidosDichos: number
}

export function marcador(
  resultados: Array<{ estado: 'ejecutado' | 'no-ejecutado' | 'error'; puntuaciones: PuntuacionRespuesta[] }>
): Marcador {
  const todas = resultados.flatMap(r => r.puntuaciones)
  const hechos = todas.flatMap(p => p.hechos)
  const aciertos = hechos.filter(h => h.estado === 'acierta').length
  return {
    casos: resultados.length,
    ejecutados: resultados.filter(r => r.estado === 'ejecutado').length,
    noEjecutados: resultados.filter(r => r.estado === 'no-ejecutado').length,
    porcentaje: hechos.length ? Math.round((aciertos / hechos.length) * 1000) / 10 : 0,
    fallosDeRecuperacion: hechos.filter(h => h.estado === 'falla-recuperacion').length,
    fallosDeRedaccion: hechos.filter(h => h.estado === 'falla-redaccion').length,
    prohibidosDichos: todas.reduce((n, p) => n + p.prohibidos.length, 0),
  }
}
