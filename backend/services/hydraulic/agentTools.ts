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

import { HydraulicCalculationEngine } from './calculationEngine'

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

/**
 * Lo que el ejecutor necesita, explicito (#119, fase 1).
 *
 * Las herramientas nuevas no se conforman con la red: la curva de fragilidad
 * corre un motor en Python. Pero este modulo se mantiene puro —recibe datos y
 * devuelve datos, sin tocar la base ni Electron ni lanzar procesos—, asi que el
 * motor **se inyecta**. Quien monta el contexto es el handler del chat, que si
 * puede hacer esas cosas; aqui se sigue pudiendo probar todo sin Python.
 *
 * Sin motor, la herramienta que lo necesita lo dice. No se calla ni se inventa
 * una respuesta: que el agente sepa que no ha podido calcularlo es justo lo que
 * evita que rellene el hueco.
 */
export interface ContextoHerramientas {
  red: RedCompleta
  motores?: {
    curvaFragilidad?: (opciones: Record<string, unknown>) => Promise<ResultadoHerramienta>
  }
}

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
  {
    nombre: 'curva_fragilidad',
    descripcion:
      'Calcula la curva de fragilidad sismica de las tuberias de la red activa: que probabilidad de ' +
      'fallo tienen y cuantas se esperan danadas para cada intensidad del sismo. Se ejecuta en el ' +
      'momento, sin pedir confirmacion, porque no simula la red: es una lognormal sobre la lista de ' +
      'tuberias. Usala para preguntas de riesgo sismico ("cuantas tuberias fallarian con un sismo ' +
      'de 0,3 g", "que pasa si tiembla"). Los parametros por material son genericos y publicados: ' +
      'di siempre que la curva necesita la validacion de un experto antes de decidir con ella.',
    esquema: {
      type: 'object',
      properties: {
        material: {
          type: 'string',
          enum: ['CI', 'AC', 'STEEL', 'DI', 'PVC', 'HDPE', 'CONCRETE', 'DEFAULT'],
          description:
            'Material predominante de las tuberias. Si el usuario no lo dice, no lo adivines por el ' +
            'aspecto de la red: usa DEFAULT y avisale de que has asumido el generico.',
        },
        damage_model: {
          type: 'string',
          enum: ['HAZUS_MH', 'ALA_2001'],
          description: 'Tabla de medianas publicada. Por defecto HAZUS_MH.',
        },
        hazard_type: {
          type: 'string',
          enum: ['seismic_pgv', 'seismic_pga'],
          description:
            'En que magnitud viene la intensidad: velocidad maxima del suelo (PGV, cm/s) o ' +
            'aceleracion maxima (PGA, g). Las normativas suelen dar PGA.',
        },
        soil_class: {
          type: 'string',
          enum: ['rock', 'stiff_soil', 'soft_soil'],
          description:
            'Clase de suelo del emplazamiento. Solo cambia el resultado con entrada en PGA, y lo ' +
            'cambia mucho: a 0,30 g la probabilidad va del 68 % en roca al 93 % en suelo blando.',
        },
        max_intensity: {
          type: 'number',
          description: 'Tope del eje: 100 cm/s en PGV, 1,2 g en PGA si no se dice otra cosa.',
        },
        reparto_por_diametro: {
          type: 'boolean',
          description:
            'Anadir cuantas tuberias y cuantos km se ven afectados por cada diametro, en el tope ' +
            'del eje. Es lo que permite costear la reparacion: no cuesta lo mismo reparar veinte ' +
            'tuberias de 50 m que de 500. No cuesta una llamada mas: sale del mismo calculo.',
        },
      },
      required: [],
    },
  },
  {
    nombre: 'calcular',
    descripcion:
      'Resuelve una formula de hidraulica con los datos que de el usuario: perdida de carga por ' +
      'Darcy-Weisbach o Hazen-Williams, factor de friccion por Colebrook-White, golpe de ariete, ' +
      'volumen de deposito o potencia de bombeo. Se ejecuta en el momento: no simula la red, es ' +
      'aritmetica. Usala siempre en lugar de calcular tu: devuelve tambien los pasos intermedios ' +
      'con su unidad, que es lo que permite comprobar el resultado a mano.',
    esquema: {
      type: 'object',
      properties: {
        formula: {
          type: 'string',
          enum: [
            'darcy-weisbach', 'hazen-williams', 'colebrook-white',
            'water-hammer', 'tank-volume', 'pump-power',
          ],
          description: 'Que formula aplicar.',
        },
        datos: {
          type: 'object',
          description:
            'Los parametros de la formula, por su simbolo, cada uno con su valor y su unidad: ' +
            '{"L": {"valor": 500, "unidad": "m"}, "D": {"valor": 300, "unidad": "mm"}}. Si falta ' +
            'alguno o la unidad no es de las admitidas, la herramienta te lo dice con la lista.',
        },
      },
      required: ['formula', 'datos'],
    },
  },
  {
    nombre: 'proponer_analisis',
    descripcion:
      'Prepara uno de los analisis que necesitan **simular** la red: indicadores de resiliencia, ' +
      'simulacion hidraulica, calidad del agua o eficiencia energetica. NO los ejecuta: simular una ' +
      'red grande pasa de diez minutos, asi que la ejecucion la lanza el usuario desde la interfaz. ' +
      'Usala cuando pregunten por presiones, caudales, cloro, edad del agua, consumo energetico, ' +
      'resiliencia o robustez. Despues de llamarla, di que analisis has preparado y pide que lo ' +
      'confirme; no des cifras, porque no se ha simulado nada.',
    esquema: {
      type: 'object',
      properties: {
        tipo: {
          type: 'string',
          enum: [
            'indicadores_resiliencia',
            'simulacion_hidraulica',
            'calidad_del_agua',
            'eficiencia_energetica',
          ],
          description:
            'indicadores_resiliencia: indice de Todini, entropia, redundancia y servicio por ' +
            'presion. simulacion_hidraulica: presiones, caudales y velocidades a lo largo del dia. ' +
            'calidad_del_agua: cloro residual, edad del agua o trazador. eficiencia_energetica: ' +
            'consumo y coste de las bombas.',
        },
        comparar_con_interrupcion: {
          type: 'boolean',
          description:
            'Solo para indicadores_resiliencia: comparar el antes y el despues de un escenario de ' +
            'interrupcion. Simula la red dos veces, asi que tarda aproximadamente el doble.',
        },
      },
      required: ['tipo'],
    },
  },
  {
    nombre: 'proponer_escenario',
    descripcion:
      'Traduce a una definicion ejecutable un escenario de interrupcion del servicio que el usuario ' +
      'describa en lenguaje natural: rotura de tuberia, bomba fuera de servicio, perdida de control ' +
      'SCADA, sobredemanda o sequia. NO ejecuta nada: devuelve la definicion para que el usuario la ' +
      'confirme, y la simulacion la lanza el la interfaz. Usala siempre que la pregunta sea condicional ' +
      'sobre un fallo ("que pasa si...", "cuantos clientes quedan sin servicio si...", "y si se rompe..."). ' +
      'Despues de llamarla, explicale al usuario que escenario has propuesto y pidele que lo confirme; ' +
      'no des cifras de impacto, porque todavia no se ha simulado nada.',
    esquema: {
      type: 'object',
      properties: {
        tipo: {
          type: 'string',
          enum: ['pipe_break', 'pump_outage', 'control_loss', 'demand_surge', 'source_reduction'],
          description:
            'pipe_break: rotura de tuberia. pump_outage: bomba parada (corte de energia, averia). ' +
            'control_loss: se pierde el control de los automatismos (ciberataque, SCADA caido). ' +
            'demand_surge: sobredemanda (incendio, punta). source_reduction: menos agua en el origen (sequia).',
        },
        elementos: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Identificadores de los elementos afectados, copiados tal cual de la red y sin anadir prefijos. ' +
            'Para control_loss son los activos que se quedan congelados; para demand_surge, los nudos ' +
            'con exceso de demanda. Si el usuario dice "las bombas" sin nombrarlas, listalas primero con ' +
            'listar_elementos y pasa sus ids.',
        },
        desde_h: { type: 'number', description: 'Hora de la simulacion en la que empieza el evento. Por defecto 0.' },
        duracion_h: { type: 'number', description: 'Cuantas horas dura el evento. Si se omite, dura hasta el final.' },
        multiplicador: { type: 'number', description: 'Solo para demand_surge: por cuanto se multiplica la demanda.' },
        factor: { type: 'number', description: 'Solo para source_reduction: fraccion a la que baja el nivel del origen (0,5 = la mitad).' },
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
 * redondear. Se le entregan ya en mm y l/s, con el nombre de campo diciendo la
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

/**
 * Traduce la peticion del modelo a la definicion que entiende el motor de
 * escenarios (#44), **sin simular nada**.
 *
 * Es deliberado que esta herramienta no ejecute: ningun escenario se lanza sin
 * que el usuario apruebe la definicion, y la aprobacion vive en la interfaz. Lo
 * que sale de aqui es una propuesta.
 *
 * Los elementos se validan contra la red antes de proponer nada. Si el modelo
 * inventa una bomba, el usuario tiene que ver que no existe **antes** de darle a
 * ejecutar, no despues de esperar dos simulaciones.
 */
function proponerEscenario(argumentos: Record<string, unknown>, red: RedCompleta): ResultadoHerramienta {
  const tipo = typeof argumentos.tipo === 'string' ? argumentos.tipo.trim() : ''
  const TIPOS = ['pipe_break', 'pump_outage', 'control_loss', 'demand_surge', 'source_reduction']
  if (!TIPOS.includes(tipo)) {
    return { error: `Tipo de escenario no reconocido: "${tipo}". Validos: ${TIPOS.join(', ')}.` }
  }

  const pedidos = Array.isArray(argumentos.elementos)
    ? argumentos.elementos.map(e => String(e).trim()).filter(Boolean)
    : []

  const nodos = red.nodes ?? []
  const tramos = red.links ?? []
  const idsRed = [...nodos.map(n => n.id), ...tramos.map(l => l.id)]
  const buscar = (id: string) => idsRed.find(otro => otro.toLowerCase() === id.toLowerCase())

  const existentes: string[] = []
  const inexistentes: Array<{ id: string; ids_parecidos: string[] }> = []
  for (const id of pedidos) {
    const encontrado = buscar(id)
    if (encontrado) existentes.push(encontrado)
    else inexistentes.push({ id, ids_parecidos: sugerencias(id, idsRed) })
  }

  // control_loss puede no llevar elementos: retirar los automatismos de toda la
  // red es un escenario legitimo, y de hecho el mas parecido a un ciberataque.
  if (pedidos.length === 0 && tipo !== 'control_loss' && tipo !== 'demand_surge') {
    const candidatos = tipo === 'pump_outage'
      ? tramos.filter(l => l.type === 'pump').map(l => l.id)
      : tipo === 'source_reduction'
        ? nodos.filter(n => n.type === 'reservoir').map(n => n.id)
        : tramos.filter(l => l.type === 'pipe').map(l => l.id)
    return {
      error: `El escenario "${tipo}" necesita al menos un elemento.`,
      candidatos_en_la_red: candidatos.slice(0, 20),
    }
  }

  if (existentes.length === 0 && pedidos.length > 0) {
    return {
      error: 'Ninguno de los elementos indicados existe en la red activa.',
      inexistentes,
    }
  }

  const desde_h = typeof argumentos.desde_h === 'number' ? Math.max(0, argumentos.desde_h) : 0
  const duracion = typeof argumentos.duracion_h === 'number' && argumentos.duracion_h > 0
    ? argumentos.duracion_h
    : null

  const evento: Record<string, unknown> = { tipo, desde_h }
  if (duracion !== null) evento.hasta_h = desde_h + duracion

  if (tipo === 'demand_surge') {
    evento.multiplicador = typeof argumentos.multiplicador === 'number' && argumentos.multiplicador > 1
      ? argumentos.multiplicador
      : 2
    evento.nudos = existentes.length > 0 ? existentes : 'todos'
  } else if (tipo === 'control_loss') {
    evento.alcance = 'todos'
    if (existentes.length > 0) {
      evento.congelar = existentes
      evento.congelar_en = 'cerrado'
    }
  } else if (tipo === 'source_reduction') {
    evento.elementos = existentes
    evento.factor = typeof argumentos.factor === 'number' && argumentos.factor > 0 && argumentos.factor < 1
      ? argumentos.factor
      : 0.5
  } else {
    evento.elementos = existentes
  }

  const ventana = duracion !== null
    ? `de la hora ${desde_h} a la ${desde_h + duracion}`
    : `a partir de la hora ${desde_h} y hasta el final`

  const RESUMEN: Record<string, string> = {
    pipe_break: `Rotura de ${existentes.join(', ')}`,
    pump_outage: `Bomba(s) ${existentes.join(', ')} fuera de servicio`,
    control_loss: existentes.length > 0
      ? `Perdida de control de los automatismos, con ${existentes.join(', ')} congelado(s) en cerrado`
      : 'Perdida de control de todos los automatismos de la red',
    demand_surge: `Demanda multiplicada por ${evento.multiplicador} en ${existentes.length > 0 ? existentes.join(', ') : 'todos los nudos'}`,
    source_reduction: `Origen ${existentes.join(', ')} reducido al ${Math.round(Number(evento.factor) * 100)}%`,
  }

  return {
    propuesta: true,
    // La marca que la interfaz busca para pedir confirmacion. Sin ella el
    // escenario no se ejecuta, y esta herramienta no puede ejecutarlo.
    requiere_confirmacion: true,
    resumen: `${RESUMEN[tipo]}, ${ventana}.`,
    definicion: { nombre: `${RESUMEN[tipo]}, ${ventana}`, eventos: [evento] },
    ...(inexistentes.length > 0 ? { elementos_inexistentes: inexistentes } : {}),
    siguiente_paso: 'Explicale al usuario el escenario propuesto y pidele que lo confirme. No des cifras de impacto: nada se ha simulado todavia.',
  }
}

/** Cuantos puntos de la curva se le pasan al modelo. */
const PUNTOS_CURVA = 5

/**
 * La curva entera no cabe en el prompt, y tampoco hace falta.
 *
 * El motor devuelve veintiun puntos por cada una de sus series, mas el reparto
 * por diametro con otros veintiuno cada grupo: en Net3 son miles de numeros. Al
 * modelo se le dan cinco puntos repartidos por el eje y las cifras de cabecera,
 * que es con lo que se responde a «cuantas tuberias fallarian». Si el usuario
 * quiere la tabla entera, la tiene en el panel y en el CSV.
 */
function resumirCurva(datos: Record<string, unknown>, conReparto: boolean): ResultadoHerramienta {
  const intensidades = (datos.intensities as number[]) ?? []
  const probabilidades = (datos.pipe_failure_probability as number[]) ?? []
  const esperadas = (datos.expected_failed_pipes as number[]) ?? []
  const n = intensidades.length

  const puntos = Array.from({ length: PUNTOS_CURVA }, (_, i) => {
    const idx = Math.round(((i + 1) * (n - 1)) / PUNTOS_CURVA)
    return {
      intensidad: intensidades[idx],
      probabilidad_de_fallo: Number((probabilidades[idx] ?? 0).toFixed(4)),
      tuberias_afectadas: Number((esperadas[idx] ?? 0).toFixed(1)),
    }
  })

  return {
    material: datos.material,
    modelo_de_dano: datos.damage_model,
    magnitud: datos.hazard_type,
    // La unidad va en el nombre del campo y en el valor, como en describirNodo:
    // el modelo no tiene que deducirla del contexto.
    unidad_de_intensidad: datos.intensity_unit,
    clase_de_suelo: datos.soil_class,
    mediana_en_unidad_del_eje: Number((datos.median as number).toFixed(4)),
    tuberias_de_la_red: datos.pipe_count,
    longitud_total_km: Number((datos.total_length_km as number).toFixed(2)),
    puntos,
    ...(conReparto ? { reparto_por_diametro: repartoEnElTope(datos) } : {}),
    aviso:
      'Parametros genericos por material, publicados pero no calibrados con esta red. ' +
      'Diselo al usuario: la curva necesita la validacion de un experto antes de decidir con ella.',
  }
}

/**
 * El reparto por diametro, en el tope del eje.
 *
 * Las dos columnas —tuberias y kilometros— son lo que permite costear el dano:
 * no cuesta lo mismo reparar veinte tuberias de 50 m que de 500. Se da solo en
 * el tope y no en los veintiun puntos porque ahi son veintiuno por grupo, y en
 * Net3 hay diez grupos.
 */
function repartoEnElTope(datos: Record<string, unknown>): ResultadoHerramienta[] {
  const grupos = (datos.by_diameter as Array<Record<string, unknown>>) ?? []
  const ultimo = ((datos.intensities as number[]) ?? []).length - 1
  return grupos.map(g => ({
    diametro_mm: g.diameter_mm,
    tuberias: g.pipe_count,
    longitud_km: Number((g.length_km as number).toFixed(2)),
    tuberias_afectadas: Number((((g.affected_pipes as number[]) ?? [])[ultimo] ?? 0).toFixed(1)),
    km_afectados: Number((((g.affected_length_km as number[]) ?? [])[ultimo] ?? 0).toFixed(2)),
  }))
}

async function curvaFragilidad(
  argumentos: Record<string, unknown>,
  contexto: ContextoHerramientas
): Promise<ResultadoHerramienta> {
  const motor = contexto.motores?.curvaFragilidad
  if (!motor) {
    return {
      error:
        'No hay motor de fragilidad disponible en esta conversacion. Suele ser que el proyecto no ' +
        'tiene una red activa guardada. Dile al usuario que abra la red y vuelva a preguntar.',
    }
  }

  // El argumento es nuestro, no del motor: no se lo pasamos.
  const { reparto_por_diametro: conReparto, ...paraElMotor } = argumentos
  const salida = await motor(paraElMotor)
  // El error del motor se le pasa tal cual: puede corregir un material que no
  // existe o una clase de suelo mal escrita en la siguiente llamada.
  if (salida.error) return salida
  return resumirCurva(salida as Record<string, unknown>, conReparto === true)
}

/**
 * La calculadora, que es TypeScript puro y por eso no necesita motor inyectado.
 *
 * Los pasos intermedios viajan **con su unidad cada uno**, que no siempre es la
 * del resultado: en Darcy-Weisbach la altura de velocidad va en metros y la
 * relacion L/D no tiene unidad (#89). Es lo que permite comprobar la cuenta a
 * mano, y lo que evita que el modelo le ponga al paso la unidad del final.
 */
function calcular(argumentos: Record<string, unknown>): ResultadoHerramienta {
  const formula = typeof argumentos.formula === 'string' ? argumentos.formula : ''
  const crudos = (argumentos.datos ?? {}) as Record<string, { valor?: number; unidad?: string }>

  const entradas: Record<string, { value: number; unit: string }> = {}
  for (const [simbolo, v] of Object.entries(crudos)) {
    if (typeof v?.valor !== 'number' || typeof v?.unidad !== 'string') {
      return { error: `El parametro "${simbolo}" necesita {"valor": <numero>, "unidad": "<unidad>"}.` }
    }
    entradas[simbolo] = { value: v.valor, unit: v.unidad }
  }

  try {
    const r = new HydraulicCalculationEngine().calculate(formula, entradas)
    return {
      formula,
      ecuacion: r.formula,
      resultado: { valor: Number(r.result.value.toPrecision(6)), unidad: r.result.unit },
      pasos: (r.intermediateSteps ?? []).map(p => ({
        expresion: p.formula,
        valor: Number(p.result.toPrecision(6)),
        // Vacia cuando el paso es adimensional, y entonces se dice: un hueco se
        // lee como un olvido, "adimensional" se lee como una decision.
        unidad: p.unit || 'adimensional',
      })),
    }
  } catch (error) {
    // El motor valida los parametros y las unidades, y su mensaje ya trae la
    // lista de lo que falta: se le pasa al modelo para que corrija la llamada.
    return { error: (error as Error).message }
  }
}

/**
 * Los indicadores de resiliencia se proponen, no se ejecutan (#119).
 *
 * El corte entre lo que el agente lanza y lo que propone no es «rapido» o
 * «lento» por comando: es si el motor **simula**. La fragilidad no simula y su
 * coste es plano en el tamano de la red —2,5 s en Net3 y 2,6 s en Net6, con
 * treinta y tres veces mas tuberias—. Estos indicadores simulan, y ahi pasan de
 * 3,5 s a mas de diez minutos en esa misma red. Lanzarlos a ciegas dentro de un
 * tope de cuatro vueltas dejaria la conversacion colgada sin explicacion.
 */
const ANALISIS: Record<string, { resumen: string; calcula: string[] }> = {
  indicadores_resiliencia: {
    resumen: 'Indicadores de resiliencia de la red activa',
    calcula: ['indice de Todini', 'entropia de red', 'redundancia hidraulica', 'nivel de servicio por presion'],
  },
  simulacion_hidraulica: {
    resumen: 'Simulacion hidraulica de la red activa',
    calcula: ['presion en cada nudo', 'caudal y velocidad en cada tramo', 'niveles de deposito'],
  },
  calidad_del_agua: {
    resumen: 'Simulacion de calidad del agua',
    calcula: ['cloro residual', 'edad del agua', 'procedencia por trazador'],
  },
  eficiencia_energetica: {
    resumen: 'Analisis de eficiencia energetica del bombeo',
    calcula: ['consumo por bomba', 'coste segun tarifa', 'rendimiento y horas de funcionamiento'],
  },
}

function proponerAnalisis(argumentos: Record<string, unknown>): ResultadoHerramienta {
  const tipo = typeof argumentos.tipo === 'string' ? argumentos.tipo : ''
  const ficha = ANALISIS[tipo]
  if (!ficha) {
    return { error: `Analisis no reconocido: "${tipo}". Validos: ${Object.keys(ANALISIS).join(', ')}.` }
  }

  // Comparar solo significa algo en resiliencia: en los demas no hay un antes y
  // un despues que enfrentar, y aceptarlo en silencio prometeria algo que no es.
  const comparar = tipo === 'indicadores_resiliencia' && argumentos.comparar_con_interrupcion === true

  return {
    propuesta: true,
    requiere_confirmacion: true,
    analisis: tipo,
    resumen: comparar
      ? `${ficha.resumen}, comparando antes y despues de la interrupcion simulada.`
      : `${ficha.resumen}.`,
    definicion: { analisis: tipo, ...(tipo === 'indicadores_resiliencia' ? { comparar_con_interrupcion: comparar } : {}) },
    calcula: ficha.calcula,
    // Que el modelo pueda decir por que hay que confirmar, en vez de que la
    // espera parezca un fallo de la aplicacion.
    coste: comparar
      ? 'Simula la red dos veces; en una red grande puede pasar de veinte minutos.'
      : 'Simula la red completa; en una red grande puede pasar de diez minutos.',
    siguiente_paso:
      'Dile al usuario que has preparado el analisis y pidele que lo confirme. No des cifras: no se ' +
      'ha simulado nada todavia.',
  }
}

/**
 * Asincrono desde la fase 1 del #119: hay herramientas que corren un motor.
 *
 * Las que solo leen la red siguen siendo sincronas por dentro —no se ha vuelto
 * asincrono lo que no lo necesita—, pero el ejecutor tiene una sola firma para
 * que el catalogo que ve el modelo sea uno solo.
 */
export async function ejecutarHerramienta(
  nombre: string,
  argumentos: Record<string, unknown>,
  contexto: ContextoHerramientas
): Promise<ResultadoHerramienta> {
  const red = contexto.red
  switch (nombre) {
    case 'consultar_elemento':
      return consultarElemento(argumentos, red)
    case 'listar_elementos':
      return listarElementos(argumentos, red)
    case 'proponer_escenario':
      return proponerEscenario(argumentos, red)
    case 'curva_fragilidad':
      return curvaFragilidad(argumentos, contexto)
    case 'calcular':
      return calcular(argumentos)
    case 'proponer_analisis':
      return proponerAnalisis(argumentos)
    default:
      return { error: `Herramienta desconocida: "${nombre}".` }
  }
}
