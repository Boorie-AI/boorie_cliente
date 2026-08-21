/**
 * Reconocer en código que una pregunta pide un escenario (#44).
 *
 * La herramienta `proponer_escenario` existe y está bien descrita, pero el
 * modelo que corre en local es de 4B y **no la llama**. Medido con la pregunta
 * del criterio de aceptación —«¿cuántos clientes quedan sin servicio si se
 * pierde el control de las bombas 4 horas?»— `nemotron-mini` contestó «10», con
 * cero vueltas de herramientas: una cifra inventada, que es exactamente lo que
 * esta funcionalidad existe para impedir.
 *
 * De ahí esta red de seguridad. No sustituye a la herramienta —un modelo capaz
 * la usará y entenderá matices que aquí no caben— sino que cubre el caso en el
 * que el modelo no la llama: si la pregunta es claramente condicional sobre un
 * fallo, Boorie propone el escenario por su cuenta y **no deja que el modelo
 * responda con cifras**.
 *
 * Módulo puro, como `agentTools` y `networkContext`: recibe el texto y la red, y
 * devuelve datos.
 */

import type { RedCompleta } from './agentTools'

export interface IntencionEscenario {
  tipo: 'pipe_break' | 'pump_outage' | 'control_loss' | 'demand_surge' | 'source_reduction'
  elementos: string[]
  desde_h?: number
  duracion_h?: number
  multiplicador?: number
  /** Qué disparó la detección, para poder explicarlo y para depurar. */
  motivo: string
}

/**
 * La pregunta tiene que ser **condicional**: sin esto, «se rompió la tubería 12»
 * —un hecho, no una hipótesis— dispararía un escenario que nadie pidió.
 */
const CONDICIONAL = /\b(si|qué pasa|que pasa|y si|en caso de|supongamos|imagina|simula|escenario)\b/i

/**
 * Cada familia con las palabras que la nombran en castellano de obra. El orden
 * importa: «se pierde el control de las bombas» menciona bombas y control, y lo
 * que la define es el control.
 */
const FAMILIAS: Array<{ tipo: IntencionEscenario['tipo']; patron: RegExp }> = [
  { tipo: 'control_loss', patron: /(pierde|perder|pérdida|perdida|sin)\s+(el\s+)?control|scada|ciberataque|cibernétic|hackea|congel/i },
  { tipo: 'source_reduction', patron: /sequía|sequia|embalse\s+(baja|vacío|vacio)|menos\s+agua\s+en\s+(el\s+)?origen|nivel\s+del?\s+embalse/i },
  { tipo: 'demand_surge', patron: /incendio|sobredemanda|punta\s+de\s+demanda|(se\s+)?dispara\s+la\s+demanda|demanda\b[^.?!]{0,40}\bmultiplic\w+|multiplic\w+[^.?!]{0,40}\bdemanda\b/i },
  { tipo: 'pipe_break', patron: /rotura|se\s+rompe|romper|reventa|fuga|rompiera/i },
  { tipo: 'pump_outage', patron: /bomba|bombeo|apag\w+|par(a|ar|an|ada)\b|corte\s+de\s+(energía|energia|luz)|fuera\s+de\s+servicio|aver(í|i)a/i },
]

const HORAS = /(\d+(?:[.,]\d+)?)\s*(?:h\b|horas?\b)/i
const DESDE = /(?:desde|a\s+partir\s+de|empezando\s+en)\s+(?:las?\s+)?(\d{1,2})(?::(\d{2}))?/i
const MULTIPLICADOR = /(?:por|x)\s*(\d+(?:[.,]\d+)?)|(\d+(?:[.,]\d+)?)\s*veces/i

const numero = (bruto?: string) => {
  if (!bruto) return undefined
  const n = Number(bruto.replace(',', '.'))
  return Number.isFinite(n) ? n : undefined
}

/**
 * Los elementos que la pregunta menciona, o todos los de su clase si habla en
 * plural genérico («las bombas», «el bombeo»).
 *
 * Se buscan los ids **de la red**, no los que el usuario escriba: es la única
 * forma de no proponer un escenario sobre un elemento inventado. Un id se acepta
 * sólo rodeado de separadores, porque en esta red hay nudos llamados «10» y «1»
 * y buscarlos por subcadena convertiría «4 horas» en el nudo 4.
 */
