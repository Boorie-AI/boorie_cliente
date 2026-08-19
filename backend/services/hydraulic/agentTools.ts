/**
 * Herramientas que el agente puede llamar para consultar la red activa (#34).
 *
 * El resumen de `networkContext.ts` son doce lineas fijas: sirve para que el
 * agente sepa de que red se habla, no para responder sobre un nudo concreto.
 * En `Net3 2.inp` hay 92 nudos y 117 tramos, y volcarlos todos en el prompt no
 * es una opcion. De ahi el segundo nivel de detalle bajo demanda que el issue
 * dejaba fuera de alcance.
 *
 * Modulo puro a proposito, igual que networkContext: recibe la red ya leida y
 * devuelve datos, sin tocar la base ni Electron.
 */

export interface NodoRed {
  id: string
  label?: string
  type: string
  x?: number | null
  y?: number | null
  elevation?: number | null
  demand?: number | null
  pattern?: string | null
  total_head?: number | null
  init_level?: number | null
  min_level?: number | null
  max_level?: number | null
  diameter?: number | null
}

export interface TramoRed {
  id: string
  label?: string
  type: string
  from?: string
  to?: string
  length?: number | null
  diameter?: number | null
  roughness?: number | null
  status?: string | null
  pump_type?: string | null
  pump_curve?: string | null
  speed?: number | null
}

export interface RedCompleta {
  nodes?: NodoRed[]
  links?: TramoRed[]
}

export interface DefinicionHerramienta {
  nombre: string
  descripcion: string
  esquema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

/** Lo que devuelve una herramienta, ya listo para serializar hacia el modelo. */
export type ResultadoHerramienta = Record<string, unknown>

const TIPOS_NODO = ['junction', 'tank', 'reservoir']
const TIPOS_TRAMO = ['pipe', 'pump', 'valve']

/** Tope duro de elementos por respuesta: 117 tramos no caben en el prompt. */
const LIMITE_MAXIMO = 50
const LIMITE_POR_DEFECTO = 10

export const HERRAMIENTAS: DefinicionHerramienta[] = [
  {
    nombre: 'consultar_elemento',
    descripcion:
      'Devuelve los datos de un nudo (junction, tank, reservoir) o de un tramo (pipe, pump, valve) ' +
      'de la red activa, buscandolo por su identificador. Para un nudo incluye ademas los tramos ' +
      'conectados a el. Usala siempre que la pregunta mencione un elemento concreto por su id, ' +
      'en lugar de responder de memoria.',
    esquema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          // Sin la advertencia, nemotron-mini copiaba el prefijo del ejemplo y
          // pedia «J121» para un nudo que en la red se llama «121».
          description:
            'Identificador exacto del elemento, copiado tal cual de la red. Puede ser numerico ("121") ' +
            'o alfanumerico ("J3"): usa el que aparezca en la pregunta sin anadirle ni quitarle prefijos.',
        },
      },
      required: ['id'],
    },
  },
  {
    nombre: 'listar_elementos',
    descripcion:
      'Lista los elementos de la red activa de un tipo dado, opcionalmente ordenados por una magnitud. ' +
      'Usala para preguntas agregadas ("las tuberias mas largas", "los nudos de mayor demanda", ' +
      '"cuantas bombas hay"). Devuelve como mucho 50 elementos.',
    esquema: {
      type: 'object',
      properties: {
        tipo: {
          type: 'string',
          enum: [...TIPOS_NODO, ...TIPOS_TRAMO],
          description: 'Tipo de elemento a listar.',
        },
        ordenar_por: {
          type: 'string',
          enum: ['demand', 'elevation', 'length', 'diameter'],
          description:
            'Magnitud por la que ordenar. demand y elevation solo aplican a nudos; length y diameter, a tramos. ' +
            'Si se omite, se devuelven en el orden del archivo.',
        },
        descendente: {
          type: 'boolean',
          description: 'De mayor a menor. Por defecto true cuando se ordena.',
        },
        limite: {
          type: 'number',
          description: `Cuantos elementos devolver (por defecto ${LIMITE_POR_DEFECTO}, maximo ${LIMITE_MAXIMO}).`,
        },
      },
      required: ['tipo'],
    },
  },
]

