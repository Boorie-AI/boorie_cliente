/**
 * El texto con el que el chat cuenta las medidas de eficiencia energética ya
 * verificadas (#42, segunda entrega).
 *
 * Escrito en código, por lo mismo que la narración de escenarios: el criterio del
 * issue es que **ninguna cifra de ahorro provenga del modelo** y que toda cifra
 * sea trazable a una ejecución concreta de WNTR. El modelo entiende la pregunta;
 * los números los pone quien los simuló.
 *
 * Se muestran también las medidas que **no** ahorran. Una recomendación que
 * resulta contraproducente es información: en Net3, parar las dos bombas en hora
 * punta consume más porque los depósitos se vacían y hay que recuperarlos.
 */

interface Ahorro {
  energia_kwh: number
  coste: number
  moneda: string
  porcentaje_energia: number
  origen: string
}

export interface RecomendacionVerificada {
  candidata: {
    titulo: string
    motivo: string
    naturaleza: 'operativa' | 'equipo'
    medida: { tipo: string; elementos: string[]; desde_h?: number; hasta_h?: number }
  }
  runId?: string | null
  ahorro: Ahorro | null
  impacto_en_servicio?: {
    habitantes_afectados_atribuibles: number
    demanda_no_satisfecha_atribuible_m3: number
  }
  antes?: { energia_kwh: number; coste: number }
  despues?: { energia_kwh: number; coste: number }
  convergio?: boolean
  error?: string
}

export interface AnalisisResumido {
  energia_total_kwh: number
  coste_total: number
  moneda: string
  bombas: Array<{ nombre: string; energia_kwh: number; coste: number }>
}

const miles = (entera: string) => entera.replace(/\B(?=(\d{3})+(?!\d))/g, '.')

/** Mismo formato manual que la narración de escenarios, y por el mismo motivo. */
const numero = (n: number, decimales = 1) => {
  const [entera, decimal = ''] = Math.abs(n).toFixed(decimales).split('.')
  const signo = n < 0 ? '−' : ''
  return decimales > 0 ? `${signo}${miles(entera)},${decimal}` : `${signo}${miles(entera)}`
}

export function narrarEnergia(
  analisis: AnalisisResumido,
  recomendaciones: RecomendacionVerificada[],
  motivoSinRecomendaciones?: string | null,
): string {
  const l: string[] = []
  const m = analisis.moneda

  l.push(`**Consumo de bombeo**: ${numero(analisis.energia_total_kwh)} kWh y ${numero(analisis.coste_total, 2)} ${m} en 24 h.`)
  if (analisis.bombas.length > 1) {
    const peor = [...analisis.bombas].sort((a, b) => b.energia_kwh - a.energia_kwh)[0]
    l.push(`La que más gasta es la bomba ${peor.nombre}: ${numero(peor.energia_kwh)} kWh y ${numero(peor.coste, 2)} ${m}.`)
  }

  if (recomendaciones.length === 0) {
    l.push('')
    l.push(motivoSinRecomendaciones ?? 'No he encontrado medidas que merezca la pena verificar.')
    return l.join('\n')
  }

  const ahorran = recomendaciones.filter(r => (r.ahorro?.energia_kwh ?? 0) > 0.05)
  const resto = recomendaciones.filter(r => !ahorran.includes(r))

  l.push('')
  // La concordancia se resuelve aquí y no en la plantilla: «1 medida
  // simulándolas» se leyó así en la aplicación y canta.
  const cuantas = recomendaciones.length === 1
    ? 'He probado una medida, simulándola sobre tu red'
    : `He probado ${recomendaciones.length} medidas, simulándolas sobre tu red`
  l.push(ahorran.length > 0
    ? `${cuantas}. ${ahorran.length === 1 ? 'Una ahorra' : `${ahorran.length} ahorran`}:`
    : `${cuantas}, y ninguna ahorra:`)

  for (const r of [...ahorran, ...resto]) {
    l.push('')
    l.push(`**${r.candidata.titulo}**${r.candidata.naturaleza === 'equipo' ? ' _(requiere cambiar equipo)_' : ''}`)

    if (!r.ahorro) {
      l.push(`No se pudo verificar: ${r.error ?? 'la simulación falló'}.`)
      continue
    }

    const kwh = r.ahorro.energia_kwh
    if (Math.abs(kwh) < 0.05) {
      l.push('Simulada, **no cambia el consumo**: la red la absorbe.')
    } else if (kwh < 0) {
      l.push(`Simulada, **consume ${numero(-kwh)} kWh más** (${numero(-r.ahorro.coste, 2)} ${m}): no la recomiendo.`)
    } else {
      l.push(`Ahorra **${numero(kwh)} kWh** y **${numero(r.ahorro.coste, 2)} ${m}** al día, un ${numero(Math.abs(r.ahorro.porcentaje_energia))}% del consumo.`)
    }

    l.push(r.candidata.motivo)

    if (r.impacto_en_servicio) {
      const hab = r.impacto_en_servicio.habitantes_afectados_atribuibles
      l.push(hab > 0
        ? `Coste en servicio: deja sin agua a ${numero(hab, 0)} habitantes y ${numero(r.impacto_en_servicio.demanda_no_satisfecha_atribuible_m3)} m³ sin servir.`
        : 'No deja a nadie sin agua.')
    }

    // La cita de origen, que es criterio de aceptación del issue.
    l.push(r.runId
      ? `_Verificado en la simulación \`${r.runId}\`, en el historial del proyecto._`
      : '_Verificado por simulación, pero no se pudo registrar en el historial._')

    if (r.convergio === false) {
      l.push('⚠️ Alguna simulación no convergió: esa cifra no es fiable.')
    }
  }

  return l.join('\n')
}