function elementosMencionados(texto: string, red: RedCompleta, tipo: IntencionEscenario['tipo']): string[] {
  const nodos = red.nodes ?? []
  const tramos = red.links ?? []

  const bombas = tramos.filter(l => l.type === 'pump').map(l => l.id)
  const tuberias = tramos.filter(l => l.type === 'pipe').map(l => l.id)
  const embalses = nodos.filter(n => n.type === 'reservoir').map(n => n.id)

  const candidatos = tipo === 'source_reduction'
    ? embalses
    : tipo === 'pipe_break'
      ? tuberias
      : tipo === 'demand_surge'
        ? nodos.filter(n => n.type === 'junction').map(n => n.id)
        : bombas

  const nombrados = candidatos.filter(id => {
    const escapado = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(^|[^\\w])${escapado}([^\\w]|$)`, 'i').test(texto)
  })
  if (nombrados.length > 0) return nombrados

  // Plural genérico: «las bombas», «los embalses». Sólo entonces se cogen todos,
  // porque proponer la rotura de las 117 tuberías de una red no lo pide nadie.
  const generico: Record<IntencionEscenario['tipo'], RegExp> = {
    pump_outage: /bombas|bombeo|todas\s+las\s+bombas/i,
    control_loss: /bombas|válvulas|valvulas|automatismos|red/i,
    source_reduction: /embalses?|fuentes?|origen/i,
    demand_surge: /red|todos\s+los\s+nudos|toda\s+la\s+red/i,
    pipe_break: /$^/,  // nunca: una rotura hay que nombrarla
  }
  if (generico[tipo].test(texto)) {
    return tipo === 'control_loss' ? bombas : tipo === 'demand_surge' ? [] : candidatos
  }

  return []
}

export function detectarIntencionEscenario(texto: string, red: RedCompleta): IntencionEscenario | null {
  if (!texto || !CONDICIONAL.test(texto)) return null

  const familia = FAMILIAS.find(f => f.patron.test(texto))
  if (!familia) return null

  const elementos = elementosMencionados(texto, red, familia.tipo)

  // control_loss y demand_surge valen sobre la red entera; los demás necesitan
  // un elemento, y sin él es mejor no proponer nada que proponer cualquier cosa.
  if (elementos.length === 0 && familia.tipo !== 'control_loss' && familia.tipo !== 'demand_surge') {
    return null
  }

  const horas = numero(HORAS.exec(texto)?.[1])
  const desde = numero(DESDE.exec(texto)?.[1])
  const mult = (() => {
    const m = MULTIPLICADOR.exec(texto)
    return numero(m?.[1] ?? m?.[2])
  })()

  return {
    tipo: familia.tipo,
    elementos,
    ...(desde !== undefined ? { desde_h: desde } : {}),
    ...(horas !== undefined ? { duracion_h: horas } : {}),
    ...(familia.tipo === 'demand_surge' && mult !== undefined ? { multiplicador: mult } : {}),
    motivo: `pregunta condicional sobre ${familia.tipo}`,
  }
}

/**
 * Preguntas de eficiencia energética (#42, segunda entrega).
 *
 * Va aparte de las de escenario porque la respuesta es otra: no se propone un
 * evento, se propone **analizar el bombeo y verificar medidas**. Y va en código
 * por lo mismo que allí: el modelo local no llama a las herramientas y, puesto a
 * responder de memoria, da cifras de ahorro inventadas, que es justo lo que el
 * issue prohíbe.
 */
const ENERGIA = /\b(ahorr\w+|eficiencia\s+energétic\w+|consumo\s+(de\s+)?(energ|el[eé]ctric)\w*|factura\s+(de\s+)?(la\s+)?luz|coste\s+(de\s+)?(la\s+)?energ\w+|kwh|horas?\s+valle|hora\s+punta|tarifa)\b/i

/** Verbos que convierten la mención en una petición. */
const PIDE = /\b(cómo|como|puedo|podr[íi]a|qué|que|cuánto|cuanto|recomienda|recomiéndame|sugiere|reduce|reducir|bajar|optimiza|optimizar|mejorar|analiza|analizar)\b/i

export function detectarIntencionEnergia(texto: string): boolean {
  if (!texto) return false
  return ENERGIA.test(texto) && PIDE.test(texto)
}