const mm = (metros?: number | null) =>
  typeof metros === 'number' ? Math.round(metros * 1000) : null

const ls = (m3s?: number | null) =>
  typeof m3s === 'number' ? Number((m3s * 1000).toFixed(3)) : null

/**
 * Las unidades se convierten aqui, no en el modelo. WNTR normaliza a SI al
 * cargar el .inp, asi que los diametros vienen en metros y las demandas en
 * m3/s: numeros como 0.075 o 0.000231 que el modelo tiende a leer mal o a
 * redondear. Se le entregan ya en mm y L/s, con el nombre de campo diciendo la
 * unidad, para que no tenga que hacer aritmetica.
 *
 * El nombre del campo va sin abreviar: probando con nemotron-mini, un
 * `demanda_base_ls` se leyo en voz alta como «Ligado a tierra». El numero era
 * correcto, la unidad inventada.
 */
function describirNodo(n: NodoRed): ResultadoHerramienta {
  const datos: ResultadoHerramienta = { id: n.id, tipo: n.type }
  if (typeof n.elevation === 'number') datos.cota_m = n.elevation
  if (typeof n.demand === 'number') datos.demanda_base_litros_por_segundo = ls(n.demand)
  if (n.pattern) datos.patron = n.pattern
  if (typeof n.total_head === 'number') datos.altura_total_m = n.total_head
  if (typeof n.init_level === 'number') datos.nivel_inicial_m = n.init_level
  if (typeof n.min_level === 'number') datos.nivel_minimo_m = n.min_level
  if (typeof n.max_level === 'number') datos.nivel_maximo_m = n.max_level
  if (n.type === 'tank' && typeof n.diameter === 'number') datos.diametro_deposito_m = n.diameter
  if (typeof n.x === 'number' && typeof n.y === 'number') datos.coordenadas = [n.x, n.y]
  return datos
}

function describirTramo(l: TramoRed): ResultadoHerramienta {
  const datos: ResultadoHerramienta = { id: l.id, tipo: l.type, desde: l.from, hasta: l.to }
  if (typeof l.length === 'number') datos.longitud_m = l.length
  if (typeof l.diameter === 'number') datos.diametro_mm = mm(l.diameter)
  if (typeof l.roughness === 'number') datos.rugosidad = l.roughness
  if (l.status) datos.estado = l.status
  if (l.pump_type) datos.tipo_bomba = l.pump_type
  if (l.pump_curve) datos.curva_bomba = l.pump_curve
  if (typeof l.speed === 'number') datos.velocidad_giro = l.speed
  return datos
}

/**
 * Con un id que no existe se devuelven candidatos parecidos en vez de un error
 * seco: el modelo puede corregir el tiro en la siguiente llamada, y sobre todo
 * tiene con que decir «ese nudo no esta en tu red» en lugar de inventarselo,
 * que es justo lo que #34 quiere evitar.
 */
function sugerencias(id: string, ids: string[]): string[] {
  const buscado = id.trim().toLowerCase()
  const parecidos = ids.filter(otro => {
    const o = otro.toLowerCase()
    return o.includes(buscado) || buscado.includes(o)
  })
  return (parecidos.length ? parecidos : ids).slice(0, 10)
}

function consultarElemento(argumentos: Record<string, unknown>, red: RedCompleta): ResultadoHerramienta {
  const id = typeof argumentos.id === 'string' ? argumentos.id.trim() : ''
  if (!id) return { error: 'Falta el argumento "id".' }

  const nodos = red.nodes ?? []
  const tramos = red.links ?? []

  // Insensible a mayusculas: los modelos escriben "j3" donde el .inp pone "J3".
  const igual = (a: string) => a.toLowerCase() === id.toLowerCase()

  const nodo = nodos.find(n => igual(n.id))
  if (nodo) {
    const conectados = tramos.filter(l => igual(l.from ?? '') || igual(l.to ?? ''))
    return {
      encontrado: true,
      elemento: describirNodo(nodo),
      tramos_conectados: conectados.map(describirTramo),
    }
  }

  const tramo = tramos.find(l => igual(l.id))
  if (tramo) {
    const extremos = [tramo.from, tramo.to]
      .map(ext => nodos.find(n => n.id === ext))
      .filter((n): n is NodoRed => !!n)
    return {
      encontrado: true,
      elemento: describirTramo(tramo),
      nudos_extremos: extremos.map(describirNodo),
    }
  }

  return {
    encontrado: false,
    error: `No hay ningun elemento con id "${id}" en la red activa.`,
    ids_parecidos: sugerencias(id, [...nodos.map(n => n.id), ...tramos.map(l => l.id)]),
  }
}

function listarElementos(argumentos: Record<string, unknown>, red: RedCompleta): ResultadoHerramienta {
  const tipo = typeof argumentos.tipo === 'string' ? argumentos.tipo.toLowerCase() : ''
  if (!TIPOS_NODO.includes(tipo) && !TIPOS_TRAMO.includes(tipo)) {
    return { error: `Tipo no reconocido: "${tipo}". Validos: ${[...TIPOS_NODO, ...TIPOS_TRAMO].join(', ')}.` }
  }

  const esNodo = TIPOS_NODO.includes(tipo)
  const todos: Array<NodoRed | TramoRed> = esNodo
    ? (red.nodes ?? []).filter(n => n.type === tipo)
    : (red.links ?? []).filter(l => l.type === tipo)

  const campo = typeof argumentos.ordenar_por === 'string' ? argumentos.ordenar_por : null
  const camposValidos = esNodo ? ['demand', 'elevation'] : ['length', 'diameter']
  if (campo && !camposValidos.includes(campo)) {
    return { error: `No se puede ordenar ${tipo} por "${campo}". Validos: ${camposValidos.join(', ')}.` }
  }

  const ordenados = [...todos]
  if (campo) {
    const descendente = argumentos.descendente !== false
    const valor = (e: NodoRed | TramoRed) => {
      const v = (e as unknown as Record<string, unknown>)[campo]
      return typeof v === 'number' ? v : -Infinity
    }
    ordenados.sort((a, b) => (descendente ? valor(b) - valor(a) : valor(a) - valor(b)))
  }

  const pedido = typeof argumentos.limite === 'number' ? argumentos.limite : LIMITE_POR_DEFECTO
  const limite = Math.max(1, Math.min(LIMITE_MAXIMO, Math.floor(pedido)))
  const pagina = ordenados.slice(0, limite)

  return {
    tipo,
    total: todos.length,
    devueltos: pagina.length,
    // Que el recorte sea explicito: si el modelo no sabe que hay mas, presenta
    // diez tuberias como si fueran las 117 de la red.
    ...(todos.length > pagina.length
      ? { aviso: `Se muestran ${pagina.length} de ${todos.length}. Pide un limite mayor o afina la consulta si necesitas el resto.` }
      : {}),
    elementos: pagina.map(e => (esNodo ? describirNodo(e as NodoRed) : describirTramo(e as TramoRed))),
  }
}

export function ejecutarHerramienta(
  nombre: string,
  argumentos: Record<string, unknown>,
  red: RedCompleta
): ResultadoHerramienta {
  switch (nombre) {
    case 'consultar_elemento':
      return consultarElemento(argumentos, red)
    case 'listar_elementos':
      return listarElementos(argumentos, red)
    default:
      return { error: `Herramienta desconocida: "${nombre}".` }
  }
}
